const { prisma, isDemoMode } = require('../prismaClient');
const { isVetOrAdmin } = require('../middleware/auth');

const getUserId = (req) => req.user?.id || req.user?._id;

const resolveOwnerId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value.id || value._id || null;
  return String(value);
};

/** Filtre RDV/consultations par vétérinaire connecté (admin = tout voir). */
const vetScope = (req, extra = {}) => {
  if (req.user?.role === 'admin') return extra;
  const vetId = getUserId(req);
  return vetId ? { ...extra, vetId } : extra;
};

const assertVetOwnsAppointment = (req, appointment, { allowUnassigned = false } = {}) => {
  if (req.user?.role === 'admin') return null;
  const vetId = getUserId(req);
  if (!appointment.vetId && allowUnassigned) return null;
  if (appointment.vetId && appointment.vetId !== vetId) {
    return 'Ce rendez-vous est assigné à un autre vétérinaire';
  }
  if (!appointment.vetId && !allowUnassigned) {
    return 'Ce rendez-vous n\'est pas encore assigné — prenez-le en charge d\'abord';
  }
  return null;
};

const { generateGoogleMeetLink } = require('../utils/googleMeet');
const { isOnlineVisit } = require('../utils/visitMode');

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const { deductStockForPrescription } = require('../services/pharmacy.service');
const { getVetClinicalAlerts } = require('../services/clinicalAlerts.service');
const { getClinicStats, getClinicProfile } = require('../services/clinic.service');

const startOfWeek = (d = new Date()) => {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
};

