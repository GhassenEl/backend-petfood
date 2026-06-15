const { prisma } = require('../prismaClient');
const { getReviewBasedRecommendations } = require('./reviewRecommendation.service');
const { analyzeTextFull } = require('./nlpTextAnalysis.service');

const petProfileBoost = (product, profile) => {
  let boost = 0;
  const reasons = [];

  if (profile.petType && product.animalType === profile.petType) {
    boost += 0.22;
    reasons.push(`Adapté à votre ${profile.petType}`);
  }

  const age = Number(profile.ageYears);
  if (Number.isFinite(age)) {
    const name = String(product.name || '').toLowerCase();
    const desc = String(product.description || '').toLowerCase();
    const hay = `${name} ${desc} ${product.category || ''}`;
    if (age < 1 && /chiot|chaton|junior|puppy|kitten/.test(hay)) {
      boost += 0.12;
      reasons.push('Formule jeune animal');
    } else if (age >= 7 && /senior|âgé|age|mature/.test(hay)) {
      boost += 0.12;
      reasons.push('Formule senior');
    }
  }

  if (profile.breed) {
    const breed = String(profile.breed).toLowerCase();
    const tags = Array.isArray(product.tags) ? product.tags.join(' ') : String(product.tags || '');
    if (tags.toLowerCase().includes(breed) || String(product.name).toLowerCase().includes(breed)) {
      boost += 0.08;
      reasons.push(`Race ${profile.breed}`);
    }
  }

  const weight = Number(profile.weightKg);
  if (Number.isFinite(weight) && weight > 25 && product.animalType === 'dog') {
    if (/12\s*kg|15\s*kg|grand|large|maxi/.test(String(product.name).toLowerCase())) {
      boost += 0.06;
      reasons.push('Format adapté grand chien');
    }
  }

  return { boost, reasons };
};

const browseHistoryBoost = (product, browsedIds = []) => {
  const id = product.id || product._id;
  if (!browsedIds.includes(id)) return { boost: 0, reasons: [] };
  return { boost: 0.15, reasons: ['Consulté récemment'] };
};

const satisfactionScore = (product) => {
  const avg = Number(product.reviewAvg ?? product.rating_avg ?? 0);
  const count = Number(product.reviewCount ?? product.rating_count ?? 0);
  const stars = Math.max(0, Math.min(5, avg)) / 5;
  const volume = Math.min(Math.log10(1 + count) / 2, 0.2);
  return Math.round((stars * 0.75 + volume) * 100);
};

const relevanceScore = (product, profileBoost, browseBoost) => {
  const base = Number(product.score ?? 0.5);
  const total = Math.min(1, base + profileBoost + browseBoost);
  return Math.round(total * 100);
};

const computeSentimentTrends = async () => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const reviews = await prisma.review.findMany({
    where: { createdAt: { gte: since } },
    select: { rating: true, comment: true, createdAt: true, product: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  }).then((rows) => rows.filter((r) => String(r.comment || '').trim()));

  let positive = 0;
  let negative = 0;
  let neutral = 0;
  const samples = { positive: [], negative: [] };

  reviews.forEach((r) => {
    const nlp = analyzeTextFull(r.comment || '');
    const pos = nlp.words?.keywords?.positive?.length || 0;
    const neg = nlp.words?.keywords?.negative?.length || 0;
    const label = r.rating >= 4 ? 'positive' : r.rating <= 2 ? 'negative' : 'neutral';
    const textLabel = nlp.sentiment?.label === 'positive' || pos > neg
      ? 'positive'
      : nlp.sentiment?.label === 'negative' || neg > pos
        ? 'negative'
        : label;

    if (textLabel === 'positive') {
      positive += 1;
      if (samples.positive.length < 3) {
        samples.positive.push({ product: r.product?.name, excerpt: String(r.comment).slice(0, 80), rating: r.rating });
      }
    } else if (textLabel === 'negative') {
      negative += 1;
      if (samples.negative.length < 3) {
        samples.negative.push({ product: r.product?.name, excerpt: String(r.comment).slice(0, 80), rating: r.rating });
      }
    } else {
      neutral += 1;
    }
  });

  const total = Math.max(1, reviews.length);
  const positivePct = Math.round((positive / total) * 100);
  const negativePct = Math.round((negative / total) * 100);

  const mid = Math.floor(reviews.length / 2);
  const recent = reviews.slice(0, mid);
  const older = reviews.slice(mid);
  const recentPos = recent.filter((r) => r.rating >= 4).length / Math.max(1, recent.length);
  const olderPos = older.filter((r) => r.rating >= 4).length / Math.max(1, older.length);
  const trending = recentPos > olderPos + 0.05 ? 'positive' : recentPos < olderPos - 0.05 ? 'negative' : 'stable';

  return {
    periodDays: 30,
    totalReviews: reviews.length,
    positivePct,
    negativePct,
    neutralPct: Math.max(0, 100 - positivePct - negativePct),
    trending,
    samples,
    summary:
      trending === 'positive'
        ? 'Tendance positive — la satisfaction client progresse ce mois-ci.'
        : trending === 'negative'
          ? 'Tendance négative — surveillez les retours récents.'
          : 'Sentiment stable sur les 30 derniers jours.',
  };
};

