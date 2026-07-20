const {
  scanString,
  scanPayload,
  scanFileMeta,
  signatureCount,
} = require('../services/securityScan.service');
const threatLog = require('../services/threatLog.service');
const {
  listIntrusionEvents,
  getIdsStatus,
} = require('../services/intrusionDetection.service');
const { listSessions, revokeSession } = require('../services/sessionRegistry.service');
const { buildPlatformSecurityPack } = require('../services/platformSecurity.service');

const shouldBlock = () => process.env.BLOCK_THREATS !== 'false';

const scanText = async (req, res) => {
  try {
    const { text, context = {} } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Text required' });
    }

    const result = scanString(String(text));
    if (!result.safe) {
      threatLog.recordThreats({
        threats: result.threats,
        source: context.source || 'api_scan_text',
        userId: req.user?.id || req.user?._id || null,
        ip: req.ip,
        blocked: false,
        context,
      });
    }

    res.json({
      ...result,
      engine: 'PetfoodTN Threat Scanner',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const scanPayloadHandler = async (req, res) => {
  try {
    const { payload, context = {} } = req.body || {};
    if (payload === undefined || payload === null) {
      return res.status(400).json({ error: 'Payload required' });
    }

    const result = scanPayload(payload);
    if (!result.safe) {
      threatLog.recordThreats({
        threats: result.threats,
        source: context.source || 'api_scan_payload',
        userId: req.user?.id || req.user?._id || null,
        ip: req.ip,
        blocked: false,
        context,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const scanFile = async (req, res) => {
  try {
    const { filename, mimeType, contentBase64, context = {} } = req.body || {};
    const result = scanFileMeta({ filename, mimeType, contentBase64 });

    if (!result.safe) {
      threatLog.recordThreats({
        threats: result.threats,
        source: context.source || 'api_scan_file',
        userId: req.user?.id || req.user?._id || null,
        ip: req.ip,
        blocked: shouldBlock(),
        context,
      });
    }

    if (!result.safe && shouldBlock()) {
      return res.status(422).json({
        error: 'Fichier potentiellement dangereux détecté',
        ...result,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getThreats = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = threatLog.listThreats(limit);
    res.json({
      items,
      threats: items,
      status: threatLog.getStatus(signatureCount),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getStatus = async (_req, res) => {
  try {
    const antivirus = threatLog.getStatus(signatureCount);
    const ids = getIdsStatus();
    res.json({
      ...antivirus,
      ids,
      protection: {
        antivirus: antivirus.blockingEnabled,
        ids: ids.enabled,
        idsBlocking: ids.blockingEnabled,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getIntrusionEvents = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = listIntrusionEvents(limit);
    res.json({
      items,
      events: items,
      status: getIdsStatus(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSessions = async (req, res) => {
  try {
    const sessions = listSessions({
      userId: req.user.id || req.user._id,
      adminView: true,
      currentJti: req.user.jti || null,
    });
    res.json({ sessions, count: sessions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const revokeSessionHandler = async (req, res) => {
  try {
    const result = revokeSession(req.params.id, {
      requesterId: req.user.id || req.user._id,
      isAdmin: req.user.role === 'admin',
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const getPlatformPack = async (req, res) => {
  try {
    const pack = await buildPlatformSecurityPack(req);
    res.json(pack);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  scanText,
  scanPayloadHandler,
  scanFile,
  getThreats,
  getStatus,
  getIntrusionEvents,
  getSessions,
  revokeSessionHandler,
  getPlatformPack,
};