const getDashboard = async (req, res) => {
  try {
    const todayStart = startOfDay();
    const todayEnd = endOfDay();
    const weekStart = startOfWeek();
    const in7Days = new Date(todayEnd);
    in7Days.setDate(in7Days.getDate() + 7);

    if (isDemoMode()) {
      return res.json({
        todayAppointments: 4,
        pendingAppointments: 6,
        pendingContactRequests: 3,
        totalConsultations: 12,
        totalPrescriptions: 8,
        todayList: [],
        clinicalAlerts: [],
        unassignedCount: 2,
        clinicStats: { dossiersCount: 3, signedEntriesCount: 5, activePatients: 8, vaccinesDueSoon: 2 },
        clinic: { clinicName: 'Cabinet démo', region: 'Tunis' },
        upcomingAppointments: [],
        unassignedPreview: [],
        draftEntries: [],
        weekStats: { consultations: 4, prescriptions: 3, completedAppointments: 2 },
      });
    }

    const vetId = getUserId(req);
    const scope = vetScope(req);

    const [
      todayAppointments,
      pendingAppointments,
      pendingContactRequests,
      totalConsultations,
      totalPrescriptions,
      todayList,
      clinicalAlerts,
      unassignedCount,
      clinicStats,
      clinic,
      upcomingAppointments,
      unassignedPreview,
      draftEntries,
      weekConsultations,
      weekPrescriptions,
      weekCompletedAppts,
    ] = await Promise.all([
      prisma.petAppointment.count({
        where: vetScope(req, { date: { gte: todayStart, lte: todayEnd } }),
      }),
      prisma.petAppointment.count({
        where: vetScope(req, { status: { in: ['scheduled', 'pending', 'confirmed'] } }),
      }),
      prisma.veterinaryContactRequest.count({ where: { status: 'pending' } }),
      prisma.vetConsultation.count({ where: scope }),
      prisma.prescription.count({ where: scope }),
      prisma.petAppointment.findMany({
        where: vetScope(req, { date: { gte: todayStart, lte: todayEnd } }),
        include: { owner: { select: { id: true, name: true, email: true, phone: true } } },
        orderBy: { date: 'asc' },
        take: 12,
      }),
      getVetClinicalAlerts(vetId),
      prisma.petAppointment.count({
        where: { vetId: null, status: { in: ['scheduled', 'pending'] } },
      }),
      getClinicStats(vetId),
      getClinicProfile(vetId),
      prisma.petAppointment.findMany({
        where: vetScope(req, {
          date: { gt: todayEnd, lte: in7Days },
          status: { in: ['scheduled', 'pending', 'confirmed'] },
        }),
        include: { owner: { select: { id: true, name: true, phone: true } } },
        orderBy: { date: 'asc' },
        take: 8,
      }),
      prisma.petAppointment.findMany({
        where: { vetId: null, status: { in: ['scheduled', 'pending'] } },
        include: { owner: { select: { id: true, name: true, phone: true } } },
        orderBy: { date: 'asc' },
        take: 5,
      }),
      prisma.medicalDossierEntry.findMany({
        where: { vetId, isSigned: false },
        orderBy: { visitDate: 'desc' },
        take: 5,
        include: {
          dossier: { select: { id: true, petName: true, dossierNumber: true } },
        },
      }),
      prisma.vetConsultation.count({
        where: { ...scope, updatedAt: { gte: weekStart } },
      }),
      prisma.prescription.count({
        where: { ...scope, createdAt: { gte: weekStart } },
      }),
      prisma.petAppointment.count({
        where: { ...scope, status: 'completed', date: { gte: weekStart } },
      }),
    ]);

    return res.json({
      todayAppointments,
      pendingAppointments,
      pendingContactRequests,
      totalConsultations,
      totalPrescriptions,
      todayList,
      clinicalAlerts,
      unassignedCount,
      clinicStats,
      clinic: {
        clinicName: clinic.clinicName,
        region: clinic.region,
        acceptsHomeVisit: clinic.acceptsHomeVisit,
        acceptsTeleconsult: clinic.acceptsTeleconsult,
      },
      upcomingAppointments,
      unassignedPreview,
      draftEntries,
      weekStats: {
        consultations: weekConsultations,
        prescriptions: weekPrescriptions,
        completedAppointments: weekCompletedAppts,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur dashboard vétérinaire' });
  }
};

const getAppointments = async (req, res) => {
  try {
    if (isDemoMode()) {
      const { createPetAppointments } = require('../utils/demoData');
      const appts = createPetAppointments({ ownerId: 'demo_client', count: 20 });
      return res.json(
        appts.map((a, i) => ({
          id: `demo_vet_appt_${i}`,
          ...a,
          owner: { name: 'Client Test', email: 'client@petfood.tn' },
        }))
      );
    }

    const vetId = getUserId(req);
    const isAdmin = req.user?.role === 'admin';

    const appointments = await prisma.petAppointment.findMany({
      where: {
        type: {
          notIn: ['anniversaire', 'competitions', 'salle de sport', 'coiffure', 'cadeau', 'autre'],
        },
        ...(isAdmin
          ? {}
          : {
              OR: [
                { vetId },
                { vetId: null, status: { in: ['scheduled', 'pending'] } },
              ],
            }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true, phone: true } },
        vet: { select: { id: true, name: true } },
        consultation: true,
      },
      orderBy: { date: 'asc' },
    });
    return res.json(appointments);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur chargement rendez-vous' });
  }
};

const confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const vetId = getUserId(req);

    if (isDemoMode()) {
      return res.json({
        id,
        status: 'confirmed',
        vetId,
        meetingLink: generateGoogleMeetLink(),
      });
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Rendez-vous introuvable' });

    const ownershipError = assertVetOwnsAppointment(req, existing, { allowUnassigned: true });
    if (ownershipError) return res.status(403).json({ error: ownershipError });

    const updated = await prisma.petAppointment.update({
      where: { id },
      data: {
        status: 'confirmed',
        vetId: existing.vetId || vetId,
        reminderSent: true,
        meetingLink: isOnlineVisit(existing) || !existing.meetingLink
          ? generateGoogleMeetLink()
          : existing.meetingLink,
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur confirmation' });
  }
};

const claimAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const vetId = getUserId(req);

    if (isDemoMode()) {
      return res.json({ id, vetId, status: 'scheduled' });
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Rendez-vous introuvable' });
    if (existing.vetId && existing.vetId !== vetId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'RDV déjà assigné à un autre vétérinaire' });
    }

    const updated = await prisma.petAppointment.update({
      where: { id },
      data: { vetId },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur prise en charge RDV' });
  }
};

const getUnassignedAppointments = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json([]);
    }
    const list = await prisma.petAppointment.findMany({
      where: {
        vetId: null,
        status: { in: ['scheduled', 'pending'] },
        type: {
          notIn: ['anniversaire', 'competitions', 'salle de sport', 'coiffure', 'cadeau', 'autre'],
        },
      },
      include: { owner: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { date: 'asc' },
      take: 30,
    });
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur RDV non assignés' });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const vetId = getUserId(req);
    const { status, meetingLink, notes, vetId: assignVetId } = req.body || {};

    if (isDemoMode()) {
      return res.json({ id, status: status || 'confirmed', meetingLink, vetId: assignVetId || vetId });
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Rendez-vous introuvable' });

    const ownershipError = assertVetOwnsAppointment(req, existing, {
      allowUnassigned: !existing.vetId,
    });
    if (ownershipError) return res.status(403).json({ error: ownershipError });

    const data = {};
    if (status) data.status = status;
    if (meetingLink !== undefined) data.meetingLink = meetingLink;
    if (notes !== undefined) data.notes = notes;
    if (assignVetId || req.user.role === 'vet') data.vetId = assignVetId || vetId;

    const updated = await prisma.petAppointment.update({
      where: { id },
      data,
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur mise à jour rendez-vous' });
  }
};

const getConsultations = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json([]);
    }
    const consultations = await prisma.vetConsultation.findMany({
      where: vetScope(req),
      include: {
        owner: { select: { id: true, name: true, email: true } },
        appointment: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json(consultations);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur consultations' });
  }
};

const createConsultation = async (req, res) => {
  try {
    const vetId = getUserId(req);
    const {
      appointmentId,
      ownerId: rawOwnerId,
      petName,
      animalType,
      symptoms,
      clinicalExam,
      analysis,
      diagnosis,
      recommendations,
      status,
    } = req.body || {};

    const ownerId = resolveOwnerId(rawOwnerId);

    if (!appointmentId || !ownerId || !petName || !animalType) {
      return res.status(400).json({ error: 'appointmentId, ownerId, petName et animalType requis' });
    }

    if (isDemoMode()) {
      return res.status(201).json({
        id: `demo_consult_${Date.now()}`,
        appointmentId,
        vetId,
        ownerId,
        petName,
        animalType,
        symptoms,
        clinicalExam,
        analysis,
        diagnosis,
        recommendations,
        status: status || 'draft',
      });
    }

    const created = await prisma.vetConsultation.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        vetId,
        ownerId,
        petName,
        animalType,
        symptoms: symptoms || null,
        clinicalExam: clinicalExam || null,
        analysis: analysis || null,
        diagnosis: diagnosis || null,
        recommendations: recommendations || null,
        status: status || 'draft',
      },
      update: {
        symptoms: symptoms ?? undefined,
        clinicalExam: clinicalExam ?? undefined,
        analysis: analysis ?? undefined,
        diagnosis: diagnosis ?? undefined,
        recommendations: recommendations ?? undefined,
        status: status ?? undefined,
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur création consultation' });
  }
};

const updateConsultation = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['symptoms', 'clinicalExam', 'analysis', 'diagnosis', 'recommendations', 'status'];
    const data = {};
    for (const f of fields) {
      if (req.body?.[f] !== undefined) data[f] = req.body[f];
    }

    if (isDemoMode()) {
      return res.json({ id, ...data });
    }

    const updated = await prisma.vetConsultation.update({ where: { id }, data });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur mise à jour consultation' });
  }
};

const getPrescriptions = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json([]);
    }
    const prescriptions = await prisma.prescription.findMany({
      where: vetScope(req),
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(prescriptions);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur ordonnances' });
  }
};

const createPrescription = async (req, res) => {
  try {
    const vetId = getUserId(req);
    const { consultationId, ownerId: rawOwnerId, petName, medications, instructions, validUntil, status } = req.body || {};
    const ownerId = resolveOwnerId(rawOwnerId);

    if (!ownerId || !petName || !medications) {
      return res.status(400).json({ error: 'ownerId, petName et medications requis' });
    }

    const medsJson = typeof medications === 'string' ? medications : JSON.stringify(medications);
    let medsArray = medications;
    if (typeof medications === 'string') {
      try {
        medsArray = JSON.parse(medications);
      } catch {
        medsArray = [];
      }
    }

    if (isDemoMode()) {
      return res.status(201).json({
        id: `demo_rx_${Date.now()}`,
        consultationId,
        vetId,
        ownerId,
        petName,
        medications: medsJson,
        instructions,
        validUntil,
        status: status || 'active',
      });
    }

    const stockResult = await deductStockForPrescription(Array.isArray(medsArray) ? medsArray : []);

    const created = await prisma.prescription.create({
      data: {
        consultationId: consultationId || null,
        vetId,
        ownerId,
        petName,
        medications: medsJson,
        instructions: instructions || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        status: status || 'active',
      },
    });
    return res.status(201).json({ ...created, stock: stockResult });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur création ordonnance' });
  }
};

const updatePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    if (req.body?.medications !== undefined) {
      data.medications =
        typeof req.body.medications === 'string'
          ? req.body.medications
          : JSON.stringify(req.body.medications);
    }
    if (req.body?.instructions !== undefined) data.instructions = req.body.instructions;
    if (req.body?.validUntil !== undefined) data.validUntil = req.body.validUntil ? new Date(req.body.validUntil) : null;
    if (req.body?.status !== undefined) data.status = req.body.status;

    if (isDemoMode()) {
      return res.json({ id, ...data });
    }

    const updated = await prisma.prescription.update({ where: { id }, data });
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur mise à jour ordonnance' });
  }
};

