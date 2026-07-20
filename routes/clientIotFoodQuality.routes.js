const express = require('express');
const { auth } = require('../middleware/auth');
const { getNotificationIo } = require('../utils/notificationHub');
const {
  normalizeReading,
  pushReading,
  getHistory,
  findAnyHistory,
  buildDemoReading,
  getCurrent,
  getSnapshotBuffer,
  buildSnapshotSvg,
  getStreamConfig,
  buildDevicePayload,
  getStats,
} = require('../services/foodQualityLive.service');

const router = express.Router();

function resolveDeviceKey(req) {
  return req.headers['x-device-key'] || req.query.deviceKey || req.body?.deviceKey || 'anonymous';
}

router.post('/food-quality/reading', (req, res) => {
  try {
    const deviceKey = resolveDeviceKey(req);
    const reading = normalizeReading(req.body);
    const snapshotBase64 = req.body?.snapshotBase64 || req.body?.snapshot;
    pushReading(deviceKey, reading, snapshotBase64);

    const io = getNotificationIo();
    if (io) {
      io.emit('iot:food-quality:reading', { reading, deviceKey });
      io.emit('food-quality:reading', { reading, deviceKey });
    }

    res.status(201).json({ ok: true, reading, mode: 'live', deviceKey });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid reading' });
  }
});

router.get('/food-quality/stats', auth, (req, res) => {
  res.json(getStats());
});

router.get('/food-quality/stream', auth, (req, res) => {
  const deviceKey = resolveDeviceKey(req);
  res.json({ mode: 'live', ...getStreamConfig(deviceKey) });
});

router.get('/food-quality/snapshot', auth, (req, res) => {
  const deviceKey = resolveDeviceKey(req);
  const stored = getSnapshotBuffer(deviceKey);
  if (stored?.data) {
    res.set('Content-Type', stored.mime || 'image/jpeg');
    res.set('Cache-Control', 'no-store');
    return res.send(stored.data);
  }

  const current = getCurrent(deviceKey);
  const svg = buildSnapshotSvg(current);
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-store');
  return res.send(svg);
});

router.get('/food-quality', auth, (req, res) => {
  try {
    let deviceKey = resolveDeviceKey(req);
    let history = getHistory(deviceKey);
    let mode = 'live';

    if (!history.length) {
      const any = findAnyHistory();
      if (any) {
        deviceKey = any.deviceKey;
        history = any.history;
      }
    }

    if (!history.length) {
      const demo = buildDemoReading();
      history = [demo];
      deviceKey = 'demo';
      mode = 'demo';
    }

    const current = history[0];
    res.json({
      mode,
      current,
      history,
      stream: getStreamConfig(deviceKey),
      device: buildDevicePayload(deviceKey, current),
    });
  } catch (err) {
    console.error('[food-quality]', err);
    res.status(500).json({ error: err.message || 'food-quality failed' });
  }
});

module.exports = router;
