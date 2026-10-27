/**
 * Bloc 2 & Bloc 5bis — Compilateur DSL Niveau 2 ($sweep -> Génomes Int32Array(447)),
 * Bibliothèque des 3 Familles d'Automates pré-chargées, Exporteur Génome -> YAML/JSON,
 * et Traducteur en Règle de Jeu Humaine (français clair pour playtest sur table).
 */

import {
  GENOME_SIZE,
  OFFSET_TACTICS,
  OFFSET_LEARNING,
  HDR_L_CELLS,
  HDR_T_TURNS,
  HDR_DICE_MODE,
  HDR_END_OF_TRACK_MODE,
  HDR_BREAK_RULE,
  HDR_BREAK_PENALTY,
  HDR_MOMENTUM_RULE,
  HDR_DOUBLES_RULE,
  HDR_REGEN_MODE,
  HDR_REGEN_MAX,
  ARENA_CELL_CAP_START,
  ARENA_CELL_WEIGHTS_START,
  ARENA_OBSTACLE_MASK_START,
  ARENA_BIOME_MODE,
  SENSOR_BY_CODE,
  SENSORS,
  COMP_OP_TO_ID,
  COMP_OPS,
  LOGIC_OP_TO_ID,
  LOGIC_OPS,
  VERB_BY_CODE,
  VERBS,
  PARRY_MODE_TO_ID,
  PARRY_MODES,
  END_OF_TRACK_TO_ID,
  END_OF_TRACK_MODES,
  BREAK_RULE_TO_ID,
  BREAK_RULES,
  BREAK_PENALTY_TO_ID,
  BREAK_PENALTIES,
  MOMENTUM_TO_ID,
  MOMENTUM_RULES,
  REGEN_MODE_TO_ID,
  REGEN_MODES,
  EVAL_TRIGGER_TO_ID,
  EVAL_TRIGGER_MODES,
  GEOM_MOVE_TO_ID,
  GEOM_MOVE_MODES,
  WAVE_MODE_TO_ID,
  WAVE_MODES,
  INITIAL_LAYOUTS_V2,
  computeStaticRuleComplexity,
  isGenomeEligible,
} from './genome';

export type Sweepable<T> = T | { $sweep: T[] };

export interface SlotSpecDSL {
  cond1: [string, string, Sweepable<number>];
  logic?: Sweepable<string>;
  cond2?: [string, string, Sweepable<number>];
  if_true: Sweepable<[string, number, number]>;
  if_false: Sweepable<[string, number, number]>;
  parry_mode: Sweepable<string>;
  parry_cost?: number;
}

export interface TacticSpecDSL {
  id: string;
  machine: 'ABATTEUSE' | 'BULLDOZER';
  wave_mode: Sweepable<string>;
  slots: SlotSpecDSL[];
}

export interface FamilySpecDSL {
  family_id: string;
  description: string;
  arena: {
    turns: Sweepable<number>;
    dice_mode: Sweepable<string>;
    biomes: {
      mode: Sweepable<string>;
      symmetric_cap: number[];
    };
    cell_weights: Sweepable<number[]>;
    obstacles: Sweepable<number[]>;
    end_of_track_mode: Sweepable<string>;
  };
  machines_physics: {
    break_rule: Sweepable<string>;
    break_penalty: Sweepable<string>;
    momentum_rule: Sweepable<string>;
    doubles_rule?: Sweepable<string>;
  };
  tactics: TacticSpecDSL[];
  learning_track: {
    initial_layout: Sweepable<string>;
    eval_trigger_mode: Sweepable<string>;
    geom_move_mode: Sweepable<string>;
  };
  scoring: {
    regen_mode: Sweepable<string>;
    regen_max?: number;
  };
}

export interface CompiledGenomeSpec {
  id: number;
  code: string;
  familyId: string;
  genome: Int32Array;
  staticComplexity: number;
  summaryChoices: Record<string, string | number>;
}

/**
 * Les 3 Familles d'Automates de Niveau 2 pré-chargées dans le Studio (Vue 1)
 */
