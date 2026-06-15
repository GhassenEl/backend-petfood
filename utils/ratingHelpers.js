const emotionFromRating = (rating) => {
  const r = Math.min(5, Math.max(1, Number(rating) || 3));
  if (r >= 5) return 'happy';
  if (r === 4) return 'satisfied';
  if (r === 3) return 'neutral';
  if (r === 2) return 'disappointed';
  return 'frustrated';
};

const clampRating = (value) => Math.min(5, Math.max(1, Math.round(Number(value) || 1)));

module.exports = { emotionFromRating, clampRating };
