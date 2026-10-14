param([string]$Estado, [switch]$Proteger, [string]$Archivo)
$ErrorActionPreference = 'Stop'

# Modo privado del worker: el contenido solo viaja por una tubería anónima.
# La copia de recuperación se cifra con DPAPI y no se imprime ni se registra.
if ($Proteger) {
    try {
        Add-Type -AssemblyName System.Security
        $rotationPayload = [Console]::In.ReadToEnd()
        $rotationBytes = [Text.Encoding]::UTF8.GetBytes($rotationPayload)
        $rotationProtected = [Security.Cryptography.ProtectedData]::Protect($rotationBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes($Archivo, $rotationProtected)
        [Array]::Clear($rotationBytes, 0, $rotationBytes.Length)
        $rotationPayload = $null
        [Console]::Write('CONFIGURADO')
        exit 0
    } catch { [Console]::Write('ERROR'); exit 1 }
}

function Save-RotationStatus($data) {
    [IO.File]::WriteAllText($Estado, ($data | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
}

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    Save-RotationStatus @{ fase = 'ENTRADA'; SESSION_SECRET = 'PENDIENTE'; SUPERADMIN_PASSWORD = 'PENDIENTE'; GMAIL_TOKEN_ENCRYPTION_KEY = 'PENDIENTE' }
    $rotationForm = New-Object Windows.Forms.Form
    $rotationForm.Text = 'Marketing Automation - nueva contraseña del superadministrador'
    $rotationForm.Size = New-Object Drawing.Size(620, 345)
    $rotationForm.StartPosition = 'CenterScreen'
    $rotationForm.FormBorderStyle = 'FixedDialog'
    $rotationForm.MaximizeBox = $false
    $rotationForm.MinimizeBox = $false
    $rotationForm.TopMost = $true
    $rotationLabel = New-Object Windows.Forms.Label
    $rotationLabel.Text = 'Introduce una contraseña que conozcas o guardes en tu gestor privado. No la envíes al chat. Entre 16 y 72 caracteres; máximo 72 bytes UTF-8. Evita comillas, acento grave y barra invertida.'
    $rotationLabel.Location = New-Object Drawing.Point(20, 15)
    $rotationLabel.Size = New-Object Drawing.Size(565, 62)
    $rotationForm.Controls.Add($rotationLabel)
    $rotationFirstLabel = New-Object Windows.Forms.Label
    $rotationFirstLabel.Text = 'Contraseña nueva'
    $rotationFirstLabel.Location = New-Object Drawing.Point(20, 82)
    $rotationFirstLabel.Size = New-Object Drawing.Size(550, 20)
    $rotationForm.Controls.Add($rotationFirstLabel)
    $rotationPassword = New-Object Windows.Forms.TextBox
    $rotationPassword.UseSystemPasswordChar = $true
    $rotationPassword.MaxLength = 72
    $rotationPassword.Location = New-Object Drawing.Point(20, 107)
    $rotationPassword.Size = New-Object Drawing.Size(560, 25)
    $rotationForm.Controls.Add($rotationPassword)
    $rotationSecondLabel = New-Object Windows.Forms.Label
    $rotationSecondLabel.Text = 'Confirma la contraseña'
    $rotationSecondLabel.Location = New-Object Drawing.Point(20, 145)
    $rotationSecondLabel.Size = New-Object Drawing.Size(550, 20)
    $rotationForm.Controls.Add($rotationSecondLabel)
    $rotationConfirmation = New-Object Windows.Forms.TextBox
    $rotationConfirmation.UseSystemPasswordChar = $true
    $rotationConfirmation.MaxLength = 72
    $rotationConfirmation.Location = New-Object Drawing.Point(20, 169)
    $rotationConfirmation.Size = New-Object Drawing.Size(560, 25)
    $rotationForm.Controls.Add($rotationConfirmation)
    $rotationMessage = New-Object Windows.Forms.Label
    $rotationMessage.Location = New-Object Drawing.Point(20, 205)
    $rotationMessage.Size = New-Object Drawing.Size(560, 30)
    $rotationForm.Controls.Add($rotationMessage)
    $rotationApply = New-Object Windows.Forms.Button
    $rotationApply.Text = 'Aplicar rotación autorizada'
    $rotationApply.Location = New-Object Drawing.Point(250, 250)
    $rotationApply.Size = New-Object Drawing.Size(205, 30)
    $rotationCancel = New-Object Windows.Forms.Button
    $rotationCancel.Text = 'Cancelar'
    $rotationCancel.Location = New-Object Drawing.Point(470, 250)
    $rotationCancel.Size = New-Object Drawing.Size(110, 30)
    $rotationForm.Controls.Add($rotationApply)
    $rotationForm.Controls.Add($rotationCancel)
    $rotationForm.AcceptButton = $rotationApply
    $rotationForm.CancelButton = $rotationCancel
    $rotationCompleted = $false
    $rotationCancel.Add_Click({ $rotationForm.Close() })
    $rotationApply.Add_Click({
        if ($rotationPassword.Text.Length -lt 16 -or $rotationPassword.Text.Trim().Length -eq 0 -or [Text.Encoding]::UTF8.GetByteCount($rotationPassword.Text) -gt 72 -or $rotationPassword.Text -match '[\x22\x27\x60\\\r\n]') {
            $rotationMessage.Text = 'Contraseña no válida: revisa longitud y caracteres permitidos.'
            return
        }
        if (-not [string]::Equals($rotationPassword.Text, $rotationConfirmation.Text, [StringComparison]::Ordinal)) {
            $rotationMessage.Text = 'Las contraseñas no coinciden.'
            return
        }
        $rotationApply.Enabled = $false
        $rotationCancel.Enabled = $false
        $rotationMessage.Text = 'Comprobando y aplicando. No cierres esta ventana.'
        [Windows.Forms.Application]::DoEvents()
        try {
            Save-RotationStatus @{ fase = 'APLICANDO'; SESSION_SECRET = 'PENDIENTE'; SUPERADMIN_PASSWORD = 'PENDIENTE'; GMAIL_TOKEN_ENCRYPTION_KEY = 'PENDIENTE' }
            $rotationStart = New-Object Diagnostics.ProcessStartInfo
            $rotationStart.FileName = (Get-Command node.exe).Source
            $rotationRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
            $rotationStart.WorkingDirectory = $rotationRoot
            $rotationStart.Arguments = '"' + (Join-Path $PSScriptRoot 'rotarCredencialesLocales.js') + '" --aplicar --confirmar=ROTAR_CREDENCIALES_LOCALES'
            $rotationStart.UseShellExecute = $false
            $rotationStart.CreateNoWindow = $true
            $rotationStart.RedirectStandardInput = $true
            $rotationStart.RedirectStandardOutput = $true
            $rotationStart.RedirectStandardError = $true
            $rotationProcess = [Diagnostics.Process]::Start($rotationStart)
            $rotationInput = @{ password = $rotationPassword.Text } | ConvertTo-Json -Compress
            $rotationInputBytes = [Text.Encoding]::UTF8.GetBytes(($rotationInput + [Environment]::NewLine))
            $rotationProcess.StandardInput.BaseStream.Write($rotationInputBytes, 0, $rotationInputBytes.Length)
            $rotationProcess.StandardInput.BaseStream.Flush()
            $rotationProcess.StandardInput.Close()
            [Array]::Clear($rotationInputBytes, 0, $rotationInputBytes.Length)
            $rotationInput = $null
            $rotationPassword.Clear()
            $rotationConfirmation.Clear()
            $rotationResultText = $rotationProcess.StandardOutput.ReadToEnd()
            $rotationProcess.StandardError.ReadToEnd() | Out-Null
            $rotationProcess.WaitForExit()
            $rotationResult = $rotationResultText | ConvertFrom-Json
            Save-RotationStatus $rotationResult
            $script:rotationCompleted = $true
            $rotationProcess.Dispose()
            $rotationForm.Close()
        } catch {
            Save-RotationStatus @{ fase = 'ERROR'; SESSION_SECRET = 'ERROR'; SUPERADMIN_PASSWORD = 'ERROR'; GMAIL_TOKEN_ENCRYPTION_KEY = 'ERROR'; recuperacion = 'REVISION_MANUAL' }
            $script:rotationCompleted = $true
            $rotationForm.Close()
        }
    })
    $rotationForm.Add_Shown({ $rotationPassword.Focus() })
    [void]$rotationForm.ShowDialog()
    if (-not $rotationCompleted) {
        Save-RotationStatus @{ fase = 'CANCELADO'; SESSION_SECRET = 'PENDIENTE'; SUPERADMIN_PASSWORD = 'PENDIENTE'; GMAIL_TOKEN_ENCRYPTION_KEY = 'PENDIENTE' }
    }
    $rotationPassword.Clear()
    $rotationConfirmation.Clear()
    $rotationForm.Dispose()
} catch {
    if ($Estado) { Save-RotationStatus @{ fase = 'ERROR'; SESSION_SECRET = 'ERROR'; SUPERADMIN_PASSWORD = 'ERROR'; GMAIL_TOKEN_ENCRYPTION_KEY = 'ERROR'; recuperacion = 'SIN_CAMBIOS' } }
}
