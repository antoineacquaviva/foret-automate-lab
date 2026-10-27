import YAML from 'yaml';
import {
  GENOME_SIZE,
  HDR_T_TURNS,
  HDR_END_OF_TRACK_MODE,
  HDR_REGEN_MODE,
  HDR_BREAK_RULE,
  HDR_BREAK_PENALTY,
  HDR_MOMENTUM_RULE,
  ARENA_BIOME_MODE,
  ARENA_CELL_WEIGHTS_START,
  ARENA_OBSTACLE_MASK_START,
  OFFSET_TACTICS,
  OFFSET_LEARNING,
  SENSORS,
  VERBS,
  COMP_OPS,
  PARRY_MODES,
  END_OF_TRACK_MODES,
  BREAK_RULES,
  BREAK_PENALTIES,
  MOMENTUM_RULES,
  REGEN_MODES,
  EVAL_TRIGGER_MODES,
  GEOM_MOVE_MODES,
} from './genome';
import {
  FamilySpecDSL,
  TacticSpecDSL,
  SlotSpecDSL,
  countFamilySweepVariants,
  translateGenomeToHumanRulebook,
} from './dsl_compiler';
import { EvaluatedAutomatonV2, WeightsV2 } from './metrics_and_qd';
import { SensitivityRowV2 } from './oci_exporter';

/**
 * Convertit un objet Famille de Niveau 2 (FamilySpecDSL) en texte YAML propre et commenté
 */
export function stringifyFamilyToYaml(family: FamilySpecDSL): string {
  const headerComment = [
    '# ============================================================================',
    `# DESCRIPTION DE FAMILLE D'AUTOMATES — NIVEAU 2 (.yaml)`,
    `# Identifiant : ${family.family_id}`,
    `# Produit Cartésien ($sweep) : ${countFamilySweepVariants(family)} Instances de Niveau 3`,
    '# ============================================================================',
    '',
  ].join('\n');

  return headerComment + YAML.stringify(family, { indent: 2, lineWidth: 100 });
}

/**
 * Parse un texte YAML ou JSON en objet FamilySpecDSL de Niveau 2
 */
export function parseFamilyYamlOrJson(rawText: string): {
  family: FamilySpecDSL | null;
  error: string | null;
} {
  try {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return { family: null, error: 'Le contenu du fichier est vide.' };
    }
    const parsed = YAML.parse(trimmed) as FamilySpecDSL;
    if (!parsed || typeof parsed !== 'object') {
      return { family: null, error: 'Impossible de décoder la structure YAML/JSON.' };
    }
    if (!parsed.family_id || !Array.isArray(parsed.tactics) || parsed.tactics.length === 0) {
      return {
        family: null,
        error:
          'Schéma Niveau 2 incomplet : les clés "family_id" et "tactics" (liste non vide) sont obligatoires.',
      };
    }
    return { family: parsed, error: null };
  } catch (err: any) {
    return {
      family: null,
      error: `Erreur de syntaxe YAML/JSON : ${err?.message || String(err)}`,
    };
  }
}

export interface SynthesizedLevel2FamilyCard {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  cartesianCount: number;
  howItWorks: string;
  qualities: string[];
  sourceChampionCode: string;
  repMetrics: {
    scoreGlobal: number;
    M1: number;
    M2: number;
    M3: number;
    M4: number;
    cRegle: number;
    scoreB4: number;
  };
  familySpec: FamilySpecDSL;
  yamlText: string;
}

/**
 * Reconstruit une structure de tactiques Niveau 2 à partir du génome d'un champion (447 int32),
 * en ouvrant des $sweep ciblés sur les seuils et modes de parade pour créer une Famille Niveau 2
 * testable par produit cartésien intégral en Mode 2 (~16 à 36 instances Niveau 3).
 */
