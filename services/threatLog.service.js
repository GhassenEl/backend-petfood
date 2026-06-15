const { randomUUID } = require('crypto');

const MAX_ENTRIES = 200;
const entries = [];

const recordThreats = ({
  threats = [],
  source = 'unknown',
  userId = null,
  ip = null,
  blocked = false,
  context = {},
} = {}) => {
  if (!threats.length) return [];

  const logged = threats.map((threat) => {
    const row = {
      id: randomUUID(),
      at: new Date().toISOString(),
      source,
      userId,
      ip,
      blocked,
      context,
      ...threat,
    };
    entries.unshift(row);
    return row;
  });

  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }

  return logged;
};

const listThreats = (limit = 50) => entries.slice(0, Math.min(limit, MAX_ENTRIES));

const getStatus = (signatureCount = 0) => ({
  engine: 'PetfoodTN Threat Scanner v1',
  signatureCount,
  totalThreats: entries.length,
  lastThreatAt: entries[0]?.at || null,
  blockingEnabled: process.env.BLOCK_THREATS !== 'false',
});

module.exports = {
  recordThreats,
  listThreats,
  getStatus,
};
