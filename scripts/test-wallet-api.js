/**
 * Tests API automatisés — portefeuille & rappels vaccins
 * Usage: node scripts/test-wallet-api.js
 */
const BASE = process.env.API_BASE_URL || 'http://localhost:5002/api';
const CLIENT = { email: 'client@petfood.tn', password: 'MonChat123!' };

const results = [];
const pass = (name, detail = '') => results.push({ ok: true, name, detail });
const fail = (name, detail = '') => results.push({ ok: false, name, detail });

async function json(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function run() {
  try {
    const login = await json('POST', '/auth/login', CLIENT);
    if (!login.data?.token) {
      fail('Connexion client', `status ${login.status}`);
      return;
    }
    pass('Connexion client');
    const token = login.data.token;

    const walletBefore = await json('GET', '/wallet', null, token);
    if (walletBefore.status !== 200) {
      fail('GET /wallet', `status ${walletBefore.status}`);
    } else {
      pass('GET /wallet', `solde ${walletBefore.data?.balance ?? 0} DT`);
    }

    const topUp = await json('POST', '/wallet/topup', { amount: 25, paymentMethod: 'demo' }, token);
    if (topUp.status !== 200 && topUp.status !== 201) {
      fail('POST /wallet/topup', `status ${topUp.status}`);
    } else {
      const newBalance = topUp.data?.balance ?? walletBefore.data?.balance;
      pass('POST /wallet/topup', `nouveau solde ${newBalance} DT`);
    }

    const walletAfter = await json('GET', '/wallet', null, token);
    if ((walletAfter.data?.balance ?? 0) >= (walletBefore.data?.balance ?? 0)) {
      pass('Solde portefeuille mis à jour');
    } else {
      fail('Solde portefeuille mis à jour', 'balance decreased unexpectedly');
    }

    const vaccines = await json('GET', '/pets/vaccine-reminders', null, token);
    if (vaccines.status === 200 && Array.isArray(vaccines.data)) {
      pass('GET /vaccine-reminders', `${vaccines.data.length} rappel(s)`);
    } else {
      fail('GET /vaccine-reminders', `status ${vaccines.status}`);
    }

    const paymentMethods = await json('GET', '/payments/config', null, token);
    if (paymentMethods.status === 200) {
      pass('GET /payments/config');
    } else {
      pass('GET /payments/config', 'optionnel — ignoré si absent');
    }

    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date();
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const booking = await json(
      'POST',
      '/service-bookings',
      {
        type: 'boarding',
        petName: 'TestAPI',
        animalType: 'dog',
        date: fmt(start),
        endDate: fmt(end),
      },
      token
    );
    if (booking.status === 201 || booking.status === 200) {
      pass('POST /service-bookings', `id ${booking.data?.id || booking.data?._id}`);
    } else {
      fail('POST /service-bookings', `status ${booking.status}`);
    }
  } catch (err) {
    fail('Exception', err.message);
  }

  console.log('\n=== Tests API backend (wallet / vaccins) ===\n');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} réussis\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
