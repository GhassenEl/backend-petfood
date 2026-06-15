const { getPlatformLiveSnapshot } = require('../services/platformLive.service');
const { getPlatformPerformance } = require('../services/platformPerformance.service');

exports.getLive = async (req, res) => {
  try {
    const snapshot = await getPlatformLiveSnapshot();
    res.json({
      ...snapshot,
      role: req.user?.role || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur plateforme live' });
  }
};

exports.getPerformance = async (req, res) => {
  try {
    const metrics = await getPlatformPerformance();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur métriques performance' });
  }
};
