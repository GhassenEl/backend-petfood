const { prisma, isDemoMode } = require('../prismaClient');
const { PLATFORM_EVENT_TYPE_VALUES, normalizeEventRow } = require('../utils/platformEvents');

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
const { createPlatformEvents: createDemoPlatformEvents } = require('../utils/demoStore');

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

const listEvents = async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const scope = req.query.scope === 'mine' ? 'mine' : 'all';
    const ownerIds = await resolveOwnerId(req);

    if (isDemoMode()) {
      const rows = createDemoPlatformEvents({
        ownerId: ownerIds[0] || 'demo_client',
        count: isAdmin ? 30 : 18,
      });
      const filtered =
        isAdmin || scope === 'all'
          ? rows
          : rows.filter((r) => ownerIds.includes(String(r.ownerId)));
      return res.json(filtered.map(normalizeEventRow));
    }

    let where = buildEventWhere();
    if (!isAdmin && scope === 'mine') {
      where = buildEventWhere({ ownerId: { in: ownerIds } });
    }

    const rows = await prisma.petAppointment.findMany({
      where,
      orderBy: { date: 'asc' },
      include: isAdmin
        ? { owner: { select: { id: true, name: true, email: true } } }
        : undefined,
    });

    const scoped = rows.filter((row) =>
      matchesPublicScope(row, ownerIds, scope, isAdmin)
    );

    return res.json(scoped.map(normalizeEventRow));
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

module.exports = {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
};