const getClients = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json([
        {
          id: 'demo_client',
          name: 'Client Test',
          email: 'client@petfood.tn',
          phone: '+216 20 000 000',
          pets: [{ name: 'Mimi', type: 'cat' }, { name: 'Rex', type: 'dog' }],
          appointmentCount: 5,
          consultationCount: 2,
        },
      ]);
    }

    const clients = await prisma.user.findMany({
      where: { role: 'client' },
      include: {
        pets: true,
        _count: { select: { petAppointments: true, ownerConsultations: true } },
      },
      orderBy: { name: 'asc' },
    });

    return res.json(
      clients.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        pets: c.pets,
        appointmentCount: c._count.petAppointments,
        consultationCount: c._count.ownerConsultations,
      }))
    );
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur liste clients' });
  }
};

const getHistory = async (req, res) => {
  try {
    const { type, petName, ownerId } = req.query;

    if (isDemoMode()) {
      return res.json({ appointments: [], consultations: [], prescriptions: [], records: [] });
    }

    const apptWhere = {};
    const consultWhere = {};
    const rxWhere = {};
    const recordWhere = {};
    if (petName) {
      apptWhere.petName = { contains: petName };
      consultWhere.petName = { contains: petName };
      rxWhere.petName = { contains: petName };
      recordWhere.petName = { contains: petName };
    }
    if (ownerId) {
      apptWhere.ownerId = ownerId;
      consultWhere.ownerId = ownerId;
      rxWhere.ownerId = ownerId;
      recordWhere.ownerId = ownerId;
    }

    const [appointments, consultations, prescriptions, records, dossierEntries] = await Promise.all([
      !type || type === 'appointments'
        ? prisma.petAppointment.findMany({ where: { ...apptWhere, ...vetScope(req) }, orderBy: { date: 'desc' }, take: 50 })
        : [],
      !type || type === 'consultations'
        ? prisma.vetConsultation.findMany({ where: { ...consultWhere, ...vetScope(req) }, orderBy: { updatedAt: 'desc' }, take: 50 })
        : [],
      !type || type === 'prescriptions'
        ? prisma.prescription.findMany({ where: { ...rxWhere, ...vetScope(req) }, orderBy: { createdAt: 'desc' }, take: 50 })
        : [],
      !type || type === 'records'
        ? prisma.veterinaryRecord.findMany({ where: recordWhere, orderBy: { visitDate: 'desc' }, take: 50 })
        : [],
      !type || type === 'dossier'
        ? prisma.medicalDossierEntry.findMany({
            where: req.user?.role === 'admin' ? {} : { vetId: getUserId(req) },
            orderBy: { visitDate: 'desc' },
            take: 50,
            include: {
              dossier: { select: { petName: true, dossierNumber: true, ownerId: true } },
            },
          })
        : [],
    ]);

    return res.json({ appointments, consultations, prescriptions, records, dossierEntries });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur historique' });
  }
};

