const crypto = require('crypto');
const { prisma, isDemoMode } = require('../../prismaClient');
const uid = (u) => String(u?.id || u?._id);

const animalEmoji = { dog: '🐕', cat: '🐈', bird: '🐦', fish: '🐠', other: '🐾' };

const buildPassportNumber = (petId, existing) => {
  if (existing) return existing;
  const hash = crypto.createHash('sha256').update(String(petId)).digest('hex').slice(0, 8).toUpperCase();
  return `PPTN-${new Date().getFullYear()}-${hash}`;
};

const buildVerificationCode = (payload) =>
  crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16).toUpperCase();

const DEMO_PETS = [
  {
    id: 'demo_pet_rex',
    name: 'Rex',
    type: 'dog',
    breed: 'Berger Allemand',
    sex: 'male',
    color: 'Noir et feu',
    birthDate: new Date('2020-05-12'),
    weight: 28,
    microchipId: 'TN-982-001-234567',
    passportNumber: 'PPTN-2026-REX001',
  },
  {
    id: 'demo_pet_mimi',
    name: 'Mimi',
    type: 'cat',
    breed: 'Européen',
    sex: 'female',
    color: 'Gris tigré',
    birthDate: new Date('2022-03-08'),
    weight: 4.2,
    microchipId: 'TN-982-005-891234',
    passportNumber: 'PPTN-2026-MIMI002',
  },
];

const DEMO_VACCINES = [
  {
    id: 'dv1',
    petName: 'Rex',
    animalType: 'dog',
    vaccineType: 'Rage',
    dateAdministered: new Date('2025-11-10'),
    nextDue: new Date('2026-11-10'),
    batchNumber: 'RAB-2025-A42',
    vetNotes: 'Vaccin antirabique — validé',
    status: 'up_to_date',
  },
  {
    id: 'dv2',
    petName: 'Rex',
    animalType: 'dog',
    vaccineType: 'CHPPiL',
    dateAdministered: new Date('2026-01-15'),
    nextDue: new Date('2027-01-15'),
    batchNumber: 'CHP-2026-B11',
    status: 'up_to_date',
  },
  {
    id: 'dv3',
    petName: 'Mimi',
    animalType: 'cat',
    vaccineType: 'Typhus / Coryza',
    dateAdministered: new Date('2026-02-20'),
    nextDue: new Date('2027-02-20'),
    batchNumber: 'TC-2026-C09',
    status: 'up_to_date',
  },
  {
    id: 'dv4',
    petName: 'Mimi',
    animalType: 'cat',
    vaccineType: 'Rage',
    dateAdministered: new Date('2025-09-05'),
    nextDue: new Date('2026-09-05'),
    batchNumber: 'RAB-2025-D03',
    status: 'due_soon',
  },
];

const DEMO_MEDICAL_ENTRIES = [
  {
    id: 'de1',
    entryType: 'consultation',
    title: 'Consultation annuelle',
    visitDate: new Date('2026-03-10'),
    diagnosis: 'Bon état général',
    treatment: 'Vermifuge',
    isSigned: true,
    signedAt: new Date('2026-03-10'),
    signer: { name: 'Dr. Ben Ali' },
  },
  {
    id: 'de2',
    entryType: 'vaccination',
    title: 'Rappel CHPPiL',
    visitDate: new Date('2026-01-15'),
    diagnosis: 'Vaccination de rappel',
    isSigned: true,
    signedAt: new Date('2026-01-15'),
    signer: { name: 'Dr. Ben Ali' },
  },
  {
    id: 'de3',
    entryType: 'examination',
    title: 'Analyse sang — bilan',
    visitDate: new Date('2025-06-02'),
    clinicalExam: 'Numération normale',
    diagnosis: 'Aucune anomalie',
    isSigned: true,
  },
];

const ageFromBirth = (birthDate) => {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const years = (Date.now() - b.getTime()) / (365.25 * 86400000);
  if (years < 1) return `${Math.round(years * 12)} mois`;
  return `${Math.floor(years)} an(s)`;
};

const vaccineStatus = (v) => {
  const due = v.nextDue ? new Date(v.nextDue) : null;
  if (!due) return v.status || 'up_to_date';
  const days = (due - Date.now()) / 86400000;
  if (days < 0) return 'overdue';
  if (days < 30) return 'due_soon';
  return 'up_to_date';
};

const mapVaccine = (v) => ({
  id: v.id || v._id,
  vaccineType: v.vaccineType || v.vaccineName,
  dateAdministered: v.dateAdministered,
  expiryDate: v.expiryDate,
  nextDue: v.nextDue,
  batchNumber: v.batchNumber,
  vetNotes: v.vetNotes,
  status: vaccineStatus(v),
  animalType: v.animalType,
});

const resolvePets = async (userId) => {
  if (isDemoMode()) return DEMO_PETS.map((p) => ({ ...p, ownerId: userId }));
  return prisma.pet.findMany({ where: { ownerId: userId }, orderBy: { name: 'asc' } });
};

const resolveVaccines = async (userId, petName) => {
  if (isDemoMode()) {
    return DEMO_VACCINES.filter((v) => v.petName === petName).map(mapVaccine);
  }
  const rows = await prisma.petVaccine.findMany({
    where: { ownerId: userId, petName },
    orderBy: { dateAdministered: 'desc' },
  });
  return rows.map(mapVaccine);
};

