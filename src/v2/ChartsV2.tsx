import React from 'react';
import { EvaluatedAutomatonV2 } from './metrics_and_qd';
import { TurnByTurnProfileV2, ALL_BOTS_V2 } from './bots_and_vm';

interface Radar4DProps {
  selected: EvaluatedAutomatonV2;
  top3: EvaluatedAutomatonV2[];
}

export const Radar4DChart: React.FC<Radar4DProps> = ({ selected, top3 }) => {
  const cx = 140;
  const cy = 130;
  const maxR = 90;

  // 4 axes: Top (M1 Maîtrise), Right (M2 Adaptation), Bottom (M3 Tension), Left (M4 Simplicité)
  const getPoints = (m1: number, m2: number, m3: number, m4: number) => {
    const pTop = `${cx},${cy - (m1 / 100) * maxR}`;
    const pRight = `${cx + (m2 / 100) * maxR},${cy}`;
    const pBottom = `${cx},${cy + (m3 / 100) * maxR}`;
    const pLeft = `${cx - (m4 / 100) * maxR},${cy}`;
    return `${pTop} ${pRight} ${pBottom} ${pLeft}`;
  };

  const rings = [25, 50, 75, 100];
  const refLeader = top3[0];

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 280 260" className="w-full max-w-[280px] h-auto overflow-visible">
        {/* Polygonal calibration rings */}
        {rings.map((pct) => (
          <polygon
            key={pct}
            points={getPoints(pct, pct, pct, pct)}
            fill="none"
            stroke="#1E293B"
            strokeWidth="1"
          />
        ))}
        {/* Axes */}
        <line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="#334155" strokeWidth="1" />
        <line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="#334155" strokeWidth="1" />

        {/* Top 1 reference polygon (dashed cyan) */}
        {refLeader && refLeader.id !== selected.id && (
          <polygon
            points={getPoints(
              refLeader.M1_maitrise,
              refLeader.M2_adaptation,
              refLeader.M3_tension,
              refLeader.M4_simplicite
            )}
            fill="rgba(6, 182, 212, 0.08)"
            stroke="#06B6D4"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        )}

        {/* Selected variant polygon (solid emerald) */}
        <polygon
          points={getPoints(
            selected.M1_maitrise,
            selected.M2_adaptation,
            selected.M3_tension,
            selected.M4_simplicite
          )}
          fill="rgba(16, 185, 129, 0.22)"
          stroke="#10B981"
          strokeWidth="2"
        />

        {/* Vertex Labels */}
        <text
          x={cx}
          y={cy - maxR - 10}
          textAnchor="middle"
          className="fill-slate-300 font-mono text-[10px]"
        >
          M1 MAÎTRISE ({selected.M1_maitrise.toFixed(0)})
        </text>
        <text
          x={cx + maxR + 8}
          y={cy + 3}
          textAnchor="start"
          className="fill-slate-300 font-mono text-[10px]"
        >
          M2 ({selected.M2_adaptation.toFixed(0)})
        </text>
        <text
          x={cx}
          y={cy + maxR + 16}
          textAnchor="middle"
          className="fill-slate-300 font-mono text-[10px]"
        >
          M3 TENSION ({selected.M3_tension.toFixed(0)})
        </text>
        <text
          x={cx - maxR - 8}
          y={cy + 3}
          textAnchor="end"
          className="fill-slate-300 font-mono text-[10px]"
        >
          M4 ({selected.M4_simplicite.toFixed(0)})
        </text>
      </svg>
      <div className="flex items-center gap-4 text-xs text-slate-400 font-mono mt-1">
        <span>Sélection : {selected.code}</span>
        {refLeader && refLeader.id !== selected.id && (
          <>
            <span>·</span>
            <span className="text-cyan-400">Pointillés : #1 ({refLeader.code})</span>
          </>
        )}
      </div>
    </div>
  );
};

interface BotsResponseProps {
  selected: EvaluatedAutomatonV2;
}

