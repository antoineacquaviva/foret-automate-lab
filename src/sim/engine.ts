import { TOPOLOGIES, TOPOLOGY_LENGTHS, INITIAL_TRACKS, VariantSpec, variantToIntTuple } from './variants';

// Fast deterministic 64-bit xorshift64* split into two 32-bit unsigned ints for V8 speed
function nextRng(state: Uint32Array): number {
  let lo = state[0] >>> 0;
  let hi = state[1] >>> 0;

  // x ^= x >> 12
  const t1_lo = ((lo >>> 12) | (hi << 20)) >>> 0;
  const t1_hi = (hi >>> 12) >>> 0;
  lo = (lo ^ t1_lo) >>> 0;
  hi = (hi ^ t1_hi) >>> 0;

  // x ^= x << 25
  const t2_lo = (lo << 25) >>> 0;
  const t2_hi = ((hi << 25) | (lo >>> 7)) >>> 0;
  lo = (lo ^ t2_lo) >>> 0;
  hi = (hi ^ t2_hi) >>> 0;

  // x ^= x >> 27
  const t3_lo = ((lo >>> 27) | (hi << 5)) >>> 0;
  const t3_hi = (hi >>> 27) >>> 0;
  lo = (lo ^ t3_lo) >>> 0;
  hi = (hi ^ t3_hi) >>> 0;

  state[0] = lo;
  state[1] = hi;

  // Mix 32-bit output with golden ratio multiplier
  return Math.imul(lo ^ hi, 0x9e3779b9) >>> 0;
}

