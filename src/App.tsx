import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Download,
  Upload,
  Plus,
  Trash2,
  Search,
  FileText,
  BookOpen,
  Terminal,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
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
  GENOME_SIZE,
  GENOME_BYTES,
} from './v2/genome';
import {
  FamilySpecDSL,
  PRELOADED_FAMILIES,
  countFamilySweepVariants,
  compileFamilyToGenomes,
  translateGenomeToHumanRulebook,
  exportGenomeToLevel2Yaml,
  CompiledGenomeSpec,
} from './v2/dsl_compiler';
import {
  ALL_BOTS_V2,
  simulateTurnProfileV2,
  TurnByTurnProfileV2,
} from './v2/bots_and_vm';
import {
  WeightsV2,
  EvaluatedAutomatonV2,
  evaluateAutomatonScientific,
  reweightAndRankPopulation,
  breedOffspringGenome,
} from './v2/metrics_and_qd';
import {
  exportVariantsRankingCsvV2,
  exportMapElitesArchiveCsv,
  computeSensitivityAnalysisV2,
  exportSensitivityCsvV2,
  generateFullCampaignReportV2,
  generateOciPythonBundleScript,
} from './v2/oci_exporter';
import {
  Radar4DChart,
  BotsResponseChart,
  MapElitesHeatmap,
  TurnByTurnCurveChart,
} from './v2/ChartsV2';
import {
  stringifyFamilyToYaml,
  parseFamilyYamlOrJson,
  synthesizePromisingLevel2Families,
  SynthesizedLevel2FamilyCard,
  buildDeterministicBilanMode1,
  buildDeterministicBilanMode2,
  MODE1_PARAMETER_GUIDES,
  LEVEL2_GEMINI_SPEC_DOCUMENT_MD,
} from './v2/level2_synthesizer_and_spec';

type ActiveWorkspaceTab = 'mode1_genetic' | 'mode2_cartesian' | 'gemini_spec_doc';

interface TelemetryState {
  phaseLabel: string;
  currentStep: number;
  maxSteps: number;
  doneInPhase: number;
  totalInPhase: number;
  totalGamesSimulated: number;
  speedGamesPerSec: number;
  elapsedSec: number;
  nichesDiscovered: number;
}

