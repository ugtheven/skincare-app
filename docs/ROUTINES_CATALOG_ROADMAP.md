# Roadmap routines, catalogue et communauté

## But du document

Découper l'évolution du produit en lots ordonnés et en sessions d'implémentation autonomes.
Chaque session doit pouvoir être lancée dans une conversation fraîche avec un objectif, un périmètre et des critères d'acceptation explicites.

Ce document est la référence détaillée pour le périmètre, l'ordre et les critères d'acceptation des travaux liés aux routines et au catalogue. `docs/PRODUCT.md` reste la source de vérité pour l'intention produit globale et `docs/DECISIONS.md` pour les décisions durables. Les autres résumés produit doivent rester alignés avec cette roadmap sur son périmètre.

## Vision

Le produit vise à réunir trois valeurs :

- identifier et expliquer les produits avec des informations sourcées, sans score universel arbitraire ;
- proposer un catalogue riche, des fiches détaillées et une collection personnelle ;
- servir de journal simple pour les routines et l'évolution de la peau.

La communauté, les notes et les avis appartiennent à la vision long terme. Ils ne doivent pas ralentir la boucle quotidienne du MVP.

## Limites de cette roadmap dans le V1

Cette roadmap ne couvre pas l'implémentation complète de la protection solaire ni des check-ins de peau. Ces fonctionnalités gardent leur place dans le V1 et doivent être détaillées dans des roadmaps dédiées.

Les changements apportés à Aujourd'hui doivent préserver une composition extensible pour afficher, lorsqu'ils sont disponibles :

- le statut de protection solaire pertinent ;
- la prochaine routine ou le prochain check-in utile.

Terminer le lot 1 clôt la boucle quotidienne des routines, pas l'ensemble du V1.

## Décisions déjà prises

### Navigation et scan

- La navigation principale reste : Aujourd'hui, Produits, Progrès.
- Scanner est une action réutilisable, pas un onglet.
- Un scan peut servir uniquement à consulter un produit ; il ne l'ajoute donc jamais implicitement à la collection.
- Le scan doit pouvoir être lancé depuis Produits et depuis l'éditeur de routine.
- Depuis l'éditeur, le résultat propose en priorité d'ajouter le produit à la routine en cours.

### Produits et collection

- Le catalogue partagé et la collection personnelle sont deux concepts distincts.
- « Je l'ai » ajoute un produit à Mes produits.
- Ajouter un produit à une routine l'ajoute aussi automatiquement à Mes produits.
- Un même produit peut être utilisé dans plusieurs étapes ou routines.
- Retirer un produit de Mes produits demande confirmation, transforme ses usages futurs en placeholders de catégorie et préserve l'historique.
- « Je le veux » est prévu avec l'exploration du catalogue, après le cœur des routines.

### Routines

- Une seule routine du matin et une seule routine du soir peuvent être actives.
- Les noms restent « Routine du matin » et « Routine du soir » dans le MVP.
- La planification porte sur chaque étape : tous les jours, certains jours de la semaine ou désactivée temporairement.
- Une étape contient soit un produit précis, soit un placeholder issu de la taxonomie contrôlée des catégories, avec « Autre » comme recours.
- Un placeholder peut être effectué comme une étape normale.
- Une étape ne contient qu'un seul produit.
- Une instruction courte est optionnelle. Quantité et temps d'attente sont différés.
- L'ordre est suggéré à partir de la catégorie, puis reste modifiable.
- Les modifications s'appliquent aux occurrences futures et ne réécrivent jamais l'historique.

### Exécution et historique

- Aujourd'hui ouvre la routine pertinente selon le moment ; l'autre reste accessible sur le même écran.
- Une étape peut être effectuée, annulée ou ignorée pour aujourd'hui.
- Le calendrier distingue : effectuée, partiellement effectuée, ignorée volontairement et non renseignée.
- Le calendrier couvre tout l'historique disponible.
- La saisie rétroactive est différée.
- Un rappel à heure fixe peut être activé séparément pour chaque routine.

## Ordre recommandé

1. **Lot 1 — Boucle quotidienne** : collection, routines, liaison produit, exécution.
2. **Lot 2 — Mémoire** : rappels et calendrier.
3. **Lot 3 — Exploration** : catalogue global, fiches riches et « Je le veux ».
4. **Lot 4 — Communauté** : comptes publics, notes, avis et modération.

