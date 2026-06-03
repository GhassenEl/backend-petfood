const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const {
  analyzeOwnerEmotionText,
  getOwnerEmotionDashboard,
} = require('../services/ownerEmotionAnalysis.service');

const handleError = (res, error, fallback = 500) => {
  res.status(error.status || fallback).json({ error: error.message });
};

const getDashboard = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (isDemoMode()) {
      return res.json(demoStore.getOwnerEmotionDashboard(req.user));
    }
    const dashboard = await getOwnerEmotionDashboard(userId);
    res.json(dashboard);
  } catch (error) {
    handleError(res, error);
  }
};

const postAnalyze = async (req, res) => {
  try {
    const { text, comment, serviceType, rating } = req.body || {};
    const merged = text || comment || '';
    if (!merged.trim()) {
      return res.status(400).json({ error: 'Texte requis pour l’analyse' });
    }
    const result = await analyzeOwnerEmotionText({
      text: merged,
      serviceType: serviceType || 'grooming',
      rating,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 400);
  }
};

module.exports = {
  getDashboard,
  postAnalyze,
};
