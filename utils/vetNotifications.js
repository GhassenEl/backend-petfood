const { prisma } = require('../prismaClient');
const { getLeaveTypeLabel } = require('./leaveTypes');

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const vetApptWhere = (userId, extra = {}) => ({
  ...extra,
  vetId: userId,
});

const buildVetNotifications = async (userId) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = endOfDay();

  const [pendingAppts, todayAppts, pendingContacts, unreadMessages, leaveUpdates, recentConsultations] =
    await Promise.all([
      prisma.petAppointment.findMany({
        where: vetApptWhere(userId, { status: { in: ['scheduled', 'pending'] } }),
        orderBy: { date: 'asc' },
        take: 10,
        include: { owner: { select: { name: true } } },
      }),
      prisma.petAppointment.findMany({
        where: vetApptWhere(userId, {
          date: { gte: todayStart, lte: todayEnd },
          status: { in: ['scheduled', 'confirmed', 'pending'] },
        }),
        orderBy: { date: 'asc' },
        take: 8,
        include: { owner: { select: { name: true } } },
      }),
      prisma.veterinaryContactRequest.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { owner: { select: { name: true } } },
      }),
      prisma.message.findMany({
        where: { receiverId: userId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { sender: { select: { name: true, role: true } } },
      }),
      prisma.leaveRequest.findMany({
        where: {
          userId,
          status: { in: ['approved', 'rejected'] },
          reviewedAt: { gte: daysAgo(14) },
        },
        orderBy: { reviewedAt: 'desc' },
        take: 5,
      }),
      prisma.vetConsultation.findMany({
        where: { vetId: userId, status: 'draft' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: { appointment: { select: { petName: true } } },
      }),
    ]);

  const seenAppt = new Set();
  const apptNotifs = [];

  for (const a of [...todayAppts, ...pendingAppts]) {
    if (seenAppt.has(a.id)) continue;
    seenAppt.add(a.id);
    const isToday = a.date >= todayStart && a.date <= todayEnd;
    apptNotifs.push({
      id: `vet-appt-${a.id}`,
      type: 'vet_appointment',
      title: isToday ? `RDV aujourd'hui — ${a.petName}` : `RDV à confirmer — ${a.petName}`,
      description: `${a.owner?.name || 'Client'} · ${new Date(a.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`,
      createdAt: a.date,
      link: `/vet/appointments/${a.id}`,
      read: false,
    });
  }

  const contactNotifs = pendingContacts.map((c) => ({
    id: `vet-contact-${c.id}`,
    type: 'vet_contact',
    title: `Demande contact — ${c.subject}`,
    description: `${c.owner?.name || 'Client'} · ${c.petName || c.animalType}`,
    createdAt: c.createdAt,
    link: '/vet/contact-requests',
    read: false,
  }));

  const messageNotifs = unreadMessages.map((m) => ({
    id: m.id,
    type: 'message',
    title: `Message de ${m.sender?.name || 'utilisateur'}`,
    description: `${m.message.substring(0, 60)}${m.message.length > 60 ? '…' : ''}`,
    createdAt: m.createdAt,
    link: '/vet/contact-requests',
    read: false,
  }));

  const leaveNotifs = leaveUpdates.map((l) => ({
    id: `leave-${l.id}`,
    type: 'leave_status',
    title:
      l.status === 'approved'
        ? `${getLeaveTypeLabel(l.type)} approuvé(e)`
        : `${getLeaveTypeLabel(l.type)} refusé(e)`,
    description: l.adminNote || 'Décision administration',
    createdAt: l.reviewedAt || l.updatedAt,
    link: '/vet/leave-requests',
    read: false,
  }));

  const consultNotifs = recentConsultations.map((c) => ({
    id: `vet-consult-${c.id}`,
    type: 'vet_consultation',
    title: `Consultation brouillon — ${c.petName || c.appointment?.petName || 'Patient'}`,
    description: 'À finaliser et enregistrer',
    createdAt: c.updatedAt,
    link: c.appointmentId ? `/vet/appointments/${c.appointmentId}` : '/vet/calendar',
    read: false,
  }));

  return [...apptNotifs, ...contactNotifs, ...consultNotifs, ...leaveNotifs, ...messageNotifs].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

const countVetUnread = async (userId) => {
  const notifs = await buildVetNotifications(userId);
  return notifs.length;
};

const demoVetNotifications = () => [
  {
    id: 'demo-vet-appt-1',
    type: 'vet_appointment',
    title: "RDV aujourd'hui — Mimi",
    description: 'Client Test · 10:00',
    createdAt: new Date(),
    link: '/vet/calendar',
    read: false,
  },
  {
    id: 'demo-vet-contact-1',
    type: 'vet_contact',
    title: 'Demande contact — Question alimentation',
    description: 'Client Test · Mimi (chat)',
    createdAt: new Date(Date.now() - 3600000),
    link: '/vet/contact-requests',
    read: false,
  },
];

module.exports = {
  buildVetNotifications,
  countVetUnread,
  demoVetNotifications,
};
