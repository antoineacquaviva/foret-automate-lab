/**
 * Bloc 1 & Bloc 3 — Machine Virtuelle Niveau 1 (Exécution du Génome de 447 int32)
 * et Banc des 7 Bots Joueurs Autonomes (B0 à B4) avec Nombres Aléatoires Communs (CRN) et Iso-Effort.
 */

import {
  OFFSET_TACTICS,
  OFFSET_LEARNING,
  HDR_L_CELLS,
  HDR_T_TURNS,
  HDR_DICE_MODE,
  HDR_END_OF_TRACK_MODE,
  HDR_BREAK_RULE,
  HDR_BREAK_PENALTY,
  HDR_MOMENTUM_RULE,
  HDR_REGEN_MODE,
  HDR_REGEN_MAX,
  ARENA_CELL_CAP_START,
  ARENA_CELL_WEIGHTS_START,
  ARENA_OBSTACLE_MASK_START,
  ARENA_BIOME_MODE,
  ASYMMETRIC_BIOMES_12A,
} from './genome';

export interface BotProfile {
  id: number;
  code: string;
  name: string;
  level: number;
  description: string;
}

export const ALL_BOTS_V2: BotProfile[] = [
  {
    id: 0,
    code: 'B0_Passif',
    name: 'Étalon Passif (Q = 0)',
    level: 0,
    description: 'Aucune parade (Q=0). Mesure la férocité brute et le taux de patinage intrinsèque.',
  },
  {
    id: 1,
    code: 'B1_Aveugle',
    name: 'Débutant Aléatoire Uniforme',
    level: 1,
    description: 'Applique la probabilité de base Q_rem / R_rem uniformément sur toute porte de parade.',
  },
  {
    id: 2,
    code: 'B2a_Mono_Anti_Coupe',
    name: 'Sonde Martingale Anti-Coupe',
    level: 2,
    description: 'Concentre 100% de sa priorité de parade sur les verbes CUT et ERODE.',
  },
  {
    id: 3,
    code: 'B2b_Mono_Anti_Bull',
    name: 'Sonde Martingale Anti-Bulldozer',
    level: 2,
    description: 'Concentre 100% de sa priorité de parade sur le verbe BULLDOZE.',
  },
  {
    id: 4,
    code: 'B2c_Mono_Anti_Avance',
    name: 'Sonde Martingale Anti-Avancée',
    level: 2,
    description: 'Concentre 100% de sa priorité de parade sur le verbe ADVANCE.',
  },
  {
    id: 5,
    code: 'B3_Tacticien_Couloir',
    name: 'Tacticien Local (Fonction d’Utilité ΔV)',
    level: 3,
    description:
      'Calcule le gain marginal ΔV = ΔV_ArbreDirect + ΔV_SouchePiste3 + ΔV_Enlisement + ΔV_Casse.',
  },
  {
    id: 6,
    code: 'B4_Stratege_Complet',
    name: 'Stratège Complet (ΔV × Pression Piste 2D6)',
    level: 4,
    description:
      'Pondère ΔV par W_piste (×1.65 au cœur 6-7-8 pour refouler la tuile, ×0.45 sur 2-3-11-12).',
  },
];

export interface BotBatchStats {
  meanScorePct: number;
  stdScorePct: number;
  meanTreesRawPct: number;
  meanTreesRegenPct: number;
  meanStumpsRawPct: number;
  meanTerracedPct: number;
  meanPhysPerTurn: number;
  meanCogPerTurn: number;
  meanStallRatePct: number;
  meanParriesUsed: number;
  meanMovesAndBounces: number;
  // Distribution des verbes effectivement exécutés [CUT/ERODE, BULLDOZE, ADVANCE/OTHER] pour D_JS
  actionDist: [number, number, number];
  // Distribution des tactiques activées en 6-7-8 au Tiers 1 et au Tiers 3 pour TVD
  centerTacticDistT1: [number, number, number, number];
  centerTacticDistT3: [number, number, number, number];
  // Indique si des dégâts ont lieu dans chacun des 3 tiers
  damageByTier: [number, number, number];
}

// Générateur xorshift64* rapide 100% déterministe sur Uint32Array(2)
function nextRng(state: Uint32Array): number {
  let lo = state[0] >>> 0;
  let hi = state[1] >>> 0;

  const t1_lo = ((lo >>> 12) | (hi << 20)) >>> 0;
  const t1_hi = (hi >>> 12) >>> 0;
  lo = (lo ^ t1_lo) >>> 0;
  hi = (hi ^ t1_hi) >>> 0;

  const t2_lo = (lo << 25) >>> 0;
  const t2_hi = ((hi << 25) | (lo >>> 7)) >>> 0;
  lo = (lo ^ t2_lo) >>> 0;
  hi = (hi ^ t2_hi) >>> 0;

  const t3_lo = ((lo >>> 27) | (hi << 5)) >>> 0;
  const t3_hi = (hi >>> 27) >>> 0;
  lo = (lo ^ t3_lo) >>> 0;
  hi = (hi ^ t3_hi) >>> 0;

  state[0] = lo;
  state[1] = hi;
  return Math.imul(lo ^ hi, 0x9e3779b9) >>> 0;
}

function evalComparison(val: number, op: number, target: number): boolean {
  switch (op) {
    case 0:
      return val === target;
    case 1:
      return val !== target;
    case 2:
      return val < target;
    case 3:
      return val <= target;
    case 4:
      return val > target;
    case 5:
      return val >= target;
    default:
      return false;
  }
}

/**
 * Évalue la valeur d'un des 18 capteurs du Niveau 1 (Section 2.3)
 */
