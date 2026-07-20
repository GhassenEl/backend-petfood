/**
 * Fallback Node.js — recommandations hybrides quand FastAPI est indisponible.
 */

const ROLE_WEIGHTS = {
  client: { content: 0.55, collaborative: 0.45 },
  vet: { content: 0.5, collaborative: 0.5 },
  veterinarian: { content: 0.5, collaborative: 0.5 },
  admin: { content: 0.6, collaborative: 0.4 },
  vendor: { content: 0.5, collaborative: 0.5 },
  livreur: { content: 0.45, collaborative: 0.55 },
  moderator: { content: 0.65, collaborative: 0.35 },
};

const STEP_LABELS = {
  content_based: 'Filtrage contenu',
  collaborative_filtering: 'Filtrage collaboratif',
  review_nlp_filter: 'NLP avis',
  hybrid_blend: 'Fusion hybride',
};

const norm = (v) => String(v || '').toLowerCase().trim();

const buildCollabMap = (orders = [], userId = '') => {
  const map = new Map();
  const uid = String(userId);
  const userItems = new Set();

  orders.forEach((o) => {
    if (String(o.userId || '') === uid) {
      (o.items || []).forEach((it) => {
        const pid = String(it.productId || it.product?.id || it.product?._id || '');
        if (pid) userItems.add(pid);
      });
    }
  });

  orders.forEach((o) => {
    if (String(o.userId || '') === uid) return;
    const otherItems = (o.items || [])
      .map((it) => String(it.productId || it.product?.id || it.product?._id || ''))
      .filter(Boolean);
    otherItems.forEach((pid) => {
      if (userItems.has(pid)) {
        map.set(pid, (map.get(pid) || 0) + 1);
      }
    });
  });

  return map;
};

const scoreContent = (product, profile = {}) => {
  const reasons = [];
  let score = 0.15;

  const rating = Number(product.rating_avg || product.rating || 0);
  if (rating > 0) {
    score += Math.min(rating / 5, 1) * 0.35;
    if (rating >= 4) reasons.push('Bien noté par la communauté');
  }

  const pop = Number(product.popularity || product.stock || product.sales || 0);
  if (pop > 0) {
    score += Math.min(pop / 100, 1) * 0.2;
    reasons.push('Popularité catalogue');
  }

  const petType = norm(profile.petType);
  const animalType = norm(product.animalType);
  if (petType && animalType && (petType === animalType || animalType === 'all')) {
    score += 0.25;
    reasons.push(`Adapté ${profile.petType}`);
  }

  const history = (profile.historyProductIds || []).map(String);
  const pid = String(product.id || product._id || '');
  if (history.includes(pid)) {
    score += 0.15;
    reasons.push('Déjà acheté / consulté');
  }

  const favCats = (profile.favoriteCategories || []).map(norm);
  const cat = norm(product.category);
  if (favCats.length && favCats.includes(cat)) {
    score += 0.12;
    reasons.push(`Catégorie préférée (${product.category})`);
  }

  const nlpBoost = Number(product._nlpBoost || 0);
  if (nlpBoost > 0) {
    score += nlpBoost * 0.3;
    reasons.push('Avis clients positifs (NLP)');
  }

  return { score: Math.min(score, 1), reasons };
};

const scoreCollab = (productId, collabMap) => {
  const hits = collabMap.get(String(productId)) || 0;
  if (!hits) return { score: 0.05, reasons: [] };
  const score = Math.min(0.2 + hits * 0.15, 0.85);
  return { score, reasons: [`${hits} co-sélection(s) avec profils similaires`] };
};

const buildPipeline = (weights, count) => ({
  weights,
  steps: [
    { id: 'content', label: STEP_LABELS.content_based, status: 'done', weight: weights.content },
    { id: 'collab', label: STEP_LABELS.collaborative_filtering, status: 'done', weight: weights.collaborative },
    { id: 'nlp', label: STEP_LABELS.review_nlp_filter, status: 'done' },
    { id: 'fusion', label: STEP_LABELS.hybrid_blend, status: 'done', detail: `${count} recommandations` },
  ],
});

