const { enrichProduct } = require('./productDetailsCatalog');

const BROKEN_REMOTE_IMAGE_FRAGMENTS = [
  'photo-1585110396000-f9e815c5c35f',
  'photo-1585110396000-c9ffd4e4b69f',
  'photo-1552728080-b656399553ba',
  'photo-1524704656165-b5c4abb5f90b',
  'photo-1583511655857-d19b40a0a54e',
  'photo-1516734212186-a967f81a0b22',
  'photo-1513201099705-ce310b73ea6f',
  'photo-1522069169879-c036186b7a1c',
  'photo-1535591273668-7136ddc9d8e1',
];

const PLACEHOLDER_SVG_FRAGMENTS = [
  '/images/pets/rabbit.svg',
  '/images/pets/bird.svg',
  '/images/pets/fish.svg',
];

const PRODUCT_REAL_IMAGES = {
  ani_rabbit_1: '/images/products/rabbit-adoption.jpg',
  ani_bird_1: '/images/products/bird-couple.jpg',
  ani_fish_1: '/images/products/guppy-lot.jpg',
  prd_rabbit_food: '/images/products/rabbit-food.jpg',
};

const ANIMAL_REAL_IMAGES = {
  rabbit: '/images/products/rabbit-adoption.jpg',
  bird: '/images/products/bird-couple.jpg',
  fish: '/images/products/guppy-lot.jpg',
};

const isBrokenOrPlaceholderImage = (url) => {
  if (!url || typeof url !== 'string') return false;
  return BROKEN_REMOTE_IMAGE_FRAGMENTS.some((frag) => url.includes(frag))
    || PLACEHOLDER_SVG_FRAGMENTS.some((frag) => url.includes(frag));
};

const resolveProductImageUrl = (url, product = {}) => {
  const id = product?.id || product?._id;
  if (id && PRODUCT_REAL_IMAGES[id]) return PRODUCT_REAL_IMAGES[id];

  const animalType = product?.animalType;
  if (!url || isBrokenOrPlaceholderImage(url)) {
    return PRODUCT_REAL_IMAGES[id] || ANIMAL_REAL_IMAGES[animalType] || url;
  }
  return url;
};

const sanitizeImageUrl = (url, product = {}) => resolveProductImageUrl(url, product);

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

  const animalType = inferAnimalType(product);
  const imageUrl = sanitizeImageUrl(product.imageUrl, product);
  const image = sanitizeImageUrl(product.image, product);
  const icon = sanitizeImageUrl(product.icon, product);

  const base = {
    ...product,
    animalType,
    imageUrl: imageUrl || image || icon || product.imageUrl,
    image: image || imageUrl || product.image,
    icon: icon || imageUrl || product.icon,
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
