const { prisma, isDemoMode } = require('../prismaClient');
const {
  PLATFORM_EVENT_TYPE_VALUES,
  ANIMAL_EVENT_TYPE_VALUES,
  normalizeEventRow,
} = require('../utils/platformEvents');

const eventTypeList = Array.from(PLATFORM_EVENT_TYPE_VALUES);

const buildEventWhere = (extra = {}) => ({
  type: { in: eventTypeList },
  ...extra,
});

const matchesPublicScope = (row, ownerIds, scope, isAdmin) => {
  if (isAdmin || scope === 'mine') return true;
  if (row.isPublic === true) return true;
  return ownerIds.includes(String(row.ownerId));
};
const { createPlatformEvents: createDemoPlatformEvents, registerDemoEvent, getDemoEventRegistrationsForUser, getDemoEventRegistration } = require('../utils/demoStore');
const { parseEventPrizes, prizeMeta } = require('../utils/eventPrizes');

const getUserId = (req) => req.user?.id || req.user?._id;

const resolveOwnerId = async (req) => {
  const candidates = [req.user?.id, req.user?._id].filter(Boolean);
  if (req.user?.email) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { email: String(req.user.email).toLowerCase() },
        select: { id: true },
      });
      if (dbUser?.id) candidates.push(dbUser.id);
    } catch {
      /* ignore */
    }
  }
  return [...new Set(candidates.map(String))];
};

const enrichEventForUser = (row, userId) => {
  if (!userId) return normalizeEventRow(row);
  const reg = getDemoEventRegistration(row.id || row._id, String(userId));
  const userPrize = reg?.status === 'winner' && reg.prizeLabel
    ? { label: reg.prizeLabel, type: reg.prizeType, wonAt: reg.wonAt, entryNumber: reg.entryNumber }
    : null;
  return normalizeEventRow({
    ...row,
    userRegistered: Boolean(reg),
    userPrize,
    userEntryNumber: reg?.entryNumber || null,
  });
};

const listEvents = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const scope = req.query.scope === 'mine' ? 'mine' : 'all';
    const animalOnly = req.query.animalOnly === 'true' || req.query.animalOnly === '1';
    const ownerIds = await resolveOwnerId(req);

    const userId = getUserId(req);

    if (isDemoMode()) {
      const rows = createDemoPlatformEvents({
        ownerId: ownerIds[0] || 'demo_client',
        count: isAdmin ? 30 : 18,
      });
      let filtered =
        isAdmin || scope === 'all'
          ? rows
          : rows.filter((r) => ownerIds.includes(String(r.ownerId)));
      if (scope === 'mine' && userId) {
        const myRegs = getDemoEventRegistrationsForUser(String(userId));
        const myEventIds = new Set(myRegs.map((r) => r.eventId));
        filtered = rows.filter((r) => myEventIds.has(r.id || r._id));
      }
      if (animalOnly) {
        filtered = filtered.filter((r) => ANIMAL_EVENT_TYPE_VALUES.has(r.type));
      }
      const competitionsOnly = req.query.competitionsOnly === 'true' || req.query.competitionsOnly === '1';
      if (competitionsOnly) {
        filtered = filtered.filter((r) => ['concours', 'competitions', 'exposition', 'journee_adoption', 'cadeau'].includes(r.type));
      }
      return res.json(filtered.map((row) => enrichEventForUser(row, userId)));
    }

    let where = buildEventWhere();
    if (!isAdmin && scope === 'mine') {
      where = buildEventWhere({ ownerId: { in: ownerIds } });
    }
    if (animalOnly) {
      where = {
        ...where,
        type: { in: Array.from(ANIMAL_EVENT_TYPE_VALUES) },
      };
    }

    const baseInclude = isAdmin
      ? { owner: { select: { id: true, name: true, email: true } } }
      : {};

    let rows;
    try {
      rows = await prisma.petAppointment.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
          ...baseInclude,
          _count: { select: { registrations: true } },
        },
      });
    } catch (prismaErr) {
      rows = await prisma.petAppointment.findMany({
        where,
        orderBy: { date: 'asc' },
        include: baseInclude,
      });
    }

    const scoped = rows.filter((row) =>
      matchesPublicScope(row, ownerIds, scope, isAdmin)
    );

    return res.json(
      scoped.map((row) =>
        normalizeEventRow({
          ...row,
          registrationsCount: row._count?.registrations ?? 0,
        })
      )
    );
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load events' });
  }
};