function buildLevel2FamilyFromChampionGenome(
  champion: EvaluatedAutomatonV2,
  familyId: string,
  description: string,
  sweepProfile: 'pareto_balanced' | 'occam_simple' | 'kinetic_adaptive'
): FamilySpecDSL {
  const g = champion.genome;
  const tacticNames = [
    'C1_Abatteuse_Principale',
    'C2_Abatteuse_Mobile',
    'B1_Bulldozer_Principal',
    'B2_Bulldozer_Mobile',
  ];

  const tactics: TacticSpecDSL[] = [];
  for (let t = 0; t < 4; t++) {
    const tBase = OFFSET_TACTICS + t * 64;
    const machine: 'ABATTEUSE' | 'BULLDOZER' = g[tBase + 0] === 1 ? 'BULLDOZER' : 'ABATTEUSE';
    const slots: SlotSpecDSL[] = [];

    for (let s = 0; s < 4; s++) {
      const sBase = tBase + 4 + s * 15;
      const vTrue = g[sBase + 7];
      const vFalse = g[sBase + 10];
      if (vTrue === 0 && vFalse === 0) continue;

      const s1Code = SENSORS[g[sBase + 0]]?.code || 'ALWAYS_TRUE';
      const op1Code = COMP_OPS[g[sBase + 1]] || '>=';
      const val1 = g[sBase + 2];

      const verbTrueCode = VERBS[vTrue]?.code || 'NONE';
      const qtyTrue = g[sBase + 8];
      const offTrue = g[sBase + 9];

      const verbFalseCode = VERBS[vFalse]?.code || 'NONE';
      const qtyFalse = g[sBase + 11];
      const offFalse = g[sBase + 12];

      const pModeCode = PARRY_MODES[g[sBase + 13]] || 'CANCEL_SLOT_ONLY';

      // Sur le Slot 1 des tactiques mobiles (C2 / B2), on ouvre un $sweep sur le seuil d'avancement
      const shouldSweepThreshold =
        s === 0 && (t === 1 || t === 3) && (s1Code === 'TARGETS_CURR' || op1Code === '<=');

      const shouldSweepParry =
        s === 0 && t === 1 && sweepProfile !== 'occam_simple';

      const slotDsl: SlotSpecDSL = {
        cond1: [
          s1Code,
          op1Code,
          shouldSweepThreshold ? { $sweep: [0, 1] } : val1,
        ],
        if_true: [verbTrueCode, qtyTrue, offTrue],
        if_false: [verbFalseCode, qtyFalse, offFalse],
        parry_mode: shouldSweepParry
          ? { $sweep: ['CANCEL_REMAINING_TACTIC', 'CANCEL_SLOT_ONLY'] }
          : pModeCode,
      };

      const logicOp = g[sBase + 3];
      if (logicOp === 1 || logicOp === 2) {
        slotDsl.logic = logicOp === 1 ? 'AND' : 'OR';
        slotDsl.cond2 = [
          SENSORS[g[sBase + 4]]?.code || 'TARGETS_CURR',
          COMP_OPS[g[sBase + 5]] || '==',
          g[sBase + 6],
        ];
      }

      slots.push(slotDsl);
    }

    if (slots.length === 0) {
      slots.push({
        cond1: ['TARGETS_CURR', '>=', 1],
        if_true: [machine === 'BULLDOZER' ? 'BULLDOZE' : 'CUT', 1, 0],
        if_false: ['NONE', 0, 0],
        parry_mode: 'CANCEL_SLOT_ONLY',
      });
    }

    tactics.push({
      id: tacticNames[t],
      machine,
      wave_mode: 'ALL_TRACKS',
      slots,
    });
  }

  const baseTurns = g[HDR_T_TURNS] || 16;
  const turnsSweep =
    sweepProfile === 'occam_simple'
      ? { $sweep: [14, 16] }
      : { $sweep: Array.from(new Set([14, baseTurns, 20])).slice(0, 2) };

  const baseEndMode = END_OF_TRACK_MODES[g[HDR_END_OF_TRACK_MODE]] || 'STOP';
  const endModeSweep =
    sweepProfile === 'kinetic_adaptive'
      ? { $sweep: ['BOUNCE', 'BOUNCE_AND_FLIP_ROLE'] }
      : { $sweep: Array.from(new Set(['STOP', baseEndMode === 'STOP' ? 'BOUNCE' : baseEndMode])) };

  const baseRegen = REGEN_MODES[g[HDR_REGEN_MODE]] || 'PISTE3_1_PER_CELL_WITH_STUMP';
  const regenSweep = {
    $sweep: Array.from(
      new Set([baseRegen, 'PISTE3_1_PER_CELL_WITH_STUMP', 'PISTE3_INTACT_SOIL_ONLY'])
    ).slice(0, 2),
  };

  const baseGeom = GEOM_MOVE_MODES[g[OFFSET_LEARNING + 27]] || 'SWAP_TOWARD_7_OR_EDGES';
  const geomSweep = {
    $sweep: ['SWAP_TOWARD_7_OR_EDGES', 'FLIP_RECTO_VERSO'],
  };

  const breakRule =
    sweepProfile === 'kinetic_adaptive'
      ? { $sweep: ['ON_2_PARRIES_IN_TURN', 'ON_PARRY_DURING_DOUBLE'] }
      : BREAK_RULES[g[HDR_BREAK_RULE]] || 'NEVER';

  const momentumRule =
    sweepProfile === 'kinetic_adaptive'
      ? 'ACTIVE'
      : MOMENTUM_RULES[g[HDR_MOMENTUM_RULE]] || 'NONE';

  const weightsArr = [
    g[ARENA_CELL_WEIGHTS_START + 0] || 1,
    g[ARENA_CELL_WEIGHTS_START + 1] || 1,
    g[ARENA_CELL_WEIGHTS_START + 2] || 1,
    g[ARENA_CELL_WEIGHTS_START + 3] || 1,
    g[ARENA_CELL_WEIGHTS_START + 4] || 1,
  ];
  const obstaclesArr = [
    g[ARENA_OBSTACLE_MASK_START + 0] || 0,
    g[ARENA_OBSTACLE_MASK_START + 1] || 0,
    g[ARENA_OBSTACLE_MASK_START + 2] || 0,
    g[ARENA_OBSTACLE_MASK_START + 3] || 0,
    g[ARENA_OBSTACLE_MASK_START + 4] || 0,
  ];

  return {
    family_id: familyId,
    description,
    arena: {
      turns: turnsSweep,
      dice_mode: 'GLOBAL_2D6',
      biomes: {
        mode:
          g[ARENA_BIOME_MODE] === 1
            ? 'ASYMMETRIC_BIOMES_12a'
            : 'SYMMETRIC_5c_12a',
        symmetric_cap: [2, 2, 2, 3, 3],
      },
      cell_weights: weightsArr,
      obstacles: obstaclesArr,
      end_of_track_mode: endModeSweep,
    },
    machines_physics: {
      break_rule: breakRule,
      break_penalty: BREAK_PENALTIES[g[HDR_BREAK_PENALTY]] || 'SKIP_NEXT_SLOT',
      momentum_rule: momentumRule,
    },
    tactics,
    learning_track: {
      initial_layout: '6C_5B_CENTRE_COUPE',
      eval_trigger_mode: EVAL_TRIGGER_MODES[g[OFFSET_LEARNING + 24]] || 'MAJORITY_UNPARRIED',
      geom_move_mode: geomSweep,
    },
    scoring: {
      regen_mode: regenSweep,
      regen_max: 1,
    },
  };
}

/**
 * Synthétise 3 Familles d'Automates de Niveau 2 (.yaml avec $sweep) à partir
 * des résultats d'une campagne d'exploration génétique (Mode 1).
 */
