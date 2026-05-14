# Deploy Profit Share Fix using existing deployment infrastructure

Write-Host "========================================" -ForegroundColor Green
Write-Host " Deploying Profit Share Fix" -ForegroundColor Green  
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Use the existing deployment script
Write-Host "Running full deployment..." -ForegroundColor Yellow
& ".\ops\deploy_all_full.bat"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " Fix Deployed Successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "The profit share update issue has been fixed." -ForegroundColor Cyan
Write-Host ""
Write-Host "Please test the fix by:" -ForegroundColor Yellow
Write-Host "1. Going to: https://office.speednetkhulna.com/reseller-profile/18" -ForegroundColor White
Write-Host "2. Clicking 'প্রোফাইল এডিট করুন'" -ForegroundColor White  
Write-Host "3. Updating the 'Profit Share (%)' field" -ForegroundColor White
Write-Host "4. Clicking 'আপডেট করুন'" -ForegroundColor White
Write-Host ""
Write-Host "The update should now work without the 'Failed to update reseller' error." -ForegroundColor Green
Write-Host ""

Read-Host "Press Enter to continue"