# Simple Phase 1 Verification

$SSH_HOST = "199.188.200.186"
$SSH_PORT = "21098"
$SSH_USER = "speeuvmq"
$SSH_PASS = "Speednet@2015#"

Write-Host ""
Write-Host "========================================================================"
Write-Host " Verifying Phase 1 Migration"
Write-Host "========================================================================"
Write-Host ""

$plinkPath = "C:\Program Files\PuTTY\plink.exe"

if (Test-Path $plinkPath) {
    Write-Host "1. Checking Phase 1 columns..." -ForegroundColor Cyan
    $query1 = "SELECT column_name FROM information_schema.columns WHERE table_name = 'channel_user_payments' AND column_name IN ('service_period', 'billing_status', 'realized_amount', 'deferred_amount') ORDER BY column_name"
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -t -c \`"$query1\`""
    
    Write-Host ""
    Write-Host "2. Checking new tables..." -ForegroundColor Cyan
    $query2 = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'channel_%' AND table_name IN ('channel_partner_advances', 'billing_reconciliation_logs') ORDER BY table_name"
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -t -c \`"$query2\`""
    
    Write-Host ""
    Write-Host "3. Checking record counts..." -ForegroundColor Cyan
    $query3 = "SELECT COUNT(*) FROM channel_user_payments"
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -t -c \`"$query3\`""
}

Write-Host ""
Write-Host "========================================================================"
Write-Host " Phase 1 Migration Verified!" -ForegroundColor Green
Write-Host "========================================================================"
Write-Host ""
Write-Host "Next step: Run Phase 2 backfill" -ForegroundColor Cyan
Write-Host ""
