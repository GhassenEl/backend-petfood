const roles = require('../services/customRoles.service');

const wrap = (fn) => async (req, res) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Erreur rôles' });
  }
};

exports.listRoles = (req, res) => wrap(() => roles.listRoles())(req, res);

exports.getCatalog = (req, res) => wrap(() => roles.getPermissionCatalog())(req, res);

exports.getRole = (req, res) =>
  wrap(async (r) => {
    const role = await roles.getRoleBySlug(r.params.slug);
    if (!role) {
      const err = new Error('Rôle introuvable.');
      err.status = 404;
      throw err;
    }
    return role;
  })(req, res);

exports.createRole = (req, res) => wrap((r) => roles.createRole(r.body))(req, res);

exports.updateRole = (req, res) =>
  wrap((r) => roles.updateRole(r.params.id, r.body))(req, res);

exports.deleteRole = (req, res) => wrap((r) => roles.deleteRole(r.params.id))(req, res);
