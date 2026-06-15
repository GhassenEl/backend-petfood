const { scanPayload } = require('../services/securityScan.service');
const threatLog = require('../services/threatLog.service');

const shouldBlock = () => process.env.BLOCK_THREATS !== 'false';

const threatScanMiddleware = (options = {}) => {
  const source = options.source || 'middleware';

  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    const result = scanPayload(req.body);
    if (result.safe) {
      return next();
    }

    threatLog.recordThreats({
      threats: result.threats,
      source,
      userId: req.user?.id || req.user?._id || null,
      ip: req.ip,
      blocked: shouldBlock(),
      context: { path: req.path, method: req.method },
    });

    if (shouldBlock()) {
      return res.status(422).json({
        error: 'Contenu potentiellement dangereux détecté par le scan de sécurité',
        code: 'THREAT_DETECTED',
        threats: result.threats,
      });
    }

    return next();
  };
};

module.exports = { threatScanMiddleware };
