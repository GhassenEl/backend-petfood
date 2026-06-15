const { prisma, isDemoMode } = require('../../prismaClient');
const { buildVendorAnalytics } = require('./vendorAnalytics.service');
const { getVendorMlAgentPack } = require('./vendorMlAgent.service');

const uid = (u) => String(u?.id || u?._id);
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'boutique';

const seedVendors = async () => {
  if (isDemoMode()) return;
  const n = await prisma.vendor.count();
  if (n > 0) return;
  const products = await prisma.product.findMany({ take: 8 });
  const demos = [
    { shopName: 'Animalerie Tunis Centre', region: 'Tunis' },
    { shopName: 'Pet Shop Sousse', region: 'Sousse' },
  ];
  const owners = await prisma.user.findMany({ where: { role: 'client' }, take: 2 });
  for (let i = 0; i < demos.length; i++) {
    const owner = owners[i];
    if (!owner) break;
    const v = await prisma.vendor.create({
      data: {
        ownerUserId: owner.id,
        shopName: demos[i].shopName,
        slug: slugify(demos[i].shopName) + `-${i}`,
        region: demos[i].region,
        commissionRate: 0.12,
      },
    });
    for (const p of products.slice(i * 3, i * 3 + 4)) {
      await prisma.vendorProduct.create({
        data: { vendorId: v.id, productId: p.id, price: p.price, stock: p.stock || 10 },
      });
    }
  }
};

const listMarketplace = async () => {
  await seedVendors();
  if (isDemoMode()) {
    return {
      vendors: [
        { id: 'v1', shopName: 'Animalerie Tunis Centre', region: 'Tunis', productCount: 12, commissionRate: 0.12 },
        { id: 'v2', shopName: 'Pet Shop Sousse', region: 'Sousse', productCount: 8, commissionRate: 0.1 },
      ],
    };
  }
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true },
    include: { _count: { select: { products: true } } },
    orderBy: { totalSales: 'desc' },
  });
  return {
    vendors: vendors.map((v) => ({
      id: v.id,
      shopName: v.shopName,
      slug: v.slug,
      region: v.region,
      description: v.description,
      commissionRate: v.commissionRate,
      productCount: v._count.products,
    })),
  };
};

const demoVendorPayload = () => {
  const commissions = [
    { id: 'c1', orderId: 'o1', orderTotal: 120, commission: 14.4, platformFee: 3.6, status: 'pending', createdAt: new Date() },
    { id: 'c2', orderId: 'o2', orderTotal: 89, commission: 10.68, platformFee: 2.67, status: 'paid', createdAt: daysAgo(3) },
    { id: 'c3', orderId: 'o3', orderTotal: 210, commission: 25.2, platformFee: 6.3, status: 'paid', createdAt: daysAgo(12) },
    { id: 'c4', orderId: 'o4', orderTotal: 156, commission: 18.72, platformFee: 4.68, status: 'paid', createdAt: daysAgo(22) },
  ];
  const vendor = {
    id: 'demo_vendor',
    shopName: 'Ma animalerie (démo)',
    slug: 'demo-shop',
    region: 'Tunis',
    commissionRate: 0.12,
    totalSales: 1240,
    commissions,
    products: [
      { id: 'vp1', productId: 'p1', stock: 24, price: 89, isActive: true, product: { name: 'Croquettes Premium' } },
      { id: 'vp2', productId: 'p2', stock: 3, price: 15, isActive: true, product: { name: 'Friandises Training' } },
      { id: 'vp3', productId: 'p3', stock: 0, price: 45, isActive: true, product: { name: 'Litière chat' } },
    ],
  };
  return vendor;
};

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const getVendorDashboard = async (user) => {
  const userId = uid(user);
  let vendor;
  if (isDemoMode()) {
    vendor = demoVendorPayload();
  } else {
    vendor = await prisma.vendor.findUnique({
      where: { ownerUserId: userId },
      include: {
        products: { include: { product: true }, where: { isActive: true } },
        commissions: { orderBy: { createdAt: 'desc' }, take: 120 },
      },
    });
    if (!vendor) {
      const err = new Error('Compte vendeur introuvable');
      err.status = 404;
      throw err;
    }
  }

  const analytics = await buildVendorAnalytics(vendor);
  const mlAgent = await getVendorMlAgentPack(vendor, analytics);
  const pending = (vendor.commissions || []).filter((c) => c.status === 'pending');

  return {
    id: vendor.id,
    shopName: vendor.shopName,
    slug: vendor.slug,
    region: vendor.region,
    description: vendor.description,
    commissionRate: vendor.commissionRate,
    totalSales: vendor.totalSales,
    pendingCommissions: analytics.kpis.pendingCommissions ?? pending.reduce((s, c) => s + c.commission, 0),
    paidCommissions: analytics.kpis.paidCommissions,
    products: (vendor.products || []).map((vp) => ({
      id: vp.id,
      productId: vp.productId,
      name: vp.product?.name,
      stock: vp.stock,
      price: vp.price ?? vp.product?.price,
    })),
    commissions: vendor.commissions,
    kpis: analytics.kpis,
    salesTrend: analytics.salesTrend,
    productPerformance: analytics.productPerformance,
    recentOrders: analytics.recentOrders,
    mlAgent,
  };
};

