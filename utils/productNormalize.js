const { enrichProduct } = require('./productDetailsCatalog');

const FALLBACK_STOCK = {
  prd_dog_1: 24,
  prd_dog_2: 53,
  prd_dog_3: 40,
  prd_cat_1: 31,
  prd_cat_2: 27,
  prd_cat_3: 22,
  prd_bird_1: 18,
  prd_fish_1: 42,
};

const inferAnimalType = (product) => {
  if (product?.animalType && product.animalType !== 'other') return product.animalType;

  const hay = `${product?.id || ''} ${product?._id || ''} ${product?.name || ''}`.toLowerCase();
  if (/prd_dog|chien|chiot|\bdog\b/.test(hay)) return 'dog';
  if (/prd_cat|chat|chaton|\bcat\b|liti[eè]re/.test(hay)) return 'cat';
  if (/prd_bird|oiseau|\bbird\b/.test(hay)) return 'bird';
  if (/prd_fish|poisson|aquarium|\bfish\b/.test(hay)) return 'fish';
  if (/prd_rabbit|lapin|\brabbit\b/.test(hay)) return 'rabbit';
  return product?.animalType || 'other';
};

const effectiveDiscount = (product) => {
  const d = Number(product?.discount || 0);
  if (d > 0) return d;
  const price = Number(product?.price || 0);
  const dp = Number(product?.discountPrice || 0);
  if (product?.isOnSale && dp > 0 && price > 0) {
    return Math.round((1 - dp / price) * 100);
  }
  return 0;
};

const normalizeProductRecord = (product) => {
  if (!product) return product;

  const id = product.id || product._id;
  const stockRaw = Number(product.stock ?? 0);
  const stock = stockRaw > 0 ? stockRaw : (FALLBACK_STOCK[id] ?? 25);
  const discount = effectiveDiscount(product);
  const price = Number(product.price || 0);
  const discountPrice = product.discountPrice > 0
    ? Number(product.discountPrice)
    : discount > 0
      ? Number((price * (1 - discount / 100)).toFixed(2))
      : null;

  const base = {
    ...product,
    animalType: inferAnimalType(product),
    stock,
    discount,
    isOnSale: Boolean(product.isOnSale || discount > 0),
    discountPrice: discountPrice ?? product.discountPrice,
  };

  return enrichProduct(base);
};

module.exports = {
  inferAnimalType,
  effectiveDiscount,
  normalizeProductRecord,
};
