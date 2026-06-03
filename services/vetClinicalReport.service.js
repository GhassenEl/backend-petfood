const { prisma, isDemoMode } = require('../prismaClient');
const { getDossierById } = require('./medicalDossier.service');
const { getPetTimeline } = require('./clinicalAlerts.service');
const { buildNutritionRecommendation } = require('./vetNutrition.service');

const getVetScope = (req) => {
  const role = req.user?.role;
  const vetId = req.user?.id || req.user?._id;
  return role === 'vet' ? { vetId } : {};
};

const buildClinicalReport = async (req, { ownerId, petName }) => {
  if (!ownerId || !petName) {
    const err = new Error('ownerId et petName requis');
    err.status = 400;
    throw err;
  }

  const vetId = req.user?.role === 'vet' ? req.user.id || req.user._id : undefined;
  const vetFilter = getVetScope(req);

  if (isDemoMode()) {
    return {
      generatedAt: new Date().toISOString(),
      patient: { petName, ownerId, owner: { name: 'Client démo' } },
      consultations: [],
      prescriptions: [],
      appointments: [],
      timeline: [],
      dossier: null,
      nutrition: await buildNutritionRecommendation({ ownerId, petName }),
    };
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true, phone: true, address: true },
  });

  const pet = await prisma.pet.findFirst({
    where: { ownerId, name: petName },
  });

  const [consultations, prescriptions, appointments, dossierRow, timeline, nutrition] =
    await Promise.all([
      prisma.vetConsultation.findMany({
        where: { ownerId, petName, ...vetFilter },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
          vet: { select: { name: true } },
          appointment: { select: { date: true, visitMode: true, status: true } },
        },
      }),
      prisma.prescription.findMany({
        where: { ownerId, petName, ...vetFilter },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { vet: { select: { name: true } } },
      }),
      prisma.petAppointment.findMany({
        where: { ownerId, petName },
        orderBy: { date: 'desc' },
        take: 30,
      }),
      prisma.petMedicalDossier.findFirst({
        where: { ownerId, petName },
        select: { id: true },
      }),
      getPetTimeline({ ownerId, petName, vetId }),
      buildNutritionRecommendation({ ownerId, petName }),
    ]);

  let dossier = null;
  if (dossierRow?.id) {
    dossier = await getDossierById(dossierRow.id);
  }

  const vetUser =
    req.user?.role === 'vet'
      ? await prisma.user.findUnique({
          where: { id: vetId },
          select: { name: true, email: true, phone: true, address: true },
        })
      : null;

  return {
    generatedAt: new Date().toISOString(),
    clinic: vetUser
      ? { veterinarian: vetUser.name, email: vetUser.email, phone: vetUser.phone }
      : null,
    patient: {
      petName,
      ownerId,
      owner,
      pet,
      animalType: pet?.type || dossier?.animalType || 'dog',
    },
    consultations,
    prescriptions,
    appointments,
    timeline,
    dossier,
    nutrition,
  };
};

module.exports = { buildClinicalReport };
