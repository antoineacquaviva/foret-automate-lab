/**
 * Bloc 4 & Bloc 5 — Notation par Théorie des Jeux Empirique (M1..M4),
 * Entonnoir Multi-Fidélité (Successive Halving 3 Rungs),
 * et Algorithme Évolutionnaire Hybride NSGA-II + MAP-Elites (800 niches 10x10x8).
 */

import {
  GENOME_SIZE,
  OFFSET_TACTICS,
  OFFSET_LEARNING,
  HDR_T_TURNS,
  HDR_END_OF_TRACK_MODE,
  HDR_BREAK_RULE,
  HDR_MOMENTUM_RULE,
  HDR_REGEN_MODE,
  ARENA_OBSTACLE_MASK_START,
  computeStaticRuleComplexity,
  isGenomeEligible,
} from './genome';
import { CompiledGenomeSpec } from './dsl_compiler';
import { BotBatchStats, runVmBatchSimulation } from './bots_and_vm';

export interface WeightsV2 {
  w1_maitrise: number;
  w2_adaptation: number;
  w3_tension: number;
  w4_simplicite: number;
}

export interface EvaluatedAutomatonV2 {
  id: number;
  code: string;
  familyId: string;
  genome: Int32Array;
  rungReached: 1 | 2 | 3;
  generation: number;
  rangGlobal?: number;
  isPareto4D?: boolean;

  // Scores globaux et 4 métriques
  scoreGlobal: number;
  M1_maitrise: number;
  M2_adaptation: number;
  M3_tension: number;
  M4_simplicite: number;
  martingalePenalty: number; // Malus quadratique non plafonné si S_MonoMax >= S_Smart

  // Détails M1
  deltaSkill: number;
  snr: number;
  deltaPiste: number;
  kendallTau: number;

  // Détails M2
  jensenShannonDjs: number;
  temporalTvd: number;
  nashMargin: number; // min(B3, B4) - max(B2a, B2b, B2c)

  // Détails M3
  shannonEntropyBits: number;
  shannonEntropyNormPct: number;
  treesRawPct: number;
  treesRegenPct: number;
  stumpsRawPct: number;
  terracedPct: number;
  b0StallRatePct: number;

  // Détails M4
  mPhysPerTurn: number;
  cCogPerTurn: number;
  cRegleStatic: number;

  // Scores des 7 Bots (B0..B4)
  botScores: {
    B0_Passif: number;
    B1_Aveugle: number;
    B2a_Mono_Anti_Coupe: number;
    B2b_Mono_Anti_Bull: number;
    B2c_Mono_Anti_Avance: number;
    B3_Tacticien_Couloir: number;
    B4_Stratege_Complet: number;
  };
  parriesUsedAvg: number;

  // Descripteur Comportemental 3D pour MAP-Elites (10 x 10 x 8 = 800 niches)
  nicheX: number; // 0..9 : Complexité sur table (M_phys + C_cog + C_règle)
  nicheY: number; // 0..9 : Profil de Pression (Ratio Coupe / Terrassement)
  nicheZ: number; // 0..7 : Cinétique de Mouvement (Avancées et rebonds par piste)
  nicheKey: string; // "x-y-z"
  cutToBullRatio: number;
  movesPerTrack: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round(v: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

/**
 * Calcule la Divergence de Jensen-Shannon D_JS(P || Q) en bits (bornée entre 0 et 1)
 */
function computeJensenShannonDivergence(p: [number, number, number], q: [number, number, number]): number {
  const eps = 1e-9;
  const m: [number, number, number] = [
    0.5 * (p[0] + q[0]),
    0.5 * (p[1] + q[1]),
    0.5 * (p[2] + q[2]),
  ];
  let klPM = 0.0;
  let klQM = 0.0;
  for (let i = 0; i < 3; i++) {
    const pi = Math.max(eps, p[i]);
    const qi = Math.max(eps, q[i]);
    const mi = Math.max(eps, m[i]);
    klPM += pi * Math.log2(pi / mi);
    klQM += qi * Math.log2(qi / mi);
  }
  return clamp(0.5 * klPM + 0.5 * klQM, 0.0, 1.0);
}

/**
 * Calcule la Distance de Variation Totale TVD(P, Q) = 0.5 * sum |P_i - Q_i|
 */
function computeTotalVariationDistance(
  p: [number, number, number, number],
  q: [number, number, number, number]
): number {
  let sumAbs = 0.0;
  for (let i = 0; i < 4; i++) {
    sumAbs += Math.abs(p[i] - q[i]);
  }
  return clamp(0.5 * sumAbs, 0.0, 1.0);
}

/**
 * Calcule la Corrélation de Monotonie de Kendall tau_K sur les 5 paliers :
 * [S(B0), S(B1), S(MonoMoy), S(B3), S(B4)]
 */
function computeKendallTau(seq: [number, number, number, number, number]): number {
  let concordant = 0;
  let discordant = 0;
  const n = seq.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (seq[j] >= seq[i] - 0.15) {
        concordant += 1;
      } else {
        discordant += 1;
      }
    }
  }
  const totalPairs = (n * (n - 1)) / 2;
  return (concordant - discordant) / totalPairs;
}

