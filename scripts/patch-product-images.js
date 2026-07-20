const { prisma } = require('../prismaClient');

const updates = {
  ani_rabbit_1: '/images/products/rabbit-adoption.jpg',
  ani_bird_1: '/images/products/bird-couple.jpg',
  ani_fish_1: '/images/products/guppy-lot.jpg',
  prd_rabbit_food: '/images/products/rabbit-food.jpg',
};

(async () => {
  for (const [id, imageUrl] of Object.entries(updates)) {
    try {
      await prisma.product.update({ where: { id }, data: { imageUrl } });
      console.log('updated', id, '->', imageUrl);
    } catch (error) {
      console.warn('skip', id, error.message);
    }
  }
  await prisma.$disconnect();
})();
