# Phase 4 Deployment Script
# Deploys reconciliation workflow to production

$ErrorActionPreference = "Stop"

Write-Host "=== Phase 4: Reconciliation Workflow Deployment ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$SERVER = "199.188.200.186"
$PORT = "21098"
$USER = "speeuvmq"
$PASSWORD = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"

Write-Host "Server: ${SERVER}:${PORT}" -ForegroundColor Yellow
Write-Host "App Root: $APP_ROOT" -ForegroundColor Yellow
Write-Host ""

# Step 1: Upload controller
Write-Host "[1/7] Uploading channelPartnerController.js..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\controllers\channelPartnerController.js" "${USER}@${SERVER}:${APP_ROOT}/server/controllers/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload controller" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Controller uploaded" -ForegroundColor Green
Write-Host ""

# Step 2: Upload routes
Write-Host "[2/7] Uploading channelPartnerRoutes.js..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\routes\channelPartnerRoutes.js" "${USER}@${SERVER}:${APP_ROOT}/server/routes/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload routes" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Routes uploaded" -ForegroundColor Green
Write-Host ""

# Step 3: Upload utilities
Write-Host "[3/7] Uploading utilities..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\utilities\reportGenerator.js" "${USER}@${SERVER}:${APP_ROOT}/server/utilities/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload reportGenerator" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Utilities uploaded" -ForegroundColor Green
Write-Host ""

# Step 4: Upload middleware
Write-Host "[4/7] Uploading middleware..." -ForegroundColor Green
plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "mkdir -p ${APP_ROOT}/server/middleware"
pscp -P $PORT -pw $PASSWORD "server\middleware\reconciliationLock.js" "${USER}@${SERVER}:${APP_ROOT}/server/middleware/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload middleware" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Middleware uploaded" -ForegroundColor Green
Write-Host ""

# Step 5: Upload cron
Write-Host "[5/7] Uploading cron job..." -ForegroundColor Green
plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "mkdir -p ${APP_ROOT}/server/cron"
pscp -P $PORT -pw $PASSWORD "server\cron\reconciliationCron.js" "${USER}@${SERVER}:${APP_ROOT}/server/cron/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload cron" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Cron job uploaded" -ForegroundColor Green
Write-Host ""

# Step 6: Upload server/index.js
Write-Host "[6/7] Uploading server/index.js..." -ForegroundColor Green
pscp -P $PORT -pw $PASSWORD "server\index.js" "${USER}@${SERVER}:${APP_ROOT}/server/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to upload server/index.js" -ForegroundColor Red
    exit 1
}
Write-Host "✓ server/index.js uploaded" -ForegroundColor Green
Write-Host ""

# Step 7: Install dependencies and restart
Write-Host "[7/7] Installing dependencies and restarting PM2..." -ForegroundColor Green
plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" @"
cd ${APP_ROOT}/server && \
npm install pdfkit node-cron && \
cd ${APP_ROOT} && \
pm2 reload ecosystem.config.js --update-env
"@

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies or restart PM2" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed and PM2 restarted" -ForegroundColor Green
Write-Host ""

# Wait for server to start
Write-Host "Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verify deployment
Write-Host "Verifying deployment..." -ForegroundColor Yellow
$healthCheck = plink -batch -P $PORT -pw $PASSWORD "${USER}@${SERVER}" "curl -s http://localhost:5000/api/health/ready"

if ($healthCheck -match '"status":"OK"') {
    Write-Host ""
    Write-Host "=== Phase 4 Deployment Complete ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "✓ All files uploaded" -ForegroundColor Green
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
    Write-Host "✓ PM2 restarted" -ForegroundColor Green
    Write-Host "✓ Health check passed" -ForegroundColor Green
    Write-Host ""
    Write-Host "New Features Available:" -ForegroundColor Cyan
    Write-Host "  - Reconciliation initiation" -ForegroundColor White
    Write-Host "  - Reconciliation approval/rejection" -ForegroundColor White
    Write-Host "  - PDF report generation" -ForegroundColor White
    Write-Host "  - Auto-reconciliation cron job (5th of each month)" -ForegroundColor White
    Write-Host "  - Data locking after approval" -ForegroundColor White
    Write-Host ""
    Write-Host "API Endpoints:" -ForegroundColor Cyan
    Write-Host "  POST /api/channel-partners/:resellerId/reconciliation/initiate" -ForegroundColor White
    Write-Host "  GET  /api/channel-partners/:resellerId/reconciliation/list" -ForegroundColor White
    Write-Host "  GET  /api/channel-partners/:resellerId/reconciliation/:id" -ForegroundColor White
    Write-Host "  POST /api/channel-partners/:resellerId/reconciliation/:id/approve" -ForegroundColor White
    Write-Host "  POST /api/channel-partners/:resellerId/reconciliation/:id/reject" -ForegroundColor White
    Write-Host "  GET  /api/channel-partners/:resellerId/reconciliation/:id/report" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "=== Deployment Complete with Warnings ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Files uploaded but health check did not return OK" -ForegroundColor Yellow
    Write-Host "Check PM2 logs for errors:" -ForegroundColor Yellow
    $sshCmd = "ssh -p $PORT ${USER}@${SERVER}"
    Write-Host "  $sshCmd" -ForegroundColor White
    Write-Host '  pm2 logs office-api-a --lines 50' -ForegroundColor White
    Write-Host ""
}
