const { prisma, isDemoMode } = require('../prismaClient');
const { analyzePetAnomalies, buildPetProfile } = require('./vetPetDiagnosis.service');
const { analyzeEarlyDiseaseRisk } = require('./earlyDiseaseDetection.service');
const { getPetTimeline } = require('./clinicalAlerts.service');
const { createDossierFromPet, addEntry } = require('./medicalDossier.service');
const { completionWithSystem, VET_SYSTEM_PROMPT } = require('./groq.service');
const { checkPythonMlHealth } = require('./mlPythonClient');
const { listRecentDetections } = require('./vetAnimalDetection.service');
const { listActiveSpeciesProfiles } = require('./animalSpeciesProfile.service');

const demoAnalyses = [];

const resolveVetId = (user) => String(user?.id || user?._id || '');

const classifyUrgency = (analysis) => {
  const urgency = analysis.urgency || 'routine';
  const highAnomaly = (analysis.anomalies || []).some((a) => a.severity === 'high');
  const diseaseFromAnomalies = (analysis.anomalies || []).some((a) => a.likelyDisease);
  const diseaseSuspected =
    Boolean(analysis.diseaseSuspected) ||
    diseaseFromAnomalies ||
    (analysis.diagnosticHypotheses || []).some((h) => h.confidence === 'high');

  let urgencyClass = analysis.urgencyClass;
  if (!urgencyClass) {
    urgencyClass =
      urgency === 'urgent' || (urgency === 'soon' && highAnomaly) ? 'urgent' : 'non_urgent';
  }

  return {
    urgency,
    urgencyClass,
    diseaseSuspected,
    isUrgent: urgencyClass === 'urgent',
  };
};

const enrichAnalysis = (raw) => {
  const classification = classifyUrgency(raw);
  const followUp = raw.healthFollowUp || {
    nextVisitDays: raw.followUpDays ?? 7,
    monitoring: [],
    warningSigns: [],
  };

  return {
    ...raw,
    ...classification,
    healthFollowUp: followUp,
    agent: 'vet_clinical_anomaly_agent',
  };
};

const persistAnalysis = async (vetId, input, enriched) => {
  const payload = {
    vetId,
    ownerId: input.ownerId || null,
    petId: input.petId || null,
    petName: input.petName || enriched.profile?.pet?.name || 'Patient',
    animalType: input.animalType || enriched.profile?.pet?.type || 'dog',
    symptoms: input.symptoms,
    vitalsJson: input.vitals ? JSON.stringify(input.vitals) : null,
    urgency: enriched.urgency,
    urgencyClass: enriched.urgencyClass,
    diseaseSuspected: enriched.diseaseSuspected,
    anomaliesJson: JSON.stringify(enriched.anomalies || []),
    analysisJson: JSON.stringify(enriched),
    followUpDays: enriched.followUpDays ?? enriched.healthFollowUp?.nextVisitDays ?? null,
  };

  if (isDemoMode()) {
    const row = {
      id: `demo_ai_${Date.now()}`,
      ...payload,
      createdAt: new Date(),
    };
    demoAnalyses.unshift(row);
    return row;
  }

  return prisma.vetClinicalAiAnalysis.create({ data: payload });
};

const mapAnalysisRow = (row) => {
  let parsed = {};
  try {
    parsed = JSON.parse(row.analysisJson || '{}');
  } catch {
    parsed = {};
  }
  let anomalies = [];
  try {
    anomalies = JSON.parse(row.anomaliesJson || '[]');
  } catch {
    anomalies = parsed.anomalies || [];
  }

  return {
    id: row.id,
    petName: row.petName,
    animalType: row.animalType,
    ownerId: row.ownerId,
    petId: row.petId,
    symptoms: row.symptoms,
    urgency: row.urgency,
    urgencyClass: row.urgencyClass,
    diseaseSuspected: row.diseaseSuspected,
    anomalies,
    followUpDays: row.followUpDays,
    dossierEntryId: row.dossierEntryId,
    prescriptionId: row.prescriptionId,
    createdAt: row.createdAt,
    summary: parsed.clinicalNotes?.slice(0, 120) || row.symptoms?.slice(0, 80),
  };
};

