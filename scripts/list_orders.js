(async () => {
  const base = 'http://localhost:5002';
  try {
    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@petfood.tn', password: 'PetfoodTN2024!' })
    });
    const adminJson = await adminLogin.json();
    const adminToken = adminJson.token;

    const resp = await fetch(`${base}/api/orders`, { headers: { Authorization: `Bearer ${adminToken}` } });
    const orders = await resp.json();
    console.log('Orders count:', Array.isArray(orders) ? orders.length : 'N/A');
    console.log(JSON.stringify((orders || []).slice(0, 10), null, 2));
  } catch (e) {
    console.error('error', e);
  }
})();
