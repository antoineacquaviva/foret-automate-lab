/**
 * Bloc 1 & Bloc 2 — Spécification du Génome de Niveau 3 (447 entiers int32 = 1 788 octets)
 * et Dictionnaires du Méta-Modèle (18 Capteurs, 9 Verbes, Parades, Casse, Élan, Piste 3).
 */

export const GENOME_SIZE = 447; // 10 Header + 25 Arena + 384 Tactics (6*64) + 28 Learning = 447 int32
export const GENOME_BYTES = GENOME_SIZE * 4; // 1788 bytes

// Segment Offsets
export const OFFSET_HEADER = 0; // [0..9] (10 ints)
export const OFFSET_ARENA = 10; // [10..34] (25 ints)
export const OFFSET_TACTICS = 35; // [35..418] (6 * 64 = 384 ints)
export const OFFSET_LEARNING = 419; // [419..446] (28 ints)

// Header indices [0..9]
export const HDR_L_CELLS = 0;
export const HDR_T_TURNS = 1;
export const HDR_DICE_MODE = 2; // 0 = GLOBAL_2D6, 1 = PER_TRACK_2D6
export const HDR_END_OF_TRACK_MODE = 3; // 0 = STOP, 1 = BOUNCE, 2 = BOUNCE_AND_FLIP_ROLE, 3 = LOOP_TO_START
export const HDR_BREAK_RULE = 4; // 0 = NEVER, 1 = ON_2_PARRIES_IN_TURN, 2 = ON_PARRY_DURING_DOUBLE, 3 = ON_PARRY_WHEN_CELL_EMPTY
export const HDR_BREAK_PENALTY = 5; // 0 = SKIP_NEXT_SLOT, 1 = SKIP_FULL_TURN, 2 = RETREAT_1_AND_SKIP, 3 = RESET_TO_CELL_0
export const HDR_MOMENTUM_RULE = 6; // 0 = NONE, 1 = ACTIVE
export const HDR_DOUBLES_RULE = 7; // 0 = NONE, 1 = EXTRA_SHIFT_TO_7, 2 = TURBO_WAVE
export const HDR_REGEN_MODE = 8; // 0 = NONE, 1 = PISTE3_1_PER_CELL_WITH_STUMP, 2 = PISTE3_INTACT_SOIL_ONLY, 3 = PISTE3_UP_TO_K_IF_NO_BULLDOZE
export const HDR_REGEN_MAX = 9; // K max souches redressées par case (ex: 1 ou 2)

// Arena indices [10..34]
export const ARENA_CELL_CAP_START = 10; // [10..17] (8 ints)
export const ARENA_CELL_WEIGHTS_START = 18; // [18..25] (8 ints)
export const ARENA_OBSTACLE_MASK_START = 26; // [26..33] (8 ints: 0=Libre, 1=Rivière 2 impulsions, 2=Pont logistique tandem)
export const ARENA_BIOME_MODE = 34; // 0=SYMMETRIC, 1=ASYMMETRIC_BIOMES_12A

export const ASYMMETRIC_BIOMES_12A: number[][] = [
  [1, 1, 2, 4, 4, 0, 0, 0], // Clairière-Jungle (12 arbres)
  [4, 3, 2, 2, 1, 0, 0, 0], // Mur Végétal (12 arbres)
  [2, 3, 2, 3, 2, 0, 0, 0], // Vallée Ondulée (12 arbres)
  [2, 2, 4, 2, 2, 0, 0, 0], // Bosquet Central (12 arbres)
];

// 18 Capteurs du Niveau 1 (Section 2.3)
export interface SensorInfo {
  id: number;
  code: string;
  label: string;
  cognitiveCost: number;
}

