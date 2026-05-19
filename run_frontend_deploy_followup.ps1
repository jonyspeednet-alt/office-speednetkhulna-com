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
$distDir = Join-Path $root 'client/dist'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$remoteTmp = "$RemoteRoot/.deploy_tmp"
$remoteStage = "$remoteTmp/frontend_manual_$stamp"
$domainRoot = '/home/speeuvmq/office.speednetkhulna.com'
function Invoke-Remote([string]$cmd) {
  $output = & $plink -batch -ssh -P $Port -pw $Password $Server $cmd 2>&1
  $text = ($output | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    if ($text) { throw $text }
    throw 'Remote command failed'
  }
  return $text
}
Write-Host '[FrontendDeploy 1/4] Preparing remote stage...'
Invoke-Remote "rm -rf $remoteStage && mkdir -p $remoteStage/assets $domainRoot $RemoteRoot/client/dist"
Write-Host '[FrontendDeploy 2/4] Uploading dist...'
& $pscp -batch -P $Port -pw $Password (Join-Path $distDir 'index.html') "${Server}:$remoteStage/index.html" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload index.html' }
& $pscp -batch -r -P $Port -pw $Password (Join-Path $distDir 'assets/*') "${Server}:$remoteStage/assets/" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to upload assets' }
$rootFiles = Get-ChildItem -Path $distDir -File | Where-Object { $_.Name -ne 'index.html' }
foreach ($file in $rootFiles) {
  & $pscp -batch -P $Port -pw $Password $file.FullName "${Server}:$remoteStage/$($file.Name)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to upload $($file.Name)" }
}
Write-Host '[FrontendDeploy 3/4] Swapping frontend...'
Invoke-Remote "rm -rf $RemoteRoot/client/dist/* && cp -a $remoteStage/. $RemoteRoot/client/dist/ && rm -rf $remoteStage && rm -rf $domainRoot/assets && cp -a $RemoteRoot/client/dist/. $domainRoot/ && chmod 644 $domainRoot/index.html && find $domainRoot/assets -type f -exec chmod 644 {} \; && find $domainRoot/assets -type d -exec chmod 755 {} \;"
Write-Host '[FrontendDeploy 4/4] Done.'
