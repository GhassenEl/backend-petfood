const { prisma, isDemoMode } = require('../../prismaClient');
const { completionWithSystem } = require('../groq.service');

const SEGMENTS = [
  {
    slug: 'vip',
    name: 'Propriétaires VIP',
    description: 'Fidélité élevée, tier gold/platinum ou > 500 points',
    color: '#f59e0b',
  },
  {
    slug: 'high_spender',
    name: 'Gros acheteurs',
    description: 'CA cumulé > 400 DT sur les 12 derniers mois',
    color: '#10b981',
  },
  {
    slug: 'young_owner',
    name: 'Jeunes propriétaires',
    description: 'Animal < 3 ans ou profil récent (< 6 mois)',
    color: '#3b82f6',
  },
  {
    slug: 'dormant',
    name: 'Clients inactifs',
    description: 'Aucune commande depuis 90 jours',
    color: '#94a3b8',
  },
  {
    slug: 'multi_pet',
    name: 'Multi-animaux',
    description: '2 animaux ou plus enregistrés',
    color: '#8b5cf6',
  },
  {
    slug: 'dog_owners',
    name: 'Propriétaires chiens',
    description: 'Au moins un chien dans le profil',
    color: '#e67e22',
  },
  {
    slug: 'cat_owners',
    name: 'Propriétaires chats',
    description: 'Au moins un chat dans le profil',
    color: '#ec4899',
  },
];

