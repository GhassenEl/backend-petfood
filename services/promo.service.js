const { prisma } = require('../prismaClient');

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const throwError = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const computeDiscount = (promo, subtotal) => {
  const amount = Number(subtotal || 0);
  if (amount <= 0) return 0;

  let discount = 0;
  if (promo.discountType === 'fixed') {
    discount = Number(promo.discountValue || 0);
  } else {
    discount = amount * (Number(promo.discountValue || 0) / 100);
    if (promo.maxDiscount != null && promo.maxDiscount > 0) {
      discount = Math.min(discount, Number(promo.maxDiscount));
    }
  }

  return Number(Math.min(discount, amount).toFixed(2));
};

const isPromoValidNow = (promo, subtotal) => {
  if (!promo || !promo.isActive) {
    return { ok: false, reason: 'Code promo invalide ou inactif' };
  }

  const now = new Date();
  if (promo.validFrom && now < new Date(promo.validFrom)) {
    return { ok: false, reason: 'Ce code promo n\'est pas encore actif' };
  }
  if (promo.validUntil && now > new Date(promo.validUntil)) {
    return { ok: false, reason: 'Ce code promo a expiré' };
  }
  if (Number(subtotal || 0) < Number(promo.minOrderAmount || 0)) {
    return {
      ok: false,
      reason: `Montant minimum : ${Number(promo.minOrderAmount).toFixed(2)} DT`,
    };
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return { ok: false, reason: 'Ce code promo a atteint sa limite d\'utilisation' };
  }

  return { ok: true };
};

const listPromotions = async () => {
  return prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
  });
};

const createPromotion = async (payload) => {
  const code = normalizeCode(payload.code);
  if (!code) throwError('Le code promo est obligatoire');
  if (!payload.discountValue || Number(payload.discountValue) <= 0) {
    throwError('La valeur de réduction doit être positive');
  }

  const discountType = payload.discountType === 'fixed' ? 'fixed' : 'percent';
  if (discountType === 'percent' && Number(payload.discountValue) > 100) {
    throwError('Le pourcentage ne peut pas dépasser 100 %');
  }

  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) throwError('Ce code promo existe déjà', 409);

  return prisma.promoCode.create({
    data: {
      code,
      label: payload.label?.trim() || null,
      discountType,
      discountValue: Number(payload.discountValue),
      minOrderAmount: Number(payload.minOrderAmount || 0),
      maxDiscount: payload.maxDiscount != null && payload.maxDiscount !== ''
        ? Number(payload.maxDiscount)
        : null,
      maxUses: payload.maxUses != null && payload.maxUses !== ''
        ? Number(payload.maxUses)
        : null,
      validFrom: payload.validFrom ? new Date(payload.validFrom) : null,
      validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
      isActive: payload.isActive !== false,
    },
  });
};

const updatePromotion = async (id, payload) => {
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo) throwError('Code promo introuvable', 404);

  const data = {};
  if (payload.label !== undefined) data.label = payload.label?.trim() || null;
  if (payload.discountType !== undefined) {
    data.discountType = payload.discountType === 'fixed' ? 'fixed' : 'percent';
  }
  if (payload.discountValue !== undefined) {
    const val = Number(payload.discountValue);
    if (!val || val <= 0) throwError('La valeur de réduction doit être positive');
    const type = data.discountType || promo.discountType;
    if (type === 'percent' && val > 100) throwError('Le pourcentage ne peut pas dépasser 100 %');
    data.discountValue = val;
  }
  if (payload.minOrderAmount !== undefined) data.minOrderAmount = Number(payload.minOrderAmount || 0);
  if (payload.maxDiscount !== undefined) {
    data.maxDiscount = payload.maxDiscount != null && payload.maxDiscount !== ''
      ? Number(payload.maxDiscount)
      : null;
  }
  if (payload.maxUses !== undefined) {
    data.maxUses = payload.maxUses != null && payload.maxUses !== ''
      ? Number(payload.maxUses)
      : null;
  }
  if (payload.validFrom !== undefined) {
    data.validFrom = payload.validFrom ? new Date(payload.validFrom) : null;
  }
  if (payload.validUntil !== undefined) {
    data.validUntil = payload.validUntil ? new Date(payload.validUntil) : null;
  }
  if (payload.isActive !== undefined) data.isActive = !!payload.isActive;

  if (payload.code !== undefined) {
    const code = normalizeCode(payload.code);
    if (!code) throwError('Le code promo est obligatoire');
    if (code !== promo.code) {
      const dup = await prisma.promoCode.findUnique({ where: { code } });
      if (dup) throwError('Ce code promo existe déjà', 409);
      data.code = code;
    }
  }

  return prisma.promoCode.update({ where: { id }, data });
};

const togglePromotion = async (id) => {
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo) throwError('Code promo introuvable', 404);
  return prisma.promoCode.update({
    where: { id },
    data: { isActive: !promo.isActive },
  });
};

const deletePromotion = async (id) => {
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo) throwError('Code promo introuvable', 404);

  const used = await prisma.order.count({ where: { promoCodeId: id } });
  if (used > 0) {
    throwError('Impossible de supprimer : ce code a déjà été utilisé. Désactivez-le plutôt.');
  }

  await prisma.promoCode.delete({ where: { id } });
  return { ok: true };
};

const validatePromoCode = async (code, subtotal) => {
  const normalized = normalizeCode(code);
  if (!normalized) throwError('Code promo requis');

  const promo = await prisma.promoCode.findUnique({ where: { code: normalized } });
  const check = isPromoValidNow(promo, subtotal);
  if (!check.ok) throwError(check.reason);

  const discount = computeDiscount(promo, subtotal);
  const finalTotal = Number(Math.max(0, Number(subtotal) - discount).toFixed(2));

  return {
    valid: true,
    code: promo.code,
    label: promo.label,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    discount,
    subtotal: Number(Number(subtotal).toFixed(2)),
    finalTotal,
    promoId: promo.id,
  };
};

const resolvePromoForOrder = async (promoCode, subtotal) => {
  if (!promoCode) {
    return { promoDiscount: 0, promoRecord: null, promoCodeText: null };
  }

  const result = await validatePromoCode(promoCode, subtotal);
  const promoRecord = await prisma.promoCode.findUnique({ where: { id: result.promoId } });

  return {
    promoDiscount: result.discount,
    promoRecord,
    promoCodeText: result.code,
  };
};

const incrementPromoUsage = async (promoId) => {
  if (!promoId) return;
  await prisma.promoCode.update({
    where: { id: promoId },
    data: { usedCount: { increment: 1 } },
  });
};

module.exports = {
  listPromotions,
  createPromotion,
  updatePromotion,
  togglePromotion,
  deletePromotion,
  validatePromoCode,
  resolvePromoForOrder,
  incrementPromoUsage,
  computeDiscount,
  normalizeCode,
};
