"""
Générateur du bilan complet de campagne (Markdown & CSV analytiques).
"""
from pathlib import Path
from typing import Dict, Any
import pandas as pd
import numpy as np

from .variants import VariantSpec
from .engine import simulate_turn_by_turn_profile


def generate_campaign_report(
    df: pd.DataFrame,
    config: Dict[str, Any],
    output_md_path: Path,
    total_duration_sec: float,
    n_workers: int,
):
    sim_cfg = config.get("simulation", {})
    n_games = int(sim_cfg.get("n_games_per_eval", 1000))
    player_counts = sim_cfg.get("player_counts", [3, 4, 5, 6])
    effort_rates = sim_cfg.get("effort_rates", [0.30, 0.50, 0.70])
    total_variants = len(df)
    total_games = total_variants * 6 * len(player_counts) * len(effort_rates) * n_games
    pareto_count = int(df["is_pareto_4d"].sum())

    top1 = df.iloc[0]
    top1_spec = VariantSpec(
        variant_id=int(top1["variant_id"]),
        code=str(top1["code"]),
        O1_eligibilite=str(top1["O1_eligibilite"]),
        O2_boost=str(top1["O2_boost"]),
        O3_apprentissage=str(top1["O3_apprentissage"]),
        O4_init_piste=str(top1["O4_init_piste"]),
        O5_score_souches=str(top1["O5_score_souches"]),
        P1_topologie=str(top1["P1_topologie"]),
        P2_largeur_vague=str(top1["P2_largeur_vague"]),
        P3_duree_tours=int(top1["P3_duree_tours"]),
    )

    t_profile = simulate_turn_by_turn_profile(
        top1_spec, n_players=4, effort_rate=0.50, n_games=max(300, n_games), seed=4242
    )
    df_profile = pd.DataFrame(t_profile)
    df_profile.to_csv(output_md_path.parent / "top1_turn_profile.csv", index=False)

    factors = [
        "O1_eligibilite",
        "O2_boost",
        "O3_apprentissage",
        "O4_init_piste",
        "O5_score_souches",
        "P1_topologie",
        "P2_largeur_vague",
        "P3_duree_tours",
    ]
    sens_rows = []
    for factor in factors:
        grouped = (
            df.groupby(factor, as_index=False)[
                [
                    "score_global",
                    "M1_maitrise",
                    "M2_adaptation",
                    "M3_tension",
                    "M4_simplicite",
                    "gain_lecture_vs_uniforme",
                    "bascule_centre_pts",
                    "gestes_phys_par_tour",
                    "ops_cog_par_tour",
                ]
            ]
            .mean()
            .round(2)
        )
        for _, r in grouped.iterrows():
            sens_rows.append(
                {
                    "Facteur": factor,
                    "Modalite": str(r[factor]),
                    "Score_Global": r["score_global"],
                    "M1_Maitrise": r["M1_maitrise"],
                    "M2_Adaptation": r["M2_adaptation"],
                    "M3_Tension": r["M3_tension"],
                    "M4_Simplicite": r["M4_simplicite"],
                    "Gain_Lecture_%": r["gain_lecture_vs_uniforme"],
                    "Bascule_Centre_pts": r["bascule_centre_pts"],
                    "Gestes_Phys/Tour": r["gestes_phys_par_tour"],
                    "Ops_Cog/Tour": r["ops_cog_par_tour"],
                }
            )
    df_sens = pd.DataFrame(sens_rows)
    df_sens.to_csv(output_md_path.parent / "sensitivity_analysis.csv", index=False)

    lines = []
    lines.append(f"# Bilan de Campagne — Banc d'Essai Automate Forêt (`{config.get('campaign_name')}`)\n")
    lines.append("## 1. Synthèse d'Exécution & Métriques de Référence\n")
    lines.append(f"* **Variantes cartésiennes évaluées :** `{total_variants:,}` (dont `{pareto_count}` sur le Front de Pareto 4D non-dominé)")
    lines.append(f"* **Volume de simulation :** `{total_games:,}` parties complètes (`{n_games}` parties MC × `6` Doctrines × `{len(player_counts)}` tailles de table × `{len(effort_rates)}` niveaux d'effort)")
    lines.append(f"* **Temps de calcul :** `{total_duration_sec:.1f} s` sur `{n_workers}` workers (`{total_games / max(0.01, total_duration_sec):,.0f}` parties/s)\n")

    lines.append("### Variante #1 Recommandée (Meilleur Compromis Global Pareto)\n")
    lines.append(f"* **Identifiant :** **`{top1['code']}`** (Score Global : **`{top1['score_global']}/100`** | Pareto 4D : `{bool(top1['is_pareto_4d'])}`)")
    lines.append(f"* **Options retenues :** Éligibilité=`{top1['O1_eligibilite']}` | Boost=`{top1['O2_boost']}` | Apprentissage=`{top1['O3_apprentissage']}` | Piste initiale=`{top1['O4_init_piste']}` | Score=`{top1['O5_score_souches']}`")
    lines.append(f"* **Paramètres retenus :** Topologie=`{top1['P1_topologie']}` | Vague=`{top1['P2_largeur_vague']}` | Durée=`{top1['P3_duree_tours']} tours`")
    lines.append("* **Profil des 4 Métriques :**")
    lines.append(f"  * **M1 — Intérêt Stratégique (`{top1['M1_maitrise']}/100`) :** Gain de lecture `+{top1['gain_lecture_vs_uniforme']}%` vs parade aveugle (`+{top1['ecart_lecture_vs_contretemps']}%` vs contre-temps)")
    lines.append(f"  * **M2 — Résilience & Bascule Adaptative (`{top1['M2_adaptation']}/100`) :** Part des Terrassiers au centre (6-7-8) passant de `{top1['centre_terrassier_debut_pct']}%` (début) à `{top1['centre_terrassier_fin_pct']}%` (fin)")
    lines.append(f"  * **M3 — Équilibre & Tension (`{top1['M3_tension']}/100`) :** Fin de partie moyenne à `{top1['arbres_fin_pct']}%` Arbres, `{top1['souches_fin_pct']}%` Souches, `{top1['terrasses_fin_pct']}%` Terrassés (patinage : `{top1['taux_patinage_pct']}%`)")
    lines.append(f"  * **M4 — Simplicité & Fluidité Table (`{top1['M4_simplicite']}/100`) :** `{top1['gestes_phys_par_tour']}` gestes physiques/tour et `{top1['ops_cog_par_tour']}` opérations cognitives/tour\n")

    lines.append("---\n")
    lines.append("## 2. Podium Global des 15 Meilleures Variantes\n")
    podium_cols = [
        "rang_global",
        "code",
        "score_global",
        "M1_maitrise",
        "M2_adaptation",
        "M3_tension",
        "M4_simplicite",
        "gain_lecture_vs_uniforme",
        "gestes_phys_par_tour",
        "ops_cog_par_tour",
        "is_pareto_4d",
    ]
    lines.append(df.head(15)[podium_cols].to_markdown(index=False))
    lines.append("\n---\n")

    lines.append("## 3. Analyse de Sensibilité Marginale (Impact Moyen par Option & Paramètre)\n")
    lines.append("Ce tableau mesure l'effet propre de chaque choix de conception (moyenné sur toutes les autres dimensions) sur les 4 métriques et sur la charge de manipulation :\n")
    lines.append(df_sens.to_markdown(index=False))
    lines.append("\n---\n")

    lines.append("## 4. Matrice de Réponse aux 6 Doctrines de Parade Iso-Effort (Top 5 Variantes)\n")
    lines.append("Toutes les doctrines utilisent **exactement le même budget total de parades** (`parades_utilisees_moy`), mais distribué différemment :\n")
    doc_cols = [
        "rang_global",
        "code",
        "parades_utilisees_moy",
        "score_D0_Uniforme",
        "score_D1_Anti_Coupe",
        "score_D2_Anti_Terrassement",
        "score_D3_Chasseur_Boost",
        "score_D4_Lecteur_Piste_7",
        "score_D5_Contre_Temps",
    ]
    lines.append(df.head(5)[doc_cols].to_markdown(index=False))
    lines.append("\n---\n")

    lines.append(f"## 5. Dynamique Temporelle Tour par Tour de la Variante #1 (`{top1['code']}`)\n")
    lines.append("Évolution moyenne de l'état de la forêt et de l'occupation du centre de la piste (cases 6-7-8 par les tuiles Terrassier) à 4 joueurs ($\\bar{P} = 50\\%$) :\n")
    df_prof_fmt = df_profile.copy()
    df_prof_fmt.columns = [
        "Tour",
        "Arbres Debout (%)",
        "Souches (%)",
        "Zones Terrassées (%)",
        "Tuiles Terrassier au Centre 6-7-8 (%)",
    ]
    lines.append(df_prof_fmt.round(1).to_markdown(index=False))
    lines.append("\n")

    output_md_path.write_text("\n".join(lines), encoding="utf-8")
