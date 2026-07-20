const { prisma, isDemoMode } = require('../prismaClient');
const { buildPetProfile } = require('./vetPetDiagnosis.service');
const { suggestByDiagnosis, calculateDose, getMedicationCatalog } = require('./pharmacy.service');
const { getSpeciesProfileByCode } = require('./animalSpeciesProfile.service');
const { completionWithSystem } = require('./groq.service');
const { fetchVetPrescriptionScore } = require('./mlPythonClient');

const PRESCRIPTION_SYSTEM = `Tu es un assistant vétérinaire PetfoodTN pour la rédaction d'ordonnances.
Réponds UNIQUEMENT en JSON valide (pas de markdown) :
{
  "aiSummary": "synthèse clinique 2-3 phrases",
  "medications": [{"name":"...", "dosage":"...", "frequency":"...", "duration":"...", "rationale":"..."}],
  "supplements": [{"name":"...", "dosage":"...", "rationale":"..."}],
  "instructions": "consignes propriétaire",
  "followUpDays": 7,
  "warnings": ["..."]
}
Règles : adapter au poids et espèce, éviter AINS chez chat, mentionner stock si indisponible.`;

const demoDrafts = [];

const parseJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text.trim());
  } catch {
    const m = String(text).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
};

const buildFromCatalog = async ({ diagnosis, symptoms, animalType, weightKg, profile }) => {
  const catalog = await getMedicationCatalog();
  const suggestions = await suggestByDiagnosis(diagnosis || symptoms, animalType);

  const medications = (suggestions.length ? suggestions : catalog.slice(0, 3)).map((m) => {
    const dose = calculateDose({
      medicationName: m.name,
      weightKg: weightKg || profile?.pet?.weightKg || 10,
      animalType,
    });
    return {
      name: m.name,
      dosage: dose.error ? m.dosage || 'Selon poids' : dose.dosage,
      frequency: dose.frequency || m.frequency || '1×/jour',
      duration: dose.duration || m.duration || '7 jours',
      rationale: `Traitement suggéré pour : ${diagnosis || symptoms}`,
      stockQty: m.stockQty,
      inStock: (m.stockQty ?? 1) > 0,
    };
  });

  const species = await getSpeciesProfileByCode(animalType);
  const supplements = [];
  if (String(diagnosis).match(/arthros|arthrite/i)) {
    supplements.push({ name: 'Oméga-3 articulaires', dosage: '1 capsule/j', rationale: 'Soutien articulaire' });
  }
  if (String(diagnosis).match(/dermat|allerg|prurit/i)) {
    supplements.push({ name: 'Complément peau & pelage', dosage: 'Selon poids', rationale: 'Barrière cutanée' });
  }

  return {
    aiSummary: `${medications.length} traitement(s) proposé(s) pour ${species?.labelFr || animalType} — basé sur pharmacie clinique.`,
    medications,
    supplements,
    instructions: `Administrer selon prescription. Contrôle dans 7 jours. Signes d'alerte : vomissements, léthargie.`,
    followUpDays: 7,
    warnings: medications.filter((m) => !m.inStock).map((m) => `${m.name} : stock insuffisant`),
    source: 'catalog',
  };
};

const scoreMedications = async (draft, profile) => {
  try {
    const scored = await fetchVetPrescriptionScore({
      diagnosis: draft.diagnosis || '',
      symptoms: draft.symptoms || '',
      animal_type: draft.animalType || profile?.pet?.type || 'dog',
      weight_kg: profile?.pet?.weightKg,
      allergies: profile?.pet?.allergies,
      chronic_conditions: profile?.pet?.chronicConditions,
      medications: (draft.medications || []).map((m) => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        duration: m.duration,
        stock_qty: m.stockQty ?? 10,
      })),
    });
    if (scored?.medications?.length) {
      draft.medications = draft.medications.map((m) => {
        const fit = scored.medications.find((s) => s.name === m.name);
        return fit ? { ...m, fitScore: fit.fitScore, warnings: fit.warnings } : m;
      });
      draft.fitScore = scored.averageFit;
      draft.fitRecommendation = scored.recommendation;
    }
  } catch {
    /* optional */
  }
  return draft;
};

