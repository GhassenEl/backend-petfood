const { prisma } = require('../prismaClient');

let ioInstance = null;

const setNotificationIo = (io) => {
  ioInstance = io;
};

const getNotificationIo = () => ioInstance;

const emitToUser = (userId, payload) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit('notification:new', payload);
};

const emitHumanMessage = (userId, message) => {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit('message:new', message);
};

const emitToRole = (role, payload) => {
  if (!ioInstance || !role) return;
  ioInstance.to(`role:${role}`).emit('notification:new', payload);
};

const notifyLivreursInRegion = async (region, payload) => {
  if (!region) {
    emitToRole('livreur', payload);
    return;
  }
  try {
    const livreurs = await prisma.user.findMany({
      where: { role: 'livreur', region },
      select: { id: true },
    });
    if (!livreurs.length) {
      emitToRole('livreur', payload);
      return;
    }
    livreurs.forEach((l) => emitToUser(l.id, payload));
  } catch {
    emitToRole('livreur', payload);
  }
};

const notifyVets = async (payload, vetId = null) => {
  if (vetId) {
    emitToUser(vetId, payload);
    return;
  }
  try {
    const vets = await prisma.user.findMany({
      where: { role: 'vet' },
      select: { id: true },
    });
    vets.forEach((v) => emitToUser(v.id, payload));
  } catch {
    emitToRole('vet', payload);
  }
};

module.exports = {
  setNotificationIo,
  getNotificationIo,
  emitToUser,
  emitHumanMessage,
  emitToRole,
  notifyLivreursInRegion,
  notifyVets,
};
