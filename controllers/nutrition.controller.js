const { prisma } = require('../prismaClient');

const resolveOwnerIds = async (user) => {
  const ids = new Set([String(user.id || user._id)]);
  if (user?.email) {
    const dbUser = await prisma.user.findUnique({
      where: { email: String(user.email).toLowerCase() },
      select: { id: true },
    });
    if (dbUser?.id) ids.add(String(dbUser.id));
  }
  return [...ids];
};

const formatPlan = (p) => ({
  id: p.id,
  date: p.createdAt,
  createdAt: p.createdAt,
  petName: p.petName,
  petType: p.petType,
  goal: p.goal,
  plan: p.planText,
  planText: p.planText,
  source: p.source,
  metadata: p.metadata ? tryParseJson(p.metadata) : null,
});

const tryParseJson = (value) => {
  try { return JSON.parse(value); } catch { return null; }
};

const getMyPlans = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const plans = await prisma.nutritionPlan.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(plans.map(formatPlan));
  } catch (error) {
    console.error('getMyPlans:', error);
    res.status(500).json({ error: 'Impossible de charger l\'historique nutrition' });
  }
};

const createPlan = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const ownerId = ownerIds[0];
    const { petId, petName, petType, goal, plan, planText, source, metadata } = req.body;
    const text = String(planText || plan || '').trim();
    if (!text) return res.status(400).json({ error: 'Contenu du plan requis' });

    const created = await prisma.nutritionPlan.create({
      data: {
        ownerId,
        petId: petId || null,
        petName: petName || null,
        petType: petType || null,
        goal: goal || null,
        planText: text,
        source: source || 'nutripro',
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
    res.status(201).json(formatPlan(created));
  } catch (error) {
    console.error('createPlan:', error);
    res.status(500).json({ error: 'Sauvegarde du plan échouée' });
  }
};

const deletePlan = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const existing = await prisma.nutritionPlan.findFirst({
      where: { id: req.params.id, ownerId: { in: ownerIds } },
    });
    if (!existing) return res.status(404).json({ error: 'Plan introuvable' });
    await prisma.nutritionPlan.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Suppression échouée' });
  }
};

const syncLocalPlans = async (req, res) => {
  try {
    const ownerIds = await resolveOwnerIds(req.user);
    const ownerId = ownerIds[0];
    const items = Array.isArray(req.body?.plans) ? req.body.plans : [];
    if (!items.length) return res.json({ synced: 0, plans: [] });

    const existing = await prisma.nutritionPlan.count({ where: { ownerId: { in: ownerIds } } });
    if (existing > 0) {
      const plans = await prisma.nutritionPlan.findMany({
        where: { ownerId: { in: ownerIds } },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ synced: 0, plans: plans.map(formatPlan) });
    }

    const created = [];
    for (const item of items.slice(0, 20)) {
      const text = String(item.plan || item.planText || '').trim();
      if (!text) continue;
      const row = await prisma.nutritionPlan.create({
        data: {
          ownerId,
          petName: item.petName || null,
          petType: item.petType || null,
          goal: item.goal || null,
          planText: text,
          source: 'nutripro_local',
          createdAt: item.date ? new Date(item.date) : undefined,
        },
      });
      created.push(row);
    }
    res.json({ synced: created.length, plans: created.map(formatPlan) });
  } catch (error) {
    console.error('syncLocalPlans:', error);
    res.status(500).json({ error: 'Synchronisation échouée' });
  }
};

module.exports = {
  getMyPlans,
  createPlan,
  deletePlan,
  syncLocalPlans,
};