const generatePrescriptionDraft = async (user, body) => {
  const vetId = String(user?.id || user?._id || '');
  const {
    diagnosis,
    symptoms,
    pet,
    ownerId,
    petId,
    petName,
    animalType,
    refinementNote,
    previousDraftId,
  } = body;

  if (!diagnosis && !symptoms) {
    const err = new Error('Diagnostic ou symptômes requis');
    err.status = 400;
    throw err;
  }

  let profile = null;
  if (ownerId || petId || petName) {
    profile = await buildPetProfile({
      ownerId,
      petId,
      petName: petName || pet?.name,
      animalType: animalType || pet?.type,
    });
  }

  const resolvedType = animalType || pet?.type || profile?.pet?.type || 'dog';
  const resolvedName = petName || pet?.name || profile?.pet?.name || 'Patient';
  const weightKg = pet?.weightKg ?? profile?.pet?.weightKg ?? 10;

  let refinementLog = [];
  if (previousDraftId) {
    let prev;
    if (isDemoMode()) {
      prev = demoDrafts.find((d) => d.id === previousDraftId);
    } else {
      prev = await prisma.vetPrescriptionDraft.findUnique({ where: { id: previousDraftId } });
    }
    if (prev?.refinementLogJson) {
      try {
        refinementLog = JSON.parse(prev.refinementLogJson);
      } catch {
        refinementLog = [];
      }
    }
  }

  const catalog = await getMedicationCatalog();
  const catalogNames = catalog.map((m) => `${m.name} (stock:${m.stockQty})`).join(', ');

  const userPrompt = `Génère une ordonnance vétérinaire.
Diagnostic : ${diagnosis || '—'}
Symptômes : ${symptoms || '—'}
Animal : ${resolvedName}, espèce ${resolvedType}, ${weightKg} kg
Allergies : ${profile?.pet?.allergies || 'aucune connue'}
Pathologies chroniques : ${profile?.pet?.chronicConditions || 'aucune'}
Pharmacie disponible : ${catalogNames || 'catalogue standard'}
${refinementNote ? `Ajustement demandé par le vétérinaire : ${refinementNote}` : ''}`;

  let draft = null;
  const groqRaw = await completionWithSystem(PRESCRIPTION_SYSTEM, userPrompt, {
    temperature: 0.2,
    max_tokens: 1600,
  }).catch(() => null);

  draft = groqRaw ? parseJson(groqRaw) : null;
  if (!draft?.medications?.length) {
    draft = await buildFromCatalog({
      diagnosis,
      symptoms,
      animalType: resolvedType,
      weightKg,
      profile,
    });
  } else {
    draft.source = 'groq';
    draft.medications = draft.medications.map((m) => {
      const inCat = catalog.find((c) => c.name.toLowerCase() === String(m.name).toLowerCase());
      return {
        ...m,
        stockQty: inCat?.stockQty,
        inStock: inCat ? inCat.stockQty > 0 : true,
      };
    });
  }

  draft.diagnosis = diagnosis || symptoms;
  draft.symptoms = symptoms;
  draft.animalType = resolvedType;
  draft.petName = resolvedName;

  if (refinementNote) {
    refinementLog.push({
      at: new Date().toISOString(),
      note: refinementNote,
      by: 'vet',
    });
  }

  draft = await scoreMedications(draft, profile);
  draft.disclaimer =
    'Proposition IA — validation, signature et prescription sous responsabilité du vétérinaire.';

  const data = {
    vetId,
    ownerId: ownerId || profile?.owner?.id || null,
    petId: petId || profile?.pet?.id || null,
    petName: resolvedName,
    diagnosis: diagnosis || symptoms,
    symptoms: symptoms || null,
    animalType: resolvedType,
    medicationsJson: JSON.stringify(draft.medications || []),
    supplementsJson: JSON.stringify(draft.supplements || []),
    instructions: draft.instructions || null,
    aiSummary: draft.aiSummary || null,
    refinementLogJson: JSON.stringify(refinementLog),
    status: 'draft',
  };

  let saved;
  if (isDemoMode()) {
    saved = { id: `demo-draft-${Date.now()}`, ...data, createdAt: new Date() };
    demoDrafts.unshift(saved);
  } else {
    saved = await prisma.vetPrescriptionDraft.create({ data });
  }

  return {
    draftId: saved.id,
    ...draft,
    refinementLog,
  };
};

