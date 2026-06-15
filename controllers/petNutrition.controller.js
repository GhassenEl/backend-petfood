const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { prisma } = require('../prismaClient');
const productRepository = require('../repositories/product.repository');
const {
  buildAllPetNutritionRecommendations,
  buildPetNutritionRecommendation,
  matchProductsForPet,
} = require('../utils/petNutritionRecommender');

const parseOptions = (query = {}) => ({
  activityLevel: query.activityLevel || 'moyen',
  goal: query.goal || 'maintien',
  isNeutered: query.isNeutered !== 'false' && query.isNeutered !== '0',
  mealCount: query.mealCount ? Number(query.mealCount) : 2,
  kcalPer100g: query.kcalPer100g ? Number(query.kcalPer100g) : 350,
  productLimit: query.productLimit ? Number(query.productLimit) : 3,
});

const resolveOwnerIds = async (req) => {
  const ownerIds = [req.user.id || req.user._id];
  if (req.user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(req.user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id && !ownerIds.includes(dbUser.id)) ownerIds.push(dbUser.id);
  }
  return ownerIds;
};

const loadPets = async (req, petId = null) => {
  if (isDemoMode()) {
    const user = demoStore.getUserById(req.user._id);
    const pets = user?.pets || [];
    if (petId) return pets.filter((p) => (p.id || p._id) === petId);
    return pets;
  }

  const ownerIds = await resolveOwnerIds(req);
  const where = { ownerId: { in: ownerIds } };
  if (petId) where.id = petId;
  return prisma.pet.findMany({ where, orderBy: { createdAt: 'asc' } });
};

const attachProducts = async (recommendations, options) => {
  const includeProducts = options.includeProducts !== false;
  if (!includeProducts) return recommendations;

  let products = [];
  try {
    products = isDemoMode()
      ? demoStore.getProducts()
      : await productRepository.findAll();
  } catch {
    products = [];
  }

  const limit = options.productLimit || 3;
  return recommendations.map((rec) => ({
    ...rec,
    suggestedProducts: matchProductsForPet(products, rec, limit).map((p) => ({
      id: p.id || p._id,
      _id: p.id || p._id,
      name: p.name,
      price: p.price,
      discount: p.discount,
      stock: p.stock,
      animalType: p.animalType,
      imageUrl: p.imageUrl || p.image,
      recommendedReason: p.recommendedReason,
      nutritionMatchScore: p.nutritionMatchScore,
    })),
  }));
};

const getAllPetNutrition = async (req, res) => {
  try {
    const options = parseOptions(req.query);
    const pets = await loadPets(req);
    let results = buildAllPetNutritionRecommendations(pets, options);
    results = await attachProducts(results, {
      ...options,
      includeProducts: req.query.includeProducts !== 'false',
    });

    res.json({
      options,
      pets: results,
      source: 'api',
      count: results.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur recommandations nutrition' });
  }
};

const getPetNutritionById = async (req, res) => {
  try {
    const options = parseOptions(req.query);
    const { petId } = req.params;
    const pets = await loadPets(req, petId);
    const pet = pets[0];

    if (!pet) return res.status(404).json({ error: 'Animal introuvable' });

    let result = buildPetNutritionRecommendation(pet, options);
    [result] = await attachProducts([result], {
      ...options,
      includeProducts: req.query.includeProducts !== 'false',
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur recommandation nutrition' });
  }
};

const postCalculateNutrition = async (req, res) => {
  try {
    const options = parseOptions({ ...req.query, ...(req.body?.options || {}), ...req.body });
    const pet = req.body?.pet || req.body;
    if (!pet) return res.status(400).json({ error: 'Données animal requises' });

    let result = buildPetNutritionRecommendation(pet, options);
    [result] = await attachProducts([result], options);

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Calcul nutrition impossible' });
  }
};

module.exports = {
  getAllPetNutrition,
  getPetNutritionById,
  postCalculateNutrition,
};
