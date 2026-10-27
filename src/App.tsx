import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trees,
  Play,
  Square,
  Download,
  CheckCircle2,
  Sliders,
  BarChart3,
  FileText,
  Trophy,
  Activity,
  ShieldAlert,
  Sparkles,
  Search,
} from 'lucide-react';
import {
  generateVariants,
  O1_MAP,
  O2_MAP,
  O3_MAP,
  O4_MAP,
  O5_MAP,
  P1_MAP,
  P2_MAP,
  TOPOLOGIES,
  TOPOLOGY_LENGTHS,
  INITIAL_TRACKS,
  variantToIntTuple,
} from './sim/variants';
import { ALL_DOCTRINES } from './sim/doctrines';
import { simulateBatchKernel, simulateTurnByTurnProfile, TurnProfile } from './sim/engine';
import {
  EvaluatedVariant,
  MetricsWeights,
  evaluateSingleVariant,
  flagParetoFront,
} from './sim/metrics';
import {
  computeSensitivityAnalysis,
  generateMarkdownReport,
  exportVariantsCsv,
} from './sim/reporter';

interface UnitTestResult {
  name: string;
  passed: boolean;
  detail: string;
}

function runEngineUnitTests(): UnitTestResult[] {
  const results: UnitTestResult[] = [];
  const allVars = generateVariants();

  // Test 1: 2916 Cartesian variants
  results.push({
    name: '1. Génération cartésienne complète (2 916 variantes)',
    passed: allVars.length === 2916,
    detail: `${allVars.length} variantes générées`,
  });

  // Test 2: 3-state conservation & Iso-effort budget
  const v0 = allVars[0];
  const [o1, o2, o3, o4, o5, p1, p2, T_turns] = variantToIntTuple(v0);
  const parries: number[] = [];
  let maxConservationErr = 0;
  for (const doc of ALL_DOCTRINES) {
    const res = simulateBatchKernel(
      o1,
      o2,
      o3,
      o4,
      o5,
      p1,
      p2,
      T_turns,
      4,
      doc.doctrine_id,
      0.5,
      150,
      12345,
      TOPOLOGIES[v0.P1_topologie],
      TOPOLOGY_LENGTHS[v0.P1_topologie],
      INITIAL_TRACKS[v0.O4_init_piste]
    );
    const sumStates = res[2] + res[3] + res[4];
    maxConservationErr = Math.max(maxConservationErr, Math.abs(sumStates - 100.0));
    parries.push(res[10]);
  }
  const parrySpread = Math.max(...parries) - Math.min(...parries);
  results.push({
    name: '2. Conservation des 3 états (100%) & Iso-Effort (D0..D5)',
    passed: maxConservationErr < 1e-4 && parrySpread < 1.35,
    detail: `Somme états = ${(100 - maxConservationErr).toFixed(4)}% | Écart max parades = ${parrySpread.toFixed(2)}`,
  });

  // Test 3: Simplicity discrimination
  const vSimple = allVars.find(
    (v) =>
      v.O1_eligibilite === 'Strict' &&
      v.O2_boost === 'Sur_Place_x2' &&
      v.O3_apprentissage === 'Standard_1' &&
      v.P2_largeur_vague === 'Proportionnel_Sup' &&
      v.P3_duree_tours === 12
  )!;
  const vComplex = allVars.find(
    (v) =>
      v.O1_eligibilite === 'Souple' &&
      v.O2_boost === 'Debordement' &&
      v.O3_apprentissage === 'Cumulatif_K' &&
      v.P2_largeur_vague === 'Proportionnel_Large' &&
      v.P3_duree_tours === 20
  )!;
  const mSimple = evaluateSingleVariant(vSimple, [4], [0.5], 80, 999);
  const mComplex = evaluateSingleVariant(vComplex, [4], [0.5], 80, 999);
  results.push({
    name: '3. Discrimination cognitive & physique (M4 Simplicité)',
    passed:
      mSimple.M4_simplicite > mComplex.M4_simplicite + 15.0 &&
      mSimple.ops_cog_par_tour < mComplex.ops_cog_par_tour,
    detail: `Simple M4=${mSimple.M4_simplicite} (${mSimple.gestes_phys_par_tour} gestes) vs Complexe M4=${mComplex.M4_simplicite} (${mComplex.gestes_phys_par_tour} gestes)`,
  });

  return results;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'podium' | 'sensitivity' | 'dynamics' | 'report'>('podium');

  // Simulation parameters
  const [presetMode, setPresetMode] = useState<'sample' | 'quick2916' | 'custom'>('sample');
  const [nGames, setNGames] = useState<number>(30);
  const [playerCounts, setPlayerCounts] = useState<number[]>([4]);
  const [effortRates, setEffortRates] = useState<number[]>([0.5]);
  const [weights, setWeights] = useState<MetricsWeights>({
    w_maitrise: 0.3,
    w_adaptation: 0.25,
    w_tension: 0.25,
    w_simplicite: 0.2,
  });

  // Running state
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, speedGamesSec: 0, elapsedSec: 0 });
  const cancelRef = useRef(false);

  // Results state
  const [results, setResults] = useState<EvaluatedVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<EvaluatedVariant | null>(null);
  const [turnProfile, setTurnProfile] = useState<TurnProfile | null>(null);
  const [unitTests, setUnitTests] = useState<UnitTestResult[]>([]);

  // Table filters
  const [searchQuery, setSearchQuery] = useState('');
  const [paretoOnly, setParetoOnly] = useState(false);
  const [filterO1, setFilterO1] = useState('ALL');
  const [filterO2, setFilterO2] = useState('ALL');
  const [filterO3, setFilterO3] = useState('ALL');
  const [filterP1, setFilterP1] = useState('ALL');

  // Run unit tests and an instant initial evaluation on mount
  useEffect(() => {
    setUnitTests(runEngineUnitTests());
    launchSimulation('sample', 25, [4], [0.5]);
    return () => {
      cancelRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (selectedVariant) {
      const prof = simulateTurnByTurnProfile(selectedVariant, 4, 0.5, 250, 4242);
      setTurnProfile(prof);
    }
  }, [selectedVariant]);

  const launchSimulation = (
    mode: 'sample' | 'quick2916' | 'custom',
    overrideGames?: number,
    overridePlayers?: number[],
    overrideEfforts?: number[]
  ) => {
    cancelRef.current = false;
    setIsRunning(true);

    const gamesToRun = overrideGames ?? nGames;
    const pCounts = overridePlayers ?? playerCounts;
    const eRates = overrideEfforts ?? effortRates;

    // In 'sample' mode, evaluate a representative stratified grid of 324 variants (100% of O1, O2, O3, O5, P1, P2 at T=16, O4=Centre_Coupe/Alterne) for instant startup
    const allVariants =
      mode === 'sample'
        ? generateVariants({
            O4_init_piste: ['6C_5T_Centre_Coupe', '6C_5T_Alterne'],
            P3_duree_tours: [12, 16],
          })
        : generateVariants();

    const totalVars = allVariants.length;
    const gamesPerVar = ALL_DOCTRINES.length * pCounts.length * eRates.length * gamesToRun;
    const chunkSize = 36;
    const evaluated: EvaluatedVariant[] = [];
    const t0 = performance.now();

    setProgress({ done: 0, total: totalVars, speedGamesSec: 0, elapsedSec: 0 });

    let idx = 0;
    const stepChunk = () => {
      if (cancelRef.current) {
        setIsRunning(false);
        return;
      }
      const end = Math.min(idx + chunkSize, totalVars);
      for (let i = idx; i < end; i++) {
        evaluated.push(
          evaluateSingleVariant(allVariants[i], pCounts, eRates, gamesToRun, 20261025, weights)
        );
      }
      idx = end;
      const elapsedSec = Math.max(0.001, (performance.now() - t0) / 1000);
      const speedGamesSec = Math.round((idx * gamesPerVar) / elapsedSec);

      setProgress({
        done: idx,
        total: totalVars,
        speedGamesSec,
        elapsedSec,
      });

      if (idx < totalVars) {
        setTimeout(stepChunk, 0);
      } else {
        const ranked = flagParetoFront(evaluated);
        setResults(ranked);
        if (ranked.length > 0) {
          setSelectedVariant(ranked[0]);
        }
        setIsRunning(false);
      }
    };

    setTimeout(stepChunk, 10);
  };

  const stopSimulation = () => {
    cancelRef.current = true;
    setIsRunning(false);
  };

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (paretoOnly && !r.is_pareto_4d) return false;
      if (filterO1 !== 'ALL' && r.O1_eligibilite !== filterO1) return false;
      if (filterO2 !== 'ALL' && r.O2_boost !== filterO2) return false;
      if (filterO3 !== 'ALL' && r.O3_apprentissage !== filterO3) return false;
      if (filterP1 !== 'ALL' && r.P1_topologie !== filterP1) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        if (!r.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [results, paretoOnly, filterO1, filterO2, filterO3, filterP1, searchQuery]);

  const sensitivityRows = useMemo(() => computeSensitivityAnalysis(results), [results]);

  const markdownReport = useMemo(() => {
    if (!results.length || !turnProfile) return '';
    return generateMarkdownReport(
      results,
      sensitivityRows,
      turnProfile,
      presetMode === 'quick2916' ? 'campagne_complete_2916' : 'campagne_pilote_rapide',
      nGames,
      playerCounts,
      effortRates,
      progress.elapsedSec
    );
  }, [results, sensitivityRows, turnProfile, presetMode, nGames, playerCounts, effortRates, progress.elapsedSec]);

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const top1 = results[0];
  const paretoCount = useMemo(() => results.filter((r) => r.is_pareto_4d).length, [results]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-stone-800 bg-stone-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Trees className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white">
                  forêt-automate-lab
                </h1>
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Monte-Carlo 4D Pareto
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Banc d&apos;essai des 2 916 variantes cartésiennes — Automate en couloirs unidirectionnels (Abatteuse + Terrassier)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {!isRunning ? (
              <>
                <button
                  onClick={() => {
                    setPresetMode('sample');
                    setNGames(25);
                    launchSimulation('sample', 25, playerCounts, effortRates);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-400" />
                  Tri Rapide (648 var.)
                </button>
                <button
                  onClick={() => {
                    setPresetMode('quick2916');
                    launchSimulation('quick2916', nGames, playerCounts, effortRates);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Lancer les 2 916 Variantes
                </button>
              </>
            ) : (
              <button
                onClick={stopSimulation}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                Interrompre ({Math.round((100 * progress.done) / Math.max(1, progress.total))}%)
              </button>
            )}

            <button
              onClick={() =>
                downloadFile(
                  'variants_ranking.csv',
                  exportVariantsCsv(results),
                  'text/csv;charset=utf-8'
                )
              }
              disabled={!results.length}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-200 border border-stone-700 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>

        {/* Live Progress Bar */}
        {(isRunning || progress.done > 0) && (
          <div className="bg-stone-950/90 border-t border-stone-800/80 px-4 sm:px-6 py-2">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-mono text-emerald-400">
                  [{progress.done.toLocaleString('fr-FR')} / {progress.total.toLocaleString('fr-FR')} variantes]
                </span>
                <span className="text-stone-400">
                  Vitesse : <strong className="text-stone-200 font-mono">{progress.speedGamesSec.toLocaleString('fr-FR')} parties/s</strong>
                </span>
                <span className="text-stone-400">
                  Temps : <strong className="text-stone-200 font-mono">{progress.elapsedSec.toFixed(2)} s</strong>
                </span>
              </div>
              <div className="w-48 h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-150"
                  style={{ width: `${Math.min(100, (100 * progress.done) / Math.max(1, progress.total))}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Top Unit Tests & Calibration Controls Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Unit Tests Verification Card */}
          <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Invariants Physiques & Tests Unitaires
              </div>
              <span className="text-[11px] font-mono text-stone-400">tests/test_engine.py</span>
            </div>
            <div className="space-y-2">
              {unitTests.map((t, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-stone-950/70 border border-stone-800/80 flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-medium text-stone-200">{t.name}</div>
                    <div className="text-[11px] font-mono text-stone-400 mt-0.5">{t.detail}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                      t.passed
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {t.passed ? 'OK' : 'ERR'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Monte-Carlo & Weights Configuration Card */}
          <div className="lg:col-span-2 bg-stone-900/70 border border-stone-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <Sliders className="w-4 h-4" />
                Paramètres de Simulation Monte-Carlo & Pondération Pareto 4D
              </div>
              <span className="text-xs text-stone-400">
                6 Doctrines Iso-Effort (D0 à D5) × Common Random Numbers
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-stone-950/70 border border-stone-800 rounded-lg p-2.5">
                <label className="block text-[11px] text-stone-400">Parties MC / Doctrine</label>
                <select
                  value={nGames}
                  onChange={(e) => setNGames(Number(e.target.value))}
                  className="mt-1 w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-mono text-white"
                >
                  <option value={15}>15 (Ultra-rapide)</option>
                  <option value={30}>30 (Pilote)</option>
                  <option value={75}>75 (Précis)</option>
                  <option value={200}>200 (Haute précision)</option>
                </select>
              </div>

              <div className="bg-stone-950/70 border border-stone-800 rounded-lg p-2.5">
                <label className="block text-[11px] text-stone-400">Tailles de table (J)</label>
                <select
                  value={playerCounts.join(',')}
                  onChange={(e) => setPlayerCounts(e.target.value.split(',').map(Number))}
                  className="mt-1 w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-mono text-white"
                >
                  <option value="4">4 joueurs (Standard)</option>
                  <option value="3,4,5">3, 4, 5 joueurs</option>
                  <option value="3,4,5,6">3, 4, 5, 6 joueurs (Complet)</option>
                </select>
              </div>

              <div className="bg-stone-950/70 border border-stone-800 rounded-lg p-2.5">
                <label className="block text-[11px] text-stone-400">Quota d&apos;effort (P̄)</label>
                <select
                  value={effortRates.join(',')}
                  onChange={(e) => setEffortRates(e.target.value.split(',').map(Number))}
                  className="mt-1 w-full bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-mono text-white"
                >
                  <option value="0.5">50% (Nominal)</option>
                  <option value="0.3,0.5,0.7">30%, 50%, 70% (Multi-effort)</option>
                </select>
              </div>

              <div className="bg-stone-950/70 border border-stone-800 rounded-lg p-2.5">
                <label className="block text-[11px] text-stone-400">Poids M1 / M2 / M3 / M4</label>
                <div className="mt-1 text-xs font-mono text-emerald-300">
                  {(weights.w_maitrise * 100).toFixed(0)}% / {(weights.w_adaptation * 100).toFixed(0)}% /{' '}
                  {(weights.w_tension * 100).toFixed(0)}% / {(weights.w_simplicite * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Champion Banner */}
            {top1 && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-950/60 via-stone-900 to-stone-900 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                        Variante #1 Recommandée
                      </span>
                      <span className="font-mono text-sm font-bold text-white">{top1.code}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                        Score {top1.score_global}/100
                      </span>
                    </div>
                    <p className="text-xs text-stone-300 mt-0.5">
                      Éligibilité: <strong>{top1.O1_eligibilite}</strong> · Boost:{' '}
                      <strong>{top1.O2_boost}</strong> · Apprentissage:{' '}
                      <strong>{top1.O3_apprentissage}</strong> · Piste:{' '}
                      <strong>{top1.O4_init_piste}</strong> · Topologie:{' '}
                      <strong>{top1.P1_topologie}</strong> ({top1.P3_duree_tours} tours)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <div>
                    <span className="text-stone-400 block text-[10px]">M1 Maîtrise</span>
                    <span className="text-emerald-300 font-bold">{top1.M1_maitrise}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">M2 Adapt.</span>
                    <span className="text-sky-300 font-bold">{top1.M2_adaptation}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">M3 Tension</span>
                    <span className="text-amber-300 font-bold">{top1.M3_tension}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">M4 Fluidité</span>
                    <span className="text-purple-300 font-bold">{top1.M4_simplicite}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveTab('podium')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'podium'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <Trophy className="w-4 h-4" />
              Classement & Front Pareto 4D ({results.length})
            </button>
            <button
              onClick={() => setActiveTab('sensitivity')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'sensitivity'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Sensibilité Marginale (O1..O5 & P1..P3)
            </button>
            <button
              onClick={() => setActiveTab('dynamics')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'dynamics'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              Dynamique Temporelle & 6 Doctrines
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'report'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              Bilan Markdown (campaign_report.md)
            </button>
          </div>

          <div className="text-xs text-stone-400 font-mono">
            Front de Pareto 4D : <strong className="text-emerald-400">{paretoCount}</strong> champions non-dominés
          </div>
        </div>

        {/* TAB 1: PODIUM & TABLE */}
        {activeTab === 'podium' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un code variante (ex: V0012, Strict, Sur_Place...)"
                  className="w-full bg-stone-950 border border-stone-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-500"
                />
              </div>

              <select
                value={filterO1}
                onChange={(e) => setFilterO1(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-200"
              >
                <option value="ALL">O1 Éligibilité : Toutes</option>
                {Object.keys(O1_MAP).map((k) => (
                  <option key={k} value={k}>
                    O1: {k}
                  </option>
                ))}
              </select>

              <select
                value={filterO2}
                onChange={(e) => setFilterO2(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-200"
              >
                <option value="ALL">O2 Boost : Tous</option>
                {Object.keys(O2_MAP).map((k) => (
                  <option key={k} value={k}>
                    O2: {k}
                  </option>
                ))}
              </select>

              <select
                value={filterO3}
                onChange={(e) => setFilterO3(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-200"
              >
                <option value="ALL">O3 Apprentissage : Tous</option>
                {Object.keys(O3_MAP).map((k) => (
                  <option key={k} value={k}>
                    O3: {k}
                  </option>
                ))}
              </select>

              <select
                value={filterP1}
                onChange={(e) => setFilterP1(e.target.value)}
                className="bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-200"
              >
                <option value="ALL">P1 Topologie : Toutes</option>
                {Object.keys(P1_MAP).map((k) => (
                  <option key={k} value={k}>
                    P1: {k}
                  </option>
                ))}
              </select>

              <label className="inline-flex items-center gap-2 text-xs text-stone-300 cursor-pointer select-none px-2">
                <input
                  type="checkbox"
                  checked={paretoOnly}
                  onChange={(e) => setParetoOnly(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-900 text-emerald-500"
                />
                Front Pareto 4D uniquement
              </label>
            </div>

            {/* Variants Table */}
            <div className="bg-stone-900/70 border border-stone-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-stone-800 bg-stone-950/80 text-stone-400 font-mono text-[11px] uppercase">
                      <th className="py-3 px-3">Rang</th>
                      <th className="py-3 px-3">Code Variante</th>
                      <th className="py-3 px-3 text-right">Score Global</th>
                      <th className="py-3 px-3 text-right">M1 Maîtrise</th>
                      <th className="py-3 px-3 text-right">M2 Adapt.</th>
                      <th className="py-3 px-3 text-right">M3 Tension</th>
                      <th className="py-3 px-3 text-right">M4 Fluidité</th>
                      <th className="py-3 px-3 text-right">Gain Lecture</th>
                      <th className="py-3 px-3 text-right">Arbres / Souches / Terr.</th>
                      <th className="py-3 px-3 text-right">Gestes / Ops</th>
                      <th className="py-3 px-3 text-center">Pareto 4D</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 font-mono">
                    {filteredResults.slice(0, 60).map((r) => {
                      const isSelected = selectedVariant?.variant_id === r.variant_id;
                      return (
                        <tr
                          key={r.variant_id}
                          onClick={() => {
                            setSelectedVariant(r);
                          }}
                          className={`transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-950/40 hover:bg-emerald-950/60'
                              : 'hover:bg-stone-800/50'
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-stone-300">#{r.rang_global}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-white">{r.code}</div>
                            <div className="text-[10px] text-stone-400 font-sans">
                              {r.O1_eligibilite} · {r.O2_boost} · {r.O3_apprentissage} · {r.P1_topologie} ({r.P3_duree_tours}t)
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-400 text-sm">
                            {r.score_global.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-stone-200">{r.M1_maitrise.toFixed(1)}</td>
                          <td className="py-2.5 px-3 text-right text-stone-200">{r.M2_adaptation.toFixed(1)}</td>
                          <td className="py-2.5 px-3 text-right text-stone-200">{r.M3_tension.toFixed(1)}</td>
                          <td className="py-2.5 px-3 text-right text-stone-200">{r.M4_simplicite.toFixed(1)}</td>
                          <td className="py-2.5 px-3 text-right text-emerald-300">
                            +{r.gain_lecture_vs_uniforme.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-stone-300">
                            <span className="text-emerald-400">{r.arbres_fin_pct.toFixed(0)}%</span> /{' '}
                            <span className="text-amber-400">{r.souches_fin_pct.toFixed(0)}%</span> /{' '}
                            <span className="text-rose-400">{r.terrasses_fin_pct.toFixed(0)}%</span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-stone-300">
                            {r.gestes_phys_par_tour.toFixed(1)}g / {r.ops_cog_par_tour.toFixed(1)}c
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {r.is_pareto_4d ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/30">
                                PARETO
                              </span>
                            ) : (
                              <span className="text-stone-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 bg-stone-950/60 border-t border-stone-800 text-xs text-stone-400 flex items-center justify-between">
                <span>
                  Affichage des {Math.min(60, filteredResults.length)} meilleures variantes sur{' '}
                  {filteredResults.length} filtrées (cliquez sur une ligne pour inspecter sa courbe tour par tour).
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MARGINAL SENSITIVITY ANALYSIS */}
        {activeTab === 'sensitivity' && (
          <div className="bg-stone-900/70 border border-stone-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-stone-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Analyse de Sensibilité Marginale (Impact Moyen par Option O1..O5 & Paramètre P1..P3)
                </h2>
                <p className="text-xs text-stone-400 mt-0.5">
                  Effet propre de chaque modalité moyenné sur l&apos;ensemble des variantes évaluées.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-800 bg-stone-950/80 text-stone-400 font-mono text-[11px] uppercase">
                    <th className="py-3 px-4">Facteur</th>
                    <th className="py-3 px-4">Modalité</th>
                    <th className="py-3 px-4 text-right">Score Global</th>
                    <th className="py-3 px-4 text-right">M1 Maîtrise</th>
                    <th className="py-3 px-4 text-right">M2 Adaptation</th>
                    <th className="py-3 px-4 text-right">M3 Tension</th>
                    <th className="py-3 px-4 text-right">M4 Simplicité</th>
                    <th className="py-3 px-4 text-right">Gain Lecture (%)</th>
                    <th className="py-3 px-4 text-right">Bascule Centre (pts)</th>
                    <th className="py-3 px-4 text-right">Gestes Phys/Tour</th>
                    <th className="py-3 px-4 text-right">Ops Cog/Tour</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/60 font-mono">
                  {sensitivityRows.map((s, idx) => (
                    <tr key={idx} className="hover:bg-stone-800/40">
                      <td className="py-2.5 px-4 text-stone-400">{s.Facteur}</td>
                      <td className="py-2.5 px-4 font-semibold text-white">{s.Modalite}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                        {s.Score_Global.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-stone-200">{s.M1_Maitrise.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-stone-200">{s.M2_Adaptation.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-stone-200">{s.M3_Tension.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-stone-200">{s.M4_Simplicite.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-emerald-300">
                        +{s.Gain_Lecture_Pct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-4 text-right text-sky-300">
                        +{s.Bascule_Centre_pts.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-stone-300">
                        {s.Gestes_Phys_Tour.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-stone-300">{s.Ops_Cog_Tour.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: TURN-BY-TURN DYNAMICS & 6 DOCTRINES */}
        {activeTab === 'dynamics' && selectedVariant && turnProfile && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 6 Iso-Effort Doctrines Response */}
            <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    Réponse aux 6 Doctrines de Parade Iso-Effort
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Variante sélectionnée : <strong className="font-mono text-white">{selectedVariant.code}</strong>{' '}
                    (Quota moyen : {selectedVariant.parades_utilisees_moy} parades/partie)
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    doc: ALL_DOCTRINES[0],
                    score: selectedVariant.score_D0_Uniforme,
                    color: 'bg-stone-500',
                  },
                  {
                    doc: ALL_DOCTRINES[1],
                    score: selectedVariant.score_D1_Anti_Coupe,
                    color: 'bg-amber-500',
                  },
                  {
                    doc: ALL_DOCTRINES[2],
                    score: selectedVariant.score_D2_Anti_Terrassement,
                    color: 'bg-orange-500',
                  },
                  {
                    doc: ALL_DOCTRINES[3],
                    score: selectedVariant.score_D3_Chasseur_Boost,
                    color: 'bg-emerald-500',
                  },
                  {
                    doc: ALL_DOCTRINES[4],
                    score: selectedVariant.score_D4_Lecteur_Piste_7,
                    color: 'bg-sky-500',
                  },
                  {
                    doc: ALL_DOCTRINES[5],
                    score: selectedVariant.score_D5_Contre_Temps,
                    color: 'bg-rose-500',
                  },
                ].map(({ doc, score, color }) => (
                  <div key={doc.code} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-stone-200">
                        <strong className="font-mono">{doc.code}</strong> — {doc.name}
                      </span>
                      <span className="font-mono font-bold text-white">{score.toFixed(2)}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-stone-950 rounded-full overflow-hidden border border-stone-800">
                      <div
                        className={`h-full ${color}`}
                        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-stone-400">{doc.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Turn-by-Turn Evolution Table & Visual Bars */}
            <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  Dynamique Temporelle Tour par Tour ({selectedVariant.P3_duree_tours} tours)
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  Évolution moyenne des 3 états de la forêt (Arbres / Souches / Terrassés) et de l&apos;occupation du centre 6-7-8 par le Terrassier.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-stone-800 text-stone-400 text-[11px] uppercase">
                      <th className="py-2 px-2">Tour</th>
                      <th className="py-2 px-2">Répartition Forêt (Vert / Souche / Terrassé)</th>
                      <th className="py-2 px-2 text-right">Arbres</th>
                      <th className="py-2 px-2 text-right">Souches</th>
                      <th className="py-2 px-2 text-right">Terrassés</th>
                      <th className="py-2 px-2 text-right">Centre 6-7-8 (T)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60">
                    {turnProfile.turns.map((turn, i) => {
                      const tr = turnProfile.trees_pct[i];
                      const st = turnProfile.stumps_pct[i];
                      const te = turnProfile.terraced_pct[i];
                      const ct = turnProfile.center_terrassier_pct[i];
                      return (
                        <tr key={turn} className="hover:bg-stone-800/40">
                          <td className="py-1.5 px-2 font-bold text-stone-300">T{turn}</td>
                          <td className="py-1.5 px-2 w-44">
                            <div className="w-full h-3 rounded overflow-hidden flex bg-stone-950">
                              <div
                                className="bg-emerald-500 h-full"
                                style={{ width: `${tr}%` }}
                                title={`Arbres: ${tr}%`}
                              />
                              <div
                                className="bg-amber-500 h-full"
                                style={{ width: `${st}%` }}
                                title={`Souches: ${st}%`}
                              />
                              <div
                                className="bg-rose-600 h-full"
                                style={{ width: `${te}%` }}
                                title={`Terrassés: ${te}%`}
                              />
                            </div>
                          </td>
                          <td className="py-1.5 px-2 text-right text-emerald-400">{tr.toFixed(1)}%</td>
                          <td className="py-1.5 px-2 text-right text-amber-400">{st.toFixed(1)}%</td>
                          <td className="py-1.5 px-2 text-right text-rose-400">{te.toFixed(1)}%</td>
                          <td className="py-1.5 px-2 text-right text-sky-300">{ct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MARKDOWN REPORT */}
        {activeTab === 'report' && (
          <div className="bg-stone-900/70 border border-stone-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Rapport Analytique Complet (campaign_report.md)
                </h2>
                <p className="text-xs text-stone-400">
                  Synthèse prête à exporter au format Markdown identique à la sortie de src/reporter.py.
                </p>
              </div>
              <button
                onClick={() =>
                  downloadFile('campaign_report.md', markdownReport, 'text/markdown;charset=utf-8')
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger campaign_report.md
              </button>
            </div>
            <pre className="bg-stone-950 border border-stone-800 rounded-xl p-4 text-xs font-mono text-stone-200 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
              {markdownReport}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
