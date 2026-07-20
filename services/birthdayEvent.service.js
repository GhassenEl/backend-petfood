const { prisma, isDemoMode } = require('../prismaClient');

const daysUntilBirthday = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < now) next = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
  return Math.ceil((next.getTime() - now.getTime()) / 86400000);
};

const petAgeYears = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
  return Math.max(0, years);
};

const suggestBirthdayEvents = async (user) => {
  const userId = String(user.id || user._id);

  if (isDemoMode()) {
    return {
      suggestions: [
        {
          petId: 'p-max',
          petName: 'Max',
          animalType: 'dog',
          daysUntil: 12,
          ageYears: 4,
          nextBirthday: new Date(Date.now() + 12 * 86400000).toISOString(),
          suggestedTitle: 'Anniversaire Max — 5 ans',
        },
        {
          petId: 'p-luna',
          petName: 'Luna',
          animalType: 'cat',
          daysUntil: 45,
          ageYears: 2,
          nextBirthday: new Date(Date.now() + 45 * 86400000).toISOString(),
          suggestedTitle: 'Anniversaire Luna — 3 ans',
        },
      ],
      existingBirthdayEvents: [],
    };
  }

  const pets = await prisma.pet.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, type: true, birthDate: true },
  });

  const suggestions = pets
    .map((pet) => {
      const daysUntil = daysUntilBirthday(pet.birthDate);
      const ageYears = petAgeYears(pet.birthDate);
      if (daysUntil == null) return null;
      const next = new Date();
      next.setDate(next.getDate() + daysUntil);
      return {
        petId: pet.id,
        petName: pet.name,
        animalType: pet.type,
        daysUntil,
        ageYears,
        nextBirthday: next.toISOString(),
        suggestedTitle: `Anniversaire ${pet.name}${ageYears != null ? ` — ${ageYears + 1} ans` : ''}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const existing = await prisma.petAppointment.findMany({
    where: {
      ownerId: userId,
      type: 'anniversaire',
      date: { gte: new Date() },
    },
    select: { id: true, petName: true, date: true, status: true, title: true },
  });

  return { suggestions, existingBirthdayEvents: existing };
};

const reserveBirthdayEvent = async (user, { petId, eventDate, notes, meetingLink }) => {
  const userId = String(user.id || user._id);

  if (!petId) {
    const err = new Error('Sélectionnez un animal');
    err.status = 400;
    throw err;
  }

  if (isDemoMode()) {
    const date = eventDate ? new Date(eventDate) : new Date(Date.now() + 12 * 86400000);
    return {
      event: {
        id: `demo-bday-${Date.now()}`,
        title: 'Anniversaire animal',
        petName: 'Max',
        animalType: 'dog',
        type: 'anniversaire',
        date: date.toISOString(),
        status: 'scheduled',
      },
      registration: {
        id: `demo-reg-${Date.now()}`,
        petName: 'Max',
        status: 'registered',
      },
      message: 'Réservation anniversaire confirmée (mode démo) !',
    };
  }

  const pet = await prisma.pet.findFirst({
    where: { id: petId, ownerId: userId },
  });

  if (!pet) {
    const err = new Error('Animal introuvable');
    err.status = 404;
    throw err;
  }

  const petName = pet.name;
  const animalType = pet.type || 'dog';
  const ageYears = petAgeYears(pet.birthDate);
  const title = `Anniversaire ${petName}${ageYears != null ? ` — ${ageYears + 1} ans` : ''}`;

  let date = eventDate ? new Date(eventDate) : null;
  if (!date || Number.isNaN(date.getTime())) {
    const days = daysUntilBirthday(pet.birthDate) ?? 30;
    date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(15, 0, 0, 0);
  }

  const event = await prisma.petAppointment.create({
    data: {
      ownerId: userId,
      petName,
      animalType,
      type: 'anniversaire',
      category: 'event',
      title,
      isPublic: false,
      date,
      status: 'scheduled',
      notes: notes || `Fête d'anniversaire pour ${petName}`,
      meetingLink: meetingLink || null,
      eventVenue: 'Clinique / domicile — à confirmer',
      eventCapacity: 1,
    },
  });

  const registration = await prisma.petEventRegistration.create({
    data: {
      eventId: event.id,
      userId,
      petName,
      status: 'registered',
      entryNumber: `BDAY-${String(Date.now()).slice(-6)}`,
    },
  });

  return {
    event,
    registration,
    message: `Anniversaire de ${petName} réservé le ${date.toLocaleDateString('fr-FR')}`,
  };
};

module.exports = {
  suggestBirthdayEvents,
  reserveBirthdayEvent,
  daysUntilBirthday,
  petAgeYears,
};
