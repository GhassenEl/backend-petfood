const { getPlatformLiveSnapshot } = require('../services/platformLive.service');
const { getPlatformPerformance } = require('../services/platformPerformance.service');
const { getPublicStackHealth, getDevOpsStatus } = require('../services/devopsStatus.service');

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

exports.getStackHealth = async (req, res) => {
  try {
    const health = await getPublicStackHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur santé stack' });
  }
};

exports.getDevOpsStatus = async (req, res) => {
  try {
    const status = await getDevOpsStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur statut DevOps' });
  }
};

exports.getLiveMetrics = async (req, res) => {
  try {
    const { getLiveMetricsTimeseries } = require('../services/prometheusQuery.service');
    const rangeMinutes = Math.min(120, Math.max(5, Number(req.query.rangeMinutes) || 30));
    const data = await getLiveMetricsTimeseries({ rangeMinutes });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erreur métriques live' });
  }
};