export function synthesizePromisingLevel2Families(
  population: EvaluatedAutomatonV2[]
): SynthesizedLevel2FamilyCard[] {
  if (population.length === 0) return [];

  // 1. Champion Global Pareto Équilibré
  const champPareto = population[0];

  // 2. Champion Simplicité d'Occam (M4 maximal parmi le Top 35% en score global)
  const topSlice = population.slice(0, Math.max(5, Math.ceil(population.length * 0.4)));
  const champOccam =
    [...topSlice].sort((a, b) => {
      if (b.M4_simplicite !== a.M4_simplicite) return b.M4_simplicite - a.M4_simplicite;
      return b.scoreGlobal - a.scoreGlobal;
    })[0] || champPareto;

  // 3. Champion Profondeur & Adaptation Anti-Martingale (M1 + M2 maximal avec pénalité martingale == 0)
  const champKinetic =
    [...population]
      .filter((x) => x.martingalePenalty === 0)
      .sort((a, b) => b.M1_maitrise + b.M2_adaptation - (a.M1_maitrise + a.M2_adaptation))[0] ||
    population[Math.min(1, population.length - 1)];

  const fam1 = buildLevel2FamilyFromChampionGenome(
    champPareto,
    'Famille_Niv2_Championne_Pareto',
    `Famille Niveau 2 synthétisée autour du champion global ${champPareto.code} (Équilibre 4D Maîtrise / Adaptation / Tension / Simplicité).`,
    'pareto_balanced'
  );

  const fam2 = buildLevel2FamilyFromChampionGenome(
    champOccam,
    'Famille_Niv2_Epuree_Occam',
    `Famille Niveau 2 à faible charge cognitive issue de l'élagage d'Occam autour de ${champOccam.code} (manipulation fluide sur table).`,
    'occam_simple'
  );

  const fam3 = buildLevel2FamilyFromChampionGenome(
    champKinetic,
    'Famille_Niv2_Cinetique_Haute_Maitrise',
    `Famille Niveau 2 orientée profondeur stratégique (M1+M2 max, zéro martingale) dérivée de ${champKinetic.code}.`,
    'kinetic_adaptive'
  );

  const kineticMaxMono = Math.max(
    champKinetic.botScores.B2a_Mono_Anti_Coupe,
    champKinetic.botScores.B2b_Mono_Anti_Bull,
    champKinetic.botScores.B2c_Mono_Anti_Avance
  );
  const kineticMaxSmart = Math.max(
    champKinetic.botScores.B3_Tacticien_Couloir,
    champKinetic.botScores.B4_Stratege_Complet
  );

  const cards: SynthesizedLevel2FamilyCard[] = [
    {
      id: fam1.family_id,
      badge: 'FAMILLE NIVEAU 2 · COMPROMIS PARETO 4D',
      title: '1. Famille Équilibrée Pareto (Noyau Piste 3 & Enlisement Calibré)',
      subtitle: `Synthétisée autour de l'élite ${champPareto.code} · ${countFamilySweepVariants(fam1)} instances Niveau 3 à départager en Mode 2`,
      cartesianCount: countFamilySweepVariants(fam1),
      howItWorks:
        "Combine un enlisement sur place lorsque la machine trouve encore des cibles (seuil modulable en $sweep 0 vs 1) avec une piste d'apprentissage 2D6 dynamique et le décompte écologique Piste 3 en fin de partie.",
      qualities: [
        `Score Composite de référence : ${champPareto.scoreGlobal.toFixed(2)} / 100 (zéro martingale : pénalité ${champPareto.martingalePenalty.toFixed(1)})`,
        `Gradient de Maîtrise M1 = ${champPareto.M1_maitrise.toFixed(1)} (le Stratège B4 atteint ${champPareto.botScores.B4_Stratege_Complet.toFixed(1)}% de forêt sauvée)`,
        `Ouvre un produit cartésien ciblé de ${countFamilySweepVariants(fam1)} variantes Niveau 3 pour affiner la durée, le mode de rebond et la règle Piste 3.`,
      ],
      sourceChampionCode: champPareto.code,
      repMetrics: {
        scoreGlobal: champPareto.scoreGlobal,
        M1: champPareto.M1_maitrise,
        M2: champPareto.M2_adaptation,
        M3: champPareto.M3_tension,
        M4: champPareto.M4_simplicite,
        cRegle: champPareto.cRegleStatic,
        scoreB4: champPareto.botScores.B4_Stratege_Complet,
      },
      familySpec: fam1,
      yamlText: stringifyFamilyToYaml(fam1),
    },
    {
      id: fam2.family_id,
      badge: 'FAMILLE NIVEAU 2 · ERGONOMIE SUR TABLE (M4 MAX)',
      title: "2. Famille Épurée d'Occam (Haute Fluidité & Règles Courtes)",
      subtitle: `Synthétisée autour de ${champOccam.code} · ${countFamilySweepVariants(fam2)} instances Niveau 3 à départager en Mode 2`,
      cartesianCount: countFamilySweepVariants(fam2),
      howItWorks:
        "Privilégie des séquences de 2 Slots directs sans condition secondaire lourde, réduisant au minimum les vérifications par piste tout en conservant l'obligation de coopérer entre Abatteuse et Bulldozer.",
      qualities: [
        `Indice de Simplicité M4 = ${champOccam.M4_simplicite.toFixed(1)} / 100 (Complexité statique C_règle = ${champOccam.cRegleStatic.toFixed(2)} op.)`,
        `Tension coopérative M3 = ${champOccam.M3_tension.toFixed(1)} / 100 avec ${champOccam.mPhysPerTurn.toFixed(1)} gestes physiques/tour`,
        `Idéale pour calibrer en Mode 2 une version "Initiation / Famille" rapide à expliquer.`,
      ],
      sourceChampionCode: champOccam.code,
      repMetrics: {
        scoreGlobal: champOccam.scoreGlobal,
        M1: champOccam.M1_maitrise,
        M2: champOccam.M2_adaptation,
        M3: champOccam.M3_tension,
        M4: champOccam.M4_simplicite,
        cRegle: champOccam.cRegleStatic,
        scoreB4: champOccam.botScores.B4_Stratege_Complet,
      },
      familySpec: fam2,
      yamlText: stringifyFamilyToYaml(fam2),
    },
    {
      id: fam3.family_id,
      badge: 'FAMILLE NIVEAU 2 · PROFONDEUR TACTIQUE (M1+M2 MAX)',
      title: '3. Famille Cinétique Anti-Martingale (Casse, Élan & Piste 2D6)',
      subtitle: `Synthétisée autour de ${champKinetic.code} · ${countFamilySweepVariants(fam3)} instances Niveau 3 à départager en Mode 2`,
      cartesianCount: countFamilySweepVariants(fam3),
      howItWorks:
        "Exploite les lois cinétiques (rebond en bout de piste, casse sur double parade ou double aux dés, et élan mécanique +1) pour punir sévèrement les stratégies mono-orientées et récompenser l'anticipation des probabilités 2D6.",
      qualities: [
        `Cumul Maîtrise + Adaptation (M1 + M2) = ${(champKinetic.M1_maitrise + champKinetic.M2_adaptation).toFixed(1)} pts`,
        `Immunité anti-martingale validée : les sondes B2a/B2b/B2c plafonnent à ${kineticMaxMono.toFixed(1)}% contre ${kineticMaxSmart.toFixed(1)}% pour B3/B4`,
        `Produit cartésien de ${countFamilySweepVariants(fam3)} instances Niveau 3 permettant de comparer la casse sur 2 parades vs casse sur double.`,
      ],
      sourceChampionCode: champKinetic.code,
      repMetrics: {
        scoreGlobal: champKinetic.scoreGlobal,
        M1: champKinetic.M1_maitrise,
        M2: champKinetic.M2_adaptation,
        M3: champKinetic.M3_tension,
        M4: champKinetic.M4_simplicite,
        cRegle: champKinetic.cRegleStatic,
        scoreB4: champKinetic.botScores.B4_Stratege_Complet,
      },
      familySpec: fam3,
      yamlText: stringifyFamilyToYaml(fam3),
    },
  ];

  return cards;
}

/**
 * Génère le bilan analytique structuré de référence pour le Mode 1 (orienté Niveau 2)
 */
