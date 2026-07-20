/**
 * Enrichit le corpus d'avis pour le NLP (synthèse catalogue + service ratings si peu d'avis DB).
 */
const { prisma } = require('../prismaClient');

const MIN_REVIEW_CORPUS = Number(process.env.MIN_REVIEW_CORPUS || 48);

const ANIMAL_FR = {
  dog: 'chien',
  cat: 'chat',
  bird: 'oiseau',
  fish: 'poisson',
  other: 'animal',
};

const CATEGORY_KEYWORDS = {
  nourriture: ['croquettes', 'nourriture', 'alimentation', 'pâtée', 'nutrition', 'repas'],
  hygiene: ['litière', 'hygiène', 'propreté', 'sable'],
  accessoire: ['jouet', 'accessoire', 'collier', 'laisse', 'arbre'],
  medicament: ['médicament', 'soin', 'traitement', 'vétérinaire'],
  service: ['service', 'toilettage', 'pension', 'livraison'],
};

const pickRating = (product) => {
  const avg = Number(product.rating_avg || product.rating || 0);
  if (avg >= 4.5) return 5;
  if (avg >= 4) return 4;
  if (avg >= 3) return 4;
  if (avg >= 2) return 3;
  return avg > 0 ? Math.round(avg) : 4;
};

const buildComment = (product, rating) => {
  const name = String(product.name || 'Produit').trim();
  const animal = ANIMAL_FR[product.animalType] || 'animal';
  const cat = String(product.category || 'produit').toLowerCase();
  const keywords = CATEGORY_KEYWORDS[cat] || [cat, 'produit', 'qualité'];
  const kw = keywords[Math.abs(name.length) % keywords.length];
  const tone =
    rating >= 5
      ? `Excellent ${kw}, mon ${animal} adore ${name}. Très bonne qualité PetfoodTN.`
      : rating >= 4
        ? `Bon ${kw} — ${name} convient bien à mon ${animal}. Livraison rapide.`
        : rating >= 3
          ? `${name} correct pour ${kw}, résultat moyen sur mon ${animal}.`
          : `Déçu par ${name}, ${kw} en dessous de mes attentes pour mon ${animal}.`;
  const desc = String(product.description || '').slice(0, 80).trim();
  return desc ? `${tone} ${desc}` : tone;
};

const buildSyntheticFromProducts = (products, existingProductIds) => {
  const out = [];
  const seen = new Set(existingProductIds);

  for (const p of products || []) {
    const pid = String(p.id || p._id || '');
    if (!pid || seen.has(pid)) continue;
    const rating = pickRating(p);
    out.push({
      productId: pid,
      rating,
      comment: buildComment(p, rating),
      userId: 'catalog-enriched',
      synthetic: true,
    });
    seen.add(pid);
    if (out.length >= MIN_REVIEW_CORPUS * 2) break;
  }
  return out;
};

const loadServiceRatingsAsReviews = async () => {
  try {
    const rows = await prisma.serviceRating.findMany({
      where: { comment: { not: null } },
      select: { userId: true, rating: true, comment: true, type: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
    return rows
      .filter((r) => String(r.comment || '').trim().length > 8)
      .map((r) => ({
        productId: `service:${r.type || 'general'}`,
        rating: Number(r.rating || 4),
        comment: String(r.comment),
        userId: r.userId ? String(r.userId) : null,
        synthetic: false,
      }));
  } catch {
    return [];
  }
};

/**
 * @param {Array} reviews - avis réels
 * @param {Array} products - catalogue export ML
 */
const enrichReviewCorpus = async (reviews = [], products = []) => {
  const real = (reviews || []).map((r) => ({ ...r, synthetic: false }));
  const realProductIds = new Set(real.map((r) => String(r.productId || '')));

  let merged = [...real];

  if (merged.length < MIN_REVIEW_CORPUS) {
    const serviceReviews = await loadServiceRatingsAsReviews();
    for (const sr of serviceReviews) {
      if (merged.length >= MIN_REVIEW_CORPUS * 2) break;
      merged.push(sr);
    }
  }

  if (merged.length < MIN_REVIEW_CORPUS) {
    const synthetic = buildSyntheticFromProducts(products, realProductIds);
    merged = merged.concat(synthetic);
  }

  if (merged.length < MIN_REVIEW_CORPUS) {
    for (const p of products || []) {
      if (merged.length >= MIN_REVIEW_CORPUS) break;
      const pid = String(p.id || p._id || '');
      if (!pid) continue;
      const rating = Math.max(3, pickRating(p) - 1);
      merged.push({
        productId: pid,
        rating,
        comment: `Retour client : ${buildComment(p, rating)}`,
        userId: 'catalog-enriched-alt',
        synthetic: true,
      });
    }
  }

  return {
    reviews: merged,
    stats: {
      realCount: real.length,
      enrichedCount: merged.length,
      syntheticCount: merged.filter((r) => r.synthetic).length,
      enriched: merged.length > real.length,
    },
  };
};

/** Fallback recherche locale si FastAPI indisponible ou peu de résultats */
const localSearchByReviews = (products, reviews, { query, minRating, limit = 12 } = {}) => {
  const q = String(query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
  const terms = q.split(/\s+/).filter((t) => t.length > 2);

  const reviewByProduct = {};
  for (const r of reviews || []) {
    const pid = String(r.productId || '');
    if (!reviewByProduct[pid]) reviewByProduct[pid] = [];
    reviewByProduct[pid].push(r);
  }

  const scored = (products || []).map((p) => {
    const pid = String(p.id || p._id || '');
    const revs = reviewByProduct[pid] || [];
    const avg =
      revs.length > 0
        ? revs.reduce((s, r) => s + Number(r.rating || 0), 0) / revs.length
        : Number(p.rating_avg || 0) || 4;
    if (minRating && revs.length >= 2 && avg < minRating) return null;

    const corpus = [
      p.name,
      p.description,
      p.category,
      p.animalType,
      ...(Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')),
      ...revs.map((r) => r.comment),
    ]
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');

    let textScore = 0;
    if (terms.length) {
      const hits = terms.filter((t) => corpus.includes(t)).length;
      textScore = hits / terms.length;
      if (hits === 0) return null;
    }

    const boost = (avg / 5) * 0.6 + textScore * 0.4;
    return {
      ...p,
      _reviewStats: { avg: Math.round(avg * 10) / 10, count: revs.length },
      _nlpBoost: Math.round(boost * 1000) / 1000,
    };
  }).filter(Boolean);

  scored.sort((a, b) => (b._nlpBoost || 0) - (a._nlpBoost || 0));
  return scored.slice(0, limit);
};

module.exports = {
  enrichReviewCorpus,
  localSearchByReviews,
  buildSyntheticFromProducts,
  MIN_REVIEW_CORPUS,
};
