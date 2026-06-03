const { getClientIp, isIpAllowed, getAllowedCidrs } = require('../utils/vpnAllowlist');

/**
 * Si FEEDER_REQUIRE_VPN=true, les endpoints ESP32 (/feeder/device/*)
 * n'acceptent que les IP du tunnel WireGuard (VPN_ALLOWED_CIDRS).
 */
const feederVpnGate = (req, res, next) => {
  if (process.env.FEEDER_REQUIRE_VPN !== 'true') {
    return next();
  }

  const clientIp = getClientIp(req);
  const allowed = getAllowedCidrs();

  if (isIpAllowed(clientIp, allowed)) {
    return next();
  }

  console.warn(`[feederVpnGate] Refus IP ${clientIp} — réseaux autorisés: ${allowed.join(', ')}`);
  return res.status(403).json({
    error: 'Accès distributeur réservé au réseau VPN',
    hint: 'Connectez l’ESP32 ou la passerelle au tunnel WireGuard PetfoodTN',
  });
};

module.exports = feederVpnGate;
