const { prisma, isDemoMode } = require('../../prismaClient');
const { completionWithSystem } = require('../groq.service');

const REHAB_PHASES = [
  { id: 'trust', label: 'Prise de confiance', order: 1 },
  { id: 'desensitization', label: 'Désensibilisation', order: 2 },
  { id: 'socialization', label: 'Socialisation douce', order: 3 },
  { id: 'adoption_ready', label: 'Prêt pour adoption', order: 4 },
];

const TREATMENT_TYPES = [
  { id: 'vet_care', label: 'Soins vétérinaires', icon: '🩺' },
  { id: 'desensitization', label: 'Désensibilisation (bruits, humains)', icon: '🔊' },
  { id: 'socialization', label: 'Socialisation progressive', icon: '🤝' },
  { id: 'enrichment', label: 'Enrichissement / jeu sécurisé', icon: '🧸' },
  { id: 'behavior', label: 'Travail comportemental (peur)', icon: '🧠' },
  { id: 'nutrition', label: 'Alimentation thérapeutique', icon: '🥣' },
  { id: 'safe_space', label: 'Espace refuge calme', icon: '🏠' },
];

const FEAR_LABELS = {
  1: 'Légèrement timide',
  2: 'Timide',
  3: 'Effrayé',
  4: 'Très effrayé',
  5: 'Traumatisé / craintif',
};

const demoPrograms = [
  {
    id: 'rehab_demo_1',
    shelterAnimalId: 'a_scared_1',
    phase: 'desensitization',
    progressPercent: 42,
    targetWeeks: 10,
    startedAt: new Date(Date.now() - 21 * 86400000).toISOString(),
    animal: {
      id: 'a_scared_1',
      name: 'Shadow',
      species: 'dog',
      breed: 'Croisé',
      ageYears: 2,
      origin: 'abandoned',
      fearLevel: 5,
      isScared: true,
      rehabStatus: 'in_rehab',
      traumaNotes: 'Trouvé abandonné — fuit les humains, hypervigilant aux bruits.',
      status: 'in_rehab',
      shelter: { id: 'sh1', name: 'Refuge Les Amis à Quatre Pattes', region: 'Tunis' },
    },
    treatments: [
      {
        id: 't1',
        treatmentType: 'vet_care',
        title: 'Bilan santé + vaccination',
        completedAt: new Date(Date.now() - 18 * 86400000).toISOString(),
        progressDelta: 10,
        performedBy: 'Dr. Amira',
      },
      {
        id: 't2',
        treatmentType: 'safe_space',
        title: 'Box calme sans contact forcé',
        completedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
        progressDelta: 8,
        performedBy: 'Équipe refuge',
      },
      {
        id: 't3',
        treatmentType: 'desensitization',
        title: 'Exposition sons faibles (10 min/j)',
        scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(),
        progressDelta: 6,
        performedBy: 'Comportementaliste',
      },
    ],
  },
  {
    id: 'rehab_demo_2',
    shelterAnimalId: 'a_scared_2',
    phase: 'trust',
    progressPercent: 18,
    targetWeeks: 12,
    startedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    animal: {
      id: 'a_scared_2',
      name: 'Plume',
      species: 'cat',
      breed: 'Européen',
      ageYears: 1,
      origin: 'stray',
      fearLevel: 4,
      isScared: true,
      rehabStatus: 'in_rehab',
      traumaNotes: 'Chatte errante — se cache, miaule sous stress.',
      status: 'in_rehab',
      shelter: { id: 'sh1', name: 'Refuge Les Amis à Quatre Pattes', region: 'Tunis' },
    },
    treatments: [
      {
        id: 't4',
        treatmentType: 'nutrition',
        title: 'Repas séparé, gamelle fixe',
        completedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        progressDelta: 5,
      },
      {
        id: 't5',
        treatmentType: 'behavior',
        title: 'Approche à distance (lecture calme)',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        progressDelta: 7,
      },
    ],
  },
];

const normalizeProgram = (row) => {
  if (!row) return row;
  const animal = row.animal || {};
  return {
    ...row,
    fearLabel: FEAR_LABELS[animal.fearLevel] || FEAR_LABELS[3],
    phaseLabel: REHAB_PHASES.find((p) => p.id === row.phase)?.label || row.phase,
    treatments: (row.treatments || []).map((t) => ({
      ...t,
      typeLabel: TREATMENT_TYPES.find((x) => x.id === t.treatmentType)?.label || t.treatmentType,
      icon: TREATMENT_TYPES.find((x) => x.id === t.treatmentType)?.icon || '💚',
    })),
  };
};

