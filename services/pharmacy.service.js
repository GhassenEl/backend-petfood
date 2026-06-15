const { prisma, isDemoMode } = require('../prismaClient');

const DEMO_CATALOG = [
  { id: 'demo1', name: 'Amoxicilline', unit: 'comprimé', stockQty: 120, minStock: 10, lowStock: false, location: 'Stock clinique' },
  { id: 'demo2', name: 'Oméprazole', unit: 'gélule', stockQty: 45, minStock: 5, lowStock: false, location: 'Stock clinique' },
  { id: 'demo3', name: 'Carprofène', unit: 'comprimé', stockQty: 3, minStock: 5, lowStock: true, location: 'Stock clinique' },
];

let demoMedications = DEMO_CATALOG.map((m) => ({ ...m }));
const movementLog = [];

const pushMovement = (entry) => {
  movementLog.unshift({
    id: `mv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    date: new Date().toISOString(),
    ...entry,
  });
  if (movementLog.length > 200) movementLog.length = 200;
};

const mapMedicationRow = (m) => ({
  id: m.id,
  name: m.name,
  unit: m.unit,
  stockQty: m.stockQty,
  minStock: m.minStock,
  price: m.price,
  pharmacy: m.pharmacy?.name || m.location || m.pharmacy,
  location: m.location || m.pharmacy?.name || m.pharmacy || 'Stock clinique',
  lowStock: m.stockQty <= m.minStock,
  treatments: (m.treatments || []).map((t) => ({
    disease: t.disease?.name || t.disease,
    defaultDosage: t.defaultDosage,
    defaultFrequency: t.defaultFrequency,
    defaultDuration: t.defaultDuration,
    defaultQuantity: t.defaultQuantity,
  })),
});

const getOrCreatePharmacyByName = async (name) => {
  const label = String(name || 'Stock clinique').trim() || 'Stock clinique';
  let pharmacy = await prisma.pharmacy.findFirst({ where: { name: label } });
  if (!pharmacy) {
    pharmacy = await prisma.pharmacy.create({ data: { name: label, isPartner: true } });
  }
  return pharmacy;
};

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
    return demoMedications.map((m) => mapMedicationRow(m));
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

  return meds.map((m) => mapMedicationRow(m));
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
  const catalog = await getMedicationCatalog();
  return catalog
    .filter((m) => m.lowStock || m.stockQty <= m.minStock)
    .map((m) => ({
      id: m.id,
      name: m.name,
      stockQty: m.stockQty,
      minStock: m.minStock,
      unit: m.unit,
    }));
};

const findMedicationById = async (id) => {
  if (isDemoMode()) {
    return demoMedications.find((m) => m.id === id) || null;
  }
  return prisma.vetMedication.findUnique({
    where: { id },
    include: {
      pharmacy: { select: { name: true } },
      treatments: { include: { disease: { select: { name: true } } } },
    },
  });
};

const createMedication = async (payload = {}, userId) => {
  const name = String(payload.name || '').trim();
  if (!name) {
    const error = new Error('Nom du médicament requis');
    error.status = 400;
    throw error;
  }

  const unit = String(payload.unit || 'unité').trim() || 'unité';
  const stockQty = Math.max(0, Number(payload.stockQty) || 0);
  const minStock = Math.max(0, Number(payload.minStock) ?? 5);
  const price = payload.price != null ? Number(payload.price) : null;
  const location = String(payload.location || payload.pharmacy || 'Stock clinique').trim();

  if (isDemoMode()) {
    const id = `demo_${Date.now()}`;
    const row = { id, name, unit, stockQty, minStock, price, location, treatments: [] };
    demoMedications.push(row);
    pushMovement({
      medicationId: id,
      medicationName: name,
      type: 'entrée',
      qty: stockQty,
      reason: 'Ajout médicament',
      user: userId || 'Vétérinaire',
    });
    return mapMedicationRow(row);
  }

  const pharmacy = await getOrCreatePharmacyByName(location);
  const created = await prisma.vetMedication.create({
    data: {
      name,
      unit,
      stockQty,
      minStock,
      price: Number.isFinite(price) ? price : null,
      pharmacyId: pharmacy.id,
    },
    include: {
      pharmacy: { select: { name: true } },
      treatments: { include: { disease: { select: { name: true } } } },
    },
  });

  pushMovement({
    medicationId: created.id,
    medicationName: created.name,
    type: 'entrée',
    qty: stockQty,
    reason: 'Ajout médicament',
    user: userId || 'Vétérinaire',
  });

  return mapMedicationRow(created);
};

const adjustMedicationStock = async (id, { adjustment, reason } = {}, userId) => {
  const delta = Number(adjustment);
  if (!Number.isFinite(delta) || delta === 0) {
    const error = new Error('Ajustement invalide');
    error.status = 400;
    throw error;
  }

  const record = await findMedicationById(id);
  if (!record) {
    const error = new Error('Médicament introuvable');
    error.status = 404;
    throw error;
  }

  const newQty = Math.max(0, Number(record.stockQty) + delta);

  if (isDemoMode()) {
    record.stockQty = newQty;
    pushMovement({
      medicationId: id,
      medicationName: record.name,
      type: delta > 0 ? 'entrée' : 'sortie',
      qty: delta,
      reason: reason || 'Ajustement stock',
      user: userId || 'Vétérinaire',
    });
    return mapMedicationRow(record);
  }

  const updated = await prisma.vetMedication.update({
    where: { id },
    data: { stockQty: newQty },
    include: {
      pharmacy: { select: { name: true } },
      treatments: { include: { disease: { select: { name: true } } } },
    },
  });

  pushMovement({
    medicationId: id,
    medicationName: updated.name,
    type: delta > 0 ? 'entrée' : 'sortie',
    qty: delta,
    reason: reason || 'Ajustement stock',
    user: userId || 'Vétérinaire',
  });

  return mapMedicationRow(updated);
};

const updateMedicationThresholds = async (id, payload = {}) => {
  const record = await findMedicationById(id);
  if (!record) {
    const error = new Error('Médicament introuvable');
    error.status = 404;
    throw error;
  }

  if (isDemoMode()) {
    if (payload.minStock !== undefined) record.minStock = Math.max(0, Number(payload.minStock));
    if (payload.unit !== undefined) record.unit = String(payload.unit).trim() || record.unit;
    if (payload.price !== undefined) record.price = Number(payload.price);
    if (payload.location !== undefined || payload.pharmacy !== undefined) {
      record.location = String(payload.location || payload.pharmacy).trim() || record.location;
    }
    return mapMedicationRow(record);
  }

  const data = {};
  if (payload.minStock !== undefined) data.minStock = Math.max(0, Number(payload.minStock));
  if (payload.unit !== undefined) data.unit = String(payload.unit).trim() || record.unit;
  if (payload.price !== undefined) {
    const price = Number(payload.price);
    data.price = Number.isFinite(price) ? price : null;
  }
  if (payload.location !== undefined || payload.pharmacy !== undefined) {
    const pharmacy = await getOrCreatePharmacyByName(payload.location || payload.pharmacy);
    data.pharmacyId = pharmacy.id;
  }

  const updated = await prisma.vetMedication.update({
    where: { id },
    data,
    include: {
      pharmacy: { select: { name: true } },
      treatments: { include: { disease: { select: { name: true } } } },
    },
  });

  return mapMedicationRow(updated);
};

const getMedicationMovements = async (limit = 30) =>
  movementLog.slice(0, Math.max(1, Math.min(100, Number(limit) || 30)));

module.exports = {
  calculateDose,
  getMedicationCatalog,
  suggestByDiagnosis,
  deductStockForPrescription,
  getLowStockAlerts,
  createMedication,
  adjustMedicationStock,
  updateMedicationThresholds,
  getMedicationMovements,
};
