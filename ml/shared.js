const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const clamp01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));

const daysSince = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

module.exports = { sigmoid, clamp01, daysSince };
