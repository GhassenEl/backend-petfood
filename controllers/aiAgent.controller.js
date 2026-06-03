const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const {
  getPersonalizedRecommendations,
  getTopProductsReport,
  getClientInsightsOnly,
} = require('../services/aiRecommendationAgent.service');
const { getHealthRecommendations } = require('../services/healthRecommendations.service');
const { getSalesForecast } = require('../services/salesForecast.service');
const { runMlBenchmark, runFullMlReport } = require('../services/mlBenchmark.service');

const getDemoUser = (req) => demoStore.getUserById(req.user.id || req.user._id) || req.user;

const handleError = (res, error, code = 500) => {
  console.error('AI agent error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur agent IA' });
};

const getInsights = async (req, res) => {
  try {
    const user = isDemoMode() ? getDemoUser(req) : req.user;
    const result = await getClientInsightsOnly(user);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getRecommendations = async (req, res) => {
  try {
    const user = isDemoMode() ? getDemoUser(req) : req.user;
    const petId = req.query.petId || null;
    const limit = Math.min(Number(req.query.limit) || 8, 16);
    const result = await getPersonalizedRecommendations(user, { petId, limit });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getTopProducts = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    const days = req.query.days ? Number(req.query.days) : null;
    const result = await getTopProductsReport({ limit, days });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getHealthRecommendationsHandler = async (req, res) => {
  try {
    const petType = req.query.petType || 'dog';
    const result = await getHealthRecommendations(petType);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getSalesForecastHandler = async (req, res) => {
  try {
    const months = req.query.months ? Number(req.query.months) : 12;
    const horizon = req.query.horizon ? Number(req.query.horizon) : 3;
    const result = await getSalesForecast({ monthsBack: months, horizon });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getMlBenchmarkHandler = async (req, res) => {
  try {
    const months = req.query.months ? Number(req.query.months) : 12;
    const synthetic = req.query.synthetic === '1' || req.query.synthetic === 'true';
    const full = req.query.full === '1' || req.query.full === 'true';

    if (full) {
      const report = await runFullMlReport({
        monthsBack: months,
        horizon: req.query.horizon ? Number(req.query.horizon) : 3,
        useSynthetic: synthetic,
      });
      return res.json(report);
    }

    const result = await runMlBenchmark({ monthsBack: months, useSynthetic: synthetic });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getInsights,
  getRecommendations,
  getTopProducts,
  getHealthRecommendationsHandler,
  getSalesForecastHandler,
  getMlBenchmarkHandler,
};
