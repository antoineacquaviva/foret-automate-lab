"""
Orchestrateur multiprocessus avec réservation de ressources (respiration VM),
ordonnancement basse priorité (os.nice), et reprise sur interruption (checkpointing par lots).
"""
import os
import sys
import time
import json
import argparse
import multiprocessing as mp
from pathlib import Path
from typing import List, Dict, Any
import numpy as np
import pandas as pd

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

from .variants import (
    VariantSpec,
    generate_variants,
    TOPOLOGIES,
    TOPOLOGY_LENGTHS,
    INITIAL_TRACKS,
)
from .doctrines import ALL_DOCTRINES
from .engine import simulate_batch_kernel, HAS_NUMBA
from .metrics import compute_variant_metrics, flag_pareto_front
from .reporter import generate_campaign_report


def _init_worker(nice_level: int):
    """Initialise chaque processus worker avec une priorité CPU réduite pour laisser respirer la VM."""
    try:
        current_nice = os.nice(0)
        if current_nice < nice_level:
            os.nice(nice_level - current_nice)
    except Exception:
        pass


def _evaluate_single_variant(args_tuple) -> Dict[str, Any]:
    """Fonction exécutée par un worker pour évaluer 1 variante sur toutes les tailles de table, efforts et doctrines."""
    variant_spec, player_counts, effort_rates, n_games, base_seed, weights = args_tuple
    o1, o2, o3, o4, o5, p1, p2, T_turns = variant_spec.to_int_tuple()

    init_cells = TOPOLOGIES[variant_spec.P1_topologie]
    L_cells = TOPOLOGY_LENGTHS[variant_spec.P1_topologie]
    init_track = INITIAL_TRACKS[variant_spec.O4_init_piste]

    doctrine_accum: Dict[str, np.ndarray] = {}
    n_configs_per_doc = len(player_counts) * len(effort_rates)

    for doc in ALL_DOCTRINES:
        acc_vec = np.zeros(11, dtype=np.float64)
        for n_p in player_counts:
            for eff in effort_rates:
                # Graine déterministe propre au couple (variant, doctrine, n_players, effort)
                # Note : on utilise la même graine entre les doctrines à (variant, n_players, effort) fixé
                # pour réduire la variance Monte-Carlo (Common Random Numbers) !
                crn_seed = (
                    base_seed
                    + variant_spec.variant_id * 1009
                    + n_p * 131
                    + int(round(eff * 100)) * 17
                )
                res_vec = simulate_batch_kernel(
                    o1=o1,
                    o2=o2,
                    o3=o3,
                    o4=o4,
                    o5=o5,
                    p1=p1,
                    p2=p2,
                    T_turns=T_turns,
                    n_players=n_p,
                    doctrine_id=doc.doctrine_id,
                    effort_rate=float(eff),
                    n_games=n_games,
                    seed=crn_seed,
                    init_cells=init_cells,
                    L_cells=L_cells,
                    init_track=init_track,
                )
                acc_vec += res_vec
        doctrine_accum[doc.code] = acc_vec / float(max(1, n_configs_per_doc))

    return compute_variant_metrics(variant_spec, doctrine_accum, weights=weights)


def get_optimal_workers(requested_workers: int = None) -> int:
    """
    Calcule le nombre de workers optimal en laissant toujours au moins 2 threads matériels libres
    (ex: 14 workers sur les 16 vCPUs de la VM.Standard.E5.Flex 8 OCPU).
    """
    total_cpus = os.cpu_count() or 4
    safe_default = max(1, total_cpus - 2) if total_cpus >= 4 else max(1, total_cpus - 1)
    if requested_workers is None or requested_workers <= 0:
        return safe_default
    return min(requested_workers, max(1, total_cpus - 1))