const getClinicalMlAgentPack = async (user) => {
  const vetId = resolveVetId(user);
  const mlHealth = await checkPythonMlHealth().catch(() => ({ ok: false }));
  const speciesProfiles = await listActiveSpeciesProfiles().catch(() => []);
  const recentDetections = await listRecentDetections(vetId, 5).catch(() => []);

  let recent = [];
  let urgentCount = 0;
  let diseaseCount = 0;

  if (isDemoMode()) {
    recent = demoAnalyses.slice(0, 8).map(mapAnalysisRow);
    urgentCount = demoAnalyses.filter((a) => a.urgencyClass === 'urgent').length;
    diseaseCount = demoAnalyses.filter((a) => a.diseaseSuspected).length;
  } else if (vetId) {
    const rows = await prisma.vetClinicalAiAnalysis.findMany({
      where: { vetId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    recent = rows.map(mapAnalysisRow);
    urgentCount = await prisma.vetClinicalAiAnalysis.count({
      where: { vetId, urgencyClass: 'urgent', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
    });
    diseaseCount = await prisma.vetClinicalAiAnalysis.count({
      where: { vetId, diseaseSuspected: true, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } },
    });
  }

  const ruleSummary = [
    `${recent.length ? recent.length : 'Aucune'} analyse(s) récente(s).`,
    urgentCount ? `${urgentCount} cas urgent(s) sur 7 jours.` : 'Pas de cas urgent récent.',
    diseaseCount ? `${diseaseCount} suspicion(s) maladie sur 30 jours.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  let groqSummary = null;
  try {
    groqSummary = await completionWithSystem(
      VET_SYSTEM_PROMPT,
      `Synthèse (3 phrases) pour le vétérinaire — agent détection anomalies animales (urgent vs non urgent, maladie, ordonnances, suivi):\n${JSON.stringify({ urgentCount, diseaseCount, recent: recent.slice(0, 4) }, null, 2)}`,
      { max_tokens: 280 }
    );
  } catch {
    groqSummary = null;
  }

  return {
    role: 'vet',
    agent: 'vet_clinical_anomaly_agent',
    pythonPowered: Boolean(mlHealth?.ok),
    groqPowered: Boolean(groqSummary),
    models: [
      'clinical_logistic_v1',
      'animal_species_v1',
      'groq',
      'clinical_rules',
      'pet_history',
      mlHealth?.ok ? 'xgboost' : null,
    ].filter(Boolean),
    summary: groqSummary || ruleSummary,
    tip:
      urgentCount > 0
        ? `${urgentCount} analyse(s) urgente(s) — prioriser consultation et dossier médical`
        : `${speciesProfiles.length} profil(s) espèce en base — détection ML disponible`,
    stats: {
      recentAnalyses: recent.length,
      urgentLast7Days: urgentCount,
      diseaseSuspectedLast30Days: diseaseCount,
      speciesProfiles: speciesProfiles.length,
      recentDetections: recentDetections.length,
    },
    recentAnalyses: recent,
    recentAnimalDetections: recentDetections,
    speciesProfiles: speciesProfiles.map((p) => ({
      code: p.speciesCode,
      label: p.labelFr,
    })),
    actionHints: [
      { type: 'detection', label: 'Détection espèce ML', link: '/vet/intelligence?tab=detection' },
      { type: 'diagnostics', label: 'Nouvelle analyse symptômes', link: '/vet/diagnostics' },
      { type: 'dossiers', label: 'Dossiers médicaux', link: '/vet/medical-dossiers' },
      { type: 'prescriptions', label: 'Ordonnances', link: '/vet/prescriptions' },
      { type: 'calendar', label: 'Calendrier RDV', link: '/vet/calendar' },
    ],
  };
};

const runClinicalAnalysis = async (user, body) => {
  const vetId = resolveVetId(user);
  const { ownerId, petId, petName, animalType, symptoms, vitals } = body;

  if (!symptoms || !String(symptoms).trim()) {
    const err = new Error('Décrivez les symptômes ou anomalies observées');
    err.status = 400;
    throw err;
  }
  if (!ownerId && !petName) {
    const err = new Error('Sélectionnez un animal patient');
    err.status = 400;
    throw err;
  }

  const raw = await analyzePetAnomalies({
    ownerId,
    petId,
    petName,
    animalType,
    symptoms: String(symptoms).trim(),
    vitals: vitals || {},
    vetId,
  });

  const enriched = enrichAnalysis(raw);

  const earlyDetection = await analyzeEarlyDiseaseRisk({
    ownerId,
    petId,
    petName: petName || enriched.profile?.pet?.name,
    animalType: animalType || enriched.profile?.pet?.type,
    symptoms: String(symptoms).trim(),
    vitals: vitals || {},
    profile: enriched.profile,
  }).catch(() => null);

  if (earlyDetection) {
    enriched.earlyDetection = earlyDetection;
    if (earlyDetection.riskLevel === 'critical' || earlyDetection.riskLevel === 'high') {
      enriched.urgencyClass = 'urgent';
      enriched.urgency = 'urgent';
      enriched.diseaseSuspected = true;
    } else if (earlyDetection.riskLevel === 'medium' && enriched.urgency === 'routine') {
      enriched.urgency = 'soon';
    }
  }

  const saved = await persistAnalysis(vetId, { ownerId, petId, petName, animalType, symptoms, vitals }, enriched);

  let timeline = [];
  if (ownerId && (petName || enriched.profile?.pet?.name)) {
    timeline = await getPetTimeline({
      ownerId,
      petName: petName || enriched.profile?.pet?.name,
      vetId,
    });
  }

  return {
    analysisId: saved.id,
    ...enriched,
    timeline: timeline.slice(0, 25),
    disclaimer:
      enriched.disclaimer ||
      'Suggestion IA — ne remplace pas l\'examen clinique ni la décision du vétérinaire.',
  };
};

const getPatientClinicalContext = async (user, { ownerId, petName, petId }) => {
  const vetId = resolveVetId(user);
  const profile = await buildPetProfile({ ownerId, petId, petName });
  const timeline = ownerId && petName ? await getPetTimeline({ ownerId, petName, vetId }) : [];

  let dossier = null;
  let pastAnalyses = [];

  if (isDemoMode()) {
    pastAnalyses = demoAnalyses
      .filter((a) => (!ownerId || a.ownerId === ownerId) && (!petName || a.petName === petName))
      .slice(0, 10)
      .map(mapAnalysisRow);
  } else if (ownerId && petName) {
    const [d, analyses] = await Promise.all([
      prisma.petMedicalDossier.findFirst({
        where: { ownerId, petName },
        select: { id: true, dossierNumber: true, allergies: true, chronicDiseases: true },
      }),
      prisma.vetClinicalAiAnalysis.findMany({
        where: { ownerId, petName },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    dossier = d;
    pastAnalyses = analyses.map(mapAnalysisRow);
  }

  return {
    profile,
    dossier,
    timeline: timeline.slice(0, 30),
    pastAnalyses,
  };
};

const applyAnalysisToDossier = async (user, analysisId) => {
  const vetId = resolveVetId(user);

  let row;
  if (isDemoMode()) {
    row = demoAnalyses.find((a) => a.id === analysisId);
  } else {
    row = await prisma.vetClinicalAiAnalysis.findUnique({ where: { id: analysisId } });
  }

  if (!row) {
    const err = new Error('Analyse introuvable');
    err.status = 404;
    throw err;
  }
  if (!isDemoMode() && row.vetId !== vetId) {
    const err = new Error('Analyse d\'un autre vétérinaire');
    err.status = 403;
    throw err;
  }

  let parsed = {};
  try {
    parsed = JSON.parse(row.analysisJson || '{}');
  } catch {
    parsed = {};
  }

  if (!row.ownerId) {
    const err = new Error('Propriétaire requis pour le dossier médical');
    err.status = 400;
    throw err;
  }

  const dossier = await createDossierFromPet({
    ownerId: row.ownerId,
    petId: row.petId,
    petName: row.petName,
    vetId,
  });

  const diagnosis = (parsed.diagnosticHypotheses || [])
    .map((h) => h.condition)
    .filter(Boolean)
    .join(' ; ');

  const meds = (parsed.recommendedMedications || []).map((m) => ({
    name: m.name,
    dosage: m.dosage,
    frequency: m.frequency,
    duration: m.duration,
  }));

  const recommendations = [
    parsed.clinicalNotes,
    parsed.dietPlan?.summary ? `Régime : ${parsed.dietPlan.summary}` : null,
    parsed.healthFollowUp?.monitoring?.length
      ? `Surveillance : ${parsed.healthFollowUp.monitoring.join(', ')}`
      : null,
    parsed.healthFollowUp?.warningSigns?.length
      ? `Signes d\'alerte : ${parsed.healthFollowUp.warningSigns.join(', ')}`
      : null,
    row.urgencyClass === 'urgent' ? '⚠️ Cas classé URGENT par l\'agent IA' : null,
  ]
    .filter(Boolean)
    .join('\n');

  const entry = await addEntry(dossier.id, vetId, {
    entryType: 'consultation',
    title: `Analyse IA — ${row.petName} (${new Date().toLocaleDateString('fr-FR')})`,
    symptoms: row.symptoms,
    diagnosis: diagnosis || 'À confirmer à l\'examen',
    treatment: (parsed.anomalies || []).map((a) => a.label).join(', '),
    medications: meds.length ? JSON.stringify(meds) : null,
    recommendations,
    visitDate: new Date(),
  });

  if (!isDemoMode()) {
    await prisma.vetClinicalAiAnalysis.update({
      where: { id: analysisId },
      data: { dossierEntryId: entry.id },
    });
  } else {
    row.dossierEntryId = entry.id;
  }

  return { dossier, entry, analysisId };
};

const applyAnalysisPrescription = async (user, analysisId) => {
  const vetId = resolveVetId(user);

  let row;
  if (isDemoMode()) {
    row = demoAnalyses.find((a) => a.id === analysisId);
  } else {
    row = await prisma.vetClinicalAiAnalysis.findUnique({ where: { id: analysisId } });
  }

  if (!row) {
    const err = new Error('Analyse introuvable');
    err.status = 404;
    throw err;
  }
  if (!row.ownerId) {
    const err = new Error('Propriétaire requis');
    err.status = 400;
    throw err;
  }

  let parsed = {};
  try {
    parsed = JSON.parse(row.analysisJson || '{}');
  } catch {
    parsed = {};
  }

  const meds = (parsed.recommendedMedications || []).map((m) => ({
    name: m.name,
    dosage: m.dosage || '',
    frequency: m.frequency || '',
    duration: m.duration || '',
  }));

  if (!meds.length) {
    const err = new Error('Aucun médicament suggéré dans cette analyse');
    err.status = 400;
    throw err;
  }

  const diet = parsed.dietPlan;
  const instructions = [
    parsed.clinicalNotes,
    diet?.summary ? `Régime : ${diet.summary}` : null,
    row.urgencyClass === 'urgent' ? 'Suivi prioritaire — cas urgent' : `Contrôle suggéré dans ${row.followUpDays || 7} jours`,
  ]
    .filter(Boolean)
    .join('\n');

  if (isDemoMode()) {
    return {
      prescription: {
        id: `demo_rx_${Date.now()}`,
        ownerId: row.ownerId,
        petName: row.petName,
        medications: JSON.stringify(meds),
        instructions,
      },
      analysisId,
    };
  }

  const prescription = await prisma.prescription.create({
    data: {
      vetId,
      ownerId: row.ownerId,
      petName: row.petName,
      medications: JSON.stringify(meds),
      instructions,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'active',
    },
  });

  await prisma.vetClinicalAiAnalysis.update({
    where: { id: analysisId },
    data: { prescriptionId: prescription.id },
  });

  return { prescription, analysisId };
};

module.exports = {
  getClinicalMlAgentPack,
  runClinicalAnalysis,
  getPatientClinicalContext,
  applyAnalysisToDossier,
  applyAnalysisPrescription,
  enrichAnalysis,
  classifyUrgency,
};
