const metrics = require('./metrics');
const architectures = require('./architectures');
const autoSelect = require('./autoSelect');
const clinicalUrgencyModel = require('./clinicalUrgencyModel');
const incidentPriorityModel = require('./incidentPriorityModel');
const orderCancelRiskModel = require('./orderCancelRiskModel');
const clientChurnModel = require('./clientChurnModel');
const productFitModel = require('./productFitModel');
const deliveryPriorityModel = require('./deliveryPriorityModel');
const platformInsightsModel = require('./platformInsightsModel');

module.exports = {
  ...metrics,
  ...architectures,
  ...autoSelect,
  ...clinicalUrgencyModel,
  ...incidentPriorityModel,
  ...orderCancelRiskModel,
  ...clientChurnModel,
  ...productFitModel,
  ...deliveryPriorityModel,
  ...platformInsightsModel,
};
