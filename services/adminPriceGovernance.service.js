const fs = require('fs');
const path = require('path');
const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');

const POLICY_FILE = path.join(__dirname, '../data/pricePolicy.json');
const LOG_FILE = path.join(__dirname, '../data/priceChangeLogs.json');

const DEFAULT_POLICY = {
  requireVendorPriceApproval: true,
  maxPriceIncreasePercent: 15,
  maxDiscountPercent: 50,
  minProductPrice: 1,
  maxProductPrice: 5000,
  showVerifiedBadgeToClients: true,
  autoRejectSuspiciousPrices: true,
  priceUpdateCooldownHours: 24,
  lastGlobalVerificationAt: null,
};

const demoPending = [
  {
    id: 'pch-pending-1',
    productId: 'prd_dog_1',
    productName: 'Croquettes Premium Chien 12 kg',
    vendorName: 'Pets & Co Sfax',
    oldPrice: 89.9,
    newPrice: 109.9,
    changePct: 22.2,
    status: 'pending',
    source: 'vendor',
    reason: 'Hausse matières premières',
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 'pch-pending-2',
    productId: 'prd_cat_3',
    productName: 'Croquettes chat saumon 3 kg',
    vendorName: 'Animalerie Nour',
    oldPrice: 42.5,
    newPrice: 35.0,
    changePct: -17.6,
    status: 'pending',
    source: 'vendor',
    reason: 'Promotion saisonnière',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
];

let memPolicy = { ...DEFAULT_POLICY, lastGlobalVerificationAt: new Date(Date.now() - 2 * 86400000).toISOString() };
let memLogs = [];
let memPending = [...demoPending];

const readJson = (file, fallback) => {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* ignore */
  }
  return fallback;
};

const writeJson = (file, data) => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {
    /* ignore */
  }
};

const pctChange = (oldP, newP) => {
  if (!oldP) return 0;
  return Number((((newP - oldP) / oldP) * 100).toFixed(1));
};

const getPolicyRecord = async () => {
  if (isDemoMode()) return memPolicy;
  try {
    let row = await prisma.priceGovernancePolicy.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await prisma.priceGovernancePolicy.create({ data: { id: 'default', ...DEFAULT_POLICY } });
    }
    return row;
  } catch {
    return readJson(POLICY_FILE, DEFAULT_POLICY);
  }
};

const savePolicyRecord = async (patch) => {
  const next = { ...await getPolicyRecord(), ...patch, updatedAt: new Date().toISOString() };
  if (isDemoMode()) {
    memPolicy = next;
    writeJson(POLICY_FILE, next);
    return next;
  }
  try {
    const row = await prisma.priceGovernancePolicy.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...DEFAULT_POLICY, ...patch },
      update: patch,
    });
    return row;
  } catch {
    writeJson(POLICY_FILE, next);
    return next;
  }
};