const runLocalHybrid = ({
  role = 'client',
  profile = {},
  products = [],
  orders = [],
  limit = 10,
} = {}) => {
  const normalizedRole = role === 'veterinarian' ? 'vet' : role;
  const weights = ROLE_WEIGHTS[normalizedRole] || ROLE_WEIGHTS.client;
  const collabMap = buildCollabMap(orders, profile.userId);
  const totalW = weights.content + weights.collaborative || 1;

  const recs = products
    .map((p) => {
      const pid = String(p.id || p._id || '');
      const content = scoreContent(p, profile);
      const collab = scoreCollab(pid, collabMap);
      const hybridScore = Math.round(
        ((content.score * weights.content + collab.score * weights.collaborative) / totalW) * 10000,
      ) / 10000;

      const reasons = [...content.reasons, ...collab.reasons].slice(0, 4);
      return {
        id: pid,
        name: p.name,
        category: p.category,
        animalType: p.animalType,
        price: p.price,
        hybridScore,
        contentScore: content.score,
        collaborativeScore: collab.score,
        reasons,
        recommendedReason: reasons[0] || 'Recommandation hybride (fallback Node)',
        method: 'hybrid-local',
      };
    })
    .filter((r) => r.hybridScore >= 0.08 && r.id)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, limit);

  return {
    role: normalizedRole,
    mode: 'hybrid-fallback',
    source: 'node',
    pythonPowered: false,
    profile,
    pipeline: buildPipeline(weights, recs.length),
    recommendations: recs,
    catalogSize: products.length,
    message: recs.length
      ? 'Recommandations générées localement (FastAPI indisponible).'
      : 'Catalogue insuffisant pour générer des recommandations.',
  };
};

const runLocalAdminClient = ({
  targetUserId,
  profile = {},
  products = [],
  orders = [],
  pets = [],
  limit = 12,
} = {}) => {
  const userOrders = orders.filter((o) => String(o.userId || '') === String(targetUserId));
  const historyProductIds = userOrders.flatMap((o) =>
    (o.items || []).map((it) => String(it.productId || it.product?.id || '')).filter(Boolean),
  );

  const enrichedProfile = {
    ...profile,
    userId: String(targetUserId),
    historyProductIds: [...new Set([...(profile.historyProductIds || []), ...historyProductIds])],
  };

  if (pets?.length) {
    const primary = pets[0];
    enrichedProfile.petType = enrichedProfile.petType || primary.type;
    enrichedProfile.petName = enrichedProfile.petName || primary.name;
    enrichedProfile.weightKg = enrichedProfile.weightKg ?? primary.weight;
  }

  const pack = runLocalHybrid({
    role: 'client',
    profile: enrichedProfile,
    products,
    orders,
    limit,
  });

  const userItems = new Set(enrichedProfile.historyProductIds);
  const similarClients = [];
  const seen = new Set();

  orders.forEach((o) => {
    const uid = String(o.userId || '');
    if (!uid || uid === String(targetUserId) || seen.has(uid)) return;
    const otherItems = new Set(
      (o.items || []).map((it) => String(it.productId || '')).filter(Boolean),
    );
    const inter = [...userItems].filter((id) => otherItems.has(id)).length;
    if (inter > 0) {
      seen.add(uid);
      similarClients.push({ userId: uid, similarity: Math.min(inter / Math.max(userItems.size, 1), 1) });
    }
  });

  similarClients.sort((a, b) => b.similarity - a.similarity);

  return {
    ...pack,
    targetUserId: String(targetUserId),
    similarClients: similarClients.slice(0, 5),
    interpretation: pack.recommendations.length
      ? `${pack.recommendations.length} produit(s) recommandé(s) selon historique et profil animal.`
      : 'Aucune recommandation — historique client vide.',
  };
};

module.exports = {
  runLocalHybrid,
  runLocalAdminClient,
  buildPipeline,
};
