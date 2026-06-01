(async () => {
  const base = 'http://localhost:5002';
  // parse args like status=pending user=demo_client dateFrom=2026-05-10 dateTo=2026-05-18
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
  const statusFilter = args.status;
  const userFilter = args.user;
  const dateFromArg = args.dateFrom; // YYYY-MM-DD or ISO
  const dateToArg = args.dateTo;
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

    // Date range filtering (inclusive)
    let fromDate = null;
    let toDate = null;
    if (dateFromArg) {
      const d = new Date(dateFromArg);
      if (!isNaN(d)) fromDate = d;
    }
    if (dateToArg) {
      const d = new Date(dateToArg);
      if (!isNaN(d)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateToArg)) d.setHours(23,59,59,999);
        toDate = d;
      }
    }

    if (fromDate || toDate) {
      orders = orders.filter(o => {
        const created = new Date(o.createdAt);
        if (fromDate && created < fromDate) return false;
        if (toDate && created > toDate) return false;
        return true;
      });
    }

    console.log(`Filtered orders count: ${orders.length}`);
    console.log(JSON.stringify(orders.slice(0, 200), null, 2));
  } catch (e) {
    console.error('error', e);
  }
})();
