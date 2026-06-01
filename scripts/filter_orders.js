(async () => {
  const base = 'http://localhost:5002';
  // parse args like status=pending user=demo_client
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
  const statusFilter = args.status;
  const userFilter = args.user;
  try {
    const adminLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@petfood.tn', password: 'PetfoodTN2024!' })
    });
    const adminJson = await adminLogin.json();
    const adminToken = adminJson.token;

    const resp = await fetch(`${base}/api/orders`, { headers: { Authorization: `Bearer ${adminToken}` } });
    let orders = await resp.json();
    if (!Array.isArray(orders)) {
      console.error('Unexpected response:', orders);
      process.exit(1);
    }

    if (statusFilter) orders = orders.filter(o => String(o.status).toLowerCase() === String(statusFilter).toLowerCase());
    if (userFilter) orders = orders.filter(o => String(o.userId) === String(userFilter));

    console.log(`Filtered orders count: ${orders.length}`);
    console.log(JSON.stringify(orders.slice(0, 50), null, 2));
  } catch (e) {
    console.error('error', e);
  }
})();
