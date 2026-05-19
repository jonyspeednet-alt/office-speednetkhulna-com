const {
  claimNextJob,
  markJobCompleted,
  markJobFailed,
  updateWorkerState
} = require('../utilities/whatsappWorkerQueue');

const requireWorkerApiKey = (req, res, next) => {
  const expected = String(process.env.WHATSAPP_WORKER_API_KEY || '').trim();
  if (!expected) {
    return res.status(503).json({ message: 'Worker API key is not configured' });
  }
  const provided = String(req.headers['x-worker-api-key'] || '').trim();
  if (provided !== expected) {
    return res.status(401).json({ message: 'Unauthorized worker request' });
  }
  return next();
};

const getNextWorkerJob = async (req, res) => {
  try {
    const workerName = String(req.query.worker || req.body?.worker || 'remote_worker').trim();
    const job = await claimNextJob(workerName);
    return res.json({ job });
  } catch (error) {
    console.error('[WhatsAppWorker] next job failed:', error);
    return res.status(500).json({ message: 'Failed to claim worker job' });
  }
};

const completeWorkerJob = async (req, res) => {
  try {
    await markJobCompleted(Number(req.params.id));
    return res.json({ success: true });
  } catch (error) {
    console.error('[WhatsAppWorker] complete job failed:', error);
    return res.status(500).json({ message: 'Failed to complete worker job' });
  }
};

const failWorkerJob = async (req, res) => {
  try {
    await markJobFailed(Number(req.params.id), req.body?.error || 'Worker job failed', Boolean(req.body?.retry));
    return res.json({ success: true });
  } catch (error) {
    console.error('[WhatsAppWorker] fail job failed:', error);
    return res.status(500).json({ message: 'Failed to update worker job' });
  }
};

const syncWorkerState = async (req, res) => {
  try {
    const state = await updateWorkerState(req.body || {});
    return res.json({ success: true, state });
  } catch (error) {
    console.error('[WhatsAppWorker] state sync failed:', error);
    return res.status(500).json({ message: 'Failed to sync worker state' });
  }
};

module.exports = {
  requireWorkerApiKey,
  getNextWorkerJob,
  completeWorkerJob,
  failWorkerJob,
  syncWorkerState
};