Ne pas commencer un lot tant que ses dépendances obligatoires ne sont pas terminées. À l'intérieur d'un lot, chaque session ci-dessous forme un changement cohérent et vérifiable.

| Session | Livrable                                  | Dépend de          | État                    |
| ------- | ----------------------------------------- | ------------------ | ----------------------- |
| 1.1     | Séparation catalogue / possession         | —                  | Terminée le 2026-07-14  |
| 1.2     | Modèle de routine planifiée et historisée | —                  | Terminée le 2026-07-14  |
| 1.3     | Éditeur avec placeholders                 | 1.2                | Terminée le 2026-07-14  |
| 1.4     | Scanner réutilisable                      | 1.1                | Terminée le 2026-07-14  |
| 1.5     | Fiche produit essentielle                 | 1.1, 1.4           | Terminée le 2026-07-14  |
| 1.6     | Recherche textuelle d'un produit          | 1.1, 1.5           | Terminée le 2026-07-14  |
| 1.7     | Liaison produit / routine                 | 1.1 à 1.6          | Terminée le 2026-07-15  |
| 1.8     | Exécution planifiée dans Aujourd'hui      | 1.2, 1.3, 1.7      | Terminée le 2026-07-15  |
| 2.1     | Rappels locaux                            | 1.3                | Prête                   |
| 2.2     | Requêtes d'historique                     | 1.2, 1.8           | Prête après dépendances |
| 2.3     | Calendrier en lecture seule               | 2.2                | Prête après dépendance  |
| 3.0     | Gouvernance et fondations ingrédients     | Lot 1              | Prête après dépendance  |
| 3.1     | API de lecture du catalogue               | 3.0                | Prête après dépendance  |
| 3.2     | Interface Mes produits / Catalogue        | 3.1                | Prête après dépendance  |
| 3.3     | Fiche produit riche unifiée               | 1.5, 3.0, 3.1, 3.2 | Prête après dépendances |
| 3.4     | Liste « Je le veux »                      | 3.2, 3.3           | Prête après dépendances |
| 4.0     | Cadrage communautaire                     | Lot 3              | Plus tard               |

---

## Lot 1 — Boucle quotidienne

### Résultat utilisateur

Une personne peut rechercher, consulter ou scanner un produit, déclarer qu'elle le possède, construire ses routines avec ou sans produits déjà listés, puis effectuer les étapes prévues aujourd'hui.

### Session 1.1 — Séparer catalogue local et possession

**Objectif**

Permettre de consulter ou mettre en cache un produit sans affirmer que l'utilisateur le possède.

**Dans le périmètre**

- Introduire une relation locale de collection distincte des données produit.
- Exposer les opérations : marquer comme possédé, retirer de Mes produits, lister Mes produits, tester la possession.
- Migrer les produits locaux existants vers Mes produits afin de préserver le comportement actuel.
- Conserver les produits en cache quand ils sont retirés de la collection.
- Maintenir les références déjà utilisées par les routines.

**Hors périmètre**

- « Je le veux ».
- Parcours du catalogue global.
- Refonte visuelle complète de l'onglet Produits.
- Gestion du stock, des quantités ou des dates d'ouverture.

**Critères d'acceptation**

- Consulter ou sauvegarder une fiche produit ne modifie pas la collection.
- « Je l'ai » est idempotent.
- Retirer un produit ne supprime ni sa fiche en cache ni les données historiques.
- Une migration conserve tous les produits déjà visibles dans l'application comme possédés.
- Les tests de migration et du repository couvrent ajout, retrait, doublon et conservation des références.

**Risques à vérifier**

- La table locale `products` sert actuellement à la fois de cache et de collection.
- Les clés étrangères des étapes ne doivent pas être cassées.

### Session 1.2 — Étendre le modèle des routines

**Objectif**

Créer le contrat de domaine nécessaire à la planification, aux placeholders, aux instructions et à un historique immuable.

**Dans le périmètre**