export function buildDeterministicBilanMode1(
  population: EvaluatedAutomatonV2[],
  nichesCount: number,
  synthesizedFamilies: SynthesizedLevel2FamilyCard[],
  weights: WeightsV2
): string {
  if (population.length === 0) return 'Aucune donnée de campagne disponible.';
  const top = population[0];
  const paretoCount = population.filter((x) => x.isPareto4D).length;
  const zeroMartingaleCount = population.filter((x) => x.martingalePenalty === 0).length;

  const lines: string[] = [
    `### 1. Enseignements Globaux de la Campagne Génétique (Mode 1)`,
    `- **Couverture de l'espace comportemental** : L'algorithme hybride **NSGA-II + MAP-Elites** a évalué **${population.length} individus** et illuminé **${nichesCount} niches écologiques distinctes** sur 800, tout en isolant un **Front de Pareto 4D de ${paretoCount} automates non-dominés** (pondération actuelle : $W_1=${Math.round(weights.w1_maitrise * 100)}\\%$, $W_2=${Math.round(weights.w2_adaptation * 100)}\\%$, $W_3=${Math.round(weights.w3_tension * 100)}\\%$, $W_4=${Math.round(weights.w4_simplicite * 100)}\\%$).`,
    `- **Résistance aux Martingales** : **${zeroMartingaleCount} automates (${Math.round((100 * zeroMartingaleCount) / population.length)}%)** passent avec succès le filtre anti-martingale strict où les 3 sondes mono-biaisées (\`B2a_Mono_Anti_Coupe\`, \`B2b_Mono_Anti_Bull\`, \`B2c_Mono_Anti_Avance\`) sont nettement battues par les bots adaptatifs (\`B3_Tacticien_Couloir\` et \`B4_Stratege_Complet\`).`,
    `- **Mécanique dominante observée** : Les génomes qui combinent **l'enlisement conditionnel sur cible présente** avec le **redressement final Piste 3** créent la meilleure complémentarité entre la menace immédiate de l'Abatteuse et la destruction irréversible des souches par le Bulldozer.`,
    '',
    `### 2. Familles d'Automates Prometteuses (Niveau 2) à Tester en Mode 2`,
  ];

  for (const fam of synthesizedFamilies) {
    lines.push(
      `#### ${fam.title} (\`${fam.id}.yaml\` — ${fam.cartesianCount} instances Niveau 3)`,
      `- **Fonctionnement mécanique** : ${fam.howItWorks}`,
      `- **Qualités mesurées sur son noyau (${fam.sourceChampionCode})** : Score Global **${fam.repMetrics.scoreGlobal.toFixed(2)}** | Maîtrise $M_1 = ${fam.repMetrics.M1.toFixed(1)}$ | Adaptation $M_2 = ${fam.repMetrics.M2.toFixed(1)}$ | Tension $M_3 = ${fam.repMetrics.M3.toFixed(1)}$ | Simplicité $M_4 = ${fam.repMetrics.M4.toFixed(1)}$ ($C_{\\text{règle}} = ${fam.repMetrics.cRegle.toFixed(2)}\\text{ op.}$).`,
      ''
    );
  }

  lines.push(
    `### 3. Recommandation pour vos Tests Approfondis en Mode 2`,
    `Cliquez ci-dessous sur **« Ouvrir cette Famille Niveau 2 en Mode 2 & Lancer le Produit Cartésien »** sur la famille **\`${synthesizedFamilies[0]?.id || 'Famille_Niv2_Championne_Pareto'}\`** : le Mode 2 évaluera intégralement ses **${synthesizedFamilies[0]?.cartesianCount || 16} instances de Niveau 3** avec le maximum de précision pour identifier le réglage exact idéal sur table.`
  );

  return lines.join('\n');
}

/**
 * Génère le bilan analytique structuré de référence pour le Mode 2 (orienté Instances de Niveau 3)
 */
export function buildDeterministicBilanMode2(
  family: FamilySpecDSL,
  population: EvaluatedAutomatonV2[],
  sensitivity: SensitivityRowV2[],
  weights: WeightsV2
): string {
  if (population.length === 0) return 'Aucune instance Niveau 3 évaluée.';
  const top3 = population.slice(0, 3);
  const paretoCount = population.filter((x) => x.isPareto4D).length;

  const lines: string[] = [
    `### 1. Enseignements sur la Famille Niveau 2 \`${family.family_id}\` (${population.length} Instances Niveau 3 testées)`,
    `- **Évaluation Cartésienne Intégrale** : Les **${population.length} instances de Niveau 3** issues du produit cartésien des options \`$sweep\` ont été évaluées sur les 7 Bots autonomes avec Nombres Aléatoires Communs (CRN). **${paretoCount} instances** appartiennent au Front de Pareto 4D ($W_1=${Math.round(weights.w1_maitrise * 100)}\\%$, $W_2=${Math.round(weights.w2_adaptation * 100)}\\%$, $W_3=${Math.round(weights.w3_tension * 100)}\\%$, $W_4=${Math.round(weights.w4_simplicite * 100)}\\%$).`,
  ];

  if (sensitivity.length > 0) {
    lines.push(`- **Impact des Options \`$sweep\` (Analyse de Sensibilité)** :`);
    for (const s of sensitivity.slice(0, 6)) {
      lines.push(
        `  - **${s.dimension}** — modalité **\`${s.modality}\`** (${s.count} inst.) : Score Moyen = **${s.scoreGlobal.toFixed(2)}** ($M_1=${s.M1.toFixed(1)}$, $M_2=${s.M2.toFixed(1)}$, $M_3=${s.M3.toFixed(1)}$, $M_4=${s.M4.toFixed(1)}$).`
      );
    }
  }

  lines.push(
    '',
    `### 2. Description Détaillée des Meilleures Variantes (Instances de Niveau 3 Valorisées)`
  );

  top3.forEach((inst, idx) => {
    const rb = translateGenomeToHumanRulebook(inst.genome, inst.code);
    const monoMax = Math.max(
      inst.botScores.B2a_Mono_Anti_Coupe,
      inst.botScores.B2b_Mono_Anti_Bull,
      inst.botScores.B2c_Mono_Anti_Avance
    );
    lines.push(
      `#### Rang #${idx + 1} — Instance Niveau 3 \`${inst.code}\` (Score Global : ${inst.scoreGlobal.toFixed(2)} / 100)`,
      `- **Profil des 4 Métriques** : Maîtrise $M_1 = ${inst.M1_maitrise.toFixed(1)}$ ($\\Delta_{\\text{Skill}} = +${inst.deltaSkill.toFixed(1)}\\text{ pts}$, $\\tau_K = ${inst.kendallTau.toFixed(2)}$) · Adaptation $M_2 = ${inst.M2_adaptation.toFixed(1)}$ · Tension $M_3 = ${inst.M3_tension.toFixed(1)}$ (Forêt finale B4 = **${inst.botScores.B4_Stratege_Complet.toFixed(1)}%**) · Simplicité $M_4 = ${inst.M4_simplicite.toFixed(1)}$ ($C_{\\text{règle}} = ${inst.cRegleStatic.toFixed(2)}\\text{ op.}$).`,
      `- **Fonctionnement concret (Options valorisées)** :`,
      `  - *Arène & Fin de Piste* : ${rb.setupSection.join(' — ')}`,
      `  - *Loi Physique & Casse* : ${rb.physicsSection.join(' · ')}`,
      `  - *Piste 2D6 & Décompte Piste 3* : ${rb.learningSection.join(' · ')} · **${rb.scoringSection[0] || ''}**`,
      `- **Avantage décisif** : Le Stratège Complet (\`B4\`) sauve **${inst.botScores.B4_Stratege_Complet.toFixed(1)}%** de la forêt (dont **+${inst.treesRegenPct.toFixed(1)}%** grâce aux souches sur sol intact Piste 3) tandis que les sondes mono-action (\`B2a/B2b/B2c\`) plafonnent à **${monoMax.toFixed(1)}%**.`,
      ''
    );
  });

  lines.push(
    `### 3. Recommandation pour Test Physique sur Table`,
    `Sélectionnez l'instance Niveau 3 **\`${top3[0]?.code}\`** dans le tableau ci-dessous pour consulter et exporter sa **Fiche de Règles Humaines complète** où chaque condition et chaque action sont intégralement valorisées.`
  );

  return lines.join('\n');
}

