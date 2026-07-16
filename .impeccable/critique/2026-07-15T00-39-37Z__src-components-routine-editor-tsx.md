---
target: Lot 1 — routines, liaison produit et page Aujourd’hui (Scan gelé)
total_score: 22
p0_count: 0
p1_count: 6
timestamp: 2026-07-15T00-39-37Z
slug: src-components-routine-editor-tsx
---

Method: dual-agent (A: /root/ux_review · B: /root/technical_audit)

# Revue du lot 1 — Routines et Aujourd’hui

## Design Health Score

| #         | Heuristique                            |     Score | Problème clé                                                                                                      |
| --------- | -------------------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------- |
| 1         | Visibilité de l’état                   |       3/4 | Les actions sont confirmées, mais Aujourd’hui peut afficher des données périmées et deux statuts contradictoires. |
| 2         | Correspondance avec le monde réel      |       2/4 | « Placeholder », « version future » et l’icône de chaîne exposent le modèle technique.                            |
| 3         | Contrôle et liberté                    |       3/4 | Undo et alertes sont solides ; les sous-vues imposent trop de retours.                                            |
| 4         | Cohérence et standards                 |       2/4 | Les tabs et SF Symbols sont familiers, l’éditeur et son retour ne suivent pas une pile iOS.                       |
| 5         | Prévention des erreurs                 |       3/4 | Routine vide, jours absents, suppression et brouillon sont bien gardés.                                           |
| 6         | Reconnaissance plutôt que mémorisation |       2/4 | La période et l’étape qui motivent l’action sont perdues en entrant dans la gestion.                              |
| 7         | Flexibilité et efficacité              |       1/4 | Pas d’entrée contextuelle, réordonnancement par flèches et liaison produit trop profonde.                         |
| 8         | Esthétique et minimalisme              |       2/4 | Ensemble calme, mais hiérarchie uniforme, grande image générique et trop d’actions visibles.                      |
| 9         | Diagnostic et récupération d’erreur    |       3/4 | Messages neutres, réessai et conservation du brouillon sont réussis.                                              |
| 10        | Aide et documentation                  |       1/4 | L’aide contextuelle n’explique ni le choix produit/catégorie ni la liaison.                                       |
| **Total** |                                        | **22/40** | **Acceptable — fondation solide, travail significatif avant une perception premium.**                             |

## Verdict anti-patterns

**Évaluation visuelle :** pas de gros « slop IA ». L’app évite gradients textuels, glassmorphism, gamification et grilles de cartes. Elle reste toutefois anonyme : photo de salle de bain blanche avec eucalyptus, surfaces bleu pâle et boutons presque identiques composent une esthétique wellness prévisible. Le manque de premium vient surtout de la friction et de la hiérarchie, pas d’un manque de décoration.

**Scan déterministe :** `detect.mjs` a renvoyé `[]` (0 hit) sur les trois fichiers React Native. Le détecteur analyse HTML/CSS et ne sait pas interpréter les styles React Native ; ce résultat n’est donc pas une preuve d’absence de défauts. Aucun faux positif exploitable.

**Preuve visuelle :** inspection sur iPhone 17 Pro, iOS 26.4, des parcours onboarding, ajout d’étape, planning, liaison produit hors Scan, exécution et bascule matin/soir. Aucun overlay navigateur n’a été injecté, la cible étant native.

## Impression générale

La base est fiable, calme et déjà plus accessible que beaucoup de MVP. Aujourd’hui est efficace une fois la routine construite. En revanche, l’édition ressemble à une succession de vues techniques : l’utilisateur perd le contexte, re-sélectionne matin/soir, interprète plusieurs icônes, traverse un planning parfois inutile puis sauvegarde et ferme manuellement. La plus grande opportunité est de faire de « premium » un synonyme de parcours court et natif.

## Ce qui fonctionne

1. La boucle quotidienne est rapide : effectuer, ignorer et annuler sont explicites, en un geste, avec progression et libellés non dépendants de la couleur.
2. Les garde-fous sont sérieux : brouillon non enregistré, suppression, routine vide, jours absents, erreur conservant les modifications et rollback optimiste.
3. La persistance est bien structurée : révisions futures, transactions de possession et conservation du planning/instruction lors du remplacement d’une étape sans produit.

## Revue de code — constats bloquant la suite

### [P1] Aujourd’hui n’est pas invalidé au focus ni aux changements temporels

`useRoutine` ne recharge qu’au montage ou via `refresh` (`src/hooks/use-routine.ts:28`). Les tabs restent montés : un produit ajouté à une routine depuis Produits peut ne pas apparaître au retour, et l’app laissée ouverte peut garder la mauvaise période à 18 h, 04 h ou minuit. Rafraîchir au focus, au retour au premier plan et aux bornes de période, sans vider le contenu courant. Ajouter les tests de cycle de vie correspondants.

### [P1] Une nouvelle routine est antidatée à l’an 1

`createRoutine` insère sa première révision avec `LEGACY_EFFECTIVE_FROM = '0001-01-01'` (`src/data/sqlite-routine-repository.ts:29`, `src/data/sqlite-routine-repository.ts:491`). Comme `getOccurrenceForDate` prend la dernière révision antérieure à la date demandée (`src/data/sqlite-routine-repository.ts:453`), le futur calendrier fera paraître la routine existante avant sa création. Réserver la date legacy aux migrations ; dater toute nouvelle routine de sa vraie date locale de création. Ajouter un test d’intégration « date avant création = aucune occurrence ».

### [P2] Les mutations optimistes n’ont pas de règle de concurrence

