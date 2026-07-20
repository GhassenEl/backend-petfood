const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const DEMO_RATINGS = {
  'demo-prod-croq': { rating_avg: 4.6, rating_count: 42 },
  'demo-prod-manteau': { rating_avg: 4.2, rating_count: 18 },
  'demo-prod-patee': { rating_avg: 4.5, rating_count: 31 },
  prd_cat_1: { rating_avg: 4.6, rating_count: 15 },
  prd_cat_2: { rating_avg: 4.4, rating_count: 12 },
  prd_dog_1: { rating_avg: 4.7, rating_count: 28 },
  prd_dog_2: { rating_avg: 4.5, rating_count: 22 },
  prd_dog_3: { rating_avg: 4.3, rating_count: 9 },
  prd_bird_1: { rating_avg: 4.1, rating_count: 7 },
  prd_fish_1: { rating_avg: 4.0, rating_count: 5 },
};

async function aggregateRatingsFromReviews() {
  if (isDemoMode()) return new Map();
  try {
    const rows = await prisma.review.groupBy({
      by: ['productId'],
      _avg: { rating: true },
      _count: { rating: true },
    });
    const map = new Map();
    rows.forEach((r) => {
      if (!r.productId) return;
      map.set(String(r.productId), {
        rating_avg: Math.round((r._avg.rating || 0) * 10) / 10,
        rating_count: r._count.rating || 0,
      });
    });
    return map;
  } catch {
    return new Map();
  }
}

function applyRatingToProduct(product, reviewMap) {
  if (!product) return product;
  const id = String(product.id || product._id || '');
  const existingAvg = Number(product.rating_avg ?? product.ratingAvg ?? 0);
  const existingCount = Number(product.rating_count ?? product.ratingCount ?? 0);

  if (existingAvg > 0 && existingCount > 0) {
    return {
      ...product,
      rating_avg: existingAvg,
      rating_count: existingCount,
    };
  }

  const fromReviews = reviewMap.get(id);
  if (fromReviews?.rating_count > 0) {
    return { ...product, ...fromReviews };
  }

  const demo = DEMO_RATINGS[id];
  if (demo) return { ...product, ...demo };

  if (existingAvg > 0) {
    return {
      ...product,
      rating_avg: existingAvg,
      rating_count: existingCount || 1,
    };
  }

  return {
    ...product,
    rating_avg: 4.5,
    rating_count: 8,
  };
}

async function enrichProductsWithRatings(products = []) {
  const reviewMap = await aggregateRatingsFromReviews();
  return products.map((p) => applyRatingToProduct(p, reviewMap));
}

module.exports = {
  enrichProductsWithRatings,
  applyRatingToProduct,
};
