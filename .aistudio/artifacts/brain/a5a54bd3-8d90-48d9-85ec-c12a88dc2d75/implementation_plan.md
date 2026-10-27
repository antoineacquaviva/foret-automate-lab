# Forêt Automate Lab v2 — Plateforme d'Exploration Génétique & Banc d'Essai Multi-Fidélité

Refonte intégrale de **Forêt Automate Lab** vers l'architecture V2 en 3 niveaux d'abstraction (Méta-Modèle VM compilé, Langage Déclaratif de Famille `$sweep`, Génome plat de 447 `int32`), combinant un moteur d'exécution Web haute vitesse (TypedArrays) avec un générateur de bundle Python/Numba autonome pour votre instance Oracle Cloud (`VM.Standard.E5.Flex` 16 vCPUs).

## User Review & Critical Decisions

> [!IMPORTANT]
> Les choix d'architecture et de périmètre confirmés lors de la phase de clarification gouvernent l'implémentation de cette V2 :

- **Architecture Hybride Web + Export Python/Numba OCI (Confirmé)** : Toute la chaîne V2 (VM Niveau 1, Compilateur DSL Niveau 2, Génome 447 `int32` Niveau 3, 7 Bots `B0..B4`, Métriques `M1..M4`, Entonnoir Multi-Fidélité à 3 étages et Algorithme Génétique NSGA-II + MAP-Elites) tourne directement dans l'application Web en temps réel ET dispose d'un exporteur dédié générant les scripts Python/Numba (`vm_engine.py`, `dsl_compiler.py`, `bots.py`, `metrics_v2.py`, `qd_evolution.py`, `run_oci_v2.sh`) prêts à exécuter sur votre VM Oracle 16 vCPUs.
- **Bibliothèque de 3 Familles d'Automates de Niveau 2 Pré-chargées (Confirmé)** :
  1. `Famille_4Tactiques_Enlisement_Piste3` : 4 tactiques sans tri de pistes, enlisement sur case vide, redressement final Piste 3 (`1_PER_CELL` vs `INTACT_SOIL_ONLY`).
  2. `Famille_Casse_Elan_Doubles` : Lois de casse mécanique (`ON_2_PARRIES_IN_TURN`, `ON_PARRY_DURING_DOUBLE`), pénalités de réparation, statut d'élan (`Status = +1`) et retournement `FLIP_RECTO_VERSO`.
  3. `Famille_Exploration_Genetique_Totale` : Biomes asymétriques à somme constante (`12a`), pondérations spatiales progressives $W_c$, obstacles naturels (Rivière et Pont logistique), rebonds en bout de piste (`BOUNCE_AND_FLIP_ROLE`) et 6 tactiques.
- **Double Moteur d'Exploration par Défaut (Confirmé)** : Le configurateur de campagne (Vue 2) permet de basculer à tout moment entre le **Mode Grille Cartésienne Multi-Fidélité (Successive Halving Rungs 1–2–3, accélération 11,48×)** et le **Mode Évolutionnaire Quality-Diversity (NSGA-II + Archive MAP-Elites de 800 niches écologiques $10 \times 10 \times 8$)**.

---

## 1. Overview & Core Concept

- **What It Does** : Un laboratoire de conception et de calibration scientifique pour le jeu coopératif *Les Défenseurs de la Forêt* (3 à 6 joueurs). Il découple la physique immuable du plateau (Niveau 1) des familles de règles paramétrées en YAML/JSON avec opérateurs `$sweep` (Niveau 2) et compile chaque variante en un génome binaire de 447 entiers `int32` (Niveau 3) évalué face à 7 Bots joueurs autonomes (`B0` à `B4`) sous contrainte stricte d'Iso-Effort.
- **Target Audience / Persona** : Auteur et développeur de jeux de société cherchant à éliminer toute martingale, calibrer la fenêtre d'harmonie forestière ($60\%\text{–}80\%$), découvrir de nouvelles mécaniques émergentes par algorithme génétique, et imprimer directement des fiches de règles en français clair pour les playtests sur table.
- **Key Value** : Remplace les moteurs rigides codés en dur par une machine virtuelle universelle à 18 capteurs et 9 verbes, divise par 11,5 le temps d'évaluation grâce au tamisage Multi-Fidélité à 3 étages + Common Random Numbers (CRN), et traduit automatiquement n'importe quel génome de 447 entiers en une règle de jeu humaine lisible et jouable.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Vue 1 — Studio d'Automates (Niveau 2 : Éditeur Visuel & Code YAML/JSON)** :
   - Sélection d'une des 3 familles pré-chargées ou import/glisser-déposer d'un fichier `.yaml`/`.json`.
   - Bascule fluide entre l'**Éditeur Visuel Structuré** (configuration des paramètres d'arène, biomes, obstacles, lois de casse/élan, constructeurs de Tactiques $1..6$ et Slots $1..4$ `[Si Capteur Op Seuil -> Verbe(Qté, Offset) Sinon Repli + Mode Parade]`, piste 2D6 et décompte Piste 3) et l'**Éditeur Code Déclaratif** supportant les balayages `{"$sweep": [...]}`.
   - Bandeau de validation statique temps réel calculant la cardinalité exacte du produit cartésien `$sweep`, le coût cognitif statique $C_{\text{règle}}$ par tactique, et la vérification d'éligibilité pré-simulation (présence minimale de `CUT`, `BULLDOZE` et `ADVANCE`).
