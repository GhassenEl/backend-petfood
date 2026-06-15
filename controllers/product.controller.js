const { isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const productService = require('../services/product.service');
const { getPetRecommendations } = require('../services/petRecommendation.service');

const handleError = (res, error, defaultStatus = 500) => {
  return res.status(error.status || defaultStatus).json({ error: error.message });
};

const getProducts = async (req, res) => {
  try {
    if (isDemoMode()) {
      const products = demoStore.getProducts();
      const priceSvc = require('../services/adminPriceGovernance.service');
      const policy = await priceSvc.getPolicyRecord();
      return res.json(products.map((p) => priceSvc.enrichProductForClient(p, policy, null)));
    }

    const products = await productService.getProducts();
    try {
      const priceSvc = require('../services/adminPriceGovernance.service');
      const policy = await priceSvc.getPolicyRecord();
      const logs = await priceSvc.listLogs(500);
      const logByProduct = new Map();
      logs.forEach((l) => {
        if (l.status === 'applied' && l.verifiedAt) logByProduct.set(l.productId, l);
      });
      return res.json(products.map((p) => {
        const id = p.id || p._id;
        return priceSvc.enrichProductForClient(p, policy, logByProduct.get(id));
      }));
    } catch {
      return res.json(products);
    }
  } catch (error) {
    handleError(res, error);
  }
};

const createProduct = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.status(201).json(demoStore.createProduct(req.body));
    }

    const product = await productService.createProduct(req.body);
    res.status(201).json(product);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const updateProduct = async (req, res) => {
  try {
    if (isDemoMode()) {
      const product = demoStore.updateProduct(req.params.id, req.body);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.json(product);
    }

    const product = await productService.updateProduct(req.params.id, req.body);
    res.json(product);
  } catch (error) {
    handleError(res, error, error.code === 'P2025' ? 404 : 400);
  }
};

const deleteProduct = async (req, res) => {
  try {
    if (isDemoMode()) {
      const product = demoStore.deleteProduct(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      return res.json({ message: 'Product deleted' });
    }

    await productService.deleteProduct(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    handleError(res, error, error.code === 'P2025' ? 404 : 500);
  }
};

const getRecommendations = async (req, res) => {
  try {
    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const scored = all.map((p) => ({
        ...p,
        score: Math.random(),
        recommendedReason: p.discount > 0 ? `-${p.discount}%` : 'Recommandé pour vous'
      })).sort((a, b) => b.score - a.score);
      return res.json(scored.slice(0, 8));
    }

    const recommendations = await productService.getRecommendations(req.user);
    res.json(recommendations);
  } catch (error) {
    handleError(res, error);
  }
};

const getPetProductRecommendations = async (req, res) => {
  try {
    const petId = req.query.petId || null;
    const limit = Math.min(Number(req.query.limit) || 8, 20);

    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const user = demoStore.getUserById(req.user._id) || req.user;
      const petType = user?.petType || 'dog';
      const scored = all
        .map((p) => ({
          ...p,
          score: p.animalType === petType ? 0.9 : 0.3,
          recommendedReason: p.animalType === petType ? `🐾 Pour votre ${petType}` : 'Produit populaire',
          petName: 'Mon animal',
        }))
        .sort((a, b) => b.score - a.score);
      return res.json({
        pets: [{ id: 'demo', name: 'Mon animal', type: petType, emoji: '🐾' }],
        recommendations: scored.slice(0, limit),
      });
    }

    const result = await getPetRecommendations(req.user, { petId, limit });
    const mlBoosted = Boolean(result?.recommendations?.some((r) => r.mlBoosted));
    res.json({
      ...result,
      mlPowered: mlBoosted,
      modelsUsed: mlBoosted ? ['xgboost', 'rules', 'groq'] : ['rules', 'groq'],
    });
  } catch (error) {
    handleError(res, error);
  }
};

const getNearbyProducts = async (req, res) => {
  try {
    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const nearby = all.slice(0, 6).map((p) => ({
        ...p,
        distance: Math.round(Math.random() * 5 + 1),
        recommendedReason: `À ${Math.round(Math.random() * 5 + 1)}km de chez vous`
      })).sort((a, b) => a.distance - b.distance);
      return res.json(nearby);
    }

    const nearby = await productService.getNearbyProducts();
    res.json(nearby);
  } catch (error) {
    handleError(res, error);
  }
};

const adjustStock = async (req, res) => {
  try {
    const adjustment = Number(req.body.adjustment);
    const reason = req.body.reason || 'Ajustement manuel';
    if (!Number.isFinite(adjustment) || adjustment === 0) {
      return res.status(400).json({ error: 'Adjustment must be a non-zero number' });
    }

    if (isDemoMode()) {
      const existing = demoStore.getProducts().find((entry) => entry._id === req.params.id);
      if (!existing) return res.status(404).json({ error: 'Product not found' });
      const newStock = Math.max(0, Number(existing.stock || 0) + adjustment);
      const product = demoStore.updateProduct(req.params.id, { stock: newStock });
      return res.json({ message: 'Stock ajusté', product, adjustment: req.body.adjustment, reason });
    }

    const updated = await productService.adjustStock(req.params.id, adjustment, req.user.id || req.user._id, reason);
    res.json({ message: `Stock ajusté: ${adjustment > 0 ? '+' : ''}${adjustment} (${updated.stock} restant)`, product: updated, adjustment, reason });
  } catch (error) {
    handleError(res, error, error.status || 400);
  }
};

const getLowStock = async (req, res) => {
  try {
    if (isDemoMode()) {
      const threshold = Number(req.query.threshold) || 10;
      const products = demoStore.getProducts().filter((p) => p.stock < threshold && p.stock >= 0);
      return res.json(products);
    }

    const threshold = Number(req.query.threshold) || 10;
    const products = await productService.getLowStock(threshold);
    res.json(products);
  } catch (error) {
    handleError(res, error);
  }
};

const bulkUpdateStock = async (req, res) => {
  try {
    if (isDemoMode()) {
      const results = req.body.updates.map((up) => {
        const p = demoStore.updateProduct(up.id, { stock: up.stock });
        return p ? { id: up.id, success: true, newStock: p.stock } : { id: up.id, success: false };
      });
      return res.json({ results, summary: `${results.filter((r) => r.success).length}/${req.body.updates.length} mis à jour` });
    }

    const results = await productService.bulkUpdateStock(req.body.updates || []);
    const successCount = results.filter((r) => r.success).length;
    res.json({ results, summary: `${successCount}/${req.body.updates.length} mis à jour` });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecommendations,
  getPetProductRecommendations,
  getNearbyProducts,
  adjustStock,
  getLowStock,
  bulkUpdateStock
};