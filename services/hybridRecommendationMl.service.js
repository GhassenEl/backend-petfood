/**
 * Recommandations hybrides — proxy FastAPI (contenu + collaboratif + NLP avis).
 */
const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { exportMlSnapshot } = require('./mlDataExport.service');
const { isPythonMlEnabled, ML_SERVICE_URL } = require('./mlPythonClient');
const { buildClientInsights } = require('./clientInsights.service');
const { enrichReviewCorpus, localSearchByReviews } = require('./reviewEnrichment.service');
const { runLocalHybrid, runLocalAdminClient } = require('./hybridRecommendationLocal.service');

const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 12000);

const fetchMl = async (path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ML_TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`ml_${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
};

const mapReview = (r) => ({
  productId: String(r.productId || r.product?.id || ''),
  rating: Number(r.rating || 0),
  comment: String(r.comment || r.text || ''),
  userId: r.userId ? String(r.userId) : null,
});

const loadReviews = async (products = []) => {
  let rows = [];
  if (isDemoMode()) {
    const demoProducts = demoStore.getProducts?.() || [];
    demoProducts.forEach((p) => {
      (p.reviews || []).forEach((rev) => {
        rows.push(mapReview({ ...rev, productId: p._id || p.id }));
      });
    });
  } else {
    try {
      const dbRows = await prisma.review.findMany({
        select: { productId: true, rating: true, comment: true, userId: true },
        take: 3000,
        orderBy: { createdAt: 'desc' },
      });
      rows = dbRows.map(mapReview);
    } catch {
      rows = [];
    }
  }

  const catalog = products.length ? products : (await exportMlSnapshot()).products || [];
  const { reviews } = await enrichReviewCorpus(rows, catalog);
  return reviews.map(({ synthetic, ...r }) => r);
};

const buildProfileFromUser = async (user, petId = null) => {
  const insights = await buildClientInsights(user);
  const p = insights.profile || {};
  let pets = [];
  try {
    if (!isDemoMode()) {
      pets = await prisma.pet.findMany({
        where: { ownerId: String(user.id || user._id) },
        take: 10,
      });
    }
  } catch {
    pets = [];
  }
  const pet = petId ? pets.find((x) => x.id === petId) : pets[0];
  const history = (insights.purchase?.recentProductIds || []).map(String);

  return {
    userId: String(user.id || user._id),
    role: user.role || 'client',
    petType: pet?.type || p.petType,
    petName: pet?.name,
    weightKg: pet?.weight != null ? Number(pet.weight) : null,
    breed: pet?.breed,
    preferences: p.preferences || [],
    favoriteCategories: (insights.purchase?.topCategories || []).map((c) => c.name),
    historyProductIds: history,
  };
};

const getHybridRecommendations = async (user, { role, limit = 10, query, minRating, petId } = {}) => {
  const snapshot = await exportMlSnapshot();
  const reviews = await loadReviews(snapshot.products || []);
  const normalizedRole = role || user.role || 'client';
  const profile = await buildProfileFromUser(user, petId);

  if (isPythonMlEnabled()) {
    try {
      const result = await fetchMl('/recommendations/hybrid', {
        role: normalizedRole,
        userId: profile.userId,
        profile,
        products: snapshot.products || [],
        orders: snapshot.orders || [],
        reviews,
        limit: Math.min(limit, 20),
        query: query || null,
        minRating: minRating != null ? Number(minRating) : null,
      });
      return { ...result, pythonPowered: true, mode: 'hybrid' };
    } catch (err) {
      console.warn('[HybridReco] FastAPI:', err.message);
    }
  }

  return runLocalHybrid({
    role: normalizedRole,
    profile,
    products: snapshot.products || [],
    orders: snapshot.orders || [],
    limit: Math.min(limit, 20),
  });
};

const getAdminClientRecommendations = async (targetUserId, { limit = 12 } = {}) => {
  const snapshot = await exportMlSnapshot();
  const reviews = await loadReviews(snapshot.products || []);

  let user = null;
  let pets = [];
  if (isDemoMode()) {
    user = demoStore.getUserById?.(targetUserId) || { id: targetUserId, role: 'client', name: 'Client' };
    pets = (snapshot.pets || []).filter((p) => p.ownerId === targetUserId);
  } else {
    user = await prisma.user.findUnique({ where: { id: targetUserId } });
    pets = await prisma.pet.findMany({ where: { ownerId: targetUserId } });
  }
  if (!user) {
    const err = new Error('Client introuvable');
    err.status = 404;
    throw err;
  }

  const profile = await buildProfileFromUser(user);

  if (isPythonMlEnabled()) {
    try {
      return {
        ...(await fetchMl('/recommendations/admin/client-profile', {
          targetUserId,
          profile,
          products: snapshot.products || [],
          orders: snapshot.orders || [],
          reviews,
          pets,
          limit,
        })),
        pythonPowered: true,
      };
    } catch (err) {
      console.warn('[AdminClientReco] FastAPI:', err.message);
    }
  }

  return runLocalAdminClient({
    targetUserId,
    profile,
    products: snapshot.products || [],
    orders: snapshot.orders || [],
    pets,
    limit,
  });
};

const explainSalesTraffic = async () => {
  const snapshot = await exportMlSnapshot();
  const reviews = await loadReviews(snapshot.products || []);

  if (isPythonMlEnabled()) {
    try {
      return {
        ...(await fetchMl('/recommendations/explain-sales', {
          orders: snapshot.orders || [],
          products: snapshot.products || [],
          reviews,
          revenue_history: snapshot.revenue_history || [],
        })),
        pythonPowered: true,
      };
    } catch (err) {
      console.warn('[SalesExplain] FastAPI:', err.message);
    }
  }

  return {
    pythonPowered: false,
    aiSummary: 'Activez le service FastAPI (port 8000) pour l\'interprétation IA du trafic CA.',
    highlights: [],
  };
};

const searchByReviews = async ({ query, minRating, limit = 12 } = {}) => {
  const snapshot = await exportMlSnapshot();
  const reviews = await loadReviews(snapshot.products || []);
  const products = snapshot.products || [];

  if (isPythonMlEnabled()) {
    try {
      const result = await fetchMl('/recommendations/search-reviews', {
        role: 'admin',
        products,
        orders: snapshot.orders || [],
        reviews,
        query,
        minRating: minRating != null ? Number(minRating) : null,
        limit,
      });
      if ((result?.count || 0) >= Math.min(3, limit)) {
        return { ...result, pythonPowered: true, reviewCorpusSize: reviews.length };
      }
      const local = localSearchByReviews(products, reviews, { query, minRating, limit });
      if (local.length > (result?.count || 0)) {
        return {
          query,
          minRating,
          count: local.length,
          products: local,
          pythonPowered: true,
          supplemented: true,
          reviewCorpusSize: reviews.length,
        };
      }
      return { ...result, pythonPowered: true, reviewCorpusSize: reviews.length };
    } catch (err) {
      console.warn('[ReviewSearch] FastAPI:', err.message);
    }
  }

  const local = localSearchByReviews(products, reviews, { query, minRating, limit });
  return {
    query,
    minRating,
    count: local.length,
    products: local,
    pythonPowered: false,
    reviewCorpusSize: reviews.length,
  };
};

module.exports = {
  getHybridRecommendations,
  getAdminClientRecommendations,
  explainSalesTraffic,
  searchByReviews,
};