export function simulateBatchKernel(
  o1: number,
  o2: number,
  o3: number,
  o4: number,
  o5: number,
  p1: number,
  p2: number,
  T_turns: number,
  n_players: number,
  doctrine_id: number,
  effort_rate: number,
  n_games: number,
  seed: number,
  init_cells: number[],
  L_cells: number,
  init_track: number[]
): Float64Array {
  const rngState = new Uint32Array(2);
  rngState[0] = (seed !== 0 ? seed : 0x456789ab) >>> 0;
  rngState[1] = ((seed !== 0 ? seed : 0x12345678) ^ 0x9e3779b9) >>> 0;

  let total_trees_per_track = 0;
  for (let c = 0; c < L_cells; c++) {
    total_trees_per_track += init_cells[c];
  }
  const total_init_trees = n_players * total_trees_per_track;

  const k_half_sup = Math.floor((n_players + 1) / 2);
  let k_avg = k_half_sup;
  if (p2 === 1) {
    k_avg = n_players - 1;
  } else if (p2 === 2) {
    k_avg = k_half_sup + 0.5;
  }

  const expected_total_attacks = Math.round(T_turns * k_avg);
  const target_parry_quota = Math.round(effort_rate * expected_total_attacks);

  let mean_score = 0.0;
  let m2_score = 0.0;
  let sum_trees_pct = 0.0;
  let sum_stumps_pct = 0.0;
  let sum_terraced_pct = 0.0;
  let sum_m_phys = 0.0;
  let sum_c_cog = 0.0;
  let sum_center_early = 0.0;
  let sum_center_late = 0.0;
  let sum_stalls = 0.0;
  let sum_total_slots = 0.0;
  let sum_parries = 0.0;

  const A = new Int32Array(n_players * L_cells);
  const S = new Int32Array(n_players * L_cells);
  const Pos_A = new Int32Array(n_players);
  const Pos_T = new Int32Array(n_players);
  const track = new Int32Array(11);

  const elig_primary = new Int32Array(n_players);
  const elig_any = new Int32Array(n_players);
  const sort_key = new Int32Array(n_players);
  const base_key = new Int32Array(n_players);
  const order = new Int32Array(n_players);

  const t_early_limit = Math.max(1, Math.floor(T_turns / 3));
  const t_late_start = Math.max(1, Math.floor((2 * T_turns) / 3));

  for (let g = 0; g < n_games; g++) {
    for (let j = 0; j < n_players; j++) {
      Pos_A[j] = 0;
      Pos_T[j] = 0;
      const rowOffset = j * L_cells;
      for (let c = 0; c < L_cells; c++) {
        A[rowOffset + c] = init_cells[c];
        S[rowOffset + c] = 0;
      }
    }
    for (let idx = 0; idx < 11; idx++) {
      track[idx] = init_track[idx];
    }

    let Q_rem = target_parry_quota;
    let R_rem = expected_total_attacks;

    let game_m_phys = 0.0;
    let game_c_cog = 0.0;
    let game_stalls = 0;
    let game_slots = 0;
    let game_parries = 0;

    let early_terr_count = 0;
    let early_turns = 0;
    let late_terr_count = 0;
    let late_turns = 0;

    for (let t = 0; t < T_turns; t++) {
      game_c_cog += 1.0;

      let terr_in_center = 0;
      if (track[4] >= 2) terr_in_center += 1;
      if (track[5] >= 2) terr_in_center += 1;
      if (track[6] >= 2) terr_in_center += 1;

      if (t < t_early_limit) {
        early_terr_count += terr_in_center;
        early_turns += 1;
      } else if (t >= t_late_start) {
        late_terr_count += terr_in_center;
        late_turns += 1;
      }

      const d1 = (nextRng(rngState) % 6) + 1;
      const d2 = (nextRng(rngState) % 6) + 1;
      const tile_idx = d1 + d2 - 2;
      const tactic = track[tile_idx];

      let K = k_half_sup;
      if (p2 === 1) {
        K = n_players - 1;
      } else if (p2 === 2) {
        K = tactic === 0 || tactic === 3 ? Math.min(n_players, k_half_sup + 1) : k_half_sup;
      }

      // Étape 1 : Avancement d'approche gratuit des machines
      if (tactic < 2) {
        for (let j = 0; j < n_players; j++) {
          const rowOffset = j * L_cells;
          const cur = Pos_A[j];
          if (A[rowOffset + cur] === 0) {
            let moved = 0;
            for (let nxt = cur + 1; nxt < L_cells; nxt++) {
              if (A[rowOffset + nxt] > 0) {
                Pos_A[j] = nxt;
                moved = 1;
                break;
              }
            }
            if (moved === 1) game_m_phys += 1.0;
          }
        }
      } else {
        for (let j = 0; j < n_players; j++) {
          const rowOffset = j * L_cells;
          const cur = Pos_T[j];
          const limit_a = Pos_A[j];
          if (tactic === 3) {
            if (!(A[rowOffset + cur] === 0 && S[rowOffset + cur] > 0)) {
              let moved = 0;
              for (let nxt = cur + 1; nxt <= limit_a; nxt++) {
                if (A[rowOffset + nxt] === 0 && S[rowOffset + nxt] > 0) {
                  Pos_T[j] = nxt;
                  moved = 1;
                  break;
                }
              }
              if (moved === 0 && S[rowOffset + cur] === 0) {
                for (let nxt = cur + 1; nxt <= limit_a; nxt++) {
                  if (S[rowOffset + nxt] > 0) {
                    Pos_T[j] = nxt;
                    moved = 1;
                    break;
                  }
                }
              }
              if (moved === 1) game_m_phys += 1.0;
            }
          } else {
            if (S[rowOffset + cur] === 0 && cur < limit_a) {
              let moved = 0;
              for (let nxt = cur + 1; nxt <= limit_a; nxt++) {
                if (S[rowOffset + nxt] > 0) {
                  Pos_T[j] = nxt;
                  moved = 1;
                  break;
                }
              }
              if (moved === 1) game_m_phys += 1.0;
            }
          }
        }
      }

      // Étape 2 : Qualification et tri des pistes
      let n_primary = 0;
      for (let j = 0; j < n_players; j++) {
        const rowOffset = j * L_cells;
        const rot_prio = (j + t) % n_players;
        let has_t = 0;
        let prim = 0;
        let sc1 = 0;
        let sc2 = 0;

        if (tactic === 0) {
          const c = Pos_A[j];
          has_t = A[rowOffset + c] > 0 ? 1 : 0;
          prim = has_t === 1 && S[rowOffset + c] === 0 ? 1 : 0;
          sc1 = L_cells - c;
          sc2 = A[rowOffset + c];
        } else if (tactic === 1) {
          const c = Pos_A[j];
          has_t = A[rowOffset + c] > 0 ? 1 : 0;
          prim = has_t === 1 && S[rowOffset + c] >= 1 ? 1 : 0;
          sc1 = 10 - A[rowOffset + c];
          sc2 = c;
        } else if (tactic === 2) {
          const c = Pos_T[j];
          has_t = S[rowOffset + c] > 0 ? 1 : 0;
          const gap = Pos_A[j] - c;
          prim = has_t === 1 && gap <= 1 ? 1 : 0;
          sc1 = L_cells - gap;
          sc2 = c;
        } else {
          const c = Pos_T[j];
          has_t = S[rowOffset + c] > 0 ? 1 : 0;
          prim = has_t === 1 && A[rowOffset + c] === 0 ? 1 : 0;
          sc1 = S[rowOffset + c];
          sc2 = L_cells - c;
        }

        elig_any[j] = has_t;
        elig_primary[j] = prim;
        if (prim === 1) n_primary += 1;

        const b_k = has_t * 100000 + prim * 10000 + sc1 * 100 + sc2;
        base_key[j] = b_k;
        sort_key[j] = b_k * 10 + (n_players - rot_prio);
        order[j] = j;
      }

      // Insertion sort descending
      for (let i = 1; i < n_players; i++) {
        const key_val = sort_key[i];
        const ord_val = order[i];
        let k_idx = i - 1;
        while (k_idx >= 0 && sort_key[k_idx] < key_val) {
          sort_key[k_idx + 1] = sort_key[k_idx];
          order[k_idx + 1] = order[k_idx];
          k_idx -= 1;
        }
        sort_key[k_idx + 1] = key_val;
        order[k_idx + 1] = ord_val;
      }

      if (K < n_players) {
        const j_in = order[K - 1];
        const j_out = order[K];
        if (elig_any[j_in] === 1 && base_key[j_in] === base_key[j_out]) {
          game_c_cog += 1.0;
        }
      }

      if (o1 === 1 && n_primary < K) {
        let used_fallback = 0;
        for (let s_idx = 0; s_idx < K; s_idx++) {
          const j_sel = order[s_idx];
          if (elig_any[j_sel] === 1 && elig_primary[j_sel] === 0) {
            used_fallback = 1;
            break;
          }
        }
        if (used_fallback === 1) game_c_cog += 2.0;
      }

      // Étape 3 : Résolution sur les K pistes sélectionnées
      let turn_successes = 0;
      let turn_failures = 0;
      let turn_boosts = 0;

      for (let s_idx = 0; s_idx < K; s_idx++) {
        game_slots += 1;
        const j = order[s_idx];
        const rowOffset = j * L_cells;
        const is_valid = elig_any[j];
        const is_prim = elig_primary[j];

        if (is_valid === 0 || (o1 === 0 && is_prim === 0)) {
          game_stalls += 1;
          turn_failures += 1;
          if (R_rem > 1) R_rem -= 1;
          continue;
        }

        const c = tactic < 2 ? Pos_A[j] : Pos_T[j];

        let is_boost = 0;
        if (is_prim === 1) {
          if (tactic < 2 && S[rowOffset + c] === 0 && A[rowOffset + c] > 0) {
            is_boost = 1;
          } else if (tactic >= 2 && A[rowOffset + c] === 0 && S[rowOffset + c] > 0) {
            is_boost = 1;
          }
        }

        let is_prio = 0;
        if (doctrine_id === 1) {
          is_prio = tactic < 2 ? 1 : 0;
        } else if (doctrine_id === 2) {
          is_prio = tactic >= 2 ? 1 : 0;
        } else if (doctrine_id === 3) {
          is_prio = is_boost === 1 || c >= L_cells - 2 ? 1 : 0;
        } else if (doctrine_id === 4) {
          is_prio = tile_idx >= 4 && tile_idx <= 6 ? 1 : 0;
        } else if (doctrine_id === 5) {
          is_prio = is_boost === 0 && (tile_idx < 4 || tile_idx > 6) ? 1 : 0;
        }

        if (R_rem < 1) R_rem = 1;
        const p_base = Q_rem / R_rem;
        let p_parry = 0.0;
        if (Q_rem <= 0) {
          p_parry = 0.0;
        } else if (Q_rem >= R_rem) {
          p_parry = 1.0;
        } else if (doctrine_id === 0) {
          p_parry = p_base;
        } else {
          const delta_p = 0.42 * Math.min(p_base, 1.0 - p_base);
          if (is_prio === 1) {
            p_parry = Math.min(0.98, p_base + 1.25 * delta_p);
          } else {
            p_parry = Math.max(0.02, p_base - 0.85 * delta_p);
          }
        }

        if (R_rem > 1) R_rem -= 1;

        const u_rand = (nextRng(rngState) & 0xffffff) / 0x1000000;

        if (u_rand < p_parry && Q_rem > 0) {
          Q_rem -= 1;
          game_parries += 1;
          turn_failures += 1;
        } else {
          turn_successes += 1;
          if (is_boost === 1) turn_boosts += 1;

          if (tactic < 2) {
            if (is_boost === 0) {
              A[rowOffset + c] -= 1;
              S[rowOffset + c] += 1;
              game_m_phys += 1.0;
            } else {
              if (o2 === 0) {
                const cut_n = A[rowOffset + c] >= 2 ? 2 : A[rowOffset + c];
                A[rowOffset + c] -= cut_n;
                S[rowOffset + c] += cut_n;
                game_m_phys += cut_n;
              } else if (o2 === 1) {
                const cut_n = A[rowOffset + c];
                A[rowOffset + c] = 0;
                S[rowOffset + c] += cut_n;
                game_m_phys += cut_n;
              } else {
                if (A[rowOffset + c] >= 2) {
                  A[rowOffset + c] -= 2;
                  S[rowOffset + c] += 2;
                  game_m_phys += 2.0;
                } else {
                  A[rowOffset + c] -= 1;
                  S[rowOffset + c] += 1;
                  game_m_phys += 1.0;
                  if (c + 1 < L_cells && A[rowOffset + c + 1] > 0) {
                    Pos_A[j] = c + 1;
                    game_m_phys += 1.0;
                    game_c_cog += 2.0;
                    A[rowOffset + c + 1] -= 1;
                    S[rowOffset + c + 1] += 1;
                    game_m_phys += 1.0;
                  }
                }
              }
            }
            const cur_a = Pos_A[j];
            if (tactic === 1 && A[rowOffset + cur_a] === 0 && cur_a + 1 < L_cells) {
              Pos_A[j] = cur_a + 1;
              game_m_phys += 1.0;
            }
          } else {
            if (is_boost === 0) {
              S[rowOffset + c] -= 1;
              game_m_phys += 1.0;
            } else {
              if (o2 === 0) {
                const rem_n = S[rowOffset + c] >= 2 ? 2 : S[rowOffset + c];
                S[rowOffset + c] -= rem_n;
                game_m_phys += rem_n;
              } else if (o2 === 1) {
                const rem_n = S[rowOffset + c];
                S[rowOffset + c] = 0;
                game_m_phys += rem_n;
              } else {
                if (S[rowOffset + c] >= 2) {
                  S[rowOffset + c] -= 2;
                  game_m_phys += 2.0;
                } else {
                  S[rowOffset + c] -= 1;
                  game_m_phys += 1.0;
                  if (c + 1 <= Pos_A[j] && S[rowOffset + c + 1] > 0) {
                    Pos_T[j] = c + 1;
                    game_m_phys += 1.0;
                    game_c_cog += 2.0;
                    S[rowOffset + c + 1] -= 1;
                    game_m_phys += 1.0;
                  }
                }
              }
            }
          }
        }
      }

      // Étape 4 : Apprentissage statistique en fin de tour
      let shift = 0;
      if (o3 === 0) {
        shift = turn_successes > 0 && turn_successes >= turn_failures ? 1 : -1;
      } else if (o3 === 1) {
        game_c_cog += 0.5;
        if (turn_boosts > 0 && turn_successes >= turn_failures) {
          shift = 2;
        } else if (turn_successes > 0 && turn_successes >= turn_failures) {
          shift = 1;
        } else {
          shift = -1;
        }
      } else {
        game_c_cog += 1.0;
        shift = turn_successes - turn_failures;
      }

      let cur_idx = tile_idx;
      if (shift > 0) {
        let steps = shift;
        while (steps > 0 && cur_idx !== 5) {
          const nxt_idx = cur_idx < 5 ? cur_idx + 1 : cur_idx - 1;
          const tmp_tile = track[cur_idx];
          track[cur_idx] = track[nxt_idx];
          track[nxt_idx] = tmp_tile;
          cur_idx = nxt_idx;
          game_m_phys += 1.0;
          steps -= 1;
        }
      } else if (shift < 0) {
        let steps = -shift;
        while (steps > 0 && cur_idx !== 0 && cur_idx !== 10) {
          let nxt_idx = 0;
          if (cur_idx < 5) {
            nxt_idx = cur_idx - 1;
          } else if (cur_idx > 5) {
            nxt_idx = cur_idx + 1;
          } else {
            nxt_idx = t % 2 === 0 ? 4 : 6;
          }
          const tmp_tile = track[cur_idx];
          track[cur_idx] = track[nxt_idx];
          track[nxt_idx] = tmp_tile;
          cur_idx = nxt_idx;
          game_m_phys += 1.0;
          steps -= 1;
        }
      }
    }

    let rem_trees = 0;
    let rem_stumps = 0;
    for (let i = 0; i < n_players * L_cells; i++) {
      rem_trees += A[i];
      rem_stumps += S[i];
    }
    const terraced = total_init_trees - rem_trees - rem_stumps;

    const trees_pct = (100.0 * rem_trees) / total_init_trees;
    const stumps_pct = (100.0 * rem_stumps) / total_init_trees;
    const terraced_pct = (100.0 * terraced) / total_init_trees;

    const score = o5 === 0 ? trees_pct : trees_pct + 0.5 * stumps_pct;

    const n_obs = g + 1;
    const delta = score - mean_score;
    mean_score += delta / n_obs;
    const delta2 = score - mean_score;
    m2_score += delta * delta2;

    sum_trees_pct += trees_pct;
    sum_stumps_pct += stumps_pct;
    sum_terraced_pct += terraced_pct;
    sum_m_phys += game_m_phys / T_turns;
    sum_c_cog += game_c_cog / T_turns;
    sum_center_early += early_terr_count / (3 * Math.max(1, early_turns));
    sum_center_late += late_terr_count / (3 * Math.max(1, late_turns));
    sum_stalls += game_stalls;
    sum_total_slots += Math.max(1, game_slots);
    sum_parries += game_parries;
  }

  const std_score = n_games > 1 ? Math.sqrt(m2_score / (n_games - 1)) : 0.0;
  const inv_n = 1.0 / n_games;

  const out = new Float64Array(11);
  out[0] = mean_score;
  out[1] = std_score;
  out[2] = sum_trees_pct * inv_n;
  out[3] = sum_stumps_pct * inv_n;
  out[4] = sum_terraced_pct * inv_n;
  out[5] = sum_m_phys * inv_n;
  out[6] = sum_c_cog * inv_n;
  out[7] = 100.0 * (sum_center_early * inv_n);
  out[8] = 100.0 * (sum_center_late * inv_n);
  out[9] = 100.0 * (sum_stalls / Math.max(1.0, sum_total_slots));
  out[10] = sum_parries * inv_n;
  return out;
}