export const PRELOADED_FAMILIES: FamilySpecDSL[] = [
  {
    family_id: 'Famille_4Tactiques_Enlisement_Piste3',
    description:
      '4 tactiques sans tri de pistes, enlisement sur case vide, redressement final Piste 3 (Spec de référence V2)',
    arena: {
      turns: { $sweep: [14, 16, 20] },
      dice_mode: 'GLOBAL_2D6',
      biomes: {
        mode: { $sweep: ['SYMMETRIC_5c_12a', 'ASYMMETRIC_BIOMES_12a'] },
        symmetric_cap: [2, 2, 2, 3, 3],
      },
      cell_weights: { $sweep: [[1, 1, 1, 1, 1], [1, 1, 2, 2, 3]] },
      obstacles: [0, 0, 0, 0, 0],
      end_of_track_mode: { $sweep: ['STOP', 'BOUNCE'] },
    },
    machines_physics: {
      break_rule: 'NEVER',
      break_penalty: 'SKIP_NEXT_SLOT',
      momentum_rule: 'NONE',
    },
    tactics: [
      {
        id: 'C1_Coupe_Intensive',
        machine: 'ABATTEUSE',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['CUT', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['CUT', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['PREV_SLOTS_SUCCEEDED', '>=', 1],
            logic: 'AND',
            cond2: ['TARGETS_CURR', '==', 0],
            if_true: {
              $sweep: [
                ['NONE', 0, 0],
                ['CUT', 1, 1],
              ],
            },
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'C2_Avancer_Couper',
        machine: 'ABATTEUSE',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '<=', { $sweep: [0, 1] }],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['CUT', 1, 0],
            parry_mode: { $sweep: ['CANCEL_REMAINING_TACTIC', 'CANCEL_SLOT_ONLY'] },
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['CUT', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'B1_Terrassement_Intensif',
        machine: 'BULLDOZER',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'B2_Avancer_Terrasser',
        machine: 'BULLDOZER',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '<=', { $sweep: [0, 1] }],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['BULLDOZE', 1, 0],
            parry_mode: 'CANCEL_REMAINING_TACTIC',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
    ],
    learning_track: {
      initial_layout: { $sweep: ['6C_5B_CENTRE_COUPE', '6C_5B_ALTERNE'] },
      eval_trigger_mode: { $sweep: ['MAJORITY_UNPARRIED', 'RATIO_SUCCESS_VS_FAIL'] },
      geom_move_mode: { $sweep: ['SWAP_TOWARD_7_OR_EDGES', 'FLIP_RECTO_VERSO'] },
    },
    scoring: {
      regen_mode: { $sweep: ['PISTE3_1_PER_CELL_WITH_STUMP', 'PISTE3_INTACT_SOIL_ONLY'] },
      regen_max: 1,
    },
  },
  {
    family_id: 'Famille_Casse_Elan_Doubles',
    description:
      'Mécaniques cinétiques de Casse sur double parade ou double aux dés, Élan mécanique (+1 dégâts) et retournement Recto-Verso',
    arena: {
      turns: { $sweep: [14, 16] },
      dice_mode: 'GLOBAL_2D6',
      biomes: {
        mode: 'SYMMETRIC_5c_12a',
        symmetric_cap: [2, 2, 2, 3, 3],
      },
      cell_weights: [1, 1, 1, 1, 1],
      obstacles: [0, 0, 0, 0, 0],
      end_of_track_mode: { $sweep: ['STOP', 'BOUNCE_AND_FLIP_ROLE'] },
    },
    machines_physics: {
      break_rule: { $sweep: ['ON_2_PARRIES_IN_TURN', 'ON_PARRY_DURING_DOUBLE'] },
      break_penalty: { $sweep: ['SKIP_NEXT_SLOT', 'SKIP_FULL_TURN', 'RETREAT_1_AND_SKIP'] },
      momentum_rule: { $sweep: ['NONE', 'ACTIVE'] },
    },
    tactics: [
      {
        id: 'C1_Defrichage_Lourd',
        machine: 'ABATTEUSE',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['IS_MONOCHROME_GREEN', '==', 1],
            if_true: ['CUT', 2, 0],
            if_false: ['CUT', 1, 0],
            parry_mode: { $sweep: ['CANCEL_SLOT_ONLY', 'DOWNGRADE_QTY_BY_1'] },
          },
          {
            cond1: ['TARGETS_CURR', '==', 0],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'C2_Percee_Cinétique',
        machine: 'ABATTEUSE',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '<=', 1],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['CUT', 1, 0],
            parry_mode: 'CANCEL_REMAINING_TACTIC',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['CUT', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'B1_Ratissage_Souches',
        machine: 'BULLDOZER',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['IS_MONOCHROME_BROWN', '==', 1],
            if_true: ['BULLDOZE', 2, 0],
            if_false: ['BULLDOZE', 1, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['TARGETS_CURR', '==', 0],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'B2_Sillage_Tandem',
        machine: 'BULLDOZER',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TANDEM_GAP', '>=', 1],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['BULLDOZE', 1, 0],
            parry_mode: 'CANCEL_REMAINING_TACTIC',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
    ],
    learning_track: {
      initial_layout: { $sweep: ['6C_5B_CENTRE_COUPE', '6C_5B_ALTERNE'] },
      eval_trigger_mode: { $sweep: ['MAJORITY_UNPARRIED', 'ON_CELL_CLEARED_EVENT'] },
      geom_move_mode: { $sweep: ['SWAP_TOWARD_7_OR_EDGES', 'FLIP_RECTO_VERSO'] },
    },
    scoring: {
      regen_mode: { $sweep: ['PISTE3_1_PER_CELL_WITH_STUMP', 'PISTE3_INTACT_SOIL_ONLY'] },
      regen_max: 1,
    },
  },
  {
    family_id: 'Famille_Exploration_Genetique_Totale',
    description:
      'Espace ouvert pour NSGA-II + MAP-Elites : Biomes asymétriques 12a, Pont logistique & Rivière, rebond avec inversion de rôle et Piste 3 étendue',
    arena: {
      turns: { $sweep: [14, 16, 20] },
      dice_mode: { $sweep: ['GLOBAL_2D6', 'PER_TRACK_2D6'] },
      biomes: {
        mode: { $sweep: ['SYMMETRIC_5c_12a', 'ASYMMETRIC_BIOMES_12a'] },
        symmetric_cap: [2, 2, 2, 3, 3],
      },
      cell_weights: { $sweep: [[1, 1, 1, 1, 1], [1, 1, 2, 2, 3]] },
      obstacles: { $sweep: [[0, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 2, 0, 0]] },
      end_of_track_mode: { $sweep: ['STOP', 'BOUNCE', 'BOUNCE_AND_FLIP_ROLE'] },
    },
    machines_physics: {
      break_rule: { $sweep: ['NEVER', 'ON_2_PARRIES_IN_TURN', 'ON_PARRY_DURING_DOUBLE'] },
      break_penalty: { $sweep: ['SKIP_NEXT_SLOT', 'RETREAT_1_AND_SKIP'] },
      momentum_rule: { $sweep: ['NONE', 'ACTIVE'] },
    },
    tactics: [
      {
        id: 'C1_Coupe_Adaptative',
        machine: 'ABATTEUSE',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['CUT', 1, 0],
            if_false: ['ADVANCE', 1, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['IS_MONOCHROME_GREEN', '==', 1],
            if_true: ['CUT', 1, 0],
            if_false: ['CUT', 1, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['PREV_SLOTS_SUCCEEDED', '>=', 2],
            if_true: {
              $sweep: [
                ['NONE', 0, 0],
                ['SHIFT_TRACK', 1, 0],
              ],
            },
            if_false: ['NONE', 0, 0],
            parry_mode: 'UNPARRYABLE',
          },
        ],
      },
      {
        id: 'C2_Avance_Ou_Appel',
        machine: 'ABATTEUSE',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '<=', { $sweep: [0, 1] }],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['CUT', 1, 0],
            parry_mode: 'CANCEL_REMAINING_TACTIC',
          },
          {
            cond1: ['IS_BLOCKED_BY_OBSTACLE', '==', 1],
            if_true: ['CALL_PARTNER', 1, 0],
            if_false: ['CUT', 1, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'B1_Bulldozer_Lourd',
        machine: 'BULLDOZER',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: ['ADVANCE', 1, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: ['NONE', 0, 0],
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
      {
        id: 'B2_Sillage_Erosion',
        machine: 'BULLDOZER',
        wave_mode: 'ALL_TRACKS',
        slots: [
          {
            cond1: ['TARGETS_CURR', '==', 0],
            if_true: ['ADVANCE', 1, 0],
            if_false: ['BULLDOZE', 1, 0],
            parry_mode: 'CANCEL_REMAINING_TACTIC',
          },
          {
            cond1: ['TARGETS_CURR', '>=', 1],
            if_true: ['BULLDOZE', 1, 0],
            if_false: {
              $sweep: [
                ['NONE', 0, 0],
                ['ERODE', 1, 0],
              ],
            },
            parry_mode: 'CANCEL_SLOT_ONLY',
          },
        ],
      },
    ],
    learning_track: {
      initial_layout: { $sweep: ['6C_5B_CENTRE_COUPE', '6C_5B_ALTERNE', '5C_6B_PRESSION_BULL'] },
      eval_trigger_mode: {
        $sweep: ['MAJORITY_UNPARRIED', 'RATIO_SUCCESS_VS_FAIL', 'ON_CELL_CLEARED_EVENT'],
      },
      geom_move_mode: { $sweep: ['SWAP_TOWARD_7_OR_EDGES', 'FLIP_RECTO_VERSO'] },
    },
    scoring: {
      regen_mode: {
        $sweep: [
          'PISTE3_1_PER_CELL_WITH_STUMP',
          'PISTE3_INTACT_SOIL_ONLY',
          'PISTE3_UP_TO_K_IF_NO_BULLDOZE',
        ],
      },
      regen_max: 2,
    },
  },
];

function unwrapSweep<T>(val: Sweepable<T>): T[] {
  if (val && typeof val === 'object' && !Array.isArray(val) && '$sweep' in val) {
    return val.$sweep;
  }
  return [val as T];
}

/**
 * Compte le nombre exact de variantes générées par les balayages $sweep d'une famille de Niveau 2.
 */
export function countFamilySweepVariants(family: FamilySpecDSL): number {
  let count = 1;
  count *= unwrapSweep(family.arena.turns).length;
  count *= unwrapSweep(family.arena.dice_mode).length;
  count *= unwrapSweep(family.arena.biomes.mode).length;
  count *= unwrapSweep(family.arena.cell_weights).length;
  count *= unwrapSweep(family.arena.obstacles).length;
  count *= unwrapSweep(family.arena.end_of_track_mode).length;

  count *= unwrapSweep(family.machines_physics.break_rule).length;
  count *= unwrapSweep(family.machines_physics.break_penalty).length;
  count *= unwrapSweep(family.machines_physics.momentum_rule).length;
  if (family.machines_physics.doubles_rule) {
    count *= unwrapSweep(family.machines_physics.doubles_rule).length;
  }

  for (const tac of family.tactics) {
    count *= unwrapSweep(tac.wave_mode).length;
    for (const slot of tac.slots) {
      count *= unwrapSweep(slot.cond1[2]).length;
      if (slot.logic) count *= unwrapSweep(slot.logic).length;
      if (slot.cond2) count *= unwrapSweep(slot.cond2[2]).length;
      count *= unwrapSweep(slot.if_true).length;
      count *= unwrapSweep(slot.if_false).length;
      count *= unwrapSweep(slot.parry_mode).length;
    }
  }

  count *= unwrapSweep(family.learning_track.initial_layout).length;
  count *= unwrapSweep(family.learning_track.eval_trigger_mode).length;
  count *= unwrapSweep(family.learning_track.geom_move_mode).length;
  count *= unwrapSweep(family.scoring.regen_mode).length;

  return count;
}

/**
 * Compile une famille de Niveau 2 en une liste de génomes de Niveau 3 (Int32Array(447)).
 * Si maxVariants est fourni, échantillonne ou tronque proprement pour éviter l'explosion mémoire.
 */
export function compileFamilyToGenomes(
  family: FamilySpecDSL,
  maxVariants = 2500
): CompiledGenomeSpec[] {
  const axes: Array<{ name: string; values: any[] }> = [
    { name: 'turns', values: unwrapSweep(family.arena.turns) },
    { name: 'dice_mode', values: unwrapSweep(family.arena.dice_mode) },
    { name: 'biome_mode', values: unwrapSweep(family.arena.biomes.mode) },
    { name: 'cell_weights', values: unwrapSweep(family.arena.cell_weights) },
    { name: 'obstacles', values: unwrapSweep(family.arena.obstacles) },
    { name: 'end_of_track', values: unwrapSweep(family.arena.end_of_track_mode) },
    { name: 'break_rule', values: unwrapSweep(family.machines_physics.break_rule) },
    { name: 'break_penalty', values: unwrapSweep(family.machines_physics.break_penalty) },
    { name: 'momentum', values: unwrapSweep(family.machines_physics.momentum_rule) },
    { name: 'init_layout', values: unwrapSweep(family.learning_track.initial_layout) },
    { name: 'eval_trigger', values: unwrapSweep(family.learning_track.eval_trigger_mode) },
    { name: 'geom_move', values: unwrapSweep(family.learning_track.geom_move_mode) },
    { name: 'regen_mode', values: unwrapSweep(family.scoring.regen_mode) },
  ];

  // Axes de slots
  family.tactics.forEach((tac, tIdx) => {
    axes.push({ name: `t${tIdx}_wave`, values: unwrapSweep(tac.wave_mode) });
    tac.slots.forEach((slot, sIdx) => {
      axes.push({ name: `t${tIdx}s${sIdx}_c1v`, values: unwrapSweep(slot.cond1[2]) });
      axes.push({ name: `t${tIdx}s${sIdx}_logic`, values: unwrapSweep(slot.logic ?? 'NONE') });
      axes.push({
        name: `t${tIdx}s${sIdx}_c2v`,
        values: unwrapSweep(slot.cond2 ? slot.cond2[2] : 0),
      });
      axes.push({ name: `t${tIdx}s${sIdx}_true`, values: unwrapSweep(slot.if_true) });
      axes.push({ name: `t${tIdx}s${sIdx}_false`, values: unwrapSweep(slot.if_false) });
      axes.push({ name: `t${tIdx}s${sIdx}_parry`, values: unwrapSweep(slot.parry_mode) });
    });
  });

  // Génération cartésienne bornée par maxVariants
  const totalPossible = axes.reduce((acc, a) => acc * a.values.length, 1);
  const stride = totalPossible > maxVariants ? totalPossible / maxVariants : 1;
  const countToGenerate = Math.min(totalPossible, maxVariants);

  const results: CompiledGenomeSpec[] = [];

  for (let k = 0; k < countToGenerate; k++) {
    let comboIndex = Math.floor(k * stride);
    const chosen: Record<string, any> = {};
    for (let aIdx = axes.length - 1; aIdx >= 0; aIdx--) {
      const axis = axes[aIdx];
      const len = axis.values.length;
      chosen[axis.name] = axis.values[comboIndex % len];
      comboIndex = Math.floor(comboIndex / len);
    }

    const genome = new Int32Array(GENOME_SIZE);
    // Par défaut marquer les 6 tactiques comme inactives (-1)
    for (let t = 0; t < 6; t++) {
      genome[OFFSET_TACTICS + t * 64] = -1;
    }

    const symCap = family.arena.biomes.symmetric_cap || [2, 2, 2, 3, 3];
    const L_cells = Math.min(8, symCap.length);

    // 1. Header [0..9]
    genome[HDR_L_CELLS] = L_cells;
    genome[HDR_T_TURNS] = Number(chosen.turns);
    genome[HDR_DICE_MODE] = chosen.dice_mode === 'PER_TRACK_2D6' ? 1 : 0;
    genome[HDR_END_OF_TRACK_MODE] = END_OF_TRACK_TO_ID[chosen.end_of_track] ?? 0;
    genome[HDR_BREAK_RULE] = BREAK_RULE_TO_ID[chosen.break_rule] ?? 0;
    genome[HDR_BREAK_PENALTY] = BREAK_PENALTY_TO_ID[chosen.break_penalty] ?? 0;
    genome[HDR_MOMENTUM_RULE] = MOMENTUM_TO_ID[chosen.momentum] ?? 0;
    genome[HDR_DOUBLES_RULE] = 0;
    genome[HDR_REGEN_MODE] = REGEN_MODE_TO_ID[chosen.regen_mode] ?? 1;
    genome[HDR_REGEN_MAX] = family.scoring.regen_max ?? 1;

    // 2. Arena [10..34]
    const weights: number[] = chosen.cell_weights || [1, 1, 1, 1, 1];
    const obstacles: number[] = chosen.obstacles || [0, 0, 0, 0, 0];
    for (let c = 0; c < 8; c++) {
      genome[ARENA_CELL_CAP_START + c] = c < L_cells ? symCap[c] : 0;
      genome[ARENA_CELL_WEIGHTS_START + c] = c < weights.length ? weights[c] : 1;
      genome[ARENA_OBSTACLE_MASK_START + c] = c < obstacles.length ? obstacles[c] : 0;
    }
    genome[ARENA_BIOME_MODE] = chosen.biome_mode === 'ASYMMETRIC_BIOMES_12a' ? 1 : 0;

    // 3. Tactics [35..418]
    family.tactics.slice(0, 6).forEach((tac, tIdx) => {
      const tBase = OFFSET_TACTICS + tIdx * 64;
      genome[tBase + 0] = tac.machine === 'BULLDOZER' ? 1 : 0;
      genome[tBase + 1] = WAVE_MODE_TO_ID[chosen[`t${tIdx}_wave`]] ?? 0;
      genome[tBase + 2] = 0;
      genome[tBase + 3] = 0;

      tac.slots.slice(0, 4).forEach((slot, sIdx) => {
        const sBase = tBase + 4 + sIdx * 15;
        const c1Sensor = SENSOR_BY_CODE[slot.cond1[0]]?.id ?? 0;
        const c1Op = COMP_OP_TO_ID[slot.cond1[1]] ?? 0;
        const c1Val = Number(chosen[`t${tIdx}s${sIdx}_c1v`]);

        const logicCode = chosen[`t${tIdx}s${sIdx}_logic`] || 'NONE';
        const logicOp = LOGIC_OP_TO_ID[logicCode] ?? 0;

        const c2Sensor = slot.cond2 ? SENSOR_BY_CODE[slot.cond2[0]]?.id ?? 0 : 0;
        const c2Op = slot.cond2 ? COMP_OP_TO_ID[slot.cond2[1]] ?? 0 : 0;
        const c2Val = Number(chosen[`t${tIdx}s${sIdx}_c2v`]);

        const actTrue: [string, number, number] = chosen[`t${tIdx}s${sIdx}_true`];
        const actFalse: [string, number, number] = chosen[`t${tIdx}s${sIdx}_false`];
        const parryMode = PARRY_MODE_TO_ID[chosen[`t${tIdx}s${sIdx}_parry`]] ?? 1;

        genome[sBase + 0] = c1Sensor;
        genome[sBase + 1] = c1Op;
        genome[sBase + 2] = c1Val;
        genome[sBase + 3] = logicOp;
        genome[sBase + 4] = c2Sensor;
        genome[sBase + 5] = c2Op;
        genome[sBase + 6] = c2Val;
        genome[sBase + 7] = VERB_BY_CODE[actTrue[0]]?.id ?? 0;
        genome[sBase + 8] = Number(actTrue[1]);
        genome[sBase + 9] = Number(actTrue[2]);
        genome[sBase + 10] = VERB_BY_CODE[actFalse[0]]?.id ?? 0;
        genome[sBase + 11] = Number(actFalse[1]);
        genome[sBase + 12] = Number(actFalse[2]);
        genome[sBase + 13] = parryMode;
        genome[sBase + 14] = slot.parry_cost ?? 1;
      });
    });

    // 4. Learning Track [419..446]
    const layoutKey = chosen.init_layout as string;
    const layout = INITIAL_LAYOUTS_V2[layoutKey] || INITIAL_LAYOUTS_V2['6C_5B_CENTRE_COUPE'];
    for (let idx = 0; idx < 11; idx++) {
      genome[OFFSET_LEARNING + idx] = layout.recto[idx];
      genome[OFFSET_LEARNING + 11 + idx] = layout.verso[idx];
    }
    genome[OFFSET_LEARNING + 22] = EVAL_TRIGGER_TO_ID[chosen.eval_trigger] ?? 0;
    genome[OFFSET_LEARNING + 23] = 1; // threshold_val
    genome[OFFSET_LEARNING + 24] = 1; // shift_step_pos
    genome[OFFSET_LEARNING + 25] = 1; // shift_step_neg
    genome[OFFSET_LEARNING + 26] = chosen.eval_trigger === 'ON_CELL_CLEARED_EVENT' ? 1 : 0;
    genome[OFFSET_LEARNING + 27] = GEOM_MOVE_TO_ID[chosen.geom_move] ?? 0;

    const elig = isGenomeEligible(genome);
    if (!elig.valid) continue;

    const staticComplexity = computeStaticRuleComplexity(genome);
    const idNum = results.length + 1;
    const shortCode = `G${String(idNum).padStart(4, '0')}_T${genome[HDR_T_TURNS]}_${
      chosen.end_of_track.slice(0, 4)
    }_${chosen.regen_mode.replace('PISTE3_', '').slice(0, 6)}_${chosen.geom_move.slice(0, 4)}`;

    results.push({
      id: idNum,
      code: shortCode,
      familyId: family.family_id,
      genome,
      staticComplexity,
      summaryChoices: {
        turns: chosen.turns,
        biome_mode: chosen.biome_mode,
        end_of_track: chosen.end_of_track,
        break_rule: chosen.break_rule,
        momentum: chosen.momentum,
        eval_trigger: chosen.eval_trigger,
        geom_move: chosen.geom_move,
        regen_mode: chosen.regen_mode,
      },
    });
  }

  return results;
}

/**
 * Traducteur Automatique de Génome (447 int32) en Règle de Jeu Humaine (Français clair pour Playtest sur Table)
 */
export function translateGenomeToHumanRulebook(
  genome: Int32Array,
  code = 'Automate_V2'
): {
  title: string;
  setupSection: string[];
  physicsSection: string[];
  tacticsSection: Array<{ name: string; machine: string; slotsText: string[] }>;
  learningSection: string[];
  scoringSection: string[];
  markdown: string;
} {
  const L = genome[HDR_L_CELLS];
  const T = genome[HDR_T_TURNS];
  const diceMode = genome[HDR_DICE_MODE] === 1 ? '1 jet de 2D6 indépendant par joueur' : '1 jet de 2D6 global pour toute la table';
  const eotMode = END_OF_TRACK_MODES[genome[HDR_END_OF_TRACK_MODE]] || 'STOP';
  const breakRule = BREAK_RULES[genome[HDR_BREAK_RULE]] || 'NEVER';
  const breakPen = BREAK_PENALTIES[genome[HDR_BREAK_PENALTY]] || 'SKIP_NEXT_SLOT';
  const momentum = MOMENTUM_RULES[genome[HDR_MOMENTUM_RULE]] || 'NONE';
  const regenMode = REGEN_MODES[genome[HDR_REGEN_MODE]] || 'PISTE3_1_PER_CELL_WITH_STUMP';
  const regenMax = genome[HDR_REGEN_MAX];
  const biomeMode = genome[ARENA_BIOME_MODE];

  const caps: number[] = [];
  const weights: number[] = [];
  const obstacles: string[] = [];
  for (let c = 0; c < L; c++) {
    caps.push(genome[ARENA_CELL_CAP_START + c]);
    weights.push(genome[ARENA_CELL_WEIGHTS_START + c]);
    const obs = genome[ARENA_OBSTACLE_MASK_START + c];
    if (obs === 1) obstacles.push(`Rivière entre Case ${c + 1} et Case ${c + 2} (2 impulsions d'avancée requises)`);
    if (obs === 2) obstacles.push(`Pont Logistique en Case ${c + 1} (l'Abatteuse attend que le Bulldozer la rejoigne)`);
  }

  const setupSection = [
    `Durée de la partie : ${T} tours complets (${diceMode}).`,
    biomeMode === 1
      ? `Topologie par joueur (${L} cases) : Biomes Asymétriques à 12 arbres (Clairière-Jungle [1,1,2,4,4], Mur Végétal [4,3,2,2,1], Vallée [2,3,2,3,2], Bosquet [2,2,4,2,2]).`
      : `Topologie symétrique (${L} cases de la Lisière au Sanctuaire) : [${caps.join(', ')}] Arbres debout par case.`,
    `Pondération spatiale des cases : [${weights.join(', ')}] point(s) par Arbre sauvé.`,
    obstacles.length > 0 ? `Obstacles naturels : ${obstacles.join(' ; ')}.` : `Obstacles naturels : Aucun (couloirs dégagés).`,
  ];

  const eotDescriptions: Record<string, string> = {
    STOP: "En bout de piste (Sanctuaire), toute action [Avancer] échoue et déclenche son action de repli éventuelle.",
    BOUNCE: "En bout de piste, la machine rebondit et repart en sens inverse vers la Lisière.",
    BOUNCE_AND_FLIP_ROLE: "En bout de piste, l'Abatteuse rebondit vers la Lisière et se retourne en mode Bulldozer.",
    LOOP_TO_START: "En bout de piste, la machine est ramenée sur la première case non vide depuis la Lisière.",
  };

  const breakDescriptions: Record<string, string> = {
    NEVER: 'Aucune casse mécanique des machines.',
    ON_2_PARRIES_IN_TURN: `Si une machine subit 2 parades dans le même tour, elle tombe en panne (${breakPen}).`,
    ON_PARRY_DURING_DOUBLE: `Si une machine est parée lors d'un Double aux dés, elle tombe en panne (${breakPen}).`,
    ON_PARRY_WHEN_CELL_EMPTY: `Si une machine est parée sur une case vide de cibles, elle tombe en panne (${breakPen}).`,
  };

  const physicsSection = [
    `Invariant de couloir : Le Bulldozer ne dépasse jamais l'Abatteuse tant qu'elle progresse vers le Sanctuaire.`,
    eotDescriptions[eotMode] || eotMode,
    breakDescriptions[breakRule] || breakRule,
    momentum === 'ACTIVE'
      ? "Élan mécanique ACTIF : Une machine qui réussit au moins 1 action sans subir de parade gagne le jeton [Lancée] (+1 dégât sur son Slot 1 au tour suivant). Une seule parade brise l'élan."
      : 'Élan mécanique : Désactivé (régime constant).',
  ];

  const formatVerb = (vId: number, qty: number, offset: number): string => {
    const vCode = VERBS[vId]?.code || 'NONE';
    const offStr = offset === 0 ? 'sur sa case' : offset > 0 ? `à +${offset} case(s)` : `à ${offset} case(s)`;
    switch (vCode) {
      case 'NONE':
        return 'Rien (Patinage à vide)';
      case 'CUT':
        return `Couper ${qty} Arbre(s) en Souche(s) ${offStr}`;
      case 'BULLDOZE':
        return `Terrasser ${qty} Souche(s) ${offStr}`;
      case 'ERODE':
        return `Éroder directement ${qty} Arbre(s) en Zone Terrassée ${offStr}`;
      case 'ADVANCE':
        return `Avancer de ${qty} case(s)`;
      case 'RETREAT':
        return `Reculer de ${qty} case(s) vers la Lisière`;
      case 'CALL_PARTNER':
        return `Faire avancer la machine partenaire de ${qty} case(s)`;
      case 'SET_STATUS':
        return `Passer le statut mécanique à ${qty}`;
      case 'SHIFT_TRACK':
        return `Glisser la tuile active de ${qty} case(s) vers le 7`;
      default:
        return vCode;
    }
  };

  const parryLabels: Record<number, string> = {
    0: 'Imparable',
    1: '1 Parade annule ce Slot uniquement',
    2: '1 Parade annule ce Slot ET stoppe le reste de la tuile',
    3: '1 Parade réduit la quantité de 1 unité',
  };

  const tacticsSection: Array<{ name: string; machine: string; slotsText: string[] }> = [];
  const tacticNames = [
    'Tuile C1 (Abatteuse I)',
    'Tuile C2 (Abatteuse II)',
    'Tuile B1 (Bulldozer I)',
    'Tuile B2 (Bulldozer II)',
    'Tuile Spéciale 5',
    'Tuile Spéciale 6',
  ];

  for (let t = 0; t < 6; t++) {
    const tBase = OFFSET_TACTICS + t * 64;
    const mType = genome[tBase];
    if (mType < 0) continue;
    const machineLabel = mType === 1 ? 'BULLDOZER' : 'ABATTEUSE';
    const slotsText: string[] = [];

    for (let s = 0; s < 4; s++) {
      const sBase = tBase + 4 + s * 15;
      const c1S = genome[sBase + 0];
      const c1Op = COMP_OPS[genome[sBase + 1]] || '>=';
      const c1Val = genome[sBase + 2];
      const logicOp = LOGIC_OPS[genome[sBase + 3]] || 'NONE';
      const c2S = genome[sBase + 4];
      const c2Op = COMP_OPS[genome[sBase + 5]] || '>=';
      const c2Val = genome[sBase + 6];
      const vTrue = genome[sBase + 7];
      const qTrue = genome[sBase + 8];
      const oTrue = genome[sBase + 9];
      const vFalse = genome[sBase + 10];
      const qFalse = genome[sBase + 11];
      const oFalse = genome[sBase + 12];
      const pMode = genome[sBase + 13];

      if (vTrue === 0 && vFalse === 0) continue;

      let condStr =
        c1S === 0
          ? 'Toujours'
          : `Si ${SENSORS[c1S]?.code || 'CAPTEUR'} ${c1Op} ${c1Val}`;
      if (logicOp !== 'NONE') {
        condStr += ` ${logicOp} ${SENSORS[c2S]?.code || 'CAPTEUR'} ${c2Op} ${c2Val}`;
      }

      const trueStr = formatVerb(vTrue, qTrue, oTrue);
      const falseStr = vFalse !== 0 ? ` — Sinon : ${formatVerb(vFalse, qFalse, oFalse)}` : '';
      slotsText.push(
        `Slot ${s + 1} : ${condStr} → ${trueStr}${falseStr} [${parryLabels[pMode] || 'Parade standard'}].`
      );
    }

    tacticsSection.push({
      name: tacticNames[t] || `Tuile ${t + 1}`,
      machine: machineLabel,
      slotsText,
    });
  }

  const evalTrigger = EVAL_TRIGGER_MODES[genome[OFFSET_LEARNING + 22]] || 'MAJORITY_UNPARRIED';
  const geomMove = GEOM_MOVE_MODES[genome[OFFSET_LEARNING + 27]] || 'SWAP_TOWARD_7_OR_EDGES';
  const trackInit: string[] = [];
  const tLabels = ['C1', 'C2', 'B1', 'B2', 'T5', 'T6'];
  for (let i = 0; i < 11; i++) {
    trackInit.push(`${i + 2}:${tLabels[genome[OFFSET_LEARNING + i]] || 'C1'}`);
  }

  const learningSection = [
    `Disposition initiale 2D6 (Sommes 2 à 12) : [ ${trackInit.join(' | ')} ].`,
    `Condition de succès du tour (${evalTrigger}) : ${
      evalTrigger === 'MAJORITY_UNPARRIED'
        ? 'Succès si au moins la moitié des joueurs ne fait aucune parade ce tour.'
        : evalTrigger === 'ON_CELL_CLEARED_EVENT'
        ? "Promotion immédiate d'une tuile Bulldozer vers le 7 dès qu'une case perd son dernier Arbre."
        : 'Succès si le nombre d’actions réussies par la machine est supérieur ou égal aux échecs/parades.'
    }`,
    `Mouvement sur la piste (${geomMove}) : ${
      geomMove === 'FLIP_RECTO_VERSO'
        ? 'Retournement Recto-Verso sur place de la tuile active (Abatteuse <-> Bulldozer) en 1 seul geste physique.'
        : 'Échange de la tuile active d’un cran vers le 7 central en cas de succès, ou refoulement vers les ailes (2 ou 12) en cas d’échec.'
    }`,
  ];

  const regenText: Record<string, string> = {
    NONE: 'Aucun redressement de souche : seuls les Arbres debout en fin de partie rapportent des points.',
    PISTE3_1_PER_CELL_WITH_STUMP:
      'Piste 3 (1 Souche / Case) : En fin de partie, sur chaque case contenant au moins 1 Souche, redressez 1 Souche en Arbre debout.',
    PISTE3_INTACT_SOIL_ONLY:
      "Piste 3 (Sol Intact) : Sur chaque case ayant au moins 1 Souche ET n'ayant subi aucun Terrassement (0 Zone Terrassée), redressez 1 Souche en Arbre.",
    PISTE3_UP_TO_K_IF_NO_BULLDOZE: `Piste 3 Étendue : Redressez jusqu'à ${regenMax} Souches par case non terrassée par le Bulldozer.`,
  };

  const scoringSection = [
    regenText[regenMode] || regenMode,
    `Score final de la table : Somme des Arbres debout (après redressement Piste 3) multipliés par le poids de leur case, divisée par le total initial.`,
  ];

  const mdLines = [
    `# Fiche de Règles Playtest — \`${code}\``,
    `**Complexité Syntaxique Statique ($C_{\\text{règle}}$) :** \`${computeStaticRuleComplexity(genome)}\` op.`,
    ``,
    `## 1. Mise en Place & Topologie de l'Arène`,
    ...setupSection.map((s) => `- ${s}`),
    ``,
    `## 2. Lois Physiques du Tandem (Abatteuse & Bulldozer)`,
    ...physicsSection.map((s) => `- ${s}`),
    ``,
    `## 3. Les Tuiles Tactiques de l'Automate`,
    ...tacticsSection.flatMap((t) => [
      `### ${t.name} — Machine : ${t.machine}`,
      ...t.slotsText.map((st) => `  - ${st}`),
    ]),
    ``,
    `## 4. Piste d'Apprentissage 2D6 (Sommes 2 à 12)`,
    ...learningSection.map((s) => `- ${s}`),
    ``,
    `## 5. Décompte de Fin de Partie (Système Piste 3)`,
    ...scoringSection.map((s) => `- ${s}`),
  ];

  return {
    title: `Fiche de Règles Playtest — ${code}`,
    setupSection,
    physicsSection,
    tacticsSection,
    learningSection,
    scoringSection,
    markdown: mdLines.join('\n'),
  };
}

/**
 * Exporte un génome de 447 entiers sous forme d'objet YAML/JSON autonome de Niveau 2.
 */
export function exportGenomeToLevel2Yaml(genome: Int32Array, code: string): string {
  const L = genome[HDR_L_CELLS];
  const caps = Array.from(genome.slice(ARENA_CELL_CAP_START, ARENA_CELL_CAP_START + L));
  const weights = Array.from(genome.slice(ARENA_CELL_WEIGHTS_START, ARENA_CELL_WEIGHTS_START + L));
  const obs = Array.from(genome.slice(ARENA_OBSTACLE_MASK_START, ARENA_OBSTACLE_MASK_START + L));

  const lines: string[] = [
    `# Automate Niveau 2 exporté depuis Forêt Automate Lab v2`,
    `family_id: "${code}"`,
    `description: "Variante autonome exportée (Génome 447 int32)"`,
    ``,
    `arena:`,
    `  turns: ${genome[HDR_T_TURNS]}`,
    `  dice_mode: "${genome[HDR_DICE_MODE] === 1 ? 'PER_TRACK_2D6' : 'GLOBAL_2D6'}"`,
    `  biomes:`,
    `    mode: "${genome[ARENA_BIOME_MODE] === 1 ? 'ASYMMETRIC_BIOMES_12a' : 'SYMMETRIC_5c_12a'}"`,
    `    symmetric_cap: [${caps.join(', ')}]`,
    `  cell_weights: [${weights.join(', ')}]`,
    `  obstacles: [${obs.join(', ')}]`,
    `  end_of_track_mode: "${END_OF_TRACK_MODES[genome[HDR_END_OF_TRACK_MODE]] || 'STOP'}"`,
    ``,
    `machines_physics:`,
    `  break_rule: "${BREAK_RULES[genome[HDR_BREAK_RULE]] || 'NEVER'}"`,
    `  break_penalty: "${BREAK_PENALTIES[genome[HDR_BREAK_PENALTY]] || 'SKIP_NEXT_SLOT'}"`,
    `  momentum_rule: "${MOMENTUM_RULES[genome[HDR_MOMENTUM_RULE]] || 'NONE'}"`,
    ``,
    `tactics:`,
  ];

  for (let t = 0; t < 6; t++) {
    const tBase = OFFSET_TACTICS + t * 64;
    const mType = genome[tBase];
    if (mType < 0) continue;
    lines.push(`  - id: "Tactique_${t + 1}"`);
    lines.push(`    machine: "${mType === 1 ? 'BULLDOZER' : 'ABATTEUSE'}"`);
    lines.push(`    wave_mode: "${WAVE_MODES[genome[tBase + 1]] || 'ALL_TRACKS'}"`);
    lines.push(`    slots:`);
    for (let s = 0; s < 4; s++) {
      const sBase = tBase + 4 + s * 15;
      const vTrue = genome[sBase + 7];
      const vFalse = genome[sBase + 10];
      if (vTrue === 0 && vFalse === 0) continue;
      const c1S = SENSORS[genome[sBase + 0]]?.code || 'ALWAYS';
      const c1Op = COMP_OPS[genome[sBase + 1]] || '>=';
      const c1Val = genome[sBase + 2];
      const vtCode = VERBS[vTrue]?.code || 'NONE';
      const vfCode = VERBS[vFalse]?.code || 'NONE';
      const pMode = PARRY_MODES[genome[sBase + 13]] || 'CANCEL_SLOT_ONLY';
      lines.push(`      - cond1: ["${c1S}", "${c1Op}", ${c1Val}]`);
      lines.push(`        if_true: ["${vtCode}", ${genome[sBase + 8]}, ${genome[sBase + 9]}]`);
      lines.push(`        if_false: ["${vfCode}", ${genome[sBase + 11]}, ${genome[sBase + 12]}]`);
      lines.push(`        parry_mode: "${pMode}"`);
    }
  }

  lines.push(``);
  lines.push(`learning_track:`);
  lines.push(
    `  eval_trigger_mode: "${EVAL_TRIGGER_MODES[genome[OFFSET_LEARNING + 22]] || 'MAJORITY_UNPARRIED'}"`
  );
  lines.push(
    `  geom_move_mode: "${GEOM_MOVE_MODES[genome[OFFSET_LEARNING + 27]] || 'SWAP_TOWARD_7_OR_EDGES'}"`
  );
  lines.push(``);
  lines.push(`scoring:`);
  lines.push(`  regen_mode: "${REGEN_MODES[genome[HDR_REGEN_MODE]] || 'PISTE3_1_PER_CELL_WITH_STUMP'}"`);
  lines.push(`  regen_max: ${genome[HDR_REGEN_MAX]}`);

  return lines.join('\n');
}
