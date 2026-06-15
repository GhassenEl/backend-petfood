const svc = require('../services/adminPartners.service');

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.getOverview = (req, res) => handle(() => svc.getPartnersOverview())(req, res);

exports.getSupplySuppliers = (req, res) => handle(() => svc.listSupplySuppliers())(req, res);

exports.postSupplySupplier = async (req, res) => {
  try {
    const row = await svc.createSupplySupplier(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

exports.patchSupplySupplier = (req, res) =>
  handle(() => svc.updateSupplySupplier(req.params.id, req.body || {}))(req, res);

exports.postShelter = (req, res) => handle(() => svc.upsertShelter(req.body || {}))(req, res);

exports.postRelayPoint = (req, res) => handle(() => svc.upsertRelayPoint(req.body || {}))(req, res);

exports.getAdminVendors = (req, res) => handle(() => svc.listAdminMarketplaceVendors())(req, res);

exports.patchAdminVendor = (req, res) =>
  handle(() => svc.updateMarketplaceVendor(req.params.id, req.body || {}))(req, res);

exports.getAdminMarketplaceStats = (req, res) =>
  handle(async () => {
    const pack = await svc.listAdminMarketplaceVendors();
    return pack.stats;
  })(req, res);
