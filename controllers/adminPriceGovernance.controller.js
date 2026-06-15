const svc = require('../services/adminPriceGovernance.service');

exports.getPack = async (req, res) => {
  try {
    res.json(await svc.getPack());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getPolicy = async (req, res) => {
  try {
    res.json(await svc.getPolicyRecord());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.patchPolicy = async (req, res) => {
  try {
    res.json(await svc.updatePolicy(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.patchProductPrice = async (req, res) => {
  try {
    const { price, discount, reason } = req.body || {};
    const actorName = req.user?.name || req.user?.email || 'Administrateur';
    const result = await svc.updateProductPrice(req.params.productId, price, discount, actorName, reason);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.approvePending = async (req, res) => {
  try {
    const actorName = req.user?.name || req.user?.email || 'Administrateur';
    res.json(await svc.approvePending(req.params.id, actorName));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.rejectPending = async (req, res) => {
  try {
    const actorName = req.user?.name || req.user?.email || 'Administrateur';
    res.json(await svc.rejectPending(req.params.id, actorName, req.body?.reason));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.bulkUpdate = async (req, res) => {
  try {
    const actorName = req.user?.name || req.user?.email || 'Administrateur';
    res.json(await svc.bulkUpdate({ ...req.body, actorName }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.verifyAll = async (req, res) => {
  try {
    const actorName = req.user?.name || req.user?.email || 'Administrateur';
    res.json(await svc.verifyAll(actorName));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.exportPrices = async (_req, res) => {
  try {
    res.json(await svc.exportPrices());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.importPrices = async (req, res) => {
  try {
    const actorName = req.user?.name || req.user?.email || 'Administrateur';
    const rows = req.body?.rows || req.body?.products || req.body;
    res.json(await svc.importPrices(rows, actorName));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};
