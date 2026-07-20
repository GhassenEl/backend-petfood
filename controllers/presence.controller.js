const presenceService = require('../services/presence.service');

const postHeartbeat = async (req, res) => {
  try {
    const { sessionId, userId, role, name, region, path } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId requis' });
    }
    presenceService.registerFromHttp({
      sessionId,
      userId: userId || null,
      role: role || 'visitor',
      name: name || 'Visiteur',
      region: region || 'Non assignée',
      path: path || '/',
    });
    res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Heartbeat impossible' });
  }
};

const getAdminLive = async (_req, res) => {
  try {
    const pack = await presenceService.getAdminLivePack();
    res.json(pack);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Données indisponibles' });
  }
};

module.exports = {
  postHeartbeat,
  getAdminLive,
};