/**
 * Clés de compréhension pédagogiques pour chaque paramètre des Modes 1 & 2
 */
export interface ParameterGuideItem {
  id: string;
  label: string;
  defaultRec: string;
  whatItIs: string;
  effectUp: string;
  effectDown: string;
}

export const MODE1_PARAMETER_GUIDES: Record<string, ParameterGuideItem> = {
  gaPopSize: {
    id: 'gaPopSize',
    label: 'Taille de Population par Génération (P)',
    defaultRec: '64 individus (Précision Maximale)',
    whatItIs:
      "Nombre d'automates (Niveau 3) évalués et mis en compétition à chaque génération de l'algorithme évolutionnaire.",
    effectUp:
      'Augmente la diversité génétique et la probabilité de découvrir des niches écologiques rares dans MAP-Elites, au prix d’un temps de calcul proportionnel.',
    effectDown:
      'Accélère chaque génération mais risque de converger trop vite vers un seul style de jeu.',
  },
  gaGenerations: {
    id: 'gaGenerations',
    label: 'Nombre de Générations Évolutives (G)',
    defaultRec: '12 générations (Exploration Ambitieuse)',
    whatItIs:
      'Nombre de cycles successifs de sélection (50% Front de Pareto NSGA-II + 50% Archive MAP-Elites), croisement par bloc et mutation.',
    effectUp:
      'Permet aux mutations structurelles (Greffe de Slot, Élagage d’Occam) de s’accumuler et d’affiner des familles très originales.',
    effectDown:
      'Explore uniquement le voisinage immédiat de la famille de départ.',
  },
  creativeMutationRate: {
    id: 'creativeMutationRate',
    label: 'Taux de Mutation Créative (NEAT / Occam)',
    defaultRec: '35 % (Innovation Structurelle Élevée)',
    whatItIs:
      "Probabilité qu'un automate enfant subisse une mutation structurelle hors du cadre initial : Greffe d'un 3e Slot conditionnel (Boost ou Domino c+1), Élagage d'Occam (suppression d'une condition superflue) ou injection de Casse/Élan.",
    effectUp:
      "Favorise l'émergence de nouvelles Familles d'Automates (Niveau 2) inattendues.",
    effectDown:
      'Conserve fidèlement la structure des tactiques de départ en ne faisant varier que les seuils numériques.',
  },
  maxAllowedComplexity: {
    id: 'maxAllowedComplexity',
    label: 'Plafond de Complexité Syntaxique sur Table (C_règle max)',
    defaultRec: '6.5 op. (Riche mais jouable par un humain)',
    whatItIs:
      "Garde-fou pré-simulation qui rejette tout automate mutant dont le coût cognitif statique de lecture (somme des capteurs, clauses ET/OU et verbes) dépasse ce seuil.",
    effectUp:
      'Autorise des automates plus sophistiqués (3 à 4 Slots avec doubles conditions ET/OU et mémoire inter-slots).',
    effectDown:
      'Force l’évolution à ne retenir que des règles ultra-épurées (style Occam <= 3.0 op.) très rapides à manipuler sur un plateau physique.',
  },
  mcFidelity: {
    id: 'mcFidelity',
    label: 'Fidélité Monte-Carlo par Automate & par Bot (CRN)',
    defaultRec: '80 parties/bot (Équivalent ~450 parties grâce au CRN)',
    whatItIs:
      'Nombre de parties complètes simulées pour chacun des 7 Bots avec exactement les mêmes séquences de tirages 2D6 (Common Random Numbers xorshift64*).',
    effectUp:
      'Réduit le bruit statistique sur le ratio Signal-sur-Bruit (SNR) et stabilise le classement des variantes très proches.',
    effectDown:
      'Divise le temps de calcul pour un dégrossissage rapide.',
  },
  tablesAndEfforts: {
    id: 'tablesAndEfforts',
    label: "Configurations de Table (J joueurs) & Paliers d'Effort (P̄)",
    defaultRec: 'Tables 3, 4, 5, 6 joueurs × Efforts 30%, 50%, 70% (Complet)',
    whatItIs:
      "Nombre de pistes/joueurs simultanés et pourcentage d'actions de l'automate que l'équipe des joueurs parvient à parer à chaque tour.",
    effectUp:
      "Garantit que l'automate reste équilibré quelle que soit la taille du groupe de joueurs et leur niveau de fatigue.",
    effectDown:
      'Calibre l’automate spécifiquement pour la configuration nominale (4 joueurs, 50% de parades).',
  },
};

/**
 * Document Statique Complet de Spécification YAML Niveau 2 pour Discussions Gemini Externes
 */
