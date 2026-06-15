const {
  analyzeRequest,
  recordIntrusion,
} = require('../services/intrusionDetection.service');

const shouldBlock = () => process.env.BLOCK_INTRUSIONS === 'true';
const isEnabled = () => process.env.IDS_ENABLED !== 'false';

const intrusionDetectionMiddleware = (req, res, next) => {
  if (!isEnabled()) return next();

  try {
    const { ip, alerts } = analyzeRequest(req);
    if (!alerts.length) return next();

    const blocked = shouldBlock() && alerts.some((a) =>
      ['critical', 'high'].includes(a.severity) ||
      a.type === 'rate_limit' ||
      a.type === 'brute_force'
    );

    recordIntrusion({
      alerts,
      ip,
      userId: req.user?.id || req.user?._id || null,
      path: req.path,
      method: req.method,
      blocked,
    });

    if (blocked) {
      return res.status(403).json({
        error: 'Activité suspecte détectée — accès bloqué par le système IDS',
        code: 'INTRUSION_DETECTED',
      });
    }
  } catch (err) {
    console.warn('IDS middleware error:', err?.message || err);
  }

  return next();
};

module.exports = { intrusionDetectionMiddleware };
