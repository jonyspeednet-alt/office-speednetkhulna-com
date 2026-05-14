# Restart PM2 Processes

$SSH_HOST = "199.188.200.186"
$SSH_PORT = "21098"
$SSH_USER = "speeuvmq"
$SSH_PASS = "Speednet@2015#"
$APP_ROOT = "/home/speeuvmq/office_app"

Write-Host ""
Write-Host "========================================================================"
Write-Host " Restarting PM2 Processes"
Write-Host "========================================================================"
Write-Host ""

$plinkPath = "C:\Program Files\PuTTY\plink.exe"

if (Test-Path $plinkPath) {
    Write-Host "Step 1: Checking current PM2 status..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "cd $APP_ROOT && pm2 status"
    
    Write-Host ""
    Write-Host "Step 2: Reloading PM2 processes..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "cd $APP_ROOT && pm2 reload ecosystem.config.js --update-env"
    
    Write-Host ""
    Write-Host "Step 3: Verifying processes are running..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "cd $APP_ROOT && pm2 status"
    
    Write-Host ""
    Write-Host "Step 4: Checking API health..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "curl -sS http://127.0.0.1:5000/api/health/ready"
    
    Write-Host ""
    Write-Host ""
    Write-Host "========================================================================"
    Write-Host " PM2 Restart Complete!" -ForegroundColor Green
    Write-Host "========================================================================"
    Write-Host ""
}
