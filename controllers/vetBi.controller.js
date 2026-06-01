const { prisma, isDemoMode } = require('../prismaClient');
const { ensureVetBiSeed } = require('../utils/vetBiSeed');

const parseMedsJson = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [{ name: String(raw) }];
  } catch {
    return [{ name: String(raw) }];
  }
};

const normalizeAnimal = (t) => {
  const s = (t || 'autre').toLowerCase();
  if (s.includes('chien') || s === 'dog') return 'Chien';
  if (s.includes('chat') || s === 'cat') return 'Chat';
  if (s.includes('oiseau') || s === 'bird') return 'Oiseau';
  if (s.includes('lapin') || s === 'rabbit') return 'Lapin';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const normalizeDiagnosis = (d) => (d || 'Non précisé').trim();

const collectClinicalCases = async (vetId = null, since = null) => {
  const consultWhere = { diagnosis: { not: null } };
  const rxWhere = {};
  if (vetId) {
    consultWhere.vetId = vetId;
    rxWhere.vetId = vetId;
  }
  if (since) {
    consultWhere.createdAt = { gte: since };
    rxWhere.createdAt = { gte: since };
  }

  const [consultations, records, prescriptions] = await Promise.all([
    prisma.vetConsultation.findMany({
      where: consultWhere,
      select: { id: true, petName: true, animalType: true, diagnosis: true, createdAt: true, vetId: true },
    }),
    prisma.veterinaryRecord.findMany({
      where: since ? { visitDate: { gte: since } } : undefined,
      select: { id: true, petName: true, animalType: true, diagnosis: true, medications: true, visitDate: true },
    }),
    prisma.prescription.findMany({
      where: rxWhere,
      select: {
        id: true,
        petName: true,
        medications: true,
        createdAt: true,
        consultation: { select: { animalType: true, diagnosis: true } },
      },
    }),
  ]);

  const cases = [];

  consultations.forEach((c) => {
    cases.push({
      id: `consult-${c.id}`,
      petName: c.petName,
      animalType: normalizeAnimal(c.animalType),
      diagnosis: normalizeDiagnosis(c.diagnosis),
      medications: [],
      date: c.createdAt,
      source: 'consultation',
    });
  });

  records.forEach((r) => {
    cases.push({
      id: `record-${r.id}`,
      petName: r.petName,
      animalType: normalizeAnimal(r.animalType),
      diagnosis: normalizeDiagnosis(r.diagnosis),
      medications: parseMedsJson(r.medications),
      date: r.visitDate,
      source: 'dossier',
    });
  });

  prescriptions.forEach((p) => {
    const meds = parseMedsJson(p.medications);
    cases.push({
      id: `rx-${p.id}`,
      petName: p.petName,
      animalType: normalizeAnimal(p.consultation?.animalType),
      diagnosis: normalizeDiagnosis(p.consultation?.diagnosis) || 'Ordonnance',
      medications: meds,
      date: p.createdAt,
      source: 'ordonnance',
    });
  });

  return cases;
};

const buildCasesByMonth = (cases, months = 6) => {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    buckets.push({ month: key, label, count: 0 });
  }
  const bucketMap = Object.fromEntries(buckets.map((b) => [b.month, b]));
  cases.forEach((c) => {
    if (!c.date) return;
    const dt = new Date(c.date);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    if (bucketMap[key]) bucketMap[key].count += 1;
  });
  return buckets;
};

const buildInsights = ({ diseaseByAnimal, topMedications, missingMedications, animalDistribution, casesByMonth }) => {
  const lines = [];
  if (diseaseByAnimal[0]) {
    lines.push(
      `Pathologie dominante : ${diseaseByAnimal[0].disease} chez le ${diseaseByAnimal[0].animal} (${diseaseByAnimal[0].count} cas, ${diseaseByAnimal[0].percent} %).`
    );
  }
  if (topMedications[0]) {
    lines.push(`Médicament le plus prescrit : ${topMedications[0].name} (${topMedications[0].cases} cas).`);
  }
  if (missingMedications.length) {
    lines.push(`${missingMedications.length} alerte(s) stock ou référentiel à traiter en pharmacie.`);
  }
  if (animalDistribution[0]) {
    lines.push(`Espèce la plus consultée : ${animalDistribution[0].animal} (${animalDistribution[0].percent} % des cas).`);
  }
  const lastMonth = casesByMonth[casesByMonth.length - 1];
  const prevMonth = casesByMonth[casesByMonth.length - 2];
  if (lastMonth && prevMonth && prevMonth.count > 0) {
    const delta = Math.round(((lastMonth.count - prevMonth.count) / prevMonth.count) * 100);
    lines.push(
      `Activité ${lastMonth.label} : ${lastMonth.count} cas (${delta >= 0 ? '+' : ''}${delta} % vs mois précédent).`
    );
  }
  return lines.slice(0, 5);
};

