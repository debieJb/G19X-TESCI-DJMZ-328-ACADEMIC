param([switch]$AlmacenGemini)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\rutasLocales.ps1')
$root = if ($AlmacenGemini) { (Get-PluriOnePath 'geminiRoot') } else { (Get-PluriOnePath 'quotaRoot') }
$port = if ($AlmacenGemini) { 27020 } else { 27019 }
$pidFile = Join-Path $root 'mongod.pid'
$pidExpected = [int][IO.File]::ReadAllText($pidFile)
$proc = Get-Process -Id $pidExpected -ErrorAction Stop
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -First 1
$procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $pidExpected" -ErrorAction Stop
$expectedData = Join-Path $root 'data'
if (($proc.ProcessName -ne 'mongod') -or ($proc.Path -ne (Get-PluriOnePath 'mongod')) -or
    (!$procInfo.CommandLine.Contains('--auth')) -or (!$procInfo.CommandLine.Contains("--port $port")) -or
    (!$procInfo.CommandLine.Contains('127.0.0.1')) -or (!$procInfo.CommandLine.Contains($expectedData)) -or
    ($listener.OwningProcess -ne $pidExpected) -or ($listener.LocalAddress -ne '127.0.0.1')) { throw 'Identidad distinta; se detiene.' }
$tools = Join-Path $env:LOCALAPPDATA 'PluriOne\MongoDBDatabaseTools\100.19.1'
$dump = Get-ChildItem -LiteralPath $tools -Filter mongodump.exe -Recurse -File | Select-Object -First 1
$restore = Get-ChildItem -LiteralPath $tools -Filter mongorestore.exe -Recurse -File | Select-Object -First 1
if (!$dump -or !$restore) { throw 'No se encuentran Database Tools verificadas.' }
$id = [Guid]::NewGuid().ToString('N')
$restoreCollection = "usoias_restore_$id"
$archive = Join-Path $root "backup-test-$id.archive"
$archiveExists = Test-Path -LiteralPath $archive
if ($archiveExists) { throw 'El archivo temporal ya existe; no se sobrescribe.' }
if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'El destino de respaldo está redirigido.' }

$mongosh = Get-PluriOnePath 'mongosh'
$fixtureId = '64b000000000000000000002'
$fixtureCompany = '64b000000000000000000001'
$destinationCheck = "const q=db.getSiblingDB('plurione_ai_quota'); const src=q.usoias; const doc=src.findOne({_id:ObjectId('$fixtureId'),empresa:ObjectId('$fixtureCompany'),ventana:'prueba:1',_pruebaInfraestructura:true}); if(src.countDocuments({})!==1 || !doc || doc.expiraEn <= new Date()) quit(2); if(q.getCollectionInfos({name:'$restoreCollection'}).length!==0) quit(3); print('DESTINO_TEMPORAL_LIBRE_Y_FIXTURE_UNICO');"
& $mongosh --host 127.0.0.1 --port $port --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --quiet --eval $destinationCheck
if ($LASTEXITCODE -ne 0) { throw 'Origen no ficticio/único, TTL vencido o destino temporal existente; no se escribe.' }

# Solo incluye el fixture conocido, recién creado en el almacén vacío.
& $dump.FullName --host 127.0.0.1 --port $port --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --db plurione_ai_quota --archive=$archive --collection usoias
if ($LASTEXITCODE -ne 0) { throw 'mongodump falló; el respaldo temporal se conserva para inspección.' }
& $restore.FullName --host 127.0.0.1 --port $port --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --archive=$archive --nsFrom='plurione_ai_quota.usoias' --nsTo="plurione_ai_quota.$restoreCollection"
if ($LASTEXITCODE -ne 0) { throw 'mongorestore falló; no se elimina ningún artefacto automáticamente.' }

$verify = "const d=db.getSiblingDB('plurione_ai_quota').getCollection('$restoreCollection'); const ix=d.getIndexes(); const u=ix.find(i=>i.name==='empresa_1_ventana_1'); const ttl=ix.find(i=>i.name==='expiraEn_1'); if(d.countDocuments({_id:ObjectId('$fixtureId'),empresa:ObjectId('$fixtureCompany'),_pruebaInfraestructura:true})!==1 || d.countDocuments({})!==1 || ix.length!==3 || !u?.unique || !ttl || ttl.expireAfterSeconds!==0) quit(2); print('RESTAURACION_FICTICIA_VERIFICADA');"
& $mongosh --host 127.0.0.1 --port $port --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --quiet --eval $verify
if ($LASTEXITCODE -ne 0) { throw 'El contenido o los índices restaurados no coinciden.' }

$cleanup = "const d=db.getSiblingDB('plurione_ai_quota'); const c=d.getCollection('$restoreCollection'); const src=d.usoias; if(c.countDocuments({_id:ObjectId('$fixtureId'),empresa:ObjectId('$fixtureCompany'),_pruebaInfraestructura:true})!==1 || c.countDocuments({})!==1 || src.countDocuments({_id:ObjectId('$fixtureId'),empresa:ObjectId('$fixtureCompany'),ventana:'prueba:1',_pruebaInfraestructura:true})!==1 || src.countDocuments({})!==1) quit(3); if(!c.drop()) quit(4); const r=src.deleteOne({_id:ObjectId('$fixtureId'),empresa:ObjectId('$fixtureCompany'),ventana:'prueba:1',_pruebaInfraestructura:true}); if(r.deletedCount!==1 || src.countDocuments({})!==0) quit(5); print('DATOS_FICTICIOS_LIMPIOS');"
& $mongosh --host 127.0.0.1 --port $port --username plurione_ia_quota_maintenance --authenticationDatabase plurione_ai_quota --quiet --eval $cleanup
if ($LASTEXITCODE -ne 0) { throw 'La limpieza condicional no confirmó exactamente los fixtures; se detiene.' }
Remove-Item -LiteralPath $archive -Force
Write-Output 'BACKUP_RESTORE_FICTICIO_OK; destino temporal eliminado; colección usoias sin fixtures'
