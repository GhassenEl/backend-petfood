const { getPlatformLiveSnapshot } = require('../services/platformLive.service');

let ioRef = null;
let timer = null;

const broadcastPulse = async (reason = 'interval') => {
  if (!ioRef) return null;
  try {
    const snapshot = await getPlatformLiveSnapshot();
    const payload = { ...snapshot, reason };
    ioRef.emit('platform:pulse', payload);
    return payload;
  } catch (err) {
    console.warn('platform:pulse error:', err?.message || err);
    return null;
  }
};

const startPlatformPulse = (io, intervalMs = 12000) => {
  ioRef = io;
  if (timer) clearInterval(timer);
  broadcastPulse('startup');
  timer = setInterval(() => broadcastPulse('interval'), intervalMs);
};

const emitPlatformPulse = (reason = 'mutation') => broadcastPulse(reason);

const stopPlatformPulse = () => {
  if (timer) clearInterval(timer);
  timer = null;
  ioRef = null;
};

module.exports = { startPlatformPulse, emitPlatformPulse, stopPlatformPulse, broadcastPulse };