export const SENSORS: SensorInfo[] = [
  { id: 0, code: 'ALWAYS', label: 'Toujours vrai (Inconditionnel)', cognitiveCost: 0.0 },
  { id: 1, code: 'TREES_CURR', label: 'Arbres debout sur la case (A[j,c])', cognitiveCost: 0.25 },
  { id: 2, code: 'STUMPS_CURR', label: 'Souches sur la case (S[j,c])', cognitiveCost: 0.25 },
  { id: 3, code: 'TERRACED_CURR', label: 'Zones Terrassées sur la case (Z[j,c])', cognitiveCost: 0.25 },
  { id: 4, code: 'TARGETS_CURR', label: 'Cibles du rôle actif (A ou S)', cognitiveCost: 0.2 },
  { id: 5, code: 'IS_MONOCHROME_GREEN', label: 'Case 100% Arbres intacts (S=0, Z=0)', cognitiveCost: 0.3 },
  { id: 6, code: 'IS_MONOCHROME_BROWN', label: 'Case 100% Souches (A=0, S>0)', cognitiveCost: 0.3 },
  { id: 7, code: 'WAS_INTACT_TURN_START', label: 'Case monochrome au début du tour', cognitiveCost: 0.4 },
  { id: 8, code: 'POS_MACHINE', label: 'Position actuelle Pos[j,m]', cognitiveCost: 0.2 },
  { id: 9, code: 'IS_AT_END_OF_TRACK', label: 'En bout de piste selon Dir[j,m]', cognitiveCost: 0.1 },
  { id: 10, code: 'TANDEM_GAP', label: 'Écart tandem Pos_A - Pos_B', cognitiveCost: 0.3 },
  { id: 11, code: 'IS_BLOCKED_BY_OBSTACLE', label: 'Frontière bloquée par obstacle', cognitiveCost: 0.3 },
  { id: 12, code: 'MACHINE_STATUS', label: 'Statut machine (-1 Cassée, 0 Norm, +1 Lancée)', cognitiveCost: 0.2 },
  { id: 13, code: 'PREV_SLOTS_SUCCEEDED', label: 'Slots précédents réussis ce tour', cognitiveCost: 0.3 },
  { id: 14, code: 'MOVED_THIS_TURN', label: 'A changé de case ce tour', cognitiveCost: 0.2 },
  { id: 15, code: 'PARRIED_THIS_TURN', label: 'Parades subies ce tour', cognitiveCost: 0.2 },
  { id: 16, code: 'IS_DICE_DOUBLE', label: 'Tirage 2D6 est un Double (d1 == d2)', cognitiveCost: 0.1 },
  { id: 17, code: 'DICE_SUM_IN_CENTER', label: 'Somme 2D6 au cœur {6, 7, 8}', cognitiveCost: 0.2 },
];

export const SENSOR_BY_CODE: Record<string, SensorInfo> = Object.fromEntries(
  SENSORS.map((s) => [s.code, s])
);

// Opérateurs de comparaison
export const COMP_OPS = ['==', '!=', '<', '<=', '>', '>='] as const;
export type CompOp = (typeof COMP_OPS)[number];
export const COMP_OP_TO_ID: Record<string, number> = {
  '==': 0,
  '!=': 1,
  '<': 2,
  '<=': 3,
  '>': 4,
  '>=': 5,
};

// Opérateurs logiques entre Cond1 et Cond2
export const LOGIC_OPS = ['NONE', 'AND', 'OR'] as const;
export const LOGIC_OP_TO_ID: Record<string, number> = { NONE: 0, AND: 1, OR: 2 };

// 9 Verbes d'action primitifs (Section 2.4)
export interface VerbInfo {
  id: number;
  code: string;
  label: string;
}

export const VERBS: VerbInfo[] = [
  { id: 0, code: 'NONE', label: 'Aucune action (Patinage si primaire)' },
  { id: 1, code: 'CUT', label: 'Couper Arbres -> Souches' },
  { id: 2, code: 'BULLDOZE', label: 'Terrasser Souches -> Zones Terrassées' },
  { id: 3, code: 'ERODE', label: 'Éroder Arbres -> Zones Terrassées direct' },
  { id: 4, code: 'ADVANCE', label: 'Avancer la machine' },
  { id: 5, code: 'RETREAT', label: 'Reculer la machine vers la Lisière' },
  { id: 6, code: 'CALL_PARTNER', label: 'Appeler la machine partenaire' },
  { id: 7, code: 'SET_STATUS', label: 'Forcer statut mécanique (-1, 0, +1)' },
  { id: 8, code: 'SHIFT_TRACK', label: 'Glisser la tuile active vers le 7' },
];

export const VERB_BY_CODE: Record<string, VerbInfo> = Object.fromEntries(
  VERBS.map((v) => [v.code, v])
);

