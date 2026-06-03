/**
 * Vérification IP / CIDR pour accès VPN (endpoints IoT distributeur).
 */

const normalizeIp = (ip) => {
  if (!ip) return null;
  let raw = String(ip).trim();
  if (raw.startsWith('::ffff:')) raw = raw.slice(7);
  if (raw.includes(',')) raw = raw.split(',')[0].trim();
  return raw;
};

const ipv4ToInt = (ip) => {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
};

const parseCidr = (cidr) => {
  const [ipPart, maskPart] = String(cidr).trim().split('/');
  const maskBits = maskPart != null ? Number(maskPart) : 32;
  const base = ipv4ToInt(ipPart);
  if (base == null || Number.isNaN(maskBits) || maskBits < 0 || maskBits > 32) return null;
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return { network: base & mask, mask };
};

const ipInCidr = (ip, cidr) => {
  const parsed = parseCidr(cidr);
  const ipInt = ipv4ToInt(ip);
  if (!parsed || ipInt == null) return false;
  return (ipInt & parsed.mask) === parsed.network;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return normalizeIp(forwarded);
  return normalizeIp(req.socket?.remoteAddress || req.ip);
};

const isIpAllowed = (ip, cidrs = []) => {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (normalized === '127.0.0.1' || normalized === '::1') return true;
  return cidrs.some((c) => c && ipInCidr(normalized, c.trim()));
};

const getAllowedCidrs = () =>
  (process.env.VPN_ALLOWED_CIDRS || '10.13.13.0/24')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
  getClientIp,
  isIpAllowed,
  getAllowedCidrs,
  ipInCidr,
};