function readSensorValue(
  sensorId: number,
  j: number,
  m: number,
  L: number,
  A: Int32Array,
  S: Int32Array,
  Z: Int32Array,
  Pos: Int32Array,
  Dir: Int32Array,
  Role: Int32Array,
  Status: Int32Array,
  Obstacles: Int32Array,
  wasIntactStart: number,
  prevSlotsSucceeded: number,
  movedThisTurn: number,
  parriedThisTurn: number,
  isDiceDouble: number,
  diceSumInCenter: number
): number {
  const c = Pos[j * 2 + m];
  const cellIdx = j * L + c;
  const trees = A[cellIdx];
  const stumps = S[cellIdx];
  const terraced = Z[cellIdx];
  const role = Role[j * 2 + m];

  switch (sensorId) {
    case 0: // ALWAYS
      return 1;
    case 1: // TREES_CURR
      return trees;
    case 2: // STUMPS_CURR
      return stumps;
    case 3: // TERRACED_CURR
      return terraced;
    case 4: // TARGETS_CURR
      return role === 0 ? trees : stumps;
    case 5: // IS_MONOCHROME_GREEN
      return trees > 0 && stumps === 0 && terraced === 0 ? 1 : 0;
    case 6: // IS_MONOCHROME_BROWN
      return trees === 0 && stumps > 0 ? 1 : 0;
    case 7: // WAS_INTACT_TURN_START
      return wasIntactStart;
    case 8: // POS_MACHINE
      return c;
    case 9: // IS_AT_END_OF_TRACK
      return (Dir[j * 2 + m] > 0 && c === L - 1) || (Dir[j * 2 + m] < 0 && c === 0) ? 1 : 0;
    case 10: // TANDEM_GAP
      return Pos[j * 2 + 0] - Pos[j * 2 + 1];
    case 11: {
      // IS_BLOCKED_BY_OBSTACLE
      const obs = Obstacles[c];
      if (obs === 1) return 1;
      if (obs === 2 && m === 0 && Pos[j * 2 + 1] < c) return 1;
      return 0;
    }
    case 12: // MACHINE_STATUS
      return Status[j * 2 + m];
    case 13: // PREV_SLOTS_SUCCEEDED
      return prevSlotsSucceeded;
    case 14: // MOVED_THIS_TURN
      return movedThisTurn;
    case 15: // PARRIED_THIS_TURN
      return parriedThisTurn;
    case 16: // IS_DICE_DOUBLE
      return isDiceDouble;
    case 17: // DICE_SUM_IN_CENTER
      return diceSumInCenter;
    default:
      return 0;
  }
}

/**
 * Calcule la fonction d'utilité marginale ΔV(action) pour B3_Tacticien_Couloir et B4_Stratege_Complet (Section 4.1)
 */
function computeBotMarginalUtility(
  verb: number,
  qty: number,
  cTarget: number,
  j: number,
  m: number,
  L: number,
  A: Int32Array,
  S: Int32Array,
  Z: Int32Array,
  Pos: Int32Array,
  Status: Int32Array,
  Obstacles: Int32Array,
  Weights: Int32Array,
  parryMode: number,
  regenMode: number,
  regenMax: number,
  breakRule: number,
  parriedThisTurn: number,
  isDiceDouble: number
): number {
  const cellIdx = j * L + cTarget;
  const trees = A[cellIdx];
  const stumps = S[cellIdx];
  const terraced = Z[cellIdx];
  const wC = Weights[cTarget] || 1;
  const posB = Pos[j * 2 + 1];
  const posA = Pos[j * 2 + 0];

  let dV_ArbreDirect = 0.0;
  let dV_SouchePiste3 = 0.0;
  let dV_Enlisement = 0.0;
  let dV_Casse = 0.0;

  if (verb === 1 || verb === 3) {
    // CUT ou ERODE
    if (verb === 3) {
      // ERODE détruit directement l'arbre sans souche redressable
      dV_ArbreDirect = wC * Math.min(trees, qty);
    } else {
      // CUT : vérifie si la coupe excède le quota redressable Piste 3
      const bullAlreadyHere = posB >= cTarget;
      if (regenMode === 0 || bullAlreadyHere) {
        dV_ArbreDirect = wC * Math.min(trees, qty);
      } else if (regenMode === 1) {
        // 1 souche par case est redressée : le 1er arbre coupé (si S==0) est rattrapé en fin de partie, mais dès S>=1 ou qty>=2, perte nette !
        const freeBuffer = stumps === 0 ? 1 : 0;
        const netLost = Math.max(0, Math.min(trees, qty) - freeBuffer);
        dV_ArbreDirect = wC * (netLost + 0.35);
      } else if (regenMode === 2) {
        // INTACT_SOIL_ONLY : si Z==0 et S==0, 1er arbre rattrapable, sinon perte nette
        const freeBuffer = terraced === 0 && stumps === 0 ? 1 : 0;
        const netLost = Math.max(0, Math.min(trees, qty) - freeBuffer);
        dV_ArbreDirect = wC * (netLost + 0.4);
      } else {
        const freeBuffer = Math.max(0, regenMax - stumps);
        const netLost = Math.max(0, Math.min(trees, qty) - freeBuffer);
        dV_ArbreDirect = wC * (netLost + 0.35);
      }
    }
  } else if (verb === 2) {
    // BULLDOZE : critique si détruit la souche porteuse du redressement Piste 3
    if (regenMode === 1) {
      // La dernière souche de la case porte l'arbre redressé !
      if (stumps <= qty && stumps > 0) {
        dV_SouchePiste3 = 1.0 * wC;
      } else {
        // Souche surnuméraire non critique !
        dV_SouchePiste3 = 0.05;
      }
    } else if (regenMode === 2) {
      // INTACT_SOIL_ONLY : le tout premier terrassement (Z==0) détruit définitivement le droit au redressement de la case !
      if (terraced === 0 && stumps > 0) {
        dV_SouchePiste3 = 1.15 * wC;
      } else {
        dV_SouchePiste3 = 0.05;
      }
    } else if (regenMode === 3) {
      if (stumps <= regenMax && stumps > 0) {
        dV_SouchePiste3 = 1.0 * wC;
      } else {
        dV_SouchePiste3 = 0.1;
      }
    } else {
      dV_SouchePiste3 = 0.25 * wC;
    }
  } else if (verb === 4) {
    // ADVANCE : valeur d'enlisement si la case actuelle est vide de cibles
    const curTargets = m === 0 ? trees : stumps;
    if (curTargets === 0) {
      if (parryMode === 2) {
        // CANCEL_REMAINING_TACTIC : bloquer l'avancée fait perdre le Slot 2 ET condamne la machine à patiner sur sa case vide
        dV_Enlisement += 1.45;
      } else {
        dV_Enlisement += 0.85;
      }
    }
    // Si bloquer l'Abatteuse retient simultanément le Bulldozer derrière elle (Pos_A == Pos_B) ou devant un Pont
    if (m === 0 && (posA === posB || Obstacles[cTarget] === 2)) {
      dV_Enlisement += 0.9;
    }
  }

  // Bonus de Casse ou bris d'élan (Status == +1)
  if (Status[j * 2 + m] === 1) {
    dV_Casse += 0.75;
  }
  if (
    (breakRule === 1 && parriedThisTurn === 1) ||
    (breakRule === 2 && isDiceDouble === 1) ||
    (breakRule === 3 && (m === 0 ? trees === 0 : stumps === 0))
  ) {
    dV_Casse += 0.95;
  }

  return dV_ArbreDirect + dV_SouchePiste3 + dV_Enlisement + dV_Casse;
}

