# Phase 2 Data Backfill via SSH

$SSH_HOST = "199.188.200.186"
$SSH_PORT = "21098"
$SSH_USER = "speeuvmq"
$SSH_PASS = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 2 Data Backfill - Remote Execution"
Write-Host "========================================================================"
Write-Host ""

$plinkPath = "C:\Program Files\PuTTY\plink.exe"

if (Test-Path $plinkPath) {
    Write-Host "Running Phase 2 backfill on remote server..." -ForegroundColor Cyan
    Write-Host ""
    
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "cd $APP_ROOT && node server/scripts/phase2-backfill-data.js --confirm"
    
    Write-Host ""
    Write-Host "========================================================================"
    Write-Host " Phase 2 Backfill Complete!" -ForegroundColor Green
    Write-Host "========================================================================"
    Write-Host ""
} else {
    Write-Host "PuTTY not found. Please install PuTTY or use SSH manually." -ForegroundColor Red
}
