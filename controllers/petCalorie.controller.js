const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { prisma } = require('../prismaClient');
const { calculatePetCalories } = require('../utils/petCalorieCalculator');

const parseOptions = (query = {}) => ({
  activityLevel: query.activityLevel || 'moyen',
  goal: query.goal || 'maintien',
  isNeutered: query.isNeutered !== 'false' && query.isNeutered !== '0',
  mealCount: query.mealCount ? Number(query.mealCount) : 2,
  kcalPer100g: query.kcalPer100g ? Number(query.kcalPer100g) : 350,
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

const getAllPetCalories = async (req, res) => {
  try {
    const options = parseOptions(req.query);
    let pets = [];

    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      pets = user?.pets || [];
    } else {
      const ownerIds = await resolveOwnerIds(req);
      pets = await prisma.pet.findMany({ where: { ownerId: { in: ownerIds } } });
    }

    const results = pets.map((pet) => calculatePetCalories(pet, options));
    res.json({ options, pets: results });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur calcul calories' });
  }
};

const getPetCaloriesById = async (req, res) => {
  try {
    const options = parseOptions(req.query);
    const { petId } = req.params;
    let pet = null;

    if (isDemoMode()) {
      const user = demoStore.getUserById(req.user._id);
      pet = (user?.pets || []).find((p) => (p.id || p._id) === petId);
    } else {
      const ownerIds = await resolveOwnerIds(req);
      pet = await prisma.pet.findFirst({
        where: { id: petId, ownerId: { in: ownerIds } },
      });
    }

    if (!pet) return res.status(404).json({ error: 'Animal introuvable' });

    res.json(calculatePetCalories(pet, options));
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erreur calcul calories' });
  }
};

const postCalculateCalories = async (req, res) => {
  try {
    const options = parseOptions({ ...req.query, ...(req.body?.options || {}), ...req.body });
    const pet = req.body?.pet || req.body;
    if (!pet) return res.status(400).json({ error: 'Données animal requises' });
    res.json(calculatePetCalories(pet, options));
  } catch (error) {
    res.status(400).json({ error: error.message || 'Calcul impossible' });
  }
};

module.exports = {
  getAllPetCalories,
  getPetCaloriesById,
  postCalculateCalories,
};
