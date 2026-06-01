const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { emitToUser, emitHumanMessage } = require('../utils/notificationHub');

const getUserId = (req) => req.user?.id || req.user?._id;

const normalizeOutgoing = (msg) => ({
  id: msg.id || msg._id,
  _id: msg.id || msg._id,
  message: msg.message,
  senderId: msg.senderId || msg.sender?.id || msg.sender?.userId || msg.sender?._id,
  receiverId: msg.receiverId || msg.receiver?.id || msg.receiver?.userId || msg.receiver?._id,
  senderType: msg.senderType || msg.sender?.role || msg.sender?.type,
  receiverType: msg.receiverType || msg.receiver?.role || msg.receiver?.type,
  sender: msg.sender,
  receiver: msg.receiver,
  orderId: msg.orderId || null,
  isRead: msg.isRead ?? false,
  createdAt: msg.createdAt,
});

const notifyAndEmit = (newMessage, receiver, senderName) => {
  const payload = normalizeOutgoing(newMessage);
  emitHumanMessage(receiver.id, payload);
  emitToUser(receiver.id, {
    id: `msg-${payload.id}`,
    type: 'message',
    title: `Message de ${senderName || 'un utilisateur'}`,
    description: String(payload.message || '').slice(0, 120),
    message: String(payload.message || '').slice(0, 120),
    link: receiver.role === 'admin' ? '/admin/messages' : '/livreur/messages',
    read: false,
    createdAt: payload.createdAt || new Date().toISOString(),
  });
};

const getMessages = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId } = req.query;

    if (isDemoMode()) {
      return res.json(demoStore.getMessages(req.user));
    }

    const where = {
      OR: [
        { senderId: userId },
        { receiverId: userId }
      ]
    };
    if (orderId) where.orderId = orderId;

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, role: true } },
        receiver: { select: { id: true, name: true, role: true } },
        order: { select: { id: true, status: true, total: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    await prisma.message.updateMany({
      where: { receiverId: userId, isRead: false },
      data: { isRead: true }
    });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const resolveReceiver = async (receiverId) => {
  if (!receiverId || receiverId === 'admin') {
    const { PRIMARY_ADMIN_EMAIL } = require('../utils/singleAdmin');
    const admin = await prisma.user.findUnique({
      where: { email: PRIMARY_ADMIN_EMAIL },
      select: { id: true, role: true },
    }) || await prisma.user.findFirst({
      where: { role: 'admin' },
      select: { id: true, role: true },
    });
    if (!admin) {
      const error = new Error('Administrateur introuvable');
      error.status = 404;
      throw error;
    }
    return { id: admin.id, role: admin.role };
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true, role: true },
  });
  if (!receiver) {
    const error = new Error('Destinataire introuvable');
    error.status = 404;
    throw error;
  }
  return receiver;
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, orderId, message } = req.body;
    const userId = getUserId(req);

    if (!message || !receiverId) {
      return res.status(400).json({ error: 'Receiver and message required' });
    }

    if (isDemoMode()) {
      const created = demoStore.createMessage(req.user, {
        receiverId,
        message: message.trim(),
        orderId,
      });
      const normalized = normalizeOutgoing(created);
      const receiverUser = { id: normalized.receiverId, role: normalized.receiverType || 'admin' };
      notifyAndEmit(normalized, receiverUser, req.user?.name);
      return res.status(201).json(created);
    }

    const receiver = await resolveReceiver(receiverId);

    const newMessage = await prisma.message.create({
      data: {
        senderType: req.user.role,
        senderId: userId,
        receiverType: receiver.role,
        receiverId: receiver.id,
        orderId: orderId || null,
        message: message.trim(),
        isRead: false
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
        receiver: { select: { id: true, name: true, role: true } }
      }
    });

    notifyAndEmit(newMessage, receiver, newMessage.sender?.name || req.user?.name);

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    if (isDemoMode()) return res.json({ unread: 0 });

    const unread = await prisma.message.count({
      where: {
        receiverId: getUserId(req),
        isRead: false
      }
    });
    res.json({ unread });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  getUnreadCount
};