// Modes de parade sur le Slot (Section 2.5)
export const PARRY_MODES = [
  'UNPARRYABLE',
  'CANCEL_SLOT_ONLY',
  'CANCEL_REMAINING_TACTIC',
  'DOWNGRADE_QTY_BY_1',
] as const;
export const PARRY_MODE_TO_ID: Record<string, number> = {
  UNPARRYABLE: 0,
  CANCEL_SLOT_ONLY: 1,
  CANCEL_REMAINING_TACTIC: 2,
  DOWNGRADE_QTY_BY_1: 3,
};

// Modes de bout de piste
export const END_OF_TRACK_MODES = [
  'STOP',
  'BOUNCE',
  'BOUNCE_AND_FLIP_ROLE',
  'LOOP_TO_START',
] as const;
export const END_OF_TRACK_TO_ID: Record<string, number> = {
  STOP: 0,
  BOUNCE: 1,
  BOUNCE_AND_FLIP_ROLE: 2,
  LOOP_TO_START: 3,
};

// Règles de Casse et Pénalité
export const BREAK_RULES = [
  'NEVER',
  'ON_2_PARRIES_IN_TURN',
  'ON_PARRY_DURING_DOUBLE',
  'ON_PARRY_WHEN_CELL_EMPTY',
] as const;
export const BREAK_RULE_TO_ID: Record<string, number> = {
  NEVER: 0,
  ON_2_PARRIES_IN_TURN: 1,
  ON_PARRY_DURING_DOUBLE: 2,
  ON_PARRY_WHEN_CELL_EMPTY: 3,
};

export const BREAK_PENALTIES = [
  'SKIP_NEXT_SLOT',
  'SKIP_FULL_TURN',
  'RETREAT_1_AND_SKIP',
  'RESET_TO_CELL_0',
] as const;
export const BREAK_PENALTY_TO_ID: Record<string, number> = {
  SKIP_NEXT_SLOT: 0,
  SKIP_FULL_TURN: 1,
  RETREAT_1_AND_SKIP: 2,
  RESET_TO_CELL_0: 3,
};

export const MOMENTUM_RULES = ['NONE', 'ACTIVE'] as const;
export const MOMENTUM_TO_ID: Record<string, number> = { NONE: 0, ACTIVE: 1 };

export const REGEN_MODES = [
  'NONE',
  'PISTE3_1_PER_CELL_WITH_STUMP',
  'PISTE3_INTACT_SOIL_ONLY',
  'PISTE3_UP_TO_K_IF_NO_BULLDOZE',
] as const;
export const REGEN_MODE_TO_ID: Record<string, number> = {
  NONE: 0,
  PISTE3_1_PER_CELL_WITH_STUMP: 1,
  PISTE3_INTACT_SOIL_ONLY: 2,
  PISTE3_UP_TO_K_IF_NO_BULLDOZE: 3,
};

export const EVAL_TRIGGER_MODES = [
  'MAJORITY_UNPARRIED',
  'RATIO_SUCCESS_VS_FAIL',
  'NET_DIFFERENCE',
  'ON_CELL_CLEARED_EVENT',
] as const;
export const EVAL_TRIGGER_TO_ID: Record<string, number> = {
  MAJORITY_UNPARRIED: 0,
  RATIO_SUCCESS_VS_FAIL: 1,
  NET_DIFFERENCE: 2,
  ON_CELL_CLEARED_EVENT: 3,
};

export const GEOM_MOVE_MODES = ['SWAP_TOWARD_7_OR_EDGES', 'FLIP_RECTO_VERSO'] as const;
export const GEOM_MOVE_TO_ID: Record<string, number> = {
  SWAP_TOWARD_7_OR_EDGES: 0,
  FLIP_RECTO_VERSO: 1,
};

export const WAVE_MODES = ['ALL_TRACKS', 'HALF_SUP', 'WIDE_J_MINUS_1', 'ASYMMETRIC_FRONT'] as const;
export const WAVE_MODE_TO_ID: Record<string, number> = {
  ALL_TRACKS: 0,
  HALF_SUP: 1,
  WIDE_J_MINUS_1: 2,
  ASYMMETRIC_FRONT: 3,
};

export const INITIAL_LAYOUTS_V2: Record<string, { recto: number[]; verso: number[] }> = {
  '6C_5B_CENTRE_COUPE': {
    recto: [3, 2, 3, 0, 1, 0, 1, 0, 2, 3, 2],
    verso: [1, 0, 1, 2, 3, 2, 3, 2, 0, 1, 0],
  },
  '6C_5B_ALTERNE': {
    recto: [3, 1, 2, 0, 3, 0, 1, 2, 0, 3, 1],
    verso: [1, 3, 0, 2, 1, 2, 3, 0, 2, 1, 3],
  },
  '5C_6B_PRESSION_BULL': {
    recto: [0, 3, 1, 2, 3, 2, 0, 3, 1, 2, 0],
    verso: [2, 1, 3, 0, 1, 0, 2, 1, 3, 0, 2],
  },
};