/**
 * Exécute un lot de nGames parties sur la Machine Virtuelle de Niveau 1 pour un Bot donné.
 */
export function runVmBatchSimulation(
  genome: Int32Array,
  nPlayers: number,
  botId: number,
  effortRate: number,
  nGames: number,
  seed: number
): BotBatchStats {
  const rngState = new Uint32Array(2);
  rngState[0] = (seed !== 0 ? seed : 0x89abcdef) >>> 0;
  rngState[1] = ((seed !== 0 ? seed : 0x01234567) ^ 0x9e3779b9) >>> 0;

  const L = Math.max(1, Math.min(8, genome[HDR_L_CELLS]));
  const T = Math.max(1, genome[HDR_T_TURNS]);
  const diceMode = genome[HDR_DICE_MODE];
  const eotMode = genome[HDR_END_OF_TRACK_MODE];
  const breakRule = genome[HDR_BREAK_RULE];
  const breakPenalty = genome[HDR_BREAK_PENALTY];
  const momentumRule = genome[HDR_MOMENTUM_RULE];
  const regenMode = genome[HDR_REGEN_MODE];
  const regenMax = Math.max(1, genome[HDR_REGEN_MAX]);
  const biomeMode = genome[ARENA_BIOME_MODE];

  const Weights = new Int32Array(L);
  const Obstacles = new Int32Array(L);
  for (let c = 0; c < L; c++) {
    Weights[c] = Math.max(1, genome[ARENA_CELL_WEIGHTS_START + c]);
    Obstacles[c] = genome[ARENA_OBSTACLE_MASK_START + c];
  }

  // Tableaux de travail pré-alloués hors de la boucle des parties
  const InitCap = new Int32Array(nPlayers * L);
  let maxWeightedScorePerTrack = 0;
  let totalInitTrees = 0;

  for (let j = 0; j < nPlayers; j++) {
    const profile =
      biomeMode === 1
        ? ASYMMETRIC_BIOMES_12A[j % ASYMMETRIC_BIOMES_12A.length]
        : null;
    for (let c = 0; c < L; c++) {
      const cap = profile ? profile[c] : genome[ARENA_CELL_CAP_START + c];
      InitCap[j * L + c] = cap;
      totalInitTrees += cap;
      if (j === 0) {
        maxWeightedScorePerTrack += cap * Weights[c];
      }
    }
  }
  const totalMaxWeightedScore = Math.max(1, nPlayers * maxWeightedScorePerTrack);

  // Estimation du nombre d'ouvertures de portes d'interception par piste sur la partie (~1.8 portes/tour)
  const expectedGatesPerTrack = Math.max(1, Math.round(T * 1.75));
  const targetParryQuotaPerTrack =
    botId === 0 ? 0 : Math.round(effortRate * expectedGatesPerTrack);

  const A = new Int32Array(nPlayers * L);
  const S = new Int32Array(nPlayers * L);
  const Z = new Int32Array(nPlayers * L);
  const BullVisited = new Int32Array(nPlayers * L);
  const RiverProgress = new Int32Array(nPlayers * 2);

  const Pos = new Int32Array(nPlayers * 2);
  const Dir = new Int32Array(nPlayers * 2);
  const Role = new Int32Array(nPlayers * 2);
  const Status = new Int32Array(nPlayers * 2);

  const Q_rem = new Int32Array(nPlayers);
  const R_rem = new Int32Array(nPlayers);

  const track = new Int32Array(11);
  const verso = new Int32Array(11);

  const evalTriggerMode = genome[OFFSET_LEARNING + 22];
  const geomMoveMode = genome[OFFSET_LEARNING + 27];

  // Accumulateurs Welford & globaux
  let meanScore = 0.0;
  let m2Score = 0.0;
  let sumTreesRawPct = 0.0;
  let sumTreesRegenPct = 0.0;
  let sumStumpsRawPct = 0.0;
  let sumTerracedPct = 0.0;
  let sumPhys = 0.0;
  let sumCog = 0.0;
  let sumStalls = 0;
  let sumTotalSlots = 0;
  let sumParries = 0;
  let sumMovesAndBounces = 0;

  const actionCounts = [0, 0, 0]; // [CUT/ERODE, BULLDOZE, ADVANCE/OTHER]
  const centerT1 = [0, 0, 0, 0];
  const centerT3 = [0, 0, 0, 0];
  const damageByTier = [0, 0, 0];

  const t1Limit = Math.max(1, Math.floor(T / 3));
  const t3Start = Math.max(1, Math.floor((2 * T) / 3));

  for (let g = 0; g < nGames; g++) {
    // Initialisation du plateau
    for (let j = 0; j < nPlayers; j++) {
      Pos[j * 2 + 0] = 0;
      Pos[j * 2 + 1] = 0;
      Dir[j * 2 + 0] = 1;
      Dir[j * 2 + 1] = 1;
      Role[j * 2 + 0] = 0; // 0 = CUT
      Role[j * 2 + 1] = 1; // 1 = BULLDOZE
      Status[j * 2 + 0] = 0;
      Status[j * 2 + 1] = 0;
      RiverProgress[j * 2 + 0] = 0;
      RiverProgress[j * 2 + 1] = 0;

      Q_rem[j] = targetParryQuotaPerTrack;
      R_rem[j] = expectedGatesPerTrack;

      for (let c = 0; c < L; c++) {
        const idx = j * L + c;
        A[idx] = InitCap[idx];
        S[idx] = 0;
        Z[idx] = 0;
        BullVisited[idx] = c === 0 ? 1 : 0;
      }
    }

    for (let idx = 0; idx < 11; idx++) {
      track[idx] = genome[OFFSET_LEARNING + idx];
      verso[idx] = genome[OFFSET_LEARNING + 11 + idx];
    }

    let gamePhys = 0.0;
    let gameCog = 0.0;
    let gameStalls = 0;
    let gameSlots = 0;
    let gameParries = 0;
    let gameMoves = 0;

    for (let t = 0; t < T; t++) {
      const tierIdx = t < t1Limit ? 0 : t >= t3Start ? 2 : 1;
      gameCog += 1.0; // Jet 2D6 + lecture tuile

      // Tirage 2D6 global
      const d1 = (nextRng(rngState) % 6) + 1;
      const d2 = (nextRng(rngState) % 6) + 1;
      const sumDice = d1 + d2;
      const tileIdx = sumDice - 2;
      const isDiceDouble = d1 === d2 ? 1 : 0;
      const diceSumInCenter = tileIdx >= 4 && tileIdx <= 6 ? 1 : 0;

      let tacticId = track[tileIdx];
      if (tacticId < 0 || tacticId > 5 || genome[OFFSET_TACTICS + tacticId * 64] < 0) {
        tacticId = 0;
      }

      if (diceSumInCenter === 1 && tacticId < 4) {
        if (tierIdx === 0) centerT1[tacticId] += 1;
        if (tierIdx === 2) centerT3[tacticId] += 1;
      }

      const tBase = OFFSET_TACTICS + tacticId * 64;
      const m = genome[tBase + 0] === 1 ? 1 : 0; // 0 = Abatteuse, 1 = Bulldozer
      const waveMode = genome[tBase + 1];

      // Nombre de couloirs actifs ce tour
      let K = nPlayers;
      if (waveMode === 1) K = Math.floor((nPlayers + 1) / 2);
      else if (waveMode === 2) K = Math.max(1, nPlayers - 1);

      let turnSuccesses = 0;
      let turnFailures = 0;
      let unparriedTracks = 0;
      let cellClearedEventsThisTurn = 0;

      for (let sIdx = 0; sIdx < K; sIdx++) {
        const j = (sIdx + t) % nPlayers;
        const mIdx = j * 2 + m;

        // Gestion machine Cassée (Status == -1)
        if (Status[mIdx] === -1) {
          Status[mIdx] = 0;
          if (breakPenalty === 1) {
            // SKIP_FULL_TURN
            turnFailures += 1;
            continue;
          } else if (breakPenalty === 2) {
            // RETREAT_1_AND_SKIP
            if (Pos[mIdx] > 0) {
              Pos[mIdx] -= 1;
              gamePhys += 1.0;
              gameMoves += 1;
            }
            turnFailures += 1;
            continue;
          } else if (breakPenalty === 3) {
            // RESET_TO_CELL_0
            Pos[mIdx] = 0;
            gamePhys += 1.0;
            gameMoves += 1;
            turnFailures += 1;
            continue;
          }
        }

        const cStart = Pos[mIdx];
        const cellStartIdx = j * L + cStart;
        const wasIntactStart =
          (A[cellStartIdx] > 0 && S[cellStartIdx] === 0 && Z[cellStartIdx] === 0) ||
          (A[cellStartIdx] === 0 && S[cellStartIdx] > 0)
            ? 1
            : 0;

        let prevSlotsSucceeded = 0;
        let movedThisTurn = 0;
        let parriedThisTurn = 0;

        for (let slot = 0; slot < 4; slot++) {
          const sBase = tBase + 4 + slot * 15;
          const vTrue = genome[sBase + 7];
          const vFalse = genome[sBase + 10];
          if (vTrue === 0 && vFalse === 0) continue;

          gameSlots += 1;

          const c1S = genome[sBase + 0];
          const c1Op = genome[sBase + 1];
          const c1Val = genome[sBase + 2];
          const logicOp = genome[sBase + 3];
          const c2S = genome[sBase + 4];
          const c2Op = genome[sBase + 5];
          const c2Val = genome[sBase + 6];

          if (c1S > 0) gameCog += 0.2;
          const val1 = readSensorValue(
            c1S,
            j,
            m,
            L,
            A,
            S,
            Z,
            Pos,
            Dir,
            Role,
            Status,
            Obstacles,
            wasIntactStart,
            prevSlotsSucceeded,
            movedThisTurn,
            parriedThisTurn,
            isDiceDouble,
            diceSumInCenter
          );
          let condMet = evalComparison(val1, c1Op, c1Val);

          if (logicOp > 0) {
            gameCog += 0.2;
            const val2 = readSensorValue(
              c2S,
              j,
              m,
              L,
              A,
              S,
              Z,
              Pos,
              Dir,
              Role,
              Status,
              Obstacles,
              wasIntactStart,
              prevSlotsSucceeded,
              movedThisTurn,
              parriedThisTurn,
              isDiceDouble,
              diceSumInCenter
            );
            const cond2Met = evalComparison(val2, c2Op, c2Val);
            condMet = logicOp === 1 ? condMet && cond2Met : condMet || cond2Met;
          }

          let verb = condMet ? vTrue : vFalse;
          let qty = condMet ? genome[sBase + 8] : genome[sBase + 11];
          const offset = condMet ? genome[sBase + 9] : genome[sBase + 12];
          const parryMode = genome[sBase + 13];

          // Bonus d'Élan mécanique (+1 quantité sur Slot 1 si Status == +1)
          if (slot === 0 && Status[mIdx] === 1 && (verb === 1 || verb === 2 || verb === 3)) {
            qty += 1;
          }

          if (verb === 0) {
            gameStalls += 1;
            turnFailures += 1;
            continue;
          }

          const cTarget = Math.max(0, Math.min(L - 1, Pos[mIdx] + offset));
          const targetIdx = j * L + cTarget;

          // Vérification si l'action a une cible physique valide avant d'ouvrir la porte de parade
          let canExecute = true;
          if (verb === 1 || verb === 3) {
            if (A[targetIdx] <= 0) canExecute = false;
          } else if (verb === 2) {
            if (S[targetIdx] <= 0) canExecute = false;
          } else if (verb === 4) {
            // ADVANCE : vérifier bout de piste et invariant tandem
            const dir = Dir[mIdx];
            const nxtC = Pos[mIdx] + dir;
            if (nxtC < 0 || nxtC >= L) {
              if (eotMode === 0) {
                // STOP -> Si c'était la branche Vraie et qu'un repli Si Faux existe, basculer sur Si Faux
                if (condMet && vFalse > 0 && vFalse !== 4) {
                  verb = vFalse;
                  qty = genome[sBase + 11];
                  canExecute = verb === 1 ? A[targetIdx] > 0 : verb === 2 ? S[targetIdx] > 0 : true;
                } else {
                  canExecute = false;
                }
              }
            } else if (m === 1 && Dir[j * 2 + 0] > 0 && nxtC > Pos[j * 2 + 0]) {
              // Invariant Pos_B <= Pos_A
              canExecute = false;
            } else if (m === 0 && Obstacles[Pos[mIdx]] === 2 && Pos[j * 2 + 1] < Pos[mIdx]) {
              // Pont logistique : l'Abatteuse attend le Bulldozer
              canExecute = false;
            }
          }

          if (!canExecute) {
            gameStalls += 1;
            turnFailures += 1;
            continue;
          }

          // Porte d'interception (Parade) pour les verbes actifs (1..4)
          let parried = false;
          if (parryMode !== 0 && verb >= 1 && verb <= 4) {
            if (R_rem[j] < 1) R_rem[j] = 1;
            const pBase = Q_rem[j] / R_rem[j];
            let pParry = 0.0;

            if (Q_rem[j] <= 0 || botId === 0) {
              pParry = 0.0;
            } else if (Q_rem[j] >= R_rem[j]) {
              pParry = 1.0;
            } else if (botId === 1) {
              // B1_Aveugle
              pParry = pBase;
            } else if (botId >= 2 && botId <= 4) {
              // B2a, B2b, B2c : Sondes Monomaniaques
              const isTargetVerb =
                (botId === 2 && (verb === 1 || verb === 3)) ||
                (botId === 3 && verb === 2) ||
                (botId === 4 && verb === 4);
              const deltaP = 0.45 * Math.min(pBase, 1.0 - pBase);
              pParry = isTargetVerb
                ? Math.min(0.98, pBase + 1.35 * deltaP)
                : Math.max(0.02, pBase - 0.9 * deltaP);
            } else {
              // B3_Tacticien_Couloir (botId=5) & B4_Stratege_Complet (botId=6)
              let uVal = computeBotMarginalUtility(
                verb,
                qty,
                cTarget,
                j,
                m,
                L,
                A,
                S,
                Z,
                Pos,
                Status,
                Obstacles,
                Weights,
                parryMode,
                regenMode,
                regenMax,
                breakRule,
                parriedThisTurn,
                isDiceDouble
              );
              if (botId === 6) {
                // Coefficient de Pression Stratégique W_piste lié à la somme 2D6
                const wPiste =
                  diceSumInCenter === 1
                    ? 1.65
                    : sumDice <= 3 || sumDice >= 11
                    ? 0.45
                    : 1.0;
                uVal *= wPiste;
              }
              const threshold = 1.05 * (1.0 - pBase);
              const deltaP = 0.46 * Math.min(pBase, 1.0 - pBase);
              if (uVal >= threshold) {
                pParry = Math.min(0.99, pBase + 1.35 * deltaP);
              } else {
                pParry = Math.max(0.01, pBase - 0.88 * deltaP);
              }
            }

            if (R_rem[j] > 1) R_rem[j] -= 1;

            const uRand = (nextRng(rngState) & 0xffffff) / 0x1000000;
            if (uRand < pParry && Q_rem[j] > 0) {
              Q_rem[j] -= 1;
              gameParries += 1;
              parriedThisTurn += 1;
              Status[mIdx] = 0; // Toute parade brise l'élan

              // Vérification de la Loi de Casse
              if (
                (breakRule === 1 && parriedThisTurn >= 2) ||
                (breakRule === 2 && isDiceDouble === 1) ||
                (breakRule === 3 && (m === 0 ? A[targetIdx] === 0 : S[targetIdx] === 0))
              ) {
                Status[mIdx] = -1;
              }

              if (parryMode === 3 && qty > 1) {
                // DOWNGRADE_QTY_BY_1 : réduit la quantité de 1
                qty -= 1;
              } else {
                parried = true;
                turnFailures += 1;
                if (parryMode === 2) {
                  // CANCEL_REMAINING_TACTIC : annule tous les slots restants de la machine ce tour
                  break;
                }
              }
            }
          }

          if (parried) continue;

          // Exécution effective du Verbe
          if (verb === 1) {
            // CUT
            const cutN = Math.min(A[targetIdx], qty);
            if (cutN > 0) {
              A[targetIdx] -= cutN;
              S[targetIdx] += cutN;
              gamePhys += cutN;
              prevSlotsSucceeded += 1;
              turnSuccesses += 1;
              actionCounts[0] += cutN;
              damageByTier[tierIdx] += cutN;
              if (A[targetIdx] === 0) {
                cellClearedEventsThisTurn += 1;
              }
            } else {
              gameStalls += 1;
              turnFailures += 1;
            }
          } else if (verb === 2) {
            // BULLDOZE
            const remN = Math.min(S[targetIdx], qty);
            if (remN > 0) {
              S[targetIdx] -= remN;
              Z[targetIdx] += remN;
              BullVisited[targetIdx] = 1;
              gamePhys += remN;
              prevSlotsSucceeded += 1;
              turnSuccesses += 1;
              actionCounts[1] += remN;
              damageByTier[tierIdx] += remN;
            } else {
              gameStalls += 1;
              turnFailures += 1;
            }
          } else if (verb === 3) {
            // ERODE
            const erN = Math.min(A[targetIdx], qty);
            if (erN > 0) {
              A[targetIdx] -= erN;
              Z[targetIdx] += erN;
              gamePhys += erN;
              prevSlotsSucceeded += 1;
              turnSuccesses += 1;
              actionCounts[0] += erN;
              damageByTier[tierIdx] += erN;
            } else {
              gameStalls += 1;
              turnFailures += 1;
            }
          } else if (verb === 4) {
            // ADVANCE
            const curC = Pos[mIdx];
            // Gestion obstacle Rivière (nécessite 2 impulsions)
            if (Obstacles[curC] === 1 && RiverProgress[mIdx] === 0) {
              RiverProgress[mIdx] = 1;
              prevSlotsSucceeded += 1;
              turnSuccesses += 1;
              actionCounts[2] += 1;
            } else {
              RiverProgress[mIdx] = 0;
              let nxtC = curC + Dir[mIdx] * Math.max(1, qty);
              if (nxtC >= L || nxtC < 0) {
                if (eotMode === 1 || eotMode === 2) {
                  // BOUNCE ou BOUNCE_AND_FLIP_ROLE
                  Dir[mIdx] = -Dir[mIdx];
                  if (eotMode === 2 && m === 0) {
                    Role[mIdx] = 1; // L'Abatteuse bascule en mode Bulldozer au rebond
                  }
                  nxtC = Math.max(0, Math.min(L - 1, curC + Dir[mIdx]));
                } else if (eotMode === 3) {
                  // LOOP_TO_START
                  nxtC = 0;
                } else {
                  nxtC = curC;
                }
              }
              if (m === 1 && Dir[j * 2 + 0] > 0 && nxtC > Pos[j * 2 + 0]) {
                nxtC = Pos[j * 2 + 0];
              }
              if (nxtC !== curC) {
                Pos[mIdx] = nxtC;
                if (m === 1) BullVisited[j * L + nxtC] = 1;
                movedThisTurn = 1;
                gamePhys += 1.0;
                gameMoves += 1;
                prevSlotsSucceeded += 1;
                turnSuccesses += 1;
                actionCounts[2] += 1;
              } else {
                gameStalls += 1;
                turnFailures += 1;
              }
            }
          } else if (verb === 5) {
            // RETREAT
            if (Pos[mIdx] > 0) {
              Pos[mIdx] = Math.max(0, Pos[mIdx] - Math.max(1, qty));
              movedThisTurn = 1;
              gamePhys += 1.0;
              gameMoves += 1;
              prevSlotsSucceeded += 1;
              turnSuccesses += 1;
              actionCounts[2] += 1;
            }
          } else if (verb === 6) {
            // CALL_PARTNER
            const partner = 1 - m;
            const pIdx = j * 2 + partner;
            if (Pos[pIdx] < Pos[mIdx]) {
              Pos[pIdx] = Math.min(Pos[mIdx], Pos[pIdx] + Math.max(1, qty));
              if (partner === 1) BullVisited[j * L + Pos[pIdx]] = 1;
              gamePhys += 1.0;
              gameMoves += 1;
              prevSlotsSucceeded += 1;
              turnSuccesses += 1;
              actionCounts[2] += 1;
            }
          } else if (verb === 7) {
            // SET_STATUS
            Status[mIdx] = Math.max(-1, Math.min(1, qty));
            prevSlotsSucceeded += 1;
          } else if (verb === 8) {
            // SHIFT_TRACK
            if (tileIdx !== 5) {
              const nxt = tileIdx < 5 ? tileIdx + 1 : tileIdx - 1;
              const tmp = track[tileIdx];
              track[tileIdx] = track[nxt];
              track[nxt] = tmp;
              gamePhys += 1.0;
            }
            prevSlotsSucceeded += 1;
          }
        }

        if (parriedThisTurn === 0) {
          unparriedTracks += 1;
          if (momentumRule === 1 && prevSlotsSucceeded >= 1) {
            Status[mIdx] = 1; // Acquisition d'élan
          }
        }
      }

      // Étape d'apprentissage sur la Piste 2D6 (Section 2.6)
      let shift = 0;
      if (evalTriggerMode === 0) {
        // MAJORITY_UNPARRIED
        shift = unparriedTracks >= Math.ceil(K / 2) ? 1 : -1;
      } else if (evalTriggerMode === 1) {
        // RATIO_SUCCESS_VS_FAIL
        shift = turnSuccesses > 0 && turnSuccesses >= turnFailures ? 1 : -1;
      } else if (evalTriggerMode === 2) {
        // NET_DIFFERENCE
        shift = Math.max(-2, Math.min(2, turnSuccesses - turnFailures));
      } else {
        // ON_CELL_CLEARED_EVENT
        shift = cellClearedEventsThisTurn > 0 ? 1 : turnSuccesses >= turnFailures ? 1 : -1;
      }

      if (geomMoveMode === 1) {
        // FLIP_RECTO_VERSO : retourne la tuile sur place en cas d'échec ou d'événement
        if (shift < 0 || (evalTriggerMode === 3 && cellClearedEventsThisTurn > 0)) {
          const tmp = track[tileIdx];
          track[tileIdx] = verso[tileIdx];
          verso[tileIdx] = tmp;
          gamePhys += 1.0;
        }
      } else {
        // SWAP_TOWARD_7_OR_EDGES
        let curIdx = tileIdx;
        if (shift > 0 && curIdx !== 5) {
          const nxtIdx = curIdx < 5 ? curIdx + 1 : curIdx - 1;
          const tmp = track[curIdx];
          track[curIdx] = track[nxtIdx];
          track[nxtIdx] = tmp;
          gamePhys += 1.0;
        } else if (shift < 0 && curIdx !== 0 && curIdx !== 10) {
          const nxtIdx =
            curIdx < 5 ? curIdx - 1 : curIdx > 5 ? curIdx + 1 : t % 2 === 0 ? 4 : 6;
          const tmp = track[curIdx];
          track[curIdx] = track[nxtIdx];
          track[nxtIdx] = tmp;
          gamePhys += 1.0;
        }
      }
    }

    // Décompte de Fin de Partie (Section 2.7 : Système Piste 3 et Sommation Pondérée)
    let rawTrees = 0;
    let rawStumps = 0;
    let rawTerraced = 0;
    let regenTreesTotal = 0;
    let weightedScoreSum = 0;

    for (let j = 0; j < nPlayers; j++) {
      for (let c = 0; c < L; c++) {
        const idx = j * L + c;
        const aVal = A[idx];
        const sVal = S[idx];
        const zVal = Z[idx];

        rawTrees += aVal;
        rawStumps += sVal;
        rawTerraced += zVal;

        let regened = 0;
        if (regenMode === 1) {
          // PISTE3_1_PER_CELL_WITH_STUMP
          if (sVal >= 1) regened = 1;
        } else if (regenMode === 2) {
          // PISTE3_INTACT_SOIL_ONLY
          if (sVal >= 1 && zVal === 0) regened = 1;
        } else if (regenMode === 3) {
          // PISTE3_UP_TO_K_IF_NO_BULLDOZE
          if (sVal >= 1 && BullVisited[idx] === 0) {
            regened = Math.min(sVal, regenMax);
          }
        }

        const finalCellTrees = aVal + regened;
        regenTreesTotal += finalCellTrees;
        weightedScoreSum += finalCellTrees * Weights[c];
      }
    }

    const scorePct = (100.0 * weightedScoreSum) / totalMaxWeightedScore;
    const nObs = g + 1;
    const delta = scorePct - meanScore;
    meanScore += delta / nObs;
    const delta2 = scorePct - meanScore;
    m2Score += delta * delta2;

    sumTreesRawPct += (100.0 * rawTrees) / totalInitTrees;
    sumTreesRegenPct += (100.0 * regenTreesTotal) / totalInitTrees;
    sumStumpsRawPct += (100.0 * rawStumps) / totalInitTrees;
    sumTerracedPct += (100.0 * rawTerraced) / totalInitTrees;
    sumPhys += gamePhys / T;
    sumCog += gameCog / T;
    sumStalls += gameStalls;
    sumTotalSlots += Math.max(1, gameSlots);
    sumParries += gameParries / nPlayers;
    sumMovesAndBounces += gameMoves / nPlayers;
  }

  const invN = 1.0 / nGames;
  const stdScorePct = nGames > 1 ? Math.sqrt(m2Score / (nGames - 1)) : 0.0;

  const totalAct = Math.max(1, actionCounts[0] + actionCounts[1] + actionCounts[2]);
  const sumT1 = Math.max(1, centerT1[0] + centerT1[1] + centerT1[2] + centerT1[3]);
  const sumT3 = Math.max(1, centerT3[0] + centerT3[1] + centerT3[2] + centerT3[3]);

  return {
    meanScorePct: meanScore,
    stdScorePct,
    meanTreesRawPct: sumTreesRawPct * invN,
    meanTreesRegenPct: sumTreesRegenPct * invN,
    meanStumpsRawPct: sumStumpsRawPct * invN,
    meanTerracedPct: sumTerracedPct * invN,
    meanPhysPerTurn: sumPhys * invN,
    meanCogPerTurn: sumCog * invN,
    meanStallRatePct: 100.0 * (sumStalls / Math.max(1, sumTotalSlots)),
    meanParriesUsed: sumParries * invN,
    meanMovesAndBounces: sumMovesAndBounces * invN,
    actionDist: [
      actionCounts[0] / totalAct,
      actionCounts[1] / totalAct,
      actionCounts[2] / totalAct,
    ],
    centerTacticDistT1: [
      centerT1[0] / sumT1,
      centerT1[1] / sumT1,
      centerT1[2] / sumT1,
      centerT1[3] / sumT1,
    ],
    centerTacticDistT3: [
      centerT3[0] / sumT3,
      centerT3[1] / sumT3,
      centerT3[2] / sumT3,
      centerT3[3] / sumT3,
    ],
    damageByTier: [
      damageByTier[0] * invN,
      damageByTier[1] * invN,
      damageByTier[2] * invN,
    ],
  };
}

