const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const productRepository = require('../repositories/product.repository');
const productService = require('./product.service');
const {
  getStockMeta,
  mergeStockMetaIntoTags,
  parseStockHistory,
} = require('../utils/stockMeta');

const LOCATION_BY_CATEGORY = {
  nourriture: 'Entrepôt A',
  friandises: 'Entrepôt A',
  accessoires: 'Boutique',
  santé: 'Pharmacie',
  sante: 'Pharmacie',
  hygiène: 'Entrepôt B',
  hygiene: 'Entrepôt B',
};

const estimateDailyVelocity = (productId, orderItems) => {
  const related = orderItems.filter((i) => i.productId === productId);
  const units = related.reduce((s, i) => s + Number(i.quantity || 0), 0);
  return Math.round((units / 30) * 10) / 10;
};

const enrichProductStock = (product, orderItems = []) => {
  const id = product.id || product._id;
  const meta = getStockMeta(product);
  const velocity = estimateDailyVelocity(id, orderItems) || meta.velocityPerDay || 1;
  const location = meta.location || LOCATION_BY_CATEGORY[product.category] || 'Entrepôt';

  return {
    id,
    _id: id,
    name: product.name,
    sku: meta.sku,
    stock: Number(product.stock ?? 0),
    minStock: Number(meta.minStock ?? 10),
    maxStock: Number(meta.maxStock ?? 100),
    reorderQty: Number(meta.reorderQty ?? 20),
    velocityPerDay: velocity,
    category: product.category || '—',
    location,
    price: Number(product.price || 0),
  };
};

const getOrderItemsLast30Days = async () => {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return prisma.orderItem.findMany({
    where: {
      productId: { not: null },
      order: {
        createdAt: { gte: since },
        status: { in: ['delivered', 'completed', 'paid', 'shipped'] },
      },
    },
    select: { productId: true, quantity: true },
  });
};

const getOverview = async () => {
  if (isDemoMode()) {
    const products = demoStore.getProducts();
    const items = products.map((p) => enrichProductStock(p));
    return buildSummary(items);
  }

  const [products, orderItems] = await Promise.all([
    productRepository.findAll(),
    getOrderItemsLast30Days(),
  ]);
  const items = products.map((p) => enrichProductStock(p, orderItems));
  return buildSummary(items);
};

const buildSummary = (items) => {
  const ruptures = items.filter((p) => p.stock <= 0).length;
  const low = items.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const value = items.reduce((s, p) => s + p.stock * (p.price || 12), 0);

  return {
    items,
    stats: {
      total: items.length,
      ruptures,
      low,
      value: Math.round(value * 100) / 100,
    },
  };
};

const getMovements = async (limit = 50) => {
  if (isDemoMode()) {
    const products = demoStore.getProducts();
    const movements = [];
    products.forEach((p) => {
      const history = parseStockHistory(p.stockHistory);
      history.forEach((entry, idx) => {
        movements.push({
          id: `${p._id}-mv-${idx}`,
          productId: p._id,
          productName: p.name,
          type: Number(entry.adjustment) > 0 ? 'entrée' : Number(entry.adjustment) < 0 ? 'sortie' : 'ajustement',
          qty: Number(entry.adjustment || 0),
          reason: entry.reason || 'Ajustement',
          date: entry.date || new Date().toISOString(),
          user: entry.adminId || 'Système',
        });
      });
    });
    return movements
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  }

  const products = await prisma.product.findMany({
    select: { id: true, name: true, stockHistory: true },
  });

  const movements = [];
  products.forEach((p) => {
    parseStockHistory(p.stockHistory).forEach((entry, idx) => {
      const qty = Number(entry.adjustment || 0);
      movements.push({
        id: `${p.id}-mv-${idx}`,
        productId: p.id,
        productName: p.name,
        type: qty > 0 ? 'entrée' : qty < 0 ? 'sortie' : 'ajustement',
        qty,
        reason: entry.reason || 'Ajustement',
        date: entry.date || new Date().toISOString(),
        user: entry.adminId || 'Système',
      });
    });
  });

  return movements
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
};

const updateThresholds = async (productId, payload) => {
  const product = await productRepository.findById(productId);
  if (!product) {
    const error = new Error('Product not found');
    error.status = 404;
    throw error;
  }

  const patch = {};
  if (payload.minStock !== undefined) patch.minStock = Math.max(0, Number(payload.minStock));
  if (payload.maxStock !== undefined) patch.maxStock = Math.max(0, Number(payload.maxStock));
  if (payload.reorderQty !== undefined) patch.reorderQty = Math.max(1, Number(payload.reorderQty));
  if (payload.location !== undefined) patch.location = String(payload.location).trim() || 'Entrepôt';
  if (payload.sku !== undefined) patch.sku = String(payload.sku).trim();

  const tags = mergeStockMetaIntoTags(product.tags, patch);
  const updated = await productRepository.update(productId, { tags });
  return enrichProductStock(updated);
};

const bulkReorder = async (productIds, userId) => {
  const overview = await getOverview();
  let targets = overview.items.filter((p) => p.stock <= p.minStock);

  if (Array.isArray(productIds) && productIds.length > 0) {
    const idSet = new Set(productIds);
    targets = targets.filter((p) => idSet.has(p.id));
  }

  const results = [];
  for (const item of targets) {
    const qty = item.reorderQty;
    try {
      let updated;
      if (isDemoMode()) {
        const existing = demoStore.getProducts().find((p) => p._id === item.id);
        if (!existing) throw new Error('Product not found');
        const newStock = Math.max(0, Number(existing.stock || 0) + qty);
        const history = Array.isArray(existing.stockHistory) ? [...existing.stockHistory] : [];
        history.push({
          adjustment: qty,
          newStock,
          reason: 'Réapprovisionnement automatique',
          date: new Date().toISOString(),
          adminId: userId || 'Admin',
        });
        updated = demoStore.updateProduct(item.id, { stock: newStock, stockHistory: history });
      } else {
        updated = await productService.adjustStock(
          item.id,
          qty,
          userId,
          'Réapprovisionnement automatique'
        );
      }
      results.push({
        id: item.id,
        name: item.name,
        success: true,
        added: qty,
        newStock: updated.stock,
      });
    } catch (error) {
      results.push({
        id: item.id,
        name: item.name,
        success: false,
        error: error.message,
      });
    }
  }

  return {
    results,
    summary: `${results.filter((r) => r.success).length}/${targets.length} réapprovisionné(s)`,
  };
};

module.exports = {
  getOverview,
  getMovements,
  updateThresholds,
  bulkReorder,
  enrichProductStock,
};
