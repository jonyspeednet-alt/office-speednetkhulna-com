# SpeedNet Office - Troubleshooting Guide

## 503 Service Unavailable Error

### Root Cause
The 503 error occurs when the database SSH tunnel is not running. The application cannot connect to the remote PostgreSQL database on port 5433.

### Symptoms
- Admin dashboard shows "Request failed with status code 503"
- Backend logs show: `Error: connect ECONNREFUSED 127.0.0.1:5433`
- Application appears to be running but database queries fail

### Solution

#### Quick Fix (Immediate)
1. Open Command Prompt or PowerShell
2. Navigate to the ops directory:
   ```cmd
   cd "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops"
   ```
3. Run the startup script:
   ```cmd
   START_SERVICES.bat
   ```

#### Manual Fix
1. Start the database tunnel:
   ```powershell
   powershell -ExecutionPolicy Bypass -File "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops\start_db_tunnel.ps1" -PlinkPath "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops\plink.exe" -LogPath "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops\logs\local-db-tunnel.log"
   ```

2. Verify the tunnel is running:
   ```cmd
   netstat -ano | findstr "5433"
   ```
   You should see a line with `LISTENING` status.

3. Test the backend API:
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:5001/api/health" -UseBasicParsing
   ```
   Should return status 200 OK.

#### Permanent Fix (Auto-start on System Boot)

**Option 1: Task Scheduler (Recommended)**
1. Open Task Scheduler (taskschd.msc)
2. Create a new task:
   - Name: "SpeedNet Office - Database Tunnel"
   - Trigger: At system startup
   - Action: Start a program
     - Program: `powershell.exe`
     - Arguments: `-ExecutionPolicy Bypass -WindowStyle Hidden -File "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops\db_tunnel_watchdog.ps1" -PlinkPath "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops\plink.exe" -LogPath "c:\Users\Speed Net IT\Documents\office.speednetkhulna.com\ops\logs\local-db-tunnel.log" -Port 5433`
   - Run whether user is logged on or not
   - Run with highest privileges

**Option 2: Startup Folder**
1. Press `Win + R` and type: `shell:startup`
2. Create a shortcut to `START_SERVICES.bat` in the startup folder

### Verification Steps

1. **Check Database Tunnel Status:**
   ```cmd
   netstat -ano | findstr "5433"
   ```
   Expected: Should show LISTENING on port 5433

2. **Check Plink Process:**
   ```powershell
   Get-Process plink -ErrorAction SilentlyContinue
   ```
   Expected: Should show at least one plink process

3. **Check Backend Health:**
   ```powershell
   Invoke-WebRequest -Uri "http://localhost:5001/api/health" -UseBasicParsing
   ```
   Expected: Status 200 OK with database status "Connected"

4. **Check Production Server:**
   ```powershell
   Invoke-WebRequest -Uri "https://office.speednetkhulna.com/api/health" -UseBasicParsing
   ```
   Expected: Status 200 OK

5. **Check Admin Dashboard:**
   Open browser: https://office.speednetkhulna.com/admin-dashboard
   Expected: Should load without 503 error

### Log Files

Check these log files for detailed error information:

- **Backend Errors:** `ops/logs/backend-local.err.log`
- **Backend Output:** `ops/logs/backend-local.log`
- **Database Tunnel:** `ops/logs/local-db-tunnel.log`
- **Tunnel Errors:** `ops/logs/local-db-tunnel.log.err`

### Common Issues

#### Issue: Tunnel keeps disconnecting
**Solution:** The watchdog script should automatically restart it. Check if watchdog is running:
```powershell
Get-Process | Where-Object {$_.ProcessName -eq 'powershell'} | ForEach-Object { (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine } | Select-String "db_tunnel_watchdog"
```

#### Issue: Port 5433 already in use
**Solution:** Kill the existing process and restart:
```cmd
netstat -ano | findstr "5433"
taskkill /PID <PID_NUMBER> /F
```
Then restart the tunnel.

#### Issue: SSH connection refused
**Solution:** Check if the remote server is accessible:
```cmd
ping 199.188.200.186
```
Verify SSH port 21098 is open and credentials are correct.

### Architecture Overview

```
[Browser] → [Nginx/Apache on 199.188.200.186]
              ↓
         [Node.js Backend on ports 5000/5001]
              ↓
         [SSH Tunnel on port 5433]
              ↓
         [PostgreSQL on 199.188.200.186:5432]
```

### Contact

If issues persist after following this guide, check:
1. Network connectivity to 199.188.200.186
2. SSH credentials in `ops/start_db_tunnel.ps1`
3. PostgreSQL service status on remote server
4. PM2 process status: `pm2 list`

---
**Last Updated:** May 13, 2026
**Issue Fixed:** Database tunnel not starting automatically causing 503 errors
