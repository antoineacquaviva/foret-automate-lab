"""
Calcul des 4 métriques d'évaluation (0 à 100) et identification du Front de Pareto 4D :
  1. Intérêt Stratégique / Skill Gap (Delta_Maitrise)
  2. Résilience & Bascule Adaptative de l'Automate (R_Adapt)
  3. Équilibre & Courbe de Tension (E_Tension)
  4. Simplicité Cognitive & Manipulation Physique (S_Fluidite)
"""
from typing import Dict, Any, List
import numpy as np
import pandas as pd


def compute_variant_metrics(
    variant_spec,
    doctrine_results: Dict[str, np.ndarray],
    weights: Dict[str, float] = None,
) -> Dict[str, Any]:
    """
    Agrège les vecteurs de résultats des 6 doctrines (moyennés sur les tailles de table et taux d'effort)
    pour calculer les 4 métriques normalisées [0, 100] d'une variante.
    """
    if weights is None:
        weights = {
            "w_maitrise": 0.30,
            "w_adaptation": 0.25,
            "w_tension": 0.25,
            "w_simplicite": 0.20,
        }

    d0 = doctrine_results["D0_Uniforme"]
    d1 = doctrine_results["D1_Anti_Coupe"]
    d2 = doctrine_results["D2_Anti_Terrassement"]
    d3 = doctrine_results["D3_Chasseur_Boost"]
    d4 = doctrine_results["D4_Lecteur_Piste_7"]
    d5 = doctrine_results["D5_Contre_Temps"]

    score_d0 = float(d0[0])
    score_d1 = float(d1[0])
    score_d2 = float(d2[0])
    score_d3 = float(d3[0])
    score_d4 = float(d4[0])
    score_d5 = float(d5[0])

    # 1. MÉTRIQUE D'INTÉRÊT STRATÉGIQUE (Delta_Maitrise : 0 à 100)
    best_smart = max(score_d3, score_d4)
    gain_vs_blind = max(0.0, best_smart - score_d0)
    spread_vs_worst = max(0.0, best_smart - score_d5)
    both_smart_bonus = min(score_d3 - score_d0, score_d4 - score_d0)

    raw_maitrise = (
        5.2 * gain_vs_blind
        + 2.4 * spread_vs_worst
        + 2.0 * max(0.0, both_smart_bonus)
    )
    score_maitrise = float(np.clip(raw_maitrise, 0.0, 100.0))

    # 2. MÉTRIQUE DE RÉSILIENCE & BASCULE ADAPTATIVE (R_Adapt : 0 à 100)
    # (a) Bascule temporelle naturelle du centre (6-7-8) vers le Terrassier entre le début et la fin
    center_early_d0 = float(d0[7])
    center_late_d0 = float(d0[8])
    bascule_naturelle = max(0.0, center_late_d0 - center_early_d0)

    # (b) Réaction adaptative quand les joueurs bloquent les Abatteuses (D1) :
    # les tuiles Terrassier doivent encore plus envahir le centre en fin de partie
    center_late_d1 = float(d1[8])
    bascule_sous_blocage = max(0.0, center_late_d1 - center_early_d1 if (center_early_d1 := float(d1[7])) >= 0 else 0.0)

    # (c) Anti-Martingale : pénalité si une stratégie monomaniaque (D1 ou D2) bat la lecture intelligente (D3/D4)
    mono_max = max(score_d1, score_d2)
    anti_martingale_pen = max(0.0, mono_max - best_smart) * 4.0
    # Pénalité si l'automate ne détruit quasiment rien en Terrassement
    terraced_d0 = float(d0[4])
    terrassier_activity_score = min(35.0, terraced_d0 * 2.2)

    raw_adapt = (
        1.4 * bascule_naturelle
        + 1.1 * bascule_sous_blocage
        + terrassier_activity_score
        + 20.0
        - anti_martingale_pen
    )
    score_adaptation = float(np.clip(raw_adapt, 0.0, 100.0))

    # 3. MÉTRIQUE D'ÉQUILIBRE & COURBE DE TENSION (E_Tension : 0 à 100)
    # Cible idéale en D0 (effort 50%) : score entre 62% et 75% (au cœur de l'échelle 55% - 85%)
    ideal_center = 68.5
    dist_from_ideal = abs(score_d0 - ideal_center)
    window_score = max(0.0, 60.0 - 2.2 * max(0.0, dist_from_ideal - 3.5))

    # Équilibre des 3 états finaux (Arbres / Souches / Terrassés)
    stumps_d0 = float(d0[3])
    three_states_balance = min(25.0, 1.2 * min(stumps_d0, terraced_d0))

    # Pénalité de patinage à vide (tours morts)
    stall_rate_d0 = float(d0[9])
    stall_penalty = max(0.0, stall_rate_d0 - 5.0) * 1.3

    raw_tension = window_score + three_states_balance + 15.0 - stall_penalty
    score_tension = float(np.clip(raw_tension, 0.0, 100.0))

    # 4. MÉTRIQUE DE SIMPLICITÉ COGNITIVE & PHYSIQUE (S_Fluidite : 0 à 100)
    m_phys = float(d0[5])
    c_cog = float(d0[6])
    # Plancher incompressible : 1.0 op cognitive / tour et ~2.8 gestes physiques / tour
    cog_excess = max(0.0, c_cog - 1.0)
    phys_excess = max(0.0, m_phys - 2.8)
    raw_simplicite = 100.0 - (14.5 * cog_excess) - (4.8 * phys_excess)
    score_simplicite = float(np.clip(raw_simplicite, 0.0, 100.0))

    # SCORE COMPOSITE PARETO PONDÉRÉ
    score_global = (
        weights["w_maitrise"] * score_maitrise
        + weights["w_adaptation"] * score_adaptation
        + weights["w_tension"] * score_tension
        + weights["w_simplicite"] * score_simplicite
    )

    row = variant_spec.to_dict()
    row.update({
        "score_global": round(score_global, 2),
        "M1_maitrise": round(score_maitrise, 2),
        "M2_adaptation": round(score_adaptation, 2),
        "M3_tension": round(score_tension, 2),
        "M4_simplicite": round(score_simplicite, 2),
        "gain_lecture_vs_uniforme": round(gain_vs_blind, 2),
        "ecart_lecture_vs_contretemps": round(spread_vs_worst, 2),
        "score_D0_Uniforme": round(score_d0, 2),
        "score_D1_Anti_Coupe": round(score_d1, 2),
        "score_D2_Anti_Terrassement": round(score_d2, 2),
        "score_D3_Chasseur_Boost": round(score_d3, 2),
        "score_D4_Lecteur_Piste_7": round(score_d4, 2),
        "score_D5_Contre_Temps": round(score_d5, 2),
        "arbres_fin_pct": round(float(d0[2]), 2),
        "souches_fin_pct": round(stumps_d0, 2),
        "terrasses_fin_pct": round(terraced_d0, 2),
        "gestes_phys_par_tour": round(m_phys, 2),
        "ops_cog_par_tour": round(c_cog, 2),
        "centre_terrassier_debut_pct": round(center_early_d0, 1),
        "centre_terrassier_fin_pct": round(center_late_d0, 1),
        "bascule_centre_pts": round(bascule_naturelle, 1),
        "taux_patinage_pct": round(stall_rate_d0, 1),
        "parades_utilisees_moy": round(float(d0[10]), 2),
    })
    return row


def flag_pareto_front(df: pd.DataFrame) -> pd.DataFrame:
    """
    Identifie les variantes appartenant au Front de Pareto 4D non-dominé
    sur (M1_maitrise, M2_adaptation, M3_tension, M4_simplicite).
    """
    cols = ["M1_maitrise", "M2_adaptation", "M3_tension", "M4_simplicite"]
    vals = df[cols].to_numpy()
    n = vals.shape[0]
    is_pareto = np.ones(n, dtype=bool)
    for i in range(n):
        if not is_pareto[i]:
            continue
        # Une variante i est dominée s'il existe j telle que vals[j] >= vals[i] partout et > sur au moins 1 axe
        dominated = np.all(vals >= vals[i], axis=1) & np.any(vals > vals[i], axis=1)
        if np.any(dominated):
            is_pareto[i] = False
    df = df.copy()
    df["is_pareto_4d"] = is_pareto
    return df
