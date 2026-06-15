const { prisma } = require('../prismaClient');
const {
  DEFAULT_POLICY,
  isNoReturnRefund,
  isLateDeliveryEligible,
  serializeRefund,
} = require('../utils/refundRules');

const getActor = (req) => ({
  name: req.user?.name || req.user?.email || 'Utilisateur',
  role: req.user?.role || 'client',
  id: req.user?.id || req.user?._id,
  email: req.user?.email,
});

const resolveClientId = async (req) => {
  const actor = getActor(req);
  if (!actor.id && !actor.email) return null;
  if (actor.id && !String(actor.id).startsWith('demo_')) {
    const byId = await prisma.user.findUnique({ where: { id: actor.id } });
    if (byId) return byId.id;
  }
  if (actor.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: actor.email } });
    if (byEmail) return byEmail.id;
  }
  return null;
};

const ensurePolicy = async () => {
  let policy = await prisma.refundPolicy.findUnique({ where: { id: 'default' } });
  if (!policy) {
    policy = await prisma.refundPolicy.create({ data: { id: 'default', ...DEFAULT_POLICY } });
  }
  return policy;
};

const loadRefund = async (id) => {
  const row = await prisma.refundRequest.findUnique({
    where: { id },
    include: { history: { orderBy: { createdAt: 'desc' } } },
  });
  if (!row) {
    const err = new Error('Demande introuvable');
    err.status = 404;
    throw err;
  }
  return row;
};

const addHistory = async (refundId, { action, actor, actorRole, note = '' }) => {
  await prisma.refundHistoryEntry.create({
    data: { refundId, action, actor, actorRole, note },
  });
  await prisma.refundRequest.update({
    where: { id: refundId },
    data: { updatedAt: new Date() },
  });
};