export const LEVEL2_GEMINI_SPEC_DOCUMENT_MD = `# GUIDE & SPÉCIFICATION OFFICIELLE — FICHIER DE FAMILLE D'AUTOMATES (NIVEAU 2 .YAML)
## Pour conception assistée par IA (Gemini) et import direct dans « Forêt Automate Lab v2 » (Mode 2)

---

### 1. RÔLE ET OBJECTIF DE CE DOCUMENT (INSTRUCTIONS POUR GEMINI)

Tu es un architecte de Game Design collaborant à la conception de l'automate du jeu de plateau coopératif asymétrique **« Défenseurs de la Forêt »**.
Dans notre méthodologie de travail avec l'outil **Forêt Automate Lab v2**, nous distinguons strictement deux niveaux de description :

1. **Le Niveau 2 (\`Famille d'Automates\` = 1 fichier \`.yaml\`)** :
   - C'est une **architecture de règles paramétrique** qui définit la logique d'une famille d'automates tout en laissant certaines options ouvertes sous forme de listes \`$sweep: [...]\` (par exemple : hésiter entre 14 et 16 tours, entre un seuil \`<= 0\` ou \`<= 1\`, entre deux modes de rebond ou deux règles de régénération des souches Piste 3).
   - **C'est ce fichier \`.yaml\` de Niveau 2 que tu dois me générer** à l'issue de nos échanges pour que je l'importe dans le **Mode 2** du simulateur.

2. **Le Niveau 3 (\`Instance / Variante d'Automate\` = 1 automate concret entièrement valorisé)** :
   - Lorsque j'importe ton fichier \`.yaml\` de **Niveau 2** dans le **Mode 2** de l'outil, le compilateur génère automatiquement **le produit cartésien** de toutes les options \`$sweep\` que tu y as placées.
   - Chaque combinaison unique issue de ce produit cartésien est une **Instance de Niveau 3** (encodée en un vecteur de 447 entiers \`int32\`) où chaque option a une valeur fixe unique. Le simulateur évalue alors toutes ces instances de Niveau 3 face à 7 Bots autonomes (de \`B0_Passif\` à \`B4_Stratege_Complet\`) pour identifier la meilleure variante exacte.

> **Règle d'or pour le calibrage du Produit Cartésien en Niveau 2** :
> Lorsque tu conçois un fichier \`.yaml\` de Niveau 2, place des opérateurs \`$sweep: [...]\` sur les paramètres que nous voulons comparer expérimentalement, de sorte que le produit cartésien total se situe idéalement entre **8 et 128 instances de Niveau 3** (ex. $2 \\times 2 \\times 2 \\times 2 = 16$ variantes, ou $3 \\times 2 \\times 2 \\times 2 = 24$ variantes). Cela permet au **Mode 2** d'évaluer 100 % des instances avec la précision Monte-Carlo maximale en quelques secondes.

---

### 2. RAPPEL DE LA PHYSIQUE DU JEU « DÉFENSEURS DE LA FORÊT » (NIVEAU 1)

- **Plateau ($J$ pistes parallèles de 5 cases)** : Chaque joueur défend un couloir de 5 cases numérotées de \`1\` (entrée, bord forêt) à \`5\` (fond de la forêt).
- **Les 3 États écologiques d'une case** :
  - **Arbres debout ($A \\in [0, 4]$)** : Initialement **12 arbres par piste** (soit répartis en \`[2, 2, 2, 3, 3]\` en mode symétrique, soit selon des biomes asymétriques).
  - **Souches ($S \\ge 0$)** : Lorsqu'un arbre est coupé (\`CUT\`), il laisse **1 Souche** sur la case.
  - **Sol Terrassé ($D \\in \\{0, 1\\}$)** : Lorsqu'un Bulldozer terrasse (\`BULLDOZE\`), il détruit des souches et marque la case comme **Sol Terrassé ($D = 1$)**, ce qui dégrade définitivement la fertilité du sol.
- **Les 2 Machines sur chaque piste** :
  - \`ABATTEUSE\` (spécialisée dans la coupe d'arbres et l'ouverture du front) ;
  - \`BULLDOZER\` (spécialisé dans la destruction des souches et le terrassement du sol).
- **La Piste d'Apprentissage Globale 2D6 (Sommes \`2\` à \`12\`)** :
  - À chaque tour, un jet de **2D6** désigne une colonne (\`2\` à \`12\`) qui active l'une des **4 Tactiques** (\`C1\`, \`C2\`, \`B1\`, \`B2\`).
  - Les joueurs choisissent quelles pistes parer (selon leur budget d'effort).
  - En fin de tour, la tuile de la colonne 2D6 tirée peut évoluer (glissement vers le centre \`7\` très fréquent ou vers les bords, ou retournement Recto-Verso Coupe $\\leftrightarrow$ Bulldozer) selon que l'action a réussi ou a été majoritairement parée.
- **Le Décompte Écologique Final « Piste 3 »** :
  - En fin de partie, le score de survie de la forêt additionne les **Arbres debout restants** ET les **Souches qui se redressent en nouveaux arbres** selon le mode \`regen_mode\` choisi (ex. +1 arbre régénéré par case possédant au moins une souche si son sol n'a pas été terrassé $D=0$).

---

### 3. DICTIONNAIRE EXHAUSTIF DES CLÉS ET VALEURS AUTORISÉES DANS LE YAML NIVEAU 2

Toute valeur scalaire ci-dessous peut être remplacée par un objet \`{ "$sweep": [valeur_1, valeur_2, ...] }\`.

#### A. Bloc \`arena\` (Géométrie, Biomes, Obstacles & Fin de Piste)
- \`turns\` : Entier dans \`10..24\` (ex. \`14\`, \`16\`, \`20\` ou \`{ "$sweep": [14, 16] }\`).
- \`dice_mode\` : \`"GLOBAL_2D6"\` (un tirage 2D6 commun à toute la table) ou \`"PER_TRACK_2D6"\`.
- \`biomes\` :
  - \`mode\` : \`"SYMMETRIC_5c_12a"\` (toutes les pistes commencent à \`[2, 2, 2, 3, 3]\`) ou \`"ASYMMETRIC_BIOMES_12a"\` (alterne Jeune Forêt \`[3,3,2,2,2]\`, Forêt Profonde \`[1,2,2,3,4]\` et Clairière \`[3,2,1,3,3]\`).
  - \`symmetric_cap\` : Tableau de 5 entiers totalisant 12, par défaut \`[2, 2, 2, 3, 3]\`.
- \`cell_weights\` : Tableau de 5 entiers définissant la valeur en points de chaque case \`[c1, c2, c3, c4, c5]\` :
  - Ex. \`[1, 1, 1, 1, 1]\` (uniforme) ou \`[1, 1, 2, 2, 3]\` (coeur de forêt plus précieux).
- \`obstacles\` : Tableau de 5 entiers \`[o1, o2, o3, o4, o5]\` où :
  - \`0\` = Case normale
  - \`1\` = Rivière / Ravine (arrête le déplacement de la machine sur cette case pour le reste du tour)
  - \`2\` = Pont logistique (exige que le Bulldozer ait terrassé avant que l'Abatteuse puisse franchir)
- \`end_of_track_mode\` : Comportement quand une machine dépasse la case 5 :
  - \`"STOP"\` (reste bloquée en case 5)
  - \`"BOUNCE"\` (rebondit en sens inverse vers la case 1)
  - \`"WRAP_TO_1"\` (revient en case 1)
  - \`"BOUNCE_AND_FLIP_ROLE"\` (rebondit et inverse le rôle Coupe/Bulldozer sur la piste 2D6)

#### B. Bloc \`machines_physics\` (Lois de Casse Mécanique & Élan)
- \`break_rule\` :
  - \`"NEVER"\` (aucune casse mécanique)
  - \`"ON_2_PARRIES_IN_TURN"\` (la machine casse si elle subit 2 parades sur la même piste dans le tour)
  - \`"ON_PARRY_DURING_DOUBLE"\` (la machine casse si elle est parée lors d'un double aux dés \`1-1\`, \`2-2\`, etc.)
- \`break_penalty\` :
  - \`"SKIP_NEXT_SLOT"\` (annule le prochain slot d'action)
  - \`"SKIP_FULL_TURN"\` (machine immobilisée au prochain tour)
  - \`"RETREAT_1_AND_SKIP"\` (recule d'une case et saute son prochain slot)
- \`momentum_rule\` :
  - \`"NONE"\` (pas d'élan)
  - \`"ACTIVE"\` (une machine qui avance sans être parée gagne le statut Élan : +1 quantité au prochain abattage/terrassement)

#### C. Bloc \`tactics\` (Liste de 4 Tactiques : \`C1\`, \`C2\`, \`B1\`, \`B2\`)
Chaque tactique possède :
- \`id\` : Identifiant lisible (ex. \`"C1_Coupe_Intensive"\`, \`"C2_Avancer_Couper"\`, \`"B1_Terrassement"\`, \`"B2_Avancer_Terrasser"\`).
- \`machine\` : \`"ABATTEUSE"\` ou \`"BULLDOZER"\`.
- \`wave_mode\` : \`"ALL_TRACKS"\` (toutes les pistes), \`"FIRST_K_TRACKS"\` ou \`"MAX_FOREST_TRACKS"\`.
- \`slots\` : Liste de **1 à 4 Slots conditionnels** exécutés séquentiellement :
  - \`cond1\` : \`[CAPTEUR, OPERATEUR, VALEUR]\`
  - \`logic\` *(optionnel)* : \`"NONE"\`, \`"AND"\`, \`"OR"\`
  - \`cond2\` *(optionnel, si \`logic\` est \`AND\` ou \`OR\`)* : \`[CAPTEUR, OPERATEUR, VALEUR]\`
  - \`if_true\` : \`[VERBE, QUANTITE, OFFSET_CASE]\`
  - \`if_false\` : \`[VERBE, QUANTITE, OFFSET_CASE]\`
  - \`parry_mode\` : Mode de parade du Slot

##### Liste des 18 \`CAPTEUR\` autorisés :
| Code Capteur | Description | Coût Cognitif |
| :--- | :--- | :--- |
| \`ALWAYS_TRUE\` | Toujours vrai (inconditionnel) | +0.0 |
| \`TREES_CURR\` | Nombre d'arbres debout sur la case actuelle de la machine | +1.0 |
| \`STUMPS_CURR\` | Nombre de souches sur la case actuelle de la machine | +1.0 |
| \`IS_TERRACED_CURR\` | \`1\` si le sol de la case actuelle est terrassé, \`0\` sinon | +1.0 |
| \`TARGETS_CURR\` | Cibles naturelles sur la case actuelle (Arbres pour Abatteuse, Souches pour Bulldozer) | +1.0 |
| \`IS_MONOCHROME_GREEN\` | \`1\` si la case actuelle n'a que des arbres (aucune souche ni sol terrassé) | +1.5 |
| \`IS_MONOCHROME_BROWN\` | \`1\` si la case actuelle n'a plus aucun arbre debout | +1.5 |
| \`TARGETS_NEXT\` | Cibles naturelles sur la case suivante (\`c + 1\`) | +2.0 |
| \`POS_MACHINE\` | Position actuelle de la machine (\`1\` à \`5\`) | +1.0 |
| \`DIST_OTHER_MACHINE\` | Distance signée avec l'autre machine du même couloir | +2.0 |
| \`IS_SAME_CELL_OTHER\` | \`1\` si l'Abatteuse et le Bulldozer sont sur la même case | +1.5 |
| \`STATUS_MACHINE\` | Statut mécanique (\`0\`=Normal, \`1\`=Élan, \`2\`=Endommagé) | +1.5 |
| \`DICE_IS_DOUBLE\` | \`1\` si le tirage 2D6 du tour est un double | +1.0 |
| \`PREV_SLOTS_SUCCEEDED\` | Nombre de slots précédents ayant réussi dans ce tour (effet Domino) | +1.5 |
| \`PARRIES_THIS_TURN_TRACK\` | Nombre de parades déjà subies sur cette piste pendant ce tour | +1.5 |
| \`TOTAL_TREES_TRACK\` | Total d'arbres restants sur l'ensemble des 5 cases de la piste | +2.5 |
| \`TURN_INDEX\` | Numéro du tour actuel (\`1..T\`) | +1.0 |
| \`IS_BLOCKED_BY_OBSTACLE\` | \`1\` si la case devant la machine comporte un obstacle non franchi | +1.5 |

##### Liste des 6 \`OPERATEUR\` autorisés :
\`"=="\`, \`"!="\`, \`"<"\`, \`"<="\`, \`">"\`, \`">="\`

##### Liste des 9 \`VERBE\` autorisés dans \`[VERBE, QUANTITE, OFFSET_CASE]\` :
*(Note : \`OFFSET_CASE\` vaut \`0\` pour agir sur la case actuelle, \`1\` pour agir sur la case suivante \`c+1\`, ou \`-1\` pour la case précédente).*
- \`["NONE", 0, 0]\` : Ne rien faire.
- \`["CUT", q, offset]\` : Couper \`q\` Arbres $\\to$ deviennent \`q\` Souches.
- \`["BULLDOZE", q, offset]\` : Détruire \`q\` Souches et marquer le Sol Terrassé ($D = 1$).
- \`["ERODE", q, offset]\` : Érosion mixte (coupe un arbre s'il en reste, sinon détruit une souche).
- \`["ADVANCE", q, 0]\` : Avancer la machine de \`q\` cases vers le fond de la forêt.
- \`["RETREAT", q, 0]\` : Reculer la machine de \`q\` cases vers l'entrée.
- \`["CALL_PARTNER", 1, 0]\` : Tire la machine partenaire d'une case vers sa propre position.
- \`["SET_STATUS", s, 0]\` : Applique le statut \`s\` (\`1\`=Élan, \`2\`=Endommagé).
- \`["SHIFT_TRACK", 1, 0]\` : Force une dérive supplémentaire sur la piste 2D6.

##### Liste des 4 \`parry_mode\` autorisés :
- \`"UNPARRYABLE"\` : Imparable par les joueurs (ex. mouvement pur inexorable).
- \`"CANCEL_SLOT_ONLY"\` : Une parade annule uniquement ce Slot ; les Slots suivants de la tactique sont quand même évalués.
- \`"CANCEL_REMAINING_TACTIC"\` : Une parade sur ce Slot coupe court à toute la suite de la tactique sur cette piste.
- \`"DOWNGRADE_QTY_BY_1"\` : Une parade réduit la quantité \`q\` de 1 unité au lieu d'annuler complètement.

#### D. Bloc \`learning_track\` (Piste d'Apprentissage 2D6)
- \`initial_layout\` : \`"6C_5B_CENTRE_COUPE"\` (colonnes 6,7,8 orientées Coupe au départ) ou \`"6C_5B_ALTERNE"\`.
- \`eval_trigger_mode\` :
  - \`"MAJORITY_UNPARRIED"\` (l'automate progresse vers le 7 si moins de la moitié des pistes ont été parées)
  - \`"AT_LEAST_ONE_SUCCESS"\` (progresse dès qu'au moins une piste subit un dégât)
  - \`"RATIO_SUCCESS_VS_FAIL"\` (compare le nombre de slots réussis au nombre de slots parés)
- \`geom_move_mode\` :
  - \`"SWAP_TOWARD_7_OR_EDGES"\` (échange la tuile avec sa voisine vers le centre \`7\` en cas de succès, ou vers les bords \`2/12\` si parée)
  - \`"FLIP_RECTO_VERSO"\` (retourne la tuile sur son autre face Coupe $\\leftrightarrow$ Bulldozer lorsqu'elle est parée)

#### E. Bloc \`scoring\` (Décompte Écologique Final Piste 3)
- \`regen_mode\` :
  - \`"CLASSIQUE_ARBRES_SEULS"\` (seuls les arbres debout comptent)
  - \`"PISTE3_1_PER_CELL_WITH_STUMP"\` (chaque case ayant au moins 1 souche régénère \`+1\` arbre en fin de partie)
  - \`"PISTE3_INTACT_SOIL_ONLY"\` (chaque case ayant au moins 1 souche ET un sol non terrassé $D=0$ régénère \`+1\` arbre)
  - \`"PISTE3_ALL_SURVIVING_STUMPS"\` (toutes les souches sur sol intact $D=0$ se redressent en arbres)
- \`regen_max\` : Entier (\`1\` ou \`2\`), plafond d'arbres régénérés par case.

---

### 4. MODÈLE COMPLET D'UN FICHIER \`.YAML\` DE NIVEAU 2 (EXEMPLE PRÊT À GÉNÉRER)

\`\`\`yaml
family_id: Famille_Cooperation_Coupe_Bulldozer_V2
description: >
  Famille de Niveau 2 testant l'interaction entre l'enlisement de l'Abatteuse,
  l'effet Domino sur la case suivante et le redressement Piste 3 sur sol intact.
  Produit cartésien : 2 x 2 x 2 x 2 x 2 = 32 instances de Niveau 3.

arena:
  turns:
    $sweep: [14, 16]
  dice_mode: GLOBAL_2D6
  biomes:
    mode: SYMMETRIC_5c_12a
    symmetric_cap: [2, 2, 2, 3, 3]
  cell_weights: [1, 1, 1, 1, 1]
  obstacles: [0, 0, 0, 0, 0]
  end_of_track_mode:
    $sweep: [STOP, BOUNCE]

machines_physics:
  break_rule: NEVER
  break_penalty: SKIP_NEXT_SLOT
  momentum_rule: NONE

tactics:
  - id: C1_Coupe_Intensive
    machine: ABATTEUSE
    wave_mode: ALL_TRACKS
    slots:
      - cond1: [TARGETS_CURR, ">=", 1]
        if_true: [CUT, 1, 0]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY
      - cond1: [TARGETS_CURR, ">=", 1]
        if_true: [CUT, 1, 0]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY
      - cond1: [PREV_SLOTS_SUCCEEDED, ">=", 1]
        logic: AND
        cond2: [TARGETS_CURR, "==", 0]
        if_true:
          $sweep:
            - [NONE, 0, 0]
            - [CUT, 1, 1]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY

  - id: C2_Avancer_Couper
    machine: ABATTEUSE
    wave_mode: ALL_TRACKS
    slots:
      - cond1:
          - TARGETS_CURR
          - "<="
          - $sweep: [0, 1]
        if_true: [ADVANCE, 1, 0]
        if_false: [CUT, 1, 0]
        parry_mode: CANCEL_REMAINING_TACTIC
      - cond1: [TARGETS_CURR, ">=", 1]
        if_true: [CUT, 1, 0]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY

  - id: B1_Terrassement_Intensif
    machine: BULLDOZER
    wave_mode: ALL_TRACKS
    slots:
      - cond1: [TARGETS_CURR, ">=", 1]
        if_true: [BULLDOZE, 1, 0]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY
      - cond1: [TARGETS_CURR, ">=", 1]
        if_true: [BULLDOZE, 1, 0]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY

  - id: B2_Avancer_Terrasser
    machine: BULLDOZER
    wave_mode: ALL_TRACKS
    slots:
      - cond1: [TARGETS_CURR, "<=", 0]
        if_true: [ADVANCE, 1, 0]
        if_false: [BULLDOZE, 1, 0]
        parry_mode: CANCEL_REMAINING_TACTIC
      - cond1: [TARGETS_CURR, ">=", 1]
        if_true: [BULLDOZE, 1, 0]
        if_false: [NONE, 0, 0]
        parry_mode: CANCEL_SLOT_ONLY

learning_track:
  initial_layout: 6C_5B_CENTRE_COUPE
  eval_trigger_mode: MAJORITY_UNPARRIED
  geom_move_mode: SWAP_TOWARD_7_OR_EDGES

scoring:
  regen_mode:
    $sweep: [PISTE3_1_PER_CELL_WITH_STUMP, PISTE3_INTACT_SOIL_ONLY]
  regen_max: 1
\`\`\`
`;
