const promoService = require('../services/promo.service');

const handleError = (res, error, fallback = 500) => {
  res.status(error.status || fallback).json({ error: error.message });
};

const list = async (req, res) => {
  try {
    const rows = await promoService.listPromotions();
    res.json(rows);
  } catch (error) {
    handleError(res, error);
  }
};

const listActive = async (req, res) => {
  try {
    const now = new Date();
    const rows = await promoService.listPromotions();
    const active = rows.filter((p) => {
      if (!p.isActive) return false;
      if (p.validFrom && now < new Date(p.validFrom)) return false;
      if (p.validUntil && now > new Date(p.validUntil)) return false;
      if (p.maxUses != null && p.usedCount >= p.maxUses) return false;
      return true;
    });
    res.json(active);
  } catch (error) {
    handleError(res, error);
  }
};

const create = async (req, res) => {
  try {
    const row = await promoService.createPromotion(req.body);
    res.status(201).json(row);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const update = async (req, res) => {
  try {
    const row = await promoService.updatePromotion(req.params.id, req.body);
    res.json(row);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const toggle = async (req, res) => {
  try {
    const row = await promoService.togglePromotion(req.params.id);
    res.json(row);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const remove = async (req, res) => {
  try {
    const result = await promoService.deletePromotion(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const validate = async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    const result = await promoService.validatePromoCode(code, subtotal);
    res.json(result);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const productPromoService = require('../services/productPromo.service');

const listProducts = async (req, res) => {
  try {
    const rows = await productPromoService.listProductPromotions();
    res.json(rows);
  } catch (error) {
    handleError(res, error);
  }
};

const updateProductPromo = async (req, res) => {
  try {
    const row = await productPromoService.updateProductPromotion(req.params.productId, req.body);
    res.json(row);
  } catch (error) {
    handleError(res, error, 400);
  }
};

const bulkProductPromos = async (req, res) => {
  try {
    const results = await productPromoService.bulkUpdateProductPromotions(req.body);
    res.json({ results });
  } catch (error) {
    handleError(res, error, 400);
  }
};

const clearProductPromos = async (req, res) => {
  try {
    const results = await productPromoService.clearProductPromotions(req.body?.productIds);
    res.json({ results });
  } catch (error) {
    handleError(res, error, 400);
  }
};

module.exports = {
  list,
  listActive,
  create,
  update,
  toggle,
  remove,
  validate,
  listProducts,
  updateProductPromo,
  bulkProductPromos,
  clearProductPromos,
};