const listLogs = async (limit = 50) => {
  if (isDemoMode()) {
    if (!memLogs.length) {
      memLogs = [
        {
          id: 'log-1', productId: 'prd_dog_1', productName: 'Croquettes Premium Chien 12 kg',
          oldPrice: 84.9, newPrice: 89.9, changePct: 5.9, status: 'applied', source: 'admin',
          actorName: 'Ghassen Admin', reason: 'Ajustement catalogue Q2', verifiedAt: new Date(Date.now() - 86400000).toISOString(),
          appliedAt: new Date(Date.now() - 86400000).toISOString(), createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
        {
          id: 'log-2', productId: 'prd_cat_1', productName: 'Pâtée chat saumon x12',
          oldPrice: 28.0, newPrice: 26.5, changePct: -5.4, status: 'applied', source: 'admin',
          actorName: 'Ghassen Admin', reason: 'Alignement concurrent', verifiedAt: new Date(Date.now() - 172800000).toISOString(),
          appliedAt: new Date(Date.now() - 172800000).toISOString(), createdAt: new Date(Date.now() - 172800000).toISOString(),
        },
      ];
    }
    return [...memPending, ...memLogs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
  }
  try {
    return await prisma.priceChangeLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch {
    return readJson(LOG_FILE, []);
  }
};

const appendLog = async (entry) => {
  const row = {
    id: entry.id || `pch-${Date.now()}`,
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
    appliedAt: entry.appliedAt || (entry.status === 'applied' ? new Date().toISOString() : null),
  };
  if (isDemoMode()) {
    if (row.status === 'pending') memPending.unshift(row);
    else memLogs.unshift(row);
    writeJson(LOG_FILE, [...memPending, ...memLogs]);
    return row;
  }
  try {
    return await prisma.priceChangeLog.create({ data: row });
  } catch {
    const logs = readJson(LOG_FILE, []);
    logs.unshift(row);
    writeJson(LOG_FILE, logs);
    return row;
  }
};

const getProducts = async () => {
  if (isDemoMode()) return demoStore.getProducts();
  const productRepository = require('../repositories/product.repository');
  return productRepository.findAll();
};

const updateProductPrice = async (productId, price, discount, actorName, reason) => {
  const products = await getProducts();
  const product = products.find((p) => (p.id || p._id) === productId);
  if (!product) {
    const err = new Error('Produit introuvable');
    err.status = 404;
    throw err;
  }
  const oldPrice = Number(product.price || 0);
  const oldDiscount = Number(product.discount || 0);
  const newPrice = Number(price);
  const newDiscount = discount !== undefined ? Number(discount) : oldDiscount;

  if (isDemoMode()) {
    demoStore.updateProduct(productId, { price: newPrice, discount: newDiscount });
  } else {
    const productService = require('./product.service');
    await productService.updateProduct(productId, { price: newPrice, discount: newDiscount });
  }

  const log = await appendLog({
    productId,
    productName: product.name,
    oldPrice,
    newPrice,
    oldDiscount,
    newDiscount,
    changePct: pctChange(oldPrice, newPrice),
    status: 'applied',
    source: 'admin',
    actorName,
    reason,
    verifiedAt: new Date().toISOString(),
  });
  return { product: { ...product, price: newPrice, discount: newDiscount }, log };
};

const buildProductRows = async (policy) => {
  const products = await getProducts();
  const logs = await listLogs(200);
  const verifiedMap = new Map();
  logs.forEach((l) => {
    if (l.status === 'applied' && l.verifiedAt) {
      verifiedMap.set(l.productId, l.verifiedAt);
    }
  });

  return products.map((p) => {
    const id = p.id || p._id;
    const price = Number(p.price || 0);
    const discount = Number(p.discount || 0);
    const verifiedAt = verifiedMap.get(id) || policy.lastGlobalVerificationAt || null;
    const outOfBounds = price < policy.minProductPrice || price > policy.maxProductPrice;
    const highDiscount = discount > policy.maxDiscountPercent;
    return {
      id,
      name: p.name,
      price,
      discount,
      category: p.category,
      animalType: p.animalType,
      stock: p.stock,
      priceVerified: !!verifiedAt,
      priceVerifiedAt: verifiedAt,
      priceStatus: outOfBounds ? 'out_of_bounds' : highDiscount ? 'high_discount' : 'ok',
    };
  });
};

const getPack = async () => {
  const policy = await getPolicyRecord();
  const products = await buildProductRows(policy);
  const history = await listLogs(30);
  const pending = history.filter((h) => h.status === 'pending');

  const stats = {
    totalProducts: products.length,
    verifiedPrices: products.filter((p) => p.priceVerified).length,
    pendingApprovals: pending.length,
    outOfBounds: products.filter((p) => p.priceStatus === 'out_of_bounds').length,
    highDiscounts: products.filter((p) => p.priceStatus === 'high_discount').length,
    lastGlobalVerificationAt: policy.lastGlobalVerificationAt,
    credibilityScore: Math.round(
      (products.filter((p) => p.priceVerified).length / Math.max(products.length, 1)) * 100,
    ),
  };

  return {
    mode: isDemoMode() ? 'demo' : 'live',
    policy,
    stats,
    pending,
    history: history.filter((h) => h.status !== 'pending'),
    products,
  };
};

const updatePolicy = async (patch) => savePolicyRecord(patch);

const approvePending = async (id, actorName) => {
  const all = await listLogs(100);
  const row = all.find((r) => r.id === id && r.status === 'pending');
  if (!row) {
    const err = new Error('Demande introuvable');
    err.status = 404;
    throw err;
  }
  const result = await updateProductPrice(row.productId, row.newPrice, row.newDiscount, actorName, `Approbation vendeur: ${row.reason || ''}`);
  if (isDemoMode()) memPending = memPending.filter((p) => p.id !== id);
  else {
    try {
      await prisma.priceChangeLog.update({
        where: { id },
        data: { status: 'approved', appliedAt: new Date(), actorName },
      });
    } catch { /* demo fallback */ }
  }
  return result;
};

const rejectPending = async (id, actorName, reason) => {
  if (isDemoMode()) {
    memPending = memPending.filter((p) => p.id !== id);
    return appendLog({
      ...demoPending.find((p) => p.id === id),
      id,
      status: 'rejected',
      actorName,
      reason: reason || 'Rejeté par admin',
    });
  }
  try {
    return await prisma.priceChangeLog.update({
      where: { id },
      data: { status: 'rejected', actorName, reason },
    });
  } catch (err) {
    const e = new Error('Demande introuvable');
    e.status = 404;
    throw e;
  }
};

const bulkUpdate = async ({ productIds, mode, value, actorName, reason }) => {
  const policy = await getPolicyRecord();
  const products = await buildProductRows(policy);
  const targets = productIds?.length
    ? products.filter((p) => productIds.includes(p.id))
    : products;

  const results = [];
  for (const p of targets) {
    let newPrice = p.price;
    if (mode === 'percent') newPrice = Number((p.price * (1 + Number(value) / 100)).toFixed(2));
    else if (mode === 'fixed') newPrice = Number((p.price + Number(value)).toFixed(2));
    else if (mode === 'set') newPrice = Number(value);

    newPrice = Math.max(policy.minProductPrice, Math.min(policy.maxProductPrice, newPrice));
    const change = pctChange(p.price, newPrice);
    if (Math.abs(change) > policy.maxPriceIncreasePercent && change > 0) continue;

    const r = await updateProductPrice(p.id, newPrice, p.discount, actorName, reason || `Mise à jour groupée (${mode})`);
    results.push(r);
  }
  return { updated: results.length, results };
};

const verifyAll = async (actorName) => {
  const now = new Date().toISOString();
  await savePolicyRecord({ lastGlobalVerificationAt: now });
  const products = await getProducts();
  for (const p of products) {
    await appendLog({
      productId: p.id || p._id,
      productName: p.name,
      oldPrice: Number(p.price || 0),
      newPrice: Number(p.price || 0),
      oldDiscount: Number(p.discount || 0),
      newDiscount: Number(p.discount || 0),
      changePct: 0,
      status: 'applied',
      source: 'verification',
      actorName,
      reason: 'Vérification globale des prix',
      verifiedAt: now,
    });
  }
  return { verifiedAt: now, count: products.length };
};

const enrichProductForClient = (product, policy, latestLog) => {
  if (!policy?.showVerifiedBadgeToClients) return product;
  const verifiedAt = latestLog?.verifiedAt || policy?.lastGlobalVerificationAt;
  if (!verifiedAt) return product;
  return {
    ...product,
    priceVerified: true,
    priceVerifiedAt: verifiedAt,
  };
};

const exportPrices = async () => {
  const pack = await getPack();
  return {
    exportedAt: new Date().toISOString(),
    policy: pack.policy,
    products: pack.products.map((p) => ({
      productId: p.id,
      productName: p.name,
      price: p.price,
      discount: p.discount,
      category: p.category,
      animalType: p.animalType,
      priceVerified: p.priceVerified,
      priceStatus: p.priceStatus,
    })),
    history: pack.history,
  };
};

const importPrices = async (rows, actorName) => {
  if (!Array.isArray(rows) || !rows.length) {
    const err = new Error('Aucune ligne à importer');
    err.status = 400;
    throw err;
  }
  const results = [];
  const errors = [];
  for (const row of rows) {
    const productId = row.productId || row.productid || row.id;
    const price = Number(row.price);
    const discount = row.discount !== undefined && row.discount !== '' ? Number(row.discount) : undefined;
    if (!productId || !Number.isFinite(price)) {
      errors.push({ row, error: 'productId ou price invalide' });
      continue;
    }
    try {
      const r = await updateProductPrice(productId, price, discount, actorName, row.reason || 'Import admin');
      results.push(r);
    } catch (e) {
      errors.push({ productId, error: e.message });
    }
  }
  return { imported: results.length, errors: errors.length, results, errors };
};

module.exports = {
  getPack,
  getPolicyRecord,
  updatePolicy,
  updateProductPrice,
  approvePending,
  rejectPending,
  bulkUpdate,
  verifyAll,
  listLogs,
  enrichProductForClient,
  exportPrices,
  importPrices,
};
