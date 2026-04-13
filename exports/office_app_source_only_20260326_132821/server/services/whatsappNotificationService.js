const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const qrcode = require(path.resolve(__dirname, '../node_modules/qrcode-terminal'));
const { Client, LocalAuth } = require(path.resolve(__dirname, '../node_modules/whatsapp-web.js'));
const { MessageMedia } = require(path.resolve(__dirname, '../node_modules/whatsapp-web.js'));
let puppeteer = null;
try {
  puppeteer = require(path.resolve(__dirname, '../node_modules/puppeteer'));
} catch (error) {
  try {
    puppeteer = require(path.resolve(__dirname, '../node_modules/puppeteer-core'));
  } catch (fallbackError) {
    puppeteer = null;
  }
}
const { buildApprovalPayload, renderApprovalHtml } = require('../controllers/approvalController');
const {
  enqueueJob,
  getWorkerState,
  getWorkerDiagnostics
} = require('../utilities/whatsappWorkerQueue');

let clientInstance = null;
let initPromise = null;
let ready = false;
let currentHeadlessMode = true;
let latestQr = null;
let latestStatus = 'disconnected';
let latestError = null;
let latestAccount = null;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tempScreenshotDir = path.join(os.tmpdir(), 'speednet-approval-letters');
const authPath = path.resolve(__dirname, '../../.wwebjs_auth');
const sessionDir = path.join(authPath, 'session-office_leave_approvals');
const workerBaseUrl = String(process.env.WHATSAPP_WORKER_BASE_URL || process.env.WHATSAPP_WORKER_URL || '').trim().replace(/\/+$/, '');
const workerApiKey = String(process.env.WHATSAPP_WORKER_API_KEY || '').trim();
const workerPullMode = String(process.env.WHATSAPP_WORKER_PULL_MODE || (workerBaseUrl ? 'true' : 'false')).toLowerCase() === 'true';

const isEnabled = () => String(process.env.WHATSAPP_GROUP_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true';

const applyBrowserLibraryPath = () => {
  const extraLibPath = String(process.env.WHATSAPP_LD_LIBRARY_PATH || '').trim();
  if (!extraLibPath) return;
  const current = String(process.env.LD_LIBRARY_PATH || '').trim();
  const merged = [extraLibPath, current].filter(Boolean).join(':');
  process.env.LD_LIBRARY_PATH = merged;
};

const getApprovalBaseUrl = () => {
  const preferred = process.env.WHATSAPP_APPROVAL_BASE_URL || process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || '';
  return String(preferred).replace(/\/+$/, '');
};

const isWorkerMode = () => Boolean(workerBaseUrl);
const isWorkerPullMode = () => workerPullMode && Boolean(workerApiKey);

const mapStatusError = (status) => {
  const state = String(status?.state || '').toLowerCase();
  const rawError = String(status?.error || '').trim();
  if (!rawError && !state) return null;
  if (state === 'worker_error') return 'Portal cannot reach the WhatsApp worker right now.';
  if (state === 'auth_failure') return 'WhatsApp session expired. Please scan the QR again.';
  if (state === 'disconnected') return rawError || 'WhatsApp is disconnected. Reconnect the office sender to resume alerts.';
  if (rawError.includes('group not found')) return 'Configured WhatsApp group was not found. Check the group name.';
  if (rawError.includes('timed out')) return 'Connection timed out while talking to WhatsApp. Please try reconnecting.';
  if (rawError.includes('Unauthorized')) return 'Worker authentication failed. Check the worker API key.';
  return rawError || null;
};

const requestJson = (method, urlString, body = null, extraHeaders = {}) => new Promise((resolve, reject) => {
  const parsed = new URL(urlString);
  const transport = parsed.protocol === 'https:' ? https : http;
  const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
  const req = transport.request({
    method,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `${parsed.pathname}${parsed.search}`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload ? payload.length : 0,
      ...extraHeaders
    },
    timeout: 120000
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (error) {
          data = raw;
        }
      }
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve(data);
      } else {
        const error = new Error(data?.message || `Worker request failed with status ${res.statusCode}`);
        error.statusCode = res.statusCode;
        error.response = data;
        reject(error);
      }
    });
  });
  req.on('error', reject);
  req.on('timeout', () => {
    req.destroy(new Error('Worker request timed out'));
  });
  if (payload) req.write(payload);
  req.end();
});

