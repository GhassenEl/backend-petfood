const { getModeratorSentimentInsights } = require('../visitorAi.service');
const { prisma, isDemoMode } = require('../../prismaClient');

const uid = (u) => String(u?.id || u?._id);
const modName = (u) => u?.name || 'Modérateur';

const err = (message, status = 404) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

const logAction = async (req, action, target, metadata = null) => {
  if (isDemoMode()) return;
  await prisma.moderationAction.create({
    data: {
      action,
      target: String(target),
      moderatorId: uid(req.user),
      moderatorName: modName(req.user),
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
};

const { analyzeReviewForModeration } = require('../reviewModerationNlp.service');

const spamScore = (comment = '') => analyzeReviewForModeration(comment, 3).spamProbability;

const mapVendor = (v) => ({
  id: v.id,
  userId: v.ownerUserId,
  shopName: v.shopName,
  ownerName: v.owner?.name,
  ownerEmail: v.owner?.email,
  region: v.region,
  status:
    v.applicationStatus === 'approved' && v.isActive
      ? 'active'
      : v.applicationStatus || (v.isActive ? 'active' : 'suspended'),
  applicationStatus: v.applicationStatus || (v.isActive ? 'approved' : 'suspended'),
  productsCount: v._count?.products ?? 0,
  createdAt: v.createdAt,
  commercialInfo: {
    siret: v.commercialSiret || '—',
    address: v.commercialAddress || `${v.region || ''}, Tunisie`.trim(),
    category: v.commercialCategory || 'Animalerie',
    verified: Boolean(v.commercialVerified),
  },
});

const mapPendingProduct = (vp) => ({
  id: vp.id,
  vendorId: vp.vendorId,
  vendorName: vp.vendor?.shopName,
  name: vp.product?.name,
  price: vp.price ?? vp.product?.price,
  category: vp.product?.category,
  imageUrl: vp.product?.imageUrl || vp.product?.image,
  status: vp.moderationStatus,
  submittedAt: vp.submittedAt || vp.createdAt,
  imageFlag: vp.imageFlag,
});

const mapFakeReview = (r) => {
  const nlp = analyzeReviewForModeration(r.comment, r.rating);
  return {
    id: r.id,
    productName: r.product?.name,
    author: r.user?.name || r.user?.email || 'Anonyme',
    rating: r.rating,
    comment: r.comment,
    nlpScore: nlp.nlpScore,
    spamProbability: nlp.spamProbability,
    coherenceScore: nlp.coherenceScore,
    insultDetected: nlp.insultDetected,
    suspiciousFlags: nlp.suspiciousFlags,
    sentiment: nlp.sentiment,
    status: r.moderationStatus === 'approved' ? 'cleared' : r.moderationStatus,
    createdAt: r.createdAt,
  };
};

const mapDispute = (r) => ({
  id: r.id,
  orderId: r.orderRef,
  clientName: r.clientName,
  vendorName: r.vendorName,
  subject: r.reason,
  amount: r.amount,
  status:
    ['refunded', 'resolved', 'approved'].includes(r.status)
      ? 'resolved'
      : r.status === 'moderator_review'
        ? 'in_review'
        : 'open',
  createdAt: r.createdAt,
});

const getDashboard = async () => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    pendingProducts,
    pendingVendors,
    openDisputes,
    fakeReviewsFlagged,
    suspendedUsers,
    pendingComplaints,
    pendingRefunds,
    resolvedToday,
  ] = await Promise.all([
    prisma.vendorProduct.count({ where: { moderationStatus: 'pending' } }),
    prisma.vendor.count({ where: { applicationStatus: 'pending' } }),
    prisma.refundRequest.count({
      where: {
        disputed: true,
        status: { notIn: ['refunded', 'resolved', 'approved', 'cancelled'] },
      },
    }),
    prisma.review.count({
      where: { moderationStatus: { in: ['flagged', 'pending'] } },
    }),
    prisma.user.count({ where: { isActive: false, role: 'client' } }),
    prisma.complaint.count({ where: { status: 'pending' } }),
    prisma.refundRequest.count({
      where: { status: { in: ['moderator_review', 'disputed', 'fraud_flagged'] } },
    }),
    prisma.moderationAction.count({ where: { createdAt: { gte: startOfDay } } }),
  ]);

  const pendingReviews = fakeReviewsFlagged;

  return {
    pendingProducts,
    pendingVendors,
    openDisputes,
    fakeReviewsFlagged,
    suspendedUsers,
    pendingReviews,
    pendingComplaints,
    pendingRefunds,
    resolvedToday: resolvedToday || 0,
    avgResponseHours: 2.4,
    fraudCases: await prisma.refundRequest.count({
      where: { status: 'fraud_flagged' },
    }),
  };
};

const getAnalytics = async () => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['client', 'vendor', 'livreur'] } },
    select: { id: true, role: true, isActive: true },
  });

  const vendors = await prisma.vendor.findMany({
    include: {
      owner: { select: { name: true } },
      _count: { select: { products: true, commissions: true } },
    },
  });

  const complaints = await prisma.complaint.findMany({
    where: { status: { in: ['pending', 'open'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const history = await prisma.moderationAction.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const vendorActivity = vendors.map((v) => ({
    vendorId: v.id,
    shopName: v.shopName,
    productsAdded: v._count.products,
    orders30d: v._count.commissions,
    complaints: complaints.filter((c) =>
      String(c.message || '').toLowerCase().includes(v.shopName.toLowerCase()),
    ).length,
    status: v.applicationStatus === 'pending' ? 'pending' : v.isActive ? 'active' : 'suspended',
  }));

  const reportedProducts = await prisma.vendorProduct.findMany({
    where: { OR: [{ imageFlag: { not: null } }, { moderationStatus: 'pending' }] },
    include: { product: true, vendor: true },
    take: 15,
  });

  return {
    userStats: {
      total: users.length,
      active: users.filter((u) => u.isActive !== false).length,
      suspended: users.filter((u) => u.isActive === false).length,
      byRole: users.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
      }, {}),
    },
    vendorActivity,
    reportedProducts: reportedProducts.map((vp) => ({
      id: vp.id,
      name: vp.product?.name,
      vendorName: vp.vendor?.shopName,
      reports: vp.imageFlag ? 2 : 1,
      reason: vp.imageFlag || 'Validation requise',
    })),
    history: history.map((h) => ({
      id: h.id,
      action: h.action,
      target: h.target,
      moderator: h.moderatorName,
      at: h.createdAt,
    })),
  };
};

const listUsers = async () => {
  const users = await prisma.user.findMany({
    where: { role: 'client' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      region: true,
      isActive: true,
      abusiveReports: true,
      createdAt: true,
    },
  });
  return {
    users: users.map((u) => ({
      ...u,
      id: u.id,
      _id: u.id,
      suspendedAt: u.isActive === false ? u.createdAt : null,
      lastLogin: u.createdAt,
    })),
  };
};

const suspendUser = async (req, id) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== 'client') throw err('Utilisateur introuvable');
  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });
  await logAction(req, 'suspend_user', user.name);
  return { ...updated, suspendedAt: new Date() };
};

