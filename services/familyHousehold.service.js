const { randomBytes } = require('crypto');
const { prisma, isDemoMode } = require('../prismaClient');

const uid = (u) => String(u?.id || u?._id);
const demoHouseholds = [];
const demoMembers = [];

const makeInviteCode = () =>
  `PET-${randomBytes(3).toString('hex').toUpperCase()}`;

const formatMember = (row) => ({
  id: row.id,
  userId: row.userId,
  role: row.role,
  joinedAt: row.joinedAt,
  name: row.user?.name || row.name,
  email: row.user?.email || row.email,
});

const findHouseholdForUser = async (userId) => {
  if (isDemoMode()) {
    const membership = demoMembers.find((m) => m.userId === userId);
    if (!membership) return null;
    const household = demoHouseholds.find((h) => h.id === membership.householdId);
    if (!household) return null;
    const members = demoMembers
      .filter((m) => m.householdId === household.id)
      .map((m) => formatMember(m));
    return { ...household, members };
  }

  const membership = await prisma.householdMember.findFirst({
    where: { userId },
    include: {
      household: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!membership?.household) return null;

  return {
    id: membership.household.id,
    name: membership.household.name,
    ownerId: membership.household.ownerId,
    inviteCode: membership.household.inviteCode,
    createdAt: membership.household.createdAt,
    myRole: membership.role,
    members: membership.household.members.map((m) => formatMember({
      ...m,
      name: m.user?.name,
      email: m.user?.email,
    })),
  };
};

const getHouseholdMemberIds = async (userId) => {
  const household = await findHouseholdForUser(userId);
  if (!household) return [userId];
  return household.members.map((m) => m.userId);
};

const createHousehold = async (user, { name } = {}) => {
  const userId = uid(user);
  const existing = await findHouseholdForUser(userId);
  if (existing) {
    const err = new Error('Vous appartenez déjà à un foyer');
    err.status = 400;
    throw err;
  }

  const label = String(name || `${user.name || 'Mon'} foyer`).trim() || 'Mon foyer';
  const inviteCode = makeInviteCode();

  if (isDemoMode()) {
    const id = `hh_${Date.now()}`;
    const household = { id, name: label, ownerId: userId, inviteCode, createdAt: new Date().toISOString() };
    demoHouseholds.push(household);
    demoMembers.push({
      id: `hm_${Date.now()}`,
      householdId: id,
      userId,
      role: 'owner',
      joinedAt: new Date().toISOString(),
      name: user.name,
      email: user.email,
    });
    return findHouseholdForUser(userId);
  }

  const created = await prisma.household.create({
    data: {
      name: label,
      ownerId: userId,
      inviteCode,
      members: {
        create: { userId, role: 'owner' },
      },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  return {
    id: created.id,
    name: created.name,
    ownerId: created.ownerId,
    inviteCode: created.inviteCode,
    myRole: 'owner',
    members: created.members.map((m) => formatMember({
      ...m,
      name: m.user?.name,
      email: m.user?.email,
    })),
  };
};

const joinHousehold = async (user, inviteCode) => {
  const userId = uid(user);
  const code = String(inviteCode || '').trim().toUpperCase();
  if (!code) {
    const err = new Error('Code d\'invitation requis');
    err.status = 400;
    throw err;
  }

  const existing = await findHouseholdForUser(userId);
  if (existing) {
    const err = new Error('Quittez votre foyer actuel avant d\'en rejoindre un autre');
    err.status = 400;
    throw err;
  }

  if (isDemoMode()) {
    const household = demoHouseholds.find((h) => h.inviteCode === code);
    if (!household) {
      const err = new Error('Code d\'invitation invalide');
      err.status = 404;
      throw err;
    }
    demoMembers.push({
      id: `hm_${Date.now()}`,
      householdId: household.id,
      userId,
      role: 'member',
      joinedAt: new Date().toISOString(),
      name: user.name,
      email: user.email,
    });
    return findHouseholdForUser(userId);
  }

  const household = await prisma.household.findUnique({ where: { inviteCode: code } });
  if (!household) {
    const err = new Error('Code d\'invitation invalide');
    err.status = 404;
    throw err;
  }

  await prisma.householdMember.create({
    data: { householdId: household.id, userId, role: 'member' },
  });

  return findHouseholdForUser(userId);
};

const leaveHousehold = async (user) => {
  const userId = uid(user);
  const household = await findHouseholdForUser(userId);
  if (!household) return { left: false };

  if (isDemoMode()) {
    const idx = demoMembers.findIndex((m) => m.userId === userId);
    if (idx >= 0) demoMembers.splice(idx, 1);
    if (household.ownerId === userId) {
      const hIdx = demoHouseholds.findIndex((h) => h.id === household.id);
      if (hIdx >= 0) demoHouseholds.splice(hIdx, 1);
      const toRemove = demoMembers.filter((m) => m.householdId === household.id);
      toRemove.forEach((m) => {
        const i = demoMembers.indexOf(m);
        if (i >= 0) demoMembers.splice(i, 1);
      });
    }
    return { left: true };
  }

  const membership = await prisma.householdMember.findFirst({
    where: { userId, householdId: household.id },
  });
  if (!membership) return { left: false };

  if (household.ownerId === userId) {
    await prisma.household.delete({ where: { id: household.id } });
  } else {
    await prisma.householdMember.delete({ where: { id: membership.id } });
  }
  return { left: true };
};

const getSharedPets = async (userId) => {
  const memberIds = await getHouseholdMemberIds(userId);
  if (isDemoMode()) {
    return [];
  }
  return prisma.pet.findMany({
    where: { ownerId: { in: memberIds } },
    orderBy: { name: 'asc' },
  });
};

module.exports = {
  findHouseholdForUser,
  getHouseholdMemberIds,
  createHousehold,
  joinHousehold,
  leaveHousehold,
  getSharedPets,
};
