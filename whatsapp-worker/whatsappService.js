const path = require('path');
const fs = require('fs');
const os = require('os');
const qrcode = require(path.resolve(__dirname, './node_modules/qrcode-terminal'));
const { Client, LocalAuth, MessageMedia } = require(path.resolve(__dirname, './node_modules/whatsapp-web.js'));
let puppeteer = null;
try {
  puppeteer = require(path.resolve(__dirname, './node_modules/puppeteer'));
} catch (error) {
  try {
    puppeteer = require(path.resolve(__dirname, './node_modules/puppeteer-core'));
  } catch (fallbackError) {
    puppeteer = null;
  }
}

const { buildApprovalMessage, renderApprovalHtml } = require('./approvalTemplate');

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
const authPath = path.resolve(__dirname, '.wwebjs_auth');
const sessionDir = path.join(authPath, 'session-office_leave_approvals');

const isEnabled = () => String(process.env.WHATSAPP_GROUP_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true';

const applyBrowserLibraryPath = () => {
  const extraLibPath = String(process.env.WHATSAPP_LD_LIBRARY_PATH || '').trim();
  if (!extraLibPath) return;
  const current = String(process.env.LD_LIBRARY_PATH || '').trim();
  const merged = [extraLibPath, current].filter(Boolean).join(':');
  process.env.LD_LIBRARY_PATH = merged;
};

const readExecutableCandidate = (candidate) => {
  if (!candidate) return null;
  try {
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
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
    console.warn('[Worker] puppeteer.executablePath() warning:', error.message);
  }
  return null;
};

const resolveBrowserExecutable = () => {
  const configured = String(process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
  const configuredPath = readExecutableCandidate(configured);
  if (configuredPath) return configuredPath;

  const envCandidates = [process.env.CHROME_BIN, process.env.CHROMIUM_BIN].filter(Boolean);
  for (const entry of envCandidates) {
    const candidate = readExecutableCandidate(entry);
    if (candidate) return candidate;
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
      console.warn('[Worker] Session lock cleanup warning:', filePath, error.message);
    }
  }
};

const ensureClient = async (options = {}) => {
  if (!isEnabled()) return null;
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
      console.log('[Worker] Scan this QR to connect the approval notification bot:');
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
      console.log('[Worker] Client is ready.');
      clientInstance = client;
      resolve(client);
    });

    client.on('auth_failure', (msg) => {
      ready = false;
      latestStatus = 'auth_failure';
      latestError = String(msg || 'Authentication failed');
      console.error('[Worker] Authentication failed:', msg);
    });

    client.on('disconnected', (reason) => {
      ready = false;
      latestStatus = 'disconnected';
      latestError = String(reason || 'Disconnected');
      latestQr = null;
      latestAccount = null;
      console.warn('[Worker] Client disconnected:', reason);
      clientInstance = null;
      initPromise = null;
    });

    client.initialize().catch((error) => {
      console.error('[Worker] Initialization error:', error);
      initPromise = null;
      reject(error);
    });
  });

  return initPromise;
};

const getStatus = () => ({
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
  dataPath: path.resolve(__dirname, '.wwebjs_auth')
});

const getLatestQr = () => ({
  enabled: isEnabled(),
  hasQr: Boolean(latestQr),
  qr: latestQr,
  state: latestStatus,
  connected: Boolean(clientInstance) && ready
});

const reconnectClient = async (options = {}) => {
  await closeClient();
  return ensureClient(options);
};

const closeClient = async () => {
  if (!clientInstance) return;
  try {
    await clientInstance.destroy();
  } catch (error) {
    console.warn('[Worker] Client close warning:', error.message);
  } finally {
    clientInstance = null;
    initPromise = null;
    ready = false;
    latestStatus = 'disconnected';
    latestAccount = null;
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

const sendApprovalNotification = async ({ approvalId, payload, groupName }) => {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  const targetGroup = String(groupName || process.env.WHATSAPP_GROUP_NAME || '').trim();
  if (!targetGroup) return { skipped: true, reason: 'missing_group_name' };
  if (!payload) return { skipped: true, reason: 'missing_payload' };

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const client = await ensureClient();
      if (!client || !ready) {
        await delay(1500);
        continue;
      }

      const chats = await client.getChats();
      const targetChat = chats.find((chat) => chat.isGroup && String(chat.name || '').trim().toLowerCase() === targetGroup.toLowerCase());
      if (!targetChat) {
        throw new Error(`WhatsApp group not found: ${targetGroup}`);
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
          console.warn('[Worker] Screenshot cleanup warning:', cleanupError.message);
        }
      }
      console.log(`[Worker] Leave approval notification sent for request ${approvalId} to "${targetGroup}".`);
      return { sent: true, groupName: targetGroup };
    } catch (error) {
      lastError = error;
      console.error(`[Worker] Attempt ${attempt} failed for request ${approvalId}:`, error.message);
      if (attempt < 3) {
        await delay(2000);
      }
    }
  }

  throw lastError || new Error('Unknown WhatsApp notification failure');
};

const sendTestMessage = async ({ groupName }) => {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  const targetGroup = String(groupName || process.env.WHATSAPP_GROUP_NAME || '').trim();
  if (!targetGroup) return { skipped: true, reason: 'missing_group_name' };

  const client = await ensureClient();
  if (!client || !ready) {
    throw new Error('WhatsApp sender is not connected yet.');
  }

  const chats = await client.getChats();
  const targetChat = chats.find((chat) => chat.isGroup && String(chat.name || '').trim().toLowerCase() === targetGroup.toLowerCase());
  if (!targetChat) {
    throw new Error(`WhatsApp group not found: ${targetGroup}`);
  }

  const message = [
    '*WhatsApp Connection Test*',
    'Office sender is connected and ready.',
    `Checked at: ${new Date().toLocaleString('en-GB')}`
  ].join('\n');

  await client.sendMessage(targetChat.id._serialized, message);
  console.log(`[Worker] Test message sent to "${targetGroup}".`);
  return { sent: true, groupName: targetGroup };
};

const sendTestImageMessage = async ({ groupName }) => {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  const targetGroup = String(groupName || process.env.WHATSAPP_GROUP_NAME || '').trim();
  if (!targetGroup) return { skipped: true, reason: 'missing_group_name' };

  const client = await ensureClient();
  if (!client || !ready) {
    throw new Error('WhatsApp sender is not connected yet.');
  }

  const chats = await client.getChats();
  const targetChat = chats.find((chat) => chat.isGroup && String(chat.name || '').trim().toLowerCase() === targetGroup.toLowerCase());
  if (!targetChat) {
    throw new Error(`WhatsApp group not found: ${targetGroup}`);
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
      console.warn('[Worker] Test image cleanup warning:', cleanupError.message);
    }
  }
  console.log(`[Worker] Test image sent to "${targetGroup}".`);
  return { sent: true, groupName: targetGroup };
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

module.exports = {
  ensureClient,
  closeClient,
  reconnectClient,
  getStatus,
  getLatestQr,
  sendApprovalNotification,
  sendTestMessage,
  sendTestImageMessage
};
