const productRepository = require('../repositories/product.repository');

const clampDiscount = (value) => Math.min(100, Math.max(0, Number(value) || 0));

const promoFieldsFromDiscount = (price, discount) => {
  const d = clampDiscount(discount);
  const basePrice = Number(price) || 0;
  return {
    discount: d,
    isOnSale: d > 0,
    discountPrice: Number((basePrice * (1 - d / 100)).toFixed(2)),
  };
};

const listProductPromotions = async () => {
  const products = await productRepository.findAll();
  return products.map((p) => {
    const discount = Number(p.discount || 0);
    const price = Number(p.price || 0);
    const finalPrice = Number((price * (1 - discount / 100)).toFixed(2));
    return {
      id: p.id,
      name: p.name,
      price,
      discount,
      finalPrice,
      isOnSale: discount > 0 || Boolean(p.isOnSale),
      animalType: p.animalType,
      category: p.category,
      stock: p.stock,
      imageUrl: p.imageUrl || p.image,
    };
  });
};

const updateProductPromotion = async (productId, { discount }) => {
  const product = await productRepository.findById(productId);
  if (!product) {
    const error = new Error('Produit introuvable');
    error.status = 404;
    throw error;
  }

  const patch = promoFieldsFromDiscount(product.price, discount);
  return productRepository.update(productId, patch);
};

const bulkUpdateProductPromotions = async ({ productIds = [], discount }) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    const error = new Error('Sélectionnez au moins un produit');
    error.status = 400;
    throw error;
  }

  const d = clampDiscount(discount);
  const results = [];

  for (const id of productIds) {
    try {
      const product = await productRepository.findById(id);
      if (!product) {
        results.push({ id, success: false, error: 'Introuvable' });
        continue;
      }
      const patch = promoFieldsFromDiscount(product.price, d);
      const updated = await productRepository.update(id, patch);
      results.push({ id, success: true, discount: updated.discount });
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }

  return results;
};

const clearProductPromotions = async (productIds) => {
  const ids = Array.isArray(productIds) && productIds.length > 0
    ? productIds
    : (await productRepository.findAll()).map((p) => p.id);

  const results = [];
  for (const id of ids) {
    try {
      const product = await productRepository.findById(id);
      if (!product) {
        results.push({ id, success: false, error: 'Introuvable' });
        continue;
      }
      await productRepository.update(id, {
        discount: 0,
        isOnSale: false,
        discountPrice: 0,
      });
      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  return results;
};

module.exports = {
  listProductPromotions,
  updateProductPromotion,
  bulkUpdateProductPromotions,
  clearProductPromotions,
  promoFieldsFromDiscount,
};
