const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const {
  getPersonalizedRecommendations,
  getTopProductsReport,
  getClientInsightsOnly,
} = require('../services/aiRecommendationAgent.service');
const { getHealthRecommendations } = require('../services/healthRecommendations.service');
const { getSalesForecast } = require('../services/salesForecast.service');
const { getReviewBasedRecommendations } = require('../services/reviewRecommendation.service');
const { getVisitorIntelligence } = require('../services/visitorAi.service');

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

const getPublicRecommendations = async (req, res) => {
  try {
    const query = req.query.q || req.query.query || '';
    const animalType = req.query.animalType || req.query.petType || null;
    const category = req.query.category || null;
    const limit = Math.min(Number(req.query.limit) || 8, 16);
    const recommendations = await getReviewBasedRecommendations({
      query,
      animalType,
      category,
      limit,
    });
    res.json({
      recommendations,
      summary:
        recommendations.length > 0
          ? `${recommendations.length} produit(s) classés par notes 1–5, volume d'avis et pertinence NLP.`
          : 'Aucune recommandation — élargissez votre recherche.',
      engine: 'review_nlp_v1',
    });
  } catch (error) {
    handleError(res, error);
  }
};

const getVisitorIntelligenceHandler = async (req, res) => {
  try {
    const browsedRaw = req.query.browsedIds || req.query.browsedProductIds || '';
    const browsedProductIds = String(browsedRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await getVisitorIntelligence({
      query: req.query.q || req.query.query || '',
      petType: req.query.petType || req.query.animalType || null,
      breed: req.query.breed || null,
      ageYears: req.query.ageYears ? Number(req.query.ageYears) : null,
      weightKg: req.query.weightKg ? Number(req.query.weightKg) : null,
      browsedProductIds,
      category: req.query.category || null,
      limit: Math.min(Number(req.query.limit) || 8, 16),
    });
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
  getPublicRecommendations,
  getVisitorIntelligenceHandler,
  getTopProducts,
  getHealthRecommendationsHandler,
  getSalesForecastHandler,
  getMlBenchmarkHandler,
};
