@echo off
setlocal
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

echo [ProdMode] Starting backend with APP_ENV=production...
start "office-backend-prodmode" cmd /k "cd /d %ROOT%\server && set APP_ENV=production && npm run dev"

echo [ProdMode] Starting frontend in production preview...
start "office-frontend-preview" cmd /k "cd /d %ROOT%\client && npm run build && npm run preview -- --host 127.0.0.1 --port 4173"

echo [ProdMode] Backend:  http://localhost:5000
echo [ProdMode] Frontend: http://127.0.0.1:4173
exit /b 0
