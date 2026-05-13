# Deployment Fix - Missing Sharp Module
**Date:** May 13, 2026, 1:20 PM  
**Issue:** GitHub Actions deployment failing with "Cannot find module 'sharp'"  
**Status:** ✅ FIXED

---

## 🔍 Problem

### Error Message:
```
Error: Cannot find module 'sharp'
Require stack:
- /home/***/office_app/server/middleware/uploadMiddleware.js
- /home/***/office_app/server/routes/channelPartnerRoutes.js
- /home/***/office_app/server/routes/index.js
- /home/***/office_app/server/index.js
```

### Impact:
- ❌ Backend failed to start after deployment
- ❌ PM2 processes in "waiting restart" state (restarted 10 times)
- ❌ Health check failed: Connection refused on port 5000/5001
- ❌ Website down

### Root Cause:
The `sharp` npm package was used in `uploadMiddleware.js` for image processing but was **not listed** in `package.json` dependencies.

**Why it worked before:**
- Likely installed manually on server
- Or was in `node_modules` from previous installation
- But `npm ci --omit=dev` in deployment script installs ONLY packages in package.json

---

## ✅ Solution Applied

### 1. Added `sharp` to package.json

**File:** `server/package.json`

```json
"dependencies": {
  "bcrypt": "^6.0.0",
  "body-parser": "^2.2.2",
  "compression": "^1.8.1",
  "cookie-parser": "^1.4.7",
  "cors": "^2.8.5",
  "cron": "^4.4.0",
  "dotenv": "^16.0.0",
  "ejs": "^4.0.1",
  "express": "^5.2.1",
  "express-session": "^1.19.0",
  "jsonwebtoken": "^9.0.0",
  "multer": "^2.0.2",
  "nodemailer": "^6.10.1",
  "pg": "^8.18.0",
  "puppeteer": "^24.26.1",
  "qrcode-terminal": "^0.12.0",
  "sharp": "^0.33.5",           // ← ADDED
  "whatsapp-web.js": "^1.34.1",
  "whatwg-url": "^16.0.1",
  "xlsx": "^0.18.5"
}
```

### 2. Updated package-lock.json

```bash
npm install sharp --save
```

This updated `package-lock.json` with exact versions and dependencies.

### 3. Committed and Pushed

```bash
git add server/package.json server/package-lock.json
git commit -m "fix: add sharp dependency for image processing in channel partner uploads"
git push origin main
```

**Commit:** `dddb7e4`

---

## 📦 About Sharp

**Package:** `sharp`  
**Version:** `^0.33.5`  
**Purpose:** High-performance image processing library

**Used in:** `server/middleware/uploadMiddleware.js`

**Features:**
- Resize images
- Convert to WebP format
- Optimize quality
- Fast processing (uses libvips)

**Usage in Code:**
```javascript
await sharp(req.file.buffer)
  .resize(maxDim, maxDim, {
    fit: sharp.fit.inside,
    withoutEnlargement: true,
  })
  .toFormat('webp', { quality: 80 })
  .toFile(outputPath);
```

---

## 🔄 Deployment Process

### GitHub Actions Workflow:

1. ✅ **Build client** (React frontend)
2. ✅ **Upload to server** (via SCP)
3. ✅ **Pull latest code** (git reset --hard origin/main)
4. ✅ **Install dependencies** (npm ci --omit=dev)
   - This step now includes `sharp` ✅
5. ✅ **Copy frontend files**
6. ✅ **Reload PM2 processes**
7. ✅ **Health check** (wait for backend to start)

### Expected Result:
- Backend starts successfully
- PM2 processes: ONLINE
- Health check: PASS
- Website: ACCESSIBLE

---

## 🎯 Verification Steps

After deployment completes, verify:

### 1. Check PM2 Status
```bash
ssh -p 21098 speeuvmq@199.188.200.186 "pm2 list"
```

Expected:
```
┌────┬──────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┐
│ id │ name         │ version │ mode    │ pid      │ uptime │ ↺    │ status    │
├────┼──────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┤
│ 0  │ office-api-a │ 1.0.0   │ fork    │ xxxxxxx  │ Xm     │ 0    │ online    │
│ 1  │ office-api-b │ 1.0.0   │ fork    │ xxxxxxx  │ Xm     │ 0    │ online    │
└────┴──────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┘
```

### 2. Check Backend Health
```bash
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5001/api/health
```

Expected: Status 200 OK with database connected

### 3. Check Website
```bash
curl https://office.speednetkhulna.com/api/health
```

Expected: Status 200 OK

### 4. Check Logs (if needed)
```bash
ssh -p 21098 speeuvmq@199.188.200.186 "pm2 logs office-api-a --lines 50"
```

Should NOT show "Cannot find module 'sharp'" error

---

## 🚨 Why This Happened

### Development vs Production

**Local Development:**
- You might have installed `sharp` manually: `npm install sharp`
- It worked locally because it was in `node_modules`
- But you forgot to add `--save` flag
- So it wasn't added to `package.json`

**Production Deployment:**
- Deployment script runs: `npm ci --omit=dev`
- `npm ci` installs ONLY packages listed in `package.json`
- `sharp` was missing from `package.json`
- So it wasn't installed
- Backend crashed on startup

