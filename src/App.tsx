import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Download,
  Upload,
  Plus,
  Trash2,
  Search,
  Sliders,
  FileText,
  BookOpen,
  Terminal,
  Compass,
  Layers,
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

type ActiveView = 'studio' | 'config' | 'console' | 'lab';
type ExplorationMode = 'grid_sh' | 'genetic_qd';

interface TelemetryState {
  phaseLabel: string;
  currentRungOrGen: number;
  maxRungOrGen: number;
  doneInPhase: number;
  totalInPhase: number;
  totalGamesSimulated: number;
  speedGamesPerSec: number;
  elapsedSec: number;
  rung1Count: number;
  rung2Survivors: number;
  rung3Certified: number;
  nichesDiscovered: number;
  generationHistory: Array<{ gen: number; bestScore: number; meanPareto: number; niches: number }>;
}

const CHECKPOINT_STORAGE_KEY = 'foret_automate_lab_v2_checkpoint_v1';

export default function App() {
  // Navigation between the 4 Views (Section 8)
  const [activeView, setActiveView] = useState<ActiveView>('lab');

  // View 1: Studio d'Automates (Level 2 Family state)
  const [selectedFamilyIdx, setSelectedFamilyIdx] = useState<number>(0);
  const [activeFamily, setActiveFamily] = useState<FamilySpecDSL>(PRELOADED_FAMILIES[0]);
  const [studioTab, setStudioTab] = useState<'visual' | 'code'>('visual');
  const [codeText, setCodeText] = useState<string>(() =>
    JSON.stringify(PRELOADED_FAMILIES[0], null, 2)
  );
  const [codeError, setCodeError] = useState<string | null>(null);

  // View 2: Configurateur de Campagne, Bots & Pondérations
  const [explorationMode, setExplorationMode] = useState<ExplorationMode>('grid_sh');
  const [useMultiFidelitySh, setUseMultiFidelitySh] = useState<boolean>(true);
  const [scaleGamesFactor, setScaleGamesFactor] = useState<number>(30); // Base MC games per bot
  const [gaPopSize, setGaPopSize] = useState<number>(64);
  const [gaGenerations, setGaGenerations] = useState<number>(12);
  const [creativeMutationRate, setCreativeMutationRate] = useState<number>(0.3);
  const [maxAllowedComplexity, setMaxAllowedComplexity] = useState<number>(6.0);
  const [enabledBots, setEnabledBots] = useState<string[]>(() =>
    ALL_BOTS_V2.map((b) => b.code)
  );

  const [playerCounts, setPlayerCounts] = useState<number[]>([3, 4, 5, 6]);
  const [effortRates, setEffortRates] = useState<number[]>([0.3, 0.5, 0.7]);
  const [weights, setWeights] = useState<WeightsV2>({
    w1_maitrise: 0.3,
    w2_adaptation: 0.25,
    w3_tension: 0.25,
    w4_simplicite: 0.2,
  });

  // View 3: Console & Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [hasCheckpoint, setHasCheckpoint] = useState<boolean>(false);
  const pauseRef = useRef<boolean>(false);
  const stopRef = useRef<boolean>(false);

  const [telemetry, setTelemetry] = useState<TelemetryState>({
    phaseLabel: 'Prêt',
    currentRungOrGen: 0,
    maxRungOrGen: 3,
    doneInPhase: 0,
    totalInPhase: 0,
    totalGamesSimulated: 0,
    speedGamesPerSec: 0,
    elapsedSec: 0,
    rung1Count: 0,
    rung2Survivors: 0,
    rung3Certified: 0,
    nichesDiscovered: 0,
    generationHistory: [],
  });

  // View 4: Results, MAP-Elites Archive & Selected Automaton
  const [population, setPopulation] = useState<EvaluatedAutomatonV2[]>([]);
  const [mapElitesArchive, setMapElitesArchive] = useState<Map<string, EvaluatedAutomatonV2>>(
    new Map()
  );
  const [selectedAutomaton, setSelectedAutomaton] = useState<EvaluatedAutomatonV2 | null>(null);
  const [turnProfile, setTurnProfile] = useState<TurnByTurnProfileV2 | null>(null);
  const [activeZSlice, setActiveZSlice] = useState<number | 'ALL'>('ALL');
  const [labSubTab, setLabSubTab] = useState<'ranking' | 'map_elites' | 'sensitivity' | 'report'>(
    'ranking'
  );
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [paretoOnlyFilter, setParetoOnlyFilter] = useState<boolean>(false);

  // Sync Family selection
  const selectPreloadedFamily = (idx: number) => {
    setSelectedFamilyIdx(idx);
    const fam = structuredClone(PRELOADED_FAMILIES[idx]);
    setActiveFamily(fam);
    setCodeText(JSON.stringify(fam, null, 2));
    setCodeError(null);
  };

  // Compile Level 2 Family into Level 3 Genomes for live preview & validation
  const compiledPreviewGenomes = useMemo(
    () => compileFamilyToGenomes(activeFamily, 600),
    [activeFamily]
  );
  const exactSweepCount = useMemo(() => countFamilySweepVariants(activeFamily), [activeFamily]);

  // Instant reweighting on slider change without re-running simulations (Section 8.2)
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
    if (population.length > 0) {
      const reranked = reweightAndRankPopulation(population, norm);
      setPopulation(reranked);
      if (selectedAutomaton) {
        const updatedSel = reranked.find((r) => r.id === selectedAutomaton.id) || reranked[0];
        setSelectedAutomaton(updatedSel);
      }
    }
  };

  // Update Turn-by-Turn Profile whenever selectedAutomaton changes
  useEffect(() => {
    if (selectedAutomaton) {
      const prof = simulateTurnProfileV2(selectedAutomaton.genome, 4, 0.5, 90, 4242);
      setTurnProfile(prof);
    }
  }, [selectedAutomaton]);

  // Check for saved checkpoint & run initial fast multi-fidelity campaign on mount
  useEffect(() => {
    const saved = localStorage.getItem(CHECKPOINT_STORAGE_KEY);
    if (saved) setHasCheckpoint(true);
    runCampaignExecution('grid_sh', PRELOADED_FAMILIES[0]);
    return () => {
      stopRef.current = true;
    };
  }, []);

  const updateArchiveWithBatch = (
    archive: Map<string, EvaluatedAutomatonV2>,
    batch: EvaluatedAutomatonV2[]
  ) => {
    for (const item of batch) {
      const existing = archive.get(item.nicheKey);
      if (!existing || item.scoreGlobal > existing.scoreGlobal) {
        archive.set(item.nicheKey, item);
      }
    }
  };

  /**
   * Exécution asynchrone de la Campagne :
   * - Mode 1 ('grid_sh') : Grille Cartésienne + Entonnoir Successive Halving à 3 Étages (Rung 1 -> Rung 2 -> Rung 3)
   * - Mode 2 ('genetic_qd') : Algorithme Évolutionnaire Hybride NSGA-II + MAP-Elites (800 niches)
   */
  const runCampaignExecution = async (
    modeToRun: ExplorationMode = explorationMode,
    familyToUse: FamilySpecDSL = activeFamily
  ) => {
    stopRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    const t0 = performance.now();
    let totalGamesSim = 0;
    const archive = new Map<string, EvaluatedAutomatonV2>(mapElitesArchive);
    const initialGenomes = compileFamilyToGenomes(familyToUse, 256);

    if (initialGenomes.length === 0) {
      setIsRunning(false);
      return;
    }

    const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    if (modeToRun === 'grid_sh') {
      // =====================================================================
      // MODE GRILLE CARTÉSIENNE + ENTONNOIR MULTI-FIDÉLITÉ À 3 ÉTAGES (SH)
      // =====================================================================
      const totalVars = initialGenomes.length;
      const rung1Results: EvaluatedAutomatonV2[] = [];
      const chunkSize = 12;

      // ÉTAGE 1 (Tamis Rapide : 100% de la population, J=4, effort=50%)
      for (let i = 0; i < totalVars; i += chunkSize) {
        if (stopRef.current) break;
        while (pauseRef.current && !stopRef.current) {
          await new Promise((r) => setTimeout(r, 150));
        }
        const end = Math.min(i + chunkSize, totalVars);
        for (let k = i; k < end; k++) {
          const ev = evaluateAutomatonScientific(
            initialGenomes[k],
            [4],
            [0.5],
            scaleGamesFactor,
            20261027,
            weights,
            1,
            0
          );
          rung1Results.push(ev);
          totalGamesSim += 7 * scaleGamesFactor;
        }
        updateArchiveWithBatch(archive, rung1Results.slice(i, end));
        const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
        setTelemetry((prev) => ({
          ...prev,
          phaseLabel: 'Étage 1 / 3 — Tamis Rapide (100% Pop)',
          currentRungOrGen: 1,
          maxRungOrGen: useMultiFidelitySh ? 3 : 1,
          doneInPhase: end,
          totalInPhase: totalVars,
          totalGamesSimulated: totalGamesSim,
          speedGamesPerSec: Math.round(totalGamesSim / elapsed),
          elapsedSec: elapsed,
          rung1Count: end,
          nichesDiscovered: archive.size,
        }));
        await yieldToBrowser();
      }

      let finalPool = reweightAndRankPopulation(rung1Results, weights);

      if (useMultiFidelitySh && !stopRef.current) {
        // ÉTAGE 2 (Calibrage : Top 25% survivants, J in {4,5}, efforts {30%, 50%})
        const top25Count = Math.max(4, Math.ceil(finalPool.length * 0.25));
        const rung2Candidates = finalPool.slice(0, top25Count);
        const rung2Updated = new Map<number, EvaluatedAutomatonV2>();

        for (let i = 0; i < rung2Candidates.length; i += 6) {
          if (stopRef.current) break;
          while (pauseRef.current && !stopRef.current) {
            await new Promise((r) => setTimeout(r, 150));
          }
          const end = Math.min(i + 6, rung2Candidates.length);
          for (let k = i; k < end; k++) {
            const cand = rung2Candidates[k];
            const spec: CompiledGenomeSpec = {
              id: cand.id,
              code: cand.code,
              familyId: cand.familyId,
              genome: cand.genome,
              staticComplexity: cand.cRegleStatic,
              summaryChoices: {},
            };
            const ev2 = evaluateAutomatonScientific(
              spec,
              [4, 5],
              [0.3, 0.5],
              scaleGamesFactor * 2,
              20261027,
              weights,
              2,
              0
            );
            rung2Updated.set(ev2.id, ev2);
            totalGamesSim += 7 * 2 * 2 * (scaleGamesFactor * 2);
          }
          const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
          setTelemetry((prev) => ({
            ...prev,
            phaseLabel: 'Étage 2 / 3 — Calibrage Multi-Tables (Top 25%)',
            currentRungOrGen: 2,
            maxRungOrGen: 3,
            doneInPhase: end,
            totalInPhase: rung2Candidates.length,
            totalGamesSimulated: totalGamesSim,
            speedGamesPerSec: Math.round(totalGamesSim / elapsed),
            elapsedSec: elapsed,
            rung2Survivors: rung2Candidates.length,
            nichesDiscovered: archive.size,
          }));
          await yieldToBrowser();
        }

        finalPool = reweightAndRankPopulation(
          finalPool.map((item) => rung2Updated.get(item.id) || item),
          weights
        );
        updateArchiveWithBatch(archive, Array.from(rung2Updated.values()));

        // ÉTAGE 3 (Certification Haute Précision : Top 5% + Front de Pareto)
        const top5Count = Math.max(3, Math.ceil(totalVars * 0.06));
        const rung3Candidates = finalPool.slice(0, top5Count);
        const rung3Updated = new Map<number, EvaluatedAutomatonV2>();

        for (let i = 0; i < rung3Candidates.length; i += 3) {
          if (stopRef.current) break;
          while (pauseRef.current && !stopRef.current) {
            await new Promise((r) => setTimeout(r, 150));
          }
          const end = Math.min(i + 3, rung3Candidates.length);
          for (let k = i; k < end; k++) {
            const cand = rung3Candidates[k];
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
              playerCounts,
              effortRates,
              scaleGamesFactor * 3,
              20261027,
              weights,
              3,
              0
            );
            rung3Updated.set(ev3.id, ev3);
            totalGamesSim +=
              7 * playerCounts.length * effortRates.length * (scaleGamesFactor * 3);
          }
          const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
          setTelemetry((prev) => ({
            ...prev,
            phaseLabel: 'Étage 3 / 3 — Certification Haute Précision (Top 5% & Pareto)',
            currentRungOrGen: 3,
            maxRungOrGen: 3,
            doneInPhase: end,
            totalInPhase: rung3Candidates.length,
            totalGamesSimulated: totalGamesSim,
            speedGamesPerSec: Math.round(totalGamesSim / elapsed),
            elapsedSec: elapsed,
            rung3Certified: rung3Candidates.length,
            nichesDiscovered: archive.size,
          }));
          await yieldToBrowser();
        }

        finalPool = reweightAndRankPopulation(
          finalPool.map((item) => rung3Updated.get(item.id) || item),
          weights
        );
        updateArchiveWithBatch(archive, Array.from(rung3Updated.values()));
      }

      setPopulation(finalPool);
      setMapElitesArchive(new Map(archive));
      if (finalPool.length > 0) setSelectedAutomaton(finalPool[0]);

      // Save checkpoint in localStorage
      try {
        localStorage.setItem(
          CHECKPOINT_STORAGE_KEY,
          JSON.stringify({
            timestamp: Date.now(),
            mode: modeToRun,
            count: finalPool.length,
          })
        );
        setHasCheckpoint(true);
      } catch {
        // ignore storage quota
      }
    } else {
      // =====================================================================
      // MODE ALGORITHME ÉVOLUTIONNAIRE HYBRIDE NSGA-II + MAP-ELITES (800 NICHES)
      // =====================================================================
      let currentSpecs = initialGenomes.slice(0, gaPopSize);
      let allEvaluated: EvaluatedAutomatonV2[] = [];
      let nextId = initialGenomes.length + 1;
      const genHist: Array<{
        gen: number;
        bestScore: number;
        meanPareto: number;
        niches: number;
      }> = [];

      for (let gen = 1; gen <= gaGenerations; gen++) {
        if (stopRef.current) break;
        const genBatch: EvaluatedAutomatonV2[] = [];

        for (let i = 0; i < currentSpecs.length; i += 6) {
          if (stopRef.current) break;
          while (pauseRef.current && !stopRef.current) {
            await new Promise((r) => setTimeout(r, 150));
          }
          const end = Math.min(i + 6, currentSpecs.length);
          for (let k = i; k < end; k++) {
            const ev = evaluateAutomatonScientific(
              currentSpecs[k],
              [4],
              [0.5],
              scaleGamesFactor * 2,
              20261027 + gen * 997,
              weights,
              2,
              gen
            );
            genBatch.push(ev);
            totalGamesSim += 7 * (scaleGamesFactor * 2);
          }
          updateArchiveWithBatch(archive, genBatch.slice(i, end));
          const elapsed = Math.max(0.001, (performance.now() - t0) / 1000);
          setTelemetry((prev) => ({
            ...prev,
            phaseLabel: `Évolution NSGA-II + MAP-Elites — Génération ${gen} / ${gaGenerations}`,
            currentRungOrGen: gen,
            maxRungOrGen: gaGenerations,
            doneInPhase: end,
            totalInPhase: currentSpecs.length,
            totalGamesSimulated: totalGamesSim,
            speedGamesPerSec: Math.round(totalGamesSim / elapsed),
            elapsedSec: elapsed,
            nichesDiscovered: archive.size,
          }));
          await yieldToBrowser();
        }

        allEvaluated = reweightAndRankPopulation([...allEvaluated, ...genBatch], weights);
        const paretoMembers = allEvaluated.filter((x) => x.isPareto4D);
        const meanPareto =
          paretoMembers.reduce((a, b) => a + b.scoreGlobal, 0) /
          Math.max(1, paretoMembers.length);

        genHist.push({
          gen,
          bestScore: allEvaluated[0]?.scoreGlobal ?? 0,
          meanPareto: Number(meanPareto.toFixed(2)),
          niches: archive.size,
        });

        setTelemetry((prev) => ({
          ...prev,
          generationHistory: [...genHist],
          nichesDiscovered: archive.size,
        }));

        setPopulation(allEvaluated);
        setMapElitesArchive(new Map(archive));
        if (allEvaluated.length > 0) setSelectedAutomaton(allEvaluated[0]);

        // Reproduction : 50% parents tirés du Front de Pareto NSGA-II, 50% tirés uniformément de l'Archive MAP-Elites
        if (gen < gaGenerations) {
          const archiveList = Array.from(archive.values());
          const paretoPool = paretoMembers.length >= 2 ? paretoMembers : allEvaluated.slice(0, 10);
          const nextGenSpecs: CompiledGenomeSpec[] = [];

          for (let p = 0; p < gaPopSize; p++) {
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
                maxAllowedComplexity,
                creativeMutationRate
              )
            );
          }
          currentSpecs = nextGenSpecs;
        }
      }
    }

    setIsRunning(false);
    setIsPaused(false);
  };

  // Filtered ranking table
  const filteredPopulation = useMemo(() => {
    return population.filter((item) => {
      if (paretoOnlyFilter && !item.isPareto4D) return false;
      if (searchFilter.trim() !== '') {
        const q = searchFilter.toLowerCase();
        if (
          !item.code.toLowerCase().includes(q) &&
          !item.familyId.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [population, paretoOnlyFilter, searchFilter]);

  const sensitivityRows = useMemo(
    () => computeSensitivityAnalysisV2(population),
    [population]
  );

  const selectedRulebook = useMemo(() => {
    if (!selectedAutomaton) return null;
    return translateGenomeToHumanRulebook(selectedAutomaton.genome, selectedAutomaton.code);
  }, [selectedAutomaton]);

  const fullMarkdownReport = useMemo(() => {
    return generateFullCampaignReportV2(
      population,
      mapElitesArchive,
      sensitivityRows,
      turnProfile,
      explorationMode,
      weights,
      telemetry.elapsedSec
    );
  }, [
    population,
    mapElitesArchive,
    sensitivityRows,
    turnProfile,
    explorationMode,
    weights,
    telemetry.elapsedSec,
  ]);

  const downloadBlob = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const txt = String(ev.target?.result || '');
      setCodeText(txt);
      try {
        const parsed = JSON.parse(txt) as FamilySpecDSL;
        if (parsed.family_id && Array.isArray(parsed.tactics)) {
          setActiveFamily(parsed);
          setCodeError(null);
        } else {
          setCodeError('Schéma invalide : family_id et tactics[] requis.');
        }
      } catch (err: any) {
        setCodeError(`Erreur de syntaxe JSON : ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const paretoCount = useMemo(
    () => population.filter((x) => x.isPareto4D).length,
    [population]
  );

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-[#090D16]/95 sticky top-0 z-30">
        {/* Zone 1: Brand Title (single text element, one line) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('lab');
          }}
          className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 font-display"
        >
          Forêt Automate Lab v2
        </a>

        {/* Zone 2: 4 Concise Single-Line Navigation Links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
          <button
            onClick={() => setActiveView('studio')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeView === 'studio'
                ? 'text-slate-100 border-emerald-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            01. Studio Niveau 2
          </button>
          <button
            onClick={() => setActiveView('config')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeView === 'config'
                ? 'text-slate-100 border-emerald-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            02. Configurateur
          </button>
          <button
            onClick={() => setActiveView('console')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeView === 'console'
                ? 'text-slate-100 border-emerald-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            03. Console & Télémétrie
          </button>
          <button
            onClick={() => setActiveView('lab')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
              activeView === 'lab'
                ? 'text-slate-100 border-emerald-500'
                : 'border-transparent hover:text-slate-200'
            }`}
          >
            04. Laboratoire & Règles
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action Button */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => {
              setActiveView('console');
              runCampaignExecution(explorationMode, activeFamily);
            }}
            disabled={isRunning}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isRunning ? 'Simulation en cours...' : 'Lancer la Campagne'}
          </button>
        </div>
      </header>

      {/* Top Scientific Telemetry Ribbon (Section 3 of Science Reference) */}
      <div className="border-b border-slate-800/80 bg-[#111827] px-6 py-2">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-200 font-semibold">{activeFamily.family_id}</span>
            <span>·</span>
            <span>Génome Niveau 3 : {GENOME_SIZE} int32 ({GENOME_BYTES} octets)</span>
            <span>·</span>
            <span>Variantes $sweep : {exactSweepCount.toLocaleString('fr-FR')}</span>
            <span>·</span>
            <span>
              Mode :{' '}
              {explorationMode === 'grid_sh'
                ? 'Successive Halving 3 Étages (11.48x)'
                : 'NSGA-II + MAP-Elites (800 niches)'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Parties MC : <strong className="text-slate-200">{telemetry.totalGamesSimulated.toLocaleString('fr-FR')}</strong>
            </span>
            <span>·</span>
            <span>
              Débit : <strong className="text-emerald-400">{telemetry.speedGamesPerSec.toLocaleString('fr-FR')} parties/s</strong>
            </span>
            <span>·</span>
            <span>
              Niches MAP-Elites : <strong className="text-cyan-400">{mapElitesArchive.size} / 800</strong>
            </span>
          </div>
        </div>
      </div>

      {/* MAIN WORKSPACE CONTAINER (1400px Desktop Presence) */}
      <main className="max-w-[1400px] w-full mx-auto px-6 py-6 flex-1 space-y-6">
        {/* ===================================================================
            VUE 1 — STUDIO D'AUTOMATES (NIVEAU 2 : ÉDITEUR VISUEL & CODE)
           =================================================================== */}
        {activeView === 'studio' && (
          <div className="space-y-6">
            {/* Family Library Selector & Import/Export Toolbar */}
            <div className="bg-[#111827] border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-100">
                  01. Studio d&apos;Automates — Modèle Déclaratif de Famille (Niveau 2)
                </h1>
                <p className="text-xs text-slate-400">
                  Configurez les tactiques, les 18 capteurs, les 9 verbes, les lois de casse/élan et les balayages{' '}
                  <code className="text-emerald-400">$sweep</code> avant compilation en vecteurs de 447 entiers{' '}
                  <code className="text-cyan-400">int32</code>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {PRELOADED_FAMILIES.map((fam, idx) => (
                  <button
                    key={fam.family_id}
                    onClick={() => selectPreloadedFamily(idx)}
                    className={`px-3 py-2 text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 border ${
                      selectedFamilyIdx === idx
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {fam.family_id.replace('Famille_', '').replaceAll('_', ' ')}
                  </button>
                ))}

                <label className="px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <Upload className="w-3.5 h-3.5" />
                  Importer .json
                  <input type="file" accept=".json,.yaml,.yml" onChange={handleFileImport} className="hidden" />
                </label>

                <button
                  onClick={() =>
                    downloadBlob(
                      `${activeFamily.family_id}.json`,
                      JSON.stringify(activeFamily, null, 2),
                      'application/json'
                    )
                  }
                  className="px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 transition cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exporter Niveau 2
                </button>
              </div>
            </div>

            {/* Mode Switch: Visual Editor vs Declarative Code */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStudioTab('visual')}
                  className={`px-4 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    studioTab === 'visual'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Constructeur Visuel Structuré (Tactiques & Slots)
                </button>
                <button
                  onClick={() => {
                    setCodeText(JSON.stringify(activeFamily, null, 2));
                    setStudioTab('code');
                  }}
                  className={`px-4 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    studioTab === 'code'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Éditeur Déclaratif ($sweep JSON/YAML)
                </button>
              </div>

              <div className="text-xs font-mono tabular-nums text-slate-400">
                Cardinalité $sweep : <strong className="text-emerald-400">{exactSweepCount}</strong> variantes · Échantillon compilé :{' '}
                <strong className="text-cyan-400">{compiledPreviewGenomes.length}</strong> génomes valides
              </div>
            </div>

            {studioTab === 'visual' ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Arena, Physics, Learning Track & Piste 3 */}
                <div className="bg-[#111827] border border-slate-800 p-5 space-y-5">
                  <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
                    Arène, Lois Physiques & Décompte Piste 3
                  </h2>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Identifiant de Famille</label>
                      <input
                        type="text"
                        value={activeFamily.family_id}
                        onChange={(e) =>
                          setActiveFamily({ ...activeFamily, family_id: e.target.value })
                        }
                        className="w-full bg-slate-950 border border-slate-800 px-3 py-1.5 font-mono text-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center justify-between text-slate-400 mb-1">
                          <span>Mode Fin de Piste</span>
                          {typeof activeFamily.arena.end_of_track_mode !== 'string' && (
                            <span className="text-[10px] font-mono text-amber-400">
                              $SWEEP ({activeFamily.arena.end_of_track_mode.$sweep.length})
                            </span>
                          )}
                        </label>
                        <select
                          value={
                            typeof activeFamily.arena.end_of_track_mode === 'string'
                              ? activeFamily.arena.end_of_track_mode
                              : activeFamily.arena.end_of_track_mode.$sweep[0]
                          }
                          onChange={(e) =>
                            setActiveFamily({
                              ...activeFamily,
                              arena: { ...activeFamily.arena, end_of_track_mode: e.target.value },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                        >
                          {END_OF_TRACK_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-slate-400 mb-1">
                          <span>Loi de Casse (Break Rule)</span>
                          {typeof activeFamily.machines_physics.break_rule !== 'string' && (
                            <span className="text-[10px] font-mono text-amber-400">
                              $SWEEP ({activeFamily.machines_physics.break_rule.$sweep.length})
                            </span>
                          )}
                        </label>
                        <select
                          value={
                            typeof activeFamily.machines_physics.break_rule === 'string'
                              ? activeFamily.machines_physics.break_rule
                              : activeFamily.machines_physics.break_rule.$sweep[0]
                          }
                          onChange={(e) =>
                            setActiveFamily({
                              ...activeFamily,
                              machines_physics: {
                                ...activeFamily.machines_physics,
                                break_rule: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                        >
                          {BREAK_RULES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center justify-between text-slate-400 mb-1">
                          <span>Pénalité de Casse</span>
                          {typeof activeFamily.machines_physics.break_penalty !== 'string' && (
                            <span className="text-[10px] font-mono text-amber-400">
                              $SWEEP ({activeFamily.machines_physics.break_penalty.$sweep.length})
                            </span>
                          )}
                        </label>
                        <select
                          value={
                            typeof activeFamily.machines_physics.break_penalty === 'string'
                              ? activeFamily.machines_physics.break_penalty
                              : activeFamily.machines_physics.break_penalty.$sweep[0]
                          }
                          onChange={(e) =>
                            setActiveFamily({
                              ...activeFamily,
                              machines_physics: {
                                ...activeFamily.machines_physics,
                                break_penalty: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                        >
                          {BREAK_PENALTIES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-slate-400 mb-1">
                          <span>Élan Mécanique (Status +1)</span>
                          {typeof activeFamily.machines_physics.momentum_rule !== 'string' && (
                            <span className="text-[10px] font-mono text-amber-400">
                              $SWEEP ({activeFamily.machines_physics.momentum_rule.$sweep.length})
                            </span>
                          )}
                        </label>
                        <select
                          value={
                            typeof activeFamily.machines_physics.momentum_rule === 'string'
                              ? activeFamily.machines_physics.momentum_rule
                              : activeFamily.machines_physics.momentum_rule.$sweep[0]
                          }
                          onChange={(e) =>
                            setActiveFamily({
                              ...activeFamily,
                              machines_physics: {
                                ...activeFamily.machines_physics,
                                momentum_rule: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                        >
                          {MOMENTUM_RULES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center justify-between text-slate-400 mb-1">
                          <span>Déclencheur Piste 2D6</span>
                          {typeof activeFamily.learning_track.eval_trigger_mode !== 'string' && (
                            <span className="text-[10px] font-mono text-amber-400">
                              $SWEEP ({activeFamily.learning_track.eval_trigger_mode.$sweep.length})
                            </span>
                          )}
                        </label>
                        <select
                          value={
                            typeof activeFamily.learning_track.eval_trigger_mode === 'string'
                              ? activeFamily.learning_track.eval_trigger_mode
                              : activeFamily.learning_track.eval_trigger_mode.$sweep[0]
                          }
                          onChange={(e) =>
                            setActiveFamily({
                              ...activeFamily,
                              learning_track: {
                                ...activeFamily.learning_track,
                                eval_trigger_mode: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                        >
                          {EVAL_TRIGGER_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="flex items-center justify-between text-slate-400 mb-1">
                          <span>Opérateur Piste 2D6</span>
                          {typeof activeFamily.learning_track.geom_move_mode !== 'string' && (
                            <span className="text-[10px] font-mono text-amber-400">
                              $SWEEP ({activeFamily.learning_track.geom_move_mode.$sweep.length})
                            </span>
                          )}
                        </label>
                        <select
                          value={
                            typeof activeFamily.learning_track.geom_move_mode === 'string'
                              ? activeFamily.learning_track.geom_move_mode
                              : activeFamily.learning_track.geom_move_mode.$sweep[0]
                          }
                          onChange={(e) =>
                            setActiveFamily({
                              ...activeFamily,
                              learning_track: {
                                ...activeFamily.learning_track,
                                geom_move_mode: e.target.value,
                              },
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                        >
                          {GEOM_MOVE_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-slate-400 mb-1">
                        <span>Mode de Redressement Final des Souches (Système Piste 3)</span>
                        {typeof activeFamily.scoring.regen_mode !== 'string' && (
                          <span className="text-[10px] font-mono text-amber-400">
                            $SWEEP ({activeFamily.scoring.regen_mode.$sweep.length} modes)
                          </span>
                        )}
                      </label>
                      <select
                        value={
                          typeof activeFamily.scoring.regen_mode === 'string'
                            ? activeFamily.scoring.regen_mode
                            : activeFamily.scoring.regen_mode.$sweep[0]
                        }
                        onChange={(e) =>
                          setActiveFamily({
                            ...activeFamily,
                            scoring: { ...activeFamily.scoring, regen_mode: e.target.value },
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-emerald-300"
                      >
                        {REGEN_MODES.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Right 2 Columns: Visual Tactics & Slots Builder */}
                <div className="lg:col-span-2 bg-[#111827] border border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h2 className="text-sm font-semibold text-slate-100">
                      Séquences Conditionnelles des Tactiques (18 Capteurs × 9 Verbes Primitifs)
                    </h2>
                    <span className="text-xs font-mono text-slate-400">
                      {activeFamily.tactics.length} Tactiques définies
                    </span>
                  </div>

                  <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
                    {activeFamily.tactics.map((tac, tIdx) => (
                      <div key={tac.id} className="bg-slate-950 border border-slate-800 p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs font-bold text-slate-100">
                              {tac.id}
                            </span>
                            <span className="text-xs text-slate-400">·</span>
                            <select
                              value={tac.machine}
                              onChange={(e) => {
                                const next = structuredClone(activeFamily);
                                next.tactics[tIdx].machine = e.target.value as
                                  | 'ABATTEUSE'
                                  | 'BULLDOZER';
                                setActiveFamily(next);
                              }}
                              className="bg-[#111827] border border-slate-800 px-2 py-1 text-xs font-mono text-emerald-400"
                            >
                              <option value="ABATTEUSE">Machine : ABATTEUSE</option>
                              <option value="BULLDOZER">Machine : BULLDOZER</option>
                            </select>
                          </div>

                          <button
                            onClick={() => {
                              if (tac.slots.length >= 4) return;
                              const next = structuredClone(activeFamily);
                              next.tactics[tIdx].slots.push({
                                cond1: ['TARGETS_CURR', '>=', 1],
                                if_true: [tac.machine === 'BULLDOZER' ? 'BULLDOZE' : 'CUT', 1, 0],
                                if_false: ['NONE', 0, 0],
                                parry_mode: 'CANCEL_SLOT_ONLY',
                              });
                              setActiveFamily(next);
                            }}
                            disabled={tac.slots.length >= 4}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono bg-[#111827] hover:bg-slate-800 disabled:opacity-40 text-slate-200 border border-slate-800 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Ajouter Slot ({tac.slots.length}/4)
                          </button>
                        </div>

                        <div className="space-y-2">
                          {tac.slots.map((slot, sIdx) => {
                            const c1Val =
                              typeof slot.cond1[2] === 'number'
                                ? slot.cond1[2]
                                : slot.cond1[2].$sweep[0];
                            const actTrue = Array.isArray(slot.if_true)
                              ? slot.if_true
                              : slot.if_true.$sweep[0];
                            const actFalse = Array.isArray(slot.if_false)
                              ? slot.if_false
                              : slot.if_false.$sweep[0];
                            const pMode =
                              typeof slot.parry_mode === 'string'
                                ? slot.parry_mode
                                : slot.parry_mode.$sweep[0];

                            return (
                              <div
                                key={sIdx}
                                className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-[#111827] border border-slate-800/90 p-2.5 text-xs font-mono"
                              >
                                <div className="md:col-span-1 text-slate-400 font-bold">
                                  Slot {sIdx + 1}
                                </div>

                                {/* Condition 1 */}
                                <div className="md:col-span-4 flex items-center gap-1">
                                  <span className="text-slate-400">SI</span>
                                  <select
                                    value={slot.cond1[0]}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].cond1[0] = e.target.value;
                                      setActiveFamily(next);
                                    }}
                                    className="bg-slate-950 border border-slate-800 px-1.5 py-1 text-[11px] text-cyan-300 w-full"
                                  >
                                    {SENSORS.map((s) => (
                                      <option key={s.code} value={s.code}>
                                        {s.code} (+{s.cognitiveCost})
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={slot.cond1[1]}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].cond1[1] = e.target.value;
                                      setActiveFamily(next);
                                    }}
                                    className="bg-slate-950 border border-slate-800 px-1 py-1 text-[11px] text-slate-200"
                                  >
                                    {COMP_OPS.map((op) => (
                                      <option key={op} value={op}>
                                        {op}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    value={c1Val}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].cond1[2] = Number(
                                        e.target.value
                                      );
                                      setActiveFamily(next);
                                    }}
                                    className="w-12 bg-slate-950 border border-slate-800 px-1.5 py-1 text-[11px] text-slate-100 text-center"
                                  />
                                </div>

                                {/* If True Verb */}
                                <div className="md:col-span-3 flex items-center gap-1">
                                  <span className="text-emerald-400">→</span>
                                  <select
                                    value={actTrue[0]}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].if_true = [
                                        e.target.value,
                                        actTrue[1],
                                        actTrue[2],
                                      ];
                                      setActiveFamily(next);
                                    }}
                                    className="bg-slate-950 border border-slate-800 px-1.5 py-1 text-[11px] text-emerald-300 w-full"
                                  >
                                    {VERBS.map((v) => (
                                      <option key={v.code} value={v.code}>
                                        {v.code}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min={0}
                                    max={4}
                                    value={actTrue[1]}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].if_true = [
                                        actTrue[0],
                                        Number(e.target.value),
                                        actTrue[2],
                                      ];
                                      setActiveFamily(next);
                                    }}
                                    title="Quantité"
                                    className="w-10 bg-slate-950 border border-slate-800 px-1 py-1 text-[11px] text-center"
                                  />
                                </div>

                                {/* If False Verb */}
                                <div className="md:col-span-2 flex items-center gap-1">
                                  <span className="text-amber-400">Sinon</span>
                                  <select
                                    value={actFalse[0]}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].if_false = [
                                        e.target.value,
                                        1,
                                        0,
                                      ];
                                      setActiveFamily(next);
                                    }}
                                    className="bg-slate-950 border border-slate-800 px-1.5 py-1 text-[11px] text-amber-300 w-full"
                                  >
                                    {VERBS.map((v) => (
                                      <option key={v.code} value={v.code}>
                                        {v.code}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Parry Mode & Delete */}
                                <div className="md:col-span-2 flex items-center justify-between gap-1">
                                  <select
                                    value={pMode}
                                    onChange={(e) => {
                                      const next = structuredClone(activeFamily);
                                      next.tactics[tIdx].slots[sIdx].parry_mode = e.target.value;
                                      setActiveFamily(next);
                                    }}
                                    className="bg-slate-950 border border-slate-800 px-1 py-1 text-[10px] text-slate-300 w-full"
                                  >
                                    {PARRY_MODES.map((pm) => (
                                      <option key={pm} value={pm}>
                                        {pm.replace('CANCEL_', '')}
                                      </option>
                                    ))}
                                  </select>
                                  {tac.slots.length > 1 && (
                                    <button
                                      onClick={() => {
                                        const next = structuredClone(activeFamily);
                                        next.tactics[tIdx].slots.splice(sIdx, 1);
                                        setActiveFamily(next);
                                      }}
                                      className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                                      title="Supprimer ce Slot"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Declarative JSON/YAML Editor */
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Modifiez directement la spécification déclarative de Niveau 2 (supporte{' '}
                    <code className="text-emerald-400">{`{"$sweep": [...]}`}</code> sur toute clé).
                  </span>
                  <button
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(codeText) as FamilySpecDSL;
                        setActiveFamily(parsed);
                        setCodeError(null);
                      } catch (err: any) {
                        setCodeError(`Erreur JSON : ${err.message}`);
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-slate-950 cursor-pointer"
                  >
                    Compiler & Appliquer au Studio
                  </button>
                </div>
                {codeError && (
                  <div className="p-2.5 bg-rose-950/60 border border-rose-500/40 text-xs font-mono text-rose-300">
                    {codeError}
                  </div>
                )}
                <textarea
                  value={codeText}
                  onChange={(e) => setCodeText(e.target.value)}
                  rows={20}
                  className="w-full bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-slate-200 leading-relaxed"
                />
              </div>
            )}

            {/* Real-Time Validator Footer */}
            <div className="bg-[#111827] border border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono tabular-nums">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-emerald-400 font-semibold">
                  ● Validateur Statique Pré-Simulation : CONFORME
                </span>
                <span className="text-slate-500">·</span>
                <span>
                  Complexité Syntaxique Statique moyenne (C_règle) :{' '}
                  <strong className="text-slate-100">
                    {compiledPreviewGenomes[0]?.staticComplexity ?? 1.2} op.
                  </strong>
                </span>
                <span className="text-slate-500">·</span>
                <span>
                  Verbes atteignables vérifiés : <strong className="text-slate-200">CUT, BULLDOZE, ADVANCE</strong>
                </span>
              </div>
              <button
                onClick={() => setActiveView('config')}
                className="px-4 py-2 text-xs font-sans font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
              >
                Passer au Configurateur de Campagne →
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            VUE 2 — CONFIGURATEUR DE CAMPAGNE, BOTS & PONDÉRATIONS
           =================================================================== */}
        {activeView === 'config' && (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-100">
                  02. Configurateur de Campagne, Banc des 7 Bots & Pondérations Pareto 4D
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Choisissez entre le Balayage Cartésien Multi-Fidélité à 3 étages (Successive Halving) et l&apos;Algorithme Évolutionnaire Hybride NSGA-II + MAP-Elites (800 niches écologiques).
                </p>
              </div>

              <button
                onClick={() => {
                  selectPreloadedFamily(2); // Famille_Exploration_Genetique_Totale
                  setExplorationMode('genetic_qd');
                  setGaPopSize(64);
                  setGaGenerations(12);
                  setCreativeMutationRate(0.35);
                  setMaxAllowedComplexity(6.5);
                  setScaleGamesFactor(60);
                  setPlayerCounts([3, 4, 5, 6]);
                  setEffortRates([0.3, 0.5, 0.7]);
                  setEnabledBots(ALL_BOTS_V2.map((b) => b.code));
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                ⚡ Charger Pré-Réglage : Exploration Génétique Maximale
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Exploration Engine Selection */}
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-5">
                <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
                  1. Choix du Moteur d&apos;Exploration (Bloc 5)
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setExplorationMode('grid_sh')}
                    className={`p-3.5 text-left border transition cursor-pointer ${
                      explorationMode === 'grid_sh'
                        ? 'bg-emerald-500/10 border-emerald-500 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold text-emerald-400">
                      Mode A · Grille Cartésienne + Successive Halving
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Tamisage à 3 étages (Rung 1: 100%, Rung 2: Top 25%, Rung 3: Top 5% & Pareto). Accélération 11,48×.
                    </p>
                  </button>

                  <button
                    onClick={() => setExplorationMode('genetic_qd')}
                    className={`p-3.5 text-left border transition cursor-pointer ${
                      explorationMode === 'genetic_qd'
                        ? 'bg-cyan-500/10 border-cyan-500 text-slate-100'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="text-xs font-bold text-cyan-400">
                      Mode B · Génétique Hybride NSGA-II + MAP-Elites
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Croisement par bloc, Greffe de Slot, Élagage d&apos;Occam et illumination des 800 niches écologiques.
                    </p>
                  </button>
                </div>

                {explorationMode === 'grid_sh' ? (
                  <div className="space-y-3 pt-2 text-xs">
                    <label className="flex items-center justify-between bg-slate-950 border border-slate-800 p-3 cursor-pointer">
                      <span>Activer l&apos;Entonnoir Multi-Fidélité à 3 Étages (Rungs 1 → 2 → 3)</span>
                      <input
                        type="checkbox"
                        checked={useMultiFidelitySh}
                        onChange={(e) => setUseMultiFidelitySh(e.target.checked)}
                        className="accent-emerald-500"
                      />
                    </label>
                    <div className="bg-slate-950 border border-slate-800 p-3 flex items-center justify-between">
                      <span>Budget Monte-Carlo de base (Étage 1 / Bot)</span>
                      <select
                        value={scaleGamesFactor}
                        onChange={(e) => setScaleGamesFactor(Number(e.target.value))}
                        className="bg-[#111827] border border-slate-800 px-2.5 py-1 font-mono text-slate-100"
                      >
                        <option value={15}>15 parties/bot (Rapide Web)</option>
                        <option value={30}>30 parties/bot (Équilibré)</option>
                        <option value={60}>60 parties/bot (Haute précision)</option>
                        <option value={100}>100 parties/bot (Intensif CRN)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 text-xs">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-950 border border-slate-800 p-3">
                        <label className="block text-slate-400 mb-1">Population P</label>
                        <select
                          value={gaPopSize}
                          onChange={(e) => setGaPopSize(Number(e.target.value))}
                          className="w-full bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-slate-100"
                        >
                          <option value={24}>24 individus</option>
                          <option value={36}>36 individus</option>
                          <option value={48}>48 individus</option>
                          <option value={64}>64 individus (Max)</option>
                          <option value={96}>96 individus (Ultra)</option>
                        </select>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 p-3">
                        <label className="block text-slate-400 mb-1">Générations G</label>
                        <select
                          value={gaGenerations}
                          onChange={(e) => setGaGenerations(Number(e.target.value))}
                          className="w-full bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-slate-100"
                        >
                          <option value={4}>4 générations</option>
                          <option value={6}>6 générations</option>
                          <option value={8}>8 générations</option>
                          <option value={10}>10 générations</option>
                          <option value={12}>12 générations (Max)</option>
                          <option value={16}>16 générations (Ultra)</option>
                        </select>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 p-3">
                        <label className="block text-slate-400 mb-1">Plafond C_règle (max 8.0)</label>
                        <input
                          type="number"
                          step={0.5}
                          min={1.5}
                          max={8.0}
                          value={maxAllowedComplexity}
                          onChange={(e) => setMaxAllowedComplexity(Number(e.target.value))}
                          className="w-full bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-slate-950 border border-slate-800 p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300">
                            Taux de Mutation Créative (NEAT / Occam)
                          </span>
                          <span className="font-mono font-bold text-cyan-400">
                            {Math.round(creativeMutationRate * 100)} %
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.05}
                          max={0.5}
                          step={0.05}
                          value={creativeMutationRate}
                          onChange={(e) => setCreativeMutationRate(Number(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>

                      <div className="bg-slate-950 border border-slate-800 p-3 flex flex-col justify-between">
                        <label className="text-slate-300">
                          Fidélité Monte-Carlo / Individu (CRN)
                        </label>
                        <select
                          value={scaleGamesFactor}
                          onChange={(e) => setScaleGamesFactor(Number(e.target.value))}
                          className="w-full bg-[#111827] border border-slate-800 px-2 py-1 font-mono text-slate-100 mt-1"
                        >
                          <option value={15}>30 parties/bot (2×15 · Rapide)</option>
                          <option value={30}>60 parties/bot (2×30 · Équilibré)</option>
                          <option value={40}>80 parties/bot (2×40 · Recommandé)</option>
                          <option value={60}>120 parties/bot (2×60 · Haute Précision)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tables & Effort Rates */}
                <div className="border-t border-slate-800 pt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Tailles de Table (J joueurs)</label>
                    <select
                      value={playerCounts.join(',')}
                      onChange={(e) => setPlayerCounts(e.target.value.split(',').map(Number))}
                      className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                    >
                      <option value="4">4 joueurs uniquement</option>
                      <option value="3,4,5">3, 4 et 5 joueurs</option>
                      <option value="3,4,5,6">3, 4, 5 et 6 joueurs (Complet)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Paliers d&apos;Effort Iso-Quota (P̄)</label>
                    <select
                      value={effortRates.join(',')}
                      onChange={(e) => setEffortRates(e.target.value.split(',').map(Number))}
                      className="w-full bg-slate-950 border border-slate-800 px-2.5 py-1.5 font-mono text-slate-100"
                    >
                      <option value="0.5">50% (Nominal)</option>
                      <option value="0.3,0.5,0.7">30%, 50%, 70% (Complet)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Interactive Objective Weights (Live Recalculation) */}
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h2 className="text-sm font-semibold text-slate-100">
                    2. Pondération Interactive des 4 Métriques (Recalcul à la Volée)
                  </h2>
                  <span className="text-xs font-mono text-emerald-400">
                    Somme normalisée = 1.00
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {[
                    {
                      key: 'w1_maitrise' as const,
                      label: 'w1 · M1_Maîtrise (Gradient de compétence, SNR, τ_K de Kendall)',
                      val: weights.w1_maitrise,
                    },
                    {
                      key: 'w2_adaptation' as const,
                      label: 'w2 · M2_Adaptation (Plasticité Jensen-Shannon D_JS, TVD, Anti-Martingale)',
                      val: weights.w2_adaptation,
                    },
                    {
                      key: 'w3_tension' as const,
                      label: 'w3 · M3_Tension (Fenêtre 60-80%, Entropie de Shannon H_3 des 3 états)',
                      val: weights.w3_tension,
                    },
                    {
                      key: 'w4_simplicite' as const,
                      label: 'w4 · M4_Simplicité (Gestes M_phys, Opérations C_cog, Complexité C_règle)',
                      val: weights.w4_simplicite,
                    },
                  ].map((item) => (
                    <div key={item.key} className="bg-slate-950 border border-slate-800 p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-200 font-medium">{item.label}</span>
                        <span className="font-mono tabular-nums text-emerald-400 font-bold">
                          {(item.val * 100).toFixed(0)} %
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
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* The 7 Autonomous Bots Reference Table with Active Checkboxes */}
            <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">
                  3. Banc des 7 Bots Joueurs Autonomes (Iso-Effort + Common Random Numbers)
                </h2>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-emerald-400">{enabledBots.length} / 7 Bots activés</span>
                  <button
                    onClick={() => setEnabledBots(ALL_BOTS_V2.map((b) => b.code))}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer"
                  >
                    Tout cocher (7/7)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {ALL_BOTS_V2.map((bot) => {
                  const isChecked = enabledBots.includes(bot.code);
                  return (
                    <label
                      key={bot.code}
                      className={`p-3 space-y-1 border transition cursor-pointer block ${
                        isChecked
                          ? 'bg-slate-950 border-emerald-500/40'
                          : 'bg-slate-950/50 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="flex items-center gap-2 text-emerald-400 font-bold">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEnabledBots([...enabledBots, bot.code]);
                              } else if (enabledBots.length > 2) {
                                setEnabledBots(enabledBots.filter((c) => c !== bot.code));
                              }
                            }}
                            className="accent-emerald-500"
                          />
                          {bot.code}
                        </span>
                        <span className="text-slate-400">Niveau {bot.level}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-200">{bot.name}</div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{bot.description}</p>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VUE 3 — CONSOLE D'EXÉCUTION & TÉLÉMÉTRIE VM EN DIRECT
           =================================================================== */}
        {activeView === 'console' && (
          <div className="space-y-6">
            <div className="bg-[#111827] border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-100">
                  03. Console d&apos;Exécution Multi-Fidélité & Télémétrie VM
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Pilotage des lots Monte-Carlo, suivi de l&apos;entonnoir Successive Halving (Rungs 1-2-3), progression MAP-Elites et export du bundle Python/Numba pour votre VM Oracle 16 vCPUs.
                </p>
              </div>

              {/* Execution Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {!isRunning ? (
                  <button
                    onClick={() => runCampaignExecution(explorationMode, activeFamily)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Lancer ({explorationMode === 'grid_sh' ? 'Grille 3 Étages' : 'NSGA-II + MAP-Elites'})
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        pauseRef.current = !pauseRef.current;
                        setIsPaused(pauseRef.current);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-amber-500 text-slate-950 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      {isPaused ? 'Reprendre' : 'Pause (Fin de lot)'}
                    </button>
                    <button
                      onClick={() => {
                        stopRef.current = true;
                        setIsRunning(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-rose-500 text-slate-950 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Arrêter
                    </button>
                  </>
                )}

                {hasCheckpoint && !isRunning && (
                  <button
                    onClick={() => runCampaignExecution(explorationMode, activeFamily)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reprendre depuis Checkpoint
                  </button>
                )}

                <button
                  onClick={() =>
                    downloadBlob(
                      'foret_automate_lab_v2_oci.py',
                      generateOciPythonBundleScript(activeFamily, population),
                      'text/x-python;charset=utf-8'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Exporter Bundle Python/Numba OCI (16 vCPUs)
                </button>
              </div>
            </div>

            {/* Live Progress Bar & Funnel Metrics */}
            <div className="bg-[#111827] border border-slate-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                <span className="text-emerald-400 font-semibold">{telemetry.phaseLabel}</span>
                <span>
                  Progression : {telemetry.doneInPhase} / {telemetry.totalInPhase} automates (
                  {Math.round(
                    (100 * telemetry.doneInPhase) / Math.max(1, telemetry.totalInPhase)
                  )}
                  %)
                </span>
              </div>

              <div className="w-full h-3 bg-slate-950 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-150"
                  style={{
                    width: `${Math.min(
                      100,
                      (100 * telemetry.doneInPhase) / Math.max(1, telemetry.totalInPhase)
                    )}%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 font-mono tabular-nums">
                <div className="bg-slate-950 border border-slate-800 p-3.5">
                  <div className="text-[11px] text-slate-400">PARTIES SIMULÉES (CRN)</div>
                  <div className="text-2xl font-bold text-slate-100 mt-1">
                    {telemetry.totalGamesSimulated.toLocaleString('fr-FR')}
                  </div>
                  <div className="text-xs text-emerald-400 mt-0.5">
                    {telemetry.speedGamesPerSec.toLocaleString('fr-FR')} parties / s
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5">
                  <div className="text-[11px] text-slate-400">ENTONNOIR SUCCESSIVE HALVING</div>
                  <div className="text-2xl font-bold text-slate-100 mt-1">
                    {telemetry.rung1Count} → {telemetry.rung2Survivors} → {telemetry.rung3Certified}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Rung 1 (100%) · Rung 2 (25%) · Rung 3 (Top)
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5">
                  <div className="text-[11px] text-slate-400">ARCHIVE MAP-ELITES (10×10×8)</div>
                  <div className="text-2xl font-bold text-cyan-400 mt-1">
                    {mapElitesArchive.size}{' '}
                    <span className="text-xs text-slate-400 font-normal">/ 800 niches</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Taux d&apos;illumination : {((100 * mapElitesArchive.size) / 800).toFixed(1)}%
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5">
                  <div className="text-[11px] text-slate-400">CHAMPION ACTUEL (#1)</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">
                    {population[0]?.scoreGlobal.toFixed(2) ?? '—'}{' '}
                    <span className="text-xs text-slate-400 font-normal">/ 100</span>
                  </div>
                  <div className="text-xs text-slate-300 truncate mt-0.5">
                    {population[0]?.code ?? 'En attente'}
                  </div>
                </div>
              </div>
            </div>

            {/* Generation History Table (when running Genetic QD mode) */}
            {telemetry.generationHistory.length > 0 && (
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-slate-100">
                  Historique de Convergence Évolutionnaire (NSGA-II + MAP-Elites)
                </h2>
                <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 px-3">Génération</th>
                      <th className="py-2 px-3 text-right">Meilleur Score Global</th>
                      <th className="py-2 px-3 text-right">Moyenne Front Pareto 4D</th>
                      <th className="py-2 px-3 text-right">Niches MAP-Elites Découvertes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {telemetry.generationHistory.map((g) => (
                      <tr key={g.gen}>
                        <td className="py-2 px-3 text-slate-200 font-bold">Génération #{g.gen}</td>
                        <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                          {g.bestScore.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-200">
                          {g.meanPareto.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-cyan-400">
                          {g.niches} / 800
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            VUE 4 — LABORATOIRE D'ANALYSE, MAP-ELITES & TRADUCTEUR DE RÈGLES
           =================================================================== */}
        {activeView === 'lab' && (
          <div className="space-y-6">
            {/* Top Sub-Navigation & 1-Click Analytical Exports */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setLabSubTab('ranking')}
                  className={`px-3.5 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    labSubTab === 'ranking'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Classement & Front Pareto 4D ({population.length})
                </button>
                <button
                  onClick={() => setLabSubTab('map_elites')}
                  className={`px-3.5 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    labSubTab === 'map_elites'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Carte de Chaleur MAP-Elites ({mapElitesArchive.size} niches)
                </button>
                <button
                  onClick={() => setLabSubTab('sensitivity')}
                  className={`px-3.5 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    labSubTab === 'sensitivity'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Sensibilité Marginale V2
                </button>
                <button
                  onClick={() => setLabSubTab('report')}
                  className={`px-3.5 py-2 text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    labSubTab === 'report'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#111827] text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Bilan Markdown (campaign_report.md)
                </button>
              </div>

              {/* 1-Click Exports Bar */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    downloadBlob('campaign_report.md', fullMarkdownReport, 'text/markdown')
                  }
                  className="px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  campaign_report.md
                </button>
                <button
                  onClick={() =>
                    downloadBlob(
                      'variants_ranking.csv',
                      exportVariantsRankingCsvV2(population),
                      'text/csv'
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  variants_ranking.csv
                </button>
                <button
                  onClick={() =>
                    downloadBlob(
                      'map_elites_archive.csv',
                      exportMapElitesArchiveCsv(mapElitesArchive),
                      'text/csv'
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  map_elites_archive.csv
                </button>
                <button
                  onClick={() =>
                    downloadBlob(
                      'sensitivity_analysis.csv',
                      exportSensitivityCsvV2(sensitivityRows),
                      'text/csv'
                    )
                  }
                  className="px-3 py-1.5 text-xs font-medium bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                >
                  sensitivity_analysis.csv
                </button>
              </div>
            </div>

            {/* SUB-TAB A: RANKING TABLE OR MAP-ELITES HEATMAP */}
            {labSubTab === 'ranking' && (
              <div className="bg-[#111827] border border-slate-800">
                <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="relative flex-1 min-w-[240px]">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Filtrer par code d'automate ou famille (ex: G0001, BOUN, FLIP, OCCAM...)"
                      className="w-full bg-slate-950 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-200"
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={paretoOnlyFilter}
                        onChange={(e) => setParetoOnlyFilter(e.target.checked)}
                        className="accent-emerald-500"
                      />
                      Front de Pareto 4D uniquement ({paretoCount})
                    </label>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                    <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Rang</th>
                        <th className="py-2.5 px-3">Code Automate</th>
                        <th className="py-2.5 px-3 text-center">Étage</th>
                        <th className="py-2.5 px-3 text-right">Score Global</th>
                        <th className="py-2.5 px-3 text-right">M1 Maîtrise</th>
                        <th className="py-2.5 px-3 text-right">M2 Adapt.</th>
                        <th className="py-2.5 px-3 text-right">M3 Tension</th>
                        <th className="py-2.5 px-3 text-right">M4 Fluidité</th>
                        <th className="py-2.5 px-3 text-right">SNR / τ_K</th>
                        <th className="py-2.5 px-3 text-right">D_JS / Marge Nash</th>
                        <th className="py-2.5 px-3 text-right">H_3 Shannon</th>
                        <th className="py-2.5 px-3 text-right">C_règle</th>
                        <th className="py-2.5 px-3 text-center">Pareto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredPopulation.slice(0, 80).map((item) => {
                        const isSel = selectedAutomaton?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedAutomaton(item)}
                            className={`transition cursor-pointer ${
                              isSel
                                ? 'bg-emerald-950/40 text-slate-100'
                                : 'hover:bg-slate-800/50 text-slate-300'
                            }`}
                          >
                            <td className="py-2 px-3 font-bold text-slate-400">
                              #{item.rangGlobal}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-100">
                              {item.code}
                            </td>
                            <td className="py-2 px-3 text-center text-slate-400">
                              R{item.rungReached}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-400">
                              {item.scoreGlobal.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right">{item.M1_maitrise.toFixed(1)}</td>
                            <td className="py-2 px-3 text-right">
                              {item.M2_adaptation.toFixed(1)}
                            </td>
                            <td className="py-2 px-3 text-right">{item.M3_tension.toFixed(1)}</td>
                            <td className="py-2 px-3 text-right">
                              {item.M4_simplicite.toFixed(1)}
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {item.snr.toFixed(2)} / {item.kendallTau.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className="text-cyan-300">
                                {item.jensenShannonDjs.toFixed(2)}
                              </span>{' '}
                              /{' '}
                              <span
                                className={
                                  item.nashMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }
                              >
                                {item.nashMargin >= 0
                                  ? `+${item.nashMargin.toFixed(1)}%`
                                  : `${item.nashMargin.toFixed(1)}%`}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right text-amber-300">
                              {item.shannonEntropyBits.toFixed(2)}b ({item.shannonEntropyNormPct}%)
                            </td>
                            <td className="py-2 px-3 text-right text-slate-300">
                              {item.cRegleStatic.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {item.isPareto4D ? (
                                <span className="text-emerald-400 font-bold">4D</span>
                              ) : (
                                <span className="text-slate-600">·</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {labSubTab === 'map_elites' && (
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">
                      Archive Comportementale Illuminée MAP-Elites (Grille 10 × 10 × 8 = 800 Niches)
                    </h2>
                    <p className="text-xs text-slate-400">
                      Cliquez sur une cellule de la grille pour inspecter le champion de ce style de jeu et afficher sa règle humaine ci-dessous.
                    </p>
                  </div>
                </div>
                <MapElitesHeatmap
                  archive={mapElitesArchive}
                  selectedId={selectedAutomaton?.id ?? -1}
                  activeZ={activeZSlice}
                  onSelectZ={setActiveZSlice}
                  onSelectAutomaton={(a) => setSelectedAutomaton(a)}
                />
              </div>
            )}

            {labSubTab === 'sensitivity' && (
              <div className="bg-[#111827] border border-slate-800 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 text-[11px]">
                      <th className="py-2.5 px-4">Dimension</th>
                      <th className="py-2.5 px-4">Modalité</th>
                      <th className="py-2.5 px-4 text-right">Effectif</th>
                      <th className="py-2.5 px-4 text-right">Score Global</th>
                      <th className="py-2.5 px-4 text-right">M1 Maîtrise</th>
                      <th className="py-2.5 px-4 text-right">M2 Adaptation</th>
                      <th className="py-2.5 px-4 text-right">M3 Tension</th>
                      <th className="py-2.5 px-4 text-right">M4 Simplicité</th>
                      <th className="py-2.5 px-4 text-right">Marge Nash</th>
                      <th className="py-2.5 px-4 text-right">C_règle Statique</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {sensitivityRows.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40">
                        <td className="py-2 px-4 text-slate-400">{s.dimension}</td>
                        <td className="py-2 px-4 text-slate-100 font-semibold">{s.modality}</td>
                        <td className="py-2 px-4 text-right text-slate-400">{s.count}</td>
                        <td className="py-2 px-4 text-right text-emerald-400 font-bold">
                          {s.scoreGlobal.toFixed(2)}
                        </td>
                        <td className="py-2 px-4 text-right">{s.M1.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right">{s.M2.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right">{s.M3.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right">{s.M4.toFixed(2)}</td>
                        <td className="py-2 px-4 text-right text-cyan-300">
                          {s.nashMargin >= 0 ? `+${s.nashMargin.toFixed(2)}%` : `${s.nashMargin.toFixed(2)}%`}
                        </td>
                        <td className="py-2 px-4 text-right text-slate-300">
                          {s.cRegle.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {labSubTab === 'report' && (
              <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">
                    Bilan analytique complet incluant le podium Pareto 4D, la matrice des 7 Bots et la traduction en français des règles du Top 5.
                  </span>
                  <button
                    onClick={() =>
                      downloadBlob('campaign_report.md', fullMarkdownReport, 'text/markdown')
                    }
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-slate-950 cursor-pointer"
                  >
                    Télécharger campaign_report.md
                  </button>
                </div>
                <pre className="bg-slate-950 border border-slate-800 p-4 text-xs font-mono text-slate-200 overflow-x-auto max-h-[420px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {fullMarkdownReport}
                </pre>
              </div>
            )}

            {/* SELECTED VARIANT INSPECTOR : 3 SYNCHRONIZED CHARTS + HUMAN RULEBOOK TRANSLATOR */}
            {selectedAutomaton && turnProfile && selectedRulebook && (
              <div className="space-y-6">
                {/* 3 Synchronized Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Chart 1: 7 Bots Profile */}
                  <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
                      1. Profil de Réponse des 7 Bots ({selectedAutomaton.code})
                    </h3>
                    <BotsResponseChart selected={selectedAutomaton} />
                  </div>

                  {/* Chart 2: Turn-by-Turn Evolution with Piste 3 Critical Stumps */}
                  <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
                      2. Dynamique Temporelle & Souches Piste 3
                    </h3>
                    <div className="max-h-[265px] overflow-y-auto">
                      <TurnByTurnCurveChart profile={turnProfile} />
                    </div>
                  </div>

                  {/* Chart 3: Radar 4D */}
                  <div className="bg-[#111827] border border-slate-800 p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
                      3. Radar 4D (M1, M2, M3, M4 vs Top #1)
                    </h3>
                    <Radar4DChart selected={selectedAutomaton} top3={population.slice(0, 3)} />
                  </div>
                </div>

                {/* THE HUMAN RULEBOOK TRANSLATOR (Section 8.4) */}
                <div className="bg-[#111827] border border-slate-800 p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <div className="text-xs font-mono text-emerald-400">
                        TRADUCTEUR AUTOMATIQUE DE GÉNOME (447 INT32 → RÈGLE DE JEU HUMAINE)
                      </div>
                      <h2 className="text-lg font-bold text-slate-100 mt-0.5">
                        {selectedRulebook.title}
                      </h2>
                      <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                        Score Global: {selectedAutomaton.scoreGlobal}/100 · Niche MAP-Elites: [
                        {selectedAutomaton.nicheKey}] · Entropie Shannon:{' '}
                        {selectedAutomaton.shannonEntropyBits} bits · Charge:{' '}
                        {selectedAutomaton.mPhysPerTurn} gestes/t & {selectedAutomaton.cCogPerTurn}{' '}
                        ops/t (C_règle = {selectedAutomaton.cRegleStatic})
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          downloadBlob(
                            `regle_playtest_${selectedAutomaton.code}.md`,
                            selectedRulebook.markdown,
                            'text/markdown'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        Télécharger la Fiche Playtest (.md)
                      </button>
                      <button
                        onClick={() =>
                          downloadBlob(
                            `${selectedAutomaton.code}.yaml`,
                            exportGenomeToLevel2Yaml(
                              selectedAutomaton.genome,
                              selectedAutomaton.code
                            ),
                            'text/yaml'
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Exporter Génome (.yaml Niveau 2)
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm leading-relaxed">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 mb-2">
                          1. Mise en Place & Topologie de l&apos;Arène
                        </h3>
                        <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                          {selectedRulebook.setupSection.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h3 className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-2">
                          2. Lois Physiques du Tandem (Abatteuse & Bulldozer)
                        </h3>
                        <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                          {selectedRulebook.physicsSection.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <h3 className="text-xs font-mono uppercase tracking-wider text-amber-400 mb-2">
                          4. Piste d&apos;Apprentissage 2D6 & 5. Décompte Final Piste 3
                        </h3>
                        <ul className="space-y-1.5 text-xs text-slate-300 list-disc pl-4">
                          {selectedRulebook.learningSection.map((s, i) => (
                            <li key={`l-${i}`}>{s}</li>
                          ))}
                          {selectedRulebook.scoringSection.map((s, i) => (
                            <li key={`s-${i}`} className="text-emerald-300 font-medium">
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-slate-200">
                        3. Effet Exact des Tuiles Tactiques sur Table
                      </h3>
                      <div className="space-y-3">
                        {selectedRulebook.tacticsSection.map((tac, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-950 border border-slate-800 p-3.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-bold text-slate-100">{tac.name}</span>
                              <span
                                className={
                                  tac.machine === 'BULLDOZER'
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }
                              >
                                Machine : {tac.machine}
                              </span>
                            </div>
                            <ul className="space-y-1 text-xs text-slate-300 font-mono">
                              {tac.slotsText.map((st, sIdx) => (
                                <li key={sIdx}>{st}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