- Garantir au maximum une routine active par période, matin ou soir.
- Ajouter aux étapes : catégorie contrôlée, produit optionnel, instruction optionnelle, position, état actif et jours sélectionnés.
- Ajouter le statut journalier d'une étape : effectuée ou ignorée ; l'absence de ligne signifie non renseignée.
- Prévoir des révisions ou snapshots datés afin qu'une modification ne change pas les jours passés.
- Migrer les étapes existantes : catégorie reconnue quand possible, sinon « Autre ».
- Préserver la règle existante qui rattache une routine du soir au jour précédent jusqu'à 04:00.

**Hors périmètre**

- Écrans d'édition.
- Calendrier.
- Saisie rétroactive.
- Cycles « tous les X jours ».

**Critères d'acceptation**

- Une étape peut être prévue tous les jours, certains jours ou être désactivée.
- Une étape peut rester un placeholder sans `productId`.
- Les anciennes complétions restent lisibles après migration.
- Modifier une routine crée un état futur sans réécrire l'état historique.
- Les requêtes de domaine retournent les étapes attendues pour une date locale donnée.
- Les tests couvrent changement de semaine, dimanche/lundi, passage après minuit et horaire d'été.

**Décision à prendre dans cette session**

Choisir le mécanisme technique de révision après inspection du schéma. La solution doit préserver tout le passé, y compris les jours où l'application n'a pas été ouverte. Documenter ce choix dans `docs/DECISIONS.md`.

### Session 1.3 — Créer et modifier les routines avec des placeholders

**Objectif**

Permettre de construire une routine complète avant d'avoir listé tous ses produits.

**Dans le périmètre**

- Créer la routine du matin ou du soir lorsqu'elle manque.
- Modifier une routine existante.
- Ajouter une étape depuis la taxonomie contrôlée, avec « Autre ».
- Réordonner les étapes.
- Configurer tous les jours, certains jours ou désactivée.
- Ajouter une instruction courte optionnelle.
- Supprimer une étape avec confirmation lorsque nécessaire.
- Utiliser les noms fixes « Routine du matin » et « Routine du soir ».

**Hors périmètre**

- Liaison à un produit.
- Compatibilité entre produits.
- Quantité, temps d'attente et répétition complexe.

**Critères d'acceptation**

- Une routine peut être créée et réouverte après redémarrage.
- Chaque placeholder est affiché avec sa catégorie et son planning.
- L'ordre enregistré est stable.
- Une routine vide ne peut pas être enregistrée sans avertissement clair.
- Les contrôles respectent Dynamic Type, VoiceOver, Reduce Motion et une cible tactile de 44 pt minimum.
- Les tests couvrent création, modification, réorganisation, suppression et validation.

### Session 1.4 — Rendre le scan réutilisable

**Objectif**

Découpler le scanner de l'intention « ajouter à Mes produits » sans ajouter un onglet.

**Dans le périmètre**

- Faire du scanner un parcours réutilisable avec un contexte d'origine.
- Ouvrir le scanner depuis Produits.
- Préparer une origine « éditeur de routine » sans encore implémenter la liaison complète.
- Après une correspondance fiable ou la confirmation d'un candidat, ouvrir une fiche résultat consultable.
- Proposer « Je l'ai » sans l'activer automatiquement.
- Conserver le retour iOS et l'état de l'écran d'origine.

**Hors périmètre**

- Nouvel onglet Scan.
- Historique des scans.
- « Je le veux ».
- Ajout final à une routine, traité en session 1.7.

**Critères d'acceptation**

- Scanner depuis Produits puis fermer la fiche ne change pas Mes produits.
- « Je l'ai » ajoute le produit une seule fois.
- Annuler le scanner revient à l'écran d'origine sans perte de contexte.
- Les flux barcode, OCR, saisie manuelle et erreurs existants restent fonctionnels.
- Une correspondance incertaine demande confirmation avant l'ouverture de la fiche.
- Une suggestion issue d'une photo de packaging sans packshot normalisé reste dans un état explicite et réessayable ; un résultat barcode peut ouvrir sa fiche puis s'enrichir en place sans bloquer l'enregistrement.
- Aucun contrôle global de navigation n'est utilisé comme une action de scan déguisée.

### Session 1.5 — Créer la fiche produit essentielle du V1

**Objectif**

