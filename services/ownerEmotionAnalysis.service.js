const { prisma } = require('../prismaClient');
const { completionWithSystem } = require('./groq.service');
const {
  OWNER_EMOTIONS,
  PLATFORM_SERVICES,
  emotionMeta,
  serviceMeta,
} = require('../utils/ownerEmotionConstants');

const ML_SERVICE_URL = (
  process.env.ML_SERVICE_URL ||
  process.env.FASTAPI_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '');

const EMOTION_SYSTEM = `Tu analyses le ressenti d'un propriétaire d'animal vis-à-vis d'un service PetfoodTN (toilettage, pension, dressage, livraison, vétérinaire, produits).
Réponds UNIQUEMENT en JSON valide : {"emotion":"happy|satisfied|neutral|disappointed|frustrated","confidence":0.0-1.0,"summary":"une phrase en français"}`;

const KEYWORD_EMOTIONS = [
  { id: 'frustrated', words: ['nul', 'horrible', 'scandale', 'inadmissible', 'frustr', 'énerv', 'fâch', 'colère'] },
  { id: 'disappointed', words: ['déçu', 'décevant', 'mauvais', 'retard', 'attente', 'problème', 'insatisf'] },
  { id: 'happy', words: ['excellent', 'parfait', 'ador', 'génial', 'merci', 'ravi', 'super', 'magnifique'] },
  { id: 'satisfied', words: ['bien', 'correct', 'satisf', 'content', 'rapide', 'professionnel', 'recommand'] },
];

const analyzeByKeywords = (text) => {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return { emotion: 'neutral', confidence: 0.4, source: 'rules' };

  for (const row of KEYWORD_EMOTIONS) {
    if (row.words.some((w) => lower.includes(w))) {
      return { emotion: row.id, confidence: 0.72, source: 'rules' };
    }
  }
  return { emotion: 'neutral', confidence: 0.5, source: 'rules' };
};

const fetchPythonSentiment = async (text, serviceType) => {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/analyze-sentiment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, comment: text, serviceType }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const emotion = data.emotion || (data.sentiment === 'positive' ? 'satisfied' : data.sentiment === 'negative' ? 'disappointed' : 'neutral');
    return {
      emotion,
      confidence: Math.min(1, Math.abs(Number(data.score) || 0.5) + 0.35),
      sentiment: data.sentiment,
      score: data.score,
      source: data.source || 'fastapi',
      summary: data.summary || null,
    };
  } catch {
    return null;
  }
};

const analyzeWithGroq = async (text, serviceType) => {
  const svc = serviceMeta(serviceType);
  const raw = await completionWithSystem(
    EMOTION_SYSTEM,
    `Service : ${svc.label}\nCommentaire propriétaire :\n${String(text).slice(0, 1500)}`,
    { max_tokens: 200, temperature: 0.2 }
  );
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (OWNER_EMOTIONS.some((e) => e.id === json.emotion)) {
      return {
        emotion: json.emotion,
        confidence: Number(json.confidence) || 0.8,
        summary: json.summary,
        source: 'groq',
      };
    }
  } catch {
    /* ignore parse */
  }
  return null;
};

const analyzeOwnerEmotionText = async ({ text, serviceType, rating }) => {
  const trimmed = String(text || '').trim();
  let result = analyzeByKeywords(trimmed);

  const python = trimmed ? await fetchPythonSentiment(trimmed, serviceType) : null;
  if (python && (python.confidence || 0) >= (result.confidence || 0)) {
    result = { ...result, ...python };
  }

  if (trimmed.length >= 12) {
    const groq = await analyzeWithGroq(trimmed, serviceType);
    if (groq && (groq.confidence || 0) >= 0.65) {
      result = { ...result, ...groq, aiPowered: true };
    }
  }

  const r = Number(rating);
  if (r >= 1 && r <= 5) {
    if (r <= 2 && ['happy', 'satisfied'].includes(result.emotion)) {
      result = { ...result, emotion: 'disappointed', confidence: 0.6, source: `${result.source}+rating` };
    }
    if (r >= 4 && ['disappointed', 'frustrated'].includes(result.emotion)) {
      result = { ...result, emotion: 'satisfied', confidence: 0.65, source: `${result.source}+rating` };
    }
  }

  result.emotionLabel = emotionMeta(result.emotion).label;
  result.emotionEmoji = emotionMeta(result.emotion).emoji;
  result.serviceType = serviceType || null;
  return result;
};

