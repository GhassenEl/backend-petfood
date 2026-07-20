const { randomUUID } = require('crypto');
const { prisma, isDemoMode } = require('../prismaClient');
const {
  PERMISSION_CATALOG,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  sanitizePermissions,
} = require('../config/permissionCatalog');

/** Store mémoire (demo + fallback si table absente). */
const memoryRoles = new Map();

const slugify = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

const parsePerms = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const serialize = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    description: row.description || '',
    permissions: parsePerms(row.permissions),
    homeRoute: row.homeRoute || '/admin/dashboard',
    basedOn: row.basedOn || null,
    isSystem: Boolean(row.isSystem),
    isActive: row.isActive !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const systemRoleViews = () =>
  SYSTEM_ROLES.map((r) => ({
    id: `system_${r.slug}`,
    slug: r.slug,
    label: r.label,
    description: 'Rôle système PetfoodTN (non supprimable).',
    permissions: SYSTEM_ROLE_PERMISSIONS[r.slug] || [],
    homeRoute: r.homeRoute,
    basedOn: null,
    isSystem: true,
    isActive: true,
    createdAt: null,
    updatedAt: null,
  }));

async function dbAvailable() {
  if (isDemoMode()) return false;
  try {
    await prisma.customRole.findMany({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

async function listCustomFromStore() {
  if (await dbAvailable()) {
    const rows = await prisma.customRole.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(serialize);
  }
  return [...memoryRoles.values()].map(serialize);
}

async function listRoles() {
  const custom = await listCustomFromStore();
  return [...systemRoleViews(), ...custom];
}

async function getRoleBySlug(slug) {
  const key = String(slug || '').trim();
  if (!key) return null;
  const system = systemRoleViews().find((r) => r.slug === key);
  if (system) return system;
  if (await dbAvailable()) {
    const row = await prisma.customRole.findUnique({ where: { slug: key } });
    return serialize(row);
  }
  return serialize(memoryRoles.get(key) || null);
}

async function getPermissionsForRole(slug) {
  const role = await getRoleBySlug(slug);
  if (!role) return [];
  if (role.permissions.includes('*')) return ['*'];
  return role.permissions;
}

async function roleHasPermission(slug, permissionKey) {
  const perms = await getPermissionsForRole(slug);
  if (perms.includes('*')) return true;
  return perms.includes(permissionKey);
}

async function createRole(body = {}) {
  const label = String(body.label || '').trim();
  if (!label) {
    const err = new Error('Le libellé du rôle est obligatoire.');
    err.status = 400;
    throw err;
  }

  let slug = slugify(body.slug || label);
  if (!slug) {
    const err = new Error('Slug invalide.');
    err.status = 400;
    throw err;
  }

  const reserved = new Set(SYSTEM_ROLES.map((r) => r.slug));
  if (reserved.has(slug)) {
    const err = new Error(`Le slug « ${slug} » est réservé à un rôle système.`);
    err.status = 409;
    throw err;
  }

  const existing = await getRoleBySlug(slug);
  if (existing && !existing.isSystem) {
    const err = new Error(`Un rôle « ${slug} » existe déjà.`);
    err.status = 409;
    throw err;
  }

  let permissions = sanitizePermissions(body.permissions);
  if (body.basedOn && SYSTEM_ROLE_PERMISSIONS[body.basedOn] && permissions.length === 0) {
    permissions = sanitizePermissions(SYSTEM_ROLE_PERMISSIONS[body.basedOn].filter((p) => p !== '*'));
  }

  const now = new Date();
  const payload = {
    id: randomUUID(),
    slug,
    label,
    description: String(body.description || '').trim(),
    permissions: JSON.stringify(permissions),
    homeRoute: String(body.homeRoute || '/admin/dashboard').trim() || '/admin/dashboard',
    basedOn: body.basedOn ? String(body.basedOn) : null,
    isSystem: false,
    isActive: body.isActive !== false,
    createdAt: now,
    updatedAt: now,
  };

  if (await dbAvailable()) {
    const row = await prisma.customRole.create({
      data: {
        id: payload.id,
        slug: payload.slug,
        label: payload.label,
        description: payload.description,
        permissions: payload.permissions,
        homeRoute: payload.homeRoute,
        basedOn: payload.basedOn,
        isSystem: false,
        isActive: payload.isActive,
      },
    });
    return serialize(row);
  }

  memoryRoles.set(slug, payload);
  return serialize(payload);
}

async function updateRole(idOrSlug, body = {}) {
  const key = String(idOrSlug || '').trim();
  const all = await listCustomFromStore();
  const current = all.find((r) => r.id === key || r.slug === key);
  if (!current) {
    const err = new Error('Rôle introuvable.');
    err.status = 404;
    throw err;
  }
  if (current.isSystem) {
    const err = new Error('Les rôles système ne sont pas modifiables.');
    err.status = 403;
    throw err;
  }

  const nextLabel = body.label != null ? String(body.label).trim() : current.label;
  const nextDesc = body.description != null ? String(body.description).trim() : current.description;
  const nextHome = body.homeRoute != null ? String(body.homeRoute).trim() : current.homeRoute;
  const nextPerms =
    body.permissions != null ? sanitizePermissions(body.permissions) : current.permissions;
  const nextActive = body.isActive != null ? Boolean(body.isActive) : current.isActive;

  if (await dbAvailable()) {
    const row = await prisma.customRole.update({
      where: { id: current.id },
      data: {
        label: nextLabel,
        description: nextDesc,
        homeRoute: nextHome || '/admin/dashboard',
        permissions: JSON.stringify(nextPerms),
        isActive: nextActive,
        basedOn: body.basedOn !== undefined ? body.basedOn || null : current.basedOn,
      },
    });
    return serialize(row);
  }

  const updated = {
    ...current,
    label: nextLabel,
    description: nextDesc,
    homeRoute: nextHome || '/admin/dashboard',
    permissions: nextPerms,
    isActive: nextActive,
    basedOn: body.basedOn !== undefined ? body.basedOn || null : current.basedOn,
    updatedAt: new Date(),
  };
  memoryRoles.set(current.slug, {
    ...updated,
    permissions: JSON.stringify(updated.permissions),
  });
  return updated;
}

async function deleteRole(idOrSlug) {
  const key = String(idOrSlug || '').trim();
  const all = await listCustomFromStore();
  const current = all.find((r) => r.id === key || r.slug === key);
  if (!current) {
    const err = new Error('Rôle introuvable.');
    err.status = 404;
    throw err;
  }
  if (current.isSystem) {
    const err = new Error('Impossible de supprimer un rôle système.');
    err.status = 403;
    throw err;
  }

  if (!isDemoMode()) {
    try {
      const usersWithRole = await prisma.user.count({ where: { role: current.slug } });
      if (usersWithRole > 0) {
        const err = new Error(
          `Ce rôle est assigné à ${usersWithRole} utilisateur(s). Réassignez-les avant suppression.`
        );
        err.status = 409;
        throw err;
      }
    } catch (e) {
      if (e.status) throw e;
    }
  }

  if (await dbAvailable()) {
    await prisma.customRole.delete({ where: { id: current.id } });
    return { ok: true, slug: current.slug };
  }

  memoryRoles.delete(current.slug);
  return { ok: true, slug: current.slug };
}

function getPermissionCatalog() {
  const byModule = {};
  for (const p of PERMISSION_CATALOG) {
    if (!byModule[p.module]) byModule[p.module] = [];
    byModule[p.module].push(p);
  }
  return { permissions: PERMISSION_CATALOG, byModule, systemRoles: SYSTEM_ROLES };
}

module.exports = {
  listRoles,
  getRoleBySlug,
  getPermissionsForRole,
  roleHasPermission,
  createRole,
  updateRole,
  deleteRole,
  getPermissionCatalog,
  serialize,
};
