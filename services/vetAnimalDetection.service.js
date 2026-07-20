const { prisma, isDemoMode } = require('../prismaClient');
const {
  listActiveSpeciesProfiles,
  getSpeciesProfileByCode,
  toMlPayload,
} = require('./animalSpeciesProfile.service');
const { fetchVetAnimalDetect } = require('./mlPythonClient');

const demoDetections = [];

const normalizeText = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const ruleBasedDetect = (description, profiles, { weightKg, temperatureC, breedHint } = {}) => {
  const text = normalizeText(`${description} ${breedHint || ''}`);
  const scored = profiles.map((p) => {
    const hits = (p.keywords || []).filter((kw) => text.includes(normalizeText(kw))).length;
    let score = hits / Math.max((p.keywords || []).length, 1);
    if (weightKg != null && p.weightMinKg != null && p.weightMaxKg != null) {
      if (weightKg >= p.weightMinKg && weightKg <= p.weightMaxKg) score += 0.25;
    }
    if (temperatureC != null && p.tempMinC != null && p.tempMaxC != null) {
      if (temperatureC >= p.tempMinC && temperatureC <= p.tempMaxC) score += 0.15;
    }
    return { profile: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.profile || profiles.find((p) => p.speciesCode === 'other') || profiles[0];
  const total = scored.reduce((s, x) => s + x.score, 0) || 1;
  const alternatives = scored.slice(0, 5).map((x) => ({
    speciesCode: x.profile.speciesCode,
    label: x.profile.labelFr,
    confidence: Math.round((x.score / total) * 1000) / 1000,
  }));

  return {
    modelVersion: 'animal_species_v1_local',
    detectedSpeciesCode: top.speciesCode,
    detectedLabel: top.labelFr,
    confidence: alternatives[0]?.confidence || 0.5,
    alternatives,
    source: 'local',
  };
};

const matchPetsFromDb = async ({ ownerId, speciesCode, description }) => {
  if (!ownerId) return [];

  const pets = await prisma.pet.findMany({
    where: { ownerId },
    select: {
      id: true,
      name: true,
      type: true,
      breed: true,
      weight: true,
      notes: true,
    },
  });

  const text = normalizeText(description);
  return pets
    .map((pet) => {
      let score = 0;
      if (pet.type && normalizeText(pet.type).includes(speciesCode)) score += 0.4;
      if (pet.name && text.includes(normalizeText(pet.name))) score += 0.5;
      if (pet.breed && text.includes(normalizeText(pet.breed))) score += 0.2;
      return { ...pet, matchScore: score };
    })
    .filter((p) => p.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
};

const persistDetection = async (vetId, input, mlResult, matchedPets) => {
  const profile = await getSpeciesProfileByCode(mlResult.detectedSpeciesCode);
  const payload = {
    vetId: vetId || null,
    ownerId: input.ownerId || null,
    petId: input.petId || matchedPets[0]?.id || null,
    speciesProfileId: profile?.id || null,
    inputDescription: input.description,
    detectedSpeciesCode: mlResult.detectedSpeciesCode,
    confidence: mlResult.confidence,
    matchedPetId: matchedPets[0]?.id || null,
    alternativesJson: JSON.stringify(mlResult.alternatives || []),
    featuresJson: JSON.stringify(mlResult.features || {}),
    modelVersion: mlResult.modelVersion || 'animal_species_v1',
    resultJson: JSON.stringify({ ...mlResult, matchedPets }),
  };

  if (isDemoMode()) {
    const row = { id: `demo-detect-${Date.now()}`, ...payload, createdAt: new Date() };
    demoDetections.unshift(row);
    return row;
  }

  return prisma.vetAnimalDetection.create({ data: payload });
};

const detectAnimal = async (user, body) => {
  const vetId = String(user?.id || user?._id || '');
  const { description, weightKg, temperatureC, breedHint, ownerId, petId } = body;

  if (!description || !String(description).trim()) {
    const err = new Error('Décrivez l\'animal (espèce, race, signes distinctifs)');
    err.status = 400;
    throw err;
  }

  const profiles = await listActiveSpeciesProfiles();
  let mlResult = null;

  try {
    mlResult = await fetchVetAnimalDetect({
      description: String(description).trim(),
      weight_kg: weightKg != null ? Number(weightKg) : null,
      temperature_c: temperatureC != null ? Number(temperatureC) : null,
      breed_hint: breedHint || null,
      species_profiles: toMlPayload(profiles),
    });
    if (mlResult) mlResult.source = 'python';
  } catch {
    mlResult = null;
  }

  if (!mlResult?.detectedSpeciesCode) {
    mlResult = ruleBasedDetect(String(description).trim(), profiles, {
      weightKg: weightKg != null ? Number(weightKg) : null,
      temperatureC: temperatureC != null ? Number(temperatureC) : null,
      breedHint,
    });
  }

  const speciesProfile = await getSpeciesProfileByCode(mlResult.detectedSpeciesCode);
  const matchedPets = isDemoMode()
    ? []
    : await matchPetsFromDb({
        ownerId,
        speciesCode: mlResult.detectedSpeciesCode,
        description,
      });

  const saved = await persistDetection(
    vetId,
    { description, ownerId, petId, weightKg, temperatureC, breedHint },
    mlResult,
    matchedPets,
  );

  return {
    detectionId: saved.id,
    ...mlResult,
    speciesProfile: speciesProfile
      ? {
          speciesCode: speciesProfile.speciesCode,
          label: speciesProfile.labelFr,
          commonConditions: speciesProfile.commonConditions,
          medicationPriors: speciesProfile.medicationPriors,
          vitalsNorms: {
            weightMinKg: speciesProfile.weightMinKg,
            weightMaxKg: speciesProfile.weightMaxKg,
            tempMinC: speciesProfile.tempMinC,
            tempMaxC: speciesProfile.tempMaxC,
          },
        }
      : null,
    matchedPets,
    disclaimer:
      'Détection assistée par IA — valider espèce et identité avec le dossier patient.',
  };
};

const listRecentDetections = async (vetId, limit = 10) => {
  if (isDemoMode()) {
    return demoDetections.slice(0, limit).map((row) => ({
      id: row.id,
      description: row.inputDescription?.slice(0, 80),
      speciesCode: row.detectedSpeciesCode,
      confidence: row.confidence,
      createdAt: row.createdAt,
    }));
  }

  const rows = await prisma.vetAnimalDetection.findMany({
    where: vetId ? { vetId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      inputDescription: true,
      detectedSpeciesCode: true,
      confidence: true,
      createdAt: true,
      matchedPetId: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    description: r.inputDescription?.slice(0, 80),
    speciesCode: r.detectedSpeciesCode,
    confidence: r.confidence,
    matchedPetId: r.matchedPetId,
    createdAt: r.createdAt,
  }));
};

module.exports = {
  detectAnimal,
  listRecentDetections,
  matchPetsFromDb,
};
