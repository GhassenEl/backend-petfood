const { prisma, isDemoMode } = require('../prismaClient');
const { isVetOrAdmin } = require('../middleware/auth');
const demoStore = require('../utils/demoStore');
const { normalizeVisitOptions, isOnlineVisit } = require('../utils/visitMode');
const { generateGoogleMeetLink } = require('../utils/googleMeet');

const toISODate = (d) => {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
};

const parseDateOnly = (dateStr) => {
  if (!dateStr) return null;
  const iso = toISODate(dateStr);
  if (!iso) return null;
  return new Date(`${iso}T00:00:00.000Z`);
};

const { getPublicAvailabilitySlots } = require('../services/vetAvailability.service');

const getAvailabilitySlots = async (req, res) => {
  try {
    const { date, vetId } = req.query;
    const result = await getPublicAvailabilitySlots({ date, vetId });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load availability' });
  }
};

const getMyAppointments = async (req, res) => {
  try {
    console.log('[getMyAppointments] CALLED! isDemoMode=', isDemoMode(), 'user=', req.user);
    const isClinicalStaff = isVetOrAdmin(req);

    // In demo mode, the frontend uses /api/veterinary/appointments for clients.
    // Some demo JWTs use an id like `demo_*` which may not match the ownerId stored in DB.
    // This produced an empty list for clients.
    // Fix: in demo mode, return in-memory demo pet appointments instead of strict ownerId filtering.
    if (isDemoMode()) {
      const { createPetAppointments } = require('../utils/demoStore');

      const ownerId = req.user?.id || req.user?._id || 'demo_client';
      const count = isClinicalStaff ? 25 : 12;

      const appts = createPetAppointments({ ownerId, count });

      // Try to keep the response shape compatible with frontend.
      // frontend expects: _id/id, date, petName, notes/description, type, owner (optional)
      const normalized = appts.map((a, idx) => ({
        _id: `demo_appt_${ownerId}_${idx}_${Date.now()}`,
        id: `demo_appt_${ownerId}_${idx}_${Date.now()}`,
        ownerId,
        petName: a.petName,
        animalType: a.animalType || a.animalType === '' ? a.animalType : (a.animalType || 'other'),
        type: a.type || 'veterinary_consultation',
        date: a.date,
        notes: a.notes || null,
        description: a.notes || null,
        meetingLink: a.meetingLink || null,
        status: a.status,
      }));

      console.log(`[getMyAppointments][demo] returning ${normalized.length} appointments (isClinicalStaff=${isClinicalStaff})`);
      return res.status(200).json(normalized);
    }

    // Support multiple possible id shapes coming from auth/jwt or Prisma
    const ownerIdCandidates = [req.user?.id, req.user?._id, req.user?.userId].filter(Boolean);

    // Logic-only matching for ownerId candidates.
    if (!isClinicalStaff && ownerIdCandidates.length === 0) {
      return res.status(500).json({ error: 'Missing user id for appointments lookup' });
    }

    const normalizedOwnerIdCandidates = ownerIdCandidates
      .map((v) => {
        if (v == null) return null;
        return typeof v === 'string' ? v : String(v);
      })
      .filter(Boolean);

    const normalizedUniqueCandidates = Array.from(new Set(normalizedOwnerIdCandidates));

    if (!isClinicalStaff && req.user?.email) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { email: String(req.user.email).toLowerCase() },
          select: { id: true },
        });
        if (dbUser?.id) normalizedUniqueCandidates.push(String(dbUser.id));
      } catch {
        // ignore lookup errors
      }
    }

    const uniqueCandidates = Array.from(new Set(normalizedUniqueCandidates));

    const { PLATFORM_EVENT_TYPE_VALUES } = require('../utils/platformEvents');
    const eventTypes = Array.from(PLATFORM_EVENT_TYPE_VALUES);

    let whereClause;
    if (isClinicalStaff) {
      whereClause = { type: { notIn: eventTypes } };
    } else if (uniqueCandidates.length > 0) {
      whereClause = { ownerId: { in: uniqueCandidates }, type: { notIn: eventTypes } };
    } else {
      whereClause = { ownerId: { in: [] }, type: { notIn: eventTypes } };
    }

    let appointments = [];
    try {
      appointments = await prisma.petAppointment.findMany({
        where: whereClause,
        orderBy: { date: 'asc' },
      });

      if (!isClinicalStaff && appointments.length === 0 && uniqueCandidates.length > 0) {
        appointments = await prisma.petAppointment.findMany({
          where: { OR: uniqueCandidates.map((ownerId) => ({ ownerId })) },
          orderBy: { date: 'asc' },
        });
      }
    } catch (e) {
      appointments = await prisma.petAppointment.findMany({
        where: isClinicalStaff ? {} : { OR: uniqueCandidates.map((ownerId) => ({ ownerId })) },
        orderBy: { date: 'asc' },
      });
    }

    console.log(`[getMyAppointments] found ${appointments.length} appointments (isClinicalStaff=${isClinicalStaff})`);
    return res.status(200).json(appointments);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load appointments' });
  }
};



