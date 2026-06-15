const { sigmoid, clamp01 } = require('./shared');

const petAgeYears = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let years = new Date().getFullYear() - birth.getFullYear();
  return Math.max(0, years);
};

const lifeStage = (pet) => {
  const y = petAgeYears(pet.birthDate);
  if (y == null) return 'adult';
  if (y < 1) return 'young';
  if (y >= 7 && ['dog', 'cat'].includes(pet.type)) return 'senior';
  return 'adult';
};

const predictProductFit = (product, pet, context = {}) => {
  const type = (pet.type || 'other').toLowerCase();
  const hay = `${product.name || ''} ${product.description || ''} ${product.category || ''}`.toLowerCase();
  let z = -0.5;

  if (product.animalType === type) z += 1.8;
  else if (product.animalType === 'other') z += 0.2;
  else return { modelId: 'product_fit_v1', fitScore: 0, skip: true };

  const stage = lifeStage(pet);
  if (stage === 'senior' && /senior|mature|7\+|âgé/i.test(hay)) z += 0.9;
  if (stage === 'young' && /junior|chiot|chaton|puppy/i.test(hay)) z += 0.9;
  if (stage === 'adult' && /adulte|adult|standard/i.test(hay)) z += 0.4;

  if (context.allergies) {
    const tokens = String(context.allergies).split(/[,;]+/).map((a) => a.trim().toLowerCase());
    if (tokens.some((t) => t.length > 2 && hay.includes(t))) {
      return { modelId: 'product_fit_v1', fitScore: 0, skip: true, allergyConflict: true };
    }
  }

  z += Math.min(Number(product.rating_avg || 0) / 5, 1) * 0.35;
  z += Math.min(Number(product.popularity || 0) / 100, 1) * 0.25;
  if (Number(product.stock || 1) <= 0) z -= 1.2;

  const fitScore = clamp01(sigmoid(z));
  return {
    modelId: 'product_fit_v1',
    modelType: 'logistic_regression',
    fitScore: Math.round(fitScore * 1000) / 1000,
    skip: fitScore < 0.2,
    lifeStage: stage,
  };
};

const rankSeniorDogProductsNode = ({ pet, products = [], orders = [], limit = 12 }) => {
  if (!pet || String(pet.type || '').toLowerCase() !== 'dog') return [];
  const stage = lifeStage(pet);
  if (stage !== 'senior') return [];

  const bought = new Set();
  for (const o of orders) {
    for (const it of o.items || []) {
      if (it.productId) bought.add(it.productId);
    }
  }

  return products
    .map((p) => {
      const ml = predictProductFit(p, pet, {});
      if (ml.skip) return null;
      const base = ml.fitScore;
      const rebuy = bought.has(p.id) ? 0.08 : 0;
      return {
        productId: p.id,
        productName: p.name,
        score: Math.round((base + rebuy) * 1000) / 1000,
        model: 'product_fit_v1',
        reasons: ['Patient senior', ml.fitScore >= 0.6 ? 'Forte adéquation ML' : 'Adéquation modérée'],
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

module.exports = { predictProductFit, rankSeniorDogProductsNode, lifeStage };