2. **Vue 2 — Configurateur de Campagne, Bots & Pondérations** :
   - Sélection du moteur : **Grille Cartésienne + Entonnoir Successive Halving (Rung 1: 320 parties, Rung 2: 11 200 parties, Rung 3: 84 000 parties / échelle proportionnelle)** ou **Algorithme Génétique Hybride NSGA-II + MAP-Elites** (taille de population $P$, nombre de générations $G$, taux de croisement `Block-Crossover`, mutations paramétriques et mutations créatives NEAT : *Greffe de Slot*, *Élagage d'Occam*, *Mutation Globale*, plafond $C_{\text{règle}} \le C_{\max}$).
   - Sélection des Bots actifs (`B0_Passif`, `B1_Aveugle`, `B2a_Mono_Anti_Coupe`, `B2b_Mono_Anti_Bull`, `B2c_Mono_Anti_Avance`, `B3_Tacticien_Couloir`, `B4_Stratege_Complet`), des tailles de table ($J \in \{3,4,5,6\}$) et des paliers d'effort ($\bar{P} \in \{30\%, 50\%, 70\%\}$).
   - 4 curseurs de pondération $(w_1, w_2, w_3, w_4)$ normalisés recalculant instantanément à la volée le score global et le classement d'une campagne existante sans relancer la simulation.
3. **Vue 3 — Console d'Exécution & Télémétrie Temps Réel** :
   - Contrôles d'exécution : **Lancer**, **Pause (fin de lot)**, **Reprendre depuis Checkpoint**, **Arrêter**, et **Exporter le Bundle Python/Numba OCI**.
   - Suivi en direct de l'Entonnoir Multi-Fidélité (progression et taux de survie à travers les Étage 1 Tamis, Étage 2 Calibrage, Étage 3 Certification) ou des Générations NSGA-II (évolution de l'hypervolume Pareto 4D et taux de remplissage des 800 niches écologiques MAP-Elites).
