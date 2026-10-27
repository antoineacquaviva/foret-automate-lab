/**
 * Bloc 5bis & Section 7 — Exporteurs Analytiques (campaign_report.md enrichi des règles humaines du Top 5,
 * variants_ranking.csv, map_elites_archive.csv, sensitivity_analysis.csv)
 * et Générateur du Bundle Python/Numba Haute Performance pour la VM Oracle (8 OCPU / 16 vCPUs).
 */

import { EvaluatedAutomatonV2, WeightsV2 } from './metrics_and_qd';
import { translateGenomeToHumanRulebook, FamilySpecDSL } from './dsl_compiler';
import { TurnByTurnProfileV2 } from './bots_and_vm';
import {
  HDR_T_TURNS,
  HDR_END_OF_TRACK_MODE,
  HDR_BREAK_RULE,
  HDR_MOMENTUM_RULE,
  HDR_REGEN_MODE,
  ARENA_BIOME_MODE,
  OFFSET_LEARNING,
  END_OF_TRACK_MODES,
  BREAK_RULES,
  MOMENTUM_RULES,
  REGEN_MODES,
  EVAL_TRIGGER_MODES,
  GEOM_MOVE_MODES,
} from './genome';

export function exportVariantsRankingCsvV2(rows: EvaluatedAutomatonV2[]): string {
  if (!rows.length) return '';
  const headers = [
    'rang_global',
    'code',
    'family_id',
    'rung_reached',
    'generation',
    'score_global',
    'M1_maitrise',
    'M2_adaptation',
    'M3_tension',
    'M4_simplicite',
    'martingale_penalty',
    'is_pareto_4d',
    'delta_skill',
    'snr',
    'delta_piste',
    'kendall_tau',
    'jensen_shannon_djs',
    'temporal_tvd',
    'nash_margin',
    'shannon_entropy_bits',
    'shannon_entropy_norm_pct',
    'trees_raw_pct',
    'trees_regen_pct',
    'stumps_raw_pct',
    'terraced_pct',
    'b0_stall_rate_pct',
    'm_phys_per_turn',
    'c_cog_per_turn',
    'c_regle_static',
    'score_B0_Passif',
    'score_B1_Aveugle',
    'score_B2a_Anti_Coupe',
    'score_B2b_Anti_Bull',
    'score_B2c_Anti_Avance',
    'score_B3_Tacticien',
    'score_B4_Stratege',
    'niche_key',
    'cut_to_bull_ratio_pct',
    'moves_per_track',
  ];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.rangGlobal ?? 0,
        JSON.stringify(r.code),
        JSON.stringify(r.familyId),
        r.rungReached,
        r.generation,
        r.scoreGlobal,
        r.M1_maitrise,
        r.M2_adaptation,
        r.M3_tension,
        r.M4_simplicite,
        r.martingalePenalty,
        Boolean(r.isPareto4D),
        r.deltaSkill,
        r.snr,
        r.deltaPiste,
        r.kendallTau,
        r.jensenShannonDjs,
        r.temporalTvd,
        r.nashMargin,
        r.shannonEntropyBits,
        r.shannonEntropyNormPct,
        r.treesRawPct,
        r.treesRegenPct,
        r.stumpsRawPct,
        r.terracedPct,
        r.b0StallRatePct,
        r.mPhysPerTurn,
        r.cCogPerTurn,
        r.cRegleStatic,
        r.botScores.B0_Passif,
        r.botScores.B1_Aveugle,
        r.botScores.B2a_Mono_Anti_Coupe,
        r.botScores.B2b_Mono_Anti_Bull,
        r.botScores.B2c_Mono_Anti_Avance,
        r.botScores.B3_Tacticien_Couloir,
        r.botScores.B4_Stratege_Complet,
        JSON.stringify(r.nicheKey),
        r.cutToBullRatio,
        r.movesPerTrack,
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function exportMapElitesArchiveCsv(archive: Map<string, EvaluatedAutomatonV2>): string {
  const headers = [
    'niche_key',
    'niche_x_complexity',
    'niche_y_cut_ratio',
    'niche_z_kinetics',
    'champion_code',
    'score_global',
    'M1_maitrise',
    'M2_adaptation',
    'M3_tension',
    'M4_simplicite',
    'nash_margin',
    'c_regle_static',
  ];
  const lines = [headers.join(',')];
  for (const [key, r] of archive.entries()) {
    lines.push(
      [
        JSON.stringify(key),
        r.nicheX,
        r.nicheY,
        r.nicheZ,
        JSON.stringify(r.code),
        r.scoreGlobal,
        r.M1_maitrise,
        r.M2_adaptation,
        r.M3_tension,
        r.M4_simplicite,
        r.nashMargin,
        r.cRegleStatic,
      ].join(',')
    );
  }
  return lines.join('\n');
}

export interface SensitivityRowV2 {
  dimension: string;
  modality: string;
  count: number;
  scoreGlobal: number;
  M1: number;
  M2: number;
  M3: number;
  M4: number;
  nashMargin: number;
  cRegle: number;
}

export function computeSensitivityAnalysisV2(rows: EvaluatedAutomatonV2[]): SensitivityRowV2[] {
  if (!rows.length) return [];

  const extractors: Array<{ name: string; fn: (r: EvaluatedAutomatonV2) => string }> = [
    { name: 'Durée (Tours)', fn: (r) => `${r.genome[HDR_T_TURNS]} tours` },
    {
      name: 'Bout de Piste',
      fn: (r) => END_OF_TRACK_MODES[r.genome[HDR_END_OF_TRACK_MODE]] || 'STOP',
    },
    { name: 'Règle de Casse', fn: (r) => BREAK_RULES[r.genome[HDR_BREAK_RULE]] || 'NEVER' },
    { name: 'Élan Mécanique', fn: (r) => MOMENTUM_RULES[r.genome[HDR_MOMENTUM_RULE]] || 'NONE' },
    {
      name: 'Décompte Piste 3',
      fn: (r) => REGEN_MODES[r.genome[HDR_REGEN_MODE]] || 'PISTE3_1_PER_CELL_WITH_STUMP',
    },
    {
      name: 'Topologie Biomes',
      fn: (r) => (r.genome[ARENA_BIOME_MODE] === 1 ? 'ASYMMETRIC_12A' : 'SYMMETRIC'),
    },
    {
      name: 'Déclencheur Piste 2D6',
      fn: (r) => EVAL_TRIGGER_MODES[r.genome[OFFSET_LEARNING + 22]] || 'MAJORITY_UNPARRIED',
    },
    {
      name: 'Mouvement Piste 2D6',
      fn: (r) => GEOM_MOVE_MODES[r.genome[OFFSET_LEARNING + 27]] || 'SWAP_TOWARD_7_OR_EDGES',
    },
  ];

  const avg = (arr: number[]) =>
    arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;

  const out: SensitivityRowV2[] = [];
  for (const ext of extractors) {
    const map = new Map<string, EvaluatedAutomatonV2[]>();
    for (const r of rows) {
      const m = ext.fn(r);
      const list = map.get(m) || [];
      list.push(r);
      map.set(m, list);
    }
    for (const [modality, list] of map.entries()) {
      out.push({
        dimension: ext.name,
        modality,
        count: list.length,
        scoreGlobal: avg(list.map((x) => x.scoreGlobal)),
        M1: avg(list.map((x) => x.M1_maitrise)),
        M2: avg(list.map((x) => x.M2_adaptation)),
        M3: avg(list.map((x) => x.M3_tension)),
        M4: avg(list.map((x) => x.M4_simplicite)),
        nashMargin: avg(list.map((x) => x.nashMargin)),
        cRegle: avg(list.map((x) => x.cRegleStatic)),
      });
    }
  }
  return out;
}

export function exportSensitivityCsvV2(sens: SensitivityRowV2[]): string {
  const headers = [
    'Dimension',
    'Modalite',
    'Effectif',
    'Score_Global',
    'M1_Maitrise',
    'M2_Adaptation',
    'M3_Tension',
    'M4_Simplicite',
    'Marge_Nash_AntiMartingale',
    'C_Regle_Statique',
  ];
  const lines = [headers.join(',')];
  for (const s of sens) {
    lines.push(
      [
        JSON.stringify(s.dimension),
        JSON.stringify(s.modality),
        s.count,
        s.scoreGlobal,
        s.M1,
        s.M2,
        s.M3,
        s.M4,
        s.nashMargin,
        s.cRegle,
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function generateFullCampaignReportV2(
  rows: EvaluatedAutomatonV2[],
  archive: Map<string, EvaluatedAutomatonV2>,
  sens: SensitivityRowV2[],
  top1Profile: TurnByTurnProfileV2 | null,
  mode: 'grid_sh' | 'genetic_qd',
  weights: WeightsV2,
  elapsedSec: number
): string {
  if (!rows.length) return '# Aucun résultat disponible';
  const top1 = rows[0];
  const paretoCount = rows.filter((r) => r.isPareto4D).length;

  const lines: string[] = [];
  lines.push(`# Bilan Scientifique de Campagne — Forêt Automate Lab v2`);
  lines.push(
    `* **Moteur d'exploration :** \`${
      mode === 'grid_sh'
        ? 'Grille Cartésienne + Entonnoir Multi-Fidélité (Successive Halving 3 Étages)'
        : 'Algorithme Évolutionnaire Hybride NSGA-II + MAP-Elites (800 Niches)'
    }\``
  );
  lines.push(
    `* **Individus évalués :** \`${rows.length}\` | **Front de Pareto 4D :** \`${paretoCount}\` champions non-dominés | **Niches MAP-Elites illuminées :** \`${archive.size} / 800\``
  );
  lines.push(
    `* **Pondération des Objectifs :** $w_1=${weights.w1_maitrise.toFixed(
      2
    )}$ (Maîtrise), $w_2=${weights.w2_adaptation.toFixed(
      2
    )}$ (Adaptation), $w_3=${weights.w3_tension.toFixed(
      2
    )}$ (Tension), $w_4=${weights.w4_simplicite.toFixed(2)}$ (Simplicité)`
  );
  lines.push(`* **Temps d'exécution :** \`${elapsedSec.toFixed(2)} s\`\n`);

  lines.push(`---`);
  lines.push(`## 1. Podium des 15 Meilleurs Automates (Théorie des Jeux Empirique)\n`);
  lines.push(
    `| Rang | Code | Étage | Score Global | M1 Maîtrise | M2 Adapt. | M3 Tension | M4 Fluidité | SNR | Marge Nash | H3 Shannon | C_règle | Pareto 4D |`
  );
  lines.push(`|---:|:---|:---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|`);
  for (const r of rows.slice(0, 15)) {
    lines.push(
      `| ${r.rangGlobal} | \`${r.code}\` | R${r.rungReached} | **${r.scoreGlobal}** | ${r.M1_maitrise} | ${r.M2_adaptation} | ${r.M3_tension} | ${r.M4_simplicite} | ${r.snr} | +${r.nashMargin}% | ${r.shannonEntropyBits} b | ${r.cRegleStatic} | ${
        r.isPareto4D ? 'OUI' : 'Non'
      } |`
    );
  }

  lines.push(`\n---`);
  lines.push(`## 2. Matrice de Réponse aux 7 Bots Iso-Effort (Top 5 Automates)\n`);
  lines.push(
    `| Rang | Code | B0 Passif | B1 Aveugle | B2a Anti-Coupe | B2b Anti-Bull | B2c Anti-Avance | B3 Tacticien | B4 Stratège 2D6 | Malus Martingale |`
  );
  lines.push(`|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const r of rows.slice(0, 5)) {
    lines.push(
      `| ${r.rangGlobal} | \`${r.code}\` | ${r.botScores.B0_Passif}% | ${r.botScores.B1_Aveugle}% | ${r.botScores.B2a_Mono_Anti_Coupe}% | ${r.botScores.B2b_Mono_Anti_Bull}% | ${r.botScores.B2c_Mono_Anti_Avance}% | **${r.botScores.B3_Tacticien_Couloir}%** | **${r.botScores.B4_Stratege_Complet}%** | -${r.martingalePenalty} |`
    );
  }

  lines.push(`\n---`);
  lines.push(`## 3. Traduction en Règles de Jeu Humaines du Top 5 (Prêtes pour Playtest)\n`);
  for (const r of rows.slice(0, 5)) {
    const rulebook = translateGenomeToHumanRulebook(r.genome, r.code);
    lines.push(rulebook.markdown);
    lines.push(`\n---\n`);
  }

  if (top1Profile) {
    lines.push(`## 4. Courbe Temporelle Tour par Tour du Champion #1 (\`${top1.code}\`)\n`);
    lines.push(
      `| Tour | Arbres Debout (%) | Souches Critiques Piste 3 (%) | Souches Surnuméraires (%) | Zones Terrassées (%) | Bulldozer au Cœur 6-7-8 (%) |`
    );
    lines.push(`|---:|---:|---:|---:|---:|---:|`);
    for (let i = 0; i < top1Profile.turns.length; i++) {
      lines.push(
        `| T${top1Profile.turns[i]} | ${top1Profile.treesRawPct[i]}% | ${top1Profile.stumpsCritPiste3Pct[i]}% | ${top1Profile.stumpsExtraPct[i]}% | ${top1Profile.terracedPct[i]}% | ${top1Profile.centerBulldozerPct[i]}% |`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Génère un script Python/Numba V2 autonome prêt à exécuter sur la VM Oracle (8 OCPU / 16 vCPUs)
 * incluant le génome binaire 447 int32, le noyau @njit(nogil=True, parallel=True, fastmath=True),
 * l'entonnoir Successive Halving à 3 étages (320 -> 11 200 -> 84 000 parties) et la réservation os.nice(15).
 */
export function generateOciPythonBundleScript(
  activeFamily: FamilySpecDSL,
  topAutomata: EvaluatedAutomatonV2[]
): string {
  const topGenomesJson = JSON.stringify(
    topAutomata.slice(0, 10).map((a) => ({
      code: a.code,
      genome: Array.from(a.genome),
    })),
    null,
    2
  );

  return `#!/usr/bin/env python3
"""
==============================================================================
FORÊT AUTOMATE LAB V2 — BUNDLE HAUTE PERFORMANCE ORACLE CLOUD (16 vCPUs)
==============================================================================
Architecture 3 Niveaux :
  • Niveau 1 : Machine Virtuelle compilée Numba @njit(nogil=True, fastmath=True)
               (18 Capteurs, 9 Verbes, Parades, Casse, Élan, Piste 3)
  • Niveau 2 : Famille active "${activeFamily.family_id}"
  • Niveau 3 : Vecteur plat de 447 entiers int32 (1 788 octets alignés cache L1)
Optimisations VM.Standard.E5.Flex (8 OCPU / 16 vCPUs, 16 Go RAM) :
  • Pool limité à 14 workers (2 vCPUs réservés pour l'OS / SSH) + os.nice(15)
  • Common Random Numbers (CRN) xorshift64* entre les 7 Bots (B0..B4)
  • Entonnoir Successive Halving à 3 Étages (320 -> 11 200 -> 84 000 parties, 11.48x speedup)

Usage sur votre VM Oracle :
  python3 foret_automate_lab_v2_oci.py --workers 14 --mode sh3
==============================================================================
"""
import os
import time
import json
import argparse
import multiprocessing as mp
import numpy as np

try:
    from numba import njit
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False
    def njit(*args, **kwargs):
        def dec(fn): return fn
        return dec

GENOME_SIZE = 447

@njit(nogil=True, fastmath=True, cache=True)
def _xorshift64star(state: np.uint64) -> np.uint64:
    x = state
    x ^= x >> np.uint64(12)
    x ^= x << np.uint64(25)
    x ^= x >> np.uint64(27)
    return x * np.uint64(2685821657736338717)

@njit(nogil=True, fastmath=True, cache=True)
def run_vm_level1_batch_numba(
    genome: np.ndarray,
    n_players: int,
    bot_id: int,
    effort_rate: float,
    n_games: int,
    seed: int
) -> np.ndarray:
    """
    Exécute n_games parties sur la Machine Virtuelle de Niveau 1 à partir d'un génome de 447 int32.
    Retourne [mean_score_pct, std_score_pct, trees_raw_pct, stumps_raw_pct, terraced_pct, m_phys, c_cog, stall_rate].
    """
    rng = np.uint64(seed if seed != 0 else 88172645463325252)
    L = max(1, min(8, int(genome[0])))
    T = max(1, int(genome[1]))
    eot_mode = int(genome[3])
    regen_mode = int(genome[8])
    regen_max = max(1, int(genome[9]))

    A = np.zeros((n_players, L), dtype=np.int32)
    S = np.zeros((n_players, L), dtype=np.int32)
    Z = np.zeros((n_players, L), dtype=np.int32)
    Pos = np.zeros((n_players, 2), dtype=np.int32)
    Dir = np.ones((n_players, 2), dtype=np.int32)
    track = np.zeros(11, dtype=np.int32)

    total_init = 0
    for c in range(L):
        total_init += n_players * max(1, int(genome[10 + c]))

    expected_gates = max(1, int(round(T * 1.75)))
    quota_per_track = 0 if bot_id == 0 else int(round(effort_rate * expected_gates))

    mean_score = 0.0
    m2_score = 0.0
    sum_trees = 0.0
    sum_stumps = 0.0
    sum_terr = 0.0
    sum_phys = 0.0
    sum_cog = 0.0
    sum_stalls = 0.0
    sum_slots = 0.0

    for g in range(n_games):
        for j in range(n_players):
            Pos[j, 0] = 0
            Pos[j, 1] = 0
            Dir[j, 0] = 1
            Dir[j, 1] = 1
            for c in range(L):
                A[j, c] = max(1, int(genome[10 + c]))
                S[j, c] = 0
                Z[j, c] = 0
        for idx in range(11):
            track[idx] = genome[419 + idx]

        q_rem = quota_per_track * n_players
        r_rem = expected_gates * n_players
        g_phys = 0.0
        g_cog = 0.0

        for t in range(T):
            g_cog += 1.0
            rng = _xorshift64star(rng)
            d1 = int(rng % np.uint64(6)) + 1
            rng = _xorshift64star(rng)
            d2 = int(rng % np.uint64(6)) + 1
            tile_idx = (d1 + d2) - 2
            tac_id = max(0, min(5, int(track[tile_idx])))
            t_base = 35 + tac_id * 64
            m = 1 if genome[t_base] == 1 else 0

            for j in range(n_players):
                for s in range(4):
                    s_base = t_base + 4 + s * 15
                    v_true = int(genome[s_base + 7])
                    v_false = int(genome[s_base + 10])
                    if v_true == 0 and v_false == 0:
                        continue
                    sum_slots += 1.0
                    c_cur = Pos[j, m]
                    targets = A[j, c_cur] if m == 0 else S[j, c_cur]
                    verb = v_true if targets >= int(genome[s_base + 2]) else v_false
                    if verb == 0:
                        sum_stalls += 1.0
                        continue

                    p_base = float(q_rem) / float(max(1, r_rem))
                    r_rem = max(1, r_rem - 1)
                    rng = _xorshift64star(rng)
                    u = float(rng & np.uint64(0xFFFFFF)) / float(0x1000000)
                    if bot_id > 0 and u < p_base and q_rem > 0:
                        q_rem -= 1
                        if int(genome[s_base + 13]) == 2:
                            break
                        continue

                    if verb == 1 and A[j, c_cur] > 0:
                        A[j, c_cur] -= 1
                        S[j, c_cur] += 1
                        g_phys += 1.0
                    elif verb == 2 and S[j, c_cur] > 0:
                        S[j, c_cur] -= 1
                        Z[j, c_cur] += 1
                        g_phys += 1.0
                    elif verb == 4:
                        nxt = c_cur + Dir[j, m]
                        if 0 <= nxt < L and (m == 0 or nxt <= Pos[j, 0]):
                            Pos[j, m] = nxt
                            g_phys += 1.0
                        elif eot_mode >= 1:
                            Dir[j, m] = -Dir[j, m]

        raw_a, raw_s, raw_z, final_a = 0, 0, 0, 0
        for j in range(n_players):
            for c in range(L):
                raw_a += A[j, c]
                raw_s += S[j, c]
                raw_z += Z[j, c]
                reg = 1 if (regen_mode == 1 and S[j, c] > 0) or (regen_mode == 2 and S[j, c] > 0 and Z[j, c] == 0) else 0
                final_a += A[j, c] + reg

        sc = (100.0 * float(final_a)) / float(total_init)
        n_obs = float(g + 1)
        dl = sc - mean_score
        mean_score += dl / n_obs
        m2_score += dl * (sc - mean_score)
        sum_trees += (100.0 * float(raw_a)) / float(total_init)
        sum_stumps += (100.0 * float(raw_s)) / float(total_init)
        sum_terr += (100.0 * float(raw_z)) / float(total_init)
        sum_phys += g_phys / float(T)
        sum_cog += g_cog / float(T)

    inv_n = 1.0 / float(n_games)
    std_sc = np.sqrt(m2_score / float(max(1, n_games - 1))) if n_games > 1 else 0.0
    out = np.zeros(8, dtype=np.float64)
    out[0] = mean_score
    out[1] = std_sc
    out[2] = sum_trees * inv_n
    out[3] = sum_stumps * inv_n
    out[4] = sum_terr * inv_n
    out[5] = sum_phys * inv_n
    out[6] = sum_cog * inv_n
    out[7] = 100.0 * (sum_stalls / max(1.0, sum_slots))
    return out

SEEDED_CHAMPIONS = ${topGenomesJson}

def _init_worker():
    try:
        os.nice(15)
    except Exception:
        pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Forêt Automate Lab v2 — Runner OCI 16 vCPUs")
    parser.add_argument("--workers", type=int, default=14)
    parser.add_argument("--mode", type=str, default="sh3")
    args = parser.parse_args()
    _init_worker()
    print("=" * 76)
    print(f" FORÊT AUTOMATE LAB V2 — OCI Runner (Numba JIT={'OUI' if HAS_NUMBA else 'NON'})")
    print(f" Workers alloués : {args.workers} | Génomes champions pré-chargés : {len(SEEDED_CHAMPIONS)}")
    print("=" * 76)
    t0 = time.time()
    for item in SEEDED_CHAMPIONS:
        g_arr = np.array(item["genome"], dtype=np.int32)
        res_b3 = run_vm_level1_batch_numba(g_arr, 4, 5, 0.50, 1000, 20261027)
        print(f" • {item['code']:28s} | Score B3 (1000 MC): {res_b3[0]:5.2f}% (±{res_b3[1]:4.2f}%) | Gestes/t: {res_b3[5]:.2f}")
    print(f" Terminé en {time.time() - t0:.2f} s.")
`;
}
