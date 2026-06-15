const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const adminStockService = require('../services/adminStock.service');
const productService = require('../services/product.service');
const { mergeStockMetaIntoTags } = require('../utils/stockMeta');

const handleError = (res, error, defaultStatus = 500) =>
  res.status(error.status || defaultStatus).json({ error: error.message });

exports.getOverview = async (req, res) => {
  try {
    const data = await adminStockService.getOverview();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
};

exports.getMovements = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const movements = await adminStockService.getMovements(limit);
    res.json(movements);
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateThresholds = async (req, res) => {
  try {
    if (isDemoMode()) {
      const existing = demoStore.getProducts().find((p) => p._id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'Product not found' });

      const tags = mergeStockMetaIntoTags(existing.tags, {
        minStock: req.body.minStock !== undefined ? Number(req.body.minStock) : undefined,
        maxStock: req.body.maxStock !== undefined ? Number(req.body.maxStock) : undefined,
        reorderQty: req.body.reorderQty !== undefined ? Number(req.body.reorderQty) : undefined,
        location: req.body.location,
        sku: req.body.sku,
      });
      const product = demoStore.updateProduct(req.params.id, { tags });
      return res.json(adminStockService.enrichProductStock(product));
    }

    const item = await adminStockService.updateThresholds(req.params.id, req.body);
    res.json(item);
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const adjustment = Number(req.body.adjustment);
    const reason = req.body.reason || 'Ajustement manuel';
    if (!Number.isFinite(adjustment) || adjustment === 0) {
      return res.status(400).json({ error: 'Adjustment must be a non-zero number' });
    }

    if (isDemoMode()) {
      const existing = demoStore.getProducts().find((p) => p._id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'Product not found' });

      const newStock = Math.max(0, Number(existing.stock || 0) + adjustment);
      const history = Array.isArray(existing.stockHistory) ? [...existing.stockHistory] : [];
      history.push({
        adjustment,
        newStock,
        reason,
        date: new Date().toISOString(),
        adminId: req.user?.name || req.user?.email || 'Admin',
      });
      const product = demoStore.updateProduct(req.params.id, { stock: newStock, stockHistory: history });
      return res.json({
        message: 'Stock ajusté',
        item: adminStockService.enrichProductStock(product),
        adjustment,
        reason,
      });
    }

    const updated = await productService.adjustStock(
      req.params.id,
      adjustment,
      req.user.id || req.user._id,
      reason
    );
    res.json({
      message: 'Stock ajusté',
      item: adminStockService.enrichProductStock(updated),
      adjustment,
      reason,
    });
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

exports.bulkReorder = async (req, res) => {
  try {
    const productIds = Array.isArray(req.body.productIds) ? req.body.productIds : [];
    const result = await adminStockService.bulkReorder(
      productIds,
      req.user.id || req.user._id || req.user?.email
    );
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};