export const BotsResponseChart: React.FC<BotsResponseProps> = ({ selected }) => {
  const scores = [
    { bot: ALL_BOTS_V2[0], val: selected.botScores.B0_Passif, tone: 'bg-slate-600' },
    { bot: ALL_BOTS_V2[1], val: selected.botScores.B1_Aveugle, tone: 'bg-slate-400' },
    { bot: ALL_BOTS_V2[2], val: selected.botScores.B2a_Mono_Anti_Coupe, tone: 'bg-amber-500' },
    { bot: ALL_BOTS_V2[3], val: selected.botScores.B2b_Mono_Anti_Bull, tone: 'bg-amber-500' },
    { bot: ALL_BOTS_V2[4], val: selected.botScores.B2c_Mono_Anti_Avance, tone: 'bg-amber-500' },
    { bot: ALL_BOTS_V2[5], val: selected.botScores.B3_Tacticien_Couloir, tone: 'bg-emerald-500' },
    { bot: ALL_BOTS_V2[6], val: selected.botScores.B4_Stratege_Complet, tone: 'bg-cyan-400' },
  ];

  const monoMax = Math.max(
    selected.botScores.B2a_Mono_Anti_Coupe,
    selected.botScores.B2b_Mono_Anti_Bull,
    selected.botScores.B2c_Mono_Anti_Avance
  );
  const smartMin = Math.min(
    selected.botScores.B3_Tacticien_Couloir,
    selected.botScores.B4_Stratege_Complet
  );
  const nashMargin = smartMin - monoMax;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Marge Anti-Martingale (min(B3,B4) − max(B2)) :{' '}
          <strong
            className={`font-mono tabular-nums ${
              nashMargin > 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {nashMargin >= 0 ? `+${nashMargin.toFixed(2)}%` : `${nashMargin.toFixed(2)}%`}
          </strong>
        </span>
        <span className="font-mono tabular-nums text-slate-400">
          SNR: {selected.snr.toFixed(2)} · τ_K: {selected.kendallTau.toFixed(2)}
        </span>
      </div>

      <div className="space-y-2">
        {scores.map(({ bot, val, tone }) => (
          <div key={bot.code} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 truncate max-w-[230px]" title={bot.description}>
                <span className="font-mono text-slate-100">{bot.code}</span> · {bot.name}
              </span>
              <span className="font-mono tabular-nums text-slate-100 font-semibold">
                {val.toFixed(2)} %
              </span>
            </div>
            <div className="w-full h-2 bg-slate-950 border border-slate-800 overflow-hidden">
              <div
                className={`h-full ${tone}`}
                style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface MapElitesGridProps {
  archive: Map<string, EvaluatedAutomatonV2>;
  selectedId: number;
  activeZ: number | 'ALL';
  onSelectZ: (z: number | 'ALL') => void;
  onSelectAutomaton: (a: EvaluatedAutomatonV2) => void;
}

export const MapElitesHeatmap: React.FC<MapElitesGridProps> = ({
  archive,
  selectedId,
  activeZ,
  onSelectZ,
  onSelectAutomaton,
}) => {
  // Construit une projection 10 x 10 (Axe X = Complexité table 0..9, Axe Y = Ratio Coupe/Terrassement 0..9)
  const grid: Array<Array<EvaluatedAutomatonV2 | null>> = Array.from({ length: 10 }, () =>
    new Array(10).fill(null)
  );

  for (const item of archive.values()) {
    if (activeZ !== 'ALL' && item.nicheZ !== activeZ) continue;
    const cur = grid[item.nicheY][item.nicheX];
    if (!cur || item.scoreGlobal > cur.scoreGlobal) {
      grid[item.nicheY][item.nicheX] = item;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-400">
          Axe Horizontal X : Complexité sur Table (Minimaliste → Expert) · Axe Vertical Y : Pression Coupe/Bull
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400 mr-1">Tranche Cinétique Z :</span>
          <button
            onClick={() => onSelectZ('ALL')}
            className={`px-2 py-1 text-xs font-mono transition cursor-pointer whitespace-nowrap shrink-0 ${
              activeZ === 'ALL'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Projection Max (800)
          </button>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((z) => (
            <button
              key={z}
              onClick={() => onSelectZ(z)}
              className={`px-2 py-1 text-xs font-mono transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeZ === z
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              Z{z}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-10 gap-[2px] bg-slate-800 p-[2px] border border-slate-800">
        {grid
          .slice()
          .reverse()
          .map((row, rIdx) => {
            const yVal = 9 - rIdx;
            return row.map((cell, xVal) => {
              if (!cell) {
                return (
                  <div
                    key={`${xVal}-${yVal}`}
                    className="h-9 bg-[#090D16] flex items-center justify-center text-[10px] font-mono text-slate-700"
                    title={`Niche [${xVal}, ${yVal}] : Inexplorée`}
                  >
                    ·
                  </div>
                );
              }
              const isSelected = cell.id === selectedId;
              const score = cell.scoreGlobal;
              const bgClass =
                score >= 70
                  ? 'bg-emerald-500/80 text-slate-950 font-bold'
                  : score >= 58
                  ? 'bg-cyan-500/60 text-slate-100'
                  : score >= 45
                  ? 'bg-sky-800/70 text-slate-200'
                  : 'bg-slate-800 text-slate-400';

              return (
                <button
                  key={`${xVal}-${yVal}`}
                  onClick={() => onSelectAutomaton(cell)}
                  title={`Niche [${xVal},${yVal},Z${cell.nicheZ}] — ${cell.code} | Score: ${cell.scoreGlobal}`}
                  className={`h-9 flex flex-col items-center justify-center text-[10px] font-mono tabular-nums transition cursor-pointer ${bgClass} ${
                    isSelected ? 'ring-2 ring-amber-400 z-10' : 'hover:opacity-90'
                  }`}
                >
                  <span>{cell.scoreGlobal.toFixed(0)}</span>
                </button>
              );
            });
          })}
      </div>
    </div>
  );
};

interface TurnCurveProps {
  profile: TurnByTurnProfileV2;
}

export const TurnByTurnCurveChart: React.FC<TurnCurveProps> = ({ profile }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
            <th className="py-1.5 px-2">Tour</th>
            <th className="py-1.5 px-2">États (Arbres · Souches Piste 3 · Souches Extra · Terrassés)</th>
            <th className="py-1.5 px-2 text-right">Arbres</th>
            <th className="py-1.5 px-2 text-right">Souches P3</th>
            <th className="py-1.5 px-2 text-right">Terrassés</th>
            <th className="py-1.5 px-2 text-right">Cœur 6-7-8 (Bull)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {profile.turns.map((turn, idx) => {
            const tr = profile.treesRawPct[idx];
            const sc = profile.stumpsCritPiste3Pct[idx];
            const se = profile.stumpsExtraPct[idx];
            const te = profile.terracedPct[idx];
            const cb = profile.centerBulldozerPct[idx];
            return (
              <tr key={turn} className="hover:bg-slate-800/40">
                <td className="py-1 px-2 text-slate-300 font-semibold">T{turn}</td>
                <td className="py-1 px-2 w-44">
                  <div className="w-full h-2.5 flex bg-slate-950 border border-slate-800 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${tr}%` }}
                      title={`Arbres: ${tr}%`}
                    />
                    <div
                      className="bg-cyan-400 h-full"
                      style={{ width: `${sc}%` }}
                      title={`Souches Critiques Piste 3: ${sc}%`}
                    />
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${se}%` }}
                      title={`Souches Surnuméraires: ${se}%`}
                    />
                    <div
                      className="bg-rose-500 h-full"
                      style={{ width: `${te}%` }}
                      title={`Zones Terrassées: ${te}%`}
                    />
                  </div>
                </td>
                <td className="py-1 px-2 text-right text-emerald-400">{tr.toFixed(1)}%</td>
                <td className="py-1 px-2 text-right text-cyan-300">
                  {sc.toFixed(1)}% <span className="text-amber-400">(+{se.toFixed(0)}%)</span>
                </td>
                <td className="py-1 px-2 text-right text-rose-400">{te.toFixed(1)}%</td>
                <td className="py-1 px-2 text-right text-slate-300">{cb.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
