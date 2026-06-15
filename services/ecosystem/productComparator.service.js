const { prisma, isDemoMode } = require('../../prismaClient');

const parseTags = (tags) => {
  if (!tags) return [];
  try {
    const p = JSON.parse(tags);
    return Array.isArray(p) ? p : String(tags).split(',').map((t) => t.trim());
  } catch {
    return String(tags).split(',').map((t) => t.trim()).filter(Boolean);
  }
};

const estimateNutrition = (product) => {
  const hay = `${product.name} ${product.description || ''} ${parseTags(product.tags).join(' ')}`.toLowerCase();
  const isCat = /chat|kitten|chaton|felin/i.test(hay) || product.animalType === 'cat';
  const isJunior = /junior|chiot|chaton|puppy|kitten/i.test(hay);
  const isSenior = /senior|mature|7\+/i.test(hay);
  const isPremium = /premium|ultra|holistic|bio|grain.free|sans.céréales/i.test(hay);

  let protein = isCat ? 30 : 26;
  let fat = isCat ? 16 : 14;
  let fiber = 3;
  let kcalPer100g = 360;

  if (isJunior) {
    protein += 4;
    fat += 2;
    kcalPer100g += 30;
  }
  if (isSenior) {
    protein -= 2;
    fat -= 2;
    fiber += 2;
    kcalPer100g -= 20;
  }
  if (isPremium) {
    protein += 3;
    fat += 1;
  }
  if (/light|diet|steril/i.test(hay)) {
    fat -= 4;
    kcalPer100g -= 40;
  }
  if (/pâtée|patee|humide/i.test(hay)) {
    protein -= 4;
    fat += 4;
    kcalPer100g = 90;
  }

  const rating = Number(product.rating_avg) || 4;
  const reviews = Number(product.rating_count) || 0;
  const popularity = Number(product.popularity) || 0;
  const qualityScore = Math.min(
    100,
    Math.round(rating * 14 + Math.min(reviews, 50) * 0.4 + popularity * 2 + (isPremium ? 8 : 0)),
  );

  const price = Number(product.discountPrice || product.price) || 1;
  const packKg = /3\s*kg|3kg/i.test(hay) ? 3 : /2\s*kg|2kg/i.test(hay) ? 2 : /4\s*kg|4kg/i.test(hay) ? 4 : 1;
  const pricePerKg = price / packKg;
  const valueIndex = Math.round((qualityScore / Math.max(pricePerKg, 0.5)) * 10) / 10;

  return {
    proteinPercent: protein,
    fatPercent: fat,
    fiberPercent: fiber,
    kcalPer100g,
    qualityScore,
    pricePerKg: Math.round(pricePerKg * 100) / 100,
    valueIndex,
    packSizeKg: packKg,
    labels: [
      isPremium ? 'Premium' : null,
      isJunior ? 'Junior' : null,
      isSenior ? 'Senior' : null,
      isCat ? 'Chat' : 'Chien',
    ].filter(Boolean),
  };
};

const compareProducts = async (productIds = []) => {
  const ids = [...new Set(productIds)].slice(0, 4);
  if (ids.length < 2) {
    const err = new Error('Sélectionnez au moins 2 produits à comparer');
    err.status = 400;
    throw err;
  }

  let products;
  if (isDemoMode()) {
    products = [
      { id: 'dp1', name: 'Croquettes Premium Chiot 3 kg', price: 79, discountPrice: 71, category: 'nourriture', animalType: 'dog', rating_avg: 4.6, rating_count: 42, popularity: 9, description: 'Junior riche en protéines' },
      { id: 'dp6', name: 'Croquettes Senior 4 kg', price: 85, discountPrice: 76, category: 'nourriture', animalType: 'dog', rating_avg: 4.4, rating_count: 28, popularity: 7, description: 'Senior articulations' },
      { id: 'dp8', name: 'Croquettes Sport Performance 3 kg', price: 95, category: 'nourriture', animalType: 'dog', rating_avg: 4.5, rating_count: 19, popularity: 6, description: 'Haute énergie active dog' },
    ].filter((p) => ids.includes(p.id));
    if (products.length < 2) products = products.length ? [...products, products[0]] : [];
  } else {
    products = await prisma.product.findMany({ where: { id: { in: ids } } });
  }

  if (products.length < 2) {
    const err = new Error('Produits introuvables');
    err.status = 404;
    throw err;
  }

  const rows = products.map((p) => {
    const price = Number(p.discountPrice || p.price) || 0;
    const nutrition = estimateNutrition(p);
    return {
      productId: p.id,
      name: p.name,
      price,
      category: p.category,
      animalType: p.animalType,
      imageUrl: p.imageUrl || p.image,
      rating: p.rating_avg,
      nutrition,
    };
  });

  const bestQuality = [...rows].sort((a, b) => b.nutrition.qualityScore - a.nutrition.qualityScore)[0];
  const bestValue = [...rows].sort((a, b) => b.nutrition.valueIndex - a.nutrition.valueIndex)[0];
  const bestProtein = [...rows].sort((a, b) => b.nutrition.proteinPercent - a.nutrition.proteinPercent)[0];

  const nutritionComparison = {
    metrics: ['proteinPercent', 'fatPercent', 'fiberPercent', 'kcalPer100g'],
    labels: { proteinPercent: 'Protéines %', fatPercent: 'Lipides %', fiberPercent: 'Fibres %', kcalPer100g: 'kcal / 100g' },
    rows: rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      values: {
        proteinPercent: r.nutrition.proteinPercent,
        fatPercent: r.nutrition.fatPercent,
        fiberPercent: r.nutrition.fiberPercent,
        kcalPer100g: r.nutrition.kcalPer100g,
      },
    })),
  };

  const qualityPriceReport = rows.map((r) => ({
    productId: r.productId,
    name: r.name,
    price: r.price,
    pricePerKg: r.nutrition.pricePerKg,
    qualityScore: r.nutrition.qualityScore,
    valueIndex: r.nutrition.valueIndex,
    verdict:
      r.productId === bestValue.productId
        ? 'Meilleur rapport qualité/prix'
        : r.productId === bestQuality.productId
          ? 'Meilleure qualité perçue'
          : 'Alternative',
  }));

  return {
    model: 'product_comparator_v1',
    comparedCount: rows.length,
    products: rows,
    nutritionComparison,
    qualityPriceReport,
    winners: {
      quality: { productId: bestQuality.productId, name: bestQuality.name },
      value: { productId: bestValue.productId, name: bestValue.name },
      protein: { productId: bestProtein.productId, name: bestProtein.name },
    },
    summary: `Comparaison de ${rows.length} produits — meilleur rapport qualité/prix : « ${bestValue.name} » (${bestValue.nutrition.valueIndex}), qualité : « ${bestQuality.name} » (${bestQuality.nutrition.qualityScore}/100).`,
    disclaimer: 'Valeurs nutritionnelles estimées à partir du libellé produit — vérifiez l’étiquette fabricant.',
  };
};

module.exports = { compareProducts, estimateNutrition };