const refinePrescriptionDraft = async (user, draftId, { refinementNote }) => {
  let row;
  if (isDemoMode()) {
    row = demoDrafts.find((d) => d.id === draftId);
  } else {
    row = await prisma.vetPrescriptionDraft.findUnique({ where: { id: draftId } });
  }

  if (!row) {
    const err = new Error('Brouillon introuvable');
    err.status = 404;
    throw err;
  }

  let meds = [];
  try {
    meds = JSON.parse(row.medicationsJson || '[]');
  } catch {
    meds = [];
  }

  return generatePrescriptionDraft(user, {
    diagnosis: row.diagnosis,
    symptoms: row.symptoms,
    petName: row.petName,
    ownerId: row.ownerId,
    petId: row.petId,
    animalType: row.animalType,
    refinementNote,
    previousDraftId: draftId,
    pet: { name: row.petName, type: row.animalType },
  });
};

const applyPrescriptionDraft = async (user, draftId) => {
  const vetId = String(user?.id || user?._id || '');
  let row;
  if (isDemoMode()) {
    row = demoDrafts.find((d) => d.id === draftId);
  } else {
    row = await prisma.vetPrescriptionDraft.findUnique({ where: { id: draftId } });
  }

  if (!row) {
    const err = new Error('Brouillon introuvable');
    err.status = 404;
    throw err;
  }
  if (!row.ownerId) {
    const err = new Error('Propriétaire requis pour créer l\'ordonnance officielle');
    err.status = 400;
    throw err;
  }

  let meds = [];
  try {
    meds = JSON.parse(row.medicationsJson || '[]');
  } catch {
    meds = [];
  }

  if (!meds.length) {
    const err = new Error('Aucun médicament dans le brouillon');
    err.status = 400;
    throw err;
  }

  if (isDemoMode()) {
    return {
      prescription: {
        id: `demo-rx-${Date.now()}`,
        petName: row.petName,
        medications: row.medicationsJson,
        instructions: row.instructions,
      },
      draftId,
    };
  }

  const prescription = await prisma.prescription.create({
    data: {
      vetId,
      ownerId: row.ownerId,
      petName: row.petName || 'Patient',
      medications: row.medicationsJson,
      instructions: [row.instructions, row.aiSummary].filter(Boolean).join('\n'),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
    },
  });

  await prisma.vetPrescriptionDraft.update({
    where: { id: draftId },
    data: { status: 'applied', prescriptionId: prescription.id },
  });

  return { prescription, draftId };
};

const runDiagnosticAssist = async (user, body) => {
  const { analyzePetAnomalies } = require('./vetPetDiagnosis.service');
  const { symptoms, pet, ownerNotes, ownerId, petId, petName, animalType, vitals } = body;

  const result = await analyzePetAnomalies({
    ownerId: ownerId || undefined,
    petId: petId || pet?.id,
    petName: petName || pet?.name,
    animalType: animalType || pet?.type,
    symptoms: [symptoms, ownerNotes].filter(Boolean).join(' — '),
    vitals: vitals || {},
    vetId: String(user?.id || user?._id || ''),
  });

  return {
    diagnosticHypotheses: result.diagnosticHypotheses || [],
    screeningRecommendations: [],
    urgency: result.urgency || 'routine',
    urgencyLabel: result.urgency === 'urgent' ? 'Urgent' : result.urgency === 'soon' ? 'Sous 48–72 h' : 'Routine',
    aiSummary: result.clinicalNotes || result.disclaimer,
    anomalies: result.anomalies,
    source: result.aiPowered ? 'api' : 'local',
    disclaimer: result.disclaimer,
  };
};

module.exports = {
  generatePrescriptionDraft,
  refinePrescriptionDraft,
  applyPrescriptionDraft,
  runDiagnosticAssist,
};