const reactivateUser = async (req, id) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw err('Utilisateur introuvable');
  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: true },
  });
  await logAction(req, 'reactivate_user', user.name);
  return updated;
};

const flagUser = async (req, id, reason = '') => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw err('Utilisateur introuvable');
  const updated = await prisma.user.update({
    where: { id },
    data: { abusiveReports: { increment: 1 } },
  });
  await logAction(req, 'flag_abusive', user.name, { reason });
  return { ...updated, lastFlagReason: reason };
};

const listVendors = async () => {
  const vendors = await prisma.vendor.findMany({
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { products: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return { vendors: vendors.map(mapVendor) };
};

const findVendor = async (id) => {
  const v = await prisma.vendor.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (!v) throw err('Vendeur introuvable');
  return v;
};

const approveVendor = async (req, id) => {
  const v = await findVendor(id);
  const updated = await prisma.vendor.update({
    where: { id },
    data: { applicationStatus: 'approved', isActive: true, commercialVerified: true },
    include: { owner: true, _count: { select: { products: true } } },
  });
  if (updated.owner?.role !== 'vendor') {
    await prisma.user.update({
      where: { id: updated.ownerUserId },
      data: { role: 'vendor' },
    });
  }
  await logAction(req, 'approve_vendor', v.shopName);
  return mapVendor(updated);
};

const verifyVendor = async (req, id) => {
  const v = await findVendor(id);
  const updated = await prisma.vendor.update({
    where: { id },
    data: { commercialVerified: true },
    include: { owner: true, _count: { select: { products: true } } },
  });
  await logAction(req, 'verify_vendor', v.shopName);
  return mapVendor(updated);
};

const suspendVendor = async (req, id) => {
  const v = await findVendor(id);
  const updated = await prisma.vendor.update({
    where: { id },
    data: { applicationStatus: 'suspended', isActive: false },
    include: { owner: true, _count: { select: { products: true } } },
  });
  await logAction(req, 'suspend_vendor', v.shopName);
  return mapVendor(updated);
};

const listPendingProducts = async () => {
  const rows = await prisma.vendorProduct.findMany({
    where: { moderationStatus: 'pending' },
    include: { product: true, vendor: true },
    orderBy: { submittedAt: 'desc' },
  });
  return { products: rows.map(mapPendingProduct) };
};

const findVendorProduct = async (id) => {
  const vp = await prisma.vendorProduct.findUnique({
    where: { id },
    include: { product: true, vendor: true },
  });
  if (!vp) throw err('Produit introuvable');
  return vp;
};

const approveProduct = async (req, id) => {
  const vp = await findVendorProduct(id);
  const updated = await prisma.vendorProduct.update({
    where: { id },
    data: { moderationStatus: 'approved', isActive: true, imageFlag: null },
    include: { product: true, vendor: true },
  });
  await logAction(req, 'approve_product', vp.product?.name || id);
  return mapPendingProduct(updated);
};

const rejectProduct = async (req, id) => {
  const vp = await findVendorProduct(id);
  const updated = await prisma.vendorProduct.update({
    where: { id },
    data: { moderationStatus: 'rejected', isActive: false },
    include: { product: true, vendor: true },
  });
  await logAction(req, 'reject_product', vp.product?.name || id);
  return mapPendingProduct(updated);
};

const listFlaggedContent = async () => {
  const complaints = await prisma.complaint.findMany({
    where: { status: { in: ['pending', 'open', 'in_review'] } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return {
    items: complaints.map((c) => ({
      id: c.id,
      type: c.aiCategory || 'complaint',
      target: c.subject,
      content: c.message,
      reporter: c.name || c.email || 'Client',
      status: c.status === 'pending' ? 'open' : c.status,
      createdAt: c.createdAt,
    })),
  };
};

const deleteContent = async (req, id) => {
  const c = await prisma.complaint.findUnique({ where: { id } });
  if (!c) throw err('Contenu introuvable');
  const updated = await prisma.complaint.update({
    where: { id },
    data: { status: 'deleted', response: 'Supprimé par modération' },
  });
  await logAction(req, 'delete_content', c.subject);
  return updated;
};

const approveImage = async (req, productId) => {
  const vp = await prisma.vendorProduct.findFirst({
    where: { OR: [{ id: productId }, { productId }] },
    include: { product: true },
  });
  if (!vp) throw err('Produit introuvable');
  await prisma.vendorProduct.update({
    where: { id: vp.id },
    data: { imageFlag: null },
  });
  await logAction(req, 'approve_image', vp.product?.name || productId);
  return { ok: true };
};

const listDisputes = async () => {
  const rows = await prisma.refundRequest.findMany({
    where: {
      OR: [
        { disputed: true },
        { status: { in: ['moderator_review', 'disputed', 'fraud_flagged'] } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  return { disputes: rows.map(mapDispute) };
};

const resolveDispute = async (req, id, resolution = '') => {
  const row = await prisma.refundRequest.findUnique({ where: { id } });
  if (!row) throw err('Litige introuvable');
  const updated = await prisma.refundRequest.update({
    where: { id },
    data: { status: 'resolved', disputed: false },
  });
  await prisma.refundHistoryEntry.create({
    data: {
      refundId: id,
      action: 'moderator_resolve_dispute',
      actor: modName(req.user),
      actorRole: 'moderator',
      note: resolution || null,
    },
  });
  await logAction(req, 'resolve_dispute', row.orderRef, { resolution });
  return mapDispute(updated);
};

const listFakeReviews = async () => {
  const rows = await prisma.review.findMany({
    where: {
      OR: [
        { moderationStatus: { in: ['flagged', 'pending', 'rejected', 'cleared'] } },
        { sentimentScore: { lt: 0.3 } },
      ],
    },
    include: {
      user: { select: { name: true, email: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const filtered = rows.filter((r) => {
    if (['flagged', 'pending', 'rejected'].includes(r.moderationStatus)) return true;
    if (r.moderationStatus === 'cleared') return true;
    return spamScore(r.comment) >= 0.7;
  });

  return { reviews: filtered.map(mapFakeReview) };
};

const findReview = async (id) => {
  const r = await prisma.review.findUnique({
    where: { id },
    include: { user: true, product: true },
  });
  if (!r) throw err('Avis introuvable');
  return r;
};

const rejectReview = async (req, id) => {
  const r = await findReview(id);
  const updated = await prisma.review.update({
    where: { id },
    data: { moderationStatus: 'rejected' },
    include: { user: true, product: true },
  });
  await logAction(req, 'reject_review', r.product?.name || id);
  return mapFakeReview(updated);
};

const clearReview = async (req, id) => {
  const r = await findReview(id);
  const updated = await prisma.review.update({
    where: { id },
    data: { moderationStatus: 'cleared' },
    include: { user: true, product: true },
  });
  await logAction(req, 'clear_fake_review', r.product?.name || id);
  return mapFakeReview(updated);
};

const getRealtimeStats = async () => {
  const [pending, disputes, flagged] = await Promise.all([
    prisma.vendorProduct.count({ where: { moderationStatus: 'pending' } }),
    prisma.refundRequest.count({ where: { disputed: true, status: { not: 'resolved' } } }),
    prisma.review.count({ where: { moderationStatus: 'flagged' } }),
  ]);
  const now = new Date().toISOString();
  return {
    kpis: [
      { label: 'Produits en attente', value: pending, trend: 'up' },
      { label: 'Litiges ouverts', value: disputes, trend: 'stable' },
      { label: 'Avis signalés', value: flagged, trend: 'down' },
    ],
    livePrimary: pending + disputes,
    liveSecondary: flagged,
    liveSeries: Array.from({ length: 12 }, (_, i) => ({
      t: i,
      v: Math.max(0, pending - i + Math.floor(disputes / 3)),
    })),
    dailySeries: Array.from({ length: 7 }, (_, i) => ({
      day: `J-${6 - i}`,
      value: Math.max(1, pending + disputes - i),
    })),
    breakdown: [
      { name: 'Produits', value: pending },
      { name: 'Litiges', value: disputes },
      { name: 'Avis', value: flagged },
    ],
    updatedAt: now,
  };
};

const getBiDashboard = async (days = 90) => {
  const since = new Date(Date.now() - Number(days) * 86400000);
  const actions = await prisma.moderationAction.groupBy({
    by: ['action'],
    where: { createdAt: { gte: since } },
    _count: { action: true },
  });

  const vendors = await prisma.vendor.count();
  const pendingVendors = await prisma.vendor.count({ where: { applicationStatus: 'pending' } });

  return {
    kpis: [
      { label: 'Actions modération', value: actions.reduce((s, a) => s + a._count.action, 0) },
      { label: 'Vendeurs actifs', value: vendors - pendingVendors },
      { label: 'Demandes vendeur', value: pendingVendors },
    ],
    trend: actions.map((a) => ({ label: a.action, value: a._count.action })),
    breakdown: [
      { name: 'Vendeurs', value: pendingVendors },
      { name: 'Produits', value: await prisma.vendorProduct.count({ where: { moderationStatus: 'pending' } }) },
      { name: 'Réclamations', value: await prisma.complaint.count({ where: { status: 'pending' } }) },
    ],
    daily: [],
    table: { rows: [], columns: [] },
    alerts: [],
    updatedAt: new Date().toISOString(),
  };
};

module.exports = {
  getDashboard,
  getAnalytics,
  listUsers,
  suspendUser,
  reactivateUser,
  flagUser,
  listVendors,
  approveVendor,
  verifyVendor,
  suspendVendor,
  listPendingProducts,
  approveProduct,
  rejectProduct,
  listFlaggedContent,
  deleteContent,
  approveImage,
  listDisputes,
  resolveDispute,
  listFakeReviews,
  rejectReview,
  clearReview,
  getRealtimeStats,
  getBiDashboard,
  getNlpInsights: getModeratorSentimentInsights,
  logAction,
  spamScore,
};