/**
 * Évalue un génome sur les 7 Bots (avec CRN) et calcule les 4 métriques scientifiques M1..M4 + descripteur MAP-Elites.
 */
export function evaluateAutomatonScientific(
  spec: CompiledGenomeSpec,
  playerCounts: number[],
  effortRates: number[],
  nGamesPerBot: number,
  baseSeed: number,
  weights: WeightsV2,
  rungReached: 1 | 2 | 3 = 3,
  generation = 0
): EvaluatedAutomatonV2 {
  const cRegleStatic = computeStaticRuleComplexity(spec.genome);
  const nConfigs = Math.max(1, playerCounts.length * effortRates.length);

  // Accumulateurs par Bot (0..6)
  const botStats: BotBatchStats[] = [];

  for (let botId = 0; botId < 7; botId++) {
    let accScore = 0;
    let accStd = 0;
    let accTreesRaw = 0;
    let accTreesRegen = 0;
    let accStumpsRaw = 0;
    let accTerraced = 0;
    let accPhys = 0;
    let accCog = 0;
    let accStall = 0;
    let accParries = 0;
    let accMoves = 0;
    const accAct: [number, number, number] = [0, 0, 0];
    const accT1: [number, number, number, number] = [0, 0, 0, 0];
    const accT3: [number, number, number, number] = [0, 0, 0, 0];
    const accDmg: [number, number, number] = [0, 0, 0];

    for (const nP of playerCounts) {
      for (const eff of effortRates) {
        // Common Random Numbers (CRN) : même graine entre tous les Bots pour (automate, nP, eff)
        const crnSeed =
          baseSeed + spec.id * 1009 + nP * 131 + Math.round(eff * 100) * 17;
        const st = runVmBatchSimulation(
          spec.genome,
          nP,
          botId,
          eff,
          nGamesPerBot,
          crnSeed
        );
        accScore += st.meanScorePct;
        accStd += st.stdScorePct;
        accTreesRaw += st.meanTreesRawPct;
        accTreesRegen += st.meanTreesRegenPct;
        accStumpsRaw += st.meanStumpsRawPct;
        accTerraced += st.meanTerracedPct;
        accPhys += st.meanPhysPerTurn;
        accCog += st.meanCogPerTurn;
        accStall += st.meanStallRatePct;
        accParries += st.meanParriesUsed;
        accMoves += st.meanMovesAndBounces;
        for (let k = 0; k < 3; k++) {
          accAct[k] += st.actionDist[k] / nConfigs;
          accDmg[k] += st.damageByTier[k] / nConfigs;
        }
        for (let k = 0; k < 4; k++) {
          accT1[k] += st.centerTacticDistT1[k] / nConfigs;
          accT3[k] += st.centerTacticDistT3[k] / nConfigs;
        }
      }
    }

    botStats.push({
      meanScorePct: accScore / nConfigs,
      stdScorePct: accStd / nConfigs,
      meanTreesRawPct: accTreesRaw / nConfigs,
      meanTreesRegenPct: accTreesRegen / nConfigs,
      meanStumpsRawPct: accStumpsRaw / nConfigs,
      meanTerracedPct: accTerraced / nConfigs,
      meanPhysPerTurn: accPhys / nConfigs,
      meanCogPerTurn: accCog / nConfigs,
      meanStallRatePct: accStall / nConfigs,
      meanParriesUsed: accParries / nConfigs,
      meanMovesAndBounces: accMoves / nConfigs,
      actionDist: accAct,
      centerTacticDistT1: accT1,
      centerTacticDistT3: accT3,
      damageByTier: accDmg,
    });
  }

  const b0 = botStats[0];
  const b1 = botStats[1];
  const b2a = botStats[2];
  const b2b = botStats[3];
  const b2c = botStats[4];
  const b3 = botStats[5];
  const b4 = botStats[6];

  const sB0 = b0.meanScorePct;
  const sB1 = b1.meanScorePct;
  const sB2a = b2a.meanScorePct;
  const sB2b = b2b.meanScorePct;
  const sB2c = b2c.meanScorePct;
  const sB3 = b3.meanScorePct;
  const sB4 = b4.meanScorePct;

  // -------------------------------------------------------------------------
  // 5.1. M1_Maitrise — Gradient de Compétence & Ratio Signal-sur-Bruit
  // -------------------------------------------------------------------------
  const sSmartMax = Math.max(sB3, sB4);
  const deltaSkill = Math.max(0.0, sSmartMax - sB1);
  const denomSnr = Math.sqrt(
    b1.stdScorePct * b1.stdScorePct + b3.stdScorePct * b3.stdScorePct + 1.0
  );
  const snr = deltaSkill / denomSnr;
  const deltaPiste = sB4 - sB3;
  const sMonoAvg = (sB2a + sB2b + sB2c) / 3.0;
  const kendallTau = computeKendallTau([sB0, sB1, sMonoAvg, sB3, sB4]);

  const rawM1 =
    4.0 * deltaSkill +
    15.0 * snr +
    5.0 * Math.max(0.0, deltaPiste) +
    20.0 * Math.max(0.0, kendallTau);
  const M1_maitrise = clamp(rawM1, 0.0, 100.0);

  // -------------------------------------------------------------------------
  // 5.2. M2_Adaptation — Plasticité (D_JS), Non-Stationnarité (TVD) & Anti-Martingale
  // -------------------------------------------------------------------------
  const djs = computeJensenShannonDivergence(b2a.actionDist, b2b.actionDist);
  const tvd = computeTotalVariationDistance(b3.centerTacticDistT1, b3.centerTacticDistT3);

  const sMonoMax = Math.max(sB2a, sB2b, sB2c);
  const sSmartMin = Math.min(sB3, sB4);
  const nashMargin = sSmartMin - sMonoMax;

  let nashBonus = 0.0;
  let martingalePenalty = 0.0;
  if (nashMargin > 0) {
    nashBonus = Math.min(35.0, nashMargin * 4.2);
  } else {
    // Malus quadratique lourd non plafonné appliqué directement au score global
    const deficit = Math.max(0.0, sMonoMax - sSmartMax);
    martingalePenalty = 10.0 * deficit * deficit;
  }

  const rawM2 = 120.0 * djs + 45.0 * tvd + nashBonus + 20.0 - Math.max(0, -nashMargin) * 6.0;
  const M2_adaptation = clamp(rawM2, 0.0, 100.0);

  // -------------------------------------------------------------------------
  // 5.3. M3_Tension — Fenêtre d'Harmonie [60%..80%], Entropie de Shannon H_3 & Pacing
  // -------------------------------------------------------------------------
  const distFrom70 = Math.abs(sB3 - 70.0);
  const harmonyScore = Math.max(0.0, 50.0 - 2.3 * Math.max(0.0, distFrom70 - 3.0));

  // Entropie de Shannon des 3 états finaux avant redressement (p_A, p_S, p_Z)
  const pA = Math.max(1e-6, b3.meanTreesRawPct / 100.0);
  const pS = Math.max(1e-6, b3.meanStumpsRawPct / 100.0);
  const pZ = Math.max(1e-6, b3.meanTerracedPct / 100.0);
  const pSum = pA + pS + pZ;
  const nA = pA / pSum;
  const nS = pS / pSum;
  const nZ = pZ / pSum;

  const hBits = -(
    nA * Math.log2(nA) +
    nS * Math.log2(nS) +
    nZ * Math.log2(nZ)
  );
  const hMax = Math.log2(3.0); // 1.58496 bits
  const hNorm = clamp(hBits / hMax, 0.0, 1.0);
  const entropyScore = 35.0 * (1.0 - Math.abs(hNorm - 0.81) * 1.4);

  const b0StallPen = Math.max(0.0, b0.meanStallRatePct - 10.0) * 1.5;
  const tiersActiveBonus =
    b3.damageByTier[0] > 0.2 && b3.damageByTier[1] > 0.2 && b3.damageByTier[2] > 0.2
      ? 15.0
      : 5.0;

  const rawM3 = harmonyScore + Math.max(0.0, entropyScore) + tiersActiveBonus - b0StallPen;
  const M3_tension = clamp(rawM3, 0.0, 100.0);

  // -------------------------------------------------------------------------
  // 5.4. M4_Simplicite — Charge Physique, Charge Cognitive & Complexité Statique C_règle
  // -------------------------------------------------------------------------
  const mPhys = b3.meanPhysPerTurn;
  const cCog = b3.meanCogPerTurn;
  const rawM4 =
    100.0 -
    12.0 * Math.max(0.0, cCog - 1.0) -
    4.5 * Math.max(0.0, mPhys - 2.5) -
    3.0 * cRegleStatic;
  const M4_simplicite = clamp(rawM4, 0.0, 100.0);

  // Score Composite Pondéré avec malus anti-martingale non plafonné (Section 5.2.3)
  const weightedSum =
    weights.w1_maitrise * M1_maitrise +
    weights.w2_adaptation * M2_adaptation +
    weights.w3_tension * M3_tension +
    weights.w4_simplicite * M4_simplicite;
  const scoreGlobal = weightedSum - martingalePenalty;

  // -------------------------------------------------------------------------
  // 6.1. Descripteur Comportemental 3D pour Archive MAP-Elites (10 x 10 x 8 = 800 niches)
  // -------------------------------------------------------------------------
  const totalTableLoad = mPhys + cCog + cRegleStatic;
  const nicheX = clamp(Math.floor(((totalTableLoad - 3.0) / 10.0) * 10), 0, 9);

  const cutRatio = b3.actionDist[0] / Math.max(0.01, b3.actionDist[0] + b3.actionDist[1]);
  const nicheY = clamp(Math.floor(cutRatio * 10), 0, 9);

  const movesPerTrack = b3.meanMovesAndBounces;
  const nicheZ = clamp(Math.floor((movesPerTrack / 8.0) * 8), 0, 7);
  const nicheKey = `${nicheX}-${nicheY}-${nicheZ}`;

  return {
    id: spec.id,
    code: spec.code,
    familyId: spec.familyId,
    genome: spec.genome,
    rungReached,
    generation,
    scoreGlobal: round(scoreGlobal, 2),
    M1_maitrise: round(M1_maitrise, 2),
    M2_adaptation: round(M2_adaptation, 2),
    M3_tension: round(M3_tension, 2),
    M4_simplicite: round(M4_simplicite, 2),
    martingalePenalty: round(martingalePenalty, 2),

    deltaSkill: round(deltaSkill, 2),
    snr: round(snr, 2),
    deltaPiste: round(deltaPiste, 2),
    kendallTau: round(kendallTau, 2),

    jensenShannonDjs: round(djs, 3),
    temporalTvd: round(tvd, 3),
    nashMargin: round(nashMargin, 2),

    shannonEntropyBits: round(hBits, 3),
    shannonEntropyNormPct: round(hNorm * 100, 1),
    treesRawPct: round(b3.meanTreesRawPct, 1),
    treesRegenPct: round(b3.meanTreesRegenPct, 1),
    stumpsRawPct: round(b3.meanStumpsRawPct, 1),
    terracedPct: round(b3.meanTerracedPct, 1),
    b0StallRatePct: round(b0.meanStallRatePct, 1),

    mPhysPerTurn: round(mPhys, 2),
    cCogPerTurn: round(cCog, 2),
    cRegleStatic: round(cRegleStatic, 2),

    botScores: {
      B0_Passif: round(sB0, 2),
      B1_Aveugle: round(sB1, 2),
      B2a_Mono_Anti_Coupe: round(sB2a, 2),
      B2b_Mono_Anti_Bull: round(sB2b, 2),
      B2c_Mono_Anti_Avance: round(sB2c, 2),
      B3_Tacticien_Couloir: round(sB3, 2),
      B4_Stratege_Complet: round(sB4, 2),
    },
    parriesUsedAvg: round(b3.meanParriesUsed, 2),

    nicheX,
    nicheY,
    nicheZ,
    nicheKey,
    cutToBullRatio: round(cutRatio * 100, 1),
    movesPerTrack: round(movesPerTrack, 2),
  };
}

