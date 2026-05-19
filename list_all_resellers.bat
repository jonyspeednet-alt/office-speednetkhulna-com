@echo off
set SSH_PASS=Speednet@2015#
set SSH_CMD="PGPASSWORD='speednet_office' psql -h localhost -p 5432 -U speeuvmq_speeuvmq -d speeuvmq_speednet_office -c \"SELECT id, reseller_name, company_name FROM resellers LIMIT 50;\""
"C:\Program Files\PuTTY\plink.exe" -ssh -P 21098 -pw %SSH_PASS% speeuvmq@199.188.200.186 %SSH_CMD%
