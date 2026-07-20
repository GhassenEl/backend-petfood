const {
  getHybridRecommendations,
  getAdminClientRecommendations,
  explainSalesTraffic,
  searchByReviews,
} = require('../services/hybridRecommendationMl.service');

const handleError = (res, error, code = 500) => {
  console.error('Hybrid recommendation error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur recommandation' });
};

const getHybridHandler = async (req, res) => {
  try {
    const role = req.query.role || req.user.role;
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    const query = req.query.q || req.query.query || null;
    const minRating = req.query.minRating != null ? Number(req.query.minRating) : null;
    const petId = req.query.petId || null;
    const result = await getHybridRecommendations(req.user, { role, limit, query, minRating, petId });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getAdminClientHandler = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 12, 24);
    const result = await getAdminClientRecommendations(req.params.userId, { limit });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getExplainSalesHandler = async (req, res) => {
  try {
    const result = await explainSalesTraffic();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

const getSearchReviewsHandler = async (req, res) => {
  try {
    const result = await searchByReviews({
      query: req.query.q || req.query.query,
      minRating: req.query.minRating,
      limit: Math.min(Number(req.query.limit) || 12, 30),
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getHybridHandler,
  getAdminClientHandler,
  getExplainSalesHandler,
  getSearchReviewsHandler,
};
