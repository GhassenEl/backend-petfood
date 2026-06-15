/**
 * Test rapide des routes /api/ecosystem/moderator/*
 * Usage: node scripts/test-moderator-api.js
 */
const http = require('http');

const BASE = process.env.API_BASE || 'http://127.0.0.1:5002';
const EMAIL = process.env.TEST_MOD_EMAIL || 'moderator@petfood.tn';
const PASS = process.env.TEST_MOD_PASS || 'Moderator2024!';

const request = (method, path, token, body) =>
  new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json;
          try { json = JSON.parse(data); } catch { json = data; }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const login = async () => {
  const { status, json } = await request('POST', '/api/auth/login', null, {
    email: EMAIL,
    password: PASS,
  });
  if (status !== 200 || !json.token) {
    throw new Error(`Login failed ${status}: ${JSON.stringify(json)}`);
  }
  return json.token;
};

const tests = [
  ['GET /ecosystem/moderator/dashboard', 'GET', '/api/ecosystem/moderator/dashboard'],
  ['GET /ecosystem/moderator/vendors', 'GET', '/api/ecosystem/moderator/vendors'],
  ['GET /ecosystem/moderator/products/pending', 'GET', '/api/ecosystem/moderator/products/pending'],
  ['GET /ecosystem/moderator/disputes', 'GET', '/api/ecosystem/moderator/disputes'],
  ['GET /ecosystem/moderator/reviews/fake', 'GET', '/api/ecosystem/moderator/reviews/fake'],
  ['GET /ecosystem/moderator/analytics', 'GET', '/api/ecosystem/moderator/analytics'],
  ['GET /ecosystem/moderator/stats/realtime', 'GET', '/api/ecosystem/moderator/stats/realtime'],
  ['GET /ecosystem/moderator/bi/dashboard', 'GET', '/api/ecosystem/moderator/bi/dashboard?days=30'],
];

(async () => {
  console.log('🔐 Connexion modérateur…');
  const token = await login();
  let ok = 0;
  for (const [label, method, path] of tests) {
    const { status, json } = await request(method, path, token);
    const pass = status === 200;
    console.log(`${pass ? '✅' : '❌'} ${label} → ${status}`);
    if (!pass) console.log('   ', JSON.stringify(json).slice(0, 200));
    else ok += 1;
  }
  console.log(`\n${ok}/${tests.length} routes modérateur OK`);
  process.exit(ok === tests.length ? 0 : 1);
})().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