const getVisitorIntelligence = async ({
  query = '',
  petType = null,
  breed = null,
  ageYears = null,
  weightKg = null,
  browsedProductIds = [],
  category = null,
  limit = 8,
} = {}) => {
  const profile = { petType, breed, ageYears, weightKg };
  const browsedIds = Array.isArray(browsedProductIds) ? browsedProductIds.map(String) : [];

  const base = await getReviewBasedRecommendations({
    query,
    animalType: petType,
    category,
    limit: Math.min(limit + 4, 16),
  });

  const recommendations = base
    .map((product) => {
      const profileB = petProfileBoost(product, profile);
      const browseB = browseHistoryBoost(product, browsedIds);
      const rel = relevanceScore(product, profileB.boost, browseB.boost);
      const sat = satisfactionScore(product);
      const reasons = [...profileB.reasons, ...browseB.reasons].filter(Boolean);
      const reasonExtra = reasons.length ? ` · ${reasons.join(', ')}` : '';

      return {
        ...product,
        relevanceScore: rel,
        satisfactionScore: sat,
        recommendedReason: `${product.recommendedReason || product.reason || product.name}${reasonExtra}`,
        profileMatch: profileB.boost > 0,
      };
    })
    .sort((a, b) => (b.relevanceScore + b.satisfactionScore * 0.3) - (a.relevanceScore + a.satisfactionScore * 0.3))
    .slice(0, limit);

  const sentimentTrends = await computeSentimentTrends();

  const profileParts = [];
  if (petType) profileParts.push(petType);
  if (breed) profileParts.push(breed);
  if (ageYears) profileParts.push(`${ageYears} an(s)`);
  if (weightKg) profileParts.push(`${weightKg} kg`);

  return {
    recommendations,
    sentimentTrends,
    profileSummary: profileParts.length
      ? `Recommandations personnalisées pour ${profileParts.join(' · ')}`
      : 'Recommandations basées sur les avis clients et votre navigation',
    engine: 'visitor_ai_v2',
    models: ['review_nlp_v1', 'pet_profile_rules', 'sentiment_lexicon_v1'],
  };
};

const getModeratorSentimentInsights = async () => {
  const trends = await computeSentimentTrends();
  const flagged = await prisma.review.findMany({
    where: { moderationStatus: { in: ['flagged', 'pending'] } },
    include: { product: { select: { name: true } }, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  const { analyzeReviewForModeration } = require('./reviewModerationNlp.service');
  const analyzed = flagged.map((r) => {
    const nlp = analyzeReviewForModeration(r.comment, r.rating);
    return {
      id: r.id,
      productName: r.product?.name,
      author: r.user?.name || r.user?.email || 'Anonyme',
      rating: r.rating,
      comment: r.comment,
      ...nlp,
    };
  });

  return {
    sentimentTrends: trends,
    flaggedReviews: analyzed,
    stats: {
      flagged: analyzed.length,
      insults: analyzed.filter((a) => a.insultDetected).length,
      spam: analyzed.filter((a) => a.spamProbability >= 0.55).length,
      incoherent: analyzed.filter((a) => a.coherenceScore < 45).length,
    },
    summary: `${analyzed.length} avis à contrôler · ${trends.positivePct}% positifs sur 30j`,
  };
};

module.exports = {
  getVisitorIntelligence,
  getModeratorSentimentInsights,
  computeSentimentTrends,
  satisfactionScore,
  relevanceScore,
};
