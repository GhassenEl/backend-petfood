const moderator = require('../services/ecosystem/moderator.service');

const handle = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    if (result !== undefined) res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur modération' });
  }
};

module.exports = {
  getDashboard: handle(() => moderator.getDashboard()),
  getAnalytics: handle(() => moderator.getAnalytics()),
  listUsers: handle(() => moderator.listUsers()),
  suspendUser: handle((req) => moderator.suspendUser(req, req.params.id)),
  reactivateUser: handle((req) => moderator.reactivateUser(req, req.params.id)),
  flagUser: handle((req) => moderator.flagUser(req, req.params.id, req.body?.reason)),
  listVendors: handle(() => moderator.listVendors()),
  approveVendor: handle((req) => moderator.approveVendor(req, req.params.id)),
  verifyVendor: handle((req) => moderator.verifyVendor(req, req.params.id)),
  suspendVendor: handle((req) => moderator.suspendVendor(req, req.params.id)),
  listPendingProducts: handle(() => moderator.listPendingProducts()),
  approveProduct: handle((req) => moderator.approveProduct(req, req.params.id)),
  rejectProduct: handle((req) => moderator.rejectProduct(req, req.params.id)),
  listFlaggedContent: handle(() => moderator.listFlaggedContent()),
  deleteContent: handle((req) => moderator.deleteContent(req, req.params.id)),
  approveImage: handle((req) => moderator.approveImage(req, req.params.productId)),
  listDisputes: handle(() => moderator.listDisputes()),
  resolveDispute: handle((req) =>
    moderator.resolveDispute(req, req.params.id, req.body?.resolution)),
  listFakeReviews: handle(() => moderator.listFakeReviews()),
  rejectReview: handle((req) => moderator.rejectReview(req, req.params.id)),
  clearReview: handle((req) => moderator.clearReview(req, req.params.id)),
  getRealtimeStats: handle(() => moderator.getRealtimeStats()),
  getBiDashboard: handle((req) => moderator.getBiDashboard(req.query?.days)),
  getNlpInsights: handle(() => moderator.getNlpInsights()),
};
