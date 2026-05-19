const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const dotenv = require('dotenv');

const envRoot = __dirname;
const modeEnvPath = path.join(envRoot, '.env');
if (fs.existsSync(modeEnvPath)) {
  dotenv.config({ path: modeEnvPath });
}

const {
  ensureClient,
  reconnectClient,
  closeClient,
  getStatus,
  getLatestQr,
  sendApprovalNotification,
  sendTestMessage,
  sendTestImageMessage
} = require('./whatsappService');

const app = express();
const PORT = Number(process.env.PORT || 4010);
const apiKey = String(process.env.WHATSAPP_WORKER_API_KEY || '').trim();
const mainPortalBaseUrl = String(process.env.MAIN_PORTAL_BASE_URL || 'https://office.speednetkhulna.com').trim().replace(/\/+$/, '');
const workerName = String(process.env.WHATSAPP_WORKER_NAME || 'office_whatsapp_worker').trim();
let pollBusy = false;
let stateBusy = false;

const launchClientInBackground = (options = {}) => {
  ensureClient(options).catch((error) => {
    console.error('[Worker] Background start failed:', error.message);
  });
};

process.on('unhandledRejection', (reason) => {
  const message = reason?.message || String(reason || 'Unknown rejection');
  console.error('[Worker] Unhandled rejection:', message);
});

process.on('uncaughtException', (error) => {
  console.error('[Worker] Uncaught exception:', error?.message || error);
});

app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '20mb' }));

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
    timeout: 30000
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          data = raw;
        }
      }
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve(data);
      } else {
        const error = new Error(data?.message || `Portal request failed with status ${res.statusCode}`);
        error.statusCode = res.statusCode;
        error.response = data;
        reject(error);
      }
    });
  });
  req.on('error', reject);
  req.on('timeout', () => req.destroy(new Error('Portal request timed out')));
  if (payload) req.write(payload);
  req.end();
});

const portalUrl = (endpoint) => `${mainPortalBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
const portalHeaders = () => apiKey ? { 'x-worker-api-key': apiKey } : {};

const pushWorkerState = async () => {
  if (stateBusy || !mainPortalBaseUrl || !apiKey) return;
  stateBusy = true;
  try {
    const status = getStatus();
    const qr = getLatestQr();
    await requestJson('POST', portalUrl('/api/internal/whatsapp-worker/state'), {
      ...status,
      hasQr: Boolean(qr?.hasQr),
      qr: qr?.qr || null,
      state: qr?.state || status.state
    }, portalHeaders());
  } catch (error) {
    console.error('[Worker] State sync failed:', error.message);
  } finally {
    stateBusy = false;
  }
};

const processJob = async (job) => {
  if (!job) return;
  const jobType = String(job.job_type || '');
  const payload = job.payload || {};

  if (jobType === 'start') {
    launchClientInBackground({ headless: payload.headless !== false });
    return;
  }
  if (jobType === 'reconnect') {
    reconnectClient({ headless: payload.headless !== false }).catch((error) => {
      console.error('[Worker] Background reconnect failed:', error.message);
    });
    return;
  }
  if (jobType === 'stop') {
    await closeClient();
    return;
  }
  if (jobType === 'send_approval') {
    await sendApprovalNotification(payload);
    return;
  }
  if (jobType === 'send_test') {
    await sendTestMessage(payload);
    return;
  }
  if (jobType === 'send_test_image') {
    await sendTestImageMessage(payload);
    return;
  }

  throw new Error(`Unknown worker job type: ${jobType}`);
};

const pollNextJob = async () => {
  if (pollBusy || !mainPortalBaseUrl || !apiKey) return;
  pollBusy = true;
  try {
    const response = await requestJson('GET', portalUrl(`/api/internal/whatsapp-worker/jobs/next?worker=${encodeURIComponent(workerName)}`), null, portalHeaders());
    const job = response?.job || null;
    if (!job) return;

    try {
      await processJob(job);
      await requestJson('POST', portalUrl(`/api/internal/whatsapp-worker/jobs/${job.id}/complete`), {}, portalHeaders());
    } catch (error) {
      await requestJson('POST', portalUrl(`/api/internal/whatsapp-worker/jobs/${job.id}/fail`), {
        error: error.message || 'Worker job failed',
        retry: false
      }, portalHeaders());
      console.error('[Worker] Job processing failed:', error.message);
    }
  } catch (error) {
    console.error('[Worker] Job poll failed:', error.message);
  } finally {
    pollBusy = false;
    await pushWorkerState();
  }
};

const requireApiKey = (req, res, next) => {
  if (!apiKey) return next();
  const incoming = String(req.headers['x-worker-api-key'] || '').trim();
  if (incoming !== apiKey) {
    return res.status(401).json({ message: 'Unauthorized worker request' });
  }
  return next();
};

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'whatsapp-worker',
    timestamp: new Date().toISOString(),
    pid: process.pid
  });
});

app.get('/api/whatsapp/status', requireApiKey, async (req, res) => {
  try {
    res.json(getStatus());
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load status' });
  }
});

app.get('/api/whatsapp/qr', requireApiKey, async (req, res) => {
  try {
    res.json(getLatestQr());
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load QR' });
  }
});

app.post('/api/whatsapp/start', requireApiKey, async (req, res) => {
  try {
    await ensureClient({ headless: req.body?.headless !== false });
    res.json({ message: 'WhatsApp connect started', status: getStatus() });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to start WhatsApp client' });
  }
});

app.post('/api/whatsapp/reconnect', requireApiKey, async (req, res) => {
  try {
    await reconnectClient({ headless: req.body?.headless !== false });
    res.json({ message: 'WhatsApp reconnect started', status: getStatus() });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to reconnect WhatsApp' });
  }
});

app.post('/api/whatsapp/stop', requireApiKey, async (req, res) => {
  try {
    await closeClient();
    res.json({ message: 'WhatsApp client stopped', status: getStatus() });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to stop WhatsApp client' });
  }
});

app.post('/api/whatsapp/send-approval', requireApiKey, async (req, res) => {
  try {
    const approvalId = Number(req.body?.approvalId || 0);
    const payload = req.body?.payload || null;
    const groupName = req.body?.groupName || process.env.WHATSAPP_GROUP_NAME || '';
    if (!approvalId) {
      return res.status(400).json({ message: 'approvalId is required' });
    }
    const result = await sendApprovalNotification({ approvalId, payload, groupName });
    res.json({ message: 'Approval notification sent', result });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to send approval notification' });
  }
});

app.post('/api/whatsapp/send-test', requireApiKey, async (req, res) => {
  try {
    const groupName = req.body?.groupName || process.env.WHATSAPP_GROUP_NAME || '';
    const result = await sendTestMessage({ groupName });
    res.json({ message: 'Test message sent', result });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to send test message' });
  }
});

app.post('/api/whatsapp/send-test-image', requireApiKey, async (req, res) => {
  try {
    const groupName = req.body?.groupName || process.env.WHATSAPP_GROUP_NAME || '';
    const result = await sendTestImageMessage({ groupName });
    res.json({ message: 'Test image sent', result });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to send test image' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`[Worker] WhatsApp worker listening on http://0.0.0.0:${PORT}`);
  if (String(process.env.WHATSAPP_GROUP_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true') {
    launchClientInBackground({ headless: true });
  }
  await pushWorkerState();
  setInterval(() => {
    pollNextJob().catch((error) => {
      console.error('[Worker] Poll loop error:', error.message);
    });
  }, 5000);
  setInterval(() => {
    pushWorkerState().catch((error) => {
      console.error('[Worker] State loop error:', error.message);
    });
  }, 10000);
});
