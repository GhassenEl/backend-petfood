const { prisma, isDemoMode } = require('../prismaClient');
const { calculatePetCalories } = require('../utils/petCalorieCalculator');
const { getHealthRecommendations } = require('./healthRecommendations.service');

const buildNutritionRecommendation = async ({ ownerId, petName }) => {
  if (!ownerId || !petName) {
    const err = new Error('ownerId et petName requis');
    err.status = 400;
    throw err;
  }

  let pet = null;
  let plans = [];

  if (isDemoMode()) {
    pet = { name: petName, type: 'dog', weight: 10, birthDate: null };
    return {
      petName,
      ownerId,
      pet,
      calories: calculatePetCalories(pet, { goal: 'maintien', activityLevel: 'moyen' }),
      nutritionPlans: [],
      productRecommendations: await getHealthRecommendations('dog'),
      summary:
        'Mode démo : recommandez une alimentation adaptée au poids et à l’activité. Validez avec NutriPro côté client.',
    };
  }

  pet = await prisma.pet.findFirst({
    where: { ownerId, name: petName },
  });

  const petType = pet?.type || 'dog';
  const calories = calculatePetCalories(
    {
      name: petName,
      type: petType,
      weight: pet?.weight,
      birthDate: pet?.birthDate,
    },
    { goal: 'maintien', activityLevel: 'moyen', mealCount: 2 }
  );

  plans = await prisma.nutritionPlan.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const filteredPlans = plans.filter(
    (p) => !p.petName || p.petName === petName
  );

  const productRecommendations = await getHealthRecommendations(petType);

  const lines = [];
  if (calories.supported) {
    lines.push(
      `Apport estimé : ${calories.dailyKcal} kcal/jour (~${calories.dryFoodGramsPerDay} g croquettes, ${calories.gramsPerMeal} g × ${calories.mealCount} repas).`
    );
  } else if (calories.needsWeight) {
    lines.push('Poids non renseigné — demander une pesée à la prochaine consultation.');
  }

  if (filteredPlans.length) {
    lines.push(
      `Dernier plan NutriPro (${new Date(filteredPlans[0].createdAt).toLocaleDateString('fr-FR')}) : voir détail ci-dessous.`
    );
  }

  lines.push(
    `Privilégier des produits ${petType === 'cat' ? 'riches en taurine' : 'à protéines animales claires'} ; limiter friandises à <10 % des kcal.`
  );

  return {
    petName,
    ownerId,
    pet: pet
      ? {
          id: pet.id,
          name: pet.name,
          type: pet.type,
          weight: pet.weight,
          breed: pet.breed,
          birthDate: pet.birthDate,
        }
      : { name: petName, type: petType },
    calories,
    nutritionPlans: filteredPlans.map((p) => ({
      id: p.id,
      petName: p.petName,
      goal: p.goal,
      planText: p.planText,
      source: p.source,
      createdAt: p.createdAt,
    })),
    productRecommendations: {
      food: productRecommendations.food?.slice(0, 4) || [],
      accessories: productRecommendations.accessories?.slice(0, 3) || [],
    },
    summary: lines.join(' '),
  };
};

module.exports = { buildNutritionRecommendation };
