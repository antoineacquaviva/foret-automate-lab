import { EvaluatedVariant } from './metrics';
import { TurnProfile } from './engine';

export interface SensitivityRow {
  Facteur: string;
  Modalite: string;
  Score_Global: number;
  M1_Maitrise: number;
  M2_Adaptation: number;
  M3_Tension: number;
  M4_Simplicite: number;
  Gain_Lecture_Pct: number;
  Bascule_Centre_pts: number;
  Gestes_Phys_Tour: number;
  Ops_Cog_Tour: number;
}

const FACTORS: Array<keyof EvaluatedVariant> = [
  'O1_eligibilite',
  'O2_boost',
  'O3_apprentissage',
  'O4_init_piste',
  'O5_score_souches',
  'P1_topologie',
  'P2_largeur_vague',
  'P3_duree_tours',
];

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
}

export function computeSensitivityAnalysis(rows: EvaluatedVariant[]): SensitivityRow[] {
  const out: SensitivityRow[] = [];
  for (const factor of FACTORS) {
    const groups = new Map<string, EvaluatedVariant[]>();
    for (const r of rows) {
      const key = String(r[factor]);
      const list = groups.get(key) || [];
      list.push(r);
      groups.set(key, list);
    }
    for (const [modalite, list] of groups.entries()) {
      out.push({
        Facteur: String(factor),
        Modalite: modalite,
        Score_Global: avg(list.map((x) => x.score_global)),
        M1_Maitrise: avg(list.map((x) => x.M1_maitrise)),
        M2_Adaptation: avg(list.map((x) => x.M2_adaptation)),
        M3_Tension: avg(list.map((x) => x.M3_tension)),
        M4_Simplicite: avg(list.map((x) => x.M4_simplicite)),
        Gain_Lecture_Pct: avg(list.map((x) => x.gain_lecture_vs_uniforme)),
        Bascule_Centre_pts: avg(list.map((x) => x.bascule_centre_pts)),
        Gestes_Phys_Tour: avg(list.map((x) => x.gestes_phys_par_tour)),
        Ops_Cog_Tour: avg(list.map((x) => x.ops_cog_par_tour)),
      });
    }
  }
  return out;
}

