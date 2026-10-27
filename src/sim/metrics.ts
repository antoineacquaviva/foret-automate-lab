import { VariantSpec, TOPOLOGIES, TOPOLOGY_LENGTHS, INITIAL_TRACKS, variantToIntTuple } from './variants';
import { ALL_DOCTRINES } from './doctrines';
import { simulateBatchKernel } from './engine';

export interface MetricsWeights {
  w_maitrise: number;
  w_adaptation: number;
  w_tension: number;
  w_simplicite: number;
}

export interface EvaluatedVariant extends VariantSpec {
  rang_global?: number;
  score_global: number;
  M1_maitrise: number;
  M2_adaptation: number;
  M3_tension: number;
  M4_simplicite: number;
  gain_lecture_vs_uniforme: number;
  ecart_lecture_vs_contretemps: number;
  score_D0_Uniforme: number;
  score_D1_Anti_Coupe: number;
  score_D2_Anti_Terrassement: number;
  score_D3_Chasseur_Boost: number;
  score_D4_Lecteur_Piste_7: number;
  score_D5_Contre_Temps: number;
  arbres_fin_pct: number;
  souches_fin_pct: number;
  terrasses_fin_pct: number;
  gestes_phys_par_tour: number;
  ops_cog_par_tour: number;
  centre_terrassier_debut_pct: number;
  centre_terrassier_fin_pct: number;
  bascule_centre_pts: number;
  taux_patinage_pct: number;
  parades_utilisees_moy: number;
  is_pareto_4d?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

export function computeVariantMetrics(
  variantSpec: VariantSpec,
  doctrineResults: Record<string, Float64Array>,
  weights: MetricsWeights = {
    w_maitrise: 0.3,
    w_adaptation: 0.25,
    w_tension: 0.25,
    w_simplicite: 0.2,
  }
): EvaluatedVariant {
  const d0 = doctrineResults['D0_Uniforme'];
  const d1 = doctrineResults['D1_Anti_Coupe'];
  const d2 = doctrineResults['D2_Anti_Terrassement'];
  const d3 = doctrineResults['D3_Chasseur_Boost'];
  const d4 = doctrineResults['D4_Lecteur_Piste_7'];
  const d5 = doctrineResults['D5_Contre_Temps'];

  const score_d0 = d0[0];
  const score_d1 = d1[0];
  const score_d2 = d2[0];
  const score_d3 = d3[0];
  const score_d4 = d4[0];
  const score_d5 = d5[0];

  // 1. M1_maitrise
  const best_smart = Math.max(score_d3, score_d4);
  const gain_vs_blind = Math.max(0.0, best_smart - score_d0);
  const spread_vs_worst = Math.max(0.0, best_smart - score_d5);
  const both_smart_bonus = Math.min(score_d3 - score_d0, score_d4 - score_d0);

  const raw_maitrise =
    5.2 * gain_vs_blind + 2.4 * spread_vs_worst + 2.0 * Math.max(0.0, both_smart_bonus);
  const score_maitrise = clamp(raw_maitrise, 0.0, 100.0);

  // 2. M2_adaptation
  const center_early_d0 = d0[7];
  const center_late_d0 = d0[8];
  const bascule_naturelle = Math.max(0.0, center_late_d0 - center_early_d0);

  const center_early_d1 = d1[7];
  const center_late_d1 = d1[8];
  const bascule_sous_blocage = Math.max(0.0, center_late_d1 - center_early_d1);

  const mono_max = Math.max(score_d1, score_d2);
  const anti_martingale_pen = Math.max(0.0, mono_max - best_smart) * 4.0;
  const terraced_d0 = d0[4];
  const terrassier_activity_score = Math.min(35.0, terraced_d0 * 2.2);

  const raw_adapt =
    1.4 * bascule_naturelle +
    1.1 * bascule_sous_blocage +
    terrassier_activity_score +
    20.0 -
    anti_martingale_pen;
  const score_adaptation = clamp(raw_adapt, 0.0, 100.0);

  // 3. M3_tension
  const ideal_center = 68.5;
  const dist_from_ideal = Math.abs(score_d0 - ideal_center);
  const window_score = Math.max(0.0, 60.0 - 2.2 * Math.max(0.0, dist_from_ideal - 3.5));

  const stumps_d0 = d0[3];
  const three_states_balance = Math.min(25.0, 1.2 * Math.min(stumps_d0, terraced_d0));

  const stall_rate_d0 = d0[9];
  const stall_penalty = Math.max(0.0, stall_rate_d0 - 5.0) * 1.3;

  const raw_tension = window_score + three_states_balance + 15.0 - stall_penalty;
  const score_tension = clamp(raw_tension, 0.0, 100.0);

  // 4. M4_simplicite
  const m_phys = d0[5];
  const c_cog = d0[6];
  const cog_excess = Math.max(0.0, c_cog - 1.0);
  const phys_excess = Math.max(0.0, m_phys - 2.8);
  const raw_simplicite = 100.0 - 14.5 * cog_excess - 4.8 * phys_excess;
  const score_simplicite = clamp(raw_simplicite, 0.0, 100.0);

  const score_global =
    weights.w_maitrise * score_maitrise +
    weights.w_adaptation * score_adaptation +
    weights.w_tension * score_tension +
    weights.w_simplicite * score_simplicite;

  return {
    ...variantSpec,
    score_global: round(score_global, 2),
    M1_maitrise: round(score_maitrise, 2),
    M2_adaptation: round(score_adaptation, 2),
    M3_tension: round(score_tension, 2),
    M4_simplicite: round(score_simplicite, 2),
    gain_lecture_vs_uniforme: round(gain_vs_blind, 2),
    ecart_lecture_vs_contretemps: round(spread_vs_worst, 2),
    score_D0_Uniforme: round(score_d0, 2),
    score_D1_Anti_Coupe: round(score_d1, 2),
    score_D2_Anti_Terrassement: round(score_d2, 2),
    score_D3_Chasseur_Boost: round(score_d3, 2),
    score_D4_Lecteur_Piste_7: round(score_d4, 2),
    score_D5_Contre_Temps: round(score_d5, 2),
    arbres_fin_pct: round(d0[2], 2),
    souches_fin_pct: round(stumps_d0, 2),
    terrasses_fin_pct: round(terraced_d0, 2),
    gestes_phys_par_tour: round(m_phys, 2),
    ops_cog_par_tour: round(c_cog, 2),
    centre_terrassier_debut_pct: round(center_early_d0, 1),
    centre_terrassier_fin_pct: round(center_late_d0, 1),
    bascule_centre_pts: round(bascule_naturelle, 1),
    taux_patinage_pct: round(stall_rate_d0, 1),
    parades_utilisees_moy: round(d0[10], 2),
  };
}

export function evaluateSingleVariant(
  variantSpec: VariantSpec,
  playerCounts: number[],
  effortRates: number[],
  nGames: number,
  baseSeed: number,
  weights?: MetricsWeights
): EvaluatedVariant {
  const [o1, o2, o3, o4, o5, p1, p2, T_turns] = variantToIntTuple(variantSpec);
  const initCells = TOPOLOGIES[variantSpec.P1_topologie];
  const LCells = TOPOLOGY_LENGTHS[variantSpec.P1_topologie];
  const initTrack = INITIAL_TRACKS[variantSpec.O4_init_piste];

  const doctrineAccum: Record<string, Float64Array> = {};
  const nConfigsPerDoc = Math.max(1, playerCounts.length * effortRates.length);

  for (const doc of ALL_DOCTRINES) {
    const accVec = new Float64Array(11);
    for (const nP of playerCounts) {
      for (const eff of effortRates) {
        const crnSeed =
          baseSeed +
          variantSpec.variant_id * 1009 +
          nP * 131 +
          Math.round(eff * 100) * 17;
        const resVec = simulateBatchKernel(
          o1,
          o2,
          o3,
          o4,
          o5,
          p1,
          p2,
          T_turns,
          nP,
          doc.doctrine_id,
          eff,
          nGames,
          crnSeed,
          initCells,
          LCells,
          initTrack
        );
        for (let k = 0; k < 11; k++) {
          accVec[k] += resVec[k];
        }
      }
    }
    for (let k = 0; k < 11; k++) {
      accVec[k] /= nConfigsPerDoc;
    }
    doctrineAccum[doc.code] = accVec;
  }

  return computeVariantMetrics(variantSpec, doctrineAccum, weights);
}

export function flagParetoFront(rows: EvaluatedVariant[]): EvaluatedVariant[] {
  const n = rows.length;
  const isPareto = new Array<boolean>(n).fill(true);

  for (let i = 0; i < n; i++) {
    const ri = rows[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const rj = rows[j];
      const geAll =
        rj.M1_maitrise >= ri.M1_maitrise &&
        rj.M2_adaptation >= ri.M2_adaptation &&
        rj.M3_tension >= ri.M3_tension &&
        rj.M4_simplicite >= ri.M4_simplicite;
      const gtAny =
        rj.M1_maitrise > ri.M1_maitrise ||
        rj.M2_adaptation > ri.M2_adaptation ||
        rj.M3_tension > ri.M3_tension ||
        rj.M4_simplicite > ri.M4_simplicite;
      if (geAll && gtAny) {
        isPareto[i] = false;
        break;
      }
    }
  }

  const out = rows.map((r, idx) => ({ ...r, is_pareto_4d: isPareto[idx] }));
  out.sort((a, b) => {
    if (b.score_global !== a.score_global) return b.score_global - a.score_global;
    return b.M1_maitrise - a.M1_maitrise;
  });
  out.forEach((r, idx) => {
    r.rang_global = idx + 1;
  });
  return out;
}
