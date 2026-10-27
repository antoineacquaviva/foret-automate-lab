export const DOCTRINE_D0_UNIFORME = 0;
export const DOCTRINE_D1_ANTI_COUPE = 1;
export const DOCTRINE_D2_ANTI_TERRASSEMENT = 2;
export const DOCTRINE_D3_CHASSEUR_BOOST = 3;
export const DOCTRINE_D4_LECTEUR_PISTE_7 = 4;
export const DOCTRINE_D5_CONTRE_TEMPS = 5;

export interface DoctrineSpec {
  doctrine_id: number;
  code: string;
  name: string;
  description: string;
}

export const ALL_DOCTRINES: DoctrineSpec[] = [
  {
    doctrine_id: DOCTRINE_D0_UNIFORME,
    code: 'D0_Uniforme',
    name: 'Témoin Uniforme (Aveugle)',
    description: 'Répartit son quota Q de parades uniformément sans lire le plateau ni la piste.',
  },
  {
    doctrine_id: DOCTRINE_D1_ANTI_COUPE,
    code: 'D1_Anti_Coupe',
    name: 'Spécialisé Anti-Abatteuse',
    description: 'Concentre ses parades contre les Abatteuses (C1, C2) et délaisse les Terrassiers.',
  },
  {
    doctrine_id: DOCTRINE_D2_ANTI_TERRASSEMENT,
    code: 'D2_Anti_Terrassement',
    name: 'Spécialisé Anti-Terrassier',
    description: 'Laisse couper les arbres mais bloque prioritairement les Terrassiers (T1, T2).',
  },
  {
    doctrine_id: DOCTRINE_D3_CHASSEUR_BOOST,
    code: 'D3_Chasseur_Boost',
    name: 'Garde-Frontière & Chasseur de Boost',
    description: 'Pare en priorité absolue les attaques déclenchant un Boost (100% Vert ou 100% Marron) et le Sanctuaire.',
  },
  {
    doctrine_id: DOCTRINE_D4_LECTEUR_PISTE_7,
    code: 'D4_Lecteur_Piste_7',
    name: 'Lecteur Probabiliste (Cœur 6-7-8)',
    description: 'Pare prioritairement les tactiques situées sur les cases centrales 6, 7 et 8 pour casser le moteur du Méchant.',
  },
  {
    doctrine_id: DOCTRINE_D5_CONTRE_TEMPS,
    code: 'D5_Contre_Temps',
    name: 'Contre-Temps (Plancher bas)',
    description: 'Pare les actions secondaires sans Boost sur les ailes et subit les Boosts de plein fouet.',
  },
];
