const { prisma } = require('../prismaClient');
const { analyzeTextFull } = require('./nlpTextAnalysis.service');
const { normalizeProductRecord } = require('../utils/productNormalize');
const { enrichProduct } = require('../utils/productDetailsCatalog');

const termOverlap = (query, corpus) => {
  const q = String(query || '').toLowerCase().trim();
  const c = String(corpus || '').toLowerCase();
  if (!q || !c) return 0;

  const nlp = analyzeTextFull(q);
  const terms = [
    ...(nlp.words?.topTerms || []).map((t) => t.word),
    ...q.split(/\s+/).filter((w) => w.length > 3),
  ];
  const unique = [...new Set(terms)];
  if (!unique.length) return 0;

  let hits = 0;
  for (const term of unique) {
    if (c.includes(term)) hits += 1;
  }
  return Math.min(1, hits / Math.max(3, unique.length));
};

const ratingComponent = (avg, count) => {
  const stars = Math.max(0, Math.min(5, Number(avg) || 0));
  const normalized = stars / 5;
  const volume = Math.min(Math.log10(1 + Number(count) || 0) / 2.5, 0.22);
  return normalized * 0.72 + volume;
};

const reviewSentimentBoost = (reviews) => {
  if (!reviews?.length) return 0;
  const positive = reviews.filter((r) => r.rating >= 4).length;
  const negative = reviews.filter((r) => r.rating <= 2).length;
  const ratio = (positive - negative * 0.5) / reviews.length;
  return Math.max(0, Math.min(0.15, ratio * 0.2));
};

const mapRow = (row) => {
  const p = row.product;
  const reviews = p.reviews || [];
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : Number(p.rating_avg) || 0;
  const count = reviews.length || Number(p.rating_count) || 0;
  const corpus = [
    p.name,
    p.description,
    ...reviews.map((r) => `${r.comment} ${r.rating}etoiles`),
  ]
    .filter(Boolean)
    .join(' ');

  let score = ratingComponent(avg, count);
  score += termOverlap(row.query, corpus) * 0.38;
  score += reviewSentimentBoost(reviews);

  if (row.animalType && p.animalType && p.animalType !== row.animalType && p.animalType !== 'other') {
    score *= 0.35;
  }
  if (row.category && p.category && p.category !== row.category) {
    score *= 0.6;
  }
  if (avg < 2.5 && count >= 2) score *= 0.4;
  if (Number(p.stock) <= 0) score *= 0.25;

  const topReview = reviews
    .filter((r) => r.rating >= 4 && r.comment?.trim())
    .sort((a, b) => b.rating - a.rating)[0];

  const stars = `${avg.toFixed(1)}/5`;
  const reason = topReview
    ? `⭐ ${stars} (${count} avis) — « ${String(topReview.comment).slice(0, 72)}${topReview.comment.length > 72 ? '…' : ''} »`
    : p.description
      ? `⭐ ${stars} — ${String(p.description).slice(0, 80)}${p.description.length > 80 ? '…' : ''}`
      : `⭐ ${stars} (${count} avis)`;

  return {
    score,
    reason,
    avg,
    count,
    product: enrichProduct(normalizeProductRecord(p)),
  };
};

/**
 * Recommandations produits basées sur notes 1–5, volume d'avis et similarité NLP
 * entre la requête et les descriptions + commentaires clients.
 */
async function getReviewBasedRecommendations({
  query = '',
  animalType = null,
  category = null,
  limit = 8,
} = {}) {
  const products = await prisma.product.findMany({
    include: {
      reviews: {
        select: { rating: true, comment: true, sentimentScore: true },
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
    },
    orderBy: [{ rating_avg: 'desc' }, { rating_count: 'desc' }],
    take: 120,
  });

  const rows = products.map((product) =>
    mapRow({ product, query, animalType, category }),
  );

  return rows
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      ...r.product,
      score: Math.round(r.score * 1000) / 1000,
      reason: r.reason,
      recommendedReason: r.reason,
      reviewAvg: r.avg,
      reviewCount: r.count,
      icon: r.product.icon || r.product.imageUrl || '🛒',
    }));
}

module.exports = { getReviewBasedRecommendations, ratingComponent, termOverlap };
