const {
  ensureClient,
  reconnectClient,
  closeClient,
  getStatus,
  getLatestQr,
  sendTestNotification,
  sendTestImageNotification
} = require('../services/whatsappNotificationService');

const getWhatsAppStatus = async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (error) {
    console.error('[WhatsApp] Status fetch failed:', error);
    res.status(500).json({ message: 'Failed to load WhatsApp status' });
  }
};

const getWhatsAppQr = async (req, res) => {
  try {
    const qr = await getLatestQr();
    res.json(qr);
  } catch (error) {
    console.error('[WhatsApp] QR fetch failed:', error);
    res.status(500).json({ message: 'Failed to load WhatsApp QR' });
  }
};

const reconnectWhatsApp = async (req, res) => {
  try {
    await reconnectClient({ headless: true });
    res.json({
      message: 'WhatsApp reconnect started',
      status: await getStatus()
    });
  } catch (error) {
    console.error('[WhatsApp] Reconnect failed:', error);
    res.status(500).json({ message: error.message || 'Failed to reconnect WhatsApp' });
  }
};

const stopWhatsApp = async (req, res) => {
  try {
    await closeClient();
    res.json({ message: 'WhatsApp client stopped', status: await getStatus() });
  } catch (error) {
    console.error('[WhatsApp] Stop failed:', error);
    res.status(500).json({ message: error.message || 'Failed to stop WhatsApp client' });
  }
};

const startWhatsApp = async (req, res) => {
  try {
    await ensureClient({ headless: true });
    res.json({
      message: 'WhatsApp connect started',
      status: await getStatus()
    });
  } catch (error) {
    console.error('[WhatsApp] Start failed:', error);
    res.status(500).json({ message: error.message || 'Failed to start WhatsApp client' });
  }
};

const sendWhatsAppTest = async (req, res) => {
  try {
    const result = await sendTestNotification();
    res.json({
      message: result?.queued ? 'WhatsApp test message queued' : 'WhatsApp test message sent',
      result,
      status: await getStatus()
    });
  } catch (error) {
    console.error('[WhatsApp] Test send failed:', error);
    res.status(500).json({ message: error.message || 'Failed to send WhatsApp test message' });
  }
};

const sendWhatsAppTestImage = async (req, res) => {
  try {
    const result = await sendTestImageNotification();
    res.json({
      message: result?.queued ? 'WhatsApp test image queued' : 'WhatsApp test image sent',
      result,
      status: await getStatus()
    });
  } catch (error) {
    console.error('[WhatsApp] Test image send failed:', error);
    res.status(500).json({ message: error.message || 'Failed to send WhatsApp test image' });
  }
};

module.exports = {
  getWhatsAppStatus,
  getWhatsAppQr,
  reconnectWhatsApp,
  stopWhatsApp,
  startWhatsApp,
  sendWhatsAppTest,
  sendWhatsAppTestImage
};
