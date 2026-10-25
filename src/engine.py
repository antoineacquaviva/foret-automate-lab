"""
Cœur de simulation haute performance de l'automate des Défenseurs de la Forêt.
Compatible compilation JIT Numba (@njit(nogil=True, cache=True)) avec repli Python/NumPy transparent.
"""
import numpy as np
np.seterr(over='ignore')

try:
    from numba import njit
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False
    def njit(*args, **kwargs):
        def decorator(func):
            return func
        return decorator


@njit(nogil=True, cache=True)
def _xorshift64star(state: np.uint64) -> np.uint64:
    """Générateur pseudo-aléatoire rapide et 100% déterministe inter-plateformes."""
    x = state
    x ^= x >> np.uint64(12)
    x ^= x << np.uint64(25)
    x ^= x >> np.uint64(27)
    return x * np.uint64(2685821657736338717)


@njit(nogil=True, cache=True)
def simulate_batch_kernel(
    o1: int,
    o2: int,
    o3: int,
    o4: int,
    o5: int,
    p1: int,
    p2: int,
    T_turns: int,
    n_players: int,
    doctrine_id: int,
    effort_rate: float,
    n_games: int,
    seed: int,
    init_cells: np.ndarray,
    L_cells: int,
    init_track: np.ndarray,
) -> np.ndarray:
    """
    Exécute `n_games` simulations Monte-Carlo et retourne un vecteur de statistiques agrégées :
      [0] mean_score (selon O5: % arbres ou % arbres + 0.5*souches)
      [1] std_score
      [2] mean_trees_pct (% d'arbres debout restants)
      [3] mean_stumps_pct (% de souches restantes)
      [4] mean_terraced_pct (% d'emplacements définitivement terrassés)
      [5] mean_m_phys_per_turn (gestes physiques / tour)
      [6] mean_c_cog_per_turn (opérations cognitives / tour)
      [7] mean_center_terrassier_early (part de tuiles Terrassier en 6-7-8 au 1er tiers)
      [8] mean_center_terrassier_late (part de tuiles Terrassier en 6-7-8 au dernier tiers)
      [9] mean_stall_rate (part d'activations patinant à vide)
      [10] mean_parries_used (nombre moyen de parades utilisées par partie)
    """
    rng_state = np.uint64(seed if seed != 0 else 88172645463325252)

    total_trees_per_track = 0
    for c in range(L_cells):
        total_trees_per_track += init_cells[c]
    total_init_trees = n_players * total_trees_per_track

    # Largeur de vague de base K
    k_half_sup = (n_players + 1) // 2
    if p2 == 0:
        k_avg = float(k_half_sup)
    elif p2 == 1:
        k_avg = float(n_players - 1)
    else:
        k_avg = float(k_half_sup) + 0.5

    expected_total_attacks = int(round(T_turns * k_avg))
    target_parry_quota = int(round(effort_rate * expected_total_attacks))

    # Accumulateurs Welford / globaux
    mean_score = 0.0
    m2_score = 0.0
    sum_trees_pct = 0.0
    sum_stumps_pct = 0.0
    sum_terraced_pct = 0.0
    sum_m_phys = 0.0
    sum_c_cog = 0.0
    sum_center_early = 0.0
    sum_center_late = 0.0
    sum_stalls = 0.0
    sum_total_slots = 0.0
    sum_parries = 0.0

    # Tableaux de travail réutilisés à chaque partie (zéro allocation en boucle)
    A = np.zeros((n_players, L_cells), dtype=np.int32)
    S = np.zeros((n_players, L_cells), dtype=np.int32)
    Pos_A = np.zeros(n_players, dtype=np.int32)
    Pos_T = np.zeros(n_players, dtype=np.int32)
    track = np.zeros(11, dtype=np.int32)

    elig_primary = np.zeros(n_players, dtype=np.int32)
    elig_any = np.zeros(n_players, dtype=np.int32)
    sort_key = np.zeros(n_players, dtype=np.int32)
    base_key = np.zeros(n_players, dtype=np.int32)
    order = np.zeros(n_players, dtype=np.int32)

    t_early_limit = max(1, T_turns // 3)
    t_late_start = max(1, (2 * T_turns) // 3)

    for g in range(n_games):
        # Initialisation du plateau
        for j in range(n_players):
            Pos_A[j] = 0
            Pos_T[j] = 0
            for c in range(L_cells):
                A[j, c] = init_cells[c]
                S[j, c] = 0
        for idx in range(11):
            track[idx] = init_track[idx]

        Q_rem = target_parry_quota
        R_rem = expected_total_attacks

        game_m_phys = 0.0
        game_c_cog = 0.0
        game_stalls = 0
        game_slots = 0
        game_parries = 0

        early_terr_count = 0
        early_turns = 0
        late_terr_count = 0
        late_turns = 0

        for t in range(T_turns):
            # Coût cognitif de base : jet de dés + lecture de la tactique
            game_c_cog += 1.0

            # Mesure de l'occupation du centre (cases 6, 7, 8 -> indices 4, 5, 6)
            terr_in_center = 0
            if track[4] >= 2:
                terr_in_center += 1
            if track[5] >= 2:
                terr_in_center += 1
            if track[6] >= 2:
                terr_in_center += 1

            if t < t_early_limit:
                early_terr_count += terr_in_center
                early_turns += 1
            elif t >= t_late_start:
                late_terr_count += terr_in_center
                late_turns += 1

            # Tirage 2D6
            rng_state = _xorshift64star(rng_state)
            d1 = int(rng_state % np.uint64(6)) + 1
            rng_state = _xorshift64star(rng_state)
            d2 = int(rng_state % np.uint64(6)) + 1
            tile_idx = (d1 + d2) - 2
            tactic = track[tile_idx]

            # Largeur de vague K pour ce tour
            if p2 == 0:
                K = k_half_sup
            elif p2 == 1:
                K = n_players - 1
            else:
                if tactic == 0 or tactic == 3:
                    K = min(n_players, k_half_sup + 1)
                else:
                    K = k_half_sup

            # Étape 1 : Avancement d'approche gratuit des machines
            if tactic < 2:
                # Abatteuse
                for j in range(n_players):
                    cur = Pos_A[j]
                    if A[j, cur] == 0:
                        moved = 0
                        for nxt in range(cur + 1, L_cells):
                            if A[j, nxt] > 0:
                                Pos_A[j] = nxt
                                moved = 1
                                break
                        if moved == 1:
                            game_m_phys += 1.0
            else:
                # Terrassier (invariant Pos_T <= Pos_A)
                for j in range(n_players):
                    cur = Pos_T[j]
                    limit_a = Pos_A[j]
                    if tactic == 3:
                        # T2 Ratissage cherche en priorité une case abandonnée (A==0 et S>0)
                        if not (A[j, cur] == 0 and S[j, cur] > 0):
                            moved = 0
                            for nxt in range(cur + 1, limit_a + 1):
                                if A[j, nxt] == 0 and S[j, nxt] > 0:
                                    Pos_T[j] = nxt
                                    moved = 1
                                    break
                            if moved == 0 and S[j, cur] == 0:
                                for nxt in range(cur + 1, limit_a + 1):
                                    if S[j, nxt] > 0:
                                        Pos_T[j] = nxt
                                        moved = 1
                                        break
                            if moved == 1:
                                game_m_phys += 1.0
                    else:
                        # T1 Sillage avance vers l'Abatteuse si sa case n'a pas de souche
                        if S[j, cur] == 0 and cur < limit_a:
                            moved = 0
                            for nxt in range(cur + 1, limit_a + 1):
                                if S[j, nxt] > 0:
                                    Pos_T[j] = nxt
                                    moved = 1
                                    break
                            if moved == 1:
                                game_m_phys += 1.0

            # Étape 2 : Qualification et tri des pistes
            n_primary = 0
            for j in range(n_players):
                rot_prio = (j + t) % n_players
                if tactic == 0:  # C1 Défrichage : case intacte (S==0, A>0), moins avancée
                    c = Pos_A[j]
                    has_t = 1 if A[j, c] > 0 else 0
                    prim = 1 if (has_t == 1 and S[j, c] == 0) else 0
                    sc1 = L_cells - c
                    sc2 = A[j, c]
                elif tactic == 1:  # C2 Percée : case entamée (S>=1, A>=1), moins d'arbres, plus avancée
                    c = Pos_A[j]
                    has_t = 1 if A[j, c] > 0 else 0
                    prim = 1 if (has_t == 1 and S[j, c] >= 1) else 0
                    sc1 = 10 - A[j, c]
                    sc2 = c
                elif tactic == 2:  # T1 Sillage : écart <= 1 et S>=1, écart minimal, plus avancée
                    c = Pos_T[j]
                    has_t = 1 if S[j, c] > 0 else 0
                    gap = Pos_A[j] - c
                    prim = 1 if (has_t == 1 and gap <= 1) else 0
                    sc1 = L_cells - gap
                    sc2 = c
                else:  # T2 Ratissage : case 100% souches (A==0 et S>=1), plus de souches, moins avancée
                    c = Pos_T[j]
                    has_t = 1 if S[j, c] > 0 else 0
                    prim = 1 if (has_t == 1 and A[j, c] == 0) else 0
                    sc1 = S[j, c]
                    sc2 = L_cells - c

                elig_any[j] = has_t
                elig_primary[j] = prim
                if prim == 1:
                    n_primary += 1
                # Clé sans jeton rotatif (pour détecter les égalités cognitives)
                b_k = has_t * 100000 + prim * 10000 + sc1 * 100 + sc2
                base_key[j] = b_k
                sort_key[j] = b_k * 10 + (n_players - rot_prio)
                order[j] = j

            # Tri par insertion décroissant sur sort_key
            for i in range(1, n_players):
                key_val = sort_key[i]
                ord_val = order[i]
                k_idx = i - 1
                while k_idx >= 0 and sort_key[k_idx] < key_val:
                    sort_key[k_idx + 1] = sort_key[k_idx]
                    order[k_idx + 1] = order[k_idx]
                    k_idx -= 1
                sort_key[k_idx + 1] = key_val
                order[k_idx + 1] = ord_val

            # Pénalité cognitive d'égalité à la frontière de sélection K
            if K < n_players:
                j_in = order[K - 1]
                j_out = order[K]
                if elig_any[j_in] == 1 and base_key[j_in] == base_key[j_out]:
                    game_c_cog += 1.0

            # Pénalité cognitive de double passe si Fallback Souple activé
            if o1 == 1 and n_primary < K:
                used_fallback = 0
                for s_idx in range(K):
                    j_sel = order[s_idx]
                    if elig_any[j_sel] == 1 and elig_primary[j_sel] == 0:
                        used_fallback = 1
                        break
                if used_fallback == 1:
                    game_c_cog += 2.0

            # Étape 3 : Résolution sur les K pistes sélectionnées
            turn_successes = 0
            turn_failures = 0
            turn_boosts = 0

            for s_idx in range(K):
                game_slots += 1
                j = order[s_idx]
                is_valid = elig_any[j]
                is_prim = elig_primary[j]

                if is_valid == 0 or (o1 == 0 and is_prim == 0):
                    # Patinage à vide
                    game_stalls += 1
                    turn_failures += 1
                    if R_rem > 1:
                        R_rem -= 1
                    continue

                c = Pos_A[j] if tactic < 2 else Pos_T[j]

                # Condition de Boost : uniquement si éligibilité primaire ET case monochrome
                is_boost = 0
                if is_prim == 1:
                    if tactic < 2 and S[j, c] == 0 and A[j, c] > 0:
                        is_boost = 1
                    elif tactic >= 2 and A[j, c] == 0 and S[j, c] > 0:
                        is_boost = 1

                # Évaluation de la priorité de parade selon la Doctrine (D0..D5)
                is_prio = 0
                if doctrine_id == 1:  # Anti-Coupe
                    is_prio = 1 if tactic < 2 else 0
                elif doctrine_id == 2:  # Anti-Terrassement
                    is_prio = 1 if tactic >= 2 else 0
                elif doctrine_id == 3:  # Chasseur de Boost & Sanctuaire
                    is_prio = 1 if (is_boost == 1 or c >= L_cells - 2) else 0
                elif doctrine_id == 4:  # Lecteur Piste 7 (cases 6, 7, 8 -> idx 4, 5, 6)
                    is_prio = 1 if (4 <= tile_idx <= 6) else 0
                elif doctrine_id == 5:  # Contre-Temps (inverse)
                    is_prio = 1 if (is_boost == 0 and (tile_idx < 4 or tile_idx > 6)) else 0

                # Calcul de la probabilité de parade avec régulateur de quota iso-effort Q_rem / R_rem
                if R_rem < 1:
                    R_rem = 1
                p_base = float(Q_rem) / float(R_rem)
                if Q_rem <= 0:
                    p_parry = 0.0
                elif Q_rem >= R_rem:
                    p_parry = 1.0
                elif doctrine_id == 0:
                    p_parry = p_base
                else:
                    # Régulation affine centrée autour de p_base pour garantir la dépense intégrale du quota Q
                    delta_p = 0.42 * min(p_base, 1.0 - p_base)
                    if is_prio == 1:
                        p_parry = min(0.98, p_base + 1.25 * delta_p)
                    else:
                        p_parry = max(0.02, p_base - 0.85 * delta_p)

                if R_rem > 1:
                    R_rem -= 1

                rng_state = _xorshift64star(rng_state)
                u_rand = float(rng_state & np.uint64(0xFFFFFF)) / float(0x1000000)

                if u_rand < p_parry and Q_rem > 0:
                    # Parade réussie par les Défenseurs
                    Q_rem -= 1
                    game_parries += 1
                    turn_failures += 1
                else:
                    # Action réussie par la Machine
                    turn_successes += 1
                    if is_boost == 1:
                        turn_boosts += 1

                    if tactic < 2:
                        # Action Abatteuse
                        if is_boost == 0:
                            A[j, c] -= 1
                            S[j, c] += 1
                            game_m_phys += 1.0
                        else:
                            if o2 == 0:  # Sur_Place_x2
                                cut_n = 2 if A[j, c] >= 2 else A[j, c]
                                A[j, c] -= cut_n
                                S[j, c] += cut_n
                                game_m_phys += float(cut_n)
                            elif o2 == 1:  # Rasage_Complet
                                cut_n = A[j, c]
                                A[j, c] = 0
                                S[j, c] += cut_n
                                game_m_phys += float(cut_n)
                            else:  # Debordement
                                if A[j, c] >= 2:
                                    A[j, c] -= 2
                                    S[j, c] += 2
                                    game_m_phys += 2.0
                                else:
                                    A[j, c] -= 1
                                    S[j, c] += 1
                                    game_m_phys += 1.0
                                    if c + 1 < L_cells and A[j, c + 1] > 0:
                                        Pos_A[j] = c + 1
                                        game_m_phys += 1.0
                                        game_c_cog += 2.0  # Débordement inter-cases + 2e test
                                        A[j, c + 1] -= 1
                                        S[j, c + 1] += 1
                                        game_m_phys += 1.0

                        # Effet spécial C2 Percée : avance immédiatement si la case tombe à 0 arbre
                        cur_a = Pos_A[j]
                        if tactic == 1 and A[j, cur_a] == 0 and cur_a + 1 < L_cells:
                            Pos_A[j] = cur_a + 1
                            game_m_phys += 1.0
                    else:
                        # Action Terrassier
                        if is_boost == 0:
                            S[j, c] -= 1
                            game_m_phys += 1.0
                        else:
                            if o2 == 0:  # Sur_Place_x2
                                rem_n = 2 if S[j, c] >= 2 else S[j, c]
                                S[j, c] -= rem_n
                                game_m_phys += float(rem_n)
                            elif o2 == 1:  # Rasage_Complet
                                rem_n = S[j, c]
                                S[j, c] = 0
                                game_m_phys += float(rem_n)
                            else:  # Debordement
                                if S[j, c] >= 2:
                                    S[j, c] -= 2
                                    game_m_phys += 2.0
                                else:
                                    S[j, c] -= 1
                                    game_m_phys += 1.0
                                    if c + 1 <= Pos_A[j] and S[j, c + 1] > 0:
                                        Pos_T[j] = c + 1
                                        game_m_phys += 1.0
                                        game_c_cog += 2.0
                                        S[j, c + 1] -= 1
                                        game_m_phys += 1.0

            # Étape 4 : Apprentissage statistique en fin de tour sur la piste 2..12 (indices 0..10)
            shift = 0
            if o3 == 0:  # Standard_1
                if turn_successes > 0 and turn_successes >= turn_failures:
                    shift = 1
                else:
                    shift = -1
            elif o3 == 1:  # Boost_Turbo_2
                game_c_cog += 0.5
                if turn_boosts > 0 and turn_successes >= turn_failures:
                    shift = 2
                elif turn_successes > 0 and turn_successes >= turn_failures:
                    shift = 1
                else:
                    shift = -1
            else:  # Cumulatif_K
                game_c_cog += 1.0
                shift = turn_successes - turn_failures

            cur_idx = tile_idx
            if shift > 0:
                # Glissement vers le centre (index 5 = Somme 7)
                steps = shift
                while steps > 0 and cur_idx != 5:
                    nxt_idx = cur_idx + 1 if cur_idx < 5 else cur_idx - 1
                    tmp_tile = track[cur_idx]
                    track[cur_idx] = track[nxt_idx]
                    track[nxt_idx] = tmp_tile
                    cur_idx = nxt_idx
                    game_m_phys += 1.0
                    steps -= 1
            elif shift < 0:
                # Recul vers les extrémités (index 0 ou index 10)
                steps = -shift
                while steps > 0 and cur_idx != 0 and cur_idx != 10:
                    if cur_idx < 5:
                        nxt_idx = cur_idx - 1
                    elif cur_idx > 5:
                        nxt_idx = cur_idx + 1
                    else:
                        nxt_idx = 4 if (t % 2 == 0) else 6
                    tmp_tile = track[cur_idx]
                    track[cur_idx] = track[nxt_idx]
                    track[nxt_idx] = tmp_tile
                    cur_idx = nxt_idx
                    game_m_phys += 1.0
                    steps -= 1

        # Bilan de fin de partie
        rem_trees = 0
        rem_stumps = 0
        for j in range(n_players):
            for c in range(L_cells):
                rem_trees += A[j, c]
                rem_stumps += S[j, c]
        terraced = total_init_trees - rem_trees - rem_stumps

        trees_pct = (100.0 * float(rem_trees)) / float(total_init_trees)
        stumps_pct = (100.0 * float(rem_stumps)) / float(total_init_trees)
        terraced_pct = (100.0 * float(terraced)) / float(total_init_trees)

        if o5 == 0:
            score = trees_pct
        else:
            score = trees_pct + 0.5 * stumps_pct

        # Mise à jour Welford pour moyenne et variance du score
        n_obs = float(g + 1)
        delta = score - mean_score
        mean_score += delta / n_obs
        delta2 = score - mean_score
        m2_score += delta * delta2

        sum_trees_pct += trees_pct
        sum_stumps_pct += stumps_pct
        sum_terraced_pct += terraced_pct
        sum_m_phys += game_m_phys / float(T_turns)
        sum_c_cog += game_c_cog / float(T_turns)
        sum_center_early += float(early_terr_count) / float(3 * max(1, early_turns))
        sum_center_late += float(late_terr_count) / float(3 * max(1, late_turns))
        sum_stalls += float(game_stalls)
        sum_total_slots += float(max(1, game_slots))
        sum_parries += float(game_parries)

    std_score = np.sqrt(m2_score / float(max(1, n_games - 1))) if n_games > 1 else 0.0
    inv_n = 1.0 / float(n_games)

    out = np.zeros(11, dtype=np.float64)
    out[0] = mean_score
    out[1] = std_score
    out[2] = sum_trees_pct * inv_n
    out[3] = sum_stumps_pct * inv_n
    out[4] = sum_terraced_pct * inv_n
    out[5] = sum_m_phys * inv_n
    out[6] = sum_c_cog * inv_n
    out[7] = 100.0 * (sum_center_early * inv_n)
    out[8] = 100.0 * (sum_center_late * inv_n)
    out[9] = 100.0 * (sum_stalls / max(1.0, sum_total_slots))
    out[10] = sum_parries * inv_n
    return out


def simulate_turn_by_turn_profile(
    variant_spec,
    n_players: int = 4,
    effort_rate: float = 0.50,
    n_games: int = 500,
    seed: int = 42,
):
    """
    Simule l'évolution tour par tour d'une variante donnée (pour les courbes temporelles du rapport).
    Retourne un dictionnaire contenant les séries temporelles moyennes du Tour 1 au Tour T.
    """
    from .variants import TOPOLOGIES, TOPOLOGY_LENGTHS, INITIAL_TRACKS

    o1, o2, o3, o4, o5, p1, p2, T_turns = variant_spec.to_int_tuple()
    init_cells = TOPOLOGIES[variant_spec.P1_topologie]
    L_cells = TOPOLOGY_LENGTHS[variant_spec.P1_topologie]
    init_track = INITIAL_TRACKS[variant_spec.O4_init_piste]

    total_init_trees = n_players * int(np.sum(init_cells[:L_cells]))
    k_half_sup = (n_players + 1) // 2
    k_avg = float(k_half_sup) if p2 == 0 else (float(n_players - 1) if p2 == 1 else float(k_half_sup) + 0.5)
    expected_total_attacks = int(round(T_turns * k_avg))
    target_parry_quota = int(round(effort_rate * expected_total_attacks))

    trees_curve = np.zeros(T_turns, dtype=np.float64)
    stumps_curve = np.zeros(T_turns, dtype=np.float64)
    terraced_curve = np.zeros(T_turns, dtype=np.float64)
    center_terr_curve = np.zeros(T_turns, dtype=np.float64)

    rng_state = np.uint64(seed)

    for _ in range(n_games):
        A = np.zeros((n_players, L_cells), dtype=np.int32)
        S = np.zeros((n_players, L_cells), dtype=np.int32)
        Pos_A = np.zeros(n_players, dtype=np.int32)
        Pos_T = np.zeros(n_players, dtype=np.int32)
        for j in range(n_players):
            for c in range(L_cells):
                A[j, c] = init_cells[c]
        track = init_track.copy()
        Q_rem = target_parry_quota
        R_rem = expected_total_attacks

        for t in range(T_turns):
            terr_in_center = int(track[4] >= 2) + int(track[5] >= 2) + int(track[6] >= 2)
            center_terr_curve[t] += (100.0 * terr_in_center) / 3.0

            rng_state = _xorshift64star(rng_state)
            d1 = int(rng_state % np.uint64(6)) + 1
            rng_state = _xorshift64star(rng_state)
            d2 = int(rng_state % np.uint64(6)) + 1
            tile_idx = (d1 + d2) - 2
            tactic = int(track[tile_idx])

            if p2 == 0:
                K = k_half_sup
            elif p2 == 1:
                K = n_players - 1
            else:
                K = min(n_players, k_half_sup + 1) if (tactic == 0 or tactic == 3) else k_half_sup

            # Approche
            if tactic < 2:
                for j in range(n_players):
                    if A[j, Pos_A[j]] == 0:
                        for nxt in range(Pos_A[j] + 1, L_cells):
                            if A[j, nxt] > 0:
                                Pos_A[j] = nxt
                                break
            else:
                for j in range(n_players):
                    cur = Pos_T[j]
                    lim = Pos_A[j]
                    if tactic == 3 and not (A[j, cur] == 0 and S[j, cur] > 0):
                        for nxt in range(cur + 1, lim + 1):
                            if A[j, nxt] == 0 and S[j, nxt] > 0:
                                Pos_T[j] = nxt
                                break
                    elif S[j, cur] == 0 and cur < lim:
                        for nxt in range(cur + 1, lim + 1):
                            if S[j, nxt] > 0:
                                Pos_T[j] = nxt
                                break

            # Tri rapide
            candidates = []
            for j in range(n_players):
                rot = (j + t) % n_players
                if tactic == 0:
                    c = Pos_A[j]
                    has_t = int(A[j, c] > 0)
                    prim = int(has_t and S[j, c] == 0)
                    sc1, sc2 = L_cells - c, A[j, c]
                elif tactic == 1:
                    c = Pos_A[j]
                    has_t = int(A[j, c] > 0)
                    prim = int(has_t and S[j, c] >= 1)
                    sc1, sc2 = 10 - A[j, c], c
                elif tactic == 2:
                    c = Pos_T[j]
                    has_t = int(S[j, c] > 0)
                    prim = int(has_t and (Pos_A[j] - c) <= 1)
                    sc1, sc2 = L_cells - (Pos_A[j] - c), c
                else:
                    c = Pos_T[j]
                    has_t = int(S[j, c] > 0)
                    prim = int(has_t and A[j, c] == 0)
                    sc1, sc2 = S[j, c], L_cells - c
                candidates.append((has_t, prim, sc1, sc2, -rot, j))
            candidates.sort(reverse=True)

            turn_succ, turn_fail, turn_bst = 0, 0, 0
            for s_idx in range(K):
                has_t, prim, _, _, _, j = candidates[s_idx]
                if not has_t or (o1 == 0 and not prim):
                    turn_fail += 1
                    R_rem = max(1, R_rem - 1)
                    continue
                c = Pos_A[j] if tactic < 2 else Pos_T[j]
                is_boost = int(prim and ((tactic < 2 and S[j, c] == 0) or (tactic >= 2 and A[j, c] == 0)))
                p_parry = float(Q_rem) / float(max(1, R_rem))
                R_rem = max(1, R_rem - 1)
                rng_state = _xorshift64star(rng_state)
                u_rand = float(rng_state & np.uint64(0xFFFFFF)) / float(0x1000000)
                if u_rand < p_parry and Q_rem > 0:
                    Q_rem -= 1
                    turn_fail += 1
                else:
                    turn_succ += 1
                    turn_bst += is_boost
                    if tactic < 2:
                        cut_n = 1 if not is_boost else (A[j, c] if o2 == 1 else min(2, A[j, c]))
                        A[j, c] -= cut_n
                        S[j, c] += cut_n
                        if tactic == 1 and A[j, Pos_A[j]] == 0 and Pos_A[j] + 1 < L_cells:
                            Pos_A[j] += 1
                    else:
                        rem_n = 1 if not is_boost else (S[j, c] if o2 == 1 else min(2, S[j, c]))
                        S[j, c] -= rem_n

            shift = (1 if (turn_succ > 0 and turn_succ >= turn_fail) else -1)
            if o3 == 1 and turn_bst > 0 and turn_succ >= turn_fail:
                shift = 2
            elif o3 == 2:
                shift = turn_succ - turn_fail

            cur_idx = tile_idx
            if shift > 0:
                for _ in range(shift):
                    if cur_idx == 5:
                        break
                    nxt_idx = cur_idx + 1 if cur_idx < 5 else cur_idx - 1
                    track[cur_idx], track[nxt_idx] = track[nxt_idx], track[cur_idx]
                    cur_idx = nxt_idx
            elif shift < 0:
                for _ in range(-shift):
                    if cur_idx == 0 or cur_idx == 10:
                        break
                    nxt_idx = cur_idx - 1 if cur_idx < 5 else (cur_idx + 1 if cur_idx > 5 else (4 if t % 2 == 0 else 6))
                    track[cur_idx], track[nxt_idx] = track[nxt_idx], track[cur_idx]
                    cur_idx = nxt_idx

            rem_t = int(np.sum(A))
            rem_s = int(np.sum(S))
            trees_curve[t] += (100.0 * rem_t) / total_init_trees
            stumps_curve[t] += (100.0 * rem_s) / total_init_trees
            terraced_curve[t] += (100.0 * (total_init_trees - rem_t - rem_s)) / total_init_trees

    return {
        "turns": list(range(1, T_turns + 1)),
        "trees_pct": (trees_curve / n_games).tolist(),
        "stumps_pct": (stumps_curve / n_games).tolist(),
        "terraced_pct": (terraced_curve / n_games).tolist(),
        "center_terrassier_pct": (center_terr_curve / n_games).tolist(),
    }
