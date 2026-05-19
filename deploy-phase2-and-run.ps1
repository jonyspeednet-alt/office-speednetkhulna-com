# Deploy Phase 2 Scripts and Run Backfill

$SSH_HOST = "199.188.200.186"
$SSH_PORT = "21098"
$SSH_USER = "speeuvmq"
$SSH_PASS = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 2 Deployment and Backfill"
Write-Host "========================================================================"
Write-Host ""

# Step 1: Upload phase2-backfill-data.js
Write-Host "Step 1: Uploading Phase 2 backfill script..." -ForegroundColor Cyan
$scpResult = scp -P $SSH_PORT "server\scripts\phase2-backfill-data.js" "${SSH_USER}@${SSH_HOST}:${APP_ROOT}/server/scripts/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload backfill script" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Backfill script uploaded" -ForegroundColor Green
Write-Host ""

# Step 2: Upload updated controller
Write-Host "Step 2: Uploading updated channelPartnerController.js..." -ForegroundColor Cyan
$scpResult = scp -P $SSH_PORT "server\controllers\channelPartnerController.js" "${SSH_USER}@${SSH_HOST}:${APP_ROOT}/server/controllers/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload controller" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Controller uploaded" -ForegroundColor Green
Write-Host ""

# Step 3: Run backfill
Write-Host "Step 3: Running Phase 2 backfill..." -ForegroundColor Cyan
Write-Host ""

$plinkPath = "C:\Program Files\PuTTY\plink.exe"
if (Test-Path $plinkPath) {
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "cd $APP_ROOT && node server/scripts/phase2-backfill-data.js --confirm"
} else {
    Write-Host "PuTTY not found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 2 Complete!" -ForegroundColor Green
Write-Host "========================================================================"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart PM2 processes: pm2 reload ecosystem.config.js"
Write-Host "  2. Test the new billing flow"
Write-Host "  3. Proceed to Phase 3"
Write-Host ""
