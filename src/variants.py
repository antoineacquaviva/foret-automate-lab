"""
Générateur de l'espace cartésien des variantes (Options O1..O5 et Paramètres P1..P3).
"""
import itertools
from dataclasses import dataclass, asdict
from typing import List, Dict, Any
import numpy as np

# Encodage entier des modalités pour le moteur compilé Numba
O1_MAP = {"Strict": 0, "Souple": 1}
O2_MAP = {"Sur_Place_x2": 0, "Rasage_Complet": 1, "Debordement": 2}
O3_MAP = {"Standard_1": 0, "Boost_Turbo_2": 1, "Cumulatif_K": 2}
O4_MAP = {"6C_5T_Centre_Coupe": 0, "6C_5T_Alterne": 1, "5C_6T_Pression_Terre": 2}
O5_MAP = {"Arbres_Seuls": 0, "Souches_Demi_Point": 1}

P1_MAP = {"6c_15a": 0, "6c_18a": 1, "5c_12a": 2}
P2_MAP = {"Proportionnel_Sup": 0, "Proportionnel_Large": 1, "Asymetrique_Front": 2}

# Définition des topologies de piste (capacités d'arbres par case, de la Case 1 à la Case L)
TOPOLOGIES = {
    "6c_15a": np.array([2, 2, 2, 3, 3, 3], dtype=np.int32),
    "6c_18a": np.array([2, 2, 3, 3, 4, 4], dtype=np.int32),
    "5c_12a": np.array([2, 2, 2, 3, 3, 0], dtype=np.int32),  # Pad à 6 avec longueur active L=5
}
TOPOLOGY_LENGTHS = {
    "6c_15a": 6,
    "6c_18a": 6,
    "5c_12a": 5,
}

# Distributions initiales sur les 11 cases de la Piste Tactique (Sommes 2 à 12 -> index 0 à 10)
# 0 = C1 (Défrichage), 1 = C2 (Percée), 2 = T1 (Sillage), 3 = T2 (Ratissage Industriel)
INITIAL_TRACKS = {
    "6C_5T_Centre_Coupe": np.array([3, 2, 3, 0, 1, 0, 1, 0, 2, 3, 2], dtype=np.int32),
    "6C_5T_Alterne":      np.array([3, 1, 2, 0, 3, 0, 1, 2, 0, 3, 1], dtype=np.int32),
    "5C_6T_Pression_Terre": np.array([0, 3, 1, 2, 3, 0, 2, 3, 1, 2, 0], dtype=np.int32),
}


@dataclass(frozen=True)
class VariantSpec:
    variant_id: int
    code: str
    O1_eligibilite: str
    O2_boost: str
    O3_apprentissage: str
    O4_init_piste: str
    O5_score_souches: str
    P1_topologie: str
    P2_largeur_vague: str
    P3_duree_tours: int

    def to_int_tuple(self):
        """Retourne les codes entiers nécessaires au moteur Numba."""
        return (
            O1_MAP[self.O1_eligibilite],
            O2_MAP[self.O2_boost],
            O3_MAP[self.O3_apprentissage],
            O4_MAP[self.O4_init_piste],
            O5_MAP[self.O5_score_souches],
            P1_MAP[self.P1_topologie],
            P2_MAP[self.P2_largeur_vague],
            int(self.P3_duree_tours),
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def generate_variants(grid_filter: Dict[str, List[Any]] = None) -> List[VariantSpec]:
    """Génère le produit cartésien complet (jusqu'à 2 916 variantes) ou filtré."""
    default_grid = {
        "O1_eligibilite": list(O1_MAP.keys()),
        "O2_boost": list(O2_MAP.keys()),
        "O3_apprentissage": list(O3_MAP.keys()),
        "O4_init_piste": list(O4_MAP.keys()),
        "O5_score_souches": list(O5_MAP.keys()),
        "P1_topologie": list(P1_MAP.keys()),
        "P2_largeur_vague": list(P2_MAP.keys()),
        "P3_duree_tours": [12, 16, 20],
    }
    if grid_filter:
        for k, v in grid_filter.items():
            if k in default_grid and v:
                default_grid[k] = v

    keys = [
        "O1_eligibilite",
        "O2_boost",
        "O3_apprentissage",
        "O4_init_piste",
        "O5_score_souches",
        "P1_topologie",
        "P2_largeur_vague",
        "P3_duree_tours",
    ]
    combinations = list(itertools.product(*(default_grid[k] for k in keys)))
    variants = []
    for idx, combo in enumerate(combinations, start=1):
        o1, o2, o3, o4, o5, p1, p2, p3 = combo
        short_code = (
            f"V{idx:04d}_"
            f"{o1[:3]}-{o2[:3]}-{o3[:3]}-{o4[:4]}-{o5[:3]}_"
            f"{p1}-{p2[:4]}-T{p3}"
        )
        variants.append(
            VariantSpec(
                variant_id=idx,
                code=short_code,
                O1_eligibilite=o1,
                O2_boost=o2,
                O3_apprentissage=o3,
                O4_init_piste=o4,
                O5_score_souches=o5,
                P1_topologie=p1,
                P2_largeur_vague=p2,
                P3_duree_tours=int(p3),
            )
        )
    return variants
