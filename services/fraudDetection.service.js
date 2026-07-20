const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

function detectFraudSignals({ orders = [], events = [] } = {}) {
  const alerts = [];
  const byUser = new Map();

  (orders || []).forEach((order) => {
    const total = Number(order.total) || 0;
    const userKey = order.user?.email || order.userId || order.phone || 'unknown';
    const prev = byUser.get(userKey) || { count: 0, total: 0 };
    prev.count += 1;
    prev.total += total;
    byUser.set(userKey, prev);

    if (total >= 500) {
      alerts.push({
        id: `fraud-amt-${order.id || order._id}`,
        type: 'transaction',
        severity: total >= 1000 ? 'critical' : 'high',
        title: 'Montant atypique',
        detail: `Commande ${total.toFixed(2)} DT — seuil dépassé`,
        orderId: order.id || order._id,
        score: total >= 1000 ? 92 : 78,
        suggestedAction: 'Vérifier identité et moyen de paiement',
      });
    }

    if (order.paymentMethod === 'wallet' && total > 300) {
      alerts.push({
        id: `fraud-wallet-${order.id || order._id}`,
        type: 'payment',
        severity: 'medium',
        title: 'Paiement portefeuille élevé',
        detail: `${total.toFixed(2)} DT via wallet`,
        orderId: order.id || order._id,
        score: 65,
        suggestedAction: 'Contrôle solde et historique client',
      });
    }
  });

  byUser.forEach((stats, userKey) => {
    if (stats.count >= 4 && stats.total > 600) {
      alerts.push({
        id: `fraud-burst-${userKey}`,
        type: 'behavior',
        severity: 'high',
        title: 'Rafale de commandes',
        detail: `${stats.count} commandes récentes pour ${userKey}`,
        score: 81,
        suggestedAction: 'Analyser le profil et limiter temporairement',
      });
    }
  });

  (events || []).forEach((ev) => {
    const type = normalize(ev.type || ev.label || '');
    if (type.includes('brute') || type.includes('login_fail')) {
      alerts.push({
        id: `fraud-login-${ev.id || Date.now()}`,
        type: 'auth',
        severity: ev.severity === 'critical' ? 'high' : 'medium',
        title: 'Tentatives de connexion suspectes',
        detail: ev.detail || ev.label || 'Multiples échecs login',
        score: ev.severity === 'critical' ? 85 : 70,
        suggestedAction: 'Activer CAPTCHA / verrouillage compte',
      });
    }
  });

  return alerts.sort((a, b) => (b.score || 0) - (a.score || 0));
}

module.exports = { detectFraudSignals };