const createEvent = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const {
      title,
      petName,
      animalType = 'other',
      date,
      notes,
      type = 'autre',
      ownerId,
      meetingLink,
      isPublic = true,
      eventVenue,
      eventCapacity,
    } = req.body || {};

    if (!date) return res.status(400).json({ error: 'date is required' });
    if (!PLATFORM_EVENT_TYPE_VALUES.has(type)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    const eventDate = new Date(date);
    if (Number.isNaN(eventDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date' });
    }

    const resolvedOwner =
      ownerId ||
      (await prisma.user.findFirst({ where: { role: 'client' }, select: { id: true } }))?.id;

    if (!resolvedOwner) {
      return res.status(400).json({ error: 'ownerId is required (no client in database)' });
    }

    const displayTitle = (title || petName || type).trim();
    if (!displayTitle) {
      return res.status(400).json({ error: 'title or petName is required' });
    }

    if (isDemoMode()) {
      const row = {
        id: `demo_event_${Date.now()}`,
        _id: `demo_event_${Date.now()}`,
        ownerId: resolvedOwner,
        petName: petName || displayTitle,
        title: displayTitle,
        animalType,
        type,
        category: 'event',
        isPublic: Boolean(isPublic),
        date: eventDate.toISOString(),
        status: 'scheduled',
        notes: notes || null,
        meetingLink: meetingLink || null,
        eventVenue: eventVenue || null,
        eventCapacity: eventCapacity != null ? Number(eventCapacity) : null,
        reminderSent: false,
      };
      return res.status(201).json(normalizeEventRow(row));
    }

    const createData = {
      ownerId: resolvedOwner,
      petName: petName || displayTitle,
      animalType,
      type,
      date: eventDate,
      status: 'scheduled',
      notes: notes || null,
      meetingLink: meetingLink || null,
      eventVenue: eventVenue || null,
      eventCapacity: eventCapacity != null ? Number(eventCapacity) : null,
      reminderSent: false,
    };
    try {
      createData.title = displayTitle;
      createData.category = 'event';
      createData.isPublic = Boolean(isPublic);
    } catch {
      /* champs optionnels si client Prisma pas régénéré */
    }

    const created = await prisma.petAppointment.create({
      data: createData,
      include: { owner: { select: { id: true, name: true, email: true } } },
    });

    return res.status(201).json(normalizeEventRow(created));
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create event' });
  }
};

const updateEvent = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const { id } = req.params;
    const {
      title,
      petName,
      animalType,
      date,
      notes,
      type,
      ownerId,
      meetingLink,
      isPublic,
      eventVenue,
      eventCapacity,
    } = req.body || {};

    const payload = {};
    if (title != null || petName != null) {
      const displayTitle = (title || petName).trim();
      payload.title = displayTitle;
      payload.petName = petName || displayTitle;
    }
    if (animalType != null) payload.animalType = animalType;
    if (type != null) {
      if (!PLATFORM_EVENT_TYPE_VALUES.has(type)) {
        return res.status(400).json({ error: 'Invalid event type' });
      }
      payload.type = type;
    }
    if (notes !== undefined) payload.notes = notes || null;
    if (ownerId) payload.ownerId = ownerId;
    if (meetingLink !== undefined) payload.meetingLink = meetingLink || null;
    if (isPublic !== undefined) payload.isPublic = Boolean(isPublic);
    if (eventVenue !== undefined) payload.eventVenue = eventVenue || null;
    if (eventCapacity !== undefined) {
      payload.eventCapacity = eventCapacity != null ? Number(eventCapacity) : null;
    }
    if (date) {
      const eventDate = new Date(date);
      if (Number.isNaN(eventDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date' });
      }
      payload.date = eventDate;
    }
    if (isDemoMode()) {
      return res.json(
        normalizeEventRow({
          id,
          _id: id,
          ...payload,
          category: 'event',
          updatedAt: new Date().toISOString(),
        })
      );
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing || existing.category !== 'event') {
      return res.status(404).json({ error: 'Event not found' });
    }

    const updated = await prisma.petAppointment.update({
      where: { id },
      data: payload,
      include: { owner: { select: { id: true, name: true, email: true } } },
    });

    return res.json(normalizeEventRow(updated));
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to update event' });
  }
};

