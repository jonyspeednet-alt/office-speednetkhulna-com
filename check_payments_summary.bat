@echo off
set SSH_PASS=Speednet@2015#
set SSH_CMD="PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c \"SELECT reseller_id, month, SUM(amount_due) as total_due, SUM(amount_paid) as total_paid, SUM(realized_amount) as total_realized, SUM(deferred_amount) as total_deferred, COUNT(*) as count FROM channel_user_payments GROUP BY reseller_id, month ORDER BY month DESC LIMIT 10;\""
"C:\Program Files\PuTTY\plink.exe" -ssh -P 21098 -pw %SSH_PASS% speeuvmq@199.188.200.186 %SSH_CMD%
