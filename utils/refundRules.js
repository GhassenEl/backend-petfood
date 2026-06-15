/** Règles métier remboursements — alignées sur le frontend refundDemoData. */

const NO_RETURN_REASON_CATEGORIES = ['late_delivery'];

const isNoReturnRefund = (reasonCategory) =>
  NO_RETURN_REASON_CATEGORIES.includes(reasonCategory);

const DEFAULT_POLICY = {
  returnWindowDays: 14,
  refundProcessingDays: 5,
  moderatorEscalationDays: 3,
  autoRefundThresholdDt: 50,
  requirePhotoEvidence: true,
  partialRefundEnabled: true,
  allowChangedMind: false,
  vendorMustConfirmReceipt: true,
  lateDeliveryGraceDays: 2,
  lateDeliveryAutoApprove: true,
  lateDeliveryMaxDays: 30,
};

const isLateDeliveryEligible = (delayDays, policy) => {
  const grace = policy.lateDeliveryGraceDays ?? 2;
  const max = policy.lateDeliveryMaxDays ?? 30;
  return delayDays >= grace && delayDays <= max;
};

const serializeRefund = (row) => ({
  id: row.id,
  orderId: row.orderRef,
  clientName: row.clientName,
  vendorName: row.vendorName,
  productName: row.productName,
  amount: row.amount,
  reason: row.reason,
  reasonCategory: row.reasonCategory,
  delayDays: row.delayDays ?? undefined,
  noReturnRequired: row.noReturnRequired,
  status: row.status,
  returnReceived: row.returnReceived,
  returnReceivedAt: row.returnReceivedAt?.toISOString?.() || row.returnReceivedAt,
  fraudScore: row.fraudScore,
  disputed: row.disputed,
  createdAt: row.createdAt?.toISOString?.() || row.createdAt,
  updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
  history: (row.history || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((h) => ({
      at: h.createdAt?.toISOString?.() || h.createdAt,
      action: h.action,
      actor: h.actor,
      actorRole: h.actorRole,
      note: h.note || '',
    })),
});

module.exports = {
  NO_RETURN_REASON_CATEGORIES,
  isNoReturnRefund,
  DEFAULT_POLICY,
  isLateDeliveryEligible,
  serializeRefund,
};