const demoCampaigns = [];

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const buildClientProfiles = async () => {
  if (isDemoMode()) {
    const names = ['Amira B.', 'Karim S.', 'Leila M.', 'Youssef H.', 'Nadia K.', 'Omar T.', 'Sana R.', 'Hedi L.'];
    return names.map((name, i) => ({
      id: `demo_client_${i}`,
      name,
      email: `client${i}@demo.petfood.tn`,
      vipTier: i % 4 === 0 ? 'gold' : 'standard',
      loyaltyPoints: 100 + i * 120,
      petAge: i % 3 === 0 ? 1 : 5,
      petType: i % 2 === 0 ? 'dog' : 'cat',
      petCount: i % 5 === 0 ? 2 : 1,
      totalSpent: 150 + i * 180,
      lastOrderAt: i % 3 === 0 ? null : daysAgo(20 + i * 10).toISOString(),
      createdAt: daysAgo(200 - i * 20).toISOString(),
    }));
  }

  const clients = await prisma.user.findMany({
    where: { role: 'client', isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      vipTier: true,
      loyaltyPoints: true,
      petAge: true,
      petType: true,
      createdAt: true,
      pets: { select: { id: true, type: true, birthDate: true } },
      orders: {
        select: { total: true, createdAt: true, status: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return clients.map((c) => {
    const delivered = (c.orders || []).filter((o) =>
      ['delivered', 'completed', 'paid'].includes(String(o.status))
    );
    const totalSpent = delivered.reduce((s, o) => s + Number(o.total || 0), 0);
    const lastOrder = delivered[0]?.createdAt || null;
    const petTypes = (c.pets || []).map((p) => p.type).filter(Boolean);
    const petAges = (c.pets || [])
      .map((p) => {
        if (!p.birthDate) return null;
        const years = (Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 86400000);
        return Math.floor(years);
      })
      .filter((a) => a != null);
    const youngestPetAge = petAges.length ? Math.min(...petAges) : c.petAge;
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      vipTier: c.vipTier,
      loyaltyPoints: c.loyaltyPoints,
      petAge: youngestPetAge ?? c.petAge,
      petType: c.petType || petTypes[0],
      petCount: c.pets?.length || (c.petType ? 1 : 0),
      petTypes,
      totalSpent,
      lastOrderAt: lastOrder,
      createdAt: c.createdAt,
    };
  });
};

const matchesSegment = (profile, slug) => {
  const lastOrder = profile.lastOrderAt ? new Date(profile.lastOrderAt) : null;
  const inactive = !lastOrder || lastOrder < daysAgo(90);
  const recentAccount = profile.createdAt && new Date(profile.createdAt) > daysAgo(180);
  const youngPet = profile.petAge != null && profile.petAge < 3;

  switch (slug) {
    case 'vip':
      return (
        ['gold', 'platinum', 'vip'].includes(String(profile.vipTier).toLowerCase()) ||
        profile.loyaltyPoints >= 500
      );
    case 'high_spender':
      return profile.totalSpent >= 400;
    case 'young_owner':
      return youngPet || recentAccount;
    case 'dormant':
      return inactive && profile.totalSpent > 0;
    case 'multi_pet':
      return profile.petCount >= 2;
    case 'dog_owners':
      return (
        String(profile.petType).toLowerCase() === 'dog' ||
        (profile.petTypes || []).includes('dog')
      );
    case 'cat_owners':
      return (
        String(profile.petType).toLowerCase() === 'cat' ||
        (profile.petTypes || []).includes('cat')
      );
    default:
      return false;
  }
};

const getCrmOverview = async () => {
  const profiles = await buildClientProfiles();
  const segments = SEGMENTS.map((seg) => {
    const members = profiles.filter((p) => matchesSegment(p, seg.slug));
    return {
      ...seg,
      count: members.length,
      sampleMembers: members.slice(0, 5).map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        totalSpent: Math.round(m.totalSpent * 100) / 100,
      })),
    };
  });

  let campaigns = [];
  if (isDemoMode()) {
    if (!demoCampaigns.length) {
      demoCampaigns.push(
        {
          id: 'camp_demo_1',
          name: 'Relance inactifs — croquettes -15%',
          channel: 'email',
          segmentSlug: 'dormant',
          subject: 'Votre compagnon vous attend',
          message: 'Profitez de -15 % sur les croquettes premium cette semaine.',
          promoCode: 'REVIENS15',
          status: 'sent',
          targeted: 12,
          sentAt: daysAgo(3).toISOString(),
          createdAt: daysAgo(10).toISOString(),
        },
        {
          id: 'camp_demo_2',
          name: 'VIP — livraison offerte',
          channel: 'push',
          segmentSlug: 'vip',
          subject: null,
          message: 'Livraison gratuite sur votre prochaine commande > 80 DT.',
          promoCode: 'VIPLIVRAISON',
          status: 'draft',
          targeted: 0,
          sentAt: null,
          createdAt: daysAgo(1).toISOString(),
        }
      );
    }
    campaigns = [...demoCampaigns];
  } else {
    campaigns = await prisma.marketingCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  const totalClients = profiles.length;
  const active30d = profiles.filter(
    (p) => p.lastOrderAt && new Date(p.lastOrderAt) > daysAgo(30)
  ).length;

  return {
    kpis: {
      totalClients,
      active30d,
      segmentsCount: segments.length,
      campaignsSent: campaigns.filter((c) => c.status === 'sent').length,
    },
    segments,
    campaigns,
    generatedAt: new Date().toISOString(),
  };
};

const getSegmentMembers = async (slug) => {
  const seg = SEGMENTS.find((s) => s.slug === slug);
  if (!seg) {
    const err = new Error('Segment inconnu');
    err.status = 404;
    throw err;
  }
  const profiles = await buildClientProfiles();
  return {
    segment: seg,
    members: profiles
      .filter((p) => matchesSegment(p, slug))
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        vipTier: m.vipTier,
        loyaltyPoints: m.loyaltyPoints,
        totalSpent: Math.round(m.totalSpent * 100) / 100,
        lastOrderAt: m.lastOrderAt,
      })),
  };
};