const getVendorMlAgent = async (user) => {
  const dash = await getVendorDashboard(user);
  return dash.mlAgent;
};

const registerVendor = async (user, body) => {
  const userId = uid(user);
  const {
    shopName,
    region,
    description,
    ownerName,
    email,
    phone,
    siret,
    address,
    category,
  } = body;
  if (!shopName?.trim()) {
    const err = new Error('Nom de boutique requis');
    err.status = 400;
    throw err;
  }
  if (isDemoMode()) {
    return { id: 'demo_vendor', shopName, slug: slugify(shopName), applicationStatus: 'pending' };
  }
  const existing = await prisma.vendor.findUnique({ where: { ownerUserId: userId } });
  if (existing) return existing;

  if (ownerName || phone || region) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(ownerName ? { name: ownerName.trim() } : {}),
        ...(phone ? { phone } : {}),
        ...(region ? { region } : {}),
      },
    });
  }

  return prisma.vendor.create({
    data: {
      ownerUserId: userId,
      shopName: shopName.trim(),
      slug: `${slugify(shopName)}-${Date.now().toString(36).slice(-4)}`,
      region: region || null,
      description: description || null,
      applicationStatus: 'pending',
      isActive: false,
      commercialSiret: siret || null,
      commercialAddress: address || null,
      commercialCategory: category || 'Animalerie',
      commercialVerified: false,
    },
  });
};

const recordCommission = async (vendorId, orderTotal, orderId = null) => {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return null;
  const commission = Math.round(orderTotal * vendor.commissionRate * 100) / 100;
  const platformFee = Math.round(orderTotal * 0.03 * 100) / 100;
  if (isDemoMode()) return { commission, platformFee };
  const row = await prisma.vendorCommission.create({
    data: { vendorId, orderId, orderTotal, commission, platformFee, status: 'pending' },
  });
  await prisma.vendor.update({
    where: { id: vendorId },
    data: { totalSales: { increment: orderTotal } },
  });
  return row;
};

const getVendorProducts = async (vendorId) => {
  if (isDemoMode()) return { products: [] };
  const rows = await prisma.vendorProduct.findMany({
    where: { vendorId, isActive: true },
    include: { product: true },
  });
  return {
    products: rows.map((r) => ({
      ...r.product,
      vendorPrice: r.price ?? r.product.price,
      vendorStock: r.stock,
      vendorProductId: r.id,
    })),
  };
};

module.exports = {
  listMarketplace,
  getVendorDashboard,
  getVendorMlAgent,
  registerVendor,
  recordCommission,
  getVendorProducts,
  seedVendors,
};
