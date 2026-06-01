const { prisma } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const orderRepository = require('../repositories/order.repository');
const productRepository = require('../repositories/product.repository');
const { resolveRegionFromAddress } = require('../utils/regions');
const {
  normalizePaymentMethod,
  isValidPaymentMethod,
} = require('../utils/paymentMethods');
const promoService = require('./promo.service');
const walletService = require('./wallet.service');

const resolveOwnerId = (value) => {
  if (value == null) return null;
  if (typeof value === 'object') return value.id || value._id || null;
  return value;
};

const assertOrderOwner = (order, user) => {
  const userId = resolveOwnerId(user.id || user._id);
  const orderUserId = resolveOwnerId(order.userId);
  if (user.role !== 'admin' && String(orderUserId) !== String(userId)) {
    const error = new Error('Not authorized');
    error.status = 403;
    throw error;
  }
};

const getDiscountedPrice = (product) => {
  const price = Number(product?.price || 0);
  const discount = Number(product?.discount || 0);
  return Number((price * (1 - discount / 100)).toFixed(2));
};

const getOrders = async (user) => {
  return orderRepository.getOrdersForUser(user, user.role);
};

const getStats = async (role) => {
  const total = await orderRepository.countOrders();
  const revenueResult = await orderRepository.aggregateTotal();
  const pending = await orderRepository.countOrders({ status: 'pending' });
  return {
    total,
    revenue: revenueResult._sum.total || 0,
    pending
  };
};

