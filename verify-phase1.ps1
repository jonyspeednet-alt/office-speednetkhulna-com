# Verify Phase 1 Migration

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
    Write-Host "Checking Phase 1 columns..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c `"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'channel_user_payments' AND column_name IN ('service_period', 'billing_status', 'realized_amount', 'deferred_amount', 'bill_issued_date', 'original_issued_date') ORDER BY column_name;`""
    
    Write-Host ""
    Write-Host "Checking new tables..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c `"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('channel_partner_advances', 'billing_reconciliation_logs', 'reseller_financial_audit_log_immutable', 'channel_adjustment_audit', 'channel_settlement_state_machine') ORDER BY table_name;`""
    
    Write-Host ""
    Write-Host "Checking data in channel_user_payments..." -ForegroundColor Cyan
    & $plinkPath -ssh -P $SSH_PORT -pw $SSH_PASS "$SSH_USER@$SSH_HOST" "PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c `"SELECT COUNT(*) as total_records, COUNT(service_period) as with_service_period, COUNT(billing_status) as with_billing_status FROM channel_user_payments;`""
}

Write-Host ""
Write-Host "========================================================================"
Write-Host " Verification Complete!"
Write-Host "========================================================================"
Write-Host ""