def run_campaign(config_path: str, output_dir: str = "results", override_workers: int = None):
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    campaign_name = config.get("campaign_name", "campagne_test")
    hw_cfg = config.get("hardware", {})
    sim_cfg = config.get("simulation", {})
    weights = config.get("metrics_weights", None)

    n_workers = get_optimal_workers(override_workers or hw_cfg.get("max_workers", 14))
    nice_level = int(hw_cfg.get("nice_level", 15))
    chunk_size = int(hw_cfg.get("chunk_size_variants", 36))

    n_games = int(sim_cfg.get("n_games_per_eval", 1000))
    player_counts = sim_cfg.get("player_counts", [3, 4, 5, 6])
    effort_rates = sim_cfg.get("effort_rates", [0.30, 0.50, 0.70])
    base_seed = int(sim_cfg.get("base_seed", 20261025))

    out_root = Path(output_dir) / campaign_name
    ckpt_dir = out_root / "checkpoints"
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt_state_file = out_root / "checkpoint_state.json"

    variants = generate_variants(config.get("grid_filter"))
    total_variants = len(variants)
    games_per_variant = len(ALL_DOCTRINES) * len(player_counts) * len(effort_rates) * n_games
    total_games_planned = total_variants * games_per_variant

    print("=" * 78)
    print(f" BANC D'ESSAI AUTOMATE FORÊT — Campagne : {campaign_name}")
    print("=" * 78)
    print(f" • vCPUs détectés : {os.cpu_count()} | Workers alloués : {n_workers} (nice={nice_level})")
    print(f" • Accélération JIT Numba active : {'OUI (@njit nogil)' if HAS_NUMBA else 'NON (Mode Python/NumPy)'}")
    print(f" • Variantes cartésiennes : {total_variants}")
    print(f" • Parties / variante : {games_per_variant:,} ({len(ALL_DOCTRINES)} doctrines × {len(player_counts)} tables × {len(effort_rates)} efforts × {n_games} MC)")
    print(f" • Volume total : {total_games_planned:,} parties simulées")
    print("=" * 78)

    # Lecture de l'état de reprise (Checkpointing)
    completed_chunks = set()
    if ckpt_state_file.exists():
        try:
            state_data = json.loads(ckpt_state_file.read_text(encoding="utf-8"))
            completed_chunks = set(state_data.get("completed_chunks", []))
            if completed_chunks:
                print(f" [REPRISE] {len(completed_chunks)} lots déjà calculés trouvés dans {ckpt_dir}.")
        except Exception:
            completed_chunks = set()

    chunks: List[List[VariantSpec]] = [
        variants[i : i + chunk_size] for i in range(0, total_variants, chunk_size)
    ]
    total_chunks = len(chunks)

    start_time = time.time()
    variants_done = sum(len(chunks[c_idx]) for c_idx in completed_chunks if c_idx < total_chunks)

    # Appliquer nice au processus maître également
    _init_worker(nice_level)

    with mp.Pool(processes=n_workers, initializer=_init_worker, initargs=(nice_level,)) as pool:
        for c_idx, chunk in enumerate(chunks):
            chunk_csv = ckpt_dir / f"chunk_{c_idx:04d}.csv"
            if c_idx in completed_chunks and chunk_csv.exists():
                continue

            t0_chunk = time.time()
            tasks = [
                (v, player_counts, effort_rates, n_games, base_seed, weights)
                for v in chunk
            ]
            chunk_rows = pool.map(_evaluate_single_variant, tasks)

            # Écriture atomique du lot sur disque
            df_chunk = pd.DataFrame(chunk_rows)
            tmp_csv = ckpt_dir / f"chunk_{c_idx:04d}.csv.tmp"
            df_chunk.to_csv(tmp_csv, index=False)
            tmp_csv.replace(chunk_csv)

            completed_chunks.add(c_idx)
            ckpt_state_file.write_text(
                json.dumps(
                    {
                        "campaign_name": campaign_name,
                        "total_chunks": total_chunks,
                        "completed_chunks": sorted(list(completed_chunks)),
                        "last_update_epoch": time.time(),
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )

            variants_done += len(chunk)
            elapsed = max(0.001, time.time() - start_time)
            dt_chunk = max(0.001, time.time() - t0_chunk)
            speed_games_sec = (len(chunk) * games_per_variant) / dt_chunk
            rem_variants = total_variants - variants_done
            avg_var_per_sec = variants_done / elapsed
            eta_sec = rem_variants / max(0.001, avg_var_per_sec)

            ram_info = ""
            if HAS_PSUTIL:
                mem_gb = psutil.Process(os.getpid()).memory_info().rss / (1024 ** 3)
                ram_info = f" | RAM maître: {mem_gb:.2f} Go"

            print(
                f" [Lot {c_idx + 1:03d}/{total_chunks:03d}] "
                f"{variants_done:4d}/{total_variants} var. ({100.0 * variants_done / total_variants:5.1f}%) | "
                f"Vitesse: {speed_games_sec:,.0f} parties/s | "
                f"ETA: {eta_sec / 60.0:.1f} min{ram_info}",
                flush=True,
            )

    # Consolidation finale de tous les lots
    all_chunk_files = sorted(ckpt_dir.glob("chunk_*.csv"))
    df_all = pd.concat([pd.read_csv(f) for f in all_chunk_files], ignore_index=True)
    df_all = flag_pareto_front(df_all)
    df_all.sort_values(by=["score_global", "M1_maitrise"], ascending=[False, False], inplace=True)
    df_all.reset_index(drop=True, inplace=True)
    df_all["rang_global"] = df_all.index + 1

    final_csv_path = out_root / "variants_ranking.csv"
    df_all.to_csv(final_csv_path, index=False)

    total_duration = time.time() - start_time
    report_path = out_root / "campaign_report.md"
    generate_campaign_report(
        df=df_all,
        config=config,
        output_md_path=report_path,
        total_duration_sec=total_duration,
        n_workers=n_workers,
    )

    print("=" * 78)
    print(f" CAMPAGNE TERMINÉE EN {total_duration:.1f} SECONDES")
    print(f" • Classement CSV complet : {final_csv_path}")
    print(f" • Rapport d'analyse Markdown : {report_path}")
    print("=" * 78)
    return df_all, report_path


def main():
    parser = argparse.ArgumentParser(description="Simulateur Monte-Carlo de l'automate Défenseurs de la Forêt")
    parser.add_argument(
        "--config",
        type=str,
        default="configs/default_campaign.json",
        help="Chemin du fichier JSON de configuration de campagne",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="results",
        help="Répertoire racine des résultats et checkpoints",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=None,
        help="Nombre de processus workers (défaut: auto avec 2 vCPUs réservés pour la VM)",
    )
    args = parser.parse_args()
    run_campaign(args.config, args.output_dir, args.workers)


if __name__ == "__main__":
    main()
