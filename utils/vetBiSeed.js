const { prisma } = require('../prismaClient');

const DEFAULT_PHARMACY = {
  name: 'PharmaVet Tunis — Partenaire PetfoodTN',
  address: '12 Av. Habib Bourguiba, Tunis',
  phone: '+216 71 000 000',
  email: 'contact@pharmavet.tn',
  isPartner: true,
};

const DEFAULT_DISEASES = [
  { name: 'Gastro-entérite légère', animalTypes: 'dog,cat', meds: [{ name: 'Oméprazole', dosage: '5 mg', frequency: '2x/jour', duration: '7 jours', quantity: 14, unit: 'comprimés' }, { name: 'Probiotiques FortiFlora', dosage: '1 sachet', frequency: '1x/jour', duration: '10 jours', quantity: 10, unit: 'sachets' }] },
  { name: 'Allergie cutanée', animalTypes: 'dog,cat', meds: [{ name: 'Cétirizine', dosage: '10 mg', frequency: '1x/jour', duration: '14 jours', quantity: 14, unit: 'comprimés' }, { name: 'Shampooing Apaisant', dosage: '1 bain', frequency: '2x/semaine', duration: '4 semaines', quantity: 1, unit: 'flacon' }] },
  { name: 'Parasites externes', animalTypes: 'dog,cat', meds: [{ name: 'Fipronil Spot-on', dosage: '1 pipette', frequency: '1x/mois', duration: '3 mois', quantity: 3, unit: 'pipettes' }] },
  { name: 'Arthrite modérée', animalTypes: 'dog,cat', meds: [{ name: 'Méloxicam', dosage: '0.1 mg/kg', frequency: '1x/jour', duration: '21 jours', quantity: 21, unit: 'comprimés' }, { name: 'Glucosamine + Chondroïtine', dosage: '1 gélule', frequency: '1x/jour', duration: '60 jours', quantity: 60, unit: 'gélules' }] },
  { name: 'Infection urinaire', animalTypes: 'dog,cat', meds: [{ name: 'Amoxicilline', dosage: '250 mg', frequency: '2x/jour', duration: '10 jours', quantity: 20, unit: 'comprimés' }] },
  { name: 'Otite externe', animalTypes: 'dog,cat', meds: [{ name: 'Gouttes auriculaires Enrofloxacine', dosage: '5 gouttes', frequency: '2x/jour', duration: '10 jours', quantity: 1, unit: 'flacon' }] },
  { name: 'Diabète', animalTypes: 'dog,cat', meds: [{ name: 'Insuline Caninsulin', dosage: '0.5 UI/kg', frequency: '2x/jour', duration: '30 jours', quantity: 2, unit: 'flacons' }] },
  { name: 'Toux du chenil', animalTypes: 'dog', meds: [{ name: 'Doxycycline', dosage: '100 mg', frequency: '1x/jour', duration: '14 jours', quantity: 14, unit: 'comprimés' }] },
];

const ensureVetBiSeed = async () => {
  const count = await prisma.disease.count();
  if (count > 0) return false;

  const pharmacy = await prisma.pharmacy.create({ data: DEFAULT_PHARMACY });

  for (const d of DEFAULT_DISEASES) {
    const disease = await prisma.disease.create({
      data: { name: d.name, animalTypes: d.animalTypes, description: `Référentiel BI — ${d.name}` },
    });

    for (const m of d.meds) {
      let med = await prisma.vetMedication.findFirst({
        where: { name: m.name, pharmacyId: pharmacy.id },
      });
      if (!med) {
        med = await prisma.vetMedication.create({
          data: {
            name: m.name,
            unit: m.unit,
            stockQty: Math.max(m.quantity * 3, 20),
            minStock: m.quantity,
            pharmacyId: pharmacy.id,
          },
        });
      }

      await prisma.diseaseTreatment.create({
        data: {
          diseaseId: disease.id,
          medicationId: med.id,
          defaultDosage: m.dosage,
          defaultFrequency: m.frequency,
          defaultDuration: m.duration,
          defaultQuantity: m.quantity,
        },
      });
    }
  }

  return true;
};

module.exports = { ensureVetBiSeed, DEFAULT_DISEASES };