const createCampaign = async (body) => {
  const { name, channel = 'email', segmentSlug, subject, message, promoCode } = body || {};
  if (!name?.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (!segmentSlug || !SEGMENTS.some((s) => s.slug === segmentSlug)) {
    const err = new Error('segmentSlug invalide');
    err.status = 400;
    throw err;
  }
  if (!message?.trim()) {
    const err = new Error('message is required');
    err.status = 400;
    throw err;
  }

  const { members } = await getSegmentMembers(segmentSlug);

  if (isDemoMode()) {
    const row = {
      id: `camp_${Date.now()}`,
      name: name.trim(),
      channel,
      segmentSlug,
      subject: subject || null,
      message: message.trim(),
      promoCode: promoCode || null,
      status: 'draft',
      targeted: members.length,
      sentAt: null,
      createdAt: new Date().toISOString(),
    };
    demoCampaigns.unshift(row);
    return row;
  }

  return prisma.marketingCampaign.create({
    data: {
      name: name.trim(),
      channel,
      segmentSlug,
      subject: subject || null,
      message: message.trim(),
      promoCode: promoCode || null,
      status: 'draft',
      targeted: members.length,
    },
  });
};

const sendCampaign = async (campaignId) => {
  if (isDemoMode()) {
    const row = demoCampaigns.find((c) => c.id === campaignId);
    if (!row) {
      const err = new Error('Campagne introuvable');
      err.status = 404;
      throw err;
    }
    row.status = 'sent';
    row.sentAt = new Date().toISOString();
    return row;
  }

  const existing = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
  if (!existing) {
    const err = new Error('Campagne introuvable');
    err.status = 404;
    throw err;
  }
  if (existing.status === 'sent') {
    const err = new Error('Campagne déjà envoyée');
    err.status = 400;
    throw err;
  }

  const { members } = await getSegmentMembers(existing.segmentSlug);
  return prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'sent',
      sentAt: new Date(),
      targeted: members.length,
    },
  });
};

const CRM_ML_SYSTEM = `Tu es l'agent CRM PetfoodTN pour l'administration.
Propose 3 idées de campagnes marketing ciblées (segments propriétaires d'animaux) en français.
Format : titre court + segment + message promo (1 ligne chacun).`;

const getCrmMlSuggestions = async () => {
  const overview = await getCrmOverview();
  const payload = {
    kpis: overview.kpis,
    topSegments: overview.segments
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
      .map((s) => ({ slug: s.slug, name: s.name, count: s.count })),
  };

  let summary = null;
  if (process.env.GROQ_API_KEY) {
    summary = await completionWithSystem(
      CRM_ML_SYSTEM,
      JSON.stringify(payload, null, 2).slice(0, 2500),
      { max_tokens: 350 }
    ).catch(() => null);
  }

  const ruleSuggestions = [
    overview.segments.find((s) => s.slug === 'dormant')?.count > 0 && {
      title: 'Réactivation clients dormants',
      segmentSlug: 'dormant',
      channel: 'email',
      message: '-10 % sur la gamme habituelle + rappel rappel vaccination.',
    },
    overview.segments.find((s) => s.slug === 'vip')?.count > 0 && {
      title: 'Offre exclusive VIP',
      segmentSlug: 'vip',
      channel: 'push',
      message: 'Livraison express offerte + échantillon nouveautés.',
    },
    overview.segments.find((s) => s.slug === 'young_owner')?.count > 0 && {
      title: 'Pack chiot/chaton jeunes propriétaires',
      segmentSlug: 'young_owner',
      channel: 'email',
      message: 'Découverte pack démarrage -20 % avec guide nutrition.',
    },
  ].filter(Boolean);

  return {
    summary: summary || 'Activez les segments dormants et VIP en priorité pour maximiser le panier moyen.',
    suggestions: ruleSuggestions,
    model: summary ? 'groq_crm_v1' : 'rules_crm_v1',
  };
};

module.exports = {
  SEGMENTS,
  getCrmOverview,
  getSegmentMembers,
  createCampaign,
  sendCampaign,
  getCrmMlSuggestions,
};