Donner une destination utile et compréhensible à tout produit consulté, sans attendre l'exploration complète du catalogue.

**Dans le périmètre**

- Utiliser la même fiche essentielle après un scan, une recherche textuelle ou l'ouverture d'un produit local.
- Étendre le contrat produit avec des champs optionnels et sourcés pour l'usage, les précautions et la confiance, sans rendre la saisie manuelle dépendante de ces données.
- Présenter l'identité, la catégorie, l'usage ou le rôle du produit, les ingrédients clés disponibles, les précautions vérifiées et le niveau de confiance.
- Afficher la provenance et l'incertitude des informations disponibles.
- Fournir un résumé simple avec détail progressif.
- Proposer « Je l'ai » et préparer le contrat d'action contextuelle utilisé plus tard par « Ajouter à une routine », sans afficher de contrôle inactif.
- Préserver l'absence d'information plutôt que produire une explication non sourcée.

**Hors périmètre**

- Parcours paginé du catalogue partagé.
- Liste « Je le veux ».
- Moteur complet d'alertes réglementaires ou scientifiques.
- Avis, notes ou recommandations commerciales.

**Critères d'acceptation**

- Les parcours scan, recherche et produit local ouvrent le même contrat de fiche.
- Consulter la fiche ne modifie jamais la collection.
- Les sources et la confiance sont visibles sans imposer tous les détails.
- Une donnée absente est présentée comme indisponible, jamais inventée.
- Aucun score global « bon » ou « mauvais » n'est affiché.

### Session 1.6 — Ajouter un produit par recherche textuelle

**Objectif**

Permettre l'ajout V1 par nom ou marque sans attendre le catalogue global parcourable.

**Dans le périmètre**

- Lancer une recherche depuis Produits avec un texte saisi manuellement.
- Rechercher dans le cache local, puis le catalogue partagé et les sources publiques gratuites autorisées.
- Afficher des candidats compatibles avec les contraintes d'identité et demander confirmation lorsque le résultat est incertain.
- Ouvrir la fiche essentielle après sélection ou correspondance fiable.
- Permettre ensuite « Je l'ai » sans doublon ; l'association à une routine reste traitée en session 1.7.
- Préserver provenance, licence, confiance et états d'erreur explicites.

**Hors périmètre**

- Navigation libre et paginée dans tout le catalogue.
- Filtres avancés.
- Appel automatique à un fournisseur visuel payant à partir du texte saisi.
- « Je le veux ».

**Critères d'acceptation**

- Une recherche par marque et nom peut retrouver un produit local ou partagé.
- Un résultat incertain n'est jamais choisi silencieusement.
- Une absence de résultat permet de reformuler, scanner ou saisir manuellement le produit.
- Ouvrir ou fermer un résultat ne change pas Mes produits.
- Les règles de variantes critiques et de provenance existantes restent appliquées.

### Session 1.7 — Lier les produits aux routines

**Objectif**

Ajouter un produit précis à une routine depuis les deux points d'entrée convenus.

**Dans le périmètre**

- Depuis l'éditeur : choisir dans Mes produits ou scanner un nouveau produit.
- Depuis une fiche produit : choisir matin ou soir, puis les jours d'utilisation.
- Ajouter automatiquement le produit à Mes produits lorsqu'il rejoint une routine.
- Insérer l'étape à la position suggérée par sa catégorie.
- Permettre ensuite la réorganisation manuelle.
- Remplacer un placeholder compatible par le produit choisi, sans perdre planning ni instruction.
- Autoriser le même produit dans plusieurs étapes.
- Lors du retrait de Mes produits, demander confirmation puis convertir les usages futurs en placeholders.

**Hors périmètre**

- Détection de compatibilité ou de conflits.
- Choix entre plusieurs produits au moment d'effectuer la routine.
- Recommandations commerciales ou alternatives sponsorisées.

**Critères d'acceptation**

- Les deux points d'entrée produisent la même donnée finale.
- Le produit apparaît dans Mes produits et dans la routine attendue.
- La position suggérée est déterministe et modifiable.
- Remplacer un placeholder conserve ses jours et son instruction.
- Retirer un produit ne modifie que les occurrences futures.
- L'historique conserve le nom et le produit utilisés à l'époque.

