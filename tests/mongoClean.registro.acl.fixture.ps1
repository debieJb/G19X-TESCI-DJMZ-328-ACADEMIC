param([Parameter(Mandatory=$true)][string]$ValidationBase64)
$ErrorActionPreference='Stop'
$source=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($ValidationBase64))
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'VALIDATOR_SYNTAX_INVALID'}
$definitions=@($ast.EndBlock.Statements|Where-Object{$_ -is [Management.Automation.Language.FunctionDefinitionAst]})
if($definitions.Count -ne 3 -or $definitions[0].Name -cne 'Assert-RecordVolume' -or $definitions[1].Name -cne 'Assert-RecordChain' -or $definitions[2].Name -cne 'Assert-RecordPrivate'){throw 'UNEXPECTED_VALIDATOR_FUNCTIONS'}
# Import just the production pure functions, never native identity/drive adapters.
foreach($definition in $definitions){. ([scriptblock]::Create($definition.Extent.Text))}
$earlyVolume=@($ast.EndBlock.Statements|Where-Object{$_.Extent.Text -ceq 'Assert-RecordVolume $drive'})
$lookups=@($ast.EndBlock.Statements|Where-Object{$_.Extent.Text -match '^\$(d|a)=Get-(Item|Acl)'})
if($earlyVolume.Count -ne 1 -or $lookups.Count -ne 2){throw 'VOLUME_GUARD_BOUNDARY_MISSING'}
foreach($lookup in $lookups){if($earlyVolume[0].Extent.StartOffset -ge $lookup.Extent.StartOffset){throw 'VOLUME_CHECK_MUST_PRECEDE_FILESYSTEM'}}
$chainCheck=@($ast.EndBlock.Statements|Where-Object{$_.Extent.Text -ceq 'Assert-RecordChain $d'})
$aclLookup=@($ast.EndBlock.Statements|Where-Object{$_.Extent.Text -match '^\$a=Get-Acl'})
if($chainCheck.Count -ne 1 -or $aclLookup.Count -ne 1 -or $chainCheck[0].Extent.StartOffset -ge $aclLookup[0].Extent.StartOffset){throw 'CHAIN_CHECK_MUST_PRECEDE_ACL'}
$allowed=@('Assert-RecordVolume','Assert-RecordChain','Assert-RecordPrivate','Get-Item','Get-Acl')
foreach($c in $ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst]},$true)){
 if(!$c.GetCommandName() -or $c.GetCommandName() -notin $allowed){throw 'COMMAND_NOT_READ_ONLY'}
}
$allowedMethods=@('GetOwner','GetAccessRules','GetPathRoot','GetCurrent','new')
foreach($m in $ast.FindAll({param($n)$n -is [Management.Automation.Language.InvokeMemberExpressionAst]},$true)){
 if($m.Member.Value -notin $allowedMethods){throw 'METHOD_NOT_READ_ONLY'}
 if($m.Member.Value -eq 'new' -and $m.Expression.Extent.Text -cne '[IO.DriveInfo]'){throw 'UNEXPECTED_NATIVE_CONSTRUCTION'}
}
# Tripwires: no real ACL, filesystem, CIM or provider lookup from tested code.
function Get-Item {throw 'REAL_FILESYSTEM_FORBIDDEN'}
function Get-Acl {throw 'REAL_ACL_FORBIDDEN'}
function Get-CimInstance {throw 'REAL_CIM_FORBIDDEN'}
$me='S-1-5-21-111-222-333-1001';$system='S-1-5-18';$admins='S-1-5-32-544';$foreign='S-1-5-21-111-222-333-1002'
$script:cases=0
function Rule([string]$Sid,[string]$Type='Allow',[int]$Rights=2032127,[int]$Inheritance=3,[int]$Propagation=0){
 [pscustomobject]@{IdentityReference=[pscustomobject]@{Value=$Sid};AccessControlType=$Type;FileSystemRights=[Security.AccessControl.FileSystemRights]$Rights;InheritanceFlags=[Security.AccessControl.InheritanceFlags]$Inheritance;PropagationFlags=[Security.AccessControl.PropagationFlags]$Propagation}
}
function Case([string]$Label,[bool]$Accepted,[scriptblock]$Change){
 $drive=[pscustomobject]@{DriveType='Fixed';DriveFormat='NTFS'}
 $directory=[pscustomobject]@{PSIsContainer=$true;Attributes=0;Parent=[pscustomobject]@{PSIsContainer=$true;Attributes=0;Parent=$null;UntrustedCanReplace=$false}}
 $acl=[pscustomobject]@{Owner=$me;AreAccessRulesProtected=$true;Rules=@((Rule $me),(Rule $system),(Rule $admins));OwnerError=$false;RulesError=$false;OwnerCalls=0;RulesCalls=0}
 $acl|Add-Member -MemberType ScriptMethod -Name GetOwner -Value {param($type)if($type -ne [Security.Principal.SecurityIdentifier]){throw 'OWNER_TYPE'};$this.OwnerCalls++;if($this.OwnerError){throw 'SYNTHETIC_PRIVATE_OWNER_ERROR'};[pscustomobject]@{Value=$this.Owner}}
 $acl|Add-Member -MemberType ScriptMethod -Name GetAccessRules -Value {param($explicit,$inherited,$type)if(!$explicit -or !$inherited -or $type -ne [Security.Principal.SecurityIdentifier]){throw 'RULE_QUERY_ARGUMENTS'};$this.RulesCalls++;if($this.RulesError){throw 'SYNTHETIC_PRIVATE_RULES_ERROR'};return $this.Rules}
 & $Change
 $actual=$true
 try{Assert-RecordPrivate $drive $directory $acl $me}catch{$actual=$false}
 if($actual -ne $Accepted){throw ('ACL_CASE_FAILED: '+$Label)}
 if($Accepted -and ($acl.OwnerCalls -ne 1 -or $acl.RulesCalls -ne 1)){throw 'ACL_NOT_INSPECTED'}
 $script:cases++
}
Case 'user SYSTEM administrators' $true {}
Case 'user only remains compatible' $true {$acl.Rules=@((Rule $me))}
Case 'ObjectInherit alone matches current contract' $true {$acl.Rules=@((Rule $me 'Allow' 2032127 2),(Rule $system),(Rule $admins))}
Case 'ReFS fixed volume' $true {$drive.DriveFormat='ReFS'}
Case 'wrong owner' $false {$acl.Owner=$foreign}
Case 'SYSTEM owner is not current owner' $false {$acl.Owner=$system}
Case 'active ACL inheritance' $false {$acl.AreAccessRulesProtected=$false}
Case 'public read permission' $false {$acl.Rules+=Rule 'S-1-1-0' 'Allow' 131209}
Case 'no user rule' $false {$acl.Rules=@((Rule $system),(Rule $admins))}
Case 'user only Modify' $false {$acl.Rules=@((Rule $me 'Allow' 197055))}
Case 'user ReadExecute with privileged peers' $false {$acl.Rules=@((Rule $me 'Allow' 131241),(Rule $system),(Rule $admins))}
Case 'no inheritance flags' $false {$acl.Rules=@((Rule $me 'Allow' 2032127 0))}
Case 'ContainerInherit without ObjectInherit' $false {$acl.Rules=@((Rule $me 'Allow' 2032127 1))}
Case 'InheritOnly' $false {$acl.Rules=@((Rule $me 'Allow' 2032127 3 2))}
Case 'NoPropagateInherit' $false {$acl.Rules=@((Rule $me 'Allow' 2032127 3 1))}
Case 'deny current user write' $false {$acl.Rules+=Rule $me 'Deny' 2}
Case 'deny enabled or unknown group' $false {$acl.Rules+=Rule 'S-1-5-11' 'Deny' 2}
Case 'deny SYSTEM' $false {$acl.Rules+=Rule $system 'Deny' 2}
Case 'deny inherit only' $false {$acl.Rules+=Rule $me 'Deny' 2 3 2}
Case 'deny unrelated SID conservatively rejected' $false {$acl.Rules+=Rule $foreign 'Deny' 2}
Case 'owner query exception' $false {$acl.OwnerError=$true}
Case 'rule query exception' $false {$acl.RulesError=$true}
Case 'drive property query exception' $false {$drive|Add-Member -MemberType ScriptProperty -Name DriveType -Force -Value {throw 'SYNTHETIC_PRIVATE_DRIVE_ERROR'}}
Case 'empty ACL rules' $false {$acl.Rules=@()}
Case 'unsupported FAT32' $false {$drive.DriveFormat='FAT32'}
Case 'unsupported exFAT' $false {$drive.DriveFormat='exFAT'}
Case 'unsupported remote drive' $false {$drive.DriveType='Network'}
Case 'unsupported removable drive' $false {$drive.DriveType='Removable'}
Case 'not a directory' $false {$directory.PSIsContainer=$false}
Case 'root reparse point' $false {$directory.Attributes=1024}
Case 'ancestor reparse point' $false {$directory.Parent.Attributes=1024}
# Expected limitation, not a claim of security: parent ACLs are not inspected.
Case 'LIMIT parent replacement ACL remains external responsibility' $true {$directory.Parent.UntrustedCanReplace=$true}
Write-Output "ACL_SYNTHETIC_CASES_PASSED=$script:cases; AST_READ_ONLY_OK; PARENT_ACL_LIMIT_CONFIRMED"
