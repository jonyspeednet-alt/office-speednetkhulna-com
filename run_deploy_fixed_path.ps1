$ErrorActionPreference = 'Stop'
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot\System32\WindowsPowerShell\v1.0;$env:PATH"
& "$PSScriptRoot\ops\deploy_all_full.ps1" -ForceFrontend -ForceBackend -SkipNpmInstall
exit $LASTEXITCODE
