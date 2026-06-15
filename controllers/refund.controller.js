const refundService = require('../services/refund.service');

const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req, res);
    if (result !== undefined) res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur remboursement' });
  }
};

const postRequest = handle(async (req) => {
  const refund = await refundService.createRefundRequest(req, req.body);
  return refund;
});

const getVendorRefunds = handle(async () => {
  const refunds = await refundService.listRefunds({
    status: { notIn: ['cancelled'] },
  });
  return { refunds };
});

const getModeratorRefunds = handle(async () => {
  const refunds = await refundService.listRefunds({
    OR: [
      { disputed: true },
      { status: { in: ['fraud_flagged', 'moderator_review', 'disputed', 'rejected'] } },
    ],
  });
  return { refunds };
});

const getAdminRefunds = handle(async () => {
  const [refunds, policy] = await Promise.all([
    refundService.listRefunds(),
    refundService.getPolicy(),
  ]);
  return { refunds, policy };
});

const getPolicy = handle(async () => refundService.getPolicy());

const patchPolicy = handle(async (req) => refundService.patchPolicy(req.body));

const vendorApprove = handle(async (req) =>
  refundService.vendorApprove(req, req.params.id, req.body?.note));

const vendorReject = handle(async (req) =>
  refundService.vendorReject(req, req.params.id, req.body?.note));

const vendorConfirmReturn = handle(async (req) =>
  refundService.vendorConfirmReturn(req, req.params.id, req.body?.note));

const vendorValidate = handle(async (req) =>
  refundService.vendorValidate(req, req.params.id, req.body?.note));

const vendorMarkRefunded = handle(async (req) =>
  refundService.vendorMarkRefunded(req, req.params.id, req.body?.note));

const moderatorResolve = handle(async (req) =>
  refundService.moderatorResolve(req, req.params.id, req.body?.decision, req.body?.note));

const moderatorFlagFraud = handle(async (req) =>
  refundService.moderatorFlagFraud(req, req.params.id, req.body?.note));

const adminForce = handle(async (req) =>
  refundService.adminForce(req, req.params.id, req.body?.note));

const adminCancel = handle(async (req) =>
  refundService.adminCancel(req, req.params.id, req.body?.note));

module.exports = {
  postRequest,
  getVendorRefunds,
  getModeratorRefunds,
  getAdminRefunds,
  getPolicy,
  patchPolicy,
  vendorApprove,
  vendorReject,
  vendorConfirmReturn,
  vendorValidate,
  vendorMarkRefunded,
  moderatorResolve,
  moderatorFlagFraud,
  adminForce,
  adminCancel,
};