const resolveDossier = async (userId, pet) => {
  if (isDemoMode()) {
    return {
      id: `demo_dossier_${pet.id}`,
      dossierNumber: `DMP-${new Date().getFullYear()}-${pet.name.slice(0, 3).toUpperCase()}`,
      petName: pet.name,
      animalType: pet.type,
      breed: pet.breed,
      sex: pet.sex,
      birthDate: pet.birthDate,
      identificationNumber: pet.microchipId,
      allergies: pet.name === 'Rex' ? 'Poulet (léger)' : null,
      chronicDiseases: null,
      diet: 'Croquettes premium',
      entries: DEMO_MEDICAL_ENTRIES,
      creator: { name: 'Dr. Ben Ali' },
    };
  }

  let dossier = null;
  if (pet.id) {
    dossier = await prisma.petMedicalDossier.findUnique({
      where: { petId: pet.id },
      include: {
        creator: { select: { id: true, name: true } },
        entries: {
          orderBy: { visitDate: 'desc' },
          include: { signer: { select: { id: true, name: true } } },
        },
      },
    });
  }
  if (!dossier) {
    dossier = await prisma.petMedicalDossier.findFirst({
      where: { ownerId: userId, petName: pet.name },
      include: {
        creator: { select: { id: true, name: true } },
        entries: {
          orderBy: { visitDate: 'desc' },
          include: { signer: { select: { id: true, name: true } } },
        },
      },
    });
  }
  return dossier;
};

const buildIdentity = (pet, dossier, owner) => ({
  petId: pet.id,
  name: pet.name,
  type: pet.type,
  typeLabel: { dog: 'Chien', cat: 'Chat', bird: 'Oiseau', fish: 'Poisson', other: 'Autre' }[pet.type] || pet.type,
  emoji: animalEmoji[pet.type] || '🐾',
  breed: pet.breed || dossier?.breed,
  sex: pet.sex || dossier?.sex,
  color: pet.color,
  birthDate: pet.birthDate || dossier?.birthDate,
  age: ageFromBirth(pet.birthDate || dossier?.birthDate),
  weightKg: pet.weight,
  microchipId: pet.microchipId || dossier?.identificationNumber,
  passportNumber: buildPassportNumber(pet.id, pet.passportNumber),
  ownerName: owner?.name,
  ownerEmail: owner?.email,
  sterilized: dossier?.sterilized,
  allergies: dossier?.allergies,
  chronicDiseases: dossier?.chronicDiseases,
  diet: dossier?.diet,
  bloodType: dossier?.bloodType,
  dossierNumber: dossier?.dossierNumber,
  vetReferent: dossier?.creator?.name,
});

const buildMedicalHistory = (entries = []) =>
  entries.map((e) => ({
    id: e.id,
    entryType: e.entryType,
    title: e.title,
    visitDate: e.visitDate,
    symptoms: e.symptoms,
    clinicalExam: e.clinicalExam,
    diagnosis: e.diagnosis,
    treatment: e.treatment,
    medications: e.medications,
    recommendations: e.recommendations,
    weight: e.weight,
    temperature: e.temperature,
    isSigned: e.isSigned,
    signedAt: e.signedAt,
    signedBy: e.signer?.name,
  }));

const getPetPassport = async (user, petId) => {
  const userId = uid(user);
  const pets = await resolvePets(userId);
  const pet = pets.find((p) => p.id === petId || p._id === petId);
  if (!pet) {
    const err = new Error('Animal introuvable');
    err.status = 404;
    throw err;
  }

  let owner = user;
  if (!isDemoMode()) {
    owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
  }

  const dossier = await resolveDossier(userId, pet);
  const vaccines = await resolveVaccines(userId, pet.name);
  const identity = buildIdentity(pet, dossier, owner);
  const medicalHistory = buildMedicalHistory(dossier?.entries || []);

  const verificationPayload = {
    passportNumber: identity.passportNumber,
    petName: identity.name,
    microchipId: identity.microchipId,
    ownerId: userId,
    updatedAt: new Date().toISOString(),
  };

  const overdueVaccines = vaccines.filter((v) => v.status === 'overdue').length;
  const dueSoonVaccines = vaccines.filter((v) => v.status === 'due_soon').length;

  return {
    identity,
    vaccines,
    medicalHistory,
    summary: {
      vaccinesTotal: vaccines.length,
      vaccinesOverdue: overdueVaccines,
      vaccinesDueSoon: dueSoonVaccines,
      medicalEntries: medicalHistory.length,
      signedEntries: medicalHistory.filter((e) => e.isSigned).length,
    },
    verification: {
      code: buildVerificationCode(verificationPayload),
      label: 'Code de vérification passeport',
    },
    issuedAt: pet.createdAt || new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };
};

const listPetPassports = async (user) => {
  const userId = uid(user);
  const pets = await resolvePets(userId);

  const passports = await Promise.all(
    pets.map(async (pet) => {
      const vaccines = await resolveVaccines(userId, pet.name);
      const dossier = await resolveDossier(userId, pet);
      const overdue = vaccines.filter((v) => v.status === 'overdue').length;
      return {
        petId: pet.id,
        name: pet.name,
        type: pet.type,
        emoji: animalEmoji[pet.type] || '🐾',
        passportNumber: buildPassportNumber(pet.id, pet.passportNumber),
        vaccinesCount: vaccines.length,
        vaccinesAlert: overdue > 0,
        medicalEntries: dossier?.entries?.length ?? (isDemoMode() ? DEMO_MEDICAL_ENTRIES.length : 0),
      };
    })
  );

  return { passports };
};

module.exports = { listPetPassports, getPetPassport, buildPassportNumber };