const getBiDashboard = async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : null;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
    const vetId = req.user?.role === 'vet' ? (req.user.id || req.user._id) : null;

    if (isDemoMode()) {
      return res.json({
        diseaseByAnimal: [
          { animal: 'Chien', disease: 'Gastro-entérite légère', count: 12, percent: 28 },
          { animal: 'Chien', disease: 'Allergie cutanée', count: 8, percent: 19 },
          { animal: 'Chat', disease: 'Infection urinaire', count: 6, percent: 35 },
          { animal: 'Chat', disease: 'Parasites externes', count: 4, percent: 24 },
        ],
        animalDistribution: [
          { animal: 'Chien', count: 20, percent: 48 },
          { animal: 'Chat', count: 17, percent: 40 },
          { animal: 'Oiseau', count: 5, percent: 12 },
        ],
        casesByMonth: [
          { month: '2025-12', label: 'déc. 25', count: 6 },
          { month: '2026-01', label: 'janv. 26', count: 8 },
          { month: '2026-02', label: 'févr. 26', count: 7 },
          { month: '2026-03', label: 'mars 26', count: 9 },
          { month: '2026-04', label: 'avr. 26', count: 5 },
          { month: '2026-05', label: 'mai 26', count: 7 },
        ],
        topMedications: [
          { name: 'Oméprazole', totalQty: 84, cases: 12 },
          { name: 'Amoxicilline', totalQty: 60, cases: 8 },
          { name: 'Probiotiques FortiFlora', totalQty: 40, cases: 10 },
        ],
        casesWithMeds: [],
        diseaseTreatments: [],
        missingMedications: [],
        recentImports: [],
        insights: [
          'Pathologie dominante : Gastro-entérite légère chez le Chien (12 cas, 28 %).',
          'Médicament le plus prescrit : Oméprazole (12 cas).',
        ],
        summary: {
          totalCases: 42,
          totalDiseases: 8,
          totalMedications: 15,
          lowStock: 2,
          stockValue: 1240.5,
          casesThisMonth: 7,
          mappingCount: 12,
        },
        periodDays: days,
      });
    }

    await ensureVetBiSeed();

    const cases = await collectClinicalCases(vetId, since);

    const byAnimalDisease = {};
    cases.forEach((c) => {
      const key = `${c.animalType}::${c.diagnosis}`;
      byAnimalDisease[key] = (byAnimalDisease[key] || 0) + 1;
    });

    const animalTotals = {};
    cases.forEach((c) => {
      animalTotals[c.animalType] = (animalTotals[c.animalType] || 0) + 1;
    });

    const diseaseByAnimal = Object.entries(byAnimalDisease).map(([key, count]) => {
      const [animal, disease] = key.split('::');
      const total = animalTotals[animal] || 1;
      return { animal, disease, count, percent: Math.round((count / total) * 100) };
    }).sort((a, b) => b.count - a.count);

    const medStats = {};
    cases.forEach((c) => {
      c.medications.forEach((m) => {
        const name = (m.name || '').trim();
        if (!name) return;
        if (!medStats[name]) medStats[name] = { name, totalQty: 0, cases: 0 };
        medStats[name].totalQty += Number(m.quantity) || 1;
        medStats[name].cases += 1;
      });
    });

    const topMedications = Object.values(medStats).sort((a, b) => b.cases - a.cases).slice(0, 15);

    const totalCases = cases.length || 1;
    const animalDistribution = Object.entries(animalTotals)
      .map(([animal, count]) => ({
        animal,
        count,
        percent: Math.round((count / totalCases) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const casesByMonth = buildCasesByMonth(cases);
    const now = new Date();
    const casesThisMonth = cases.filter((c) => {
      if (!c.date) return false;
      const d = new Date(c.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const diseaseTreatments = await prisma.diseaseTreatment.findMany({
      include: {
        disease: true,
        medication: { include: { pharmacy: true } },
      },
      orderBy: { disease: { name: 'asc' } },
    });

    const mappedTreatments = diseaseTreatments.map((dt) => ({
      id: dt.id,
      disease: dt.disease.name,
      animalTypes: dt.disease.animalTypes,
      medication: dt.medication.name,
      dosage: dt.defaultDosage,
      frequency: dt.defaultFrequency,
      duration: dt.defaultDuration,
      quantity: dt.defaultQuantity,
      unit: dt.medication.unit,
      stockQty: dt.medication.stockQty,
      pharmacy: dt.medication.pharmacy?.name || '—',
    }));

    const catalog = await prisma.vetMedication.findMany({ include: { pharmacy: true } });
    const catalogNames = new Set(catalog.map((m) => m.name.toLowerCase()));
    const stockValue = catalog.reduce((sum, m) => sum + (Number(m.price) || 0) * (m.stockQty || 0), 0);

    const recentImports = await prisma.pharmacyImport.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: { pharmacy: { select: { name: true } } },
    });

    const prescribedNames = new Set(Object.keys(medStats).map((n) => n.toLowerCase()));
    const missingFromCatalog = [...prescribedNames].filter((n) => !catalogNames.has(n));

    const lowStock = catalog.filter((m) => m.stockQty <= m.minStock);
    const missingMedications = [
      ...lowStock.map((m) => ({
        name: m.name,
        stockQty: m.stockQty,
        minStock: m.minStock,
        unit: m.unit,
        pharmacy: m.pharmacy?.name,
        reason: 'stock_bas',
      })),
      ...missingFromCatalog.map((n) => ({
        name: n.charAt(0).toUpperCase() + n.slice(1),
        stockQty: 0,
        minStock: 5,
        unit: 'unité',
        pharmacy: null,
        reason: 'absent_catalogue',
      })),
    ];

    const casesWithMeds = cases
      .filter((c) => c.medications.length > 0 || c.diagnosis !== 'Non précisé')
      .slice(0, 50)
      .map((c) => ({
        ...c,
        medications: c.medications.map((m) => ({
          name: m.name,
          dosage: m.dosage || '—',
          frequency: m.frequency || '—',
          duration: m.duration || '—',
          quantity: m.quantity ?? 1,
        })),
      }));

    const uniqueDiseases = new Set(cases.map((c) => c.diagnosis)).size;

    const insights = buildInsights({
      diseaseByAnimal,
      topMedications,
      missingMedications,
      animalDistribution,
      casesByMonth,
    });

    return res.json({
      diseaseByAnimal,
      animalDistribution,
      casesByMonth,
      topMedications,
      casesWithMeds,
      diseaseTreatments: mappedTreatments,
      missingMedications,
      recentImports: recentImports.map((r) => ({
        id: r.id,
        pharmacy: r.pharmacy?.name || 'Pharmacie',
        itemsCount: r.itemsCount,
        fileName: r.fileName,
        createdAt: r.createdAt,
      })),
      insights,
      summary: {
        totalCases: cases.length,
        totalDiseases: uniqueDiseases,
        totalMedications: catalog.length,
        lowStock: lowStock.length + missingFromCatalog.length,
        stockValue: Math.round(stockValue * 100) / 100,
        casesThisMonth,
        mappingCount: mappedTreatments.length,
      },
      periodDays: days,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur dashboard BI vétérinaire' });
  }
};

const parseCsvRows = (text) => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(/[,;]/).map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
};

const importClinicalData = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({ imported: 5, message: 'Mode démo — import simulé' });
    }

    const { csv, rows } = req.body;
    let data = rows;
    if (!data && csv) data = parseCsvRows(csv);

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Données vides. Envoyez csv ou rows[]' });
    }

    let pharmacy = await prisma.pharmacy.findFirst({ where: { isPartner: true } });
    if (!pharmacy) {
      pharmacy = await prisma.pharmacy.create({
        data: { name: 'Pharmacie partenaire', isPartner: true },
      });
    }

    let imported = 0;

    for (const row of data) {
      const diseaseName = (row.maladie || row.disease || row.diagnosis || '').trim();
      const medName = (row.medicament || row.medication || row.med || '').trim();
      if (!diseaseName || !medName) continue;

      const animalTypes = (row.animal || row.animaux || row.animaltypes || 'dog,cat').trim();

      let disease = await prisma.disease.findUnique({ where: { name: diseaseName } });
      if (!disease) {
        disease = await prisma.disease.create({
          data: { name: diseaseName, animalTypes, description: row.description || null },
        });
      }

      let med = await prisma.vetMedication.findFirst({
        where: { name: medName, pharmacyId: pharmacy.id },
      });
      if (!med) {
        med = await prisma.vetMedication.create({
          data: {
            name: medName,
            unit: row.unite || row.unit || 'unité',
            stockQty: Number(row.stock || row.quantite_stock || 0) || 0,
            minStock: Number(row.stock_min || 5) || 5,
            pharmacyId: pharmacy.id,
          },
        });
      }

      await prisma.diseaseTreatment.upsert({
        where: { diseaseId_medicationId: { diseaseId: disease.id, medicationId: med.id } },
        create: {
          diseaseId: disease.id,
          medicationId: med.id,
          defaultDosage: row.dosage || null,
          defaultFrequency: row.frequence || row.frequency || null,
          defaultDuration: row.duree || row.duration || null,
          defaultQuantity: Number(row.quantite || row.quantity || 1) || 1,
          notes: row.notes || null,
        },
        update: {
          defaultDosage: row.dosage || undefined,
          defaultFrequency: row.frequence || row.frequency || undefined,
          defaultDuration: row.duree || row.duration || undefined,
          defaultQuantity: Number(row.quantite || row.quantity) || undefined,
        },
      });

      imported += 1;
    }

    return res.json({ imported, message: `${imported} mapping(s) maladie → traitement importé(s)` });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur import données cliniques' });
  }
};

