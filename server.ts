import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // Route API : Bilan de Campagne interprété par IA (Gemini)
  // Mode 1 (Exploratoire Génétique -> met en avant des Familles d'Automates de Niveau 2 à approfondir en Mode 2)
  // Mode 2 (Test Cartésien d'une Famille YAML Niveau 2 -> décortique les meilleures Instances valorisées de Niveau 3)
  app.post('/api/gemini/campaign-bilan', async (req, res) => {
    try {
      const {
        mode,
        familyId,
        totalEvaluated,
        totalGamesSimulated,
        paretoCount,
        nichesDiscovered,
        weights,
        topInstances,
        synthesizedLevel2Families,
        sensitivitySummary,
        fallbackMarkdown,
      } = req.body || {};

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey.trim() === '') {
        res.json({
          source: 'deterministic_fallback',
          markdown:
            fallbackMarkdown ||
            'Synthèse analytique locale générée (variable GEMINI_API_KEY non détectée sur le serveur).',
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const systemInstruction =
        mode === 'mode1_genetic'
          ? `Tu es un ingénieur senior en Game Design et Théorie des Jeux Empirique spécialisé dans le jeu coopératif asymétrique "Défenseurs de la Forêt" (Forêt Automate Lab v2).
Distinction terminologique STRICTE à respecter impérativement dans ta réponse :
- Une "Famille d'Automates (Niveau 2)" correspond à un fichier de description déclaratif (.yaml) comportant un socle de règles et des options ouvertes ($sweep) destinées à être testées par produit cartésien dans le Mode 2.
- Une "Instance / Variante d'Automate (Niveau 3)" correspond à un automate unique où tous les paramètres et options sont entièrement valorisés (447 entiers int32, aucun $sweep).

Tu analyses les résultats d'une campagne en MODE 1 (Exploration Génétique Hybride NSGA-II + MAP-Elites sur 800 niches écologiques).
Rédige en français un bilan structuré, clair, incisif et directement exploitable par l'auteur du jeu en 3 sections Markdown :
1. **Enseignements Globaux de la Campagne Génétique** : Que nous apprennent le Front de Pareto 4D (M1 Maîtrise, M2 Adaptation, M3 Tension, M4 Simplicité), la résistance aux martingales (sondes B2a/B2b/B2c face à B3/B4) et les niches écologiques découvertes ?
2. **Familles d'Automates Prometteuses (Niveau 2) à Approfondir en Mode 2** : Présente chacune des Familles de Niveau 2 synthétisées à partir des clusters de champions. Explique brièvement et clairement comment fonctionne chaque famille sur le plateau, quelles options $sweep ont été ouvertes autour de son noyau, et quelles sont ses qualités ludiques.
3. **Recommandation de Passage en Mode 2** : Indique par quelle Famille de Niveau 2 commencer le test par produit cartésien intégral en Mode 2 et quels paramètres surveiller.`
          : `Tu es un ingénieur senior en Game Design et Théorie des Jeux Empirique spécialisé dans le jeu coopératif asymétrique "Défenseurs de la Forêt" (Forêt Automate Lab v2).
Distinction terminologique STRICTE à respecter impérativement dans ta réponse :
- Une "Famille d'Automates (Niveau 2)" est le fichier .yaml d'entrée contenant des plages d'options ($sweep).
- Une "Instance / Variante d'Automate (Niveau 3)" est un membre concret issu du produit cartésien, dans lequel toutes les options et tous les paramètres sont entièrement valorisés (aucun $sweep).

Tu analyses les résultats d'une campagne en MODE 2 (Évaluation Haute Précision par Produit Cartésien Intégral de la Famille Niveau 2 "${familyId}").
Rédige en français un bilan structuré, pédagogique et précis en 3 sections Markdown :
1. **Enseignements sur la Famille testée (Niveau 2) & Sensibilité des Options ($sweep)** : Quelles options du fichier YAML ont le plus fort impact positif ou négatif sur les 4 métriques (M1 Maîtrise, M2 Adaptation, M3 Tension, M4 Simplicité) ? Y a-t-il des branches du produit cartésien qui tombent dans une martingale ?
2. **Analyse Détaillée des Meilleures Variantes (Instances de Niveau 3 Valorisées)** : Décortique les 3 meilleures instances de Niveau 3 du classement. Pour chacune, explique concrètement comment elle fonctionne sur le plateau (ses tactiques Abatteuse/Bulldozer, sa piste 2D6, sa règle de casse/élan et son décompte Piste 3) et quels sont ses avantages précis pour les joueurs humains.
3. **Verdict & Choix de l'Instance Niveau 3 de Référence pour Test sur Table** : Recommande l'instance Niveau 3 idéale (ou le meilleur compromis simplicité/profondeur) à imprimer et jouer physiquement.`;

      const userPrompt = JSON.stringify(
        {
          mode,
          familyId,
          totalEvaluated,
          totalGamesSimulated,
          paretoCount,
          nichesDiscovered,
          weights,
          synthesizedLevel2Families,
          sensitivitySummary,
          topInstances,
        },
        null,
        2
      );

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `Voici les données scientifiques complètes de la campagne Monte-Carlo (avec réduction de variance CRN sur 7 Bots Iso-Effort) :\n\n${userPrompt}`,
        config: {
          systemInstruction,
          temperature: 0.35,
        },
      });

      const text = response.text || fallbackMarkdown || 'Aucun texte retourné.';
      res.json({
        source: 'gemini_api',
        model: 'gemini-3.8-flash',
        markdown: text,
      });
    } catch (error: any) {
      console.error('Gemini API Error:', error?.message || error);
      res.status(200).json({
        source: 'deterministic_fallback',
        errorHint: error?.message || 'Erreur lors de l’appel Gemini API',
        markdown: req.body?.fallbackMarkdown || `Erreur Gemini API : ${error?.message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Forêt Automate Lab v2 server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
