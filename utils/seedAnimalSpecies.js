/**
 * Profils espèces pour le modèle ML de détection animal (référentiel base).
 */
const DEFAULT_SPECIES = [
  {
    speciesCode: 'dog',
    labelFr: 'Chien',
    labelEn: 'Dog',
    weightMinKg: 2,
    weightMaxKg: 80,
    tempMinC: 37.5,
    tempMaxC: 39.2,
    heartRateMin: 60,
    heartRateMax: 160,
    keywordsJson: JSON.stringify([
      'chien', 'dog', 'canin', 'rottweiler', 'berger', 'labrador', 'caniche',
      'aboiement', 'laisse', 'toutou', 'chiot',
    ]),
    featuresJson: JSON.stringify({ size_small: 0, size_large: 1 }),
    commonConditionsJson: JSON.stringify(['Dermatite', 'Arthrose', 'Otite', 'Parasites']),
    medicationPriorsJson: JSON.stringify(['Amoxicilline', 'Carprofène', 'Oméprazole']),
  },
  {
    speciesCode: 'cat',
    labelFr: 'Chat',
    labelEn: 'Cat',
    weightMinKg: 2,
    weightMaxKg: 12,
    tempMinC: 37.8,
    tempMaxC: 39.5,
    heartRateMin: 120,
    heartRateMax: 220,
    keywordsJson: JSON.stringify([
      'chat', 'cat', 'félin', 'felin', 'miaulement', 'ronronnement',
      'siamois', 'persan', 'chaton',
    ]),
    featuresJson: JSON.stringify({ size_small: 1, size_large: 0 }),
    commonConditionsJson: JSON.stringify(['Coryza', 'Insuffisance rénale', 'Diabète', 'Asthme félin']),
    medicationPriorsJson: JSON.stringify(['Amoxicilline', 'Métronidazole', 'Oméprazole']),
  },
  {
    speciesCode: 'bird',
    labelFr: 'Oiseau',
    labelEn: 'Bird',
    weightMinKg: 0.02,
    weightMaxKg: 3,
    tempMinC: 40,
    tempMaxC: 42,
    heartRateMin: 200,
    heartRateMax: 600,
    keywordsJson: JSON.stringify([
      'oiseau', 'bird', 'perroquet', 'canari', 'pigeon', 'plume', 'cage', 'volaille',
    ]),
    featuresJson: JSON.stringify({ avian: 1 }),
    commonConditionsJson: JSON.stringify(['Plume arrachée', 'Maladie de Pacheco', 'Coccidiose']),
    medicationPriorsJson: JSON.stringify(['Doxycycline', 'Ivermectine aviaire']),
  },
  {
    speciesCode: 'rabbit',
    labelFr: 'Lapin',
    labelEn: 'Rabbit',
    weightMinKg: 0.8,
    weightMaxKg: 8,
    tempMinC: 38,
    tempMaxC: 40,
    heartRateMin: 130,
    heartRateMax: 325,
    keywordsJson: JSON.stringify(['lapin', 'rabbit', 'rongeur', 'nain', 'oreilles longues']),
    featuresJson: JSON.stringify({ herbivore: 1 }),
    commonConditionsJson: JSON.stringify(['Stase digestive', 'Pasteurellose', 'Dents']),
    medicationPriorsJson: JSON.stringify(['Métronidazole', 'Meloxicam lapin']),
  },
  {
    speciesCode: 'fish',
    labelFr: 'Poisson',
    labelEn: 'Fish',
    weightMinKg: 0.001,
    weightMaxKg: 5,
    keywordsJson: JSON.stringify([
      'poisson', 'fish', 'aquarium', 'nageoire', 'écaille', 'ecaille', 'carpes', 'goldfish',
    ]),
    featuresJson: JSON.stringify({ aquatic: 1 }),
    commonConditionsJson: JSON.stringify(['Ichtyophthirius', 'Nageoire pourrie', 'Ammoniac']),
    medicationPriorsJson: JSON.stringify(['Sel marin thérapeutique', 'Méthylène bleu']),
  },
  {
    speciesCode: 'reptile',
    labelFr: 'Reptile',
    labelEn: 'Reptile',
    weightMinKg: 0.05,
    weightMaxKg: 50,
    tempMinC: 25,
    tempMaxC: 35,
    keywordsJson: JSON.stringify([
      'reptile', 'serpent', 'lézard', 'lezard', 'tortue', 'iguane', 'gecko',
    ]),
    featuresJson: JSON.stringify({ ectotherm: 1 }),
    commonConditionsJson: JSON.stringify(['Métabolisme osseux', 'Parasites', 'Brumation']),
    medicationPriorsJson: JSON.stringify(['Albendazole', 'Enrofloxacine reptile']),
  },
  {
    speciesCode: 'other',
    labelFr: 'Autre / NAC',
    labelEn: 'Other',
    weightMinKg: 0.01,
    weightMaxKg: 100,
    keywordsJson: JSON.stringify(['nac', 'furet', 'hamster', 'cochon', 'indéterminé', 'autre']),
    featuresJson: JSON.stringify({ exotic: 1 }),
    commonConditionsJson: JSON.stringify(['Examen spécialisé requis']),
    medicationPriorsJson: JSON.stringify([]),
  },
];

const seedAnimalSpeciesProfiles = async (prisma) => {
  const count = await prisma.animalSpeciesProfile.count();
  if (count >= DEFAULT_SPECIES.length) {
    console.log(`ℹ️  ${count} profil(s) espèce déjà en base`);
    return count;
  }

  for (const row of DEFAULT_SPECIES) {
    await prisma.animalSpeciesProfile.upsert({
      where: { speciesCode: row.speciesCode },
      create: row,
      update: {
        labelFr: row.labelFr,
        labelEn: row.labelEn,
        weightMinKg: row.weightMinKg,
        weightMaxKg: row.weightMaxKg,
        tempMinC: row.tempMinC,
        tempMaxC: row.tempMaxC,
        heartRateMin: row.heartRateMin,
        heartRateMax: row.heartRateMax,
        keywordsJson: row.keywordsJson,
        featuresJson: row.featuresJson,
        commonConditionsJson: row.commonConditionsJson,
        medicationPriorsJson: row.medicationPriorsJson,
        active: true,
      },
    });
  }

  console.log(`✅ ${DEFAULT_SPECIES.length} profils espèce ML (AnimalSpeciesProfile)`);
  return DEFAULT_SPECIES.length;
};

module.exports = { seedAnimalSpeciesProfiles, DEFAULT_SPECIES };
