const { prisma } = require('../prismaClient');
const { SALES_CHANNELS, parseChannels, ALLOWED, channelLabel } = require('../utils/salesChannels');

const getVendorByOwner = async (userId) =>
  prisma.vendor.findFirst({ where: { ownerUserId: userId } });

const getSalesChannelsConfig = async (user) => {
  const vendor = await getVendorByOwner(user.id || user._id);
  if (!vendor) {
    return {
      channels: ['online'],
      available: SALES_CHANNELS,
      storeHours: '',
      phoneOrdersNumber: user.phone || '',
      shopName: null,
      commercialAddress: null,
    };
  }
  return {
    channels: parseChannels(vendor.salesChannelsJson),
    available: SALES_CHANNELS,
    storeHours: vendor.storeHours || '',
    phoneOrdersNumber: vendor.phoneOrdersNumber || user.phone || '',
    shopName: vendor.shopName,
    commercialAddress: vendor.commercialAddress || '',
    region: vendor.region,
  };
};

const updateSalesChannelsConfig = async (user, body = {}) => {
  const vendor = await getVendorByOwner(user.id || user._id);
  if (!vendor) {
    const err = new Error('Boutique vendeur introuvable');
    err.status = 404;
    throw err;
  }

  let channels = parseChannels(body.channels ?? body.salesChannels);
  channels = channels.filter((id) => ALLOWED.has(id));
  if (!channels.length) channels = ['online'];
  if (!channels.includes('online')) {
    // Marketplace reste toujours actif pour les offres publiées
    channels = ['online', ...channels];
  }

  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: {
      salesChannelsJson: JSON.stringify(channels),
      storeHours: body.storeHours != null ? String(body.storeHours) : vendor.storeHours,
      phoneOrdersNumber:
        body.phoneOrdersNumber != null ? String(body.phoneOrdersNumber) : vendor.phoneOrdersNumber,
      commercialAddress:
        body.commercialAddress != null ? String(body.commercialAddress) : vendor.commercialAddress,
    },
  });

  return {
    channels: parseChannels(updated.salesChannelsJson),
    available: SALES_CHANNELS,
    storeHours: updated.storeHours || '',
    phoneOrdersNumber: updated.phoneOrdersNumber || '',
    shopName: updated.shopName,
    commercialAddress: updated.commercialAddress || '',
  };
};

const createOfflineOrder = async (user, body = {}) => {
  const vendor = await getVendorByOwner(user.id || user._id);
  if (!vendor) {
    const err = new Error('Boutique vendeur introuvable');
    err.status = 404;
    throw err;
  }

  const enabled = parseChannels(vendor.salesChannelsJson);
  const salesChannel = String(body.salesChannel || '').trim();
  if (!ALLOWED.has(salesChannel) || salesChannel === 'online') {
    const err = new Error('Canal invalide — utilisez présentiel, téléphone ou courrier');
    err.status = 400;
    throw err;
  }
  if (!enabled.includes(salesChannel)) {
    const err = new Error(`Canal « ${channelLabel(salesChannel)} » non activé pour votre boutique`);
    err.status = 400;
    throw err;
  }

  const clientName = String(body.clientName || 'Client comptoir').trim();
  const clientPhone = String(body.phone || vendor.phoneOrdersNumber || '').trim();
  const address = String(body.address || vendor.commercialAddress || 'Magasin').trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    const err = new Error('Ajoutez au moins un article');
    err.status = 400;
    throw err;
  }

  let subtotal = 0;
  const lineData = [];
  for (const line of items) {
    const productId = line.productId;
    const qty = Math.max(1, Number(line.quantity || 1));
    const offer = productId
      ? await prisma.vendorProduct.findFirst({
          where: { vendorId: vendor.id, productId, isActive: true },
          include: { product: true },
        })
      : null;
    const unit = Number(line.price != null ? line.price : (offer?.price ?? offer?.product?.price ?? 0));
    subtotal += unit * qty;
    lineData.push({
      productId: productId || null,
      quantity: qty,
      price: unit,
      name: line.name || offer?.product?.name || 'Article',
    });
  }

  // Client placeholder : propriétaire vendeur si pas d'user client (commande offline)
  const clientUserId = body.clientUserId || vendor.ownerUserId;

  const deliveryMode =
    salesChannel === 'instore' ? 'store_pickup'
      : salesChannel === 'courier' ? 'courier'
        : salesChannel === 'phone' ? (body.deliveryMode || 'home')
          : 'home';

  const order = await prisma.order.create({
    data: {
      userId: clientUserId,
      total: subtotal,
      subtotal,
      status: salesChannel === 'instore' ? 'delivered' : 'pending',
      paymentMethod: body.paymentMethod || (salesChannel === 'instore' ? 'cash' : 'cash'),
      address,
      phone: clientPhone,
      region: vendor.region || body.region || '',
      deliveryMode,
      salesChannel,
      deliveryNote: `[${channelLabel(salesChannel)}] ${clientName}${body.note ? ` — ${body.note}` : ''}`,
      deliveryStatus: salesChannel === 'instore' ? 'delivered' : 'pending',
      deliveredAt: salesChannel === 'instore' ? new Date() : undefined,
      items: {
        create: lineData.map(({ productId, quantity, price }) => ({
          productId,
          quantity,
          price,
        })),
      },
    },
    include: { items: { include: { product: true } }, user: { select: { name: true, email: true } } },
  });

  await prisma.vendor.update({
    where: { id: vendor.id },
    data: { totalSales: { increment: subtotal } },
  });

  return {
    id: order.id,
    salesChannel,
    salesChannelLabel: channelLabel(salesChannel),
    total: order.total,
    status: order.status,
    clientName,
    deliveryMode: order.deliveryMode,
    items: lineData,
    createdAt: order.createdAt,
  };
};

const listPublicVendorChannels = async (vendorId) => {
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, isActive: true },
  });
  if (!vendor) return null;
  const channels = parseChannels(vendor.salesChannelsJson);
  return {
    vendorId: vendor.id,
    shopName: vendor.shopName,
    channels: channels.map((id) => ({
      id,
      ...SALES_CHANNELS.find((c) => c.id === id),
    })),
    storeHours: vendor.storeHours,
    phoneOrdersNumber: vendor.phoneOrdersNumber,
    commercialAddress: vendor.commercialAddress,
    region: vendor.region,
  };
};

module.exports = {
  getSalesChannelsConfig,
  updateSalesChannelsConfig,
  createOfflineOrder,
  listPublicVendorChannels,
  SALES_CHANNELS,
};