const getContactRequests = async (req, res) => {
  try {
    if (isDemoMode()) {
      const demoStore = require('../utils/demoStore');
      return res.json(demoStore.getVeterinaryContactRequests(null, true));
    }

    const requests = await prisma.veterinaryContactRequest.findMany({
      include: { owner: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(requests);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur demandes de contact' });
  }
};

const respondContactRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body?.status || 'confirmed';
    const response = req.body?.response;

    if (isDemoMode()) {
      const demoStore = require('../utils/demoStore');
      const updated = demoStore.updateVeterinaryContactRequest(id, { status });
      return res.json(updated);
    }

    const data = { status };
    const updated = await prisma.veterinaryContactRequest.update({
      where: { id },
      data,
    });

    if (response && updated.ownerId) {
      await prisma.message.create({
        data: {
          senderType: 'vet',
          senderId: getUserId(req),
          receiverType: 'client',
          receiverId: updated.ownerId,
          message: response,
        },
      }).catch(() => {});
    }

    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Erreur réponse demande' });
  }
};

module.exports = {
  getDashboard,
  getAppointments,
  getUnassignedAppointments,
  claimAppointment,
  confirmAppointment,
  updateAppointment,
  getConsultations,
  createConsultation,
  updateConsultation,
  getPrescriptions,
  createPrescription,
  updatePrescription,
  getClients,
  getHistory,
  getContactRequests,
  respondContactRequest,
  isVetOrAdmin,
};
