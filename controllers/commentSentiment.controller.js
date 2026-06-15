const { analyzeCommentText } = require('../services/commentSentiment.service');
const { getCommentSentimentAnalytics } = require('../services/commentSentimentAnalytics.service');

const handleError = (res, error, code = 500) => {
  console.error('Comment sentiment error:', error);
  res.status(error.status || code).json({ error: error.message || 'Erreur analyse sentiments' });
};

const postAnalyzeComment = async (req, res) => {
  try {
    const { text, comment, rating, emotion, serviceType } = req.body || {};
    const merged = text || comment || '';
    if (!merged.trim()) {
      return res.status(400).json({ error: 'Commentaire requis' });
    }
    const analysis = analyzeCommentText(merged, { emotion });
    res.json({
      ok: true,
      serviceType: serviceType || null,
      rating: rating != null ? Number(rating) : null,
      analysis,
    });
  } catch (error) {
    handleError(res, error, 400);
  }
};

const getMyCommentSentiments = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const data = await getCommentSentimentAnalytics({ userId });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

const getAdminCommentSentiments = async (req, res) => {
  try {
    const data = await getCommentSentimentAnalytics({ limit: 120 });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  postAnalyzeComment,
  getMyCommentSentiments,
  getAdminCommentSentiments,
};
