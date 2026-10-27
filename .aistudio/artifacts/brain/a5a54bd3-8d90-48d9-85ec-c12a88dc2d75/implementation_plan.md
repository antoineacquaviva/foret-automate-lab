# Forêt Automate Lab v2 — Recentrage sur les 2 Modes Principaux, Bilan IA Gemini & Spécification YAML Niveau 2

Ce plan recentre l'application sur vos deux besoins opérationnels majeurs en distinguant rigoureusement le **Niveau 2 (Famille d'Automates décrite par un fichier `.yaml` avec options `$sweep`)** et le **Niveau 3 (Instance d'Automate concrète où chaque paramètre et chaque option sont entièrement valorisés)**, tout en intégrant un **Bilan Analytique par IA (Gemini)** après chaque campagne et un **Document Statique de Référence Niveau 2** prêt à être joint à vos discussions externes avec Gemini.

---

## Revue Utilisateur & Décisions Confirmées

> [!IMPORTANT]
> **Distinction fondamentale structurant toute l'interface :**
> - **Niveau 2 (`Famille d'Automates` = 1 fichier `.yaml`)** : Une architecture de règles comportant des paramètres fixes et des plages d'options ouvertes (`$sweep: [...]`). Une famille de Niveau 2 engendre, par produit cartésien de ses options `$sweep`, un ensemble fini d'instances de Niveau 3.
> - **Niveau 3 (`Instance / Variante d'Automate` = 1 automate entièrement valorisé)** : Un automate unique prêt à être joué sur table et simulé par la Machine Virtuelle (encodé en 447 entiers `int32`), dans lequel chaque condition, verbe, seuil, règle de casse et mode Piste 3 possède une valeur unique précise (aucun `$sweep` résiduel).

- **Décision Confirmée 1 (Passerelle Mode 1 → Mode 2)** : En **Mode 1 (Exploratoire Génétique)**, le bilan IA met en avant les **Familles d'Automates (Niveau 2)** émergentes les plus prometteuses et permet en **1 clic** de synthétiser leur fichier `.yaml` de Niveau 2 (avec des plages `$sweep` ciblées autour des gènes champions) et de l'ouvrir directement dans le **Mode 2** pour un test cartésien exhaustif.
- **Décision Confirmée 2 (Produit Cartésien Intégral en Mode 2)** : En **Mode 2 (Test & Optimisation d'une Famille YAML Niveau 2)**, l'outil est configuré par défaut pour évaluer **l'intégralité des instances de Niveau 3 issues du produit cartésien** avec la précision Monte-Carlo maximale (CRN sur les 4 tailles de table `3, 4, 5, 6 joueurs`, les 3 paliers d'effort `30 %, 50 %, 70 %` et les `7 Bots`).
- **Décision Confirmée 3 (Document Statique de Spécification Niveau 2 pour Gemini)** : Un **3ᵉ onglet dédié** dans l'application contient le guide complet et le prompt système de spécification YAML Niveau 2, avec copie en 1 clic dans le presse-papiers et téléchargement en fichier `.md` pour vos pièces jointes Gemini.

---

## 1. Vue d'Ensemble & Architecture des 3 Espaces de Travail

L'interface est épurée et réorganisée autour de **3 onglets principaux** dans la barre supérieure :

1. **`01. Mode 1 · Exploration Génétique (Découverte Niveau 2)`**
   - **Objectif** : Explorer librement l'espace des règles (18 capteurs, 9 verbes, obstacles, casse, élan, retournement 2D6, Piste 3) via l'algorithme évolutionnaire hybride **NSGA-II + MAP-Elites (800 niches écologiques)** afin de faire émerger de nouvelles architectures de jeu.
   - **Configuration par défaut** : Réglée d'office sur la **précision et l'ambition maximales** (`Population = 64 individus/génération`, `Générations = 12`, `Taux de mutation créative NEAT/Occam = 35 %`, `Plafond C_règle = 6.5`, `Fidélité CRN = 80 parties/bot`, `7/7 Bots`, tables `3 à 6 joueurs`).
   - **Clés de compréhension** : Chaque paramètre affiche une fiche explicative claire (*« Qu'est-ce que c'est ? »*, *« Impact si augmenté / diminué »*, *« Valeur recommandée »*).
   - **Bilan IA de Fin de Campagne (Orienté Niveau 2)** : Dès la campagne terminée, Gemini analyse le Front de Pareto 4D et l'archive MAP-Elites pour rédiger un avis éclairé sur les enseignements globaux et présenter **2 à 3 Familles d'Automates (Niveau 2) prometteuses**, en expliquant leur mécanique, leur équilibre et pourquoi elles méritent un test approfondi en Mode 2 (avec bouton **« Générer le YAML Niveau 2 & Ouvrir en Mode 2 »**).

2. **`02. Mode 2 · Test & Optimisation de Famille (.yaml Niveau 2 → Instances Niveau 3)`**
   - **Objectif** : Charger ou importer un fichier **`.yaml` (ou `.json`) de Famille d'Automates (Niveau 2)**, inspecter visuellement les paramètres fixes et les paramètres en `$sweep`, et lancer l'évaluation systématique de **toutes les instances de Niveau 3 générées par produit cartésien**.
   - **Import / Export YAML natif** : Support complet du format `.yaml` lisible par l'humain (et `.json`), avec calcul immédiat du produit cartésien : ex. $2 \times 3 \times 2 \times 2 = 24 \text{ instances de Niveau 3}$.
   - **Configuration par défaut** : Réglée sur **Évaluation Intégrale Haute Précision** de 100 % des instances du produit cartésien (toutes les tables `3, 4, 5, 6 joueurs`, efforts `30 %, 50 %, 70 %`, `80 parties/bot` avec réduction de variance CRN). L'utilisateur garde la main sur chaque curseur avec des clés de compréhension pédagogiques.
   - **Bilan IA de Fin de Campagne (Orienté Niveau 3)** : À l'issue du test cartésien, Gemini analyse le classement complet et la sensibilité paramétrique pour décrire en détail **les meilleures variantes (Instances de Niveau 3 entièrement valorisées)** : comment elles fonctionnent tour par tour sur le plateau, quels choix d'options `$sweep` leur donnent l'avantage sur les autres membres de la famille, et comment les jouer sur table (avec leur **Fiche de Règles Humaines** complète).

3. **`03. Spécification YAML (Niveau 2) pour Gemini (Document PJ)`**
   - **Objectif** : Vous fournir un document statique auto-suffisant, clair et rigoureux à joindre en PJ dans vos conversations avec Gemini lorsque vous concevez de nouvelles idées d'automates.
   - **Contenu du document** :
     - Explication de la distinction **Niveau 2 (Famille `.yaml` avec `$sweep`)** vs **Niveau 3 (Instance valorisée)** ;
     - Grammaire exacte du fichier `.yaml` de Niveau 2 attendu par l'outil ;
     - Dictionnaire complet des **18 Capteurs**, des **9 Verbes primitifs**, des **4 Modes de Parade**, des **Lois de Casse & Élan**, des **Opérateurs de Piste 2D6** et des **3 Modes de Régénération Piste 3** ;
     - Règles d'utilisation de l'opérateur `$sweep: [...]` pour définir un produit cartésien raisonnable (ex. 12 à 256 variantes Niveau 3) ;
     - Exemple complet commenté de fichier `.yaml` de Niveau 2 et instructions système invitant Gemini à vous générer un bloc YAML directement importable dans l'onglet Mode 2.

---

## 2. Expérience Utilisateur & Design Visuel

- **Direction Esthétique** : Laboratoire d'ingénierie ludique haute précision en thème sombre obsidienne (`#090D16` surface principale, `#111827` panneaux structurés, bordures fines `1px solid #1E293B`), typographie `Plus Jakarta Sans` pour la hiérarchie éditoriale, `DM Sans` pour les guides pédagogiques et les bilans IA, et `JetBrains Mono` (`tabular-nums`) pour les métriques scientifiques et le code YAML.
- **Clés de Compréhension Pédagogiques intégrées** :
  - Chaque paramètre de configuration (Population $P$, Générations $G$, Mutation créative NEAT/Occam, Plafond $C_{\text{règle}}$, Fidélité CRN, Tailles de table $J$, Paliers d'effort $\bar{P}$, et les 4 poids $W_1..W_4$ des métriques $M_1..M_4$) comporte un encadré explicatif concis directement lisible sous le contrôle, sans jargon opaque.
- **Distinction Visuelle Niveau 2 vs Niveau 3** :
  - Les éléments de **Niveau 2 (Famille `.yaml` avec options `$sweep`)** sont systématiquement identifiés par l'étiquette **`NIVEAU 2 · FAMILLE (.YAML)`** en ton cyan (`#06B6D4`) avec le compteur de produit cartésien (`N options $sweep → K instances Niveau 3`).
  - Les éléments de **Niveau 3 (Instance d'automate entièrement valorisée)** sont identifiés par l'étiquette **`NIVEAU 3 · INSTANCE VALORISÉE`** en ton émeraude (`#10B981`) avec leur fiche de règles humaines où chaque paramètre a une valeur unique définitive.

---

## 3. Décisions Techniques & Intégration Gemini API

- **Décision 1 : Architecture Serveur Express + SDK `@google/genai` pour le Bilan IA**
  - *Approche choisie* : Mise en place d'un serveur `server.ts` (Express + Vite middleware sur le port 3000) exposant la route `POST /api/gemini/campaign-bilan` utilisant le SDK officiel `@google/genai` (`model: "gemini-3.8-flash"`).
  - *Pourquoi* : Conforme aux bonnes pratiques AI Studio (`process.env.GEMINI_API_KEY` géré côté serveur, sécurité de la clé, et capacité à envoyer un prompt structuré contenant les statistiques exactes de la campagne, le Front de Pareto, les niches MAP-Elites, l'analyse de sensibilité et la traduction française des meilleurs génomes). Si l'application est déployée sur un serveur externe où la variable d'environnement n'est pas encore renseignée, le serveur retourne en secours une synthèse structurée déterministe accompagnée de la procédure de configuration `.env`.
- **Décision 2 : Synthétiseur Automatique de Famille Niveau 2 à partir des Mutants du Mode 1**
  - *Approche choisie* : En fin de Mode 1, un algorithme regroupe les meilleurs automates découverts par style écologique (ex. *Famille Épurée Haute-Maîtrise*, *Famille Cinétique Casse & Élan*, *Famille Piste 3 Sol Intact*) et construit pour chacun un véritable objet **Famille Niveau 2 (`.yaml`)** en plaçant en `$sweep` les 3 à 4 gènes qui différencient les meilleurs représentants du cluster (produisant un produit cartésien ciblé de 16 à 64 instances Niveau 3 prêt à être testé en Mode 2).
- **Décision 3 : Support Natif YAML (`.yaml` / `.yml`) et JSON en Mode 2**
  - *Approche choisie* : Ajout d'un parseur/sérialiseur YAML propre afin que vous puissiez copier-coller ou importer directement les fichiers `.yaml` générés par Gemini lors de vos discussions externes, sans conversion manuelle en JSON.

---

## 4. Architecture Technique & Flux de Données

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                        BARRE DE NAVIGATION SUPÉRIEURE (3 ZONES)                          │
│  [ Forêt Automate Lab v2 ]   [ 01. Mode 1 : Exploration Génétique (Niv.2) ]              │
│                              [ 02. Mode 2 : Test Famille YAML (Niv.2 → Niv.3) ]          │
│                              [ 03. Document Spécification YAML pour Gemini ]             │
└───────────────────┬──────────────────────────────────────────┬───────────────────────────┘
                    │                                          │
                    ▼                                          ▼
┌───────────────────────────────────────────┐  ┌───────────────────────────────────────────┐
│  MODE 1 : EXPLORATION GÉNÉTIQUE MAXIMALE  │  │  MODE 2 : TEST CARTÉSIEN FAMILLE (.YAML)  │
│  • Réglage par défaut : Max Précision     │  │  • Import / Éditeur YAML Niveau 2 ($sweep)│
│  • Clés de compréhension par paramètre    │  │  • Calcul exact du Produit Cartésien      │
│  • NSGA-II + MAP-Elites (800 niches)      │  │  • Évaluation Haute Précision de 100%     │
│  • Greffe de Slot, Élagage d'Occam        │  │    des Instances Niveau 3 générées        │
└───────────────────┬───────────────────────┘  └───────────────────┬───────────────────────┘
                    │                                              │
                    ▼                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                 MOTEUR DE SIMULATION MONTE-CARLO (CRN xorshift64* + 7 BOTS)              │
│     447 int32 · Métriques M1 (Maîtrise), M2 (Adaptation), M3 (Tension), M4 (Simplicité)  │
└───────────────────┬──────────────────────────────────────────┬───────────────────────────┘
                    │                                          │
                    ▼                                          ▼
┌───────────────────────────────────────────┐  ┌───────────────────────────────────────────┐
│   BILAN IA GEMINI — MODE 1 (NIVEAU 2)     │  │   BILAN IA GEMINI — MODE 2 (NIVEAU 3)     │
│  • Enseignements globaux de l'exploration │  │  • Enseignements sur les options $sweep   │
│  • Présentation de 2-3 Familles Niveau 2  │  │  • Analyse détaillée des meilleures       │
│    prometteuses (fonctionnement, qualités)│  │    Instances Niveau 3 (toutes options     │
│  • Bouton 1-clic : "Générer le YAML Niv.2 │  │    valorisées) + Fiche de Règles Humaines │
│    & Tester cette Famille en Mode 2"      │  │  • Export YAML / CSV / Bundle Python OCI  │
└───────────────────────────────────────────┘  └───────────────────────────────────────────┘
```

### Correspondance des Composants Interactifs
- **Panneau de Paramétrage Pédagogique (Modes 1 & 2)** : Réglé par défaut au maximum de précision, avec bouton *« Restaurer la Précision Maximale Recommandée »* et infobulles permanentes détaillant chaque paramètre et chaque métrique $M_1..M_4$.
- **Synthétiseur Niveau 1/3 → Famille Niveau 2 (`.yaml`)** : Regroupe les élites issues du Mode 1 en familles thématiques, génère le YAML avec `$sweep` sur les paramètres clés, et permet soit de le télécharger (`.yaml`), soit de basculer directement en Mode 2 pour lancer son produit cartésien.
- **Service d'Interprétation IA (`POST /api/gemini/campaign-bilan`)** : Envoie le résumé statistique complet de la campagne au modèle Gemini côté serveur et restitue un bilan structuré en français distinguant clairement **Familles de Niveau 2** (en Mode 1) et **Instances valorisées de Niveau 3** (en Mode 2).
- **Page Statique `03. Spécification YAML (Niveau 2) pour Gemini`** : Affiche le document complet formaté avec bouton de copie instantanée et téléchargement `SPEC_FAMILLE_NIVEAU2_POUR_GEMINI.md`.