export interface TurnByTurnProfileV2 {
  turns: number[];
  treesRawPct: number[];
  stumpsCritPiste3Pct: number[];
  stumpsExtraPct: number[];
  terracedPct: number[];
  centerBulldozerPct: number[];
}

/**
 * Simule la courbe temporelle tour par tour (t = 1..T) avec distinction des Souches critiques Piste 3.
 */
export function simulateTurnProfileV2(
  genome: Int32Array,
  nPlayers = 4,
  effortRate = 0.5,
  nGames = 120,
  seed = 4242
): TurnByTurnProfileV2 {
  const L = Math.max(1, Math.min(8, genome[HDR_L_CELLS]));
  const T = Math.max(1, genome[HDR_T_TURNS]);
  const regenMode = genome[HDR_REGEN_MODE];

  const treesRawCurve = new Float64Array(T);
  const stumpsCritCurve = new Float64Array(T);
  const stumpsExtraCurve = new Float64Array(T);
  const terracedCurve = new Float64Array(T);
  const centerBullCurve = new Float64Array(T);

  // On utilise une simulation pas-à-pas fidèle à B3_Tacticien_Couloir
  const rngState = new Uint32Array(2);
  rngState[0] = seed >>> 0;
  rngState[1] = (seed ^ 0x9e3779b9) >>> 0;

  let totalInitTrees = 0;
  for (let c = 0; c < L; c++) {
    totalInitTrees += nPlayers * Math.max(1, genome[ARENA_CELL_CAP_START + c]);
  }

  for (let g = 0; g < nGames; g++) {
    const A = new Int32Array(nPlayers * L);
    const S = new Int32Array(nPlayers * L);
    const Z = new Int32Array(nPlayers * L);
    const Pos = new Int32Array(nPlayers * 2);
    const track = new Int32Array(11);
    const verso = new Int32Array(11);

    for (let j = 0; j < nPlayers; j++) {
      for (let c = 0; c < L; c++) {
        A[j * L + c] = Math.max(1, genome[ARENA_CELL_CAP_START + c]);
      }
    }
    for (let i = 0; i < 11; i++) {
      track[i] = genome[OFFSET_LEARNING + i];
      verso[i] = genome[OFFSET_LEARNING + 11 + i];
    }

    let Q = Math.round(effortRate * T * 1.7 * nPlayers);
    let R = Math.round(T * 1.7 * nPlayers);

    for (let t = 0; t < T; t++) {
      let bullInCenter = 0;
      for (let cIdx = 4; cIdx <= 6; cIdx++) {
        const tId = track[cIdx];
        if (tId >= 2 || genome[OFFSET_TACTICS + Math.max(0, tId) * 64] === 1) {
          bullInCenter += 1;
        }
      }
      centerBullCurve[t] += (100.0 * bullInCenter) / 3.0;

      const d1 = (nextRng(rngState) % 6) + 1;
      const d2 = (nextRng(rngState) % 6) + 1;
      const tileIdx = d1 + d2 - 2;
      const tacticId = Math.max(0, Math.min(5, track[tileIdx]));
      const tBase = OFFSET_TACTICS + tacticId * 64;
      const m = genome[tBase] === 1 ? 1 : 0;

      let succ = 0;
      let fail = 0;

      for (let j = 0; j < nPlayers; j++) {
        for (let slot = 0; slot < 3; slot++) {
          const sBase = tBase + 4 + slot * 15;
          const vTrue = genome[sBase + 7];
          const vFalse = genome[sBase + 10];
          if (vTrue === 0 && vFalse === 0) continue;

          const c = Pos[j * 2 + m];
          const cellIdx = j * L + c;
          const targets = m === 0 ? A[cellIdx] : S[cellIdx];
          const verb = targets >= 1 ? vTrue : vFalse || 4;

          const pParry = Q / Math.max(1, R);
          R = Math.max(1, R - 1);
          const u = (nextRng(rngState) & 0xffffff) / 0x1000000;
          if (u < pParry && Q > 0) {
            Q -= 1;
            fail += 1;
            if (genome[sBase + 13] === 2) break;
            continue;
          }

          succ += 1;
          if (verb === 1 && A[cellIdx] > 0) {
            A[cellIdx] -= 1;
            S[cellIdx] += 1;
          } else if (verb === 2 && S[cellIdx] > 0) {
            S[cellIdx] -= 1;
            Z[cellIdx] += 1;
          } else if (verb === 4 && c + 1 < L) {
            if (m === 0 || c + 1 <= Pos[j * 2 + 0]) {
              Pos[j * 2 + m] = c + 1;
            }
          }
        }
      }

      if (succ >= fail && tileIdx !== 5) {
        const nxt = tileIdx < 5 ? tileIdx + 1 : tileIdx - 1;
        const tmp = track[tileIdx];
        track[tileIdx] = track[nxt];
        track[nxt] = tmp;
      }

      let sumA = 0;
      let sumSCrit = 0;
      let sumSExtra = 0;
      let sumZ = 0;
      for (let i = 0; i < nPlayers * L; i++) {
        sumA += A[i];
        sumZ += Z[i];
        if (S[i] > 0) {
          const canRegen = regenMode === 1 || (regenMode === 2 && Z[i] === 0);
          if (canRegen) {
            sumSCrit += 1;
            sumSExtra += S[i] - 1;
          } else {
            sumSExtra += S[i];
          }
        }
      }

      treesRawCurve[t] += (100.0 * sumA) / totalInitTrees;
      stumpsCritCurve[t] += (100.0 * sumSCrit) / totalInitTrees;
      stumpsExtraCurve[t] += (100.0 * sumSExtra) / totalInitTrees;
      terracedCurve[t] += (100.0 * sumZ) / totalInitTrees;
    }
  }

  return {
    turns: Array.from({ length: T }, (_, i) => i + 1),
    treesRawPct: Array.from(treesRawCurve, (v) => Number((v / nGames).toFixed(1))),
    stumpsCritPiste3Pct: Array.from(stumpsCritCurve, (v) => Number((v / nGames).toFixed(1))),
    stumpsExtraPct: Array.from(stumpsExtraCurve, (v) => Number((v / nGames).toFixed(1))),
    terracedPct: Array.from(terracedCurve, (v) => Number((v / nGames).toFixed(1))),
    centerBulldozerPct: Array.from(centerBullCurve, (v) => Number((v / nGames).toFixed(1))),
  };
}
