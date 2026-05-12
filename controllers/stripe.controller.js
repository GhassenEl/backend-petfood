const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const demoStore = require('../utils/demoStore');
const mongoose = require('mongoose');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'tnd' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    if (isDemoMode()) {
      return res.json({
        clientSecret: 'pi_demo_' + Date.now() + '_secret_' + Math.random().toString(36).slice(2),
        amount,
        currency,
        demo: true
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: req.user._id.toString(),
        userEmail: req.user.email,
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount,
      currency
    });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
};

const confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, orderId } = req.body;

    if (isDemoMode()) {
      return res.json({
        success: true,
        status: 'succeeded',
        message: 'Paiement confirmé (mode démo)',
        orderId
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    res.json({
      success: paymentIntent.status === 'succeeded',
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getConfig = async (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    demo: isDemoMode()
  });
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  getConfig
};

