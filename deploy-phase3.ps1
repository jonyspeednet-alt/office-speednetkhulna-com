# Deploy Phase 3: Partner Advances Integration

$SSH_HOST = "199.188.200.186"
$SSH_PORT = "21098"
$SSH_USER = "speeuvmq"
$SSH_PASS = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 3 Deployment: Partner Advances Integration"
Write-Host "========================================================================"
Write-Host ""

# Step 1: Upload updated controller
Write-Host "Step 1: Uploading channelPartnerController.js..." -ForegroundColor Cyan
$result = scp -P $SSH_PORT "server\controllers\channelPartnerController.js" "${SSH_USER}@${SSH_HOST}:${APP_ROOT}/server/controllers/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Failed to upload controller" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Controller uploaded" -ForegroundColor Green
Write-Host ""

# Step 2: Upload updated routes
Write-Host "Step 2: Uploading channelPartnerRoutes.js..." -ForegroundColor Cyan
$result = scp -P $SSH_PORT "server\routes\channelPartnerRoutes.js" "${SSH_USER}@${SSH_HOST}:${APP_ROOT}/server/routes/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Failed to upload routes" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Routes uploaded" -ForegroundColor Green
Write-Host ""

# Step 3: Restart PM2
Write-Host "Step 3: Restarting PM2..." -ForegroundColor Cyan
$plinkPath = "C:\Program Files\PuTTY\plink.exe"
if (Test-Path $plinkPath) {
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "cd $APP_ROOT && pm2 reload ecosystem.config.js --update-env"
    Write-Host "[OK] PM2 reloaded" -ForegroundColor Green
} else {
    Write-Host "[FAIL] PuTTY not found" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 4: Health check
Write-Host "Step 4: Checking API health..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
& $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "curl -sS http://127.0.0.1:5000/api/health/ready"
Write-Host ""

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 3 Deployment Complete!" -ForegroundColor Green
Write-Host "========================================================================"
Write-Host ""
Write-Host "New Features:" -ForegroundColor Cyan
Write-Host "  - Partner advances deducted from commission"
Write-Host "  - Commission summary shows partner advances"
Write-Host "  - Settlement statement includes advances"
Write-Host "  - Excel import for partner advances"
Write-Host "  - Advance history endpoint"
Write-Host ""
Write-Host "Next: Test the new features" -ForegroundColor Yellow
Write-Host ""
