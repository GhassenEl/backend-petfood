const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);

const DEFAULT_BADGES = [
  { code: 'first_order', label: 'Premier achat', icon: '🛒', xpRequired: 0, description: '1ère commande livrée' },
  { code: 'loyal_100', label: 'Fidèle', icon: '💎', xpRequired: 100, description: '100 XP atteints' },
  { code: 'reviewer', label: 'Critique', icon: '⭐', xpRequired: 50, description: '3 avis publiés' },
  { code: 'vet_friend', label: 'Santé proactive', icon: '🩺', xpRequired: 80, description: 'Consultation vétérinaire' },
  { code: 'champion', label: 'Champion', icon: '🏆', xpRequired: 500, description: 'Top du classement mensuel' },
];

const ensureBadges = async () => {
  if (isDemoMode()) return;
  const count = await prisma.badge.count();
  if (count > 0) return;
  for (const b of DEFAULT_BADGES) {
    await prisma.badge.create({ data: b });
  }
};

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ensureMonthlyChallenge = async () => {
  const monthKey = currentMonthKey();
  if (isDemoMode()) {
    return {
      id: 'demo_challenge',
      monthKey,
      title: 'Défi du mois — 3 commandes',
      goalType: 'orders',
      goalValue: 3,
      rewardPoints: 75,
      rewardXp: 120,
    };
  }
  await ensureBadges();
  let c = await prisma.monthlyChallenge.findUnique({ where: { monthKey } });
  if (!c) {
    c = await prisma.monthlyChallenge.create({
      data: {
        monthKey,
        title: 'Défi du mois — 3 commandes',
        description: 'Passez 3 commandes ce mois pour gagner des points bonus',
        goalType: 'orders',
        goalValue: 3,
        rewardPoints: 75,
        rewardXp: 120,
      },
    });
  }
  return c;
};

const awardXp = async (userId, xp, reason) => {
  if (isDemoMode()) return { xp: xp, tier: 'silver' };
  const user = await prisma.user.update({
    where: { id: userId },
    data: { gamificationXp: { increment: xp } },
    select: { gamificationXp: true, loyaltyPoints: true },
  });
  const badges = await prisma.badge.findMany();
  for (const b of badges) {
    if (user.gamificationXp >= b.xpRequired) {
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId: b.id } },
        create: { userId, badgeId: b.id },
        update: {},
      });
    }
  }
  return user;
};

const getGamificationProfile = async (user) => {
  const userId = uid(user);
  const challenge = await ensureMonthlyChallenge();

  if (isDemoMode()) {
    return {
      xp: 180,
      rank: 12,
      leaderboard: [
        { name: 'Client Test', xp: 420, rank: 1 },
        { name: user.name || 'Vous', xp: 180, rank: 12 },
      ],
      badges: DEFAULT_BADGES.map((b, i) => ({ ...b, earned: i < 3, earnedAt: new Date() })),
      challenge: { ...challenge, progress: 2, completed: false, goalValue: 3 },
      rewards: [{ id: 'r1', label: '+50 points fidélité', cost: 100, claimed: false }],
    };
  }

  const [dbUser, userBadges, progress, topUsers] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { gamificationXp: true, loyaltyPoints: true, name: true, vipTier: true } }),
    prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
      orderBy: { earnedAt: 'desc' },
    }),
    prisma.userChallengeProgress.findUnique({
      where: { userId_challengeId: { userId, challengeId: challenge.id } },
    }),
    prisma.user.findMany({
      where: { role: 'client' },
      orderBy: { gamificationXp: 'desc' },
      take: 10,
      select: { name: true, gamificationXp: true },
    }),
  ]);

  const allBadges = await prisma.badge.findMany();
  const earnedIds = new Set(userBadges.map((ub) => ub.badgeId));

  const orderCount = await prisma.order.count({
    where: {
      userId,
      status: 'delivered',
      createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    },
  });

  let prog = progress;
  if (!prog) {
    prog = await prisma.userChallengeProgress.create({
      data: { userId, challengeId: challenge.id, progress: orderCount },
    });
  } else if (prog.progress !== orderCount) {
    prog = await prisma.userChallengeProgress.update({
      where: { id: prog.id },
      data: { progress: orderCount, completed: orderCount >= challenge.goalValue, completedAt: orderCount >= challenge.goalValue ? new Date() : null },
    });
  }

  const myRank =
    (await prisma.user.count({ where: { role: 'client', gamificationXp: { gt: dbUser?.gamificationXp || 0 } } })) + 1;

  return {
    xp: dbUser?.gamificationXp || 0,
    loyaltyPoints: dbUser?.loyaltyPoints || 0,
    vipTier: dbUser?.vipTier || 'standard',
    rank: myRank,
    leaderboard: topUsers.map((u, i) => ({ name: u.name, xp: u.gamificationXp, rank: i + 1 })),
    badges: allBadges.map((b) => ({
      ...b,
      earned: earnedIds.has(b.id),
      earnedAt: userBadges.find((ub) => ub.badgeId === b.id)?.earnedAt,
    })),
    challenge: { ...challenge, progress: prog.progress, completed: prog.completed },
    rewards: [
      { id: 'bonus_50', label: '+50 points fidélité', cost: 100 },
      { id: 'vip_trial', label: 'Essai VIP 7 jours', cost: 300 },
    ],
  };
};

const claimChallengeReward = async (user) => {
  const userId = uid(user);
  const profile = await getGamificationProfile(user);
  if (!profile.challenge?.completed) {
    const err = new Error('Défi non terminé');
    err.status = 400;
    throw err;
  }
  await awardXp(userId, profile.challenge.rewardXp || 50, 'challenge');
  if (!isDemoMode()) {
    await prisma.user.update({
      where: { id: userId },
      data: { loyaltyPoints: { increment: profile.challenge.rewardPoints || 50 } },
    });
  }
  return { ok: true, message: 'Récompense du défi créditée' };
};

module.exports = { getGamificationProfile, awardXp, claimChallengeReward, ensureBadges };