export default function App() {
  // Navigation principale centrée sur vos 3 besoins :
  // 1. Mode 1 : Exploration Génétique Ambitieuse (-> Découverte de Familles Niveau 2)
  // 2. Mode 2 : Test & Optimisation d'une Famille YAML Niveau 2 (-> Produit Cartésien Intégral d'Instances Niveau 3)
  // 3. Document Statique de Spécification YAML Niveau 2 pour discussions Gemini externes
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('mode1_genetic');

  // =========================================================================
  // ÉTAT DU MODE 1 (EXPLORATION GÉNÉTIQUE AMBITIEUSE -> FAMILLES NIVEAU 2)
  // =========================================================================
  // Configuré par défaut au maximum de précision et d'ambition exploratoire
  const [m1PopSize, setM1PopSize] = useState<number>(64);
  const [m1Generations, setM1Generations] = useState<number>(12);
  const [m1CreativeMutRate, setM1CreativeMutRate] = useState<number>(0.35);
  const [m1MaxComplexity, setM1MaxComplexity] = useState<number>(6.5);
  const [m1GamesPerBot, setM1GamesPerBot] = useState<number>(80);
  const [m1PlayerCounts, setM1PlayerCounts] = useState<number[]>([3, 4, 5, 6]);
  const [m1EffortRates, setM1EffortRates] = useState<number[]>([0.3, 0.5, 0.7]);
  const [m1ShowParamGuides, setM1ShowParamGuides] = useState<boolean>(true);

  const [m1Population, setM1Population] = useState<EvaluatedAutomatonV2[]>([]);
  const [m1Archive, setM1Archive] = useState<Map<string, EvaluatedAutomatonV2>>(new Map());
  const [m1SynthesizedFamilies, setM1SynthesizedFamilies] = useState<
    SynthesizedLevel2FamilyCard[]
  >([]);
  const [m1AiBilanMarkdown, setM1AiBilanMarkdown] = useState<string>('');
  const [m1AiBilanSource, setM1AiBilanSource] = useState<'gemini_api' | 'deterministic_fallback' | 'loading' | 'idle'>('idle');
  const [m1PreviewYamlModal, setM1PreviewYamlModal] = useState<SynthesizedLevel2FamilyCard | null>(null);
  const [m1ActiveZSlice, setM1ActiveZSlice] = useState<number | 'ALL'>('ALL');
  const [m1SelectedElite, setM1SelectedElite] = useState<EvaluatedAutomatonV2 | null>(null);

  // =========================================================================
  // ÉTAT DU MODE 2 (TEST & OPTIMISATION D'UNE FAMILLE YAML NIVEAU 2 -> INSTANCES NIVEAU 3)
  // =========================================================================
  const [m2SelectedPresetIdx, setM2SelectedPresetIdx] = useState<number>(0);
  const [m2ActiveFamily, setM2ActiveFamily] = useState<FamilySpecDSL>(PRELOADED_FAMILIES[0]);
  const [m2EditorMode, setM2EditorMode] = useState<'yaml' | 'visual'>('yaml');
  const [m2YamlText, setM2YamlText] = useState<string>(() =>
    stringifyFamilyToYaml(PRELOADED_FAMILIES[0])
  );
  const [m2YamlError, setM2YamlError] = useState<string | null>(null);
  const [m2CustomFamilies, setM2CustomFamilies] = useState<FamilySpecDSL[]>([]);

  // Paramètres de précision Mode 2 (Par défaut : Produit Cartésien Intégral Haute Précision)
  const [m2EvaluationStrategy, setM2EvaluationStrategy] = useState<'full_cartesian' | 'funnel_sh'>(
    'full_cartesian'
  );
  const [m2MaxInstancesCap, setM2MaxInstancesCap] = useState<number>(256);
  const [m2GamesPerBot, setM2GamesPerBot] = useState<number>(80);
  const [m2PlayerCounts, setM2PlayerCounts] = useState<number[]>([3, 4, 5, 6]);
  const [m2EffortRates, setM2EffortRates] = useState<number[]>([0.3, 0.5, 0.7]);
  const [m2ShowParamGuides, setM2ShowParamGuides] = useState<boolean>(true);

  const [m2Instances, setM2Instances] = useState<EvaluatedAutomatonV2[]>([]);
  const [m2SelectedInstance, setM2SelectedInstance] = useState<EvaluatedAutomatonV2 | null>(null);
  const [m2TurnProfile, setM2TurnProfile] = useState<TurnByTurnProfileV2 | null>(null);
  const [m2AiBilanMarkdown, setM2AiBilanMarkdown] = useState<string>('');
  const [m2AiBilanSource, setM2AiBilanSource] = useState<'gemini_api' | 'deterministic_fallback' | 'loading' | 'idle'>('idle');
  const [m2SearchFilter, setM2SearchFilter] = useState<string>('');
  const [m2ParetoOnly, setM2ParetoOnly] = useState<boolean>(false);

  // =========================================================================
  // PONDÉRATIONS PARETO 4D PARTAGÉES (RECALCUL INSTANTANÉ À LA VOLÉE)
  // =========================================================================
  const [weights, setWeights] = useState<WeightsV2>({
    w1_maitrise: 0.3,
    w2_adaptation: 0.25,
    w3_tension: 0.25,
    w4_simplicite: 0.2,
  });

  // =========================================================================
  // ÉTAT D'EXÉCUTION & TÉLÉMÉTRIE
  // =========================================================================
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const pauseRef = useRef<boolean>(false);
  const stopRef = useRef<boolean>(false);
  const [telemetry, setTelemetry] = useState<TelemetryState>({
    phaseLabel: 'Prêt',
    currentStep: 0,
    maxSteps: 1,
    doneInPhase: 0,
    totalInPhase: 0,
    totalGamesSimulated: 0,
    speedGamesPerSec: 0,
    elapsedSec: 0,
    nichesDiscovered: 0,
  });

  // =========================================================================
  // ÉTAT ONGLET 3 : DOCUMENT DE SPÉCIFICATION YAML NIVEAU 2 POUR GEMINI
  // =========================================================================
  const [copiedSpecDoc, setCopiedSpecDoc] = useState<boolean>(false);

  // Calcul du produit cartésien exact de la Famille Niveau 2 active en Mode 2
  const m2ExactCartesianCount = useMemo(
    () => countFamilySweepVariants(m2ActiveFamily),
    [m2ActiveFamily]
  );
  const m2CompiledPreviewGenomes = useMemo(
    () => compileFamilyToGenomes(m2ActiveFamily, m2MaxInstancesCap),
    [m2ActiveFamily, m2MaxInstancesCap]
  );

  // Sensibilité paramétrique sur les instances Niveau 3 du Mode 2
  const m2SensitivityRows = useMemo(
    () => computeSensitivityAnalysisV2(m2Instances),
    [m2Instances]
  );

  // Traduction en Fiche de Règles Humaines de l'Instance Niveau 3 sélectionnée en Mode 2
  const m2SelectedRulebook = useMemo(() => {
    if (!m2SelectedInstance) return null;
    return translateGenomeToHumanRulebook(m2SelectedInstance.genome, m2SelectedInstance.code);
  }, [m2SelectedInstance]);

  // Traduction en Fiche de Règles Humaines de l'élite sélectionnée en Mode 1
  const m1SelectedRulebook = useMemo(() => {
    if (!m1SelectedElite) return null;
    return translateGenomeToHumanRulebook(m1SelectedElite.genome, m1SelectedElite.code);
  }, [m1SelectedElite]);

  // Mise à jour du profil tour par tour Piste 3 quand m2SelectedInstance change
  useEffect(() => {
    if (m2SelectedInstance) {
      const prof = simulateTurnProfileV2(m2SelectedInstance.genome, 4, 0.5, 90, 4242);
      setM2TurnProfile(prof);
    }
  }, [m2SelectedInstance]);

  // Recalcul instantané des classements Mode 1 et Mode 2 quand les curseurs W1..W4 bougent
  const handleWeightChange = (key: keyof WeightsV2, rawVal: number) => {
    const next = { ...weights, [key]: rawVal };
    const sum =
      next.w1_maitrise + next.w2_adaptation + next.w3_tension + next.w4_simplicite;
    const norm: WeightsV2 =
      sum > 0
        ? {
            w1_maitrise: Number((next.w1_maitrise / sum).toFixed(2)),
            w2_adaptation: Number((next.w2_adaptation / sum).toFixed(2)),
            w3_tension: Number((next.w3_tension / sum).toFixed(2)),
            w4_simplicite: Number((next.w4_simplicite / sum).toFixed(2)),
          }
        : next;
    setWeights(norm);

    if (m1Population.length > 0) {
      const rerankedM1 = reweightAndRankPopulation(m1Population, norm);
      setM1Population(rerankedM1);
      const synth = synthesizePromisingLevel2Families(rerankedM1);
      setM1SynthesizedFamilies(synth);
      if (m1SelectedElite) {
        setM1SelectedElite(
          rerankedM1.find((r) => r.id === m1SelectedElite.id) || rerankedM1[0]
        );
      }
    }

    if (m2Instances.length > 0) {
      const rerankedM2 = reweightAndRankPopulation(m2Instances, norm);
      setM2Instances(rerankedM2);
      if (m2SelectedInstance) {
        setM2SelectedInstance(
          rerankedM2.find((r) => r.id === m2SelectedInstance.id) || rerankedM2[0]
        );
      }
    }
  };

  /**
   * Appel à l'API Gemini côté serveur (/api/gemini/campaign-bilan) pour interpréter le bilan
   */
  const requestGeminiCampaignBilan = async (
    mode: 'mode1_genetic' | 'mode2_cartesian',
    pop: EvaluatedAutomatonV2[],
    familyForMode2: FamilySpecDSL,
    nichesCount: number,
    totalGames: number,
    synthFamilies: SynthesizedLevel2FamilyCard[],
    sensRows: ReturnType<typeof computeSensitivityAnalysisV2>
  ) => {
    if (pop.length === 0) return;

    const fallbackMd =
      mode === 'mode1_genetic'
        ? buildDeterministicBilanMode1(pop, nichesCount, synthFamilies, weights)
        : buildDeterministicBilanMode2(familyForMode2, pop, sensRows, weights);

    if (mode === 'mode1_genetic') {
      setM1AiBilanSource('loading');
      setM1AiBilanMarkdown(fallbackMd);
    } else {
      setM2AiBilanSource('loading');
      setM2AiBilanMarkdown(fallbackMd);
    }

    try {
      const top5Payload = pop.slice(0, 5).map((inst) => {
        const rb = translateGenomeToHumanRulebook(inst.genome, inst.code);
        return {
          rang: inst.rangGlobal,
          code: inst.code,
          scoreGlobal: inst.scoreGlobal,
          M1_maitrise: inst.M1_maitrise,
          M2_adaptation: inst.M2_adaptation,
          M3_tension: inst.M3_tension,
          M4_simplicite: inst.M4_simplicite,
          cRegleStatic: inst.cRegleStatic,
          martingalePenalty: inst.martingalePenalty,
          scoreB0: inst.botScores.B0_Passif,
          scoreB4: inst.botScores.B4_Stratege_Complet,
          treesRegenPctB4: inst.treesRegenPct,
          rulebook: {
            arena: rb.setupSection,
            physics: rb.physicsSection,
            tactics: rb.tacticsSection,
            learningTrack: rb.learningSection,
            piste3Scoring: rb.scoringSection,
          },
        };
      });

      const response = await fetch('/api/gemini/campaign-bilan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          familyId: familyForMode2.family_id,
          totalEvaluated: pop.length,
          totalGamesSimulated: totalGames,
          paretoCount: pop.filter((x) => x.isPareto4D).length,
          nichesDiscovered: nichesCount,
          weights,
          topInstances: top5Payload,
          synthesizedLevel2Families: synthFamilies.map((f) => ({
            id: f.id,
            title: f.title,
            cartesianCount: f.cartesianCount,
            howItWorks: f.howItWorks,
            qualities: f.qualities,
            repMetrics: f.repMetrics,
          })),
          sensitivitySummary: sensRows.slice(0, 5),
          fallbackMarkdown: fallbackMd,
        }),
      });

      const data = await response.json();
      if (mode === 'mode1_genetic') {
        setM1AiBilanMarkdown(data.markdown || fallbackMd);
        setM1AiBilanSource(data.source === 'gemini_api' ? 'gemini_api' : 'deterministic_fallback');
      } else {
        setM2AiBilanMarkdown(data.markdown || fallbackMd);
        setM2AiBilanSource(data.source === 'gemini_api' ? 'gemini_api' : 'deterministic_fallback');
      }
    } catch {
      if (mode === 'mode1_genetic') {
        setM1AiBilanMarkdown(fallbackMd);
        setM1AiBilanSource('deterministic_fallback');
      } else {
        setM2AiBilanMarkdown(fallbackMd);
        setM2AiBilanSource('deterministic_fallback');
      }
    }
  };

  /**
   * =========================================================================
   * EXÉCUTION DU MODE 1 : CAMPAGNE EXPLORATOIRE GÉNÉTIQUE AMBITIEUSE
   * (NSGA-II + MAP-Elites -> Synthèse de Familles Niveau 2 + Bilan IA Gemini)
   * =========================================================================
   */
  const runMode1GeneticCampaign = async (
    popSize = m1PopSize,
    generations = m1Generations,
    gamesPerBot = m1GamesPerBot
  ) => {
    stopRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    const t0 = performance.now();
    let totalGamesSim = 0;
    const archive = new Map<string, EvaluatedAutomatonV2>();

    // On part de la Famille Exploration Génétique Totale (Niveau 2) qui ouvre tous les degrés de liberté
    const seedFamily = PRELOADED_FAMILIES[2];
    const seedGenomes = compileFamilyToGenomes(seedFamily, Math.max(120, popSize * 2));
    let currentSpecs = seedGenomes.slice(0, popSize);
    let allEvaluated: EvaluatedAutomatonV2[] = [];
    let nextId = seedGenomes.length + 1;

    const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Pendant les générations 1..G-1, on évalue rapidement avec CRN sur J=4, effort=50%,
    // puis à la dernière génération on certifie les élites sur l'ensemble des tables et efforts choisis
    const evalGamesDuringEvo = Math.max(20, Math.round(gamesPerBot * 0.5));

    for (let gen = 1; gen <= generations; gen++) {
      if (stopRef.current) break;
      const genBatch: EvaluatedAutomatonV2[] = [];
      const isFinalGen = gen === generations;
      const tablesToRun = isFinalGen ? m1PlayerCounts : [4];
      const effortsToRun = isFinalGen ? m1EffortRates : [0.5];
      const nGamesToRun = isFinalGen ? gamesPerBot : evalGamesDuringEvo;

      for (let i = 0; i < currentSpecs.length; i += 6) {
        if (stopRef.current) break;
        while (pauseRef.current && !stopRef.current) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const end = Math.min(i + 6, currentSpecs.length);
        for (let k = i; k < end; k++) {
          const ev = evaluateAutomatonScientific(
            currentSpecs[k],
            tablesToRun,
            effortsToRun,
            nGamesToRun,
            20261027 + gen * 997,
            weights,
            isFinalGen ? 3 : 2,
            gen
          );
          genBatch.push(ev);
          totalGamesSim +=
            7 * tablesToRun.length * effortsToRun.length * nGamesToRun;
        }

        for (const item of genBatch.slice(i, end)) {
          const existing = archive.get(item.nicheKey);
          if (!existing || item.scoreGlobal > existing.scoreGlobal) {
            archive.set(item.nicheKey, item);
          }
        }

        const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
        setTelemetry({
          phaseLabel: `Mode 1 · Évolution NSGA-II + MAP-Elites — Génération ${gen} / ${generations}`,
          currentStep: gen,
          maxSteps: generations,
          doneInPhase: end,
          totalInPhase: currentSpecs.length,
          totalGamesSimulated: totalGamesSim,
          speedGamesPerSec: Math.round(totalGamesSim / elapsed),
          elapsedSec: elapsed,
          nichesDiscovered: archive.size,
        });
        await yieldToBrowser();
      }

      allEvaluated = reweightAndRankPopulation([...allEvaluated, ...genBatch], weights);
      setM1Population(allEvaluated);
      setM1Archive(new Map(archive));
      if (allEvaluated.length > 0) setM1SelectedElite(allEvaluated[0]);

      if (gen < generations) {
        const paretoMembers = allEvaluated.filter((x) => x.isPareto4D);
        const archiveList = Array.from(archive.values());
        const paretoPool = paretoMembers.length >= 2 ? paretoMembers : allEvaluated.slice(0, 10);
        const nextGenSpecs: CompiledGenomeSpec[] = [];

        for (let p = 0; p < popSize; p++) {
          const parentA = paretoPool[Math.floor(Math.random() * paretoPool.length)];
          const parentB =
            archiveList.length > 0
              ? archiveList[Math.floor(Math.random() * archiveList.length)]
              : paretoPool[Math.floor(Math.random() * paretoPool.length)];
          nextGenSpecs.push(
            breedOffspringGenome(
              parentA,
              parentB,
              nextId++,
              gen + 1,
              m1MaxComplexity,
              m1CreativeMutRate
            )
          );
        }
        currentSpecs = nextGenSpecs;
      }
    }

    const synthFamilies = synthesizePromisingLevel2Families(allEvaluated);
    setM1SynthesizedFamilies(synthFamilies);
    setIsRunning(false);
    setIsPaused(false);

    await requestGeminiCampaignBilan(
      'mode1_genetic',
      allEvaluated,
      seedFamily,
      archive.size,
      totalGamesSim,
      synthFamilies,
      []
    );
  };

  /**
   * =========================================================================
   * EXÉCUTION DU MODE 2 : TEST & OPTIMISATION D'UNE FAMILLE YAML NIVEAU 2
   * (Produit Cartésien Intégral -> Évaluation des Instances Niveau 3 + Bilan IA Gemini)
   * =========================================================================
   */
  const runMode2CartesianCampaign = async (
    familyToTest: FamilySpecDSL = m2ActiveFamily,
    gamesPerBot = m2GamesPerBot,
    strategy = m2EvaluationStrategy
  ) => {
    stopRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    const t0 = performance.now();
    let totalGamesSim = 0;
    const compiledInstances = compileFamilyToGenomes(familyToTest, m2MaxInstancesCap);
    const totalVars = compiledInstances.length;

    if (totalVars === 0) {
      setIsRunning(false);
      return;
    }

    const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
    const results: EvaluatedAutomatonV2[] = [];

    if (strategy === 'full_cartesian') {
      // ÉVALUATION HAUTE PRÉCISION INTÉGRALE DE TOUTES LES INSTANCES NIVEAU 3 DU PRODUIT CARTÉSIEN
      const chunkSize = 6;
      for (let i = 0; i < totalVars; i += chunkSize) {
        if (stopRef.current) break;
        while (pauseRef.current && !stopRef.current) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const end = Math.min(i + chunkSize, totalVars);
        for (let k = i; k < end; k++) {
          const ev = evaluateAutomatonScientific(
            compiledInstances[k],
            m2PlayerCounts,
            m2EffortRates,
            gamesPerBot,
            20261027,
            weights,
            3,
            0
          );
          results.push(ev);
          totalGamesSim +=
            7 * m2PlayerCounts.length * m2EffortRates.length * gamesPerBot;
        }
        const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
        setTelemetry({
          phaseLabel: `Mode 2 · Produit Cartésien Intégral Haute Précision (${familyToTest.family_id})`,
          currentStep: 1,
          maxSteps: 1,
          doneInPhase: end,
          totalInPhase: totalVars,
          totalGamesSimulated: totalGamesSim,
          speedGamesPerSec: Math.round(totalGamesSim / elapsed),
          elapsedSec: elapsed,
          nichesDiscovered: results.length,
        });
        await yieldToBrowser();
      }
    } else {
      // Entonnoir Successive Halving à 3 étages pour les très grands produits cartésiens
      const baseG = Math.max(15, Math.round(gamesPerBot * 0.35));
      for (let i = 0; i < totalVars; i += 10) {
        if (stopRef.current) break;
        const end = Math.min(i + 10, totalVars);
        for (let k = i; k < end; k++) {
          const ev = evaluateAutomatonScientific(
            compiledInstances[k],
            [4],
            [0.5],
            baseG,
            20261027,
            weights,
            1,
            0
          );
          results.push(ev);
          totalGamesSim += 7 * baseG;
        }
        const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
        setTelemetry({
          phaseLabel: `Mode 2 · Étage 1/3 Tamis (${familyToTest.family_id})`,
          currentStep: 1,
          maxSteps: 3,
          doneInPhase: end,
          totalInPhase: totalVars,
          totalGamesSimulated: totalGamesSim,
          speedGamesPerSec: Math.round(totalGamesSim / elapsed),
          elapsedSec: elapsed,
          nichesDiscovered: results.length,
        });
        await yieldToBrowser();
      }

      const rankedR1 = reweightAndRankPopulation(results, weights);
      const topCount = Math.max(4, Math.ceil(rankedR1.length * 0.25));
      const topCandidates = rankedR1.slice(0, topCount);
      const updatedMap = new Map<number, EvaluatedAutomatonV2>();

      for (let i = 0; i < topCandidates.length; i += 4) {
        if (stopRef.current) break;
        const end = Math.min(i + 4, topCandidates.length);
        for (let k = i; k < end; k++) {
          const cand = topCandidates[k];
          const spec: CompiledGenomeSpec = {
            id: cand.id,
            code: cand.code,
            familyId: cand.familyId,
            genome: cand.genome,
            staticComplexity: cand.cRegleStatic,
            summaryChoices: {},
          };
          const ev3 = evaluateAutomatonScientific(
            spec,
            m2PlayerCounts,
            m2EffortRates,
            gamesPerBot,
            20261027,
            weights,
            3,
            0
          );
          updatedMap.set(ev3.id, ev3);
          totalGamesSim += 7 * m2PlayerCounts.length * m2EffortRates.length * gamesPerBot;
        }
        const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
        setTelemetry({
          phaseLabel: `Mode 2 · Certification Finale des Élites (${familyToTest.family_id})`,
          currentStep: 3,
          maxSteps: 3,
          doneInPhase: end,
          totalInPhase: topCandidates.length,
          totalGamesSimulated: totalGamesSim,
          speedGamesPerSec: Math.round(totalGamesSim / elapsed),
          elapsedSec: elapsed,
          nichesDiscovered: results.length,
        });
        await yieldToBrowser();
      }

      for (let i = 0; i < results.length; i++) {
        const up = updatedMap.get(results[i].id);
        if (up) results[i] = up;
      }
    }

    const finalRanked = reweightAndRankPopulation(results, weights);
    setM2Instances(finalRanked);
    if (finalRanked.length > 0) setM2SelectedInstance(finalRanked[0]);
    setIsRunning(false);
    setIsPaused(false);

    const sens = computeSensitivityAnalysisV2(finalRanked);
    await requestGeminiCampaignBilan(
      'mode2_cartesian',
      finalRanked,
      familyToTest,
      finalRanked.length,
      totalGamesSim,
      [],
      sens
    );
  };

  // Au premier chargement, on pré-exécute un lot rapide Mode 1 et Mode 2 pour que l'interface
  // affiche immédiatement des résultats et un bilan IA sans page vide.
  useEffect(() => {
    const bootstrapInitialData = async () => {
      await runMode1GeneticCampaign(24, 3, 20);
    };
    bootstrapInitialData();
    return () => {
      stopRef.current = true;
    };
  }, []);

  /**
   * Passerelle 1-Clic : Transfère une Famille Niveau 2 synthétisée en Mode 1
   * directement dans le Mode 2 et lance son Produit Cartésien Intégral.
   */
  const openSynthesizedFamilyInMode2 = (card: SynthesizedLevel2FamilyCard, autoRun = true) => {
    const fam = structuredClone(card.familySpec);
    setM2CustomFamilies((prev) => {
      const filtered = prev.filter((f) => f.family_id !== fam.family_id);
      return [fam, ...filtered];
    });
    setM2ActiveFamily(fam);
    setM2YamlText(stringifyFamilyToYaml(fam));
    setM2YamlError(null);
    setActiveTab('mode2_cartesian');
    if (autoRun) {
      setTimeout(() => {
        runMode2CartesianCampaign(fam, m2GamesPerBot, 'full_cartesian');
      }, 50);
    }
  };

  const selectPreloadedOrCustomFamilyInMode2 = (fam: FamilySpecDSL, idx: number) => {
    setM2SelectedPresetIdx(idx);
    const cloned = structuredClone(fam);
    setM2ActiveFamily(cloned);
    setM2YamlText(stringifyFamilyToYaml(cloned));
    setM2YamlError(null);
  };

  const handleMode2FileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const raw = String(ev.target?.result || '');
      setM2YamlText(raw);
      const { family, error } = parseFamilyYamlOrJson(raw);
      if (family) {
        setM2ActiveFamily(family);
        setM2CustomFamilies((prev) => [
          family,
          ...prev.filter((f) => f.family_id !== family.family_id),
        ]);
        setM2YamlError(null);
      } else {
        setM2YamlError(error || 'Fichier YAML/JSON invalide.');
      }
    };
    reader.readAsText(file);
  };

  const downloadBlob = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredM2Instances = useMemo(() => {
    return m2Instances.filter((item) => {
      if (m2ParetoOnly && !item.isPareto4D) return false;
      if (m2SearchFilter.trim() !== '') {
        const q = m2SearchFilter.toLowerCase();
        if (
          !item.code.toLowerCase().includes(q) &&
          !item.familyId.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [m2Instances, m2ParetoOnly, m2SearchFilter]);

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#090D16]/95 sticky top-0 z-30">
        {/* Zone 1: Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('mode1_genetic');
          }}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display"
        >
          Forêt Automate Lab v2
        </a>

        {/* Zone 2: 3 Clear Primary Workspace Links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <button
            onClick={() => setActiveTab('mode1_genetic')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'mode1_genetic'
                ? 'text-slate-100 border-cyan-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            01. Mode 1 · Exploration Génétique (→ Familles Niv.2)
          </button>
          <button
            onClick={() => setActiveTab('mode2_cartesian')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'mode2_cartesian'
                ? 'text-slate-100 border-emerald-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            02. Mode 2 · Test Famille YAML (Niv.2 → Instances Niv.3)
          </button>
          <button
            onClick={() => setActiveTab('gemini_spec_doc')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeTab === 'gemini_spec_doc'
                ? 'text-slate-100 border-amber-400'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            03. Spécification YAML (Niv.2) pour Gemini
          </button>
        </nav>

        {/* Zone 3: 1 Primary Context-Aware Action Button */}
        <div className="flex items-center shrink-0">
          {activeTab === 'mode1_genetic' && (
            <button
              onClick={() => runMode1GeneticCampaign(m1PopSize, m1Generations, m1GamesPerBot)}
              disabled={isRunning}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRunning ? 'Campagne en cours...' : 'Lancer Exploration Mode 1'}
            </button>
          )}
          {activeTab === 'mode2_cartesian' && (
            <button
              onClick={() =>
                runMode2CartesianCampaign(m2ActiveFamily, m2GamesPerBot, m2EvaluationStrategy)
              }
              disabled={isRunning}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRunning
                ? 'Évaluation en cours...'
                : `Tester les ${Math.min(m2ExactCartesianCount, m2MaxInstancesCap)} Instances (Mode 2)`}
            </button>
          )}
          {activeTab === 'gemini_spec_doc' && (
            <button
              onClick={() =>
                downloadBlob(
                  'SPEC_FAMILLE_NIVEAU2_POUR_GEMINI.md',
                  LEVEL2_GEMINI_SPEC_DOCUMENT_MD,
                  'text/markdown;charset=utf-8'
                )
              }
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Télécharger le Guide (.md)
            </button>
          )}
        </div>
      </header>

      {/* Bandeau de Distinction Conceptuelle Niveau 2 vs Niveau 3 & Télémétrie */}
      <div className="border-b border-slate-800/80 bg-[#111827] px-6 py-2">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-cyan-400 font-semibold">
              NIVEAU 2 = 1 Famille d&apos;Automates (.yaml avec options $sweep)
            </span>
            <span>→</span>
            <span className="text-emerald-400 font-semibold">
              NIVEAU 3 = 1 Instance d&apos;Automate (toutes options valorisées · {GENOME_SIZE} int32)
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>{telemetry.phaseLabel}</span>
            <span>·</span>
            <span>
              Parties MC :{' '}
              <strong className="text-slate-200">
                {telemetry.totalGamesSimulated.toLocaleString('fr-FR')}
              </strong>
            </span>
            <span>·</span>
            <span>
              Débit :{' '}
              <strong className="text-emerald-400">
                {telemetry.speedGamesPerSec.toLocaleString('fr-FR')} parties/s
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* CONTENEUR PRINCIPAL 1400PX */}
      <main className="max-w-[1400px] w-full mx-auto px-6 py-6 flex-1 space-y-6">
        {/* Barre de progression active lorsque le moteur tourne */}
        {isRunning && (
          <div className="bg-[#111827] border border-cyan-500/40 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
              <span className="text-cyan-300 font-semibold">{telemetry.phaseLabel}</span>
              <div className="flex items-center gap-3">
                <span>
                  {telemetry.doneInPhase} / {telemetry.totalInPhase} automates (
                  {Math.round(
                    (100 * telemetry.doneInPhase) / Math.max(1, telemetry.totalInPhase)
                  )}
                  %)
                </span>
                <button
                  onClick={() => {
                    pauseRef.current = !pauseRef.current;
                    setIsPaused(pauseRef.current);
                  }}
                  className="px-2.5 py-1 bg-amber-500 text-slate-950 font-sans font-semibold cursor-pointer"
                >
                  {isPaused ? 'Reprendre' : 'Pause'}
                </button>
                <button
                  onClick={() => {
                    stopRef.current = true;
                    setIsRunning(false);
                  }}
                  className="px-2.5 py-1 bg-rose-500 text-slate-950 font-sans font-semibold cursor-pointer"
                >
                  Arrêter
                </button>
              </div>
            </div>
            <div className="w-full h-2 bg-slate-950 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (100 * telemetry.doneInPhase) / Math.max(1, telemetry.totalInPhase)
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* ===================================================================
            ONGLET 1 — MODE 1 : EXPLORATION GÉNÉTIQUE AMBITIEUSE
            (Découverte de Familles d'Automates de Niveau 2 à approfondir en Mode 2)
           =================================================================== */}
        {activeTab === 'mode1_genetic' && (
          <div className="space-y-6">
            {/* En-tête du Mode 1 */}
            <div className="bg-[#111827] border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="text-xs font-mono text-cyan-400 uppercase tracking-wider">
                  MODE 1 · EXPLORATION GÉNÉTIQUE QUALITY-DIVERSITY (NSGA-II + MAP-ELITES)
                </div>
                <h1 className="text-xl font-bold text-slate-100">
                  Campagne Exploratoire Ambitieuse → Découverte de Familles d&apos;Automates (Niveau 2)
                </h1>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ce mode explore librement tout l&apos;espace des mécaniques (18 capteurs, 9 verbes, obstacles, casse, élan, piste 2D6, Piste 3) avec mutations créatives (Greffe de Slot, Élagage d&apos;Occam). À la fin de la campagne, le <strong>Bilan IA Gemini</strong> extrait les <strong>Familles d&apos;Automates (Niveau 2 = fichiers .yaml avec $sweep)</strong> les plus prometteuses afin de les tester par produit cartésien en <strong>Mode 2</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setM1PopSize(64);
                    setM1Generations(12);
                    setM1CreativeMutRate(0.35);
                    setM1MaxComplexity(6.5);
                    setM1GamesPerBot(80);
                    setM1PlayerCounts([3, 4, 5, 6]);
                    setM1EffortRates([0.3, 0.5, 0.7]);
                  }}
                  className="px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Restaurer Précision Maximale (Défaut)
                </button>
                <button
                  onClick={() => runMode1GeneticCampaign(m1PopSize, m1Generations, m1GamesPerBot)}
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Lancer la Campagne Génétique Ambitieuse
                </button>
              </div>
            </div>

            {/* Panneau de Configuration Mode 1 + Clés de Compréhension Pédagogiques */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Colonne 1 & 2 : Hyperparamètres Génétiques & Monte-Carlo avec Clés de compréhension */}
              <div className="lg:col-span-2 bg-[#111827] border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    1. Paramétrage de l&apos;Exploration Génétique (Pré-configuré en Précision Maximale)
                  </h2>
                  <button
                    onClick={() => setM1ShowParamGuides(!m1ShowParamGuides)}
                    className="inline-flex items-center gap-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5" />
                    {m1ShowParamGuides
                      ? 'Masquer les clés de compréhension'
                      : 'Afficher les clés de compréhension'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Paramètre 1 : Taille de Population P */}
                  <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-200">
                        Taille de Population (P)
                      </label>
                      <select
                        value={m1PopSize}
                        onChange={(e) => setM1PopSize(Number(e.target.value))}
                        className="bg-[#111827] border border-slate-800 px-2.5 py-1 font-mono text-cyan-300"
                      >
                        <option value={24}>24 individus (Rapide)</option>
                        <option value={48}>48 individus (Équilibré)</option>
                        <option value={64}>64 individus (Max Recommandé)</option>
                        <option value={96}>96 individus (Ultra Intensif)</option>
                      </select>
                    </div>
                    {m1ShowParamGuides && (
                      <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 leading-relaxed">
                        <p>
                          <strong className="text-slate-300">Rôle :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.gaPopSize.whatItIs}
                        </p>
                        <p>
                          <strong className="text-emerald-400">↑ Si augmenté :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.gaPopSize.effectUp}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Paramètre 2 : Nombre de Générations G */}
                  <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-200">
                        Générations Évolutives (G)
                      </label>
                      <select
                        value={m1Generations}
                        onChange={(e) => setM1Generations(Number(e.target.value))}
                        className="bg-[#111827] border border-slate-800 px-2.5 py-1 font-mono text-cyan-300"
                      >
                        <option value={4}>4 générations (Court)</option>
                        <option value={8}>8 générations (Moyen)</option>
                        <option value={12}>12 générations (Max Recommandé)</option>
                        <option value={16}>16 générations (Ultra Intensif)</option>
                      </select>
                    </div>
                    {m1ShowParamGuides && (
                      <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 leading-relaxed">
                        <p>
                          <strong className="text-slate-300">Rôle :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.gaGenerations.whatItIs}
                        </p>
                        <p>
                          <strong className="text-emerald-400">↑ Si augmenté :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.gaGenerations.effectUp}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Paramètre 3 : Taux de Mutation Créative NEAT / Occam */}
                  <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-200">
                        Taux de Mutation Créative (NEAT / Occam)
                      </label>
                      <span className="font-mono font-bold text-cyan-400">
                        {Math.round(m1CreativeMutRate * 100)} %
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={0.5}
                      step={0.05}
                      value={m1CreativeMutRate}
                      onChange={(e) => setM1CreativeMutRate(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    {m1ShowParamGuides && (
                      <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 leading-relaxed">
                        <p>
                          <strong className="text-slate-300">Rôle :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.creativeMutationRate.whatItIs}
                        </p>
                        <p>
                          <strong className="text-emerald-400">↑ À 35 % :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.creativeMutationRate.effectUp}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Paramètre 4 : Plafond de Complexité C_règle */}
                  <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-200">
                        Plafond Complexité sur Table (C_règle max)
                      </label>
                      <input
                        type="number"
                        step={0.5}
                        min={2.0}
                        max={8.0}
                        value={m1MaxComplexity}
                        onChange={(e) => setM1MaxComplexity(Number(e.target.value))}
                        className="w-20 bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-cyan-300 text-center"
                      />
                    </div>
                    {m1ShowParamGuides && (
                      <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 leading-relaxed">
                        <p>
                          <strong className="text-slate-300">Rôle :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.maxAllowedComplexity.whatItIs}
                        </p>
                        <p>
                          <strong className="text-amber-400">↓ Si abaissé (ex. 3.0) :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.maxAllowedComplexity.effectDown}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Paramètre 5 : Fidélité Monte-Carlo CRN */}
                  <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-200">
                        Fidélité Monte-Carlo / Bot (CRN)
                      </label>
                      <select
                        value={m1GamesPerBot}
                        onChange={(e) => setM1GamesPerBot(Number(e.target.value))}
                        className="bg-[#111827] border border-slate-800 px-2.5 py-1 font-mono text-cyan-300"
                      >
                        <option value={30}>30 parties/bot (Rapide)</option>
                        <option value={60}>60 parties/bot (Précis)</option>
                        <option value={80}>80 parties/bot (Max Recommandé)</option>
                        <option value={120}>120 parties/bot (Ultra Certifié)</option>
                      </select>
                    </div>
                    {m1ShowParamGuides && (
                      <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 leading-relaxed">
                        <p>
                          <strong className="text-slate-300">Rôle :</strong>{' '}
                          {MODE1_PARAMETER_GUIDES.mcFidelity.whatItIs}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Paramètre 6 : Tables & Paliers d'effort */}
                  <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold text-slate-200 mb-1">
                          Tables (J joueurs)
                        </label>
                        <select
                          value={m1PlayerCounts.join(',')}
                          onChange={(e) =>
                            setM1PlayerCounts(e.target.value.split(',').map(Number))
                          }
                          className="w-full bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-slate-100"
                        >
                          <option value="3,4,5,6">3, 4, 5, 6J (Complet)</option>
                          <option value="4">4 joueurs (Nominal)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-200 mb-1">
                          Efforts (P̄ parades)
                        </label>
                        <select
                          value={m1EffortRates.join(',')}
                          onChange={(e) =>
                            setM1EffortRates(e.target.value.split(',').map(Number))
                          }
                          className="w-full bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-slate-100"
                        >
                          <option value="0.3,0.5,0.7">30%, 50%, 70% (Complet)</option>
                          <option value="0.5">50% uniquement</option>
                        </select>
                      </div>
                    </div>
                    {m1ShowParamGuides && (
                      <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 leading-relaxed">
                        <strong className="text-slate-300">Rôle :</strong>{' '}
                        {MODE1_PARAMETER_GUIDES.tablesAndEfforts.whatItIs}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Colonne 3 : Pondération des 4 Métriques Scientifiques (Recalcul à la volée) */}
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    2. Pondération des 4 Objectifs (Recalcul Instantané)
                  </h2>
                  <span className="text-xs font-mono text-emerald-400">Somme = 100 %</span>
                </div>

                <div className="space-y-2.5 text-xs">
                  {[
                    {
                      key: 'w1_maitrise' as const,
                      label: 'w1 · M1_Maîtrise (Récompense l’intelligence B4 vs B1)',
                      help: 'Mesure le gain de forêt sauvée par un joueur stratège (SNR + τ_K de Kendall).',
                      val: weights.w1_maitrise,
                    },
                    {
                      key: 'w2_adaptation' as const,
                      label: 'w2 · M2_Adaptation (Plasticité & Anti-Martingale)',
                      help: 'Punit toute martingale mono-action (B2a/B2b/B2c) et valorise la variété tactique.',
                      val: weights.w2_adaptation,
                    },
                    {
                      key: 'w3_tension' as const,
                      label: 'w3 · M3_Tension (Cible 60-80% & Biodiversité Piste 3)',
                      help: 'Cible une survie finale tendue (60-80%) et l’équilibre Arbres / Souches / Sol terrassé.',
                      val: weights.w3_tension,
                    },
                    {
                      key: 'w4_simplicite' as const,
                      label: 'w4 · M4_Simplicité (Fluidité physique & cognitive)',
                      help: 'Pénalise le nombre de manipulations de pions et de conditions à lire par tour.',
                      val: weights.w4_simplicite,
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="bg-slate-950 border border-slate-800 p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-medium">{item.label}</span>
                        <span className="font-mono tabular-nums text-emerald-400 font-bold">
                          {Math.round(item.val * 100)} %
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={0.7}
                        step={0.05}
                        value={item.val}
                        onChange={(e) => handleWeightChange(item.key, Number(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer"
                      />
                      {m1ShowParamGuides && (
                        <p className="text-[11px] text-slate-400">{item.help}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ===============================================================
                BILAN IA GEMINI DU MODE 1 & CARTES DES FAMILLES NIVEAU 2 PROMETTEUSES
               =============================================================== */}
            <div className="bg-[#111827] border border-cyan-500/40 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                    <Sparkles className="w-4 h-4" />
                    <span>
                      BILAN DE CAMPAGNE INTERPRÉTÉ PAR IA (MODE 1 → SYNTHÈSE DE FAMILLES NIVEAU 2)
                    </span>
                    <span>·</span>
                    <span className="text-slate-400">
                      Source :{' '}
                      {m1AiBilanSource === 'gemini_api'
                        ? 'Modèle Gemini API (gemini-3.8-flash)'
                        : m1AiBilanSource === 'loading'
                        ? 'Analyse Gemini en cours...'
                        : 'Synthèse Scientifique Structurée'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">
                    Enseignements de l&apos;Exploration Génétique & Familles d&apos;Automates (Niveau 2) Prometteuses
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      requestGeminiCampaignBilan(
                        'mode1_genetic',
                        m1Population,
                        PRELOADED_FAMILIES[2],
                        m1Archive.size,
                        telemetry.totalGamesSimulated,
                        m1SynthesizedFamilies,
                        []
                      )
                    }
                    disabled={m1AiBilanSource === 'loading' || m1Population.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        m1AiBilanSource === 'loading' ? 'animate-spin' : ''
                      }`}
                    />
                    Régénérer l&apos;Interprétation IA Gemini
                  </button>
                </div>
              </div>

              {/* Cartes des 3 Familles d'Automates de Niveau 2 (.yaml avec $sweep) synthétisées pour passage en Mode 2 */}
              <div className="space-y-3">
                <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  Familles d&apos;Automates (Niveau 2 = fichiers .yaml avec options $sweep) recommandées pour test approfondi en Mode 2 :
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {m1SynthesizedFamilies.map((card) => (
                    <div
                      key={card.id}
                      className="bg-slate-950 border border-slate-800 p-4 flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] font-mono text-cyan-400">
                          <span>{card.badge}</span>
                          <span>{card.cartesianCount} instances Niv.3</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-100">{card.title}</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {card.howItWorks}
                        </p>

                        <div className="border-t border-slate-800/80 pt-2 space-y-1 text-[11px] text-slate-300">
                          {card.qualities.map((q, idx) => (
                            <div key={idx} className="flex items-start gap-1.5">
                              <span className="text-emerald-400 font-bold">·</span>
                              <span>{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800 space-y-2">
                        <button
                          onClick={() => openSynthesizedFamilyInMode2(card, true)}
                          className="w-full py-2 px-3 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>Tester cette Famille Niveau 2 en Mode 2</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setM1PreviewYamlModal(card)}
                            className="py-1.5 px-2 text-[11px] font-mono bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer"
                          >
                            Voir le .yaml (Niv.2)
                          </button>
                          <button
                            onClick={() =>
                              downloadBlob(
                                `${card.id}.yaml`,
                                card.yamlText,
                                'text/yaml;charset=utf-8'
                              )
                            }
                            className="py-1.5 px-2 text-[11px] font-mono bg-[#111827] hover:bg-slate-800 text-cyan-300 border border-slate-800 cursor-pointer"
                          >
                            Télécharger .yaml
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Texte complet du Bilan IA Gemini (Mode 1) */}
              <div className="bg-slate-950 border border-slate-800 p-5 space-y-2">
                <div className="text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
                  SYNTHÈSE ANALYTIQUE DÉTAILLÉE (MODE 1 — ORIENTÉE DÉCOUVERTE DE FAMILLES NIVEAU 2)
                </div>
                <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {m1AiBilanMarkdown}
                </div>
              </div>
            </div>

            {/* Modale d'aperçu du fichier YAML Niveau 2 synthétisé */}
            {m1PreviewYamlModal && (
              <div className="bg-[#111827] border border-cyan-500 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono text-cyan-400">
                      APERÇU DU FICHIER DE FAMILLE NIVEAU 2 (.YAML AVEC OPTIONS $SWEEP)
                    </span>
                    <h3 className="text-sm font-bold text-slate-100">
                      {m1PreviewYamlModal.id}.yaml ({m1PreviewYamlModal.cartesianCount} instances Niveau 3)
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openSynthesizedFamilyInMode2(m1PreviewYamlModal, true)}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-slate-950 cursor-pointer"
                    >
                      Ouvrir et Tester en Mode 2 →
                    </button>
                    <button
                      onClick={() => setM1PreviewYamlModal(null)}
                      className="px-3 py-1.5 text-xs bg-slate-800 text-slate-200 cursor-pointer"
                    >
                      Fermer l&apos;aperçu
                    </button>
                  </div>
                </div>
                <pre className="bg-slate-950 border border-slate-800 p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-96">
                  {m1PreviewYamlModal.yamlText}
                </pre>
              </div>
            )}

            {/* Cartographie Comportementale MAP-Elites (800 niches) & Inspection de l'Élite sélectionnée */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-100">
                  Archive Comportementale MAP-Elites ({m1Archive.size} / 800 niches écologiques illuminées)
                </h3>
                <MapElitesHeatmap
                  archive={m1Archive}
                  activeZ={m1ActiveZSlice}
                  onSelectZ={setM1ActiveZSlice}
                  onSelectAutomaton={(a) => setM1SelectedElite(a)}
                  selectedId={m1SelectedElite?.id ?? -1}
                />
              </div>

              {m1SelectedElite && m1SelectedRulebook && (
                <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <span className="text-[11px] font-mono text-emerald-400">
                        NIVEAU 3 · INSTANCE ÉLITE SÉLECTIONNÉE DANS L&apos;ARCHIVE
                      </span>
                      <h3 className="text-sm font-bold text-slate-100 font-mono">
                        {m1SelectedElite.code} (Score : {m1SelectedElite.scoreGlobal.toFixed(2)})
                      </h3>
                    </div>
                    <button
                      onClick={() =>
                        downloadBlob(
                          `${m1SelectedElite.code}_Niv2.yaml`,
                          exportGenomeToLevel2Yaml(m1SelectedElite.genome, m1SelectedElite.code),
                          'text/yaml;charset=utf-8'
                        )
                      }
                      className="px-2.5 py-1 text-xs font-mono bg-slate-950 border border-slate-800 text-cyan-300 cursor-pointer"
                    >
                      Exporter en .yaml
                    </button>
                  </div>
                  <div className="text-xs space-y-2 text-slate-300">
                    <div>
                      <strong className="text-slate-100">Arène & Fin de piste :</strong>{' '}
                      {m1SelectedRulebook.setupSection.join(' · ')}
                    </div>
                    <div>
                      <strong className="text-slate-100">Lois physiques :</strong>{' '}
                      {m1SelectedRulebook.physicsSection.join(' · ')}
                    </div>
                    <div>
                      <strong className="text-emerald-400">Décompte Piste 3 :</strong>{' '}
                      {m1SelectedRulebook.scoringSection.join(' · ')}
                    </div>
                    <div className="space-y-1.5 pt-1">
                      {m1SelectedRulebook.tacticsSection.map((tr) => (
                        <div
                          key={tr.name}
                          className="bg-slate-950 border border-slate-800 p-2.5 space-y-1"
                        >
                          <div className="font-mono font-bold text-cyan-300">
                            {tr.name} ({tr.machine})
                          </div>
                          {tr.slotsText.map((st, i) => (
                            <div key={i} className="text-[11px] text-slate-300">
                              {st}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            ONGLET 2 — MODE 2 : TEST & OPTIMISATION D'UNE FAMILLE (.YAML NIVEAU 2)
            (Produit Cartésien Intégral -> Évaluation de toutes les Instances Niveau 3)
           =================================================================== */}
        {activeTab === 'mode2_cartesian' && (
          <div className="space-y-6">
            {/* En-tête du Mode 2 */}
            <div className="bg-[#111827] border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                  MODE 2 · ÉVALUATION PAR PRODUIT CARTÉSIEN D&apos;UNE FAMILLE D&apos;AUTOMATES (NIVEAU 2 → NIVEAU 3)
                </div>
                <h1 className="text-xl font-bold text-slate-100">
                  Test & Optimisation d&apos;une Famille YAML (Niveau 2) → Classement des Instances Valorisées (Niveau 3)
                </h1>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Importez ou éditez une <strong>Famille d&apos;Automates de Niveau 2 (fichier .yaml contenant des options $sweep)</strong>. Ce mode génère le <strong>produit cartésien intégral</strong> de toutes ses variantes pour obtenir les <strong>Instances de Niveau 3 (toutes options valorisées)</strong>, les évalue avec la précision maximale face aux 7 Bots, et produit un <strong>Bilan IA Gemini</strong> détaillant le fonctionnement et les avantages des meilleures variantes de Niveau 3.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3.5 py-2 text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  Importer Famille .yaml / .json (Niveau 2)
                  <input
                    type="file"
                    accept=".yaml,.yml,.json"
                    onChange={handleMode2FileImport}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={() =>
                    downloadBlob(
                      `${m2ActiveFamily.family_id}.yaml`,
                      stringifyFamilyToYaml(m2ActiveFamily),
                      'text/yaml;charset=utf-8'
                    )
                  }
                  className="px-3.5 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter .yaml (Niveau 2)
                </button>

                <button
                  onClick={() =>
                    runMode2CartesianCampaign(
                      m2ActiveFamily,
                      m2GamesPerBot,
                      m2EvaluationStrategy
                    )
                  }
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Évaluer les {Math.min(m2ExactCartesianCount, m2MaxInstancesCap)} Instances Niveau 3
                </button>
              </div>
            </div>

            {/* Étape 1 du Mode 2 : Sélection et Édition du Fichier de Famille Niveau 2 (.yaml) */}
            <div className="bg-[#111827] border border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-mono text-cyan-400">
                    ENTRÉE DU MODE 2 : DESCRIPTION DE FAMILLE D&apos;AUTOMATES (NIVEAU 2 = 1 FICHIER .YAML AVEC $SWEEP)
                  </span>
                  <h2 className="text-sm font-semibold text-slate-100">
                    1. Famille Active : <span className="font-mono text-cyan-300">{m2ActiveFamily.family_id}</span> — Produit Cartésien ={' '}
                    <span className="font-mono text-emerald-400">
                      {m2ExactCartesianCount.toLocaleString('fr-FR')} Instances de Niveau 3
                    </span>
                  </h2>
                </div>

                {/* Choix rapide parmi les familles pré-chargées ou issues du Mode 1 */}
                <div className="flex flex-wrap items-center gap-2">
                  {m2CustomFamilies.map((cf, idx) => (
                    <button
                      key={cf.family_id}
                      onClick={() => selectPreloadedOrCustomFamilyInMode2(cf, 100 + idx)}
                      className={`px-3 py-1.5 text-xs font-mono border cursor-pointer ${
                        m2ActiveFamily.family_id === cf.family_id
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ★ {cf.family_id} ({countFamilySweepVariants(cf)} inst.)
                    </button>
                  ))}
                  {PRELOADED_FAMILIES.slice(0, 2).map((fam, idx) => (
                    <button
                      key={fam.family_id}
                      onClick={() => selectPreloadedOrCustomFamilyInMode2(fam, idx)}
                      className={`px-3 py-1.5 text-xs font-mono border cursor-pointer ${
                        m2ActiveFamily.family_id === fam.family_id
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fam.family_id.replace('Famille_', '')} ({countFamilySweepVariants(fam)} inst.)
                    </button>
                  ))}
                </div>
              </div>

              {/* Onglets Éditeur YAML Niveau 2 vs Constructeur Visuel */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setM2YamlText(stringifyFamilyToYaml(m2ActiveFamily));
                      setM2EditorMode('yaml');
                    }}
                    className={`px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                      m2EditorMode === 'yaml'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Fichier YAML de Famille Niveau 2 ($sweep)
                  </button>
                  <button
                    onClick={() => setM2EditorMode('visual')}
                    className={`px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
                      m2EditorMode === 'visual'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Inspecteur Visuel de la Famille Niveau 2
                  </button>
                </div>

                {m2EditorMode === 'yaml' && (
                  <button
                    onClick={() => {
                      const { family, error } = parseFamilyYamlOrJson(m2YamlText);
                      if (family) {
                        setM2ActiveFamily(family);
                        setM2YamlError(null);
                      } else {
                        setM2YamlError(error);
                      }
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
                  >
                    Valider le YAML & Recalculer le Produit Cartésien
                  </button>
                )}
              </div>

              {m2YamlError && (
                <div className="p-3 bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300">
                  {m2YamlError}
                </div>
              )}

              {m2EditorMode === 'yaml' ? (
                <textarea
                  value={m2YamlText}
                  onChange={(e) => setM2YamlText(e.target.value)}
                  rows={14}
                  className="w-full bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200 leading-relaxed"
                  placeholder="Collez ici le fichier .yaml de Famille d'Automates (Niveau 2) généré lors de votre discussion avec Gemini..."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {m2ActiveFamily.tactics.map((tac) => (
                    <div
                      key={tac.id}
                      className="bg-slate-950 border border-slate-800 p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between font-mono border-b border-slate-800 pb-1.5">
                        <span className="font-bold text-slate-100">{tac.id}</span>
                        <span className="text-emerald-400">Machine : {tac.machine}</span>
                      </div>
                      <div className="space-y-1.5 font-mono text-[11px] text-slate-300">
                        {tac.slots.map((s, idx) => (
                          <div key={idx} className="bg-[#111827] p-2 border border-slate-800/80">
                            <span className="text-cyan-400">Slot {idx + 1} :</span> SI{' '}
                            {JSON.stringify(s.cond1)} → {JSON.stringify(s.if_true)} (Sinon{' '}
                            {JSON.stringify(s.if_false)}) · Parade :{' '}
                            <span className="text-amber-300">{JSON.stringify(s.parry_mode)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Étape 2 du Mode 2 : Paramétrage Haute Précision du Produit Cartésien + Clés de compréhension */}
            <div className="bg-[#111827] border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="text-sm font-semibold text-slate-100">
                  2. Paramétrage de l&apos;Évaluation Cartésienne des Instances de Niveau 3 (Pré-configuré en Précision Maximale)
                </h2>
                <button
                  onClick={() => setM2ShowParamGuides(!m2ShowParamGuides)}
                  className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <Info className="w-3.5 h-3.5" />
                  {m2ShowParamGuides
                    ? 'Masquer les clés de compréhension'
                    : 'Afficher les clés de compréhension'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                  <label className="block font-semibold text-slate-200">
                    Mode d&apos;Évaluation du Produit Cartésien
                  </label>
                  <select
                    value={m2EvaluationStrategy}
                    onChange={(e) =>
                      setM2EvaluationStrategy(
                        e.target.value as 'full_cartesian' | 'funnel_sh'
                      )
                    }
                    className="w-full bg-[#111827] border border-slate-800 px-2.5 py-1.5 font-mono text-emerald-300"
                  >
                    <option value="full_cartesian">
                      Intégral Haute Précision (100% des instances)
                    </option>
                    <option value="funnel_sh">
                      Entonnoir Progressif (si &gt; 150 instances)
                    </option>
                  </select>
                  {m2ShowParamGuides && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <strong>Par défaut (Intégral) :</strong> Teste 100 % des instances Niveau 3 générées par le YAML sur toutes les tailles de table et tous les efforts sans aucun élagage précoce.
                    </p>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                  <label className="block font-semibold text-slate-200">
                    Fidélité Monte-Carlo / Instance / Bot (CRN)
                  </label>
                  <select
                    value={m2GamesPerBot}
                    onChange={(e) => setM2GamesPerBot(Number(e.target.value))}
                    className="w-full bg-[#111827] border border-slate-800 px-2.5 py-1.5 font-mono text-emerald-300"
                  >
                    <option value={30}>30 parties/bot (Rapide)</option>
                    <option value={60}>60 parties/bot (Équilibré)</option>
                    <option value={80}>80 parties/bot (Max Recommandé CRN)</option>
                    <option value={120}>120 parties/bot (Certification Finale)</option>
                  </select>
                  {m2ShowParamGuides && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Grâce aux Nombres Aléatoires Communs (CRN), les 7 Bots affrontent exactement les mêmes tirages 2D6 sur chaque instance Niveau 3.
                    </p>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                  <label className="block font-semibold text-slate-200">
                    Tailles de Table & Paliers d&apos;Effort
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={m2PlayerCounts.join(',')}
                      onChange={(e) =>
                        setM2PlayerCounts(e.target.value.split(',').map(Number))
                      }
                      className="bg-[#111827] border border-slate-800 px-2 py-1.5 font-mono text-slate-100"
                    >
                      <option value="3,4,5,6">3, 4, 5, 6J (Tous)</option>
                      <option value="4">4J (Nominal)</option>
                    </select>
                    <select
                      value={m2EffortRates.join(',')}
                      onChange={(e) =>
                        setM2EffortRates(e.target.value.split(',').map(Number))
                      }
                      className="bg-[#111827] border border-slate-800 px-2 py-1.5 font-mono text-slate-100"
                    >
                      <option value="0.3,0.5,0.7">30/50/70%</option>
                      <option value="0.5">50% seul</option>
                    </select>
                  </div>
                  {m2ShowParamGuides && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Avec 4 tables × 3 efforts × 7 Bots × {m2GamesPerBot} parties, chaque instance Niveau 3 est certifiée sur{' '}
                      <strong className="text-slate-200">
                        {4 * 3 * 7 * m2GamesPerBot} parties
                      </strong>
                      .
                    </p>
                  )}
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5 space-y-2">
                  <label className="block font-semibold text-slate-200">
                    Plafond d&apos;Instances du Produit Cartésien
                  </label>
                  <select
                    value={m2MaxInstancesCap}
                    onChange={(e) => setM2MaxInstancesCap(Number(e.target.value))}
                    className="w-full bg-[#111827] border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                  >
                    <option value={64}>Max 64 instances Niveau 3</option>
                    <option value={128}>Max 128 instances Niveau 3</option>
                    <option value={256}>Max 256 instances Niveau 3</option>
                    <option value={512}>Max 512 instances Niveau 3</option>
                  </select>
                  {m2ShowParamGuides && (
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Si votre fichier YAML dépasse ce nombre de combinaisons, un échantillon stratifié régulier est extrait.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ===============================================================
                BILAN IA GEMINI DU MODE 2 (ORIENTÉ INSTANCES DE NIVEAU 3 VALORISÉES)
               =============================================================== */}
            <div className="bg-[#111827] border border-emerald-500/40 p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                    <span>
                      BILAN DE CAMPAGNE INTERPRÉTÉ PAR IA (MODE 2 → ANALYSE DES MEILLEURES INSTANCES NIVEAU 3)
                    </span>
                    <span>·</span>
                    <span className="text-slate-400">
                      Source :{' '}
                      {m2AiBilanSource === 'gemini_api'
                        ? 'Modèle Gemini API (gemini-3.8-flash)'
                        : m2AiBilanSource === 'loading'
                        ? 'Analyse Gemini en cours...'
                        : 'Synthèse Scientifique Structurée'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">
                    Enseignements du Produit Cartésien & Fonctionnement des Meilleures Variantes (Niveau 3)
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      requestGeminiCampaignBilan(
                        'mode2_cartesian',
                        m2Instances,
                        m2ActiveFamily,
                        m2Instances.length,
                        telemetry.totalGamesSimulated,
                        [],
                        m2SensitivityRows
                      )
                    }
                    disabled={m2AiBilanSource === 'loading' || m2Instances.length === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-emerald-300 border border-emerald-500/40 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        m2AiBilanSource === 'loading' ? 'animate-spin' : ''
                      }`}
                    />
                    Relancer l&apos;Analyse IA Gemini (Mode 2)
                  </button>
                  <button
                    onClick={() =>
                      downloadBlob(
                        `bilan_mode2_${m2ActiveFamily.family_id}.md`,
                        m2AiBilanMarkdown,
                        'text/markdown;charset=utf-8'
                      )
                    }
                    disabled={!m2AiBilanMarkdown}
                    className="px-3 py-1.5 text-xs font-mono bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer"
                  >
                    Télécharger Bilan (.md)
                  </button>
                </div>
              </div>

              {m2Instances.length === 0 ? (
                <div className="bg-slate-950 border border-slate-800 p-6 text-center space-y-3">
                  <p className="text-sm text-slate-300">
                    Aucune évaluation cartésienne n&apos;a encore été lancée pour la famille{' '}
                    <code className="text-cyan-400">{m2ActiveFamily.family_id}</code>.
                  </p>
                  <button
                    onClick={() =>
                      runMode2CartesianCampaign(
                        m2ActiveFamily,
                        m2GamesPerBot,
                        m2EvaluationStrategy
                      )
                    }
                    disabled={isRunning}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-400 text-slate-950 cursor-pointer"
                  >
                    Lancer l&apos;évaluation des {Math.min(m2ExactCartesianCount, m2MaxInstancesCap)} instances Niveau 3 maintenant
                  </button>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800 p-5 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {m2AiBilanMarkdown}
                </div>
              )}
            </div>

            {/* Tableau de Classement des Instances de Niveau 3 + Fiche de Règles Humaines Valorisée */}
            {m2Instances.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Colonne Gauche (7 cols) : Classement des Instances de Niveau 3 */}
                <div className="lg:col-span-7 bg-[#111827] border border-slate-800 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[11px] font-mono text-emerald-400">
                        RÉSULTATS DU PRODUIT CARTÉSIEN : INSTANCES DE NIVEAU 3 (TOUTES OPTIONS VALORISÉES)
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">
                        Classement des {filteredM2Instances.length} Instances de Niveau 3 évaluées
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={m2ParetoOnly}
                          onChange={(e) => setM2ParetoOnly(e.target.checked)}
                          className="accent-emerald-500"
                        />
                        Front de Pareto 4D
                      </label>
                      <button
                        onClick={() =>
                          downloadBlob(
                            `instances_niveau3_${m2ActiveFamily.family_id}.csv`,
                            exportVariantsRankingCsvV2(m2Instances),
                            'text/csv;charset=utf-8'
                          )
                        }
                        className="px-2.5 py-1 font-mono bg-slate-950 border border-slate-800 text-slate-200 cursor-pointer"
                      >
                        Export .CSV
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                      <thead className="bg-slate-950 text-slate-400 sticky top-0">
                        <tr className="border-b border-slate-800">
                          <th className="py-2 px-2.5">Rang</th>
                          <th className="py-2 px-2.5">Instance Niveau 3</th>
                          <th className="py-2 px-2.5 text-right">Score</th>
                          <th className="py-2 px-2.5 text-right">M1 Maît.</th>
                          <th className="py-2 px-2.5 text-right">M2 Adap.</th>
                          <th className="py-2 px-2.5 text-right">M3 Tens.</th>
                          <th className="py-2 px-2.5 text-right">M4 Simp.</th>
                          <th className="py-2 px-2.5 text-right">Forêt B4</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredM2Instances.map((item) => {
                          const isSelected = m2SelectedInstance?.id === item.id;
                          return (
                            <tr
                              key={item.id}
                              onClick={() => setM2SelectedInstance(item)}
                              className={`cursor-pointer transition ${
                                isSelected
                                  ? 'bg-emerald-500/15 text-slate-100'
                                  : 'hover:bg-slate-900/80 text-slate-300'
                              }`}
                            >
                              <td className="py-2 px-2.5 font-bold text-emerald-400">
                                #{item.rangGlobal}
                                {item.isPareto4D ? ' ★' : ''}
                              </td>
                              <td className="py-2 px-2.5 font-semibold text-slate-100">
                                {item.code}
                              </td>
                              <td className="py-2 px-2.5 text-right font-bold text-slate-100">
                                {item.scoreGlobal.toFixed(2)}
                              </td>
                              <td className="py-2 px-2.5 text-right text-cyan-300">
                                {item.M1_maitrise.toFixed(1)}
                              </td>
                              <td className="py-2 px-2.5 text-right text-emerald-300">
                                {item.M2_adaptation.toFixed(1)}
                              </td>
                              <td className="py-2 px-2.5 text-right text-amber-300">
                                {item.M3_tension.toFixed(1)}
                              </td>
                              <td className="py-2 px-2.5 text-right text-slate-300">
                                {item.M4_simplicite.toFixed(1)}
                              </td>
                              <td className="py-2 px-2.5 text-right">
                                {item.botScores.B4_Stratege_Complet.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Colonne Droite (5 cols) : Fiche Détaillée de l'Instance Niveau 3 Sélectionnée (Toutes options valorisées) */}
                {m2SelectedInstance && m2SelectedRulebook && (
                  <div className="lg:col-span-5 bg-[#111827] border border-emerald-500/40 p-5 space-y-4">
                    <div className="border-b border-slate-800 pb-3">
                      <span className="text-[11px] font-mono text-emerald-400">
                        NIVEAU 3 · FICHE DE RÈGLES HUMAINES DE L&apos;INSTANCE VALORISÉE
                      </span>
                      <h3 className="text-base font-bold text-slate-100 font-mono mt-0.5">
                        {m2SelectedInstance.code} — Rang #{m2SelectedInstance.rangGlobal} (Score{' '}
                        {m2SelectedInstance.scoreGlobal.toFixed(2)})
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Toutes les options <code className="text-cyan-400">$sweep</code> de la famille Niveau 2 ont ici reçu leur valeur fixe définitive :
                      </p>
                    </div>

                    <Radar4DChart selected={m2SelectedInstance} top3={m2Instances.slice(0, 3)} />
                    <BotsResponseChart selected={m2SelectedInstance} />

                    <div className="bg-slate-950 border border-slate-800 p-4 space-y-2.5 text-xs">
                      <div className="font-mono font-bold text-emerald-400 border-b border-slate-800 pb-1.5">
                        PARAMÈTRES VALORISÉS & RÈGLES SUR TABLE (NIVEAU 3)
                      </div>
                      <div>
                        <strong className="text-slate-100">Arène & Déplacement :</strong>{' '}
                        <span className="text-slate-300">
                          {m2SelectedRulebook.setupSection.join(' · ')}
                        </span>
                      </div>
                      <div>
                        <strong className="text-slate-100">Physique (Casse & Élan) :</strong>{' '}
                        <span className="text-slate-300">
                          {m2SelectedRulebook.physicsSection.join(' · ')}
                        </span>
                      </div>
                      <div>
                        <strong className="text-slate-100">Piste d&apos;Apprentissage 2D6 :</strong>{' '}
                        <span className="text-slate-300">
                          {m2SelectedRulebook.learningSection.join(' · ')}
                        </span>
                      </div>
                      <div>
                        <strong className="text-emerald-400">Décompte Final Piste 3 :</strong>{' '}
                        <span className="text-slate-200">
                          {m2SelectedRulebook.scoringSection.join(' · ')}
                        </span>
                      </div>

                      <div className="space-y-2 pt-2">
                        {m2SelectedRulebook.tacticsSection.map((tr) => (
                          <div
                            key={tr.name}
                            className="bg-[#111827] border border-slate-800 p-2.5 space-y-1"
                          >
                            <div className="font-mono font-bold text-cyan-300">
                              {tr.name} ({tr.machine})
                            </div>
                            {tr.slotsText.map((st, idx) => (
                              <div key={idx} className="text-[11px] text-slate-300">
                                {st}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {m2TurnProfile && <TurnByTurnCurveChart profile={m2TurnProfile} />}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            ONGLET 3 — DOCUMENT STATIQUE DE SPÉCIFICATION YAML NIVEAU 2 POUR GEMINI
            (À joindre en PJ dans vos discussions Gemini externes)
           =================================================================== */}
        {activeTab === 'gemini_spec_doc' && (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-amber-500/40 p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-3xl">
                <div className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                  DOCUMENT DE RÉFÉRENCE STATIQUE · CONCEPTION ASSISTÉE PAR IA (PIÈCE JOINTE GEMINI)
                </div>
                <h1 className="text-xl font-bold text-slate-100">
                  Spécification Officielle des Fichiers de Familles d&apos;Automates (Niveau 2 .yaml) pour Gemini
                </h1>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Téléchargez ce document <code>.md</code> ou copiez-le en 1 clic pour le fournir en pièce jointe lors de vos discussions avec Gemini. Il lui enseigne la distinction entre une <strong>Famille d&apos;Automates (Niveau 2, fichier .yaml avec opérateurs $sweep)</strong> et une <strong>Instance d&apos;Automate (Niveau 3, issue du produit cartésien)</strong>, ainsi que la grammaire exacte des 18 capteurs, 9 verbes, lois de casse/élan et règles Piste 3 pour qu&apos;il vous génère des fichiers <code>.yaml</code> directement importables dans le <strong>Mode 2</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(LEVEL2_GEMINI_SPEC_DOCUMENT_MD);
                    setCopiedSpecDoc(true);
                    setTimeout(() => setCopiedSpecDoc(false), 2500);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-950 hover:bg-slate-800 text-amber-300 border border-amber-500/50 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copiedSpecDoc ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copié dans le presse-papiers !
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copier tout le Document pour Gemini
                    </>
                  )}
                </button>

                <button
                  onClick={() =>
                    downloadBlob(
                      'SPEC_FAMILLE_NIVEAU2_POUR_GEMINI.md',
                      LEVEL2_GEMINI_SPEC_DOCUMENT_MD,
                      'text/markdown;charset=utf-8'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Télécharger SPEC_FAMILLE_NIVEAU2_POUR_GEMINI.md
                </button>
              </div>
            </div>

            {/* Mode d'emploi en 3 étapes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-[#111827] border border-slate-800 p-4 space-y-1.5">
                <div className="font-mono font-bold text-amber-400">
                  ÉTAPE 1 · JOINDRE LE DOCUMENT À GEMINI
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Téléchargez <code>SPEC_FAMILLE_NIVEAU2_POUR_GEMINI.md</code> et glissez-le en pièce jointe d&apos;une discussion Gemini.
                </p>
              </div>
              <div className="bg-[#111827] border border-slate-800 p-4 space-y-1.5">
                <div className="font-mono font-bold text-cyan-400">
                  ÉTAPE 2 · CO-CONCEVOIR UNE FAMILLE NIVEAU 2 (.YAML)
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Discutez avec Gemini des mécaniques souhaitées et demandez-lui de placer des <code>$sweep: [...]</code> sur les paramètres en débat (pour obtenir entre 8 et 128 variantes).
                </p>
              </div>
              <div className="bg-[#111827] border border-slate-800 p-4 space-y-1.5">
                <div className="font-mono font-bold text-emerald-400">
                  ÉTAPE 3 · IMPORTER EN MODE 2 & DÉPARTAGER LES INSTANCES NIVEAU 3
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Importez ou collez le fichier <code>.yaml</code> de Niveau 2 dans l&apos;onglet <strong>02. Mode 2</strong> : l&apos;outil évalue 100 % des instances Niveau 3 du produit cartésien.
                </p>
              </div>
            </div>

            {/* Contenu Intégral du Document Statique */}
            <div className="bg-[#111827] border border-slate-800 p-6">
              <pre className="bg-slate-950 border border-slate-800 p-5 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {LEVEL2_GEMINI_SPEC_DOCUMENT_MD}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
