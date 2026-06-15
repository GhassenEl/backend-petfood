const { getPersonalizedRecommendations } = require('../aiRecommendationAgent.service');
const { getPetRecommendations } = require('../petRecommendation.service');
const { prisma } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);

const activityMultiplier = (level) => ({ low: 0.9, moderate: 1, high: 1.15, very_high: 1.3 }[level] || 1);

const computeNutritionNeeds = (pet, activityLevel = 'moderate') => {
  const w = Number(pet?.weight) || (pet?.type === 'cat' ? 4 : 12);
  const mult = pet?.type === 'cat' ? 70 : 95;
  const baseKcal = Math.round(mult * Math.pow(w, 0.75) * activityMultiplier(activityLevel));
  const proteinPct = pet?.type === 'cat' ? 30 : 26;
  const fatPct = pet?.type === 'cat' ? 18 : 16;
  return {
    dailyKcal: baseKcal,
    proteinPercent: proteinPct,
    fatPercent: fatPct,
    mealsPerDay: pet?.type === 'cat' ? 3 : 2,
    waterLiters: Math.round((w * 0.05 + 0.2) * 10) / 10,
    notes: pet?.allergies ? `Attention allergies : ${pet.allergies}` : null,
  };
};

const getFullPersonalizedPack = async (user, { petId, activityLevel = 'moderate' } = {}) => {
  const userId = uid(user);
  const [personalized, petReco] = await Promise.all([
    getPersonalizedRecommendations(user, { petId, limit: 10 }),
    getPetRecommendations(user, { petId, limit: 10 }),
  ]);

  const pet =
    petReco?.pet ||
    (petId ? await prisma.pet.findFirst({ where: { id: petId, ownerId: userId } }) : null) ||
    (await prisma.pet.findFirst({ where: { ownerId: userId } }));

  const nutrition = pet ? computeNutritionNeeds(pet, activityLevel) : null;

  const complementary = (petReco.recommendations || [])
    .filter((p) => /jouet|accessoire|litière|shampoo|complément|vitamin/i.test(`${p.name} ${p.category}`))
    .slice(0, 5);

  const mainFood = (petReco.recommendations || [])
    .filter((p) => !complementary.find((c) => c.id === p.id))
    .slice(0, 6);

  return {
    pet: petReco.pet || pet,
    nutrition,
    activityLevel,
    mainFoodRecommendations: mainFood,
    complementaryProducts: complementary,
    aiSummary: personalized.summary,
    trends: personalized.trends,
    churnMl: personalized.churnMl,
    models: ['product_fit_v1', 'nutrition_calculator_v1', 'churn_logistic_v1', personalized.aiPowered ? 'groq' : null].filter(Boolean),
  };
};

module.exports = { getFullPersonalizedPack, computeNutritionNeeds };
