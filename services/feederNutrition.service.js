const { prisma } = require('../prismaClient');

const DAILY_GRAMS_PER_KG = {
  dog: { young: 40, adult: 25, senior: 22 },
  cat: { young: 45, adult: 30, senior: 28 },
  bird: { young: 15, adult: 12, senior: 10 },
  fish: { young: 5, adult: 4, senior: 4 },
  rabbit: { young: 35, adult: 25, senior: 22 },
  other: { young: 30, adult: 22, senior: 20 },
};

const getLifeStage = (pet) => {
  if (!pet?.birthDate) return 'adult';
  const birth = new Date(pet.birthDate);
  const years = (Date.now() - birth.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return 'young';
  if (years >= 7 && ['dog', 'cat'].includes(pet.type)) return 'senior';
  return 'adult';
};

const calculateDailyGrams = (pet) => {
  const type = pet?.type || 'other';
  const weight = Number(pet?.weight || 4);
  const stage = getLifeStage(pet);
  const perKg = DAILY_GRAMS_PER_KG[type]?.[stage] || DAILY_GRAMS_PER_KG.other[stage];
  return Math.round(weight * perKg);
};

const buildNutritionPlan = async (ownerIds, petId, petName) => {
  let pet = null;
  if (petId) {
    pet = await prisma.pet.findFirst({ where: { id: petId, ownerId: { in: ownerIds } } });
  }
  if (!pet && petName) {
    pet = await prisma.pet.findFirst({
      where: { ownerId: { in: ownerIds }, name: petName },
    });
  }
  if (!pet) {
    const pets = await prisma.pet.findMany({ where: { ownerId: { in: ownerIds } }, take: 1 });
    pet = pets[0] || null;
  }

  const dailyGrams = pet ? calculateDailyGrams(pet) : 60;
  const mealsPerDay = 2;
  const portionGrams = Math.round(dailyGrams / mealsPerDay);

  return {
    pet: pet ? { id: pet.id, name: pet.name, type: pet.type, weight: pet.weight } : null,
    dailyGrams,
    mealsPerDay,
    portionGrams,
    suggestedSchedules: [
      { time: '08:00', portionGrams, label: 'Petit-déjeuner' },
      { time: '18:00', portionGrams, label: 'Dîner' },
    ],
    tips: [
      `Portion recommandée : ${portionGrams} g par repas (${dailyGrams} g/jour)`,
      'Ajustez selon l’activité et l’avis du vétérinaire',
      'Réservoir vide → LED rouge + alerte application',
    ],
  };
};

module.exports = {
  calculateDailyGrams,
  buildNutritionPlan,
  getLifeStage,
};