4. **Vue 4 — Laboratoire d'Analyse, Carte MAP-Elites & Traducteur de Règles Humaines** :
   - **Table du Classement & Front de Pareto 4D** + **Carte de Chaleur Interactive MAP-Elites ($10 \times 10$ avec sélecteur de tranche cinétique $Z \in [1..8]$)** : cliquer sur une niche écologique inspecte immédiatement le champion de ce style de jeu (axe X : complexité sur table, axe Y : ratio Coupe/Terrassement, axe Z : cinétique de mouvement/rebond).
   - **3 Visualiseurs Graphiques Synchronisés** :
     1. *Profil de Réponse des 7 Bots (`B0` à `B4`)* : Histogramme comparatif mettant en évidence la marge de sécurité $\min(S(B_3), S(B_4)) - \max(S(B_{2a}), S(B_{2b}), S(B_{2c}))$ et l'alerte de malus quadratique en cas de martingale.
     2. *Courbe Temporelle Tour par Tour ($t = 1..T$)* : Graphique empilé des $\%$ Arbres debout, $\%$ Souches (avec distinction des souches redressables Piste 3), $\%$ Zones Terrassées, et part de tuiles Bulldozer au cœur probabiliste $6\text{–}7\text{–}8$.
     3. *Radar 4D $(M_1, M_2, M_3, M_4)$* : Polygone SVG superposant la variante sélectionnée au Top 3 de la campagne.
   - **Traducteur Automatique en Règle de Jeu Humaine** : Décodeur du vecteur de 447 `int32` générant une fiche de règles complète en français naturel (Mise en place du plateau et des biomes/obstacles, Loi de mouvement et de casse/élan, Effet détaillé des tuiles Tactiques et de leurs portes de parade, Règle d'apprentissage sur la piste 2D6, et Décompte final Piste 3), imprimable ou téléchargeable en 1 clic.

### Visual Identity & Theme

- **Aesthetic Direction** : Instrumentation scientifique de haute précision croisée avec l'univers forestier tactique (*Empirical Forestry Laboratory*).
- **Color Palette (Discipline 60-30-10)** :
  - *60% Dominant Canvas* : Ardoise obsidienne profonde (`#090D16` / `bg-slate-950`) assurant une lecture reposante des matrices numériques et cartes de chaleur.
  - *30% Structural Surfaces* : Panneaux plats monochromatiques (`#111827` / `bg-slate-900`) délimités exclusivement par des filets de `1px` (`border-slate-800`), sans ombres portées lourdes ni cartes imbriquées.
  - *10% Calibrated Accents* : Émeraude forestier (`#10B981`) pour l'état Arbre / dominance Pareto, Ambre résine (`#F59E0B`) pour l'état Souche / alertes de seuils, Cyan télémétrique (`#06B6D4`) pour l'illumination MAP-Elites, et Cramoisi (`#F43F5E`) pour le Terrassement et les pénalités de martingale.
- **Typography & Tabular Discipline** :
  - *Titres & Structure* : `Plus Jakarta Sans` (poids 600/700, `text-wrap: balance`).
  - *Corps & Fiches de Règles Humaines* : `DM Sans` pour une lisibilité éditoriale fluide.
  - *Données, Génomes & Télémétrie* : `JetBrains Mono` avec `font-variant-numeric: tabular-nums` obligatoire sur toutes les colonnes de scores, entropies, ratios SNR et compteurs de vitesse.
- **Navigation Top Bar Contract** : Barre supérieure stricte à 1 ligne et 3 zones séparées par `gap-8` :
  1. Marque sur une ligne (`Forêt Automate Lab v2`),
  2. 4 liens de navigation vers les 4 vues (`Studio Niveau 2`, `Configurateur`, `Console & Télémétrie`, `Laboratoire & Règles`),
  3. 1 bouton d'action primaire (`Lancer la Campagne`).

---

## 3. Key Product Decisions & Trade-Offs

- **Décision 1 : Compilation Déterministe Niveau 2 $\rightarrow$ Génome Plat de 447 `int32` (Niveau 3)**
  - *Approche retenue* : Tout automate — qu'il provienne d'une famille déclarative YAML/JSON avec `$sweep` ou d'un croisement/mutation génétique — est systématiquement encodé dans un `Int32Array(447)` (1 788 octets) structuré en 4 segments fixes (`[0..9]` En-tête Global, `[10..34]` Arène/Biomes/Obstacles/Poids, `[35..418]` 6 Tactiques $\times$ 4 Slots $\times$ 15 champs, `[419..446]` Piste d'apprentissage 2D6).
  - *Pourquoi* : Garantit une exécution ultra-rapide sans branchement objet dans la boucle Monte-Carlo, permet aux opérateurs génétiques (`Block-Crossover`, *Greffe de Slot*, *Élagage d'Occam*) d'agir par simple copie de tranches mémoire, et assure que le Traducteur de Règles Humaines fonctionne sur 100 % des mutants.
- **Décision 2 : Régulateur Iso-Effort & Nombres Aléatoires Communs (CRN) pour les 7 Bots**
  - *Approche retenue* : Pour une graine de base donnée, les 7 Bots (`B0` à `B4`) affrontent exactement la même séquence de tirages 2D6 `xorshift64*`, et les Bots `B1..B4` dépensent tous le même quota $Q = \text{round}(\bar{P} \times E[\text{attaques}])$ via le régulateur dynamique $Q_{\text{rem}} / R_{\text{rem}}$ modulé par la fonction d'utilité marginale $\Delta V(\text{action})$ de `B3` et le coefficient probabiliste $W_{\text{piste}}(\text{somme})$ de `B4`.
  - *Pourquoi* : Élimine le bruit d'échantillonnage inter-bots (réduction de variance d'un facteur 5), rendant le calcul du Ratio Signal-sur-Bruit ($\text{SNR}$), du $\tau_K$ de Kendall et de la Divergence de Jensen-Shannon $D_{JS}(P_{\text{act}}(B_{2a}) \parallel P_{\text{act}}(B_{2b}))$ fiable dès les paliers bas de l'entonnoir Multi-Fidélité.
