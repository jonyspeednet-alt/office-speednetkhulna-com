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
Write-Host '[Probe] root:'
Write-Host (Invoke-Remote "curl -k -i -s -m 20 https://office.speednetkhulna.com/ | sed -n '1,25p'")
Write-Host '[Probe] direct proxy:'
Write-Host (Invoke-Remote "curl -k -i -s -m 20 'https://office.speednetkhulna.com/proxy.php?path=health' | sed -n '1,60p'")
Write-Host '[Probe] api slash:'
Write-Host (Invoke-Remote "curl -k -i -s -m 20 https://office.speednetkhulna.com/api/health/ | sed -n '1,40p'")
Write-Host '[Probe] possible docroots:'
Write-Host (Invoke-Remote "find /home/speeuvmq -maxdepth 3 -name index.html -path '*office*' -printf '%p %TY-%Tm-%Td %TH:%TM\\n' 2>/dev/null | sort | tail -n 20")
