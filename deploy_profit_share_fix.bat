@echo off
echo ========================================
echo  Deploying Profit Share Fix
echo ========================================
echo.

echo Step 1: Building frontend...
cd client
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Frontend build failed
    pause
    exit /b 1
)
cd ..

echo.
echo Step 2: Creating backend bundle...
cd server
tar -czf ../backend-bundle.tar.gz .
if %ERRORLEVEL% neq 0 (
    echo ERROR: Backend bundle creation failed
    pause
    exit /b 1
)
cd ..

echo.
echo Step 3: Uploading to production server...
echo Uploading frontend...
"C:\Program Files\PuTTY\pscp.exe" -r -P 21098 -pw "Speednet@2015#" client\dist\* speeuvmq@199.188.200.186:/home/speeuvmq/office_app/client/dist/

echo Uploading backend...
"C:\Program Files\PuTTY\pscp.exe" -P 21098 -pw "Speednet@2015#" backend-bundle.tar.gz speeuvmq@199.188.200.186:/home/speeuvmq/office_app/

echo.
echo Step 4: Extracting and installing on server...
"C:\Program Files\PuTTY\plink.exe" -ssh -P 21098 -pw "Speednet@2015#" speeuvmq@199.188.200.186 "cd /home/speeuvmq/office_app && tar -xzf backend-bundle.tar.gz && rm backend-bundle.tar.gz && cd server && npm install --production"

echo.
echo Step 5: Restarting application...
"C:\Program Files\PuTTY\plink.exe" -ssh -P 21098 -pw "Speednet@2015#" speeuvmq@199.188.200.186 "cd /home/speeuvmq/office_app && pm2 reload ecosystem.config.js --only office-api-a,office-api-b --update-env"

echo.
echo Step 6: Health check...
timeout /t 5 /nobreak > nul
"C:\Program Files\PuTTY\plink.exe" -ssh -P 21098 -pw "Speednet@2015#" speeuvmq@199.188.200.186 "curl -sS -m 10 http://127.0.0.1:5000/api/health/ready"

echo.
echo Step 7: Testing profit share update...
"C:\Program Files\PuTTY\plink.exe" -ssh -P 21098 -pw "Speednet@2015#" speeuvmq@199.188.200.186 "cd /home/speeuvmq/office_app && echo 'Testing profit share update for reseller 18...' && curl -X PUT -H 'Content-Type: application/json' -H 'Authorization: Bearer YOUR_TOKEN' -d '{\"profit_share_percentage\": 25.5}' http://127.0.0.1:5000/api/resellers/resellers/18 || echo 'Test requires authentication token'"

echo.
echo ========================================
echo  Deployment Complete!
echo ========================================
echo.
echo The profit share fix has been deployed.
echo Please test the update manually at:
echo https://office.speednetkhulna.com/reseller-profile/18
echo.
pause