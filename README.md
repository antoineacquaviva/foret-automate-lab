# `foret-automate-lab` — Banc d'Essai Monte-Carlo de l'Automate (Défenseurs de la Forêt)

Simulateur haute performance conçu pour explorer, calibrer et départager les **2 916 variantes cartésiennes** du nouvel automate en couloirs unidirectionnels (**Abatteuse + Terrassier**, piste d'apprentissage à 11 cases et 4 tactiques), optimisé pour l'instance Oracle Cloud **`VM.Standard.E5.Flex` (8 OCPU / 16 vCPUs, 16 Go RAM)**.

---

## 1. Caractéristiques clés

* **Topologie en couloirs unidirectionnels ($J$ pistes) :** Chaque case comporte $N_c$ emplacements traversant 3 états (*Arbre debout $ightarrow$ Souche $ightarrow$ Zone Terrassée*). L'Abatteuse ouvre la voie en tête ; le Terrassier suit en queue ($Pos_T \le Pos_A$).
* **6 Doctrines de Parade Iso-Effort (`D0` à `D5`) :** Toutes les doctrines dépensent exactement le même budget total $Q$ de parades sur la partie, permettant de mesurer scientifiquement la valeur de la lecture du plateau (`D3_Chasseur_Boost`) et de la piste probabiliste (`D4_Lecteur_Piste_7`) face à une défense aveugle (`D0_Uniforme`).
* **4 Métriques Normalisées (0–100) & Front de Pareto 4D :**
  1. `M1_maitrise` ($\Delta_{	ext{Maîtrise}}$) : Intérêt stratégique et récompense de la lecture du jeu.
  2. `M2_adaptation` ($R_{	ext{Adapt}}$) : Bascule émergente Coupe $ightarrow$ Terrassement au centre (6-7-8) et résistance aux martingales.
  3. `M3_tension` ($E_{	ext{Tension}}$) : Calibrage du taux de survie dans la fenêtre d'Harmonie Forestière (55 % – 85 %).
  4. `M4_simplicite` ($S_{	ext{Fluidité}}$) : Économie de gestes physiques (`gestes_phys_par_tour`) et d'opérations mentales (`ops_cog_par_tour`) autour de la table.
* **Respiration de la VM & Tolérance aux pannes :**
  * Par défaut, limite le pool à **14 workers sur 16 vCPUs** et applique `os.nice(15)` à chaque processus pour laisser **1 OCPU complet (2 threads)** disponible pour SSH et les autres services.
  * Sauvegarde atomique par lots (`results/<campagne>/checkpoints/`) permettant de reprendre automatiquement une campagne interrompue.

---

## 2. Installation & Lancement sur la VM Oracle (`vm-campagne-tests`)

```bash
# 1. Cloner le dépôt ou décompresser l'archive
unzip foret-automate-lab.zip
cd foret-automate-lab

# 2. Exécuter les tests unitaires de vérification
python3 -m unittest discover -s tests

# 3. Lancer une campagne pilote rapide (~1 à 2 minutes avec Numba)
./scripts/run_oci_campaign.sh quick 14

# 4. Lancer la campagne exhaustive complète en tâche de fond détachée
./scripts/run_oci_campaign.sh full 14
```

---

## 3. Fichiers générés dans `results/<nom_campagne>/`

* **`campaign_report.md`** : Bilan complet (Podium Top 15, Champions Pareto 4D, Analyse de sensibilité marginale de chaque option `O1..O5` et paramètre `P1..P3`, Matrice des 6 Doctrines, et Courbe temporelle tour par tour de la variante #1).
* **`variants_ranking.csv`** : Table intégrale des 2 916 variantes classées avec leurs 25 colonnes de métriques et d'indicateurs physiques/cognitifs.
* **`sensitivity_analysis.csv`** : Impact marginal moyen de chaque modalité.
* **`top1_turn_profile.csv`** : Séries temporelles tour par tour de la meilleure variante.