const createAppointment = async (req, res) => {
  try {
    const isClinicalStaff = isVetOrAdmin(req);

    const resolveOwnerId = async () => {
      if (isClinicalStaff) return req.body?.ownerId || req.user?.id || req.user?._id;
      const candidates = [req.user?.id, req.user?._id].filter(Boolean);
      for (const id of candidates) {
        if (id && !String(id).startsWith('demo_')) {
          const u = await prisma.user.findUnique({ where: { id: String(id) } });
          if (u) return u.id;
        }
      }
      if (req.user?.email) {
        const u = await prisma.user.findUnique({
          where: { email: String(req.user.email).toLowerCase() },
        });
        if (u) return u.id;
      }
      return candidates[0] || null;
    };

    const ownerId = await resolveOwnerId();

    const { petName, animalType, date, notes, meetingLink, visitMode, homeAddress, type: bodyType } = req.body || {};

    if (!petName) return res.status(400).json({ error: 'petName is required' });
    if (!animalType) return res.status(400).json({ error: 'animalType is required' });
    if (!date) return res.status(400).json({ error: 'date is required' });

    if (!isClinicalStaff) {
      const dateOnly = new Date(date).toISOString().slice(0, 10);
      const { slots } = await getPublicAvailabilitySlots({ date: dateOnly });
      const startMs = new Date(date).getTime();
      const slotOk = slots.some(
        (s) => new Date(s.start).getTime() === startMs && s.isAvailable !== false
      );
      if (!slotOk) {
        return res.status(409).json({ error: 'Ce créneau n\'est pas disponible. Choisissez un autre horaire.' });
      }
    }

    const visit = normalizeVisitOptions({ visitMode, homeAddress, type: bodyType });

    const appointmentDate = new Date(date);
    if (Number.isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }

    if (isDemoMode()) {
      // En démo, créer dans la table (si DB ok) sinon on retourne un objet.
      // Ici, comme demoMode n'est censé pas être lié au DB, on envoie un faux appointment.
      const newAppt = {
        id: `demo_appt_${Date.now()}`,
        ownerId,
        petName,
        animalType,
        type: visit.type,
        visitMode: visit.visitMode,
        homeAddress: visit.homeAddress,
        date: appointmentDate.toISOString(),
        status: 'scheduled',
        notes: notes || null,
        meetingLink: visit.visitMode === 'online'
          ? generateGoogleMeetLink()
          : (isClinicalStaff ? (meetingLink || null) : null),
        reminderSent: false,
      };
      return res.status(201).json(newAppt);
    }

    // Contrainte: pas de double booking sur même heure
    const existing = await prisma.petAppointment.findFirst({
      where: {
        date: appointmentDate,
        status: { in: ['scheduled', 'confirmed'] },
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'Ce créneau est déjà pris.' });
    }

    const appointment = await prisma.petAppointment.create({
      data: {
        ownerId,
        petName,
        animalType,
        type: visit.type,
        visitMode: visit.visitMode,
        homeAddress: visit.homeAddress,
        date: appointmentDate,
        status: 'scheduled',
        notes: notes || null,
        meetingLink: visit.visitMode === 'online'
          ? generateGoogleMeetLink()
          : (isClinicalStaff ? (meetingLink || null) : null),
        reminderSent: false,
      },
    });

    try {
      const { notifyVets } = require('../utils/notificationHub');
      const notifyTitle = visit.visitMode === 'home'
        ? `RDV à domicile — ${petName}`
        : visit.visitMode === 'online'
          ? `Téléconsultation — ${petName}`
          : `Nouveau RDV — ${petName}`;
      const notifyDesc = visit.visitMode === 'home'
        ? `${visit.homeAddress} · ${new Date(appointmentDate).toLocaleString('fr-FR')}`
        : visit.visitMode === 'online'
          ? `Google Meet · ${new Date(appointmentDate).toLocaleString('fr-FR')}`
          : new Date(appointmentDate).toLocaleString('fr-FR');

      if (appointment.vetId) {
        await notifyVets(
          {
            id: `vet-appt-${appointment.id}`,
            type: 'vet_appointment',
            title: notifyTitle,
            description: notifyDesc,
            link: `/vet/appointments/${appointment.id}`,
            createdAt: new Date().toISOString(),
          },
          appointment.vetId
        );
      }
    } catch {
      /* non bloquant */
    }

    return res.status(201).json(appointment);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Failed to create appointment' });
  }
};

const confirmAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isDemoMode()) {
      return res.json({ id, status: 'confirmed', meetingLink: generateGoogleMeetLink() });
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    const updated = await prisma.petAppointment.update({
      where: { id },
      data: {
        status: 'confirmed',
        reminderSent: true,
        meetingLink: isOnlineVisit(existing) || !existing.meetingLink
          ? generateGoogleMeetLink()
          : existing.meetingLink,
      },
    });

    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to confirm appointment' });
  }
};

const updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const isClinicalStaff = isVetOrAdmin(req);
    const ownerId = isClinicalStaff
      ? (req.body?.ownerId || req.user?.id || req.user?._id)
      : (req.user?.id || req.user?._id);

        const { petName, animalType, date, time, type, notes, meetingLink, visitMode, homeAddress } = req.body || {};

    if (!petName) return res.status(400).json({ error: 'petName is required' });

    let visit = { type: type || 'veterinary_consultation', visitMode: 'cabinet', homeAddress: null };
    if ('visitMode' in req.body || 'homeAddress' in req.body) {
      visit = normalizeVisitOptions({ visitMode, homeAddress, type });
    }

    const payload = {
      petName,
      animalType: animalType || 'other',
      type: visit.type,
      visitMode: visit.visitMode,
      homeAddress: visit.homeAddress,
      notes: notes ?? null,
    };

    if ('meetingLink' in req.body) {
      payload.meetingLink = meetingLink || null;
    }

    if (!isClinicalStaff) {
      payload.ownerId = ownerId;
    } else if (req.body?.ownerId) {
      payload.ownerId = req.body.ownerId;
    }

    let appointmentDate;
    if (date) {
      appointmentDate = new Date(date);
    }
    if (!appointmentDate && time && req.body?.dateOnly) {
      appointmentDate = new Date(`${req.body.dateOnly}T${time}:00.000Z`);
    }
    if (!appointmentDate && date && typeof date === 'string') {
      appointmentDate = new Date(date);
    }
    if (time && date && !isNaN(new Date(`${date}T${time}:00.000Z`).getTime())) {
      appointmentDate = new Date(`${date}T${time}:00.000Z`);
    }

    if (!appointmentDate || Number.isNaN(appointmentDate.getTime())) {
      return res.status(400).json({ error: 'Valid date/time is required' });
    }

    payload.date = appointmentDate;

    if (isDemoMode()) {
      return res.json({
        id,
        _id: id,
        ownerId,
        petName,
        animalType: animalType || 'other',
        type: visit.type,
        visitMode: visit.visitMode,
        homeAddress: visit.homeAddress,
        notes: notes ?? null,
        meetingLink: payload.meetingLink ?? null,
        date: appointmentDate.toISOString(),
        status: 'scheduled',
        reminderSent: false,
        updatedAt: new Date().toISOString(),
      });
    }

    // Non-admin can only update their own appointment
    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    if (!isClinicalStaff && existing.ownerId !== ownerId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Avoid double booking (best-effort) only when date changes
    if (existing.date?.toISOString() !== appointmentDate.toISOString()) {
      const existingAtSameSlot = await prisma.petAppointment.findFirst({
        where: {
          date: appointmentDate,
          status: { in: ['scheduled', 'confirmed'] },
          id: { not: id },
        },
      });
      if (existingAtSameSlot) {
        return res.status(409).json({ error: 'Ce créneau est déjà pris.' });
      }
    }

    const updated = await prisma.petAppointment.update({
      where: { id },
      data: payload,
    });

    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to update appointment' });
  }
};

const deleteAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const isClinicalStaff = isVetOrAdmin(req);
    const ownerId = req.user?.id || req.user?._id;

    if (isDemoMode()) {
      return res.json({ message: 'Appointment deleted (demo mode)' });
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });
    if (!isClinicalStaff && existing.ownerId !== ownerId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.petAppointment.delete({ where: { id } });
    return res.json({ message: 'Appointment deleted' });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to delete appointment' });
  }
};

module.exports = {
  getAvailabilitySlots,
  getMyAppointments,
  createAppointment,
  confirmAppointment,
  updateAppointment,
  deleteAppointment,
};