const workerUrl = (endpoint) => `${workerBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

const callWorker = (method, endpoint, body = null) => {
  if (!workerBaseUrl) {
    throw new Error('WhatsApp worker base URL is not configured.');
  }
  const headers = {};
  if (workerApiKey) {
    headers['x-worker-api-key'] = workerApiKey;
  }
  return requestJson(method, workerUrl(endpoint), body, headers);
};

const readFileAsDataUri = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.svg'
      ? 'image/svg+xml'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : 'image/png';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn('[WhatsApp] Data URI read warning:', error.message);
    return '';
  }
};

const enrichPayloadForWorker = (payload) => {
  const info = payload?.info || {};
  const assets = {
    logoDataUri: readFileAsDataUri(path.resolve(__dirname, '../../client/public/logo-b.png')),
    sealDataUri: info?.digital_seal ? readFileAsDataUri(path.resolve(__dirname, '../../uploads/seals', info.digital_seal)) : ''
  };
  return {
    ...payload,
    assets
  };
};

const readExecutableCandidate = (candidate) => {
  if (!candidate) return null;
  try {
    return fs.existsSync(candidate) ? candidate : null;
  } catch (error) {
    return null;
  }
};

const resolveBundledPuppeteerExecutable = () => {
  if (!puppeteer) return null;

  try {
    if (typeof puppeteer.executablePath === 'function') {
      const executable = puppeteer.executablePath();
      if (executable && fs.existsSync(executable)) {
        return executable;
      }
    }
  } catch (error) {
    console.warn('[WhatsApp] puppeteer.executablePath() warning:', error.message);
  }

  try {
    const browserData = puppeteer.default?.browserRevision || puppeteer.browserRevision || null;
    if (browserData) {
      const cacheRoots = [
        path.join(os.homedir(), '.cache', 'puppeteer'),
        path.join(os.homedir(), '.cache', 'chrome'),
        path.join(os.homedir(), 'AppData', 'Local', 'puppeteer'),
      ];
      for (const cacheRoot of cacheRoots) {
        if (!fs.existsSync(cacheRoot)) continue;
        const candidates = [];
        const walk = (dir, depth = 0) => {
          if (depth > 4) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(fullPath, depth + 1);
            } else if (/chrome(\.exe)?$/i.test(entry.name) || /^chrome$/i.test(entry.name)) {
              candidates.push(fullPath);
            }
          }
        };
        walk(cacheRoot);
        const found = candidates.find((candidate) => fs.existsSync(candidate));
        if (found) return found;
      }
    }
  } catch (error) {
    console.warn('[WhatsApp] bundled browser lookup warning:', error.message);
  }

  return null;
};

const resolveBrowserExecutable = () => {
  const configured = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
  const configuredPath = readExecutableCandidate(configured);
  if (configuredPath) return configuredPath;

  const envCandidates = [
    process.env.CHROME_BIN,
    process.env.CHROMIUM_BIN,
    process.env.PUPPETEER_CACHE_DIR
  ].filter(Boolean);
  for (const entry of envCandidates) {
    const candidate = readExecutableCandidate(entry);
    if (candidate) return candidate;
  }

  const windowsCandidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const candidate of windowsCandidates) {
    const resolved = readExecutableCandidate(candidate);
    if (resolved) return resolved;
  }

  const linuxCandidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/opt/google/chrome/chrome',
    '/usr/local/bin/google-chrome',
    '/usr/local/bin/chromium'
  ];
  for (const candidate of linuxCandidates) {
    const resolved = readExecutableCandidate(candidate);
    if (resolved) return resolved;
  }

  const bundled = resolveBundledPuppeteerExecutable();
  if (bundled) return bundled;

  const puppeteerCacheRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(puppeteerCacheRoot)) {
    const buildDirs = fs.readdirSync(puppeteerCacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => [
        path.join(puppeteerCacheRoot, entry.name, 'chrome-linux', 'chrome'),
        path.join(puppeteerCacheRoot, entry.name, 'chrome-linux64', 'chrome'),
        path.join(puppeteerCacheRoot, entry.name, 'chrome-win64', 'chrome.exe')
      ])
      .flat()
      .map(readExecutableCandidate)
      .filter(Boolean);

    if (buildDirs.length > 0) {
      return buildDirs[buildDirs.length - 1];
    }
  }

  return null;
};

const cleanupStaleSessionLocks = () => {
  const candidates = [
    path.join(sessionDir, 'lockfile'),
    path.join(sessionDir, 'SingletonLock'),
    path.join(sessionDir, 'SingletonCookie'),
    path.join(sessionDir, 'SingletonSocket'),
    path.join(sessionDir, 'Default', 'LOCK'),
    path.join(sessionDir, 'Default', 'LOCK.old'),
    path.join(sessionDir, 'Default', 'SingletonLock'),
    path.join(sessionDir, 'Default', 'SingletonCookie'),
    path.join(sessionDir, 'Default', 'SingletonSocket'),
    path.join(sessionDir, 'Default', 'DevToolsActivePort')
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true, recursive: true });
      }
    } catch (error) {
      console.warn('[WhatsApp] Session lock cleanup warning:', filePath, error.message);
    }
  }
};

const ensureClient = async (options = {}) => {
  if (!isEnabled()) return null;
  if (isWorkerPullMode()) {
    latestStatus = 'queued_start';
    latestError = null;
    await enqueueJob('start', { headless: options.headless !== false });
    return { queued: true };
  }
  if (isWorkerMode()) {
    const response = await callWorker('POST', '/api/whatsapp/start', { headless: options.headless !== false });
    latestStatus = response?.status?.state || response?.status?.status || 'connecting';
    latestError = response?.status?.error || null;
    latestQr = response?.status?.qr || null;
    latestAccount = response?.status?.account || null;
    return response;
  }
  if (clientInstance) return clientInstance;
  const requestedHeadless = options.headless !== false;
  if (initPromise && currentHeadlessMode === requestedHeadless) return initPromise;

  latestStatus = 'connecting';
  latestError = null;
  latestQr = null;
  applyBrowserLibraryPath();
  cleanupStaleSessionLocks();

  initPromise = new Promise((resolve, reject) => {
    currentHeadlessMode = requestedHeadless;
    const executablePath = resolveBrowserExecutable();
    const puppeteerOptions = {
      headless: requestedHeadless ? true : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-crash-reporter',
        '--disable-breakpad'
      ]
    };
    if (executablePath) {
      puppeteerOptions.executablePath = executablePath;
    }

    const client = new Client({
      authStrategy: new LocalAuth({ clientId: 'office_leave_approvals', dataPath: authPath }),
      puppeteer: puppeteerOptions
    });

    client.on('qr', (qr) => {
      latestStatus = 'qr';
      latestQr = qr;
      console.log('[WhatsApp] Scan this QR to connect the approval notification bot:');
      qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
      ready = true;
      latestStatus = 'ready';
      latestQr = null;
      latestError = null;
      latestAccount = {
        name: client.info?.pushname || client.info?.name || client.info?.wid?.user || null,
        number: client.info?.wid?.user || null,
        platform: client.info?.platform || null
      };
      console.log('[WhatsApp] Client is ready.');
      clientInstance = client;
      resolve(client);
    });

    client.on('auth_failure', (msg) => {
      ready = false;
      latestStatus = 'auth_failure';
      latestError = String(msg || 'Authentication failed');
      console.error('[WhatsApp] Authentication failed:', msg);
    });

    client.on('disconnected', (reason) => {
      ready = false;
      latestStatus = 'disconnected';
      latestError = String(reason || 'Disconnected');
      latestQr = null;
      latestAccount = null;
      console.warn('[WhatsApp] Client disconnected:', reason);
      clientInstance = null;
      initPromise = null;
    });

    client.initialize().catch((error) => {
      console.error('[WhatsApp] Initialization error:', error);
      initPromise = null;
      reject(error);
    });
  });

  return initPromise;
};

const getStatus = async () => {
  if (isWorkerPullMode()) {
    const state = await getWorkerState();
    const diagnostics = await getWorkerDiagnostics();
    const qrIssuedAt = state.hasQr ? state.updatedAt : null;
    return {
      ...state,
      enabled: isEnabled(),
      mode: 'worker_pull',
      workerBaseUrl,
      qrIssuedAt,
      lastDelivery: diagnostics.lastDelivery,
      lastApproval: diagnostics.lastApproval,
      pendingJobs: diagnostics.pendingJobs,
      recentEvents: diagnostics.recentEvents,
      displayError: mapStatusError(state)
    };
  }
  if (isWorkerMode()) {
    try {
      const status = await callWorker('GET', '/api/whatsapp/status');
      return {
        ...status,
        displayError: mapStatusError(status)
      };
    } catch (error) {
      return {
        enabled: isEnabled(),
        connected: false,
        ready: false,
        state: 'worker_error',
        headless: true,
        hasQr: false,
        error: error.message,
        account: null,
        mode: 'worker',
        workerBaseUrl,
        displayError: mapStatusError({ state: 'worker_error', error: error.message })
      };
    }
  }

  const localStatus = {
    enabled: isEnabled(),
    connected: Boolean(clientInstance) && ready,
    ready,
    state: latestStatus,
    headless: currentHeadlessMode,
    hasQr: Boolean(latestQr),
    error: latestError,
    account: latestAccount,
    executablePath: String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim() || null,
    browserExecutable: resolveBrowserExecutable(),
    dataPath: path.resolve(__dirname, '../../.wwebjs_auth')
  };
  return {
    ...localStatus,
    displayError: mapStatusError(localStatus)
  };
};

const getLatestQr = async () => {
  if (isWorkerPullMode()) {
    const state = await getWorkerState();
    return {
      enabled: isEnabled(),
      hasQr: Boolean(state.hasQr),
      qr: state.qr || null,
      state: state.state || 'disconnected',
      connected: Boolean(state.connected),
      error: state.error || null,
      mode: 'worker_pull',
      workerBaseUrl
    };
  }
  if (isWorkerMode()) {
    try {
      return await callWorker('GET', '/api/whatsapp/qr');
    } catch (error) {
      return {
        enabled: isEnabled(),
        hasQr: false,
        qr: null,
        state: 'worker_error',
        connected: false,
        error: error.message,
        mode: 'worker',
        workerBaseUrl
      };
    }
  }

  return {
    enabled: isEnabled(),
    hasQr: Boolean(latestQr),
    qr: latestQr,
    state: latestStatus,
    connected: Boolean(clientInstance) && ready
  };
};

const reconnectClient = async (options = {}) => {
  if (isWorkerPullMode()) {
    latestStatus = 'queued_reconnect';
    latestError = null;
    return enqueueJob('reconnect', { headless: options.headless !== false });
  }
  if (isWorkerMode()) {
    return callWorker('POST', '/api/whatsapp/reconnect', { headless: options.headless !== false });
  }
  await closeClient();
  return ensureClient(options);
};

const closeClient = async () => {
  if (isWorkerPullMode()) {
    latestStatus = 'queued_stop';
    latestError = null;
    return enqueueJob('stop', {});
  }
  if (isWorkerMode()) {
    return callWorker('POST', '/api/whatsapp/stop');
  }
  if (!clientInstance) return;
  try {
    await clientInstance.destroy();
  } catch (error) {
    console.warn('[WhatsApp] Client close warning:', error.message);
  } finally {
    clientInstance = null;
    initPromise = null;
    ready = false;
    latestStatus = 'disconnected';
    latestAccount = null;
  }
};

const buildApprovalMessage = (payload, approvalId) => {
  const info = payload?.info || {};
  const leaves = Array.isArray(payload?.leaves) ? payload.leaves : [];
  const leaveLines = leaves.map((lv) => `- ${lv.type_name}: ${lv.is_half ? new Date(lv.start_date).toLocaleDateString('en-GB') : `${new Date(lv.start_date).toLocaleDateString('en-GB')} to ${new Date(lv.end_date).toLocaleDateString('en-GB')}`} (${lv.day_count} day)`).join('\n');

  return [
    '*Leave Approval Notice*',
    `Employee: ${info.full_name || '-'}`,
    `Department: ${info.department || '-'}`,
    `Approved by: ${info.admin_name || 'Management'}`,
    '',
    'Approved Leave:',
    leaveLines || '-',
  ].filter(Boolean).join('\n');
};

const sendTestNotification = async () => {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  const groupName = String(process.env.WHATSAPP_GROUP_NAME || '').trim();
  if (!groupName) return { skipped: true, reason: 'missing_group_name' };

  if (isWorkerPullMode()) {
    await enqueueJob('send_test', { groupName });
    return { queued: true, groupName, worker: true };
  }

  if (isWorkerMode()) {
    const response = await callWorker('POST', '/api/whatsapp/send-test', { groupName });
    return { sent: true, groupName, worker: true, response };
  }

  const client = await ensureClient();
  if (!client || !ready) {
    throw new Error('WhatsApp sender is not connected yet.');
  }

  const chats = await client.getChats();
  const targetChat = chats.find((chat) => chat.isGroup && String(chat.name || '').trim().toLowerCase() === groupName.toLowerCase());
  if (!targetChat) {
    throw new Error(`WhatsApp group not found: ${groupName}`);
  }

  const message = [
    '*WhatsApp Connection Test*',
    'Office sender is connected and ready.',
    `Checked at: ${new Date().toLocaleString('en-GB')}`
  ].join('\n');

  await client.sendMessage(targetChat.id._serialized, message);
  return { sent: true, groupName };
};

const sendTestImageNotification = async () => {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  const groupName = String(process.env.WHATSAPP_GROUP_NAME || '').trim();
  if (!groupName) return { skipped: true, reason: 'missing_group_name' };

  if (isWorkerPullMode()) {
    await enqueueJob('send_test_image', { groupName });
    return { queued: true, groupName, worker: true };
  }

  if (isWorkerMode()) {
    const response = await callWorker('POST', '/api/whatsapp/send-test-image', { groupName });
    return { sent: true, groupName, worker: true, response };
  }

  const client = await ensureClient();
  if (!client || !ready) {
    throw new Error('WhatsApp sender is not connected yet.');
  }

  const chats = await client.getChats();
  const targetChat = chats.find((chat) => chat.isGroup && String(chat.name || '').trim().toLowerCase() === groupName.toLowerCase());
  if (!targetChat) {
    throw new Error(`WhatsApp group not found: ${groupName}`);
  }

  const imagePath = await createDiagnosticImage();
  try {
    const media = MessageMedia.fromFilePath(imagePath);
    await client.sendMessage(targetChat.id._serialized, media, {
      caption: ['*WhatsApp Image Test*', 'Image delivery is working for the office sender.', `Checked at: ${new Date().toLocaleString('en-GB')}`].join('\n')
    });
  } finally {
    try {
      fs.unlinkSync(imagePath);
    } catch (cleanupError) {
      console.warn('[WhatsApp] Test image cleanup warning:', cleanupError.message);
    }
  }
  return { sent: true, groupName };
};

const createDiagnosticImage = async () => {
  fs.mkdirSync(tempScreenshotDir, { recursive: true });
  if (!puppeteer) {
    throw new Error('Puppeteer is not available for test image generation.');
  }
  applyBrowserLibraryPath();
  const executablePath = resolveBrowserExecutable();
  if (!executablePath) {
    throw new Error('Chrome/Chromium executable not found for test image generation.');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--disable-breakpad'
    ]
  });

  const filePath = path.join(tempScreenshotDir, `whatsapp-test-${Date.now()}.png`);
  const html = `
    <html>
      <body style="margin:0;font-family:Arial,sans-serif;background:#eef4ff;">
        <div style="width:900px;height:420px;display:flex;align-items:center;justify-content:center;padding:48px;box-sizing:border-box;">
          <div style="width:100%;height:100%;border-radius:32px;background:linear-gradient(135deg,#0f172a,#2563eb);color:#fff;padding:40px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;">
            <div>
              <div style="font-size:18px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.72;">SpeedNet Khulna</div>
              <div style="font-size:44px;font-weight:800;margin-top:18px;">WhatsApp Image Test</div>
              <div style="font-size:20px;line-height:1.6;opacity:0.82;margin-top:16px;">Image delivery is working for the office sender.</div>
            </div>
            <div style="font-size:18px;opacity:0.76;">Checked at ${new Date().toLocaleString('en-GB')}</div>
          </div>
        </div>
      </body>
    </html>`;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 420, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: filePath, type: 'png', omitBackground: false });
    return filePath;
  } finally {
    await browser.close();
  }
};

const createApprovalLetterImage = async (approvalId, payload) => {
  fs.mkdirSync(tempScreenshotDir, { recursive: true });
  if (!puppeteer) {
    throw new Error('Puppeteer is not available for approval letter screenshot generation.');
  }
  applyBrowserLibraryPath();
  const executablePath = resolveBrowserExecutable();
  if (!executablePath) {
    throw new Error('Chrome/Chromium executable not found for approval letter screenshot.');
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--disable-breakpad'
    ]
  });

  const filePath = path.join(tempScreenshotDir, `approval-letter-${approvalId}-${Date.now()}.png`);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
    await page.setContent(renderApprovalHtml(payload), { waitUntil: 'networkidle0' });
    const pageElement = await page.$('.page');
    if (!pageElement) {
      throw new Error('Approval letter container not found.');
    }

    const box = await pageElement.boundingBox();
    if (!box) {
      throw new Error('Approval letter container bounds unavailable.');
    }

    const clip = {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: Math.ceil(box.width),
      height: Math.ceil(box.height)
    };

    await page.screenshot({
      path: filePath,
      type: 'png',
      clip,
      omitBackground: false
    });
    return filePath;
  } finally {
    await browser.close();
  }
};

const sendLeaveApprovalNotification = async (approvalId) => {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  const groupName = String(process.env.WHATSAPP_GROUP_NAME || '').trim();
  if (!groupName) return { skipped: true, reason: 'missing_group_name' };

  let payload = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    payload = await buildApprovalPayload(approvalId);
    if (payload) break;
    await delay(1200);
  }
  if (!payload) return { skipped: true, reason: 'approval_not_found' };

  if (isWorkerPullMode()) {
    const enrichedPayload = enrichPayloadForWorker(payload);
    await enqueueJob('send_approval', {
      approvalId,
      groupName,
      payload: enrichedPayload
    });
    console.log(`[WhatsApp] Leave approval notification queued for remote worker (${approvalId}).`);
    return { queued: true, groupName, worker: true };
  }

  if (isWorkerMode()) {
    const enrichedPayload = enrichPayloadForWorker(payload);
    const response = await callWorker('POST', '/api/whatsapp/send-approval', {
      approvalId,
      groupName,
      payload: enrichedPayload
    });
    console.log(`[WhatsApp] Leave approval notification proxied to worker for request ${approvalId} (${groupName}).`);
    return { sent: true, groupName, worker: true, response };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const client = await ensureClient();
      if (!client || !ready) {
        await delay(1500);
        continue;
      }

      const chats = await client.getChats();
      const targetChat = chats.find((chat) => chat.isGroup && String(chat.name || '').trim().toLowerCase() === groupName.toLowerCase());
      if (!targetChat) {
        throw new Error(`WhatsApp group not found: ${groupName}`);
      }

      const message = buildApprovalMessage(payload, approvalId);
      const imagePath = await createApprovalLetterImage(approvalId, payload);
      try {
        const media = MessageMedia.fromFilePath(imagePath);
        await client.sendMessage(targetChat.id._serialized, media, { caption: message });
      } finally {
        try {
          fs.unlinkSync(imagePath);
        } catch (cleanupError) {
          console.warn('[WhatsApp] Screenshot cleanup warning:', cleanupError.message);
        }
      }
      console.log(`[WhatsApp] Leave approval notification sent for request ${approvalId} to "${groupName}".`);
      return { sent: true, groupName };
    } catch (error) {
      lastError = error;
      console.error(`[WhatsApp] Attempt ${attempt} failed for request ${approvalId}:`, error.message);
      if (attempt < 3) {
        await delay(2000);
      }
    }
  }

  throw lastError || new Error('Unknown WhatsApp notification failure');
};

module.exports = { ensureClient, closeClient, reconnectClient, getStatus, getLatestQr, sendLeaveApprovalNotification, sendTestNotification, sendTestImageNotification };