const listRefunds = async (where = {}) => {
  const rows = await prisma.refundRequest.findMany({
    where,
    include: { history: { orderBy: { createdAt: 'desc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(serializeRefund);
};

const createRefundRequest = async (req, body) => {
  const policy = await ensurePolicy();
  const actor = getActor(req);
  const clientId = await resolveClientId(req);
  const reasonCategory = body.reasonCategory || 'other';
  const noReturn = isNoReturnRefund(reasonCategory);
  const delayDays = reasonCategory === 'late_delivery' ? Number(body.delayDays) || 0 : null;

  let status = 'pending';
  const historyNotes = [body.reason || 'Demande de remboursement'];

  if (reasonCategory === 'late_delivery' && !isLateDeliveryEligible(delayDays, policy)) {
    status = 'rejected';
    historyNotes.push(
      `Retard ${delayDays} j — hors politique (${policy.lateDeliveryGraceDays}–${policy.lateDeliveryMaxDays} j)`,
    );
  }

  const row = await prisma.refundRequest.create({
    data: {
      orderRef: String(body.orderId || '').trim(),
      clientId,
      clientName: body.clientName || actor.name,
      vendorName: body.vendorName || 'Vendeur',
      productName: body.productName || 'Produit',
      amount: Number(body.amount) || 0,
      reason: body.reason || '',
      reasonCategory,
      delayDays,
      noReturnRequired: noReturn,
      status,
      history: {
        create: [
          {
            action: status === 'rejected' ? 'auto_reject_late_delivery' : 'request_created',
            actor: status === 'rejected' ? 'Système' : actor.name,
            actorRole: status === 'rejected' ? 'system' : 'client',
            note: historyNotes.join(' — '),
          },
        ],
      },
    },
    include: { history: { orderBy: { createdAt: 'desc' } } },
  });

  return serializeRefund(row);
};

const vendorApprove = async (req, id, note = '') => {
  const refund = await loadRefund(id);
  const policy = await ensurePolicy();
  const actor = getActor(req);
  const noReturn = refund.noReturnRequired || isNoReturnRefund(refund.reasonCategory);

  const status = noReturn ? 'refund_validated' : 'awaiting_return';
  const action = noReturn ? 'vendor_approved_no_return' : 'vendor_approved';
  const defaultNote =
    noReturn && refund.reasonCategory === 'late_delivery'
      ? 'Retard de livraison confirmé — remboursement sans retour physique'
      : noReturn
        ? 'Demande acceptée — sans retour physique'
        : 'Demande acceptée — retour attendu';

  await prisma.refundRequest.update({
    where: { id },
    data: {
      status,
      noReturnRequired: noReturn || undefined,
      updatedAt: new Date(),
    },
  });
  await addHistory(id, {
    action,
    actor: actor.name,
    actorRole: 'vendor',
    note: note || defaultNote,
  });

  if (policy.lateDeliveryAutoApprove && refund.reasonCategory === 'late_delivery' && noReturn) {
    /* statut déjà refund_validated */
  }

  return serializeRefund(await loadRefund(id));
};

const vendorReject = async (req, id, note = '') => {
  const actor = getActor(req);
  await prisma.refundRequest.update({ where: { id }, data: { status: 'rejected' } });
  await addHistory(id, { action: 'vendor_rejected', actor: actor.name, actorRole: 'vendor', note: note || 'Demande refusée' });
  return serializeRefund(await loadRefund(id));
};

const vendorConfirmReturn = async (req, id, note = '') => {
  const actor = getActor(req);
  await prisma.refundRequest.update({
    where: { id },
    data: { status: 'return_received', returnReceived: true, returnReceivedAt: new Date() },
  });
  await addHistory(id, { action: 'return_received', actor: actor.name, actorRole: 'vendor', note: note || 'Produit retourné reçu' });
  return serializeRefund(await loadRefund(id));
};

const vendorValidate = async (req, id, note = '') => {
  const actor = getActor(req);
  await prisma.refundRequest.update({ where: { id }, data: { status: 'refund_validated' } });
  await addHistory(id, { action: 'refund_validated', actor: actor.name, actorRole: 'vendor', note: note || 'Remboursement validé' });
  return serializeRefund(await loadRefund(id));
};

const vendorMarkRefunded = async (req, id, note = '') => {
  const refund = await loadRefund(id);
  const actor = getActor(req);
  await prisma.refundRequest.update({ where: { id }, data: { status: 'refunded' } });
  await addHistory(id, {
    action: 'refunded',
    actor: actor.name,
    actorRole: 'vendor',
    note: note || `Remboursement ${refund.amount} DT effectué`,
  });
  return serializeRefund(await loadRefund(id));
};

const moderatorResolve = async (req, id, decision, note = '') => {
  const refund = await loadRefund(id);
  const actor = getActor(req);
  const noReturn = refund.noReturnRequired || isNoReturnRefund(refund.reasonCategory);

  let status = refund.status;
  let action = 'moderator_escalate_admin';

  if (decision === 'approve') {
    status = noReturn ? 'refund_validated' : 'moderator_resolved';
    action = noReturn ? 'moderator_approve_no_return' : 'moderator_approve_refund';
    await prisma.refundRequest.update({ where: { id }, data: { status, disputed: false } });
  } else if (decision === 'reject') {
    status = 'rejected';
    action = 'moderator_reject_refund';
    await prisma.refundRequest.update({ where: { id }, data: { status, disputed: false } });
  } else if (decision === 'escalate') {
    status = 'moderator_review';
    action = 'moderator_escalate_admin';
    await prisma.refundRequest.update({ where: { id }, data: { status } });
  }

  await addHistory(id, {
    action,
    actor: actor.name,
    actorRole: 'moderator',
    note:
      note
      || (decision === 'approve'
        ? noReturn
          ? 'Remboursement retard accordé — sans retour'
          : 'Remboursement accordé après litige'
        : decision === 'reject'
          ? 'Demande maintenue refusée'
          : 'Escalade administrateur'),
  });
  return serializeRefund(await loadRefund(id));
};

const moderatorFlagFraud = async (req, id, note = '') => {
  const actor = getActor(req);
  const refund = await loadRefund(id);
  await prisma.refundRequest.update({
    where: { id },
    data: { status: 'fraud_flagged', fraudScore: Math.max(refund.fraudScore || 0, 0.85) },
  });
  await addHistory(id, { action: 'fraud_flagged', actor: actor.name, actorRole: 'moderator', note: note || 'Fraude ou abus confirmé' });
  return serializeRefund(await loadRefund(id));
};

const adminForce = async (req, id, note = '') => {
  const actor = getActor(req);
  await prisma.refundRequest.update({ where: { id }, data: { status: 'admin_forced' } });
  await addHistory(id, { action: 'admin_forced_refund', actor: actor.name, actorRole: 'admin', note: note || 'Remboursement forcé' });
  return serializeRefund(await loadRefund(id));
};

const adminCancel = async (req, id, note = '') => {
  const actor = getActor(req);
  await prisma.refundRequest.update({ where: { id }, data: { status: 'cancelled' } });
  await addHistory(id, { action: 'admin_cancel_transaction', actor: actor.name, actorRole: 'admin', note: note || 'Transaction annulée' });
  return serializeRefund(await loadRefund(id));
};

const getPolicy = async () => {
  const p = await ensurePolicy();
  return {
    ...p,
    updatedAt: p.updatedAt?.toISOString?.() || p.updatedAt,
  };
};

const patchPolicy = async (patch) => {
  const p = await ensurePolicy();
  const updated = await prisma.refundPolicy.update({
    where: { id: 'default' },
    data: { ...patch, updatedAt: new Date() },
  });
  return {
    ...updated,
    updatedAt: updated.updatedAt?.toISOString?.() || updated.updatedAt,
  };
};

module.exports = {
  listRefunds,
  createRefundRequest,
  vendorApprove,
  vendorReject,
  vendorConfirmReturn,
  vendorValidate,
  vendorMarkRefunded,
  moderatorResolve,
  moderatorFlagFraud,
  adminForce,
  adminCancel,
  getPolicy,
  patchPolicy,
  ensurePolicy,
};
