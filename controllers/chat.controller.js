const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const demoStore = require('../utils/demoStore');

const isDemoMode = () => !mongoose.connection || mongoose.connection.readyState !== 1;

async function getRecommendationsForUser(userId, limit = 4) {
  try {
    if (isDemoMode()) {
      const all = demoStore.getProducts();
      const user = demoStore.getUserById(userId);
      const scored = all.map(p => {
        let score = 0;
        let reasons = [];
        if (user?.petType && p.animalType === user.petType) {
          score += 0.35;
          reasons.push("Adapté à votre " + user.petType);
        }
        if (p.discount > 0) {
          score += (p.discount / 100) * 0.20;
          reasons.push("-" + p.discount + "% réduction");
        }
        if (p.popularity > 80) {
          score += 0.15;
          reasons.push("Très populaire");
        }
        if (p.rating_avg >= 4.5) {
          score += 0.10;
          reasons.push("Bien noté");
        }
        return { ...p, score, recommendedReason: reasons[0] || "Recommandé pour vous" };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    }

    const user = await User.findById(userId);
    const userOrders = await Order.find({ userId }).populate("items.productId");
    const boughtProductIds = userOrders.flatMap(o => o.items.map(i => i.productId?._id?.toString()));

    const userReviews = await Review.find({ userId }).populate("productId");
    const positiveProductIds = userReviews
      .filter(r => ["happy", "satisfied"].includes(r.emotion) && r.rating >= 4)
      .map(r => r.productId?._id?.toString());
    const negativeProductIds = userReviews
      .filter(r => ["disappointed", "frustrated"].includes(r.emotion) || r.rating <= 2)
      .map(r => r.productId?._id?.toString());

    const allProducts = await Product.find();

    const scoredProducts = allProducts.map(p => {
      const pId = p._id.toString();
      let score = 0;
      const reasons = [];

      if (user?.petType && p.animalType === user.petType) {
        score += 0.30;
        reasons.push("🐾 Pour votre " + p.animalType);
      }
      if (user?.favoriteCategories?.includes(p.category)) {
        score += 0.20;
        reasons.push("❤️ Catégorie préférée");
      }
      if (positiveProductIds.includes(pId)) {
        score += 0.15;
        reasons.push("😊 Vous avez adoré !");
      }
      const likedProducts = userReviews.filter(r => positiveProductIds.includes(r.productId?._id?.toString()));
      const likedTypes = likedProducts.map(r => r.productId?.animalType).filter(Boolean);
      const likedCats = likedProducts.map(r => r.productId?.category).filter(Boolean);
      if (likedTypes.includes(p.animalType)) {
        score += 0.10;
        reasons.push("Similaire à vos coups de cœur");
      }
      if (likedCats.includes(p.category)) {
        score += 0.08;
        reasons.push("Même catégorie que vos favoris");
      }
      if (negativeProductIds.includes(pId)) {
        score -= 0.25;
      }
      if (boughtProductIds.includes(pId)) {
        score += 0.05;
        reasons.push("Déjà acheté");
      }
      if (p.discount > 0) {
        score += (p.discount / 100) * 0.12;
        reasons.push("💰 -" + p.discount + "%");
      }
      score += (p.popularity / 100) * 0.10;
      if (p.popularity > 85) reasons.push("🔥 Très populaire");
      if (p.rating_avg >= 4.5) {
        score += 0.08;
        reasons.push("⭐ Bien noté");
      }
      const prefMatch = p.tags?.some(t => user?.preferences?.includes(t));
      if (prefMatch) {
        score += 0.07;
        reasons.push("Correspond à vos préférences");
      }

      return {
        ...p.toObject(),
        score: Math.min(Math.max(score, 0), 1),
        recommendedReason: reasons[0] || (p.discount > 0 ? "-" + p.discount + "%" : "Recommandé pour vous")
      };
    });

    scoredProducts.sort((a, b) => b.score - a.score);
    return scoredProducts.filter(p => p.score > 0).slice(0, limit);
  } catch (err) {
    console.error("Recommendation error:", err);
    return [];
  }
}

function detectIntent(text) {
  const t = text.toLowerCase();
  const searchWords = /recommand|suggest|idée|besoin|cherche|trouver|quel|quoi|produit|acheter|offre|promo/;
  const promoWords = /promo|promotion|soldes|rabais|offre|discount|réduction|moins cher/;
  const greetingWords = /bonjour|salut|hello|hey|coucou|bonsoir/;
  const thanksWords = /merci|thanks|thank you|cool|super|génial|parfait/;
  const byeWords = /au revoir|bye|adieu|à plus|à bientôt/;
  const profileWords = /profil|mon animal|mon chien|mon chat|âge|type|préférence/;

  if (byeWords.test(t)) return "goodbye";
  if (thanksWords.test(t)) return "thanks";
  if (greetingWords.test(t)) return "greeting";
  if (promoWords.test(t)) return "promo";
  if (profileWords.test(t)) return "profile";
  if (searchWords.test(t)) return "recommend";
  return "other";
}

function extractAnimalType(text) {
  const t = text.toLowerCase();
  if (/chien|dog|canin/.test(t)) return "dog";
  if (/chat|cat|félin/.test(t)) return "cat";
  if (/oiseau|bird|perroquet|canari/.test(t)) return "bird";
  if (/poisson|fish|aquarium/.test(t)) return "fish";
  if (/lapin|rongeur|hamster/.test(t)) return "other";
  return null;
}

async function buildResponse(userId, userMessage, user) {
  const intent = detectIntent(userMessage);
  const isProfileComplete = !!(user?.petType && user?.petAge != null && user?.preferences?.length > 0);

  if (intent === "greeting") {
    if (!isProfileComplete) {
      return {
        content: "Bonjour ! 🐾 Je suis votre assistant PetfoodTN. Pour vous proposer les meilleures recommandations, j'aimerais en savoir plus sur votre animal. Quel type d'animal avez-vous ? (chien, chat, oiseau, poisson, autre)",
        quickReplies: ["🐶 Chien", "🐱 Chat", "🐦 Oiseau", "🐠 Poisson", "🐾 Autre"]
      };
    }
    return {
      content: "Bonjour " + (user?.name || "") + " ! 🐾 Je suis ravi de vous revoir. Souhaitez-vous des recommandations personnalisées pour votre " + user.petType + " ?",
      quickReplies: ["Oui, montre-moi !", "Voir les promotions", "Mon profil"]
    };
  }

  const extractedAnimal = extractAnimalType(userMessage);
  if (extractedAnimal && !user?.petType) {
    if (!isDemoMode()) {
      await User.findByIdAndUpdate(userId, { petType: extractedAnimal });
    }
    return {
      content: "Super, un " + extractedAnimal + " ! 🎉 Quel est son âge (en années) ?",
      quickReplies: ["Moins d'1 an", "1-3 ans", "3-7 ans", "Plus de 7 ans"]
    };
  }

  if (/\d+/.test(userMessage) && user?.petType && !user?.petAge) {
    const ageMatch = userMessage.match(/\d+/);
    const age = ageMatch ? parseInt(ageMatch[0]) : null;
    if (age != null) {
      if (!isDemoMode()) {
        await User.findByIdAndUpdate(userId, { petAge: age });
      }
      return {
        content: "Parfait ! Et quelles sont vos préférences ? (premium, bio, sans céréales, grain-free...)",
        quickReplies: ["Premium", "Bio", "Sans céréales", "Économique", "Peu importe"]
      };
    }
  }

  if (user?.petType && user?.petAge != null && !user?.preferences?.length) {
    const prefs = ["premium", "bio", "sans céréales", "grain-free", "économique"]
      .filter(p => userMessage.toLowerCase().includes(p) || userMessage.toLowerCase().includes("économique") && p === "économique");
    const chosen = prefs.length > 0 ? prefs : [userMessage.trim()];
    if (!isDemoMode()) {
      await User.findByIdAndUpdate(userId, { preferences: chosen });
    }
    return {
      content: "Excellent ! Merci pour ces informations. 🎉 Voici mes recommandations personnalisées pour votre " + user.petType + " de " + user.petAge + " an(s) :",
      products: await getRecommendationsForUser(userId, 4),
      quickReplies: ["Autres recommandations", "Voir les promotions", "Modifier mon profil"]
    };
  }

  if (intent === "recommend" || intent === "promo") {
    if (!isProfileComplete) {
      return {
        content: "Je vais vous aider ! Mais d'abord, quel type d'animal avez-vous ? 🐾",
        quickReplies: ["🐶 Chien", "🐱 Chat", "🐦 Oiseau", "🐠 Poisson", "🐾 Autre"]
      };
    }
    const recs = await getRecommendationsForUser(userId, 4);
    let content = "Voici ce que je vous recommande pour votre " + user.petType + " 🎁";
    if (intent === "promo") content = "Voici les meilleures offres du moment pour votre " + user.petType + " 🤑";
    return {
      content: content,
      products: recs,
      quickReplies: ["Autres recommandations", "Filtrer par catégorie", "Voir les promotions", "Terminer"]
    };
  }

  if (intent === "profile") {
    const profileInfo = [
      user?.petType ? "Type: " + user.petType : "",
      user?.petAge ? "Âge: " + user.petAge + " an(s)" : "",
      user?.preferences?.length ? "Préférences: " + user.preferences.join(", ") : "",
      user?.favoriteCategories?.length ? "Catégories favorites: " + user.favoriteCategories.join(", ") : ""
    ].filter(Boolean).join(" | ") || "Votre profil est incomplet.";
    return {
      content: "📋 Voici votre profil : " + profileInfo + "\n\nSouhaitez-vous le modifier ?",
      quickReplies: ["Modifier mon profil", "Recommandations", "Terminer"]
    };
  }

  if (intent === "thanks") {
    return {
      content: "Avec plaisir ! 🐾 N'hésitez pas à revenir si vous avez besoin de nouvelles recommandations. Passez une belle journée !",
      quickReplies: ["Nouvelles recommandations", "Au revoir"]
    };
  }

  if (intent === "goodbye") {
    return {
      content: "Au revoir ! 🐾 À bientôt chez PetfoodTN !",
      quickReplies: []
    };
  }

  if (!isProfileComplete) {
    return {
      content: "Je ne suis pas sûr de comprendre. 😅 Commençons par votre animal : quel type avez-vous ?",
      quickReplies: ["🐶 Chien", "🐱 Chat", "🐦 Oiseau", "🐠 Poisson", "🐾 Autre"]
    };
  }
  return {
    content: "Je ne suis pas sûr de comprendre. 😅 Je peux vous recommander des produits, montrer les promotions ou afficher votre profil. Qu'est-ce qui vous intéresse ?",
    quickReplies: ["Recommandations", "Promotions", "Mon profil"]
  };
}

const sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.id || req.user._id;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message required" });
    }

    let user;
    if (isDemoMode()) {
      user = demoStore.getUserById(userId);
    } else {
      user = await User.findById(userId).select("-password");
    }

    const response = await buildResponse(userId, message.trim(), user);

    if (!isDemoMode()) {
      try {
        const userMsg = new ChatMessage({
          userId,
          role: "user",
          content: message.trim()
        });
        await userMsg.save();

        const assistantMsg = new ChatMessage({
          userId,
          role: "assistant",
          content: response.content,
          products: (response.products || []).map(p => ({
            productId: p._id,
            name: p.name,
            price: p.price,
            discountPrice: p.discountPrice || p.price * (1 - (p.discount || 0) / 100),
            discount: p.discount || 0,
            icon: p.icon,
            reason: p.recommendedReason || p.reason || ""
          })),
          quickReplies: response.quickReplies || []
        });
        await assistantMsg.save();
      } catch (dbErr) {
        console.error("Chat DB save error (non-critical in demo):", dbErr.message);
      }
    }

    res.json({
      message: response.content,
      products: response.products || [],
      quickReplies: response.quickReplies || []
    });
  } catch (error) {
    console.error("Chat message error:", error);
    res.status(500).json({ error: error.message });
  }
};

const getHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (isDemoMode()) {
      return res.json([]);
    }
    const messages = await ChatMessage.find({ userId })
      .sort({ createdAt: 1 })
      .limit(100);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const clearHistory = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    if (isDemoMode()) {
      return res.json({ message: "Chat cleared" });
    }
    await ChatMessage.deleteMany({ userId });
    res.json({ message: "Chat cleared" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  sendMessage,
  getHistory,
  clearHistory
};

