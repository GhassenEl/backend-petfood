const { prisma, isDemoMode } = require('../prismaClient');
const { isVetOrAdmin } = require('../middleware/auth');

const getUserId = (req) => req.user?.id || req.user?._id;

const resolveOwnerIds = async (req) => {
  const ownerId = getUserId(req);
  const ids = new Set([String(ownerId)]);
  if (req.user?.email && !isDemoMode()) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(req.user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id) ids.add(String(dbUser.id));
  }
  return [...ids];
};

const ownerWhere = async (req) => {
  const ids = await resolveOwnerIds(req);
  return ids.length === 1 ? { ownerId: ids[0] } : { ownerId: { in: ids } };
};

const getMyPrescriptions = async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Non authentifié' });

    if (isDemoMode()) {
      return res.json([]);
    }

    const where = isVetOrAdmin(req) && req.query?.ownerId
      ? { ownerId: req.query.ownerId }
      : await ownerWhere(req);

    const prescriptions = await prisma.prescription.findMany({
      where,
      include: {
        vet: { select: { id: true, name: true } },
        consultation: { select: { id: true, diagnosis: true, appointmentId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(prescriptions);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Impossible de charger les ordonnances' });
  }
};

const getMyConsultations = async (req, res) => {
  try {
    const ownerId = getUserId(req);
    if (!ownerId) return res.status(401).json({ error: 'Non authentifié' });

    if (isDemoMode()) {
      return res.json([]);
    }

    const ownerFilter = await ownerWhere(req);
    const where = {
      ...(isVetOrAdmin(req) && req.query?.ownerId ? { ownerId: req.query.ownerId } : ownerFilter),
      status: 'finalized',
    };

    const consultations = await prisma.vetConsultation.findMany({
      where,
      include: {
        vet: { select: { id: true, name: true } },
        appointment: { select: { id: true, date: true, meetingLink: true, status: true } },
        prescriptions: { select: { id: true, petName: true, status: true, createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json(consultations);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Impossible de charger les consultations' });
  }
};

module.exports = { getMyPrescriptions, getMyConsultations };
