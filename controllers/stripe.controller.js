const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

/** Stripe mock: pas de clé réelle, ou forçage explicite (sans lier au statut MongoDB). */
const useStripeMock = () => {
  const mock = process.env.STRIPE_MOCK;
  if (mock === '1' || mock === 'true') return true;
  const k = (process.env.STRIPE_SECRET_KEY || '').trim();
  if (!k || k.includes('placeholder')) return true;
  if (!(k.startsWith('sk_test_') || k.startsWith('sk_live_'))) return true;
  return false;
};

/** Devises où l’unité API Stripe est 1/1000 de l’unité majeure (ex. fils KWD). */
const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'jod', 'kwd', 'omr']);

const majorToStripeAmount = (major, currency) => {
  const c = (currency || 'tnd').toLowerCase();
  const n = Number(major);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return THREE_DECIMAL_CURRENCIES.has(c) ? Math.round(n * 1000) : Math.round(n * 100);
};

const stripeAmountToMajor = (stripeAmount, currency) => {
  const c = (currency || 'tnd').toLowerCase();
  const div = THREE_DECIMAL_CURRENCIES.has(c) ? 1000 : 100;
  return stripeAmount / div;
};

const createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency = 'tnd' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    if (useStripeMock()) {
      return res.json({
        clientSecret: 'pi_demo_' + Date.now() + '_secret_' + Math.random().toString(36).slice(2),
        amount,
        currency,
        demo: true
      });
    }

    const cur = currency.toLowerCase();
    const stripeAmount = majorToStripeAmount(amount, cur);
    if (!stripeAmount) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    // CardElement + confirmCardPayment nécessitent des intents « carte »,
    // pas automatic_payment_methods (réservé au Payment Element).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: stripeAmount,
      currency: cur,
      payment_method_types: ['card'],
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

    if (useStripeMock()) {
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
      amount: stripeAmountToMajor(paymentIntent.amount, paymentIntent.currency),
      currency: paymentIntent.currency
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getConfig = async (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
    demo: useStripeMock()
  });
};

module.exports = {
  createPaymentIntent,
  confirmPayment,
  getConfig
};

