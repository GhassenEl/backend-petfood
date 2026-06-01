const { prisma } = require('../prismaClient');
const { getLeaveTypeLabel } = require('./leaveTypes');

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const buildLivreurNotifications = async (userId) => {
  const livreur = await prisma.user.findUnique({
    where: { id: userId },
    select: { region: true },
  });

  const orderWhere = { status: { in: ['pending', 'shipped'] } };
  if (livreur?.region) orderWhere.region = livreur.region;

  const [orders, messages, leaveUpdates] = await Promise.all([
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { updatedAt: 'desc' },
      take: 12,
      include: { user: { select: { name: true } } },
    }),
    prisma.message.findMany({
      where: { receiverId: userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
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
  ]);

  const orderNotifs = orders.map((o) => ({
    id: `livreur-order-${o.id}`,
    type: o.status === 'pending' ? 'livreur_new_order' : 'livreur_shipped',
    title:
      o.status === 'pending'
        ? `Nouvelle livraison #${o.id.slice(-6)}`
        : `Livraison en cours #${o.id.slice(-6)}`,
    description: `${o.region || 'Zone'} · ${o.user?.name || 'Client'} — ${o.total} DT`,
    createdAt: o.updatedAt || o.createdAt,
    link: o.status === 'pending' ? '/livreur/orders' : '/livreur/map',
    read: false,
  }));

  const messageNotifs = messages.map((m) => ({
    id: m.id,
    type: 'message',
    title: 'Message reçu',
    description: `${m.message.substring(0, 50)}${m.message.length > 50 ? '…' : ''}`,
    createdAt: m.createdAt,
    link: '/livreur/messages',
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
    link: '/livreur/leave-requests',
    read: false,
  }));

  return [...orderNotifs, ...leaveNotifs, ...messageNotifs].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

const countLivreurUnread = async (userId) => {
  const notifs = await buildLivreurNotifications(userId);
  return notifs.length;
};

const demoLivreurNotifications = () => [
  {
    id: 'demo-livreur-order-1',
    type: 'livreur_new_order',
    title: 'Nouvelle livraison #A1B2C3',
    description: 'Ariana · Client Test — 85 DT',
    createdAt: new Date(),
    link: '/livreur/orders',
    read: false,
  },
  {
    id: 'demo-livreur-ship-1',
    type: 'livreur_shipped',
    title: 'Livraison en cours #D4E5F6',
    description: 'La Marsa · Livraison assignée',
    createdAt: new Date(Date.now() - 1800000),
    link: '/livreur/map',
    read: false,
  },
];

module.exports = {
  buildLivreurNotifications,
  countLivreurUnread,
  demoLivreurNotifications,
};
