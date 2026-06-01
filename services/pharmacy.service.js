const { prisma, isDemoMode } = require('../prismaClient');

const DOSE_MG_PER_KG = {
  amoxicilline: { dog: 15, cat: 12, maxMg: 500 },
  métronidazole: { dog: 10, cat: 10, maxMg: 250 },
  metronidazole: { dog: 10, cat: 10, maxMg: 250 },
  oméprazole: { dog: 0.7, cat: 0.7, maxMg: 20 },
  omeprazole: { dog: 0.7, cat: 0.7, maxMg: 20 },
  carprofène: { dog: 4, cat: 0, maxMg: 75 },
  carprofene: { dog: 4, cat: 0, maxMg: 75 },
  default: { dog: 5, cat: 4, maxMg: 200 },
};

const normalizeAnimal = (t) => {
  const s = (t || 'dog').toLowerCase();
  if (s.includes('chat') || s === 'cat') return 'cat';
  return 'dog';
};

const findDoseRule = (medicationName) => {
  const lower = (medicationName || '').toLowerCase();
  for (const [key, rule] of Object.entries(DOSE_MG_PER_KG)) {
    if (key !== 'default' && lower.includes(key)) return rule;
  }
  return DOSE_MG_PER_KG.default;
};

const calculateDose = ({ medicationName, weightKg, animalType, mgPerKg }) => {
  const weight = Number(weightKg);
  if (!weight || weight <= 0) {
    return { error: 'Poids animal invalide' };
  }
  const species = normalizeAnimal(animalType);
  const rule = findDoseRule(medicationName);
  const rate = mgPerKg != null ? Number(mgPerKg) : rule[species] ?? rule.dog;
  if (!rate || rate <= 0) {
    return { error: 'Posologie non applicable pour cette espèce' };
  }
  let totalMg = Math.round(rate * weight * 10) / 10;
  if (rule.maxMg && totalMg > rule.maxMg) totalMg = rule.maxMg;

  return {
    dosage: `${totalMg} mg`,
    dosageDetail: `${rate} mg/kg × ${weight} kg`,
    frequency: species === 'cat' ? '1×/12h' : '1×/12h',
    duration: '7 jours',
    quantity: 14,
    unit: 'mg',
    mgPerKg: rate,
    totalMg,
  };
};

const getMedicationCatalog = async () => {
  if (isDemoMode()) {
    return [
      { id: 'demo1', name: 'Amoxicilline', unit: 'comprimé', stockQty: 120, minStock: 10, lowStock: false },
      { id: 'demo2', name: 'Oméprazole', unit: 'gélule', stockQty: 45, minStock: 5, lowStock: false },
      { id: 'demo3', name: 'Carprofène', unit: 'comprimé', stockQty: 3, minStock: 5, lowStock: true },
    ];
  }

  const meds = await prisma.vetMedication.findMany({
    orderBy: { name: 'asc' },
    include: {
      pharmacy: { select: { name: true } },
      treatments: {
        include: { disease: { select: { name: true } } },
      },
    },
  });

  return meds.map((m) => ({
    id: m.id,
    name: m.name,
    unit: m.unit,
    stockQty: m.stockQty,
    minStock: m.minStock,
    price: m.price,
    pharmacy: m.pharmacy?.name,
    lowStock: m.stockQty <= m.minStock,
    treatments: (m.treatments || []).map((t) => ({
      disease: t.disease?.name,
      defaultDosage: t.defaultDosage,
      defaultFrequency: t.defaultFrequency,
      defaultDuration: t.defaultDuration,
      defaultQuantity: t.defaultQuantity,
    })),
  }));
};

const suggestByDiagnosis = async (diagnosis, animalType) => {
  if (!diagnosis || !String(diagnosis).trim()) return [];

  if (isDemoMode()) {
    return [
      {
        name: 'Amoxicilline',
        dosage: '250 mg',
        frequency: '2×/jour',
        duration: '7 jours',
        quantity: 14,
        stockQty: 120,
      },
    ];
  }

  const term = String(diagnosis).trim();
  const diseases = await prisma.disease.findMany({
    where: { name: { contains: term } },
    include: {
      treatments: {
        include: { medication: true },
      },
    },
    take: 3,
  });

  if (!diseases.length) {
    const fuzzy = await prisma.disease.findMany({
      include: { treatments: { include: { medication: true } } },
      take: 20,
    });
    const match = fuzzy.filter((d) =>
      term.toLowerCase().split(/\s+/).some((w) => w.length > 3 && d.name.toLowerCase().includes(w))
    );
    diseases.push(...match.slice(0, 2));
  }

  const suggestions = [];
  const seen = new Set();
  for (const disease of diseases) {
    for (const t of disease.treatments || []) {
      const med = t.medication;
      if (!med || seen.has(med.id)) continue;
      seen.add(med.id);
      suggestions.push({
        medicationId: med.id,
        name: med.name,
        dosage: t.defaultDosage || '',
        frequency: t.defaultFrequency || '1×/jour',
        duration: t.defaultDuration || '7 jours',
        quantity: t.defaultQuantity || 1,
        stockQty: med.stockQty,
        lowStock: med.stockQty <= med.minStock,
        disease: disease.name,
        notes: t.notes,
      });
    }
  }
  return suggestions;
};

const deductStockForPrescription = async (medications) => {
  if (isDemoMode()) return { deducted: [], warnings: [] };

  const list = Array.isArray(medications) ? medications : [];
  const deducted = [];
  const warnings = [];

  for (const med of list) {
    const name = (med.name || '').trim();
    if (!name) continue;
    const qty = Math.max(1, Number(med.quantity) || 1);

    const record = await prisma.vetMedication.findFirst({
      where: { name: { contains: name.split(' ')[0] } },
      orderBy: { stockQty: 'desc' },
    });

    if (!record) {
      warnings.push({ name, message: 'Non trouvé en pharmacie — stock non déduit' });
      continue;
    }
    if (record.stockQty < qty) {
      warnings.push({
        name: record.name,
        message: `Stock insuffisant (${record.stockQty} restant, ${qty} demandé)`,
      });
    }

    const newQty = Math.max(0, record.stockQty - qty);
    await prisma.vetMedication.update({
      where: { id: record.id },
      data: { stockQty: newQty },
    });
    deducted.push({ id: record.id, name: record.name, quantity: qty, remaining: newQty });
  }

  return { deducted, warnings };
};

const getLowStockAlerts = async () => {
  if (isDemoMode()) {
    return [{ id: 'demo3', name: 'Carprofène', stockQty: 3, minStock: 5, unit: 'comprimé' }];
  }
  const all = await prisma.vetMedication.findMany({ orderBy: { stockQty: 'asc' } });
  return all
    .filter((m) => m.stockQty <= m.minStock)
    .map((m) => ({
      id: m.id,
      name: m.name,
      stockQty: m.stockQty,
      minStock: m.minStock,
      unit: m.unit,
    }));
};

module.exports = {
  calculateDose,
  getMedicationCatalog,
  suggestByDiagnosis,
  deductStockForPrescription,
  getLowStockAlerts,
};