`setStepStatus` capture `occurrences`, n’expose aucun état en cours par étape et ne force aucun refresh final (`src/hooks/use-routine.ts:68`). Des taps rapides effectuer/ignorer/annuler peuvent diverger temporairement de SQLite. Employer un updater fonctionnel et une règle explicite de sérialisation ou de dernière intention gagnante, avec test de réponses hors ordre.

### [P2] Les preuves automatisées restent trop unitaires

La gate complète passe (27 suites, 242 tests) et les tests ciblés passent. Les tests SQLite mockent toutefois les appels SQL ; aucun test ne couvre base réelle, focus d’onglet, AppState, changement de jour, concurrence optimiste, focus VoiceOver ou grandes tailles Dynamic Type.

## Problèmes UX/UI prioritaires

### [P1] La gestion des routines perd le contexte

Depuis Aujourd’hui, « Modifier mes routines » ouvre une liste matin/soir, puis l’utilisateur doit retrouver sa routine et son étape. Après sauvegarde, il revient au manager et doit fermer. Ajouter des entrées contextuelles : « Créer la routine du soir », « Choisir un produit » sur l’étape sans produit, « Modifier cette routine ». Ouvrir directement la bonne destination dans une stack ou une sheet iOS et revenir à Aujourd’hui après sauvegarde.

### [P1] La liaison produit est cachée et inutilement profonde

La petite icône chaîne est noyée avec monter, descendre et supprimer (`src/components/routine-editor.tsx:596`). Le remplacement d’une étape compatible ouvre tout de même le planning alors que jours et instruction sont déjà conservés (`src/components/routine-editor.tsx:394`). Remplacer l’icône par « Choisir un produit », confirmer inline et revenir directement à la liste. Dans l’état vide du picker, proposer recherche et saisie manuelle autour du Scan inchangé.

### [P1] Le modèle visible expose la structure interne

« Ajouter un produit » et « Ajouter un placeholder » ont le même poids, alors qu’un débutant pense simplement « ajouter une étape ». Utiliser une action primaire unique, puis proposer « Choisir un produit » et « Ajouter sans produit ». Renommer partout « placeholder » en « étape sans produit ». Passer les actions rares en swipe/menu et le réordonnancement en mode dédié avec drag handle accessible.

### [P1] Aujourd’hui mélange le jour global et la routine sélectionnée

Le header agrège matin et soir, tandis que le contenu montre une seule période. Le test visuel montre « Toutes les étapes prévues sont effectuées » au-dessus de « Routine non créée » lorsque Soir est sélectionné. Choisir un niveau principal, supprimer le doublon de succès et donner aux états vides un CTA direct.

### [P2] La finition premium doit venir après la simplification

Le header photo de 300 pt consomme une grande part de l’écran et ressemble à un visuel wellness générique. Les tokens runtime divergent de `DESIGN.md`, l’éditeur répète des valeurs brutes et la complétion n’a ni haptique ni micro-transition. Une fois le parcours raccourci : réduire ou rendre contextuel le header, aligner les tokens et ajouter un feedback 150–200 ms avec comportement Reduce Motion.

## Charge cognitive

**Élevée : 4 échecs sur 8.** Groupement, découpage et divulgation progressive sont bons. Échouent : focus unique, hiérarchie visuelle, nombre minimal de choix et mémoire de travail. Une ligne d’étape peut exposer cinq actions ; le picker présente 11 catégories d’un bloc ; le chemin observé pour relier un produit oblige à reconstituer le contexte sur plusieurs écrans.

## Parcours émotionnel

- **Entrée :** calme et non culpabilisante, mais aucun premier pas n’est recommandé.
- **Construction :** la confiance baisse au choix produit/placeholder et dans la liste de catégories.
- **Liaison :** principale vallée ; action cachée, picker vide et planning parfois inutile.
- **Exécution :** meilleur moment produit ; rapide, clair, accessible.
- **Fin :** plate ; succès répété, espace vide important et aucun feedback tactile signature.

## Red flags personas

### Jordan — première utilisation

Hésite entre produit et placeholder, doit comprendre l’icône chaîne, parcourt 11 catégories et ne voit que Scan lorsque la collection compatible est vide.

### Casey — mobile et souvent interrompu

Le chemin vers la liaison produit comporte trop de vues ; la sauvegarde descend avec la liste ; le brouillon n’est pas persisté avant enregistrement ; quatre icônes adjacentes augmentent le risque d’erreur.

### Sam — VoiceOver / grande taille de texte

Les labels et cibles tactiles sont globalement bons. En revanche, chaque étape produit jusqu’à cinq arrêts, les changements de sous-vue ne pilotent pas le focus et les géométries fixes n’ont pas été validées aux tailles d’accessibilité.

## Observations mineures

- « Prévue Mardi 14 Juillet » est moins naturel que « Prévue mardi 14 juillet ».
- La navigation dit « Progression », la source produit « Progrès ».
- Le compteur `0/120` ajoute du bruit avant la saisie.
- « Certains jours » sélectionne lundi–vendredi sans annoncer ce défaut.
- Le sélecteur de produits monte toute la collection dans un `ScrollView` ; il devra devenir une liste virtualisée avec recherche.
- Aujourd’hui importe statiquement la route Produits monolithique via `RoutineProductScanner`, augmentant le couplage avec le périmètre gelé.

## Questions à considérer

1. Le seul modèle visible peut-il devenir « Ajouter une étape », produit et catégorie n’étant que deux façons de la remplir ?
2. Un produit lié depuis Aujourd’hui doit-il revenir directement à la checklist, sans passer par le manager et le planning conservé ?
3. Souhaites-tu conserver une photo d’ambiance forte sur Aujourd’hui, ou faire porter la signature premium par la typographie, le rythme et la micro-interaction ?
4. Pour le prochain chantier, faut-il corriger seulement les P1 ou reprendre tout le parcours routines + Aujourd’hui avant le lot 2 ?