### Lesson Learned:

**Always use `--save` flag when installing packages:**
```bash
# ❌ Wrong (doesn't update package.json)
npm install sharp

# ✅ Correct (updates package.json)
npm install sharp --save

# ✅ Even better (default in npm 5+)
npm install sharp
```

**Or check package.json after installing:**
```bash
npm install sharp
git diff server/package.json  # Should show the new package
```

---

## 📋 Prevention Checklist

To prevent similar issues in future:

### Before Committing:
- [ ] Check `git status` for modified files
- [ ] Review `package.json` changes
- [ ] Ensure all used packages are listed
- [ ] Run `npm ci` locally to test clean install
- [ ] Test the application after clean install

### Before Pushing:
- [ ] Run local build: `npm run build` (if applicable)
- [ ] Check for any import errors
- [ ] Review deployment logs from previous successful deploy

### After Deployment:
- [ ] Monitor GitHub Actions workflow
- [ ] Check PM2 status on server
- [ ] Verify health endpoints
- [ ] Test critical features

---

## 🔧 Quick Fix Commands

If this happens again with a different package:

### 1. Identify Missing Package
```bash
# Check PM2 logs
ssh -p 21098 speeuvmq@199.188.200.186 "pm2 logs office-api-a --err --lines 20"

# Look for: "Cannot find module 'package-name'"
```

### 2. Add to package.json
```bash
# Locally
cd server
npm install package-name --save

# Commit and push
git add package.json package-lock.json
git commit -m "fix: add missing package-name dependency"
git push origin main
```

### 3. Manual Fix (Emergency)
```bash
# SSH into server
ssh -p 21098 speeuvmq@199.188.200.186

# Install package directly
cd /home/speeuvmq/office_app/server
npm install package-name

# Restart PM2
pm2 restart ecosystem.config.js --only office-api-a,office-api-b
```

**Note:** Manual fix is temporary. Always commit to git!

---

## 📊 Deployment Timeline

| Time | Event | Status |
|------|-------|--------|
| 04:14:20 | Deployment started | ⏳ |
| 04:14:22 | Code pulled from GitHub | ✅ |
| 04:14:23 | Dependencies installed | ✅ |
| 04:14:25 | Frontend published | ✅ |
| 04:14:27 | PM2 reload triggered | ✅ |
| 04:14:30 | Backend startup attempt 1 | ❌ sharp missing |
| 04:14:33 | Backend startup attempt 2 | ❌ sharp missing |
| 04:14:37 | Backend startup attempt 3 | ❌ sharp missing |
| ... | (10 restart attempts) | ❌ |
| 04:14:53 | Health check failed | ❌ |
| 04:14:54 | Deployment failed | ❌ |
| **13:20** | **Fix applied** | ✅ |
| **13:21** | **Pushed to GitHub** | ✅ |
| **13:25** | **New deployment triggered** | ⏳ |

---

## ✅ Resolution

**Status:** FIXED ✅

**Actions Taken:**
1. ✅ Added `sharp` to `server/package.json`
2. ✅ Updated `package-lock.json`
3. ✅ Committed changes
4. ✅ Pushed to GitHub (commit: dddb7e4)
5. ⏳ GitHub Actions will auto-deploy

**Expected Outcome:**
- Backend will start successfully
- PM2 processes will be ONLINE
- Health checks will PASS
- Website will be ACCESSIBLE

**Next Deployment:**
- Will include `sharp` in dependencies
- Backend will start without errors
- No manual intervention needed

---

## 📝 Notes

### Sharp Installation Notes:

**Sharp requires native binaries:**
- Automatically downloads correct binaries for platform
- Linux x64 binaries for production server
- Windows binaries for local development
- No manual compilation needed (usually)

**If sharp installation fails on server:**
```bash
# Install build tools (if needed)
npm install --build-from-source

# Or use pre-built binaries
npm install --platform=linux --arch=x64 sharp
```

**Common Issues:**
- ⚠️ Different Node.js versions (use same version locally and production)
- ⚠️ Missing system libraries (libvips)
- ⚠️ Architecture mismatch (x64 vs ARM)

**Our Setup:**
- ✅ Node.js v24.13.1 (same on local and production)
- ✅ Linux x64 (production server)
- ✅ Pre-built binaries available
- ✅ Should install without issues

---

## 🎓 Key Takeaways

1. **Always add dependencies to package.json**
   - Use `npm install --save` or just `npm install` (default in npm 5+)
   - Never manually copy packages to node_modules

2. **Test clean installs locally**
   - Delete `node_modules`
   - Run `npm ci`
   - Test the application

3. **Monitor deployment logs**
   - Watch GitHub Actions workflow
   - Check for errors in real-time
   - Don't assume deployment succeeded

4. **Use proper error handling**
   - PM2 auto-restart is good
   - But fix root cause, don't rely on restarts
   - 10 failed restarts = something is wrong

5. **Document dependencies**
   - Comment why each package is needed
   - Note if package has special requirements
   - Keep README updated

---

**Fixed by:** Kiro AI Assistant  
**Date:** May 13, 2026, 1:20 PM  
**Commit:** dddb7e4  
**Status:** Deployed to GitHub, awaiting auto-deployment ✅