const buildRuleBasedPlan = (animal) => {
  const level = animal.fearLevel || 3;
  const steps = [];
  if (level >= 4) {
    steps.push('Semaines 1-2 : zone refuge isolée, aucun contact direct, nourriture à distance fixe.');
    steps.push('Semaines 3-4 : désensibilisation sons faibles + présence humaine assise (sans contact).');
  } else {
    steps.push('Semaines 1-2 : routine stable, friandises haute valeur à distance réduite progressivement.');
  }
  steps.push('Socialisation : un seul référent, sessions courtes (5-15 min), toujours option de retraite.');
  steps.push('Éviter punitions et approches frontales ; renforcer chaque signe de détente (clignement, bâillement).');
  if (animal.species === 'cat') {
    steps.push('Chat : cachettes verticales, litière en zone calme, pas de mélange avec chiens stressants.');
  } else {
    steps.push('Chien : promenade en laisse longue dans zone peu fréquentée avant rencontres canines.');
  }
  return steps;
};

const getRehabOverview = async (query = {}) => {
  const scaredOnly = query.scaredOnly === 'true' || query.scaredOnly === '1';

  if (isDemoMode()) {
    let programs = demoPrograms.map(normalizeProgram);
    if (scaredOnly) {
      programs = programs.filter((p) => p.animal?.isScared);
    }
    return {
      phases: REHAB_PHASES,
      treatmentTypes: TREATMENT_TYPES,
      fearLabels: FEAR_LABELS,
      kpis: {
        inRehab: programs.length,
        readyForAdoption: 0,
        avgProgress: Math.round(
          programs.reduce((s, p) => s + p.progressPercent, 0) / (programs.length || 1)
        ),
      },
      programs,
    };
  }

  const whereAnimal = scaredOnly ? { isScared: true } : { rehabStatus: { in: ['intake', 'in_rehab', 'ready_for_adoption'] } };

  let programs;
  try {
    programs = await prisma.petRehabilitationProgram.findMany({
      where: { animal: whereAnimal },
      include: {
        animal: { include: { shelter: true } },
        treatments: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
      orderBy: { progressPercent: 'desc' },
    });
  } catch (err) {
    console.warn('Réhabilitation DB:', err.message);
    let programs = demoPrograms.map(normalizeProgram);
    if (scaredOnly) programs = programs.filter((p) => p.animal?.isScared);
    return {
      phases: REHAB_PHASES,
      treatmentTypes: TREATMENT_TYPES,
      fearLabels: FEAR_LABELS,
      kpis: {
        inRehab: programs.length,
        readyForAdoption: 0,
        avgProgress:
          programs.length > 0
            ? Math.round(programs.reduce((s, p) => s + p.progressPercent, 0) / programs.length)
            : 0,
      },
      programs,
      fallback: true,
      generatedAt: new Date().toISOString(),
    };
  }

  const normalized = programs.map((p) =>
    normalizeProgram({
      ...p,
      animal: {
        ...p.animal,
        fearLabel: FEAR_LABELS[p.animal.fearLevel],
      },
    })
  );

  const inRehab = await prisma.shelterAnimal.count({
    where: { rehabStatus: 'in_rehab' },
  });

  return {
    phases: REHAB_PHASES,
    treatmentTypes: TREATMENT_TYPES,
    fearLabels: FEAR_LABELS,
    kpis: {
      inRehab,
      readyForAdoption: await prisma.shelterAnimal.count({
        where: { rehabStatus: 'ready_for_adoption' },
      }),
      avgProgress:
        normalized.length > 0
          ? Math.round(normalized.reduce((s, p) => s + p.progressPercent, 0) / normalized.length)
          : 0,
    },
    programs: normalized,
  };
};

const getProgramByAnimalId = async (animalId) => {
  if (isDemoMode()) {
    const found = demoPrograms.find((p) => p.shelterAnimalId === animalId || p.animal?.id === animalId);
    if (!found) {
      const err = new Error('Programme introuvable');
      err.status = 404;
      throw err;
    }
    return { program: normalizeProgram(found), carePlan: buildRuleBasedPlan(found.animal) };
  }

  const program = await prisma.petRehabilitationProgram.findFirst({
    where: { shelterAnimalId: animalId },
    include: {
      animal: { include: { shelter: true } },
      treatments: { orderBy: [{ completedAt: 'desc' }, { scheduledAt: 'asc' }] },
    },
  });
  if (!program) {
    const err = new Error('Programme introuvable');
    err.status = 404;
    throw err;
  }
  return {
    program: normalizeProgram(program),
    carePlan: buildRuleBasedPlan(program.animal),
  };
};

const logTreatment = async (user, body) => {
  const { programId, shelterAnimalId, treatmentType, title, notes, scheduledAt, progressDelta } =
    body || {};

  if (isDemoMode()) {
    return {
      id: `t_demo_${Date.now()}`,
      programId: programId || 'rehab_demo_1',
      treatmentType: treatmentType || 'behavior',
      title: title || 'Séance comportementale',
      notes,
      scheduledAt,
      progressDelta: progressDelta ?? 5,
      performedBy: user?.name || 'Staff',
      message: 'Traitement enregistré (démo)',
    };
  }

  let program = programId
    ? await prisma.petRehabilitationProgram.findUnique({ where: { id: programId } })
    : null;

  if (!program && shelterAnimalId) {
    program = await prisma.petRehabilitationProgram.findUnique({
      where: { shelterAnimalId },
    });
  }

  if (!program) {
    const err = new Error('Programme réhabilitation requis');
    err.status = 400;
    throw err;
  }

  if (!TREATMENT_TYPES.some((t) => t.id === treatmentType)) {
    const err = new Error('Type de traitement invalide');
    err.status = 400;
    throw err;
  }

  const delta = Math.min(15, Math.max(1, Number(progressDelta) || 5));
  const treatment = await prisma.petRehabilitationTreatment.create({
    data: {
      programId: program.id,
      treatmentType,
      title: title || TREATMENT_TYPES.find((t) => t.id === treatmentType)?.label,
      notes: notes || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      completedAt: scheduledAt ? null : new Date(),
      progressDelta: delta,
      performedBy: user?.name || user?.email || 'Staff',
    },
  });

  const newProgress = Math.min(100, program.progressPercent + delta);
  let nextPhase = program.phase;
  if (newProgress >= 75) nextPhase = 'adoption_ready';
  else if (newProgress >= 50) nextPhase = 'socialization';
  else if (newProgress >= 25) nextPhase = 'desensitization';

  await prisma.petRehabilitationProgram.update({
    where: { id: program.id },
    data: {
      progressPercent: newProgress,
      phase: nextPhase,
      completedAt: newProgress >= 100 ? new Date() : null,
    },
  });

  await prisma.shelterAnimal.update({
    where: { id: program.shelterAnimalId },
    data: {
      rehabStatus: newProgress >= 75 ? 'ready_for_adoption' : 'in_rehab',
      status: newProgress >= 75 ? 'available' : 'in_rehab',
    },
  });

  return treatment;
};

const REHAB_ML_SYSTEM = `Tu es comportementaliste refuge PetfoodTN spécialisé animaux abandonnés et très peureux.
Propose un plan de réhabilitation bienveillant en français (5-7 puces concrètes, sans punition).`;

const getMlRehabAdvice = async (animalId) => {
  const { program, carePlan } = await getProgramByAnimalId(animalId);
  const animal = program.animal;

  let aiSummary = null;
  if (process.env.GROQ_API_KEY) {
    aiSummary = await completionWithSystem(
      REHAB_ML_SYSTEM,
      JSON.stringify(
        {
          name: animal.name,
          species: animal.species,
          fearLevel: animal.fearLevel,
          traumaNotes: animal.traumaNotes,
          phase: program.phase,
          progress: program.progressPercent,
        },
        null,
        2
      ).slice(0, 2000),
      { max_tokens: 400 }
    ).catch(() => null);
  }

  return {
    program,
    carePlan,
    aiSummary:
      aiSummary ||
      `Priorité pour ${animal.name} : sécurité émotionnelle, repas prévisible, progression très lente. ${carePlan[0] || ''}`,
    model: aiSummary ? 'groq_rehab_v1' : 'rules_rehab_v1',
  };
};

const seedRehabData = async () => {
  if (isDemoMode()) return;
  try {
    const scared = await prisma.shelterAnimal.findFirst({ where: { isScared: true } });
    if (scared) return;
  } catch (err) {
    console.warn('Réhabilitation: seed ignoré (schéma Prisma non à jour?)', err.message);
    return;
  }

  let shelter = await prisma.shelter.findFirst();
  if (!shelter) {
    shelter = await prisma.shelter.create({
      data: {
        name: 'Refuge Les Amis à Quatre Pattes',
        region: 'Tunis',
        description: 'Réhabilitation animaux abandonnés et craintifs',
      },
    });
  }

  const shadow = await prisma.shelterAnimal.create({
    data: {
      shelterId: shelter.id,
      name: 'Shadow',
      species: 'dog',
      breed: 'Croisé',
      ageYears: 2,
      origin: 'abandoned',
      fearLevel: 5,
      isScared: true,
      rehabStatus: 'in_rehab',
      status: 'in_rehab',
      traumaNotes: 'Abandonné — fuit les humains.',
      description: 'En programme de réhabilitation comportementale',
    },
  });

  const program = await prisma.petRehabilitationProgram.create({
    data: {
      shelterAnimalId: shadow.id,
      phase: 'trust',
      progressPercent: 15,
      targetWeeks: 10,
      goalsJson: JSON.stringify(['Prise de confiance', 'Désensibilisation', 'Adoption']),
    },
  });

  await prisma.petRehabilitationTreatment.createMany({
    data: [
      {
        programId: program.id,
        treatmentType: 'vet_care',
        title: 'Bilan santé initial',
        completedAt: new Date(),
        progressDelta: 10,
        performedBy: 'Vétérinaire refuge',
      },
      {
        programId: program.id,
        treatmentType: 'safe_space',
        title: 'Installation box calme',
        completedAt: new Date(),
        progressDelta: 5,
        performedBy: 'Équipe refuge',
      },
    ],
  });
};

module.exports = {
  REHAB_PHASES,
  TREATMENT_TYPES,
  getRehabOverview,
  getProgramByAnimalId,
  logTreatment,
  getMlRehabAdvice,
  seedRehabData,
};
