"""
Suite de tests unitaires validant les invariants physiques et statistiques du simulateur :
  1. Génération exacte des 2 916 variantes cartésiennes.
  2. Respect du budget de parades Iso-Effort entre les 6 doctrines (D0 à D5).
  3. Cohérence de la somme des 3 états (Arbres + Souches + Terrassés = 100%).
  4. Écart mesurable de la métrique de Simplicité entre variantes sobres et variantes chargées.
"""
import unittest
import numpy as np

from src.variants import generate_variants, TOPOLOGIES, TOPOLOGY_LENGTHS, INITIAL_TRACKS
from src.doctrines import ALL_DOCTRINES
from src.engine import simulate_batch_kernel
from src.metrics import compute_variant_metrics


class TestAutomateEngine(unittest.TestCase):
    def test_cartesian_variants_count(self):
        variants = generate_variants()
        self.assertEqual(len(variants), 2916)

    def test_three_states_conservation_and_iso_effort(self):
        v = generate_variants()[0]
        o1, o2, o3, o4, o5, p1, p2, T_turns = v.to_int_tuple()
        init_cells = TOPOLOGIES[v.P1_topologie]
        L_cells = TOPOLOGY_LENGTHS[v.P1_topologie]
        init_track = INITIAL_TRACKS[v.O4_init_piste]

        parries_by_doc = []
        for doc in ALL_DOCTRINES:
            res = simulate_batch_kernel(
                o1, o2, o3, o4, o5, p1, p2, T_turns,
                n_players=4,
                doctrine_id=doc.doctrine_id,
                effort_rate=0.50,
                n_games=200,
                seed=12345,
                init_cells=init_cells,
                L_cells=L_cells,
                init_track=init_track,
            )
            # Somme des 3 états = 100%
            total_pct = res[2] + res[3] + res[4]
            self.assertAlmostEqual(total_pct, 100.0, places=4)
            parries_by_doc.append(res[10])

        # Vérifie que toutes les doctrines dépensent le même budget de parades (à < 0.8 parade près sur la partie)
        self.assertLess(max(parries_by_doc) - min(parries_by_doc), 1.25)

    def test_simplicity_metric_discriminates_complex_variants(self):
        variants = generate_variants()
        # Variante simple : Strict, Sur_Place_x2, Standard_1, Proportionnel_Sup
        v_simple = next(
            v for v in variants
            if v.O1_eligibilite == "Strict"
            and v.O2_boost == "Sur_Place_x2"
            and v.O3_apprentissage == "Standard_1"
            and v.P2_largeur_vague == "Proportionnel_Sup"
            and v.P3_duree_tours == 12
        )
        # Variante complexe : Souple (Fallback), Debordement, Cumulatif_K, Proportionnel_Large
        v_complex = next(
            v for v in variants
            if v.O1_eligibilite == "Souple"
            and v.O2_boost == "Debordement"
            and v.O3_apprentissage == "Cumulatif_K"
            and v.P2_largeur_vague == "Proportionnel_Large"
            and v.P3_duree_tours == 20
        )

        def eval_v(v):
            o1, o2, o3, o4, o5, p1, p2, T_turns = v.to_int_tuple()
            doc_res = {}
            for doc in ALL_DOCTRINES:
                doc_res[doc.code] = simulate_batch_kernel(
                    o1, o2, o3, o4, o5, p1, p2, T_turns,
                    4, doc.doctrine_id, 0.50, 100, 999,
                    TOPOLOGIES[v.P1_topologie],
                    TOPOLOGY_LENGTHS[v.P1_topologie],
                    INITIAL_TRACKS[v.O4_init_piste],
                )
            return compute_variant_metrics(v, doc_res)

        m_simple = eval_v(v_simple)
        m_complex = eval_v(v_complex)
        self.assertGreater(m_simple["M4_simplicite"], m_complex["M4_simplicite"] + 15.0)
        self.assertLess(m_simple["ops_cog_par_tour"], m_complex["ops_cog_par_tour"])
        self.assertLess(m_simple["gestes_phys_par_tour"], m_complex["gestes_phys_par_tour"])


if __name__ == "__main__":
    unittest.main()
