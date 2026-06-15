const { prisma, isDemoMode } = require('../prismaClient');
const demoStore = require('../utils/demoStore');
const { emotionFromRating, clampRating } = require('../utils/ratingHelpers');
const { analyzeOwnerEmotionText } = require('../services/ownerEmotionAnalysis.service');
const { analyzeCommentText, emotionToSentiment } = require('../services/commentSentiment.service');

const getUserId = (req) => req.user?.id || req.user?._id || req.user?.userId;


const getCount = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json({ count: demoStore.getReviews(req.user).length });
    }
    const count = await prisma.review.count();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getReviews = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.json(demoStore.getReviews(req.user));
    }

    const where = req.user.role !== 'admin' ? { userId: getUserId(req) } : undefined;

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, name: true, imageUrl: true } }
      }
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createReview = async (req, res) => {
  try {
    if (isDemoMode()) {
      return res.status(201).json(demoStore.createReview(req.user, req.body));
    }

    const isEventReview = String(req.body?.type || '').toLowerCase() === 'event';
    const rawProductId = req.body?.productId;
    if (!rawProductId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    // The Prisma schema currently links Review.productId -> Product.id.
    // For EventsPage, we send the appointment id in productId with type='event'.
    // We map that appointment id to a dedicated “event reviews” Product.
    let mappedProductId = rawProductId;

    if (isEventReview) {
      // Create deterministic product id so reviews can be stored without FK issues.
      // Note: we don't require the appointment to exist.
      const eventProductId = `event_reviews_${rawProductId}`;

      const [existingProduct] = await prisma.product.findMany({
        where: { id: eventProductId },
        take: 1,
      });

      if (!existingProduct) {
        await prisma.product.create({
          data: {
            id: eventProductId,
            name: `Event Reviews #${rawProductId}`,
            price: 0,
            discount: 0,
            imageUrl: '',
            category: 'services',
            animalType: 'other',
            popularity: 0,
            rating_avg: 0,
            rating_count: 0,
            stock: 999999,
            tags: ['event'],
            stockHistory: [],
          },
        });
      }

      mappedProductId = eventProductId;
    }

    const rating = clampRating(req.body.rating);
    if (!rating) {
      return res.status(400).json({ error: 'La note doit être entre 1 et 5' });
    }

    let emotion = req.body.emotion || emotionFromRating(rating);
    let aiSuggested = Boolean(req.body.aiSuggested);
    let sentiment = emotionToSentiment(emotion);
    let sentimentScore = null;

    if (req.body.comment?.trim()) {
      try {
        const commentAnalysis = analyzeCommentText(req.body.comment, { emotion });
        const analysis = await analyzeOwnerEmotionText({
          text: req.body.comment,
          serviceType: 'products',
          rating,
        });
        if (!req.body.emotion || req.body.aiSuggested) {
          emotion = analysis.emotion;
          aiSuggested = true;
        }
        sentiment = commentAnalysis.sentiment || analysis.sentiment || emotionToSentiment(emotion);
        sentimentScore = commentAnalysis.confidence ?? analysis.confidence ?? null;
      } catch {
        sentiment = emotionToSentiment(emotion);
      }
    } else {
      sentiment = emotionToSentiment(emotion);
    }

    const review = await prisma.review.create({
      data: {
        userId: req.user.role === 'admin' && req.body.userId ? req.body.userId : getUserId(req),
        productId: mappedProductId,
        rating,
        comment: req.body.comment,
        emotion,
        sentiment,
        sentimentScore,
        aiSuggested,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, name: true, imageUrl: true } }
      }
    });

    try {
      const { emitToRole } = require('../utils/notificationHub');
      emitToRole('admin', {
        id: `review-${review.id}`,
        type: 'new_review',
        title: `Nouvel avis (${review.rating}⭐)`,
        description: String(review.comment || '').slice(0, 120),
        link: '/admin/reviews',
        read: false,
        createdAt: review.createdAt,
      });
    } catch {
      /* optional */
    }

    res.status(201).json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateReview = async (req, res) => {
  try {
    if (isDemoMode()) {
      const review = demoStore.updateReview(req.params.id, req.body);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      return res.json(review);
    }

    const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    if (existing.userId !== getUserId(req) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: {
        rating: req.body.rating !== undefined ? clampRating(req.body.rating) : existing.rating,
        comment: req.body.comment !== undefined ? req.body.comment : existing.comment,
        emotion: req.body.emotion !== undefined
          ? req.body.emotion
          : req.body.rating !== undefined
            ? emotionFromRating(req.body.rating)
            : existing.emotion,
        aiSuggested: req.body.aiSuggested !== undefined ? req.body.aiSuggested : existing.aiSuggested
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        product: { select: { id: true, name: true, imageUrl: true } }
      }
    });

    res.json(review);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteReview = async (req, res) => {
  try {
    if (isDemoMode()) {
      const review = demoStore.deleteReview(req.params.id);
      if (!review) return res.status(404).json({ error: 'Review not found' });
      return res.json({ message: 'Review deleted' });
    }

    const existing = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    if (existing.userId !== getUserId(req) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.review.delete({ where: { id: req.params.id } });
    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEmotionAnalytics = async (req, res) => {
  try {
    if (isDemoMode()) {
      const allReviews = demoStore.getReviews(req.user).filter(r => r.productId?._id === req.params.productId);
      const emotions = { happy: 0, satisfied: 0, neutral: 0, disappointed: 0, frustrated: 0 };
      allReviews.forEach(r => { emotions[r.emotion || 'neutral'] = (emotions[r.emotion || 'neutral'] || 0) + 1; });
      return res.json({ productId: req.params.productId, emotions, total: allReviews.length });
    }

    const reviews = await prisma.review.findMany({ where: { productId: req.params.productId } });
    const emotions = { happy: 0, satisfied: 0, neutral: 0, disappointed: 0, frustrated: 0 };
    reviews.forEach(r => { emotions[r.emotion || 'neutral'] = (emotions[r.emotion || 'neutral'] || 0) + 1; });
    res.json({ productId: req.params.productId, emotions, total: reviews.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getReviewCount: getCount, getReviews, createReview, updateReview, deleteReview, getEmotionAnalytics };