const deleteEvent = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const { id } = req.params;
    if (isDemoMode()) {
      return res.json({ message: 'Event deleted (demo mode)' });
    }

    const existing = await prisma.petAppointment.findUnique({ where: { id } });
    if (!existing || !eventTypeList.includes(existing.type)) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await prisma.petAppointment.delete({ where: { id } });
    return res.json({ message: 'Event deleted' });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to delete event' });
  }
};

const registerForEvent = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié' });

    const { id } = req.params;
    const { petName } = req.body || {};

    if (isDemoMode()) {
      const result = registerDemoEvent({
        eventId: id,
        userId: String(userId),
        petName: petName || null,
      });
      if (result.error) {
        return res.status(400).json({ error: result.error, registration: result.existing });
      }
      return res.status(201).json({
        ...result.registration,
        message: 'Inscription enregistrée — bonne chance !',
      });
    }

    const event = await prisma.petAppointment.findUnique({
      where: { id },
      include: { _count: { select: { registrations: true } } },
    });
    if (!event || event.category !== 'event') {
      return res.status(404).json({ error: 'Événement introuvable' });
    }
    if (!event.isPublic) {
      return res.status(403).json({ error: 'Événement non ouvert au public' });
    }
    if (
      event.eventCapacity != null &&
      event._count.registrations >= event.eventCapacity
    ) {
      return res.status(400).json({ error: 'Événement complet' });
    }

    const existing = await prisma.petEventRegistration.findUnique({
      where: { eventId_userId: { eventId: id, userId: String(userId) } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Déjà inscrit à cet événement' });
    }

    const reg = await prisma.petEventRegistration.create({
      data: {
        eventId: id,
        userId: String(userId),
        petName: petName || null,
        entryNumber: `PF-${String(Date.now()).slice(-6)}`,
      },
    });
    return res.status(201).json(reg);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Inscription impossible' });
  }
};

const getMyPrizes = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Non authentifié' });

    if (isDemoMode()) {
      const regs = getDemoEventRegistrationsForUser(String(userId));
      const events = createDemoPlatformEvents({ ownerId: 'demo_client', count: 18 });
      const prizes = regs
        .filter((r) => r.status === 'winner' || r.prizeLabel)
        .map((r) => {
          const ev = events.find((e) => (e.id || e._id) === r.eventId);
          const meta = prizeMeta(r.prizeType);
          return {
            id: r.id,
            eventId: r.eventId,
            eventTitle: ev?.title || 'Compétition PetfoodTN',
            eventDate: ev?.date || null,
            petName: r.petName,
            entryNumber: r.entryNumber,
            prizeLabel: r.prizeLabel,
            prizeType: r.prizeType,
            prizeIcon: meta.icon,
            wonAt: r.wonAt,
            status: r.status,
          };
        });
      const registrations = regs.map((r) => {
        const ev = events.find((e) => (e.id || e._id) === r.eventId);
        return {
          id: r.id,
          eventId: r.eventId,
          eventTitle: ev?.title || 'Événement',
          eventDate: ev?.date || null,
          petName: r.petName,
          entryNumber: r.entryNumber,
          status: r.status,
          prizeLabel: r.prizeLabel,
          prizeType: r.prizeType,
          wonAt: r.wonAt,
        };
      });
      return res.json({ prizes, registrations, totalWins: prizes.length });
    }

    const rows = await prisma.petEventRegistration.findMany({
      where: { userId: String(userId) },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true, petName: true, date: true, type: true } },
      },
    });
    const prizes = rows
      .filter((r) => r.prizeLabel || r.status === 'winner')
      .map((r) => ({
        id: r.id,
        eventId: r.eventId,
        eventTitle: r.event?.title || r.event?.petName || 'Événement',
        eventDate: r.event?.date || null,
        petName: r.petName,
        entryNumber: r.entryNumber,
        prizeLabel: r.prizeLabel,
        prizeType: r.prizeType,
        prizeIcon: prizeMeta(r.prizeType).icon,
        wonAt: r.wonAt,
        status: r.status,
      }));
    return res.json({
      prizes,
      registrations: rows,
      totalWins: prizes.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Impossible de charger vos gains' });
  }
};

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  registerForEvent,
  getMyPrizes,
};