/**
 * Recalcule instantanément à la volée le scoreGlobal et le classement d'une population déjà évaluée
 * lorsque l'utilisateur déplace les 4 curseurs de pondération (Vue 2).
 */
export function reweightAndRankPopulation(
  pop: EvaluatedAutomatonV2[],
  weights: WeightsV2
): EvaluatedAutomatonV2[] {
  const n = pop.length;
  const isPareto = new Array<boolean>(n).fill(true);

  for (let i = 0; i < n; i++) {
    const ri = pop[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const rj = pop[j];
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

  const updated = pop.map((item, idx) => {
    const wSum =
      weights.w1_maitrise * item.M1_maitrise +
      weights.w2_adaptation * item.M2_adaptation +
      weights.w3_tension * item.M3_tension +
      weights.w4_simplicite * item.M4_simplicite;
    return {
      ...item,
      scoreGlobal: round(wSum - item.martingalePenalty, 2),
      isPareto4D: isPareto[idx],
    };
  });

  updated.sort((a, b) => {
    if (b.scoreGlobal !== a.scoreGlobal) return b.scoreGlobal - a.scoreGlobal;
    return b.M1_maitrise - a.M1_maitrise;
  });

  updated.forEach((item, idx) => {
    item.rangGlobal = idx + 1;
  });

  return updated;
}

/**
 * Opérateurs Génétiques NSGA-II + MAP-Elites (Section 6.2) :
 * - Block-Crossover (p_c = 0.70)
 * - Mutations Paramétriques (p_m = 0.15)
 * - Mutations Structurelles Créatives NEAT/Occam (p_struct = 0.08 : Greffe de Slot, Élagage d'Occam, Mutation Globale)
 */
export function breedOffspringGenome(
  parentA: EvaluatedAutomatonV2,
  parentB: EvaluatedAutomatonV2,
  newId: number,
  generation: number,
  maxComplexityAllowed = 5.0
): CompiledGenomeSpec {
  const child = new Int32Array(GENOME_SIZE);
  child.set(parentA.genome);

  // 1. Block-Crossover (échange soit les tactiques Bulldozer, soit le moteur d'apprentissage 2D6 + lois physiques)
  if (Math.random() < 0.7) {
    if (Math.random() < 0.5) {
      // Échange les tactiques Bulldozer (tactiques 2 et 3) avec Parent B
      const startBull = OFFSET_TACTICS + 2 * 64;
      const lenBull = 2 * 64;
      for (let i = 0; i < lenBull; i++) {
        child[startBull + i] = parentB.genome[startBull + i];
      }
    } else {
      // Échange la piste d'apprentissage 2D6 et l'en-tête physique avec Parent B
      for (let i = 0; i < 10; i++) {
        child[i] = parentB.genome[i];
      }
      for (let i = OFFSET_LEARNING; i < GENOME_SIZE; i++) {
        child[i] = parentB.genome[i];
      }
    }
  }

  let mutTag = 'XOVR';

  // 2. Mutations Paramétriques (seuils, durée, modes de fin de piste)
  if (Math.random() < 0.35) {
    const turnsChoices = [14, 16, 20];
    child[HDR_T_TURNS] = turnsChoices[Math.floor(Math.random() * turnsChoices.length)];
    child[HDR_REGEN_MODE] = 1 + Math.floor(Math.random() * 3); // Piste 3 modes 1..3
    mutTag = 'PARAM';
  }

  // 3. Mutations Structurelles Créatives (inspirées de NEAT / Occam)
  const rStruct = Math.random();
  if (rStruct < 0.18) {
    // Greffe de Slot Conditionnel (Effet Boost sur case monochrome ou Effet Domino à +1 case)
    const tacIdx = Math.floor(Math.random() * 4);
    const sBase = OFFSET_TACTICS + tacIdx * 64 + 4 + 2 * 15; // Slot 3 (index 2)
    const isBull = child[OFFSET_TACTICS + tacIdx * 64] === 1;
    if (Math.random() < 0.5) {
      // Greffe Boost Monochrome
      child[sBase + 0] = isBull ? 6 : 5; // IS_MONOCHROME_BROWN ou GREEN
      child[sBase + 1] = 0; // ==
      child[sBase + 2] = 1;
      child[sBase + 3] = 0; // NONE
      child[sBase + 7] = isBull ? 2 : 1; // BULLDOZE ou CUT
      child[sBase + 8] = 1;
      child[sBase + 9] = 0;
      child[sBase + 10] = 0;
      child[sBase + 13] = 1; // CANCEL_SLOT_ONLY
      mutTag = 'GREFFE_BOOST';
    } else {
      // Greffe Domino (Si PREV_SLOTS_SUCCEEDED >= 1 AND TARGETS_CURR == 0 -> Agir à +1)
      child[sBase + 0] = 13; // PREV_SLOTS_SUCCEEDED
      child[sBase + 1] = 5; // >=
      child[sBase + 2] = 1;
      child[sBase + 3] = 1; // AND
      child[sBase + 4] = 4; // TARGETS_CURR
      child[sBase + 5] = 0; // ==
      child[sBase + 6] = 0;
      child[sBase + 7] = isBull ? 2 : 1;
      child[sBase + 8] = 1;
      child[sBase + 9] = 1; // offset +1
      child[sBase + 10] = 0;
      child[sBase + 13] = 1;
      mutTag = 'GREFFE_DOMINO';
    }
  } else if (rStruct < 0.36) {
    // Élagage d'Occam (Pruning Mutation : désactive un 3e Slot ou simplifie une condition pour bondir en M4 Simplicité)
    const tacIdx = Math.floor(Math.random() * 4);
    const sBase = OFFSET_TACTICS + tacIdx * 64 + 4 + 2 * 15;
    for (let k = 0; k < 15; k++) child[sBase + k] = 0;
    mutTag = 'OCCAM_PRUNE';
  } else if (rStruct < 0.52) {
    // Mutation de Mécanique Globale (Casse, Élan, Rebond ou Flip Recto-Verso)
    child[HDR_BREAK_RULE] = Math.floor(Math.random() * 3);
    child[HDR_MOMENTUM_RULE] = Math.random() < 0.45 ? 1 : 0;
    child[HDR_END_OF_TRACK_MODE] = Math.floor(Math.random() * 3);
    child[OFFSET_LEARNING + 27] = Math.random() < 0.5 ? 1 : 0; // FLIP_RECTO_VERSO vs SWAP
    if (Math.random() < 0.25) {
      child[ARENA_OBSTACLE_MASK_START + 2] = Math.random() < 0.5 ? 2 : 0; // Pont logistique
    }
    mutTag = 'MUT_GLOBALE';
  }

  // Filtre d'éligibilité statique pré-simulation & plafond de complexité C_règle
  const elig = isGenomeEligible(child);
  let staticComp = computeStaticRuleComplexity(child);
  if (!elig.valid || staticComp > maxComplexityAllowed) {
    child.set(parentA.genome);
    staticComp = computeStaticRuleComplexity(child);
  }

  return {
    id: newId,
    code: `GEN${generation}_V${String(newId).padStart(4, '0')}_${mutTag}`,
    familyId: parentA.familyId,
    genome: child,
    staticComplexity: staticComp,
    summaryChoices: {},
  };
}