- **Décision 3 : Double Livrable Exécutable (Moteur Web Temps Réel + Générateur de Bundle Python/Numba OCI)**
  - *Approche retenue* : Le moteur V2 tourne nativement dans le navigateur par tranches asynchrones non bloquantes (avec sauvegarde d'état Checkpoint dans `localStorage`), et un module d'export génère en un clic l'archive complète des fichiers Python/Numba V2 (`src/vm_engine.py`, `src/dsl_compiler.py`, `src/bots.py`, `src/metrics_v2.py`, `src/qd_evolution.py`, `scripts/run_oci_v2.sh`) pré-configurée avec la famille et la campagne actives.
  - *Pourquoi* : Vous permet de concevoir, tester, visualiser et traduire vos familles d'automates immédiatement dans l'interface Web, puis de lancer des campagnes massives de 100 000+ variantes sur les 16 vCPUs de votre VM Oracle.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       INTERFACE WEB DE PILOTAGE (React 19 + TS)                        │
├───────────────────┬───────────────────┬──────────────────────┬─────────────────────────┤
│ Vue 1: Studio N2  │ Vue 2: Config     │ Vue 3: Console &     │ Vue 4: Laboratoire,     │
│ • Éditeur Visuel  │ • Grille 3 Rungs  │   Télémétrie         │   MAP-Elites & Règles   │
│ • Éditeur YAML    │   vs NSGA-II+QD   │ • Progression Rungs  │ • Table Pareto 4D       │
│ • Validateur      │ • 7 Bots (B0..B4) │   & Générations      │ • Heatmap 10×10×8       │
│   $sweep & C_règle│ • Poids M1..M4    │ • Pause / Checkpoint │ • Bots / Courbe / Radar │
│                   │   temps réel      │ • Export Python OCI  │ • Traducteur Français   │
└─────────┬─────────┴─────────┬─────────┴──────────┬───────────┴────────────┬────────────┘
          │                   │                    │                        │
          ▼                   ▼                    ▼                        ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   COUCHE DE COMPILATION & EXPLORATION (Niveau 2 -> 3)                  │
│  ┌──────────────────────────────┐        ┌──────────────────────────────────────────┐  │
│  │ Compilateur DSL (Niveau 2)   │        │ Moteur Hybride (Bloc 5)                  │  │
│  │ • Parseur YAML/JSON + $sweep │───────▶│ • Entonnoir Successive Halving (3 Rungs) │  │
│  │ • Calculateur C_règle stat.  │        │ • NSGA-II (Front 4D + Crowding Distance) │  │
│  │ • Encodeur/Décodeur Int32[447]        │ • Archive MAP-Elites (800 niches 10×10×8)│  │
│  └──────────────────────────────┘        │ • Block-Crossover + Mutations NEAT/Occam │  │
│                                          └────────────────────┬─────────────────────┘  │
└───────────────────────────────────────────────────────────────┼────────────────────────┘
                                                                │ Génome Int32Array(447)
                                                                ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│              MACHINE VIRTUELLE NIVEAU 1 & NOTATION SCIENTIFIQUE (Blocs 1, 3, 4)        │
│  ┌──────────────────────────────────────┐  ┌────────────────────────────────────────┐  │
│  │ VM Engine (Int32Array / Float64Array)│  │ Évaluateur Théorie des Jeux (M1..M4)   │  │
│  │ • 18 Capteurs & 9 Verbes primitifs   │─▶│ • M1: Delta_Skill, SNR, Kendall Tau    │  │
│  │ • Tandem (Pos, Dir, Role, Status)    │  │ • M2: Jensen-Shannon D_JS, TVD, Nash   │  │
│  │ • Biomes, Poids W_c, Obstacles, Piste3  │   (Malus quadratique non plafonné)     │  │
│  │ • 7 Bots Iso-Effort (B0..B4) + CRN   │  │ • M3: Harmonie, Entropie Shannon, Pace │  │
│  └──────────────────────────────────────┘  │ • M4: M_phys, C_cog, C_règle statique  │  │
│                                            └────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Genome Layout (447 `int32`)

- **Segment 1 — En-tête Global `[0..9]` (10 `int32`)** :
  `[0] L_cells`, `[1] T_turns`, `[2] dice_mode`, `[3] end_of_track_mode`, `[4] break_rule`, `[5] break_penalty`, `[6] momentum_rule`, `[7] doubles_rule`, `[8] regen_mode`, `[9] regen_max_per_cell`.
- **Segment 2 — Arène, Biomes, Poids & Obstacles `[10..34]` (25 `int32`)** :
  `[10..17] cell_cap[8]`, `[18..25] cell_weights[8]`, `[26..33] obstacle_mask[8]`, `[34] biome_asymmetry_mode` (avec table de profils asymétriques 12 arbres : Clairière-Jungle `[1,1,2,4,4]`, Mur Végétal `[4,3,2,2,1]`, Vallée `[2,3,2,3,2]`, Bosquet Central `[2,2,4,2,2]`).
- **Segment 3 — 6 Tactiques $\times$ 4 Slots `[35..418]` (384 `int32`)** :
  Pour chaque tactique $t \in [0..5]$ (64 `int32`) :
  - En-tête tactique (4 `int32`) : `machine_type`, `wave_mode`, `sort_criterion`, `fallback_mode`.
  - 4 Slots $\times$ 15 `int32` : `cond1_sensor`, `cond1_op`, `cond1_val`, `logic_op`, `cond2_sensor`, `cond2_op`, `cond2_val`, `act_true_verb`, `act_true_qty`, `act_true_offset`, `act_false_verb`, `act_false_qty`, `act_false_offset`, `parry_mode`, `parry_cost`.
- **Segment 4 — Piste d'Apprentissage 2D6 `[419..446]` (28 `int32`)** :
  `[419..429] init_track[11]`, `[430..440] init_tile_verso[11]`, `[441] eval_trigger_mode`, `[442] threshold_val`, `[443] shift_step_pos`, `[444] shift_step_neg`, `[445] on_cell_cleared_rule`, `[446] geom_move_mode`.

### Interactive Component & State Mapping

- **Studio d'Automates (Vue 1)** : Toute modification dans le constructeur visuel (ajout/modification d'un Slot conditionnel, sélection d'un capteur parmi les 18 ou d'un verbe parmi les 9, activation d'un `$sweep`) met à jour l'arbre AST de la famille de Niveau 2, synchronise l'éditeur YAML/JSON bidirectionnel, recalcule instantanément le nombre de variantes cartésiennes et met à jour le badge de complexité syntaxique $C_{\text{règle}}$.
- **Configurateur & Recalcul Dynamique des Pondérations (Vue 2)** : Le déplacement des curseurs $(w_1, w_2, w_3, w_4)$ recalcule immédiatement `score_global` (en préservant le malus rédhibitoire non plafonné $-10 \cdot \max(0, S_{\text{MonoMax}} - S_{\text{Smart}})^2$ lorsque $S_{\text{MonoMax}} \ge S_{\text{Smart}}$) et retrie la table des variantes sans relancer les simulations Monte-Carlo.
- **Console Multi-Fidélité & Quality-Diversity (Vue 3)** : Exécute les lots par tranches non bloquantes avec sauvegarde automatique de checkpoint, affiche les compteurs de survivants par étage (`Rung 1 -> Rung 2 -> Rung 3`) ou l'évolution générationnelle (`NSGA-II + MAP-Elites`), et permet de télécharger l'archive Python/Numba complète pour exécution sur la VM Oracle.
- **Laboratoire, Carte MAP-Elites & Traducteur de Règles (Vue 4)** : La sélection d'une variante dans le tableau Pareto ou d'une cellule dans la grille MAP-Elites $10 \times 10 \times 8$ met à jour simultanément les 3 graphiques (Histogramme des 7 Bots `B0..B4`, Courbe temporelle tour par tour avec souches Piste 3, Radar 4D) et génère la fiche de règles complète en français clair prête pour le playtest physique.