export function generateMarkdownReport(
  rows: EvaluatedVariant[],
  sensitivity: SensitivityRow[],
  turnProfile: TurnProfile,
  campaignName: string,
  nGames: number,
  playerCounts: number[],
  effortRates: number[],
  durationSec: number
): string {
  if (rows.length === 0) return '# Aucun résultat';
  const top1 = rows[0];
  const paretoCount = rows.filter((r) => r.is_pareto_4d).length;
  const totalGames = rows.length * 6 * playerCounts.length * effortRates.length * nGames;

  const lines: string[] = [];
  lines.push(`# Bilan de Campagne — Banc d'Essai Automate Forêt (\`${campaignName}\`)\n`);
  lines.push(`## 1. Synthèse d'Exécution & Métriques de Référence\n`);
  lines.push(`* **Variantes cartésiennes évaluées :** \`${rows.length.toLocaleString('fr-FR')}\` (dont \`${paretoCount}\` sur le Front de Pareto 4D non-dominé)`);
  lines.push(`* **Volume de simulation :** \`${totalGames.toLocaleString('fr-FR')}\` parties complètes (\`${nGames}\` parties MC × \`6\` Doctrines × \`${playerCounts.length}\` tailles de table × \`${effortRates.length}\` niveaux d'effort)`);
  lines.push(`* **Temps de calcul :** \`${durationSec.toFixed(2)} s\` (\`${Math.round(totalGames / Math.max(0.01, durationSec)).toLocaleString('fr-FR')}\` parties/s)\n`);

  lines.push(`### Variante #1 Recommandée (Meilleur Compromis Global Pareto)\n`);
  lines.push(`* **Identifiant :** **\`${top1.code}\`** (Score Global : **\`${top1.score_global}/100\`** | Pareto 4D : \`${Boolean(top1.is_pareto_4d)}\`)`);
  lines.push(`* **Options retenues :** Éligibilité=\`${top1.O1_eligibilite}\` | Boost=\`${top1.O2_boost}\` | Apprentissage=\`${top1.O3_apprentissage}\` | Piste initiale=\`${top1.O4_init_piste}\` | Score=\`${top1.O5_score_souches}\``);
  lines.push(`* **Paramètres retenus :** Topologie=\`${top1.P1_topologie}\` | Vague=\`${top1.P2_largeur_vague}\` | Durée=\`${top1.P3_duree_tours} tours\``);
  lines.push(`* **Profil des 4 Métriques :**`);
  lines.push(`  * **M1 — Intérêt Stratégique (\`${top1.M1_maitrise}/100\`) :** Gain de lecture \`+${top1.gain_lecture_vs_uniforme}%\` vs parade aveugle (\`+${top1.ecart_lecture_vs_contretemps}%\` vs contre-temps)`);
  lines.push(`  * **M2 — Résilience & Bascule Adaptative (\`${top1.M2_adaptation}/100\`) :** Part des Terrassiers au centre (6-7-8) passant de \`${top1.centre_terrassier_debut_pct}%\` (début) à \`${top1.centre_terrassier_fin_pct}%\` (fin)`);
  lines.push(`  * **M3 — Équilibre & Tension (\`${top1.M3_tension}/100\`) :** Fin de partie moyenne à \`${top1.arbres_fin_pct}%\` Arbres, \`${top1.souches_fin_pct}%\` Souches, \`${top1.terrasses_fin_pct}%\` Terrassés (patinage : \`${top1.taux_patinage_pct}%\`)`);
  lines.push(`  * **M4 — Simplicité & Fluidité Table (\`${top1.M4_simplicite}/100\`) :** \`${top1.gestes_phys_par_tour}\` gestes physiques/tour et \`${top1.ops_cog_par_tour}\` opérations cognitives/tour\n`);

  lines.push(`---\n`);
  lines.push(`## 2. Podium Global des 15 Meilleures Variantes\n`);
  lines.push(`| Rang | Code | Score Global | M1 Maîtrise | M2 Adaptation | M3 Tension | M4 Simplicité | Gain Lecture (%) | Gestes/Tour | Ops Cog/Tour | Pareto 4D |`);
  lines.push(`|---:|:---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|`);
  for (const r of rows.slice(0, 15)) {
    lines.push(
      `| ${r.rang_global} | \`${r.code}\` | **${r.score_global}** | ${r.M1_maitrise} | ${r.M2_adaptation} | ${r.M3_tension} | ${r.M4_simplicite} | +${r.gain_lecture_vs_uniforme}% | ${r.gestes_phys_par_tour} | ${r.ops_cog_par_tour} | ${r.is_pareto_4d ? 'Oui' : 'Non'} |`
    );
  }

  lines.push(`\n---\n`);
  lines.push(`## 3. Analyse de Sensibilité Marginale\n`);
  lines.push(`| Facteur | Modalité | Score Global | M1 Maîtrise | M2 Adaptation | M3 Tension | M4 Simplicité | Gain Lecture (%) | Bascule Centre (pts) | Gestes/Tour | Ops Cog/Tour |`);
  lines.push(`|:---|:---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const s of sensitivity) {
    lines.push(
      `| ${s.Facteur} | \`${s.Modalite}\` | **${s.Score_Global}** | ${s.M1_Maitrise} | ${s.M2_Adaptation} | ${s.M3_Tension} | ${s.M4_Simplicite} | +${s.Gain_Lecture_Pct}% | +${s.Bascule_Centre_pts} | ${s.Gestes_Phys_Tour} | ${s.Ops_Cog_Tour} |`
    );
  }

  lines.push(`\n---\n`);
  lines.push(`## 5. Dynamique Temporelle Tour par Tour de la Variante #1 (\`${top1.code}\`)\n`);
  lines.push(`| Tour | Arbres Debout (%) | Souches (%) | Zones Terrassées (%) | Tuiles Terrassier au Centre 6-7-8 (%) |`);
  lines.push(`|---:|---:|---:|---:|---:|`);
  for (let i = 0; i < turnProfile.turns.length; i++) {
    lines.push(
      `| ${turnProfile.turns[i]} | ${turnProfile.trees_pct[i]}% | ${turnProfile.stumps_pct[i]}% | ${turnProfile.terraced_pct[i]}% | ${turnProfile.center_terrassier_pct[i]}% |`
    );
  }

  return lines.join('\n');
}

export function exportVariantsCsv(rows: EvaluatedVariant[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]) as Array<keyof EvaluatedVariant>;
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => JSON.stringify(r[h] ?? '')).join(','));
  }
  return lines.join('\n');
}
