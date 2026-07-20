const { prisma, isDemoMode } = require('../prismaClient');
const { DEFAULT_SPECIES } = require('../utils/seedAnimalSpecies');

const mapProfile = (row) => {
  let keywords = [];
  let features = {};
  let commonConditions = [];
  let medicationPriors = [];
  try {
    keywords = JSON.parse(row.keywordsJson || '[]');
  } catch {
    keywords = [];
  }
  try {
    features = JSON.parse(row.featuresJson || '{}');
  } catch {
    features = {};
  }
  try {
    commonConditions = JSON.parse(row.commonConditionsJson || '[]');
  } catch {
    commonConditions = [];
  }
  try {
    medicationPriors = JSON.parse(row.medicationPriorsJson || '[]');
  } catch {
    medicationPriors = [];
  }

  return {
    id: row.id,
    speciesCode: row.speciesCode,
    labelFr: row.labelFr,
    labelEn: row.labelEn,
    weightMinKg: row.weightMinKg,
    weightMaxKg: row.weightMaxKg,
    tempMinC: row.tempMinC,
    tempMaxC: row.tempMaxC,
    heartRateMin: row.heartRateMin,
    heartRateMax: row.heartRateMax,
    keywords,
    features,
    commonConditions,
    medicationPriors,
    active: row.active,
  };
};

const getDemoProfiles = () =>
  DEFAULT_SPECIES.map((s, i) =>
    mapProfile({
      id: `demo-species-${i}`,
      ...s,
      active: true,
    }),
  );

const listActiveSpeciesProfiles = async () => {
  if (isDemoMode()) return getDemoProfiles();

  const rows = await prisma.animalSpeciesProfile.findMany({
    where: { active: true },
    orderBy: { labelFr: 'asc' },
  });
  return rows.map(mapProfile);
};

const getSpeciesProfileByCode = async (speciesCode) => {
  if (isDemoMode()) {
    const found = getDemoProfiles().find((p) => p.speciesCode === speciesCode);
    return found || null;
  }
  const row = await prisma.animalSpeciesProfile.findUnique({
    where: { speciesCode },
  });
  return row ? mapProfile(row) : null;
};

const toMlPayload = (profiles) =>
  profiles.map((p) => ({
    species_code: p.speciesCode,
    label_fr: p.labelFr,
    keywords: p.keywords,
    weight_min_kg: p.weightMinKg,
    weight_max_kg: p.weightMaxKg,
    temp_min_c: p.tempMinC,
    temp_max_c: p.tempMaxC,
    features: p.features,
  }));

module.exports = {
  listActiveSpeciesProfiles,
  getSpeciesProfileByCode,
  toMlPayload,
  mapProfile,
};
