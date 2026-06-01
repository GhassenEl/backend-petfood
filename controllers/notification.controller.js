const { prisma, isDemoMode } = require('../prismaClient');
const {
  buildVetNotifications,
  countVetUnread,
  demoVetNotifications,
} = require('../utils/vetNotifications');
const {
  buildLivreurNotifications,
  countLivreurUnread,
  demoLivreurNotifications,
} = require('../utils/livreurNotifications');
const { getLeaveTypeLabel } = require('../utils/leaveTypes');

const getUserId = (req) => req.user?.id || req.user?._id;

const getTodayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const getAdminNotifications = async (userId) => {
  const todayStart = getTodayStart();

  const [newOrders, pendingComplaints, newReviews, adminMessages, pendingLeaves] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'pending', createdAt: { gte: todayStart } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.complaint.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.review.findMany({
      where: { createdAt: { gte: todayStart } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.message.findMany({
      where: { receiverId: userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);

  return [
    ...newOrders.map((o) => ({
      id: `new-order-${o.id}`,
      type: 'new_order',
      title: `Nouvelle commande #${o.id.toString().slice(-6)}`,
      description: `${o.user?.name || 'Client'} — ${o.total} DT`,
      createdAt: o.createdAt,
      link: '/admin/orders',
      read: false,
    })),
    ...pendingLeaves.map((l) => ({
      id: `leave-${l.id}`,
      type: 'leave_request',
      title: `Demande ${getLeaveTypeLabel(l.type)}`,
      description: `${l.user?.name || 'Employé'} (${l.staffRole}) — à valider`,
      createdAt: l.createdAt,
      link: '/admin/leave-requests',
      read: false,
    })),
    ...pendingComplaints.map((c) => ({
      id: `complaint-${c.id}`,
      type: 'new_complaint',
      title: `Réclamation: ${c.subject}`,
      description: `${c.user?.name || 'Client'} — ${c.message.substring(0, 40)}...`,
      createdAt: c.createdAt,
      link: '/admin/complaints',
      read: false,
    })),
    ...newReviews.map((r) => ({
      id: `review-${r.id}`,
      type: 'new_review',
      title: `Nouvel avis (${r.rating}⭐)`,
      description: `${r.user?.name || 'Client'} — ${r.comment.substring(0, 40)}...`,
      createdAt: r.createdAt,
      link: '/admin/reviews',
      read: false,
    })),
    ...adminMessages.map((m) => ({
      id: m.id,
      type: 'admin_message',
      title: 'Nouveau message',
      description: `${m.message.substring(0, 50)}...`,
      createdAt: m.createdAt,
      link: '/admin/messages',
      read: false,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getLivreurNotifications = buildLivreurNotifications;

const getClientNotifications = async (userId) => {
  const [messages, orders] = await Promise.all([
    prisma.message.findMany({
      where: { receiverId: userId, isRead: false },
      include: { order: { select: { id: true, status: true, total: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.order.findMany({
      where: { userId, status: { in: ['shipped', 'delivered'] } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  return [
    ...messages.map((m) => ({
      id: m.id,
      type: 'message',
      title: 'Nouveau message',
      description: `${m.message.substring(0, 50)}...`,
      createdAt: m.createdAt,
      link: '/client-orders',
      read: false,
    })),
    ...orders.map((o) => ({
      id: `order-${o.id}`,
      type: 'order',
      title: `Commande #${o.id.slice(-6)} ${o.status}`,
      description: `Total: ${o.total} DT`,
      createdAt: o.updatedAt || o.createdAt,
      link: '/client-orders',
      read: false,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getNotifications = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = getUserId(req);

    if (isDemoMode()) {
      if (role === 'vet') return res.json(demoVetNotifications());
      if (role === 'livreur') return res.json(demoLivreurNotifications());
      if (role === 'admin') {
        return res.json([
          {
            id: 'demo-admin-1',
            type: 'new_order',
            title: 'Nouvelle commande #A1B2C3',
            description: 'Client Test — 85,00 DT en attente de validation',
            createdAt: new Date(),
            link: '/admin/orders',
            read: false,
          },
          {
            id: 'demo-admin-2',
            type: 'new_complaint',
            title: 'Réclamation : livraison en retard',
            description: 'Client Test — merci de traiter cette réclamation rapidement',
            createdAt: new Date(Date.now() - 3600000),
            link: '/admin/complaints',
            read: false,
          },
        ]);
      }
      if (role === 'client') {
        return res.json([
          {
            id: 'demo-client-1',
            type: 'order',
            title: 'Commande #X9Y8Z7 en livraison',
            description: 'Votre colis est en route — suivez-le depuis Mes commandes',
            createdAt: new Date(),
            link: '/client-orders',
            read: false,
          },
        ]);
      }
      return res.json([]);
    }

    let notifications = [];
    if (role === 'admin') {
      notifications = await getAdminNotifications(userId);
    } else if (role === 'vet') {
      notifications = await buildVetNotifications(userId);
    } else if (role === 'livreur') {
      notifications = await getLivreurNotifications(userId);
    } else {
      notifications = await getClientNotifications(userId);
    }

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notifId = req.params.id;

    if (isDemoMode()) {
      return res.json({ message: 'Marked as read' });
    }

    const virtualPrefixes = [
      'new-order-', 'complaint-', 'review-', 'vet-appt-', 'vet-contact-', 'vet-consult-',
      'livreur-order-', 'order-', 'leave-',
    ];
    const isVirtual = virtualPrefixes.some((p) => notifId.startsWith(p));

    if (!isVirtual) {
      await prisma.message.updateMany({
        where: { id: notifId, receiverId: getUserId(req) },
        data: { isRead: true },
      });
    }

    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = getUserId(req);

    if (isDemoMode()) {
      if (role === 'vet') return res.json({ unread: demoVetNotifications().length });
      if (role === 'livreur') return res.json({ unread: demoLivreurNotifications().length });
      if (role === 'admin') return res.json({ unread: 1 });
      return res.json({ unread: 0 });
    }

    if (role === 'admin') {
      const todayStart = getTodayStart();
      const [newOrdersCount, pendingComplaintsCount, newReviewsCount, unreadMessagesCount] =
        await Promise.all([
          prisma.order.count({ where: { status: 'pending', createdAt: { gte: todayStart } } }),
          prisma.complaint.count({ where: { status: 'pending' } }),
          prisma.review.count({ where: { createdAt: { gte: todayStart } } }),
          prisma.message.count({ where: { receiverId: userId, isRead: false } }),
        ]);
      return res.json({
        unread: newOrdersCount + pendingComplaintsCount + newReviewsCount + unreadMessagesCount,
      });
    }

    if (role === 'vet') {
      const unread = await countVetUnread(userId);
      return res.json({ unread });
    }

    if (role === 'livreur') {
      const unread = await countLivreurUnread(userId);
      return res.json({ unread });
    }

    const [unreadMessages, unreadOrders] = await Promise.all([
      prisma.message.count({ where: { receiverId: userId, isRead: false } }),
      prisma.order.count({ where: { userId, status: 'shipped' } }),
    ]);

    res.json({ unread: unreadMessages + unreadOrders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  getUnreadCount,
};
