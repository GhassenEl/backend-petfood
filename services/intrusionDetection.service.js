const { randomUUID } = require('crypto');

const MAX_EVENTS = 300;
const events = [];
const ipCounters = new Map();
const failedLogins = new Map();

const SCANNER_UA = /sqlmap|nikto|nmap|masscan|acunetix|burp|dirbuster|wpscan|havij|zgrab/i;
const PATH_TRAVERSAL = /\.\.(\/|\\|%2f|%5c)/i;
const SQL_IN_URL = /\b(union\s+select|select\s+.+\s+from|insert\s+into|drop\s+table|or\s+1\s*=\s*1)\b/i;
const XSS_IN_URL = /<\s*script|javascript\s*:|onerror\s*=/i;
const ADMIN_PROBE = /^\/api\/(admin|users\/admin)/i;

const WINDOW_MS = 60 * 1000;
const MAX_REQ_PER_WINDOW = 120;

const pushEvent = (event) => {
  const row = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...event,
  };
  events.unshift(row);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  return row;
};

const trackRequestRate = (ip) => {
  if (!ip) return null;
  const now = Date.now();
  const bucket = ipCounters.get(ip) || { count: 0, windowStart: now };
  if (now - bucket.windowStart > WINDOW_MS) {
    bucket.count = 0;
    bucket.windowStart = now;
  }
  bucket.count += 1;
  ipCounters.set(ip, bucket);
  if (bucket.count > MAX_REQ_PER_WINDOW) {
    return {
      type: 'rate_limit',
      severity: 'high',
      label: 'Débit anormal (possible DDoS / scan)',
      detail: `${bucket.count} requêtes/min depuis ${ip}`,
    };
  }
  return null;
};

const analyzeRequest = (req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const url = String(req.originalUrl || req.url || '');
  const ua = String(req.headers['user-agent'] || '');
  const alerts = [];

  const rateAlert = trackRequestRate(ip);
  if (rateAlert) alerts.push(rateAlert);

  if (SCANNER_UA.test(ua)) {
    alerts.push({
      type: 'scanner',
      severity: 'critical',
      label: 'Outil de scan détecté',
      detail: ua.slice(0, 120),
    });
  }

  if (PATH_TRAVERSAL.test(url)) {
    alerts.push({
      type: 'path_traversal',
      severity: 'critical',
      label: 'Tentative path traversal',
      detail: url.slice(0, 160),
    });
  }

  if (SQL_IN_URL.test(url)) {
    alerts.push({
      type: 'sql_injection',
      severity: 'high',
      label: 'Injection SQL dans URL',
      detail: url.slice(0, 160),
    });
  }

  if (XSS_IN_URL.test(url)) {
    alerts.push({
      type: 'xss',
      severity: 'high',
      label: 'XSS dans URL',
      detail: url.slice(0, 160),
    });
  }

  if (ADMIN_PROBE.test(url) && !req.user) {
    alerts.push({
      type: 'admin_probe',
      severity: 'medium',
      label: 'Sonde endpoint admin sans auth',
      detail: url.slice(0, 160),
    });
  }

  return { ip, alerts };
};

const recordIntrusion = ({
  alerts = [],
  source = 'ids',
  ip = null,
  userId = null,
  path = null,
  method = null,
  blocked = false,
} = {}) => {
  if (!alerts.length) return [];
  return alerts.map((alert) =>
    pushEvent({
      category: 'intrusion',
      source,
      ip,
      userId,
      path,
      method,
      blocked,
      type: alert.type,
      severity: alert.severity,
      label: alert.label,
      detail: alert.detail,
      snippet: alert.detail,
    })
  );
};

const recordFailedLogin = (ip, email = '') => {
  const key = ip || 'unknown';
  const bucket = failedLogins.get(key) || { count: 0, lastAt: null };
  bucket.count += 1;
  bucket.lastAt = new Date().toISOString();
  failedLogins.set(key, bucket);

  let severity = 'low';
  if (bucket.count >= 10) severity = 'critical';
  else if (bucket.count >= 5) severity = 'high';
  else if (bucket.count >= 3) severity = 'medium';

  if (bucket.count >= 3) {
    return recordIntrusion({
      alerts: [{
        type: 'brute_force',
        severity,
        label: 'Tentatives de connexion échouées',
        detail: `${bucket.count} échecs depuis ${key}${email ? ` (${email})` : ''}`,
      }],
      source: 'auth_login',
      ip: key,
      path: '/api/auth/login',
      method: 'POST',
      blocked: bucket.count >= 10,
    });
  }
  return [];
};

const resetFailedLogin = (ip) => {
  if (ip) failedLogins.delete(ip);
};

const listIntrusionEvents = (limit = 50) =>
  events.slice(0, Math.min(limit, MAX_EVENTS));

const getIdsStatus = () => {
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const recent = events.filter((e) => new Date(e.at).getTime() >= last24h);
  const bySeverity = recent.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});

  return {
    engine: 'PetfoodTN IDS v1',
    enabled: process.env.IDS_ENABLED !== 'false',
    blockingEnabled: process.env.BLOCK_INTRUSIONS === 'true',
    totalEvents: events.length,
    eventsLast24h: recent.length,
    bySeverity,
    monitoredIps: ipCounters.size,
    failedLoginIps: failedLogins.size,
    lastEventAt: events[0]?.at || null,
  };
};

module.exports = {
  analyzeRequest,
  recordIntrusion,
  recordFailedLogin,
  resetFailedLogin,
  listIntrusionEvents,
  getIdsStatus,
};