const createOrder = async (userId, payload) => {
  const { items, address, phone, paymentMethod, location, paymentNote, promoCode } = payload;

  if (paymentMethod && !isValidPaymentMethod(paymentMethod)) {
    const error = new Error('Méthode de paiement non reconnue');
    error.status = 400;
    throw error;
  }
  const normalizedPayment = normalizePaymentMethod(paymentMethod) || 'cash';
  const deliveryAddress = paymentNote
    ? `${address || ''}\n[Paiement] ${paymentNote}`.trim()
    : address;

  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Order items are required');
    error.status = 400;
    throw error;
  }

  const validatedItems = [];

  for (const item of items) {
    const product = await productRepository.findById(item.productId);
    if (!product || product.stock < item.quantity) {
      const error = new Error(`Stock insuffisant pour ${product?.name || item.productId}: ${product?.stock || 0}/${item.quantity}`);
      error.status = 400;
      throw error;
    }

    const itemPrice = Number(item.price ?? getDiscountedPrice(product));
    validatedItems.push({ productId: item.productId, quantity: item.quantity, price: itemPrice });
    await productRepository.update(item.productId, { stock: product.stock - item.quantity });
  }

  const orderSubtotal = Number(validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
  const { promoDiscount, promoRecord, promoCodeText } = await promoService.resolvePromoForOrder(
    promoCode,
    orderSubtotal
  );
  const orderTotal = Number(Math.max(0, orderSubtotal - promoDiscount).toFixed(2));
  const region = resolveRegionFromAddress(deliveryAddress || address);

  if (normalizedPayment === 'wallet') {
    await walletService.debitWallet(
      userId,
      orderTotal,
      'Commande PetfoodTN',
      null,
      { id: userId }
    );
  }

  const order = await orderRepository.create({
    userId,
    total: orderTotal,
    subtotal: orderSubtotal,
    promoCodeId: promoRecord?.id || null,
    promoCodeText: promoCodeText || null,
    promoDiscount,
    paymentMethod: normalizedPayment,
    address: deliveryAddress || address,
    phone,
    region,
    deliveryLocation: location || null,
    items: {
      create: validatedItems.map((item) => ({
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        price: item.price
      }))
    }
  });

  if (promoRecord?.id) {
    await promoService.incrementPromoUsage(promoRecord.id);
  }

  const invoice = await prisma.invoice.create({
    data: {
      userId,
      orderId: order.id,
      amount: orderTotal,
      paymentMethod: normalizedPayment,
      status: normalizedPayment === 'wallet' ? 'paid' : 'unpaid',
      paidAt: normalizedPayment === 'wallet' ? new Date() : null,
    }
  });

  try {
    const { notifyLivreursInRegion } = require('../utils/notificationHub');
    await notifyLivreursInRegion(region, {
      id: `livreur-order-${order.id}`,
      type: 'livreur_new_order',
      title: `Nouvelle livraison #${order.id.slice(-6)}`,
      description: `${region || 'Zone'} — ${orderTotal} DT`,
      link: '/livreur/orders',
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* non bloquant */
  }

  return { order, invoice };
};

const createAdminOrder = async (payload) => {
  const { userId, items, address, phone, paymentMethod, location, promoCode } = payload;

  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Order items are required');
    error.status = 400;
    throw error;
  }

  const validatedItems = [];

  for (const item of items) {
    const product = await productRepository.findById(item.productId);
    if (!product || product.stock < item.quantity) {
      const error = new Error(`Stock insuffisant pour ${product?.name || item.productId}: ${product?.stock || 0}/${item.quantity}`);
      error.status = 400;
      throw error;
    }

    const itemPrice = Number(item.price ?? getDiscountedPrice(product));
    validatedItems.push({ productId: item.productId, quantity: item.quantity, price: itemPrice });
    await productRepository.update(item.productId, { stock: product.stock - item.quantity });
  }

  const orderSubtotal = Number(validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
  const { promoDiscount, promoRecord, promoCodeText } = await promoService.resolvePromoForOrder(
    promoCode,
    orderSubtotal
  );
  const orderTotal = Number(Math.max(0, orderSubtotal - promoDiscount).toFixed(2));
  const region = resolveRegionFromAddress(address);

  const order = await orderRepository.create({
    userId,
    total: orderTotal,
    subtotal: orderSubtotal,
    promoCodeId: promoRecord?.id || null,
    promoCodeText: promoCodeText || null,
    promoDiscount,
    address,
    phone,
    region,
    paymentMethod: paymentMethod || 'cash',
    deliveryLocation: location || null,
    items: {
      create: validatedItems.map((item) => ({
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        price: item.price
      }))
    }
  });

  if (promoRecord?.id) {
    await promoService.incrementPromoUsage(promoRecord.id);
  }

  const invoice = await prisma.invoice.create({
    data: {
      userId,
      orderId: order.id,
      amount: orderTotal,
      paymentMethod: paymentMethod || 'cash'
    }
  });

  return { order, invoice };
};

const LIVREUR_STATUS_FLOW = {
  pending: 'shipped',
  shipped: 'delivered',
};

const livreurUpdateStatus = async (orderId, user, status, extras = {}) => {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    const error = new Error('Order not found');
    error.status = 404;
    throw error;
  }

  const expectedNext = LIVREUR_STATUS_FLOW[order.status];
  if (!expectedNext || status !== expectedNext) {
    const error = new Error(`Transition invalide: ${order.status} → ${status}`);
    error.status = 400;
    throw error;
  }

  const livreurId = user.id || user._id;

  if (user.role === 'livreur') {
    const livreur = await prisma.user.findUnique({
      where: { id: livreurId },
      select: { region: true },
    });
    if (livreur?.region && order.region && order.region !== livreur.region) {
      const error = new Error('Commande hors de votre région');
      error.status = 403;
      throw error;
    }
    if (order.assignedLivreurId && order.assignedLivreurId !== livreurId && order.status === 'shipped') {
      const error = new Error('Commande assignée à un autre livreur');
      error.status = 403;
      throw error;
    }
  }

  const patch = { status };
  if (status === 'shipped') {
    patch.assignedLivreurId = livreurId;
    patch.shippedAt = new Date();
    patch.deliveryStatus = 'in_transit';
  }
  if (status === 'delivered') {
    patch.deliveredAt = new Date();
    patch.deliveryStatus = 'delivered';
    if (extras.deliveryNote) patch.deliveryNote = String(extras.deliveryNote).slice(0, 500);
  }

  const updated = await orderRepository.update(orderId, patch);

  if (status === 'delivered') {
    try {
      const loyaltyService = require('./loyalty.service');
      await loyaltyService.earnForDeliveredOrder(updated);
    } catch { /* non bloquant */ }
  }

  try {
    const { emitToUser } = require('../utils/notificationHub');
    if (status === 'shipped') {
      emitToUser(order.userId, {
        id: `order-shipped-${order.id}`,
        type: 'order_shipped',
        title: `Livreur en route — #${order.id.slice(-6)}`,
        description: 'Votre commande est en cours de livraison',
        link: '/client-orders',
        createdAt: new Date().toISOString(),
      });
    }
    if (status === 'delivered') {
      emitToUser(order.userId, {
        id: `order-delivered-${order.id}`,
        type: 'order_delivered',
        title: `Commande livrée #${order.id.slice(-6)}`,
        description: extras.deliveryNote || 'Merci pour votre confiance !',
        link: '/client-orders',
        createdAt: new Date().toISOString(),
      });
    }
  } catch { /* non bloquant */ }

  return updated;
};

const updateOrder = async (id, payload) => {
  const updateData = {};
  if (payload.status) updateData.status = payload.status;
  if (payload.address) updateData.address = payload.address;
  if (payload.phone) updateData.phone = payload.phone;
  if (payload.region !== undefined) updateData.region = payload.region;
  if (payload.address && payload.region === undefined) {
    updateData.region = resolveRegionFromAddress(payload.address);
  }
  if (payload.paymentMethod) updateData.paymentMethod = payload.paymentMethod;
  if (payload.location !== undefined) updateData.deliveryLocation = payload.location;

  if (payload.items) {
    updateData.items = {
      deleteMany: {},
      create: payload.items.map((item) => ({
        product: { connect: { id: item.productId } },
        quantity: item.quantity,
        price: Number(item.price ?? 0)
      }))
    };
  }

  return orderRepository.update(id, updateData);
};

const deleteOrder = async (id, user) => {
  const order = await orderRepository.findById(id);
  if (!order) {
    const error = new Error('Order not found');
    error.status = 404;
    throw error;
  }

  assertOrderOwner(order, user);

  return orderRepository.deleteWithDependencies(id);
};

const getOrderTracking = async (orderId, user) => {
  const order = await orderRepository.findById(orderId);
  if (!order) {
    const error = new Error('Commande introuvable');
    error.status = 404;
    throw error;
  }

  assertOrderOwner(order, user);

  let livreurGps = null;
  let livreurName = null;
  if (order.assignedLivreurId) {
    const livreur = await prisma.user.findUnique({
      where: { id: order.assignedLivreurId },
      select: { name: true, preferences: true, phone: true },
    });
    livreurName = livreur?.name;
    try {
      const prefs = livreur?.preferences ? JSON.parse(livreur.preferences) : {};
      livreurGps = prefs.lastGps || null;
    } catch { /* ignore */ }
  }

  return {
    orderId: order.id,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    deliveryNote: order.deliveryNote,
    livreur: order.assignedLivreurId
      ? { name: livreurName, gps: livreurGps }
      : null,
  };
};

module.exports = {
  getOrders,
  getStats,
  createOrder,
  createAdminOrder,
  livreurUpdateStatus,
  updateOrder,
  deleteOrder,
  getOrderTracking,
};
