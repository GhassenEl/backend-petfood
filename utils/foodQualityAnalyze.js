/**
 * Analyse qualité croquettes — même logique que src/utils/foodQualityEngine.js
 */

const QUALITY_LABELS = {
  good: { label: 'Bonne', color: '#059669', icon: '✅' },
  warning: { label: 'À surveiller', color: '#d97706', icon: '⚠️' },
  bad: { label: 'Mauvaise', color: '#dc2626', icon: '🚫' },
};

function analyzeFoodQuality({
  avgR = 140,
  avgG = 110,
  avgB = 70,
  moldPixelRatio = 0,
  insectPixelRatio = 0,
  stockLevelPct,
  temperatureC = 22,
  humidityPct = 45,
  lidOpen = false,
  darkSpotRatio = 0,
} = {}) {
  const mold = moldPixelRatio || darkSpotRatio;
  let score = 92;

  if (temperatureC > 28) score -= 35;
  else if (temperatureC > 25) score -= 18;
  else if (temperatureC > 22) score -= 8;
  else if (temperatureC < 10) score -= 5;

  if (humidityPct > 70) score -= 30;
  else if (humidityPct > 60) score -= 15;
  else if (humidityPct < 25) score -= 5;

  const colorIndex = (avgG - avgR * 0.3) / 255;
  if (colorIndex > 0.35) score -= 20;
  if (avgR < 80 && avgG > 100) score -= 25;

  if (mold > 0.12) score -= 40;
  else if (mold > 0.06) score -= 22;
  else if (mold > 0.03) score -= 10;

  if (insectPixelRatio > 0.025) score -= 35;
  else if (insectPixelRatio > 0.012) score -= 18;

  if (lidOpen) score -= 12;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let quality = 'good';
  if (score < 50) quality = 'bad';
  else if (score < 75) quality = 'warning';

  const meta = QUALITY_LABELS[quality];
  const aiSummary =
    quality === 'bad'
      ? `Qualité mauvaise (${score}/100) — ne pas servir.`
      : quality === 'warning'
        ? `Qualité limite (${score}/100) — temp ${temperatureC} °C, HR ${humidityPct} %.`
        : `Qualité bonne (${score}/100) — conservation optimale.`;

  return {
    quality,
    qualityScore: score,
    label: meta.label,
    color: meta.color,
    icon: meta.icon,
    state: quality === 'good' ? 'Frais' : quality === 'warning' ? 'Limite' : 'Altéré',
    avgR: Math.round(avgR),
    avgG: Math.round(avgG),
    avgB: Math.round(avgB),
    moldPixelRatio: Math.round(mold * 1000) / 1000,
    insectPixelRatio: Math.round((insectPixelRatio || 0) * 1000) / 1000,
    stockLevelPct: stockLevelPct != null ? Math.round(stockLevelPct) : undefined,
    temperatureC: Math.round(temperatureC * 10) / 10,
    humidityPct: Math.round(humidityPct),
    lidOpen: Boolean(lidOpen),
    colorIndex: Math.round(colorIndex * 100) / 100,
    aiSummary,
    analyzedAt: new Date().toISOString(),
    source: 'esp32-cam',
  };
}

module.exports = { analyzeFoodQuality, QUALITY_LABELS };
