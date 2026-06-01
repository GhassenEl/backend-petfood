const usePayPalMock = () => {
  const mock = process.env.PAYPAL_MOCK;
  if (mock === '1' || mock === 'true') return true;
  const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
  const secret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  if (!clientId || !secret || clientId.includes('placeholder')) return true;
  return false;
};

const createOrder = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    if (usePayPalMock()) {
      return res.json({
        orderId: `PAYPAL_DEMO_${Date.now()}`,
        amount,
        currency: 'TND',
        demo: true,
        approvalUrl: null,
      });
    }

    // Intégration REST PayPal à brancher avec PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
    return res.status(501).json({
      error: 'PayPal live non configuré. Définissez PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET ou PAYPAL_MOCK=1.',
    });
  } catch (error) {
    console.error('PayPal create error:', error);
    res.status(500).json({ error: error.message });
  }
};

const captureOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId PayPal requis' });
    }

    if (usePayPalMock()) {
      return res.json({
        success: true,
        status: 'COMPLETED',
        orderId,
        demo: true,
        message: 'Paiement PayPal confirmé (mode démo)',
      });
    }

    return res.status(501).json({ error: 'Capture PayPal live non implémentée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getConfig = async (_req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    demo: usePayPalMock(),
  });
};

module.exports = { createOrder, captureOrder, getConfig };
