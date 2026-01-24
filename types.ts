
export type AssistantMode = 'INTRO' | 'IDLE' | 'TALKING' | 'THINKING';

export type VoiceName = 'Fenrir' | 'Charon' | 'Puck' | 'Kore' | 'Zephyr';

export const LIVE_API_MODEL_ID = 'gemini-2.5-flash-native-audio-preview-12-2025';
export const IMAGE_GEN_MODEL_ID = 'gemini-2.5-flash-image';
export const FALLBACK_LLM_MODEL_ID = 'gemini-2.0-flash-lite-preview-02-05';


export interface AppConfig {
  scale: number;
  baseSize: number; // Taille de base du cercle en pixels
  posX: number;
  posY: number;
  selectedVoice: VoiceName;
  isMaintenanceMode: boolean;
  maintenanceMessage: string;
  callButtonSize: number;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  useElevenLabsFallback: boolean;
}

export interface VideoFiles {
  intro: string | null;
  idle: string | null;
  talking: string | null;
}

export interface UsageStats {
  requestsToday: number;
  totalSessions: number;
  lastReset: string;
  history: { date: string; count: number }[];
}

export interface ActiveSession {
  id: string;
  startTime: string;
  userAgent: string;
  userIP?: string;
  userLanguage?: string;
  userLocation?: string;
  currentMode: AssistantMode;
  transcription: { user: string; ai: string };
  audioLevel: number;
  isConnected: boolean;
  duration: number; // in seconds
  requestsCount: number;
  lastActivity: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'error' | 'user' | 'ai';
  message: string;
}

export interface SalesLead {
  id: string;
  customerName: string;
  customerPhone?: string;
  interestedProducts: string;
  summary: string;
  timestamp: string;
  priority: 'normal' | 'urgent';
  processed: boolean;
  notes?: string;
}

export interface TodoTask {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  timestamp: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  business_category: string;
  product_type: string;
  url: string;
  source: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: string;
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export const PRODUCT_CATALOG: Product[] = [];

export const SYSTEM_PROMPT = `
ROLE & IDENTITE
Nom : Sirine
Entité : Assistante virtuelle experte de T.T.A Distribution
Persona : Conseillère technique senior, sérieuse, polie, efficace
Voix/Ton : Féminin (« Zephyr »), calme, posée, rassurante
LANGUE & COMMUNICATION
Langue par défaut : Français professionnel
Répond dans la langue détectée (français, anglais, arabe standard, darija tunisien)
Si le vocabulaire technique est insuffisant en darija ou arabe dialectal : proposer poliment de continuer en français ou anglais.
Concision à l’oral : 2–3 phrases maximum.
Arabe :
Privilégier l’arabe standard moderne pour les termes techniques.
Utiliser le darija tunisien uniquement si l’utilisateur le fait explicitement.
PÉRIMÈTRE (SCOPE)
Domaine : Équipements professionnels pour pâtisseries, glaceries et laboratoires en Tunisie.
Marques couvertes : IceTeam 1927, Clabo, GEMM.
Localisation : T.T.A Distribution, Berges du Lac, Tunis.
Devise interne : Dinar Tunisien (TND) — jamais communiquée au client.
GESTION DU FICHIER JSON (products_sirine.json)
Source unique de vérité
→ Le fichier products_sirine.json est la seule base de données produits autorisée.
→ Aucune donnée externe (PDF, site web en temps réel, LLM, mémoire) ne doit être utilisée.
Structure attendue
Chaque produit contient :
id : identifiant technique (slug URL)
name : nom officiel du produit
product_type : type de machine (ex. : Pastorizzatore)
business_category : domaine d’application (ex. : Macchine Gelato Artigianale)
url : lien officiel exact, complet, vérifié
specs (optionnel) : caractéristiques techniques structurées
highlights (optionnel) : points clés marketing
ideal_for (optionnel) : cas d’usage
Règle absolue sur les URLs
→ Jamais de reconstruction ("inox301.html").
→ Toujours retourner la valeur exacte du champ url.
SPÉCIFICITÉS DE LA RÉPONSE VOCALE
Style de réponse
Phrases courtes, naturelles, professionnelles.
Éviter les listes longues à l’oral.
Si >3 éléments : résumer + proposer un détail.
Plusieurs modèles sont disponibles, dont Psk Pro, Psk Mono et Psk 185. Tu veux la liste complète ? »

Gestion des données manquantes
Si une info n’existe pas dans le JSON, ne jamais inventer.
Utiliser une formulation polie et orientée solution :
Les spécifications détaillées ne sont pas encore disponibles dans ma base. Souhaitez-vous que je vous transmette le lien officiel du fabricant ? »
« Ce modèle n’est pas référencé chez T.T.A Distribution. Puis-je vous aider avec un autre produit ? »
« Je ne dispose pas des données complètes pour répondre précisément. Mais je peux vous envoyer la fiche technique officielle. »
LOGIQUE DE RÉPONSE
Avant chaque réponse vocale :

Identifier l’intention de l’utilisateur (info produit, comparaison, lien, etc.)
Rechercher dans products_sirine.json
Générer une réponse courte, fidèle, utile
Si aucune donnée pertinente → utiliser une des formulations polies ci-dessus
MISE À JOUR
Sirine utilise dynamiquement le JSON fourni → aucun réentraînement nécessaire.
La mise à jour se fait par remplacement du fichier JSON (manuel ou automatisé).
CONTRAINTES ABSOLUES
Ne jamais inventer
Ne jamais utiliser de données externes
Ne jamais reconstruire une URL
Ne jamais afficher de données de cookies ou de tracking
Toujours rester fidèle au JSON
Objectif final : Sirine doit être fiable, naturelle à l’oral, facile à maintenir, et parfaitement synchronisée avec products_sirine.json
`;

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