### Session 1.8 — Adapter Aujourd'hui à la planification

**Objectif**

Rendre la routine prévue immédiatement exécutable, sans bruit ni culpabilisation.

**Dans le périmètre**

- Ouvrir la routine pertinente selon le moment de la journée.
- Garder l'autre routine accessible sur le même écran.
- Afficher uniquement les étapes actives prévues ce jour.
- Afficher correctement placeholders et produits.
- Effectuer, annuler ou ignorer une étape en un geste clair.
- Calculer la progression de la routine et l'état agrégé de la journée.
- Conserver la règle de soirée jusqu'à 04:00.
- Préserver des emplacements clairs pour le statut solaire et la prochaine action utile définis par les autres chantiers V1.

**Hors périmètre**

- Calendrier.
- Saisie rétroactive.
- Statistiques de régularité.
- Gamification ou séries.

**Critères d'acceptation**

- Une étape non prévue aujourd'hui n'apparaît pas.
- Un placeholder est entièrement exécutable.
- Effectuer, ignorer et annuler survivent au redémarrage.
- La routine secondaire reste atteignable sans changer d'onglet.
- Les quatre états de journée peuvent être dérivés sans traiter « non renseignée » comme un échec.
- La structure d'Aujourd'hui peut accueillir le statut solaire et le prochain check-in sans refonte de la routine.
- Les interactions sont testées avec VoiceOver, Dynamic Type et Reduce Motion.

### Définition de fin du lot 1

- Le parcours recherche, scan ou consultation → Je l'ai → ajout à une routine → exécution aujourd'hui fonctionne de bout en bout.
- Le parcours placeholder → liaison ultérieure à un produit fonctionne sans perte de planning.
- Les migrations préservent les données existantes.
- L'historique passé ne change pas après modification ou retrait d'un produit.
- `npm run check` passe et l'interface est vérifiée sur un écran iPhone représentatif.

---

## Lot 2 — Mémoire

### Résultat utilisateur

La personne peut recevoir un rappel simple et revoir tout son historique sans score culpabilisant.

### Session 2.1 — Rappels locaux par routine

**Objectif**

Permettre un rappel optionnel à heure fixe pour le matin et le soir.

**Dans le périmètre**

- Activation séparée par routine.
- Choix d'une heure locale.
- Demande de permission au moment utile, jamais au premier lancement sans contexte.
- Replanification après changement d'heure ou de fuseau.
- Aucun rappel intelligent ni fréquence avancée.

**Critères d'acceptation**

- Les rappels sont désactivés par défaut.
- Refuser la permission ne bloque aucune routine.
- Désactiver ou modifier une heure remplace correctement la notification planifiée.
- Une routine sans étape prévue ne produit pas de message trompeur.
- Les textes restent neutres et sans culpabilisation.

### Session 2.2 — Requêtes d'historique et états de journée

**Objectif**

Fournir au calendrier une source fiable, indépendante des définitions actuelles des routines.

**Dans le périmètre**

- Interroger une plage de dates.
- Calculer : effectuée, partiellement effectuée, ignorée volontairement, non renseignée.
- Retourner le snapshot des étapes attendu pour chaque date.
- Gérer les jours sans aucune étape planifiée séparément des jours non renseignés.

**Règles d'agrégation**

- Effectuée : toutes les étapes prévues sont effectuées.
- Partiellement effectuée : au moins une étape est effectuée, mais pas toutes.
- Ignorée volontairement : toutes les étapes prévues sont explicitement ignorées.
- Non renseignée : aucune étape n'est effectuée et la journée n'est pas entièrement ignorée.
- Sans routine prévue : état neutre distinct, non affiché comme « non renseignée ».

**Critères d'acceptation**

- Les résultats restent identiques après modification de la routine actuelle.
- Les semaines sans utilisation n'exigent pas de lignes quotidiennes précréées.
- Les calculs de période utilisent le calendrier local.
- Les tests couvrent les quatre états et les jours sans routine prévue.

### Session 2.3 — Calendrier complet en lecture seule

**Objectif**

Permettre de parcourir l'historique complet et d'ouvrir le détail d'une journée.

**Dans le périmètre**