const buildServiceBreakdown = (entries) => {
  const byService = {};
  for (const svc of PLATFORM_SERVICES) {
    byService[svc.type] = {
      ...svc,
      count: 0,
      avgRating: null,
      emotions: OWNER_EMOTIONS.map((e) => ({ ...e, count: 0 })),
      lastEmotion: null,
      lastAt: null,
      moodScore: 0,
    };
  }

  for (const row of entries) {
    const type = row.serviceType || row.type || 'products';
    if (!byService[type]) {
      byService[type] = {
        type,
        label: serviceMeta(type).label,
        icon: serviceMeta(type).icon,
        count: 0,
        emotions: OWNER_EMOTIONS.map((e) => ({ ...e, count: 0 })),
        lastEmotion: null,
        lastAt: null,
        moodScore: 0,
      };
    }
    const bucket = byService[type];
    bucket.count += 1;
    if (row.rating) {
      bucket._ratingSum = (bucket._ratingSum || 0) + row.rating;
      bucket._ratingN = (bucket._ratingN || 0) + 1;
    }
    const em = row.emotion || 'neutral';
    const emRow = bucket.emotions.find((e) => e.id === em);
    if (emRow) emRow.count += 1;
    const at = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    if (!bucket.lastAt || at > bucket.lastAt) {
      bucket.lastAt = at;
      bucket.lastEmotion = em;
    }
    bucket.moodScore += emotionMeta(em).score;
  }

  return Object.values(byService).map((s) => {
    const avg = s._ratingN ? s._ratingSum / s._ratingN : null;
    const mood = s.count ? Number((s.moodScore / s.count).toFixed(2)) : 0;
    const { _ratingSum, _ratingN, lastAt, ...rest } = s;
    return {
      ...rest,
      avgRating: avg != null ? Number(avg.toFixed(1)) : null,
      moodScore: mood,
      dominantEmotion: rest.emotions.reduce((a, b) => (b.count > a.count ? b : a), rest.emotions[0])?.id,
    };
  });
};

const getOwnerEmotionDashboard = async (userId) => {
  const [serviceRatings, productReviews] = await Promise.all([
    prisma.serviceRating.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
    prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: { product: { select: { name: true, category: true } } },
    }),
  ]);

  const entries = [
    ...serviceRatings.map((r) => ({
      id: r.id,
      source: 'service_rating',
      type: r.type,
      serviceType: r.type,
      rating: r.rating,
      emotion: r.emotion || 'neutral',
      comment: r.comment,
      createdAt: r.createdAt,
      label: serviceMeta(r.type).label,
    })),
    ...productReviews.map((r) => ({
      id: r.id,
      source: 'product_review',
      type: 'products',
      serviceType: 'products',
      rating: r.rating,
      emotion: r.emotion || 'neutral',
      comment: r.comment,
      createdAt: r.createdAt,
      label: r.product?.name || 'Produit',
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const breakdown = buildServiceBreakdown(entries);
  const total = entries.length;
  const globalMood =
    total > 0
      ? Number((entries.reduce((s, e) => s + emotionMeta(e.emotion).score, 0) / total).toFixed(2))
      : 0;

  const negativeServices = breakdown.filter(
    (s) => s.count > 0 && ['disappointed', 'frustrated'].includes(s.dominantEmotion)
  );
  const positiveServices = breakdown.filter(
    (s) => s.count > 0 && ['happy', 'satisfied'].includes(s.dominantEmotion)
  );

  const recommendations = [];
  if (negativeServices.length) {
    recommendations.push({
      type: 'improve',
      label: `Améliorer l'expérience : ${negativeServices.map((s) => s.label).join(', ')}`,
      link: '/client-complaints',
    });
  }
  if (!breakdown.find((s) => s.type === 'grooming' && s.count > 0)) {
    recommendations.push({
      type: 'try',
      label: 'Essayer le toilettage pour le bien-être de votre animal',
      link: '/client-services',
    });
  }
  recommendations.push({
    type: 'feedback',
    label: 'Partager votre ressenti après un service',
    link: '/client-emotions',
  });

  const ruleSummary = total
    ? `Vous avez exprimé ${total} ressenti(s) sur ${breakdown.filter((s) => s.count > 0).length} type(s) de service.`
    : 'Partagez votre ressenti après toilettage, dressage, pension, livraison ou consultation.';

  return {
    role: 'client',
    agent: 'owner_emotion_analysis',
    globalMood,
    globalMoodLabel:
      globalMood > 0.4 ? 'Très positif' : globalMood > 0 ? 'Plutôt satisfait' : globalMood < -0.3 ? 'À améliorer' : 'Neutre',
    totalFeedbacks: total,
    serviceBreakdown: breakdown,
    recentFeedbacks: entries.slice(0, 12),
    positiveServices: positiveServices.map((s) => s.type),
    needsAttention: negativeServices.map((s) => ({ type: s.type, label: s.label, emotion: s.dominantEmotion })),
    recommendations,
    summary: ruleSummary,
    emotionsCatalog: OWNER_EMOTIONS,
    platformServices: PLATFORM_SERVICES,
  };
};

module.exports = {
  analyzeOwnerEmotionText,
  getOwnerEmotionDashboard,
};
