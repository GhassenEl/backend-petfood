const { prisma, isDemoMode } = require('../prismaClient');
const { isVetOrAdmin } = require('../middleware/auth');
const demoStore = require('../utils/demoStore');

const ownerWhere = async (req) => {
  const ownerId = req.user?.id || req.user?._id;
  const ids = new Set([String(ownerId)]);
  if (req.user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(req.user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id) ids.add(String(dbUser.id));
  }
  const list = [...ids];
  return list.length === 1 ? { ownerId: list[0] } : { ownerId: { in: list } };
};

const resolveOwnerId = async (req) => {
  const ownerId = req.user?.id || req.user?._id;
  if (req.user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(req.user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id) return dbUser.id;
  }
  return ownerId;
};

const getContactRequests = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.user?._id;
    if (isDemoMode()) {
      const requests = demoStore.getVeterinaryContactRequests(ownerId, isVetOrAdmin(req));
      return res.json(requests);
    }

    const where = isVetOrAdmin(req) ? {} : await ownerWhere(req);
    const requests = await prisma.veterinaryContactRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    return res.json(requests);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load contact requests' });
  }
};

const { normalizeVisitOptions } = require('../utils/visitMode');

const submitContactRequest = async (req, res) => {
  try {
    if (isDemoMode()) {
      const ownerId = req.user?.id || req.user?._id;
      const created = demoStore.createVeterinaryContactRequest(req.user, {
        animalType: req.body?.animalType,
        petName: req.body?.petName || undefined,
        subject: req.body?.subject,
        message: req.body?.message,
        preferredDate: req.body?.preferredDate || undefined,
        visitMode: req.body?.visitMode,
        homeAddress: req.body?.homeAddress,
      });
      return res.status(201).json(created);
    }

    const ownerId = await resolveOwnerId(req);
    const visit = normalizeVisitOptions({
      visitMode: req.body?.visitMode,
      homeAddress: req.body?.homeAddress,
      type: 'veterinary_consultation',
    });

    const created = await prisma.veterinaryContactRequest.create({      data: {
        ownerId,
        animalType: req.body?.animalType,
        petName: req.body?.petName || undefined,
        subject: req.body?.subject,
        message: req.body?.message,
        preferredDate: req.body?.preferredDate ? new Date(req.body.preferredDate) : undefined,
        visitMode: visit.visitMode,
        homeAddress: visit.homeAddress,
      }
    });

    try {
      const { notifyVets } = require('../utils/notificationHub');
      await notifyVets({
        id: `vet-contact-${created.id}`,
        type: 'vet_contact',
        title: visit.visitMode === 'home'
          ? `Demande domicile — ${created.subject}`
          : visit.visitMode === 'online'
            ? `Téléconsultation — ${created.subject}`
            : `Demande contact — ${created.subject}`,
        description: visit.visitMode === 'home'
          ? `${created.petName || created.animalType} · ${visit.homeAddress}`
          : visit.visitMode === 'online'
            ? `Google Meet · ${created.petName || created.animalType}`
            : (created.petName || created.animalType),
        link: '/vet/contact-requests',
        createdAt: new Date().toISOString(),
      });
    } catch {
      /* non bloquant */
    }

    return res.status(201).json(created);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || "Impossible d'envoyer la demande" });
  }
};

const respondToContactRequest = async (req, res) => {
  try {
    const requestId = req.params.id;
    if (!requestId) {
      return res.status(400).json({ error: 'ID de demande requis' });
    }

    const status = req.body?.status || 'confirmed';

    if (isDemoMode()) {
      const updated = demoStore.updateVeterinaryContactRequest(requestId, {
        status,
      });
      return res.json(updated);
    }

    const updated = await prisma.veterinaryContactRequest.update({
      where: { id: requestId },
      data: {
        status,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Impossible de mettre à jour la demande vétérinaire" });
  }
};

module.exports = {
  getContactRequests,
  submitContactRequest,
  respondToContactRequest,
};