const importPharmacyStock = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({ imported: 3, message: 'Mode démo — réappro simulé' });
    }

    const { csv, rows, pharmacyId } = req.body;
    let data = rows;
    if (!data && csv) data = parseCsvRows(csv);

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: 'Données vides. Envoyez csv ou rows[]' });
    }

    let pharmacy = pharmacyId
      ? await prisma.pharmacy.findUnique({ where: { id: pharmacyId } })
      : await prisma.pharmacy.findFirst({ where: { isPartner: true } });

    if (!pharmacy) {
      pharmacy = await prisma.pharmacy.create({
        data: { name: 'Pharmacie partenaire', isPartner: true },
      });
    }

    const importedItems = [];
    let imported = 0;

    for (const row of data) {
      const medName = (row.medicament || row.medication || row.name || '').trim();
      const qty = Number(row.quantite || row.quantity || row.stock || 0);
      if (!medName || qty <= 0) continue;

      let med = await prisma.vetMedication.findFirst({
        where: { name: medName, pharmacyId: pharmacy.id },
      });

      if (med) {
        med = await prisma.vetMedication.update({
          where: { id: med.id },
          data: { stockQty: med.stockQty + qty },
        });
      } else {
        med = await prisma.vetMedication.create({
          data: {
            name: medName,
            unit: row.unite || row.unit || 'unité',
            stockQty: qty,
            minStock: Number(row.stock_min || 5) || 5,
            price: row.prix ? Number(row.prix) : null,
            pharmacyId: pharmacy.id,
          },
        });
      }

      importedItems.push({ name: med.name, addedQty: qty, newStock: med.stockQty });
      imported += 1;
    }

    await prisma.pharmacyImport.create({
      data: {
        pharmacyId: pharmacy.id,
        importedBy: req.user?.id || null,
        fileName: req.body.fileName || 'import-manuel',
        itemsCount: imported,
        itemsJson: JSON.stringify(importedItems),
      },
    });

    return res.json({
      imported,
      pharmacy: pharmacy.name,
      items: importedItems,
      message: `${imported} médicament(s) réapprovisionné(s) par la pharmacie partenaire`,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur import pharmacie' });
  }
};

const getPharmacies = async (req, res) => {
  try {
    const pharmacies = await prisma.pharmacy.findMany({
      include: { _count: { select: { medications: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json(pharmacies);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getBiDashboard,
  importClinicalData,
  importPharmacyStock,
  getPharmacies,
};
