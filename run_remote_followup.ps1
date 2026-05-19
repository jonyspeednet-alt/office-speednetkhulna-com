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
function Invoke-Remote([string]$cmd) {
  $output = & $plink -batch -ssh -P $Port -pw $Password $Server $cmd 2>&1
  $text = ($output | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    if ($text) { throw $text }
    throw "Remote command failed"
  }
  return $text
}
Write-Host '[FollowUp 1/4] Applying DB migration...'
$localMigration = Join-Path $root 'server/migrations/20260514_channel_partner_profile_settings_fix.sql'
$localRunner = Join-Path $root 'run_remote_followup_migration.js'
$remoteMigration = '/tmp/20260514_channel_partner_profile_settings_fix.sql'
$remoteRunner = '/tmp/run_remote_followup_migration.js'
& $pscp -batch -P $Port -pw $Password $localMigration "${Server}:$remoteMigration" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload migration SQL' }
& $pscp -batch -P $Port -pw $Password $localRunner "${Server}:$remoteRunner" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload migration runner' }
Invoke-Remote "cp $remoteRunner $RemoteRoot/server/run_remote_followup_migration.js && cd $RemoteRoot/server && node run_remote_followup_migration.js $remoteMigration && rm -f run_remote_followup_migration.js $remoteRunner $remoteMigration"
Write-Host '[FollowUp 2/4] Reloading PM2...'
Invoke-Remote "cd $RemoteRoot && pm2 reload ecosystem.config.js --only office-api-a,office-api-b --update-env && pm2 save >/dev/null 2>&1"
Write-Host '[FollowUp 3/4] Health check...'
$health = Invoke-Remote "curl -sS -m 15 http://127.0.0.1:5000/api/health/ready || true"
Write-Host $health
Write-Host '[FollowUp 4/4] Recent backend logs...'
$logs = Invoke-Remote "pm2 logs office-api-a --lines 20 --nostream 2>/dev/null || true"
Write-Host $logs
