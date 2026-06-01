const { prisma } = require('../prismaClient');

const PRIMARY_ADMIN_EMAIL = 'admin@petfood.tn';

const countAdmins = async () => prisma.user.count({ where: { role: 'admin' } });

const getPrimaryAdmin = async () =>
  prisma.user.findUnique({ where: { email: PRIMARY_ADMIN_EMAIL } })
  || prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });

/** Refuse création / promotion admin si un admin existe déjà (sauf le compte principal). */
const assertSingleAdminPolicy = async ({ role, userId, email }) => {
  if (role !== 'admin') return;

  const normalizedEmail = String(email || '').toLowerCase();
  if (normalizedEmail === PRIMARY_ADMIN_EMAIL) return;

  const adminCount = await countAdmins();
  if (adminCount === 0) return;

  if (userId) {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, email: true } });
    if (target?.role === 'admin') return;
  }

  throw Object.assign(
    new Error(`Un seul administrateur est autorisé (${PRIMARY_ADMIN_EMAIL}).`),
    { status: 403 }
  );
};

/** Garde un seul admin : admin@petfood.tn ; les autres passent en client. */
const ensureSingleAdmin = async () => {
  const admins = await prisma.user.findMany({
    where: { role: 'admin' },
    orderBy: { createdAt: 'asc' },
  });

  if (admins.length === 0) return 0;

  let keeper = admins.find((a) => a.email === PRIMARY_ADMIN_EMAIL) || admins[0];
  if (keeper.email !== PRIMARY_ADMIN_EMAIL) {
    const existingPrimary = await prisma.user.findUnique({ where: { email: PRIMARY_ADMIN_EMAIL } });
    if (existingPrimary) {
      keeper = existingPrimary;
      await prisma.user.update({
        where: { id: existingPrimary.id },
        data: { role: 'admin' },
      });
    }
  }

  const toDemote = admins.filter((a) => a.id !== keeper.id);
  for (const u of toDemote) {
    await prisma.user.update({
      where: { id: u.id },
      data: { role: 'client' },
    });
  }

  if (toDemote.length) {
    console.log(`✅ ${toDemote.length} compte(s) admin rétrogradé(s) — admin unique : ${keeper.email}`);
  }
  return toDemote.length;
};

module.exports = {
  PRIMARY_ADMIN_EMAIL,
  countAdmins,
  getPrimaryAdmin,
  assertSingleAdminPolicy,
  ensureSingleAdmin,
};
