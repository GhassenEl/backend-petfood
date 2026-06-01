(async () => {
  const base = 'http://localhost:5002';
  try {
    // Client login
    const clientLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'client@petfood.tn', password: 'MonChat123!' })
    });
    const clientJson = await clientLogin.json();
    const clientToken = clientJson.token;

    // Get orders for client
    const ordersResp = await fetch(`${base}/api/orders`, { headers: { Authorization: `Bearer ${clientToken}` } });
    const orders = await ordersResp.json();
    console.log('Orders count for client:', orders.length);
    const lastOrder = orders[0] || orders[orders.length-1];
    console.log('Sample order (first):', JSON.stringify(lastOrder, null, 2));

    // Get invoices for client
    const invoicesResp = await fetch(`${base}/api/invoices`, { headers: { Authorization: `Bearer ${clientToken}` } });
    const invoices = await invoicesResp.json();
    console.log('Invoices count for client:', invoices.length);
    const related = invoices.find(inv => inv.orderId === (lastOrder && lastOrder.id));
    if (related) console.log('Related invoice:', JSON.stringify(related, null, 2));

    // Fetch product list and show stock for product in order
    const productId = lastOrder?.items?.[0]?.productId;
    if (productId) {
      const productsResp = await fetch(`${base}/api/products`);
      const products = await productsResp.json();
      const product = products.find(p => (p.id || p._id) === productId || p.id === productId);
      console.log('Product snapshot:', JSON.stringify(product, null, 2));
    } else {
      console.log('No productId found in order items');
    }

  } catch (e) {
    console.error('error', e);
  }
})();
