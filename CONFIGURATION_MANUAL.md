# Manuel de Configuration - Sirine Assistant

Ce guide explique comment configurer et personnaliser l'assistant virtuel Sirine (T.T.A Distribution).

## 1. Accès au Panneau de Configuration

Pour ouvrir le panneau de contrôle de l'avatar (T.T.A Control Tower) :
*   **Via l'interface** : Cliquez sur le bouton rond (téléphone ou croix) en bas de l'écran.
*   **Raccourci Clavier** : Appuyez simultanément sur `Ctrl` + `Shift` + `K` (ou cliquez sur le bouton "Config" s'il est visible).

---

## 2. Identité & Voix (Natif)

Dans l'onglet **Système** (icône engrenages) :
*   **Voix** : Sélectionnez "Zephyr" pour la voix officielle de Sirine (Féminine, calme).
*   **Tester** : Utilisez le bouton "Tester la voix" pour vérifier le rendu audio actuel.

---

## 3. Mode Secours (ElevenLabs)

Si la voix par défaut ne fonctionne pas ou si vous souhaitez une qualité studio supérieure :

1.  Ouvrez le panneau de config et allez tout en bas, section **Audio Engine Fallback**.
2.  Entrez votre **ElevenLabs API Key** (commence par `xi...`).
3.  Entrez le **Voice ID** de la voix souhaitée (ex: ID d'une voix clonée ou premium).
4.  Cliquez sur le bouton **"Native Gemini"** pour le basculer en <span style="color:purple">**"ElevenLabs Active"**</span>.

> **Note** : Dans ce mode, l'avatar écoute, réfléchit (Texte), puis parle (ElevenLabs). C'est plus robuste mais légèrement plus lent que le mode Live natif.

---

## 4. Configuration Avancée (Code)

Certains réglages techniques se font directement dans le fichier `types.ts` à la racine du projet :

### Changer les Modèles IA
Si Google met à jour ses modèles, modifiez ces lignes :
```typescript
// Pour la conversation vocale native
export const LIVE_API_MODEL_ID = 'gemini-2.5-flash-native-audio-preview-12-2025';

// Pour la génération d'images (Marketing Studio)
export const IMAGE_GEN_MODEL_ID = 'gemini-2.5-flash-image';

// Pour l'intelligence en mode secours (ElevenLabs)
export const FALLBACK_LLM_MODEL_ID = 'gemini-2.0-flash-lite-preview-02-05';
```

---

## 5. Installation App (PWA)

L'application est une **PWA (Progressive Web App)**.
1.  Ouvrez le site dans Chrome ou Edge.
2.  Cliquez sur l'icône d'installation dans la barre d'adresse (souvent à droite).
3.  L'application s'installera sous le nom **"Sirine Assistant T.T.A"** et sera accessible comme une application native.

---

## 6. Réinitialisation

En cas de problème majeur (bug d'affichage, voix bloquée) :
1.  Ouvrez le panneau de config.
2.  Allez dans l'onglet **Système**.
3.  Cliquez sur le bouton rouge **"WIPE CONTROL TOWER DATA"**.
4.  Confirmez et rechargez la page (`F5`).
