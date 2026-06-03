/**
 * Insère les articles de blog par défaut si la table est vide.
 * Usage: node scripts/seed-blog-articles.js (depuis backend/)
 */
const { prisma, connectDB } = require('../prismaClient');
const { defaultBlogArticles } = require('../utils/defaultBlogArticles');

async function main() {
  await connectDB();
  const count = await prisma.blogArticle.count();
  if (count > 0) {
    console.log(`ℹ️  ${count} article(s) déjà en base — rien à faire.`);
    await prisma.$disconnect();
    return;
  }

  for (let i = 0; i < defaultBlogArticles.length; i += 1) {
    const article = defaultBlogArticles[i];
    const publishedAt = new Date();
    publishedAt.setDate(publishedAt.getDate() - i * 14);
    await prisma.blogArticle.create({
      data: {
        ...article,
        isPublished: true,
        publishedAt,
      },
    });
  }

  console.log(`✅ ${defaultBlogArticles.length} articles de blog créés.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
