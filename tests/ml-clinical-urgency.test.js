const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { predictClinicalUrgency } = require('../ml/clinicalUrgencyModel');

describe('ML triage clinique (clinical_logistic_v1)', () => {
  it('classifie une détresse respiratoire comme urgent', () => {
    const r = predictClinicalUrgency({
      symptoms: 'Mon chien ne respire plus bien, halètement urgent',
      vitals: { temperature: 40.2, heartRate: 180 },
      profile: { pet: { type: 'dog', ageYears: 8, name: 'Rex' } },
    });
    assert.equal(r.modelId, 'clinical_logistic_v1');
    assert.equal(r.urgencyClass, 'urgent');
    assert.ok(r.diseaseProbability >= 0.5);
    assert.ok(r.suggestedAnomalies.length >= 1);
  });

  it('reste non urgent pour signes légers', () => {
    const r = predictClinicalUrgency({
      symptoms: 'Pelage un peu terne depuis une semaine',
      vitals: {},
      profile: { pet: { type: 'cat', ageYears: 2 } },
    });
    assert.equal(r.urgencyClass, 'non_urgent');
    assert.ok(r.urgencyScore < 0.72);
  });

  it('détecte vomissements + léthargie', () => {
    const r = predictClinicalUrgency({
      symptoms: 'Vomissements depuis 2 jours et chien tres fatigue, abattu',
      profile: { pet: { type: 'dog', ageYears: 5 } },
    });
    assert.ok(r.features.signals.includes('vomit'));
    assert.ok(r.features.signals.includes('lethargy'));
    assert.ok(['soon', 'urgent'].includes(r.urgency));
  });
});
