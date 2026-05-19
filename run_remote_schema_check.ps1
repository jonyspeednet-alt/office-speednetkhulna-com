$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$deployScript = Join-Path $root 'ops/deploy_all_full.ps1'
$content = Get-Content -Raw $deployScript
function Get-DefaultParam([string]$name) {
  $pattern = "\[string\]\`$$name\s*=\s*'([^']+)'"
  $m = [regex]::Match($content, $pattern)
  if (-not $m.Success) { throw "Unable to read parameter: $name" }
  return $m.Groups[1].Value
}
function Get-DefaultIntParam([string]$name) {
  $pattern = "\[int\]\`$$name\s*=\s*([0-9]+)"
  $m = [regex]::Match($content, $pattern)
  if (-not $m.Success) { throw "Unable to read parameter: $name" }
  return [int]$m.Groups[1].Value
}
$Server = Get-DefaultParam 'Server'
$Port = Get-DefaultIntParam 'Port'
$Password = Get-DefaultParam 'Password'
$RemoteRoot = Get-DefaultParam 'RemoteRoot'
$plink = Join-Path $root 'ops/plink.exe'
$pscp = Join-Path $root 'ops/pscp.exe'
if (-not (Test-Path $plink)) { $plink = 'C:\Program Files\PuTTY\plink.exe' }
if (-not (Test-Path $pscp)) { $pscp = 'C:\Program Files\PuTTY\pscp.exe' }
$localRunner = Join-Path $root 'run_remote_schema_check.js'
$remoteRunner = '/tmp/run_remote_schema_check.js'
& $pscp -batch -P $Port -pw $Password $localRunner "${Server}:$remoteRunner" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload schema check runner' }
$output = & $plink -batch -ssh -P $Port -pw $Password $Server "cp $remoteRunner $RemoteRoot/server/run_remote_schema_check.js && cd $RemoteRoot/server && node run_remote_schema_check.js && rm -f run_remote_schema_check.js $remoteRunner" 2>&1
$text = ($output | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw $text }
Write-Host $text
