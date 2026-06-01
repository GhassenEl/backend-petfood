const { prisma, isDemoMode } = require('../prismaClient');
const { useDemoStore } = require('../utils/demoUser');
const { emitToUser } = require('../utils/notificationHub');

const demoVaccineReminders = [];

const getUserId = (user) => user?.id || user?._id;

const daysUntil = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d - new Date()) / (24 * 60 * 60 * 1000));
};

const classifyVaccine = (v) => {
  const due = daysUntil(v.nextDue);
  if (due === null) return { urgency: 'unknown', daysUntil: null };
  if (due < 0) return { urgency: 'overdue', daysUntil: due };
  if (due <= 7) return { urgency: 'soon', daysUntil: due };
  if (due <= 30) return { urgency: 'upcoming', daysUntil: due };
  return { urgency: 'ok', daysUntil: due };
};

const getReminders = async (user) => {
  const userId = getUserId(user);
  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  if (isDemoMode() || useDemoStore(user)) {
    const samples = [
      {
        id: 'vr1',
        petName: 'Max',
        animalType: 'dog',
        vaccineType: 'Rage',
        nextDue: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        dateAdministered: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'due_soon',
      },
      {
        id: 'vr2',
        petName: 'Luna',
        animalType: 'cat',
        vaccineType: 'Typhus / Coryza',
        nextDue: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        dateAdministered: new Date(now.getTime() - 370 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'overdue',
      },
      {
        id: 'vr3',
        petName: 'Max',
        animalType: 'dog',
        vaccineType: 'Parvovirose',
        nextDue: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        dateAdministered: new Date(now.getTime() - 345 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'up_to_date',
      },
    ];
    return samples.map((v) => ({ ...v, ...classifyVaccine(v) }));
  }

  const vaccines = await prisma.petVaccine.findMany({
    where: {
      ownerId: userId,
      nextDue: { not: null },
    },
    orderBy: { nextDue: 'asc' },
  });

  return vaccines.map((v) => ({
    ...v,
    ...classifyVaccine(v),
  }));
};

const syncReminders = async (userId, user = null) => {
  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  if (isDemoMode() || useDemoStore(user || { id: userId })) return { sent: 0 };

  const due = await prisma.petVaccine.findMany({
    where: {
      ownerId: userId,
      nextDue: { lte: in7Days },
      reminderSent: false,
    },
  });

  let sent = 0;
  for (const v of due) {
    const { urgency, daysUntil: days } = classifyVaccine(v);
    if (urgency === 'ok' || urgency === 'unknown') continue;

    emitToUser(userId, {
      id: `vaccine-${v.id}`,
      type: 'vaccine_reminder',
      title: urgency === 'overdue' ? '⚠️ Vaccin en retard' : '💉 Rappel vaccin',
      description: `${v.petName} — ${v.vaccineType}${days !== null ? ` (${days <= 0 ? 'en retard' : `dans ${days} j`})` : ''}`,
        link: '/medical-dossier',
      read: false,
      createdAt: now.toISOString(),
    });

    await prisma.petVaccine.update({
      where: { id: v.id },
      data: { reminderSent: true, reminderAt: now },
    });
    sent += 1;
  }

  return { sent };
};

module.exports = {
  getReminders,
  syncReminders,
  classifyVaccine,
};
