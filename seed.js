const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db'); // Use existing DB connection
const { generateOrders, generateMessages, demoProducts, demoClient } = require('./utils/demoData');
const { demoUsers } = require('./utils/demoStore');

// Import models
const User = require('./models/User');
const Order = require('./models/Order');
const Product = require('./models/Product');
const Message = require('./models/Message');

// Connect to DB
connectDB();

const seedData = async () => {
  try {
    console.log('🧹 Clearing existing data...');
    
    await Promise.all([
      User.deleteMany({}),
      Order.deleteMany({}),
      Product.deleteMany({}),
      Message.deleteMany({})
    ]);
    
    console.log('👥 Creating users...');
    const livreurUser = demoUsers.find(u => u.role === 'livreur');
    const hashedPassword = await bcrypt.hash('Livreur123!', 10);
    const user = new User({
      ...livreurUser,
      password: hashedPassword // Set password for login
    });
    await user.save();
    console.log(`✅ Livreur user created: ${livreurUser.email}`);

    console.log('📦 Creating products...');
    for (const productData of demoProducts) {
      await new Product(productData).save();
    }
    console.log(`✅ ${demoProducts.length} products created`);

    console.log('🛒 Creating Livreur orders...');
    const orders = generateOrders(50).map(order => ({
      ...order,
      userId: user._id // Assign to our livreur
    }));
    await Order.insertMany(orders);
    console.log(`✅ ${orders.length} orders created (many pending for delivery)`);

    console.log('💬 Creating messages...');
    const messages = generateMessages().map(msg => new Message(msg));
    await Message.insertMany(messages);
    console.log(`✅ ${messages.length} messages created`);

console.log(`🎉 SEEDING COMPLETE! Login: ${livreurUser.email} / Livreur123!`);
console.log('Restart backend and test /livreur/orders');
    
    mongoose.connection.close();
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
};

seedData();