export interface TurnProfile {
  turns: number[];
  trees_pct: number[];
  stumps_pct: number[];
  terraced_pct: number[];
  center_terrassier_pct: number[];
}

export function simulateTurnByTurnProfile(
  variantSpec: VariantSpec,
  n_players = 4,
  effort_rate = 0.5,
  n_games = 300,
  seed = 4242
): TurnProfile {
  const [o1, o2, o3, , , , p2, T_turns] = variantToIntTuple(variantSpec);
  const init_cells = TOPOLOGIES[variantSpec.P1_topologie];
  const L_cells = TOPOLOGY_LENGTHS[variantSpec.P1_topologie];
  const init_track = INITIAL_TRACKS[variantSpec.O4_init_piste];

  let sumInit = 0;
  for (let c = 0; c < L_cells; c++) sumInit += init_cells[c];
  const total_init_trees = n_players * sumInit;

  const k_half_sup = Math.floor((n_players + 1) / 2);
  const k_avg = p2 === 0 ? k_half_sup : p2 === 1 ? n_players - 1 : k_half_sup + 0.5;
  const expected_total_attacks = Math.round(T_turns * k_avg);
  const target_parry_quota = Math.round(effort_rate * expected_total_attacks);

  const trees_curve = new Float64Array(T_turns);
  const stumps_curve = new Float64Array(T_turns);
  const terraced_curve = new Float64Array(T_turns);
  const center_terr_curve = new Float64Array(T_turns);

  const rngState = new Uint32Array(2);
  rngState[0] = seed >>> 0;
  rngState[1] = (seed ^ 0x9e3779b9) >>> 0;

  for (let g = 0; g < n_games; g++) {
    const A = new Int32Array(n_players * L_cells);
    const S = new Int32Array(n_players * L_cells);
    const Pos_A = new Int32Array(n_players);
    const Pos_T = new Int32Array(n_players);
    for (let j = 0; j < n_players; j++) {
      for (let c = 0; c < L_cells; c++) {
        A[j * L_cells + c] = init_cells[c];
      }
    }
    const track = Int32Array.from(init_track);
    let Q_rem = target_parry_quota;
    let R_rem = expected_total_attacks;

    for (let t = 0; t < T_turns; t++) {
      const terr_in_center =
        (track[4] >= 2 ? 1 : 0) + (track[5] >= 2 ? 1 : 0) + (track[6] >= 2 ? 1 : 0);
      center_terr_curve[t] += (100.0 * terr_in_center) / 3.0;

      const d1 = (nextRng(rngState) % 6) + 1;
      const d2 = (nextRng(rngState) % 6) + 1;
      const tile_idx = d1 + d2 - 2;
      const tactic = track[tile_idx];

      let K = k_half_sup;
      if (p2 === 1) K = n_players - 1;
      else if (p2 === 2) K = tactic === 0 || tactic === 3 ? Math.min(n_players, k_half_sup + 1) : k_half_sup;

      if (tactic < 2) {
        for (let j = 0; j < n_players; j++) {
          const row = j * L_cells;
          if (A[row + Pos_A[j]] === 0) {
            for (let nxt = Pos_A[j] + 1; nxt < L_cells; nxt++) {
              if (A[row + nxt] > 0) {
                Pos_A[j] = nxt;
                break;
              }
            }
          }
        }
      } else {
        for (let j = 0; j < n_players; j++) {
          const row = j * L_cells;
          const cur = Pos_T[j];
          const lim = Pos_A[j];
          if (tactic === 3 && !(A[row + cur] === 0 && S[row + cur] > 0)) {
            for (let nxt = cur + 1; nxt <= lim; nxt++) {
              if (A[row + nxt] === 0 && S[row + nxt] > 0) {
                Pos_T[j] = nxt;
                break;
              }
            }
          } else if (S[row + cur] === 0 && cur < lim) {
            for (let nxt = cur + 1; nxt <= lim; nxt++) {
              if (S[row + nxt] > 0) {
                Pos_T[j] = nxt;
                break;
              }
            }
          }
        }
      }

      const candidates: Array<[number, number, number, number, number, number]> = [];
      for (let j = 0; j < n_players; j++) {
        const row = j * L_cells;
        const rot = (j + t) % n_players;
        let has_t = 0;
        let prim = 0;
        let sc1 = 0;
        let sc2 = 0;
        if (tactic === 0) {
          const c = Pos_A[j];
          has_t = A[row + c] > 0 ? 1 : 0;
          prim = has_t && S[row + c] === 0 ? 1 : 0;
          sc1 = L_cells - c;
          sc2 = A[row + c];
        } else if (tactic === 1) {
          const c = Pos_A[j];
          has_t = A[row + c] > 0 ? 1 : 0;
          prim = has_t && S[row + c] >= 1 ? 1 : 0;
          sc1 = 10 - A[row + c];
          sc2 = c;
        } else if (tactic === 2) {
          const c = Pos_T[j];
          has_t = S[row + c] > 0 ? 1 : 0;
          prim = has_t && Pos_A[j] - c <= 1 ? 1 : 0;
          sc1 = L_cells - (Pos_A[j] - c);
          sc2 = c;
        } else {
          const c = Pos_T[j];
          has_t = S[row + c] > 0 ? 1 : 0;
          prim = has_t && A[row + c] === 0 ? 1 : 0;
          sc1 = S[row + c];
          sc2 = L_cells - c;
        }
        candidates.push([has_t, prim, sc1, sc2, -rot, j]);
      }
      candidates.sort((a, b) => {
        for (let k = 0; k < 5; k++) {
          if (b[k] !== a[k]) return b[k] - a[k];
        }
        return 0;
      });

      let turn_succ = 0;
      let turn_fail = 0;
      let turn_bst = 0;

      for (let s_idx = 0; s_idx < K; s_idx++) {
        const [has_t, prim, , , , j] = candidates[s_idx];
        const row = j * L_cells;
        if (!has_t || (o1 === 0 && !prim)) {
          turn_fail += 1;
          R_rem = Math.max(1, R_rem - 1);
          continue;
        }
        const c = tactic < 2 ? Pos_A[j] : Pos_T[j];
        const is_boost =
          prim && ((tactic < 2 && S[row + c] === 0) || (tactic >= 2 && A[row + c] === 0)) ? 1 : 0;
        const p_parry = Q_rem / Math.max(1, R_rem);
        R_rem = Math.max(1, R_rem - 1);
        const u_rand = (nextRng(rngState) & 0xffffff) / 0x1000000;
        if (u_rand < p_parry && Q_rem > 0) {
          Q_rem -= 1;
          turn_fail += 1;
        } else {
          turn_succ += 1;
          turn_bst += is_boost;
          if (tactic < 2) {
            const cut_n = !is_boost ? 1 : o2 === 1 ? A[row + c] : Math.min(2, A[row + c]);
            A[row + c] -= cut_n;
            S[row + c] += cut_n;
            if (tactic === 1 && A[row + Pos_A[j]] === 0 && Pos_A[j] + 1 < L_cells) {
              Pos_A[j] += 1;
            }
          } else {
            const rem_n = !is_boost ? 1 : o2 === 1 ? S[row + c] : Math.min(2, S[row + c]);
            S[row + c] -= rem_n;
          }
        }
      }

      let shift = turn_succ > 0 && turn_succ >= turn_fail ? 1 : -1;
      if (o3 === 1 && turn_bst > 0 && turn_succ >= turn_fail) shift = 2;
      else if (o3 === 2) shift = turn_succ - turn_fail;

      let cur_idx = tile_idx;
      if (shift > 0) {
        for (let st = 0; st < shift; st++) {
          if (cur_idx === 5) break;
          const nxt_idx = cur_idx < 5 ? cur_idx + 1 : cur_idx - 1;
          const tmp = track[cur_idx];
          track[cur_idx] = track[nxt_idx];
          track[nxt_idx] = tmp;
          cur_idx = nxt_idx;
        }
      } else if (shift < 0) {
        for (let st = 0; st < -shift; st++) {
          if (cur_idx === 0 || cur_idx === 10) break;
          const nxt_idx =
            cur_idx < 5 ? cur_idx - 1 : cur_idx > 5 ? cur_idx + 1 : t % 2 === 0 ? 4 : 6;
          const tmp = track[cur_idx];
          track[cur_idx] = track[nxt_idx];
          track[nxt_idx] = tmp;
          cur_idx = nxt_idx;
        }
      }

      let rem_t = 0;
      let rem_s = 0;
      for (let i = 0; i < n_players * L_cells; i++) {
        rem_t += A[i];
        rem_s += S[i];
      }
      trees_curve[t] += (100.0 * rem_t) / total_init_trees;
      stumps_curve[t] += (100.0 * rem_s) / total_init_trees;
      terraced_curve[t] += (100.0 * (total_init_trees - rem_t - rem_s)) / total_init_trees;
    }
  }

  return {
    turns: Array.from({ length: T_turns }, (_, i) => i + 1),
    trees_pct: Array.from(trees_curve, (v) => Number((v / n_games).toFixed(1))),
    stumps_pct: Array.from(stumps_curve, (v) => Number((v / n_games).toFixed(1))),
    terraced_pct: Array.from(terraced_curve, (v) => Number((v / n_games).toFixed(1))),
    center_terrassier_pct: Array.from(center_terr_curve, (v) => Number((v / n_games).toFixed(1))),
  };
}
