const { prisma, isDemoMode } = require('../prismaClient');
const { getLowStockAlerts } = require('./pharmacy.service');

const getPatientContext = async (ownerId, petName) => {
  if (!ownerId || !petName) return { pet: null, allergies: null, vaccinesDue: [], dossierId: null };

  const [pet, dossier, vaccines, records] = await Promise.all([
    prisma.pet.findFirst({ where: { ownerId, name: petName } }),
    prisma.petMedicalDossier.findFirst({ where: { ownerId, petName } }),
    prisma.petVaccine.findMany({
      where: { ownerId, petName },
      orderBy: { dateAdministered: 'desc' },
      take: 10,
    }),
    prisma.veterinaryRecord.findMany({
      where: { ownerId, petName },
      orderBy: { visitDate: 'desc' },
      take: 3,
      select: { allergies: true, chronicDiseases: true, diet: true, weight: true },
    }),
  ]);

  const now = new Date();
  const vaccinesDue = vaccines.filter((v) => {
    if (!v.nextDue) return false;
    return new Date(v.nextDue) <= now;
  });

  const latestRecord = records[0];
  return {
    pet: pet
      ? {
          id: pet.id,
          name: pet.name,
          type: pet.type,
          weight: pet.weight ?? latestRecord?.weight,
          breed: pet.breed,
        }
      : { name: petName, weight: latestRecord?.weight },
    allergies: dossier?.allergies || latestRecord?.allergies || null,
    chronicConditions: dossier?.chronicDiseases || latestRecord?.chronicDiseases || null,
    diet: dossier?.diet || latestRecord?.diet || null,
    dossierId: dossier?.id || null,
    vaccinesDue: vaccinesDue.map((v) => ({
      type: v.vaccineType,
      nextDue: v.nextDue,
      status: v.status,
    })),
  };
};

const getPetTimeline = async ({ ownerId, petName, vetId }) => {
  if (isDemoMode()) {
    return [];
  }

  const petFilter = petName ? { petName } : {};
  const ownerFilter = ownerId ? { ownerId } : {};
  const vetFilter = vetId ? { vetId } : {};

  const [appointments, consultations, prescriptions, vaccines, dossier] = await Promise.all([
    prisma.petAppointment.findMany({
      where: { ...ownerFilter, ...petFilter },
      orderBy: { date: 'desc' },
      take: 30,
      select: { id: true, petName: true, date: true, status: true, type: true, notes: true },
    }),
    prisma.vetConsultation.findMany({
      where: { ...ownerFilter, ...petFilter, ...vetFilter },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        petName: true,
        diagnosis: true,
        symptoms: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.prescription.findMany({
      where: { ...ownerFilter, ...petFilter, ...vetFilter },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, petName: true, medications: true, createdAt: true, status: true },
    }),
    prisma.petVaccine.findMany({
      where: { ...ownerFilter, ...petFilter },
      orderBy: { dateAdministered: 'desc' },
      take: 20,
      select: { id: true, petName: true, vaccineType: true, dateAdministered: true, nextDue: true },
    }),
    petName && ownerId
      ? prisma.petMedicalDossier.findFirst({ where: { ownerId, petName }, select: { id: true } })
      : null,
  ]);

  let dossierEntries = [];
  if (dossier?.id) {
    dossierEntries = await prisma.medicalDossierEntry.findMany({
      where: { dossierId: dossier.id },
      orderBy: { visitDate: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        diagnosis: true,
        visitDate: true,
        isSigned: true,
        entryType: true,
      },
    });
  }

  const events = [
    ...appointments.map((a) => ({
      id: `appt-${a.id}`,
      type: 'appointment',
      label: `RDV — ${a.status}`,
      detail: a.notes || a.type,
      petName: a.petName,
      date: a.date,
    })),
    ...consultations.map((c) => ({
      id: `consult-${c.id}`,
      type: 'consultation',
      label: c.diagnosis || 'Consultation',
      detail: c.symptoms,
      petName: c.petName,
      date: c.updatedAt,
      status: c.status,
    })),
    ...prescriptions.map((p) => ({
      id: `rx-${p.id}`,
      type: 'prescription',
      label: 'Ordonnance',
      detail: p.medications,
      petName: p.petName,
      date: p.createdAt,
    })),
    ...dossierEntries.map((e) => ({
      id: `dossier-${e.id}`,
      type: 'dossier',
      label: e.title,
      detail: e.diagnosis,
      date: e.visitDate,
      signed: e.isSigned,
    })),
    ...vaccines.map((v) => ({
      id: `vac-${v.id}`,
      type: 'vaccine',
      label: v.vaccineType,
      detail: v.nextDue ? `Prochain: ${new Date(v.nextDue).toLocaleDateString('fr-FR')}` : '',
      petName: v.petName,
      date: v.dateAdministered,
    })),
  ];

  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
};

const getVetClinicalAlerts = async (vetId) => {
  const alerts = [];
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (isDemoMode()) {
    return [
      { type: 'stock', severity: 'medium', message: 'Carprofène — stock bas (3 unités)' },
      { type: 'vaccine', severity: 'low', message: 'Rappels vaccins à planifier cette semaine' },
    ];
  }

  const lowStock = await getLowStockAlerts();
  for (const m of lowStock.slice(0, 5)) {
    alerts.push({
      type: 'stock',
      severity: m.stockQty === 0 ? 'high' : 'medium',
      message: `${m.name} — stock ${m.stockQty} ${m.unit || 'u.'} (min ${m.minStock})`,
      link: '/vet/pharmacy',
    });
  }

  const upcomingAppts = await prisma.petAppointment.findMany({
    where: {
      vetId: vetId || undefined,
      date: { gte: now, lte: in7days },
      status: { in: ['scheduled', 'pending', 'confirmed'] },
    },
    take: 10,
    select: { id: true, petName: true, date: true, vetId: true },
  });

  for (const a of upcomingAppts) {
    alerts.push({
      type: 'appointment',
      severity: 'low',
      message: `RDV ${a.petName} — ${new Date(a.date).toLocaleString('fr-FR')}`,
      link: `/vet/appointments/${a.id}`,
    });
  }

  const unassigned = await prisma.petAppointment.count({
    where: {
      vetId: null,
      status: { in: ['scheduled', 'pending'] },
      date: { gte: now },
    },
  });
  if (unassigned > 0) {
    alerts.push({
      type: 'unassigned',
      severity: 'medium',
      message: `${unassigned} RDV non assigné(s) en attente`,
      link: '/vet/calendar',
    });
  }

  const unsignedEntries = await prisma.medicalDossierEntry.count({
    where: { vetId, isSigned: false, status: 'draft' },
  });
  if (unsignedEntries > 0) {
    alerts.push({
      type: 'dossier',
      severity: 'medium',
      message: `${unsignedEntries} entrée(s) de dossier à signer`,
      link: '/vet/medical-dossiers',
    });
  }

  return alerts.slice(0, 15);
};

module.exports = {
  getPatientContext,
  getPetTimeline,
  getVetClinicalAlerts,
};
