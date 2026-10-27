export const O1_MAP: Record<string, number> = { Strict: 0, Souple: 1 };
export const O2_MAP: Record<string, number> = { Sur_Place_x2: 0, Rasage_Complet: 1, Debordement: 2 };
export const O3_MAP: Record<string, number> = { Standard_1: 0, Boost_Turbo_2: 1, Cumulatif_K: 2 };
export const O4_MAP: Record<string, number> = {
  '6C_5T_Centre_Coupe': 0,
  '6C_5T_Alterne': 1,
  '5C_6T_Pression_Terre': 2,
};
export const O5_MAP: Record<string, number> = { Arbres_Seuls: 0, Souches_Demi_Point: 1 };

export const P1_MAP: Record<string, number> = { '6c_15a': 0, '6c_18a': 1, '5c_12a': 2 };
export const P2_MAP: Record<string, number> = {
  Proportionnel_Sup: 0,
  Proportionnel_Large: 1,
  Asymetrique_Front: 2,
};

export const TOPOLOGIES: Record<string, number[]> = {
  '6c_15a': [2, 2, 2, 3, 3, 3],
  '6c_18a': [2, 2, 3, 3, 4, 4],
  '5c_12a': [2, 2, 2, 3, 3, 0],
};

export const TOPOLOGY_LENGTHS: Record<string, number> = {
  '6c_15a': 6,
  '6c_18a': 6,
  '5c_12a': 5,
};

// 0 = C1 (Défrichage), 1 = C2 (Percée), 2 = T1 (Sillage), 3 = T2 (Ratissage Industriel)
export const INITIAL_TRACKS: Record<string, number[]> = {
  '6C_5T_Centre_Coupe': [3, 2, 3, 0, 1, 0, 1, 0, 2, 3, 2],
  '6C_5T_Alterne': [3, 1, 2, 0, 3, 0, 1, 2, 0, 3, 1],
  '5C_6T_Pression_Terre': [0, 3, 1, 2, 3, 0, 2, 3, 1, 2, 0],
};

export interface VariantSpec {
  variant_id: number;
  code: string;
  O1_eligibilite: string;
  O2_boost: string;
  O3_apprentissage: string;
  O4_init_piste: string;
  O5_score_souches: string;
  P1_topologie: string;
  P2_largeur_vague: string;
  P3_duree_tours: number;
}

export interface GridFilter {
  O1_eligibilite?: string[];
  O2_boost?: string[];
  O3_apprentissage?: string[];
  O4_init_piste?: string[];
  O5_score_souches?: string[];
  P1_topologie?: string[];
  P2_largeur_vague?: string[];
  P3_duree_tours?: number[];
}

export function variantToIntTuple(v: VariantSpec): [number, number, number, number, number, number, number, number] {
  return [
    O1_MAP[v.O1_eligibilite],
    O2_MAP[v.O2_boost],
    O3_MAP[v.O3_apprentissage],
    O4_MAP[v.O4_init_piste],
    O5_MAP[v.O5_score_souches],
    P1_MAP[v.P1_topologie],
    P2_MAP[v.P2_largeur_vague],
    v.P3_duree_tours,
  ];
}

export function generateVariants(gridFilter?: GridFilter): VariantSpec[] {
  const o1List = gridFilter?.O1_eligibilite?.length ? gridFilter.O1_eligibilite : Object.keys(O1_MAP);
  const o2List = gridFilter?.O2_boost?.length ? gridFilter.O2_boost : Object.keys(O2_MAP);
  const o3List = gridFilter?.O3_apprentissage?.length ? gridFilter.O3_apprentissage : Object.keys(O3_MAP);
  const o4List = gridFilter?.O4_init_piste?.length ? gridFilter.O4_init_piste : Object.keys(O4_MAP);
  const o5List = gridFilter?.O5_score_souches?.length ? gridFilter.O5_score_souches : Object.keys(O5_MAP);
  const p1List = gridFilter?.P1_topologie?.length ? gridFilter.P1_topologie : Object.keys(P1_MAP);
  const p2List = gridFilter?.P2_largeur_vague?.length ? gridFilter.P2_largeur_vague : Object.keys(P2_MAP);
  const p3List = gridFilter?.P3_duree_tours?.length ? gridFilter.P3_duree_tours : [12, 16, 20];

  const variants: VariantSpec[] = [];
  let idx = 1;

  for (const o1 of o1List) {
    for (const o2 of o2List) {
      for (const o3 of o3List) {
        for (const o4 of o4List) {
          for (const o5 of o5List) {
            for (const p1 of p1List) {
              for (const p2 of p2List) {
                for (const p3 of p3List) {
                  const code = `V${String(idx).padStart(4, '0')}_${o1.slice(0, 3)}-${o2.slice(0, 3)}-${o3.slice(0, 3)}-${o4.slice(0, 4)}-${o5.slice(0, 3)}_${p1}-${p2.slice(0, 4)}-T${p3}`;
                  variants.push({
                    variant_id: idx,
                    code,
                    O1_eligibilite: o1,
                    O2_boost: o2,
                    O3_apprentissage: o3,
                    O4_init_piste: o4,
                    O5_score_souches: o5,
                    P1_topologie: p1,
                    P2_largeur_vague: p2,
                    P3_duree_tours: Number(p3),
                  });
                  idx++;
                }
              }
            }
          }
        }
      }
    }
  }
  return variants;
}
