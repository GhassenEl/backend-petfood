const { prisma } = require('../prismaClient');
const { analyzeCommentText, emotionToSentiment } = require('./commentSentiment.service');
const { serviceMeta } = require('../utils/ownerEmotionConstants');

const SERVICE_LABELS = {
  grooming: 'Toilettage',
  bathing: 'Bain',
  nail_trim: 'Griffes',
  dental_cleaning: 'Dentaire',
  wellness_pack: 'Forfait bien-être',
  home_sitting: 'Garde domicile',
  boarding: 'Pension',
  training: 'Dressage',
  delivery: 'Livraison',
  veterinary: 'Vétérinaire',
  rehabilitation: 'Réhabilitation',
  daycare: 'Garderie',
};

const mapReviewEntry = (row) => ({
  id: row.id,
  source: 'product',
  sourceLabel: row.product?.name || 'Produit',
  type: 'products',
  rating: row.rating,
  comment: row.comment,
  emotion: row.emotion,
  sentiment: row.sentiment,
  sentimentScore: row.sentimentScore,
  userName: row.user?.name,
  createdAt: row.createdAt,
});

const mapServiceEntry = (row) => ({
  id: row.id,
  source: 'service',
  sourceLabel: SERVICE_LABELS[row.type] || serviceMeta(row.type).label,
  type: row.type,
  rating: row.rating,
  comment: row.comment,
  emotion: row.emotion,
  sentiment: row.sentiment,
  sentimentScore: row.sentimentScore,
  userName: row.user?.name,
  createdAt: row.createdAt,
});

const mapComplaintEntry = (row) => ({
  id: row.id,
  source: 'complaint',
  sourceLabel: row.subject || 'Réclamation',
  type: 'complaint',
  rating: null,
  comment: row.message,
  emotion: null,
  sentiment: null,
  sentimentScore: null,
  userName: row.name || row.user?.name,
  createdAt: row.createdAt,
});

const enrichWithAnalysis = (entry) => {
  const analysis = analyzeCommentText(entry.comment, { emotion: entry.emotion });
  return {
    ...entry,
    text: String(entry.comment || '').slice(0, 400),
    sentiment: entry.sentiment || analysis.sentiment,
    emotion: entry.emotion || analysis.emotion,
    emotionLabel: analysis.emotionLabel,
    emotionEmoji: analysis.emotionEmoji,
    confidence: entry.sentimentScore ?? analysis.confidence,
    keywords: analysis.keywords,
    topTerms: analysis.topTerms,
    modelId: analysis.modelId,
    modelLabel: analysis.modelLabel,
    insight: analysis.insight,
    anomaly: analysis.anomaly,
    polarityScore: analysis.polarityScore,
  };
};

const aggregateKeywords = (items) => {
  const pos = {};
  const neg = {};
  items.forEach((item) => {
    (item.keywords?.positive || []).forEach((w) => { pos[w] = (pos[w] || 0) + 1; });
    (item.keywords?.negative || []).forEach((w) => { neg[w] = (neg[w] || 0) + 1; });
  });
  const top = (map) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word, count]) => ({ word, count }));
  return { positive: top(pos), negative: top(neg) };
};

const buildAnalytics = (analyzed) => {
  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  const emotionCounts = {};
  const bySource = { product: 0, service: 0, complaint: 0 };

  analyzed.forEach((row) => {
    const s = row.sentiment || 'neutral';
    sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
    emotionCounts[row.emotion] = (emotionCounts[row.emotion] || 0) + 1;
    bySource[row.source] = (bySource[row.source] || 0) + 1;
  });

  const total = analyzed.length;
  const withText = analyzed.filter((r) => r.text?.trim()).length;
  const positiveRate = total ? Number(((sentimentCounts.positive || 0) / total).toFixed(3)) : 0;
  const negativeRate = total ? Number(((sentimentCounts.negative || 0) / total).toFixed(3)) : 0;

  return {
    total,
    withComments: withText,
    sentimentCounts,
    emotionCounts,
    positiveRate,
    negativeRate,
    bySource,
    keywordsCloud: aggregateKeywords(analyzed),
    moodLabel:
      positiveRate >= 0.6 ? 'Très positif' : positiveRate >= 0.4 ? 'Équilibré' : negativeRate >= 0.4 ? 'À surveiller' : 'Neutre',
  };
};

const getCommentSentimentAnalytics = async ({ userId = null, limit = 80 } = {}) => {
  const userFilter = userId ? { userId } : {};

  const [reviews, serviceRatings, complaints] = await Promise.all([
    prisma.review.findMany({
      where: userFilter,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { name: true } },
        product: { select: { name: true } },
      },
    }),
    prisma.serviceRating.findMany({
      where: userFilter,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true } } },
    }),
    prisma.complaint.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 40),
      include: { user: { select: { name: true } } },
    }),
  ]);

  const entries = [
    ...reviews.map(mapReviewEntry),
    ...serviceRatings.filter((r) => r.comment?.trim()).map(mapServiceEntry),
    ...complaints.map(mapComplaintEntry),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const analyzed = entries.map(enrichWithAnalysis);
  const summary = buildAnalytics(analyzed);

  return {
    agent: 'comment_sentiment_analysis',
    ...summary,
    recent: analyzed.slice(0, 25),
    alerts: analyzed
      .filter((r) => r.sentiment === 'negative' || r.anomaly?.severity === 'high')
      .slice(0, 8),
  };
};

const persistReviewSentiment = async (reviewId, analysis) => {
  try {
    await prisma.review.update({
      where: { id: reviewId },
      data: {
        sentiment: analysis.sentiment,
        sentimentScore: analysis.confidence,
        emotion: analysis.emotion,
      },
    });
  } catch {
    /* non bloquant */
  }
};

const persistServiceRatingSentiment = async (ratingId, analysis) => {
  try {
    await prisma.serviceRating.update({
      where: { id: ratingId },
      data: {
        sentiment: analysis.sentiment,
        sentimentScore: analysis.confidence,
        emotion: analysis.emotion,
      },
    });
  } catch {
    /* non bloquant */
  }
};

module.exports = {
  getCommentSentimentAnalytics,
  persistReviewSentiment,
  persistServiceRatingSentiment,
  emotionToSentiment,
};
