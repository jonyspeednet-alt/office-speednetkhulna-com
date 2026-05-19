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
$plink = Join-Path $root 'ops/plink.exe'
if (-not (Test-Path $plink)) { $plink = 'C:\Program Files\PuTTY\plink.exe' }
function Invoke-Remote([string]$cmd) {
  $output = & $plink -batch -ssh -P $Port -pw $Password $Server $cmd 2>&1
  $text = ($output | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    if ($text) { throw $text }
    throw 'Remote command failed'
  }
  return $text
}
Write-Host '[DomainCheck] Domain health headers/body:'
Write-Host (Invoke-Remote "curl -k -i -s -m 20 https://office.speednetkhulna.com/api/health | sed -n '1,80p'")
Write-Host '[DomainCheck] Backend direct health:'
Write-Host (Invoke-Remote "curl -sS -m 15 http://127.0.0.1:5000/api/health | sed -n '1,80p'")
Write-Host '[DomainCheck] htaccess:'
Write-Host (Invoke-Remote "cat /home/speeuvmq/office.speednetkhulna.com/.htaccess")
Write-Host '[DomainCheck] proxy syntax:'
Write-Host (Invoke-Remote "php -l /home/speeuvmq/office.speednetkhulna.com/proxy.php 2>&1 || true")
Write-Host '[DomainCheck] proxy file exists:'
Write-Host (Invoke-Remote "ls -l /home/speeuvmq/office.speednetkhulna.com/proxy.php /home/speeuvmq/office.speednetkhulna.com/.htaccess")