- Calendrier mensuel navigable.
- Quatre états accessibles sans dépendre uniquement de la couleur.
- Détail d'un jour avec routine, étapes et statuts historiques.
- Accès secondaire depuis Aujourd'hui, afin de ne pas surcharger l'onglet Progrès.
- Lecture seule.

**Hors périmètre**

- Modification rétroactive.
- Taux de régularité, séries ou objectifs.
- Corrélation avec l'état de la peau.

**Critères d'acceptation**

- Tout mois contenant des données est atteignable.
- Les quatre états ont un libellé ou un symbole distinct.
- Un jour sans étape prévue n'est pas confondu avec un oubli.
- Le détail historique utilise le snapshot de la date.
- Les grands réglages Dynamic Type restent navigables.

### Définition de fin du lot 2

- Les rappels sont optionnels et robustes aux permissions.
- Tout l'historique peut être consulté sans pouvoir être réécrit.
- Aucun écran ne transforme l'absence de donnée en reproche.
- `npm run check` passe et le calendrier est vérifié visuellement sur iPhone.

---

## Lot 3 — Exploration du catalogue

### Résultat utilisateur

La personne peut parcourir le catalogue partagé, consulter une fiche riche et organiser les produits qu'elle possède ou souhaite essayer.

### Fondations existantes à préserver

- L'application mobile n'écrit pas directement dans les tables partagées.
- Les nouvelles propositions et corrections restent en attente jusqu'à revue.
- Les images et formules conservent leur provenance ; Google Web Detection ne confère aucun droit de réutilisation.
- Les images brutes, charges base64 et textes OCR ne sont jamais journalisés.
- Les règles de consentement, quotas, kill switches et fournisseurs approuvés déjà acceptées restent applicables.

### Session 3.0 — Finaliser la gouvernance et les fondations ingrédients

**Objectif**

Rendre le catalogue public et les futures alertes vérifiables avant de les exposer dans une fiche riche.

**Dans le périmètre**

- Définir les champs minimum permettant de publier une fiche partagée.
- Finaliser le passage d'une proposition en attente vers un produit publié, avec revue, correction et retrait.
- Confirmer les sources et licences utilisables en production et terminer la revue légale nécessaire.
- Versionner les formules par produit, marché et période de validité sans écraser une formule historique.
- Versionner les règles réglementaires ou scientifiques avec source, juridiction, date de publication, conditions d'usage et niveau d'incertitude.
- Distinguer interdiction, restriction conditionnelle, allergène étiqueté, recommandation officielle et évaluation en cours.
- Définir la stratégie de pagination et de recherche côté serveur.

**Hors périmètre**

- Score universel de produit.
- Diagnostic, prescription ou conclusion de danger à partir d'un nom INCI seul.
- Alertes personnalisées fondées sur des données de santé sans cadrage local-first dédié.

**Critères d'acceptation**

- Une nouvelle formule crée une version datée au lieu de remplacer silencieusement la précédente.
- Toute alerte affichable peut être reliée à une formule, une règle et une source versionnées.
- Une règle sans contexte suffisant ne produit pas de conclusion produit.
- Les statuts de publication et de retrait sont documentés et testables.
- La revue des licences distingue données, images et formules.

### Session 3.1 — API de lecture du catalogue

- Recherche paginée dans le catalogue partagé.
- Filtres initiaux limités à marque et catégorie.
- États de chargement, erreur, absence de résultat et mode hors ligne explicites.
- Aucune écriture directe de l'application dans les tables partagées.

### Session 3.2 — Interface Mes produits / Catalogue

- Mes produits reste la vue par défaut.
- Catalogue est accessible depuis le haut de l'onglet Produits.
- Recherche, résultats paginés et fiche produit partagée.
- Scanner reste une action visible, jamais un onglet.
- Aucun contrôle Catalogue inactif ne doit être livré avant cette session.

### Session 3.3 — Fiche produit riche unifiée

- Même destination après scan, recherche ou ouverture depuis une routine.
- Identité, catégorie, usage, formule, provenance, confiance et alertes sourcées.
- Actions contextuelles : Je l'ai, Ajouter à une routine, Je le veux.
- Détail progressif pour ne pas ralentir les utilisateurs expérimentés.
- Afficher une alerte uniquement lorsque les fondations de la session 3.0 fournissent une formule, une règle et un contexte suffisants ; sinon montrer l'information disponible sans verdict.
- Aucun score global « bon » ou « mauvais ».

