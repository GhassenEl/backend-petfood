const { prisma } = require('../prismaClient');

const DEFAULT_HOURS = {
  mon: '09:00-18:00',
  tue: '09:00-18:00',
  wed: '09:00-18:00',
  thu: '09:00-18:00',
  fri: '09:00-18:00',
  sat: '09:00-13:00',
  sun: 'Fermé',
};

const parsePrefs = (raw) => {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const buildProfileFromUser = (user) => ({
  clinicName: user?.name ? `Cabinet ${user.name}` : 'Cabinet vétérinaire',
  vetName: user?.name || '',
  phone: user?.phone || '',
  email: user?.email || '',
  address: user?.address || '',
  region: user?.region || '',
  location: user?.location || '',
  openingHours: { ...DEFAULT_HOURS },
  services: ['Consultation', 'Vaccination', 'Chirurgie', 'Urgences'],
  acceptsHomeVisit: true,
  acceptsTeleconsult: true,
  emergencyPhone: user?.phone || '',
  description: '',
});

const getClinicProfile = async (vetId) => {
  const user = await prisma.user.findUnique({ where: { id: vetId } });
  if (!user) {
    const error = new Error('Vétérinaire introuvable');
    error.status = 404;
    throw error;
  }

  const prefs = parsePrefs(user.preferences);
  return {
    ...buildProfileFromUser(user),
    ...(prefs.clinic || {}),
    vetId: user.id,
  };
};

const updateClinicProfile = async (vetId, data) => {
  const user = await prisma.user.findUnique({ where: { id: vetId } });
  if (!user) {
    const error = new Error('Vétérinaire introuvable');
    error.status = 404;
    throw error;
  }

  const prefs = parsePrefs(user.preferences);
  const allowed = [
    'clinicName', 'phone', 'address', 'region', 'location', 'openingHours',
    'services', 'acceptsHomeVisit', 'acceptsTeleconsult', 'emergencyPhone', 'description',
  ];
  const patch = {};
  for (const key of allowed) {
    if (data[key] !== undefined) patch[key] = data[key];
  }

  prefs.clinic = { ...(prefs.clinic || {}), ...patch };

  if (data.phone !== undefined || data.address !== undefined || data.region !== undefined) {
    await prisma.user.update({
      where: { id: vetId },
      data: {
        phone: data.phone ?? user.phone,
        address: data.address ?? user.address,
        region: data.region ?? user.region,
        preferences: JSON.stringify(prefs),
      },
    });
  } else {
    await prisma.user.update({
      where: { id: vetId },
      data: { preferences: JSON.stringify(prefs) },
    });
  }

  return getClinicProfile(vetId);
};

const getClinicStats = async (vetId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [
    dossiersCount,
    signedEntriesCount,
    todayAppointments,
    vaccinesDueSoon,
    activePatients,
  ] = await Promise.all([
    prisma.petMedicalDossier.count({
      where: {
        OR: [
          { createdByVetId: vetId },
          { entries: { some: { vetId } } },
        ],
      },
    }),
    prisma.medicalDossierEntry.count({
      where: { signedByVetId: vetId, isSigned: true },
    }),
    prisma.petAppointment.count({
      where: { vetId, date: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.petVaccine.count({
      where: {
        nextDue: { lte: in30Days },
        status: { not: 'completed' },
      },
    }),
    prisma.vetConsultation.findMany({
      where: { vetId },
      select: { ownerId: true, petName: true },
      distinct: ['ownerId', 'petName'],
    }),
  ]);

  return {
    dossiersCount,
    signedEntriesCount,
    todayAppointments,
    vaccinesDueSoon,
    activePatients: activePatients.length,
  };
};

module.exports = {
  getClinicProfile,
  updateClinicProfile,
  getClinicStats,
  DEFAULT_HOURS,
};
