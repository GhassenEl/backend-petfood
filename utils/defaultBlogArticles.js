/** Articles de blog par défaut (seed + mode démo) */
const defaultBlogArticles = [
  {
    title: 'Comment lire l’étiquette d’un sac de croquettes ?',
    category: 'Guide',
    readMin: 5,
    excerpt: 'Protéines brutes, matières grasses, cendres… Décryptage des mentions obligatoires pour choisir en confiance.',
    body: `Les étiquettes listent les ingrédients par ordre décroissant de poids. Un bon produit place une source animale claire (poulet, saumon, agneau) en tête de liste.

Repérez la mention « aliment complet » : il couvre tous les besoins nutritionnels sans complément obligatoire. Comparez les protéines brutes (idéalement 25–30 % pour chien actif, 30 %+ pour chat).

Méfiez-vous des termes vagues (« sous-produits animaux » sans précision). Préférez les marques transparentes sur l’origine et les analyses garanties.`,
  },
  {
    title: 'Chien senior : adapter l’alimentation après 7 ans',
    category: 'Chien',
    readMin: 4,
    excerpt: 'Moins de calories, plus de fibres et de soutien articulaire — les bons réflexes pour votre compagnon âgé.',
    body: `Le métabolisme ralentit : réduisez les calories de 10 à 20 % si l’animal prend du poids. Formules « senior » enrichies en glucosamine et acides gras oméga-3.

Fractionnez en 2–3 petits repas pour faciliter la digestion. Surveillez l’appétit : baisse soudaine = consultez le vétérinaire.

Hydratation : pâtée ou croquettes humidifiées si votre chien boit peu.`,
  },
  {
    title: 'Chat d’intérieur : éviter le surpoids',
    category: 'Chat',
    readMin: 6,
    excerpt: 'Jeux, enrichissement alimentaire et rations mesurées : le trio gagnant contre les kilos en trop.',
    body: `Un chat stérilisé d’intérieur brûle peu d’énergie. Utilisez des distributeurs interactifs pour ralentir la prise alimentaire.

Pesez les croquettes avec une balance de cuisine. Les friandises comptent dans le total calorique journalier.

Proposez des sessions de jeu avant le repas du soir : l’activité stimule l’appétit sain et limite l’ennui.`,
  },
  {
    title: 'BARF, croquettes ou mixte : que choisir ?',
    category: 'Comparatif',
    readMin: 7,
    excerpt: 'Avantages et précautions des trois approches alimentaires les plus courantes en Tunisie.',
    body: `Croquettes : pratiques, équilibrées si qualité premium, bonnes pour les dents. Idéales au quotidien pour la majorité des foyers.

BARF (cru) : nécessite recettes équilibrées et hygiène stricte. Consultation vétérinaire recommandée pour éviter carences.

Mixte : croquettes le matin, pâtée le soir — bon compromis hydratation / praticité. Transition toujours progressive.`,
  },
  {
    title: 'Allergies alimentaires : signes et conduite à tenir',
    category: 'Santé',
    readMin: 5,
    excerpt: 'Démangeaisons, otites récidivantes, troubles digestifs — quand suspecter une intolérance ?',
    body: `Signes fréquents : grattage excessif, rougeurs des pattes, otites, vomissements ou selles molles chroniques.

Le vétérinaire peut proposer un régime d’éviction (protéine nouvelle ou hydrolysée) sur 6 à 8 semaines.

Ne changez qu’un paramètre à la fois et évitez friandises et restes de table pendant le test.`,
  },
];

module.exports = { defaultBlogArticles };
