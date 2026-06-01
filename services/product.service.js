const demoStore = require('../utils/demoStore');
const productRepository = require('../repositories/product.repository');
const userRepository = require('../repositories/user.repository');

const getProducts = async () => {
  return productRepository.findAll();
};

const createProduct = async (payload) => {
  const price = Number(payload.price || 0);
  const { promoFieldsFromDiscount } = require('./productPromo.service');
  const promo = promoFieldsFromDiscount(price, payload.discount);

  return productRepository.create({
    name: payload.name,
    price,
    ...promo,
    imageUrl: payload.imageUrl || '',
    image: payload.image || '',
    icon: payload.icon || '',
    description: payload.description || '',
    stock: Number(payload.stock || 0),
    category: payload.category || 'nourriture',
    animalType: payload.animalType || 'other',
    tags: payload.tags || [],
    popularity: Number(payload.popularity || 0),
    rating_avg: Number(payload.rating_avg || 0),
    rating_count: Number(payload.rating_count || 0),
    stockHistory: payload.stockHistory || []
  });
};

const updateProduct = async (id, payload) => {
  const data = {
    name: payload.name,
    price: payload.price !== undefined ? Number(payload.price) : undefined,
    imageUrl: payload.imageUrl,
    image: payload.image,
    icon: payload.icon,
    description: payload.description,
    stock: payload.stock !== undefined ? Number(payload.stock) : undefined,
    category: payload.category,
    animalType: payload.animalType,
    tags: payload.tags,
    popularity: payload.popularity !== undefined ? Number(payload.popularity) : undefined,
    rating_avg: payload.rating_avg !== undefined ? Number(payload.rating_avg) : undefined,
    rating_count: payload.rating_count !== undefined ? Number(payload.rating_count) : undefined,
    stockHistory: payload.stockHistory,
  };

  if (payload.discount !== undefined || payload.price !== undefined) {
    const existing = await productRepository.findById(id);
    const price = payload.price !== undefined ? Number(payload.price) : Number(existing?.price || 0);
    const discount = payload.discount !== undefined ? Number(payload.discount) : Number(existing?.discount || 0);
    const { promoFieldsFromDiscount } = require('./productPromo.service');
    Object.assign(data, promoFieldsFromDiscount(price, discount));
  } else if (payload.discountPrice !== undefined || payload.isOnSale !== undefined) {
    data.discountPrice = payload.discountPrice !== undefined ? Number(payload.discountPrice) : undefined;
    data.discount = payload.discount !== undefined ? Number(payload.discount) : undefined;
    data.isOnSale = payload.isOnSale !== undefined ? Boolean(payload.isOnSale) : undefined;
  }

  return productRepository.update(id, data);
};

const deleteProduct = async (id) => productRepository.deleteById(id);

const getRecommendations = async (user) => {
  const allProducts = await productRepository.findAll();
  const currentUser = user ? await userRepository.findById(user.id || user._id) : null;

  if (!currentUser) {
    return allProducts.slice(0, 8);
  }

  const scoredProducts = allProducts.map((p) => {
    let score = 0;
    const reasons = [];

    if (currentUser.petType && p.animalType === currentUser.petType) {
      score += 0.30;
      reasons.push(`🐾 Pour votre ${p.animalType}`);
    }
    if (Array.isArray(currentUser.favoriteCategories) && currentUser.favoriteCategories.includes(p.category)) {
      score += 0.20;
      reasons.push('❤️ Catégorie préférée');
    }
    if (p.discount > 0) {
      score += (p.discount / 100) * 0.12;
      reasons.push(`💰 -${p.discount}%`);
    }
    score += (p.popularity / 100) * 0.10;
    if (p.popularity > 85) reasons.push('🔥 Très populaire');
    if (p.rating_avg >= 4.5) {
      score += 0.08;
      reasons.push('⭐ Bien noté');
    }

    return {
      ...p,
      score: Math.min(Math.max(score, 0), 1),
      recommendedReason: reasons[0] || (p.discount > 0 ? `-${p.discount}%` : 'Recommandé pour vous')
    };
  });

  scoredProducts.sort((a, b) => b.score - a.score);
  return scoredProducts.slice(0, 8);
};

const getNearbyProducts = async () => {
  return productRepository.findNearby(6);
};

const adjustStock = async (id, adjustment, userId, reason = 'Ajustement manuel') => {
  const product = await productRepository.findById(id);
  if (!product) {
    const error = new Error('Product not found');
    error.status = 404;
    throw error;
  }

  const newStock = Math.max(0, Number(product.stock || 0) + Number(adjustment));
  const history = Array.isArray(product.stockHistory) ? product.stockHistory : [];
  history.push({ adjustment, newStock, reason, date: new Date(), adminId: userId });

  return productRepository.updateStock(id, newStock, history);
};

const getLowStock = async (threshold = 10) => productRepository.findLowStock(threshold);

const bulkUpdateStock = async (updates) => {
  const results = [];
  for (const up of updates) {
    try {
      const product = await productRepository.update(up.id, { stock: Math.max(0, Number(up.stock)) });
      results.push({ id: up.id, success: true, newStock: product.stock });
    } catch (error) {
      results.push({ id: up.id, success: false, error: error.code === 'P2025' ? 'Not found' : error.message });
    }
  }
  return results;
};

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecommendations,
  getNearbyProducts,
  adjustStock,
  getLowStock,
  bulkUpdateStock
};