const {
  PAYMENT_METHODS,
  BANK_TRANSFER_DETAILS,
} = require('../utils/paymentMethods');

const stripe = require('../controllers/stripe.controller');
const paypal = require('../controllers/paypal.controller');

const getMethods = async (_req, res) => {
  res.json({
    methods: PAYMENT_METHODS,
    bankTransfer: BANK_TRANSFER_DETAILS,
    labels: PAYMENT_METHODS.reduce((acc, m) => {
      acc[m.id] = m.label;
      return acc;
    }, {}),
  });
};

const getConfig = async (req, res) => {
  const stripeCfg = {};
  const paypalCfg = {};
  await stripe.getConfig(req, { json: (body) => Object.assign(stripeCfg, body) });
  await paypal.getConfig(req, { json: (body) => Object.assign(paypalCfg, body) });

  res.json({
    methods: PAYMENT_METHODS,
    bankTransfer: BANK_TRANSFER_DETAILS,
    stripe: stripeCfg,
    paypal: paypalCfg,
  });
};

module.exports = { getMethods, getConfig };