/**
 * Calcule la Complexité Syntaxique Statique C_règle directement sur le génome de 447 int32 (Section 5.4).
 */
export function computeStaticRuleComplexity(genome: Int32Array): number {
  let cRegle = 0.0;
  const distinctThresholds = new Set<number>();

  // Coût des règles physiques additionnelles
  if (genome[HDR_BREAK_RULE] > 0) cRegle += 0.45;
  if (genome[HDR_MOMENTUM_RULE] > 0) cRegle += 0.4;
  if (genome[HDR_END_OF_TRACK_MODE] === 2) cRegle += 0.35; // BOUNCE_AND_FLIP_ROLE
  if (genome[ARENA_BIOME_MODE] > 0) cRegle += 0.25;

  let hasObstacles = false;
  for (let i = 0; i < 8; i++) {
    if (genome[ARENA_OBSTACLE_MASK_START + i] > 0) hasObstacles = true;
  }
  if (hasObstacles) cRegle += 0.4;

  // Parcourir les 4 tactiques principales (ou jusqu'à 6 si actives)
  for (let t = 0; t < 6; t++) {
    const tBase = OFFSET_TACTICS + t * 64;
    const machineType = genome[tBase];
    if (machineType < 0) continue; // Tactique inactive

    for (let s = 0; s < 4; s++) {
      const sBase = tBase + 4 + s * 15;
      const cond1Sensor = genome[sBase + 0];
      const cond1Val = genome[sBase + 2];
      const logicOp = genome[sBase + 3];
      const cond2Sensor = genome[sBase + 4];
      const cond2Val = genome[sBase + 6];
      const actTrueVerb = genome[sBase + 7];
      const actFalseVerb = genome[sBase + 10];

      if (actTrueVerb === 0 && actFalseVerb === 0) continue; // Slot vide

      const s1 = SENSORS[cond1Sensor] || SENSORS[0];
      cRegle += s1.cognitiveCost;
      if (cond1Sensor > 0) distinctThresholds.add(cond1Val);

      if (logicOp > 0) {
        const s2 = SENSORS[cond2Sensor] || SENSORS[0];
        cRegle += s2.cognitiveCost + 0.2;
        if (cond2Sensor > 0) distinctThresholds.add(cond2Val);
      }

      if (actFalseVerb > 0) {
        cRegle += 0.2; // Coût d'un branchement Si Faux non vide
      }
    }
  }

  // Pénalité si les tactiques utilisent des seuils numériques hétérogènes difficiles à mémoriser
  if (distinctThresholds.size > 2) {
    cRegle += (distinctThresholds.size - 2) * 0.35;
  }

  return Number(cRegle.toFixed(2));
}

/**
 * Filtre d'Éligibilité Statique Pré-Simulation (Section 6.2) :
 * Vérifie que l'automate possède au moins 1 verbe CUT/ERODE, 1 verbe BULLDOZE et 1 verbe ADVANCE atteignables.
 */
export function isGenomeEligible(genome: Int32Array): {
  valid: boolean;
  hasCut: boolean;
  hasBulldoze: boolean;
  hasAdvance: boolean;
} {
  let hasCut = false;
  let hasBulldoze = false;
  let hasAdvance = false;

  for (let t = 0; t < 6; t++) {
    const tBase = OFFSET_TACTICS + t * 64;
    if (genome[tBase] < 0) continue;
    for (let s = 0; s < 4; s++) {
      const sBase = tBase + 4 + s * 15;
      const vTrue = genome[sBase + 7];
      const vFalse = genome[sBase + 10];
      if (vTrue === 1 || vTrue === 3 || vFalse === 1 || vFalse === 3) hasCut = true;
      if (vTrue === 2 || vFalse === 2) hasBulldoze = true;
      if (vTrue === 4 || vFalse === 4) hasAdvance = true;
    }
  }

  return {
    valid: hasCut && hasBulldoze && hasAdvance,
    hasCut,
    hasBulldoze,
    hasAdvance,
  };
}