### Session 3.4 — Liste « Je le veux »

- État personnel distinct de « Je l'ai ».
- Ajout et retrait depuis la fiche.
- Vues filtrées dans Produits.
- Passer de « Je le veux » à « Je l'ai » sans doublon.
- Données locales-first tant qu'un compte n'est pas nécessaire.

### Définition de fin du lot 3

- Le catalogue est parcourable sans scanner.
- Une même fiche produit est utilisée dans tous les parcours.
- Possession et souhait sont distincts du cache technique.
- Les formules et règles utilisées pour une alerte sont versionnées et auditables.
- Les sources et incertitudes restent visibles.
- `npm run check` passe et les listes sont vérifiées avec de grands volumes simulés.

---

## Lot 4 — Communauté

### Statut

Vision long terme, non prête à être implémentée. Commencer par une session de cadrage dédiée, pas par du code.

### Raisons

- Les notes et avis demandent des comptes, de la modération, du signalement et des règles anti-abus.
- Une note brute peut être trompeuse si elle mélange des usages, types de peau et attentes différents.
- La masse critique conditionne l'utilité de l'expérience.
- Les données liées à la peau peuvent être sensibles et ne doivent pas devenir publiques par défaut.

### Session 4.0 — Cadrage communautaire obligatoire

Décider avant toute implémentation :

- ce qui est noté : satisfaction globale, texture, tolérance, rapport qualité-prix ou autre ;
- si un avis textuel est nécessaire dès la première version ;
- quelles informations de profil peuvent contextualiser un avis sans exposer de données sensibles ;
- quelles règles de modération, suppression, signalement et droit de réponse s'appliquent ;
- si les contributions sont publiques, pseudonymes ou privées par défaut ;
- comment éviter les affirmations médicales et la manipulation commerciale ;
- quel seuil minimal de contributions est requis avant d'afficher un agrégat.

### Ordre d'implémentation envisagé après cadrage

1. Comptes et profil public minimal.
2. Modèle de notes contextualisées.
3. Dépôt, modification et suppression de sa contribution.
4. Signalement et file de modération.
5. Agrégats avec seuil de confidentialité et d'échantillon.
6. Avis textuels, seulement si la modération est opérationnelle.

---

## Sujets explicitement différés

- Saisie ou correction rétroactive d'une routine.
- Cycles complexes ou planification « tous les X jours ».
- Quantité appliquée et temps d'attente.
- Choix d'un produit alternatif au moment d'effectuer une étape.
- Analyse automatique du visage ou diagnostic.
- Score universel de produit.
- Compatibilité garantie entre produits.
- Stock, quantité restante et date d'ouverture.
- Historique des scans.
- Statistiques causales reliant un produit à une évolution de peau.

## Modèle de lancement d'une session fraîche

Copier le bloc suivant et remplacer les champs avec la session choisie :

```text
Goal:
Implémenter la session X.Y de docs/ROUTINES_CATALOG_ROADMAP.md.

User outcome:
<reprendre le résultat utilisateur de la session>

In scope:
<reprendre la section Dans le périmètre>

Out of scope:
<reprendre la section Hors périmètre>

Acceptance criteria:
<reprendre les critères d'acceptation>

Constraints or references:
- Lire docs/PRODUCT.md, docs/WORKFLOW.md, docs/DECISIONS.md et, pour tout travail produit, docs/SHARED_PRODUCT_CATALOG.md.
- Suivre PLAN -> STEP -> REVIEW -> FIX -> NEXT.
- Utiliser le skill projet $impeccable pour toute interface.
- Préserver les données locales existantes et ajouter les migrations nécessaires.
- Exécuter npm run check avant de considérer la session terminée.
- Ne pas commencer la session suivante.
```

## Règle de mise à jour

Après chaque session terminée :

- cocher ou annoter la session avec la date et le commit éventuel ;
- ajouter toute décision durable dans `docs/DECISIONS.md` ;
- mettre à jour ce document si une dépendance ou un risque a changé ;
- ne déplacer une fonctionnalité entre lots qu'après une décision produit explicite.
