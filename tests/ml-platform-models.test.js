const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { predictIncidentPriority } = require('../ml/incidentPriorityModel');
const { predictOrderCancelRisk } = require('../ml/orderCancelRiskModel');
const { predictClientChurn } = require('../ml/clientChurnModel');
const { predictProductFit } = require('../ml/productFitModel');
const { buildNodePlatformInsights } = require('../ml/platformInsightsModel');

describe('ML plateforme — tous les rôles', () => {
  it('incident : livraison frustrée → priorité élevée', () => {
    const r = predictIncidentPriority({
      subject: 'Colis perdu',
      message: 'Livraison en retard, je suis frustré, c est urgent',
      priorCount: 2,
      emotion: 'frustrated',
    });
    assert.ok(['high', 'urgent'].includes(r.priority));
    assert.equal(r.category, 'delivery');
  });

  it('commande : gros panier → risque annulation', () => {
    const r = predictOrderCancelRisk({ id: 'o1', total: 620, status: 'pending', createdAt: new Date() }, []);
    assert.ok(r.cancelRisk >= 0.4);
    assert.equal(r.modelId, 'cancel_risk_logistic_v1');
  });

  it('client : inactivité → churn', () => {
    const r = predictClientChurn({
      userId: 'u1',
      orderCount: 1,
      totalSpent: 40,
      lastOrderAt: new Date(Date.now() - 100 * 86400000),
    });
    assert.ok(r.rebuyProbability < 0.55);
    assert.equal(r.modelId, 'churn_logistic_v1');
  });

  it('produit : adéquation chien senior', () => {
    const r = predictProductFit(
      { name: 'Croquettes senior chien 7+', animalType: 'dog', category: 'nourriture', stock: 10, rating_avg: 4.6 },
      { type: 'dog', birthDate: new Date(new Date().getFullYear() - 9, 0, 1) },
      {}
    );
    assert.ok(r.fitScore >= 0.5);
    assert.equal(r.lifeStage, 'senior');
  });

  it('insights Node agrégés', () => {
    const snap = {
      revenue_history: [{ revenue: 1000 }],
      orders: [
        { id: '1', userId: 'c1', total: 500, status: 'pending', createdAt: new Date() },
        { id: '2', userId: 'c1', total: 200, status: 'delivered', createdAt: new Date() },
      ],
      products: [{ id: 'p1', name: 'Croquettes', category: 'nourriture' }],
      users: [{ id: 'c1', role: 'client', name: 'Test' }],
    };
    const ins = buildNodePlatformInsights(snap);
    assert.ok(ins.mlPowered);
    assert.ok(ins.modelsUsed.includes('churn_logistic_v1'));
    assert.ok(ins.cancelRiskOrders.length >= 1);
  });
});
