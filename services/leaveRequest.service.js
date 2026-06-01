const { prisma } = require('../prismaClient');
const {
  isValidLeaveType,
  isValidLeaveStatus,
  isStaffRole,
} = require('../utils/leaveTypes');

const parseDate = (value, fieldName) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error(`${fieldName} invalide`);
    err.status = 400;
    throw err;
  }
  return d;
};

const userInclude = {
  user: { select: { id: true, name: true, email: true, role: true, region: true } },
};

const formatRequest = (row) => ({
  ...row,
  _id: row.id,
});

const createLeaveRequest = async (user, payload) => {
  const role = user.role;
  if (!isStaffRole(role)) {
    const err = new Error('Seuls vétérinaire et livreur peuvent créer une demande');
    err.status = 403;
    throw err;
  }

  const type = payload.type;
  if (!isValidLeaveType(type)) {
    const err = new Error('Type invalide (conge ou maladie)');
    err.status = 400;
    throw err;
  }

  const startDate = parseDate(payload.startDate, 'Date de début');
  const endDate = parseDate(payload.endDate, 'Date de fin');
  if (endDate < startDate) {
    const err = new Error('La date de fin doit être après la date de début');
    err.status = 400;
    throw err;
  }

  const created = await prisma.leaveRequest.create({
    data: {
      userId: user.id || user._id,
      staffRole: role,
      type,
      startDate,
      endDate,
      reason: payload.reason?.trim() || null,
      status: 'pending',
    },
    include: userInclude,
  });

  return formatRequest(created);
};

const getMyLeaveRequests = async (userId) => {
  const rows = await prisma.leaveRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: userInclude,
  });
  return rows.map(formatRequest);
};

const getAllLeaveRequests = async ({ status, staffRole } = {}) => {
  const where = {};
  if (status && isValidLeaveStatus(status)) where.status = status;
  if (staffRole && isStaffRole(staffRole)) where.staffRole = staffRole;

  const rows = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: userInclude,
  });
  return rows.map(formatRequest);
};

const reviewLeaveRequest = async (adminUser, requestId, { status, adminNote }) => {
  if (!isValidLeaveStatus(status) || !['approved', 'rejected'].includes(status)) {
    const err = new Error('Statut invalide (approved ou rejected)');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    const err = new Error('Demande introuvable');
    err.status = 404;
    throw err;
  }
  if (existing.status !== 'pending') {
    const err = new Error('Cette demande a déjà été traitée');
    err.status = 400;
    throw err;
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      status,
      adminNote: adminNote?.trim() || null,
      reviewedBy: adminUser.id || adminUser._id,
      reviewedAt: new Date(),
    },
    include: userInclude,
  });

  try {
    const { emitToUser } = require('../utils/notificationHub');
    emitToUser(existing.userId, {
      id: `leave-${updated.id}`,
      type: 'leave_status',
      title: status === 'approved' ? 'Congé approuvé' : 'Congé refusé',
      description: adminNote?.trim() || 'Décision administration',
      link: existing.staffRole === 'vet' ? '/vet/leave-requests' : '/livreur/leave-requests',
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* non bloquant */
  }

  return formatRequest(updated);
};

const cancelLeaveRequest = async (userId, requestId) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!existing || existing.userId !== userId) {
    const err = new Error('Demande introuvable');
    err.status = 404;
    throw err;
  }
  if (existing.status !== 'pending') {
    const err = new Error('Seules les demandes en attente peuvent être annulées');
    err.status = 400;
    throw err;
  }

  await prisma.leaveRequest.delete({ where: { id: requestId } });
  return { message: 'Demande annulée' };
};

module.exports = {
  createLeaveRequest,
  getMyLeaveRequests,
  getAllLeaveRequests,
  reviewLeaveRequest,
  cancelLeaveRequest,
};
