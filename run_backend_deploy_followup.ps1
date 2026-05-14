$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot\System32\WindowsPowerShell\v1.0;$env:PATH"
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
$tmpDir = Join-Path $root '.deploy_tmp_manual'
$bundlePath = Join-Path $tmpDir 'server_bundle.tgz'
if (Test-Path $tmpDir) { Remove-Item -Path $tmpDir -Recurse -Force }
New-Item -Path $tmpDir -ItemType Directory | Out-Null
Write-Host '[BackendDeploy 1/5] Creating backend archive...'
tar.exe -czf $bundlePath --format=ustar --exclude='server/node_modules' --exclude='server/.env' -C $root ecosystem.config.js -C $root server
if ($LASTEXITCODE -ne 0) { throw 'Failed to create backend archive' }
function Invoke-Remote([string]$cmd) {
  $output = & $plink -batch -ssh -P $Port -pw $Password $Server $cmd 2>&1
  $text = ($output | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    if ($text) { throw $text }
    throw 'Remote command failed'
  }
  return $text
}
Write-Host '[BackendDeploy 2/5] Uploading backend archive...'
Invoke-Remote "mkdir -p $RemoteRoot/.deploy_tmp $RemoteRoot/server"
& $pscp -batch -P $Port -pw $Password $bundlePath "${Server}:$RemoteRoot/.deploy_tmp/server_bundle.tgz" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload backend archive' }
Write-Host '[BackendDeploy 3/5] Extracting backend archive...'
Invoke-Remote "cd $RemoteRoot && tar --warning=no-unknown-keyword -xzf $RemoteRoot/.deploy_tmp/server_bundle.tgz --no-same-owner --no-same-permissions --no-overwrite-dir && rm -f $RemoteRoot/.deploy_tmp/server_bundle.tgz && find $RemoteRoot/server -type d -exec chmod u+rwx {} \; && find $RemoteRoot/server -type f -exec chmod u+rw {} \;"
Write-Host '[BackendDeploy 4/5] Reloading PM2...'
Invoke-Remote "cd $RemoteRoot && pm2 reload ecosystem.config.js --only office-api-a,office-api-b --update-env && pm2 save >/dev/null 2>&1"
Write-Host '[BackendDeploy 5/5] Health check...'
$health = Invoke-Remote "curl -sS -m 15 http://127.0.0.1:5000/api/health/ready || true"
Write-Host $health
