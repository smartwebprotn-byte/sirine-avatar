
import { GoogleGenAI, Modality, LiveServerMessage, FunctionDeclaration, Type } from '@google/genai';
import { useStore } from '../store';
import { encodeAudio, decodeAudio, decodeAudioData } from './audio-processor';
import { GroundingChunk, LIVE_API_MODEL_ID, IMAGE_GEN_MODEL_ID, FALLBACK_LLM_MODEL_ID } from '../types';
import { streamAudioFromElevenLabs } from './elevenlabs';

let sessionPromise: Promise<any> | null = null;
let inputAudioContext: AudioContext | null = null;
let outputAudioContext: AudioContext | null = null;
let audioWorkletNode: AudioWorkletNode | null = null;
let outputAnalyser: AnalyserNode | null = null;
let inputAnalyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let nextStartTime = 0;
const sources = new Set<AudioBufferSourceNode>();
let recognition: any = null; // For fallback STT
let bargeInCheckInterval: number | null = null;
let isInterrupting = false;



const generateMarketingPosterDeclaration: FunctionDeclaration = {
  name: 'generateMarketingPoster',
  parameters: {
    type: Type.OBJECT,
    description: 'Génère un visuel publicitaire haute qualité pour une machine.',
    properties: { prompt: { type: Type.STRING, description: 'Le sujet du poster marketing.' } },
    required: ['prompt'],
  },
};

const sendSalesLeadReportDeclaration: FunctionDeclaration = {
  name: 'sendSalesLeadReport',
  parameters: {
    type: Type.OBJECT,
    description: 'Enregistre un nouveau prospect (lead) dans le registre commercial.',
    properties: {
      customerName: { type: Type.STRING },
      customerPhone: { type: Type.STRING, description: 'Le numéro de téléphone du client.' },
      interestedProducts: { type: Type.STRING },
      summary: { type: Type.STRING },
      urgency: { type: Type.STRING, enum: ['normal', 'urgent'] }
    },
    required: ['customerName', 'interestedProducts', 'summary'],
  },
};

const manageTodoListDeclaration: FunctionDeclaration = {
  name: 'manageTodoList',
  parameters: {
    type: Type.OBJECT,
    description: 'Ajoute ou modifie des tâches dans la liste administrative.',
    properties: {
      action: { type: Type.STRING, enum: ['add', 'list', 'complete', 'delete'] },
      taskText: { type: Type.STRING },
      taskId: { type: Type.STRING }
    },
    required: ['action'],
  },
};

async function executeImageGen(prompt: string) {
  const store = useStore.getState();
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  store.setMode('THINKING');
  store.incrementRequest();
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_GEN_MODEL_ID,
      contents: { parts: [{ text: `Professional commercial photography of ${prompt} for T.T.A Distribution Tunis, high-end Italian style, 4k resolution.` }] },
    });
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        store.addGeneratedImage({ url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, prompt });
        store.addLog({ type: 'ai', message: `Studio : Poster généré avec succès pour "${prompt}"` });
        return true;
      }
    }
  } catch (err) {
    console.error("Image Gen Error:", err);
    store.addLog({ type: 'error', message: "Échec de génération d'image marketing via AI." });
  }
  return false;
}

function calculateVolume(data: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.min(Math.sqrt(sum / data.length) * 10, 1);
}

function handleInterruption() {
  if (isInterrupting) return; // Prevent multiple interruptions
  isInterrupting = true;

  const store = useStore.getState();

  // Stop all playing sources immediately with fade-out
  sources.forEach(source => {
    try {
      const gainNode = outputAudioContext?.createGain();
      if (gainNode && outputAudioContext) {
        gainNode.gain.setValueAtTime(1, outputAudioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, outputAudioContext.currentTime + 0.05);
      }
      source.stop(0);
    } catch (e) { }
  });
  sources.clear();

  // Reset scheduling
  nextStartTime = outputAudioContext?.currentTime || 0;

  // Signal interruption to server
  sessionPromise?.then(session => {
    try {
      session.sendRealtimeInput({ interrupt: true });
    } catch (e) { }
  });

  store.setMode('IDLE');
  store.addLog({ type: 'info', message: '🔇 Interruption détectée' });

  setTimeout(() => { isInterrupting = false; }, 500);
}

function enableBargeIn() {
  if (bargeInCheckInterval) return;

  bargeInCheckInterval = window.setInterval(() => {
    const store = useStore.getState();
    if (!inputAnalyser || !store.isLive) {
      if (bargeInCheckInterval) {
        clearInterval(bargeInCheckInterval);
        bargeInCheckInterval = null;
      }
      return;
    }

    // Only check for interruption when AI is talking
    if (store.currentMode === 'TALKING') {
      const dataArray = new Float32Array(inputAnalyser.frequencyBinCount);
      inputAnalyser.getFloatTimeDomainData(dataArray);
      const volume = calculateVolume(dataArray);

      // Threshold for interruption (adjust based on testing)
      if (volume > 0.15) {
        handleInterruption();
      }
    }
  }, 100); // Check every 100ms
}

function disableBargeIn() {
  if (bargeInCheckInterval) {
    clearInterval(bargeInCheckInterval);
    bargeInCheckInterval = null;
  }
}

function trackVolume() {
  const update = () => {
    const state = useStore.getState();
    const analyser = state.currentMode === 'TALKING' ? outputAnalyser : inputAnalyser;
    if (analyser) {
      const dataArray = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(dataArray);
      useStore.getState().setAudioLevel(calculateVolume(dataArray));
    }
    if (useStore.getState().isLive) requestAnimationFrame(update);
  };
  update();
}

export async function startVoiceSession() {
  const store = useStore.getState();
  if (store.isLive || store.isConnecting) return;
  if (store.config.isMaintenanceMode) {
    store.addLog({ type: 'info', message: 'Système bloqué : Mode Maintenance Manager actif.' });
    return;
  }

  // Check if we need to update language (without full restart)
  const currentLanguage = navigator.language;
  const activeSession = store.activeSessions.find(s => s.isConnected);
  if (activeSession && activeSession.userLanguage !== currentLanguage) {
    store.addLog({ type: 'info', message: `Changement de langue détecté (${activeSession.userLanguage} → ${currentLanguage})` });
    // Language will be updated in session config, no restart needed
  }

  store.setLiveState(false, true);
  store.incrementSession();

  // Start tracking the session
  const sessionId = store.startSession({
    currentMode: 'IDLE',
    transcription: { user: '', ai: '' },
    audioLevel: 0,
    isConnected: true,
    duration: 0,
    requestsCount: 0
  });

  // --- FALLBACK ELEVENLABS MODE ---
  if (store.config.useElevenLabsFallback && store.config.elevenLabsApiKey && store.config.elevenLabsVoiceId) {
    store.addLog({ type: 'info', message: 'Mode Hybride ElevenLabs activé.' });

    // Setup simple audio context for output
    outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    outputAnalyser = outputAudioContext.createAnalyser();
    outputAnalyser.connect(outputAudioContext.destination);
    store.setAudioAnalyser(outputAnalyser);
    trackVolume();

    // Use Web Speech API for input in fallback mode -> Gemini Flash -> ElevenLabs
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = currentLanguage;

      recognition.onresult = async (event: any) => {
        const text = event.results[event.results.length - 1][0].transcript;
        if (!text.trim()) return;

        store.setTranscription('user', text);
        store.setMode('THINKING');

        try {
          // 1. Get Text Response from Gemini Flash
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: FALLBACK_LLM_MODEL_ID,
            config: { systemInstruction: store.systemInstruction },
            contents: [{ role: 'user', parts: [{ text: text }] }]
          });
          const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text || "Désolée, je n'ai pas compris.";

          store.setTranscription('ai', responseText);

          // 2. TTS via ElevenLabs
          store.setMode('TALKING');
          await streamAudioFromElevenLabs(
            responseText,
            store.config.elevenLabsApiKey,
            store.config.elevenLabsVoiceId,
            outputAudioContext!,
            outputAnalyser
          );
          store.setMode('IDLE');

        } catch (err) {
          console.error("Fallback Error:", err);
          store.addLog({ type: 'error', message: "Erreur en mode hybride." });
          store.setMode('IDLE');
        }
      };

      recognition.start();
      store.setLiveState(true, false);
      store.setMode('IDLE');
      return; // Exit normal flow
    } else {
      store.addLog({ type: 'error', message: "Navigateur incompatible avec le mode hybride (manque WebSpeechAPI)." });
    }
  }
  // ---------------------------------

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    outputAnalyser = outputAudioContext.createAnalyser();
    outputAnalyser.fftSize = 256;
    outputAnalyser.connect(outputAudioContext.destination);

    inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    inputAnalyser = inputAudioContext.createAnalyser();

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (micError: any) {
      if (micError.name === 'NotAllowedError') {
        store.addLog({ type: 'error', message: "Microphone refusé. Si intégré via iframe, vérifiez l'attribut allow='microphone'." });
        console.error("Microphone denied. Ensure <iframe allow='microphone; ...'> is used in parent site.");
      }
      throw micError;
    }

    // Apply initial mute state
    if (store.isMicMuted) {
      stream.getAudioTracks().forEach(t => t.enabled = false);
    }

    const micSource = inputAudioContext.createMediaStreamSource(stream);
    micSource.connect(inputAnalyser);
    store.setAudioAnalyser(inputAnalyser);
    trackVolume();
    enableBargeIn(); // Enable interruption detection

    sessionPromise = ai.live.connect({
      model: LIVE_API_MODEL_ID,
      callbacks: {
        onopen: async () => {
          store.setLiveState(true, false);
          store.setMode('IDLE');
          if (!inputAudioContext || !stream) return;
          try {
            // Try multiple possible paths for the worklet module
            const workletPaths = [
              '/worklets/audio-processor.js',
              './worklets/audio-processor.js',
              'worklets/audio-processor.js'
            ];

            let workletLoaded = false;
            for (const workletPath of workletPaths) {
              try {
                await inputAudioContext.audioWorklet.addModule(workletPath);
                workletLoaded = true;
                console.log(`Successfully loaded worklet from: ${workletPath}`);
                break;
              } catch (err) {
                console.warn(`Failed to load worklet from ${workletPath}:`, err);
              }
            }

            if (!workletLoaded) {
              throw new Error('Unable to load audio worklet module from any path');
            }

            audioWorkletNode = new AudioWorkletNode(inputAudioContext, 'audio-processor');
            audioWorkletNode.port.onmessage = (e) => {
              if (e.data.audioData) {
                sessionPromise?.then(session => session.sendRealtimeInput({
                  media: { data: encodeAudio(e.data.audioData), mimeType: 'audio/pcm;rate=16000' }
                }));
              }
            };
            // Connect microphone directly to AudioWorkletNode for processing
            micSource.connect(audioWorkletNode);
            // Keep analyser connection for volume visualization (parallel, not in series)
            // audioWorkletNode should NOT connect to destination to avoid echo
            store.addLog({ type: 'info', message: 'Canal Live API Sirine ouvert.' });
          } catch (error) {
            console.error('Failed to create AudioWorkletNode:', error);
            store.addLog({ type: 'error', message: "Échec de l'initialisation du processeur audio." });
          }
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.modelTurn) store.incrementRequest();

          if (message.toolCall) {
            store.setMode('THINKING');
            for (const fc of message.toolCall.functionCalls) {
              let result = "OK.";

              if (fc.name === 'generateMarketingPoster') {
                const success = await executeImageGen((fc.args as any).prompt);
                result = success ? "Poster marketing généré dans le studio." : "Echec technique de la génération.";
              }
              else if (fc.name === 'sendSalesLeadReport') {
                const args = fc.args as any;
                store.addLead({
                  customerName: args.customerName,
                  customerPhone: args.customerPhone,
                  interestedProducts: args.interestedProducts,
                  summary: args.summary,
                  priority: args.urgency || 'normal'
                });
                store.triggerReportToast();
                store.addLog({ type: 'ai', message: `Outil Ventes : Lead capturé (${args.customerName})` });
              }
              else if (fc.name === 'manageTodoList') {
                const { action, taskText, taskId } = fc.args as any;
                if (action === 'add') {
                  store.addTodo(taskText, 'medium');
                  result = "Action ajoutée à la liste du manager.";
                } else if (action === 'list') {
                  result = `Vous avez ${store.todos.filter(t => !t.completed).length} tâches en attente.`;
                } else if (action === 'complete') {
                  const t = store.todos.find(td => td.text.includes(taskText) || td.id === taskId);
                  if (t) store.toggleTodo(t.id);
                  result = "Tâche mise à jour.";
                }
                store.addLog({ type: 'info', message: `Outil Tâche : Modification du registre des actions.` });
              }

              sessionPromise?.then(session => session.sendToolResponse({
                functionResponses: { id: fc.id, name: fc.name, response: { result: result } }
              }));
              store.setMode('IDLE');
            }
          }

          if (message.serverContent?.groundingMetadata?.groundingChunks) {
            store.setGroundingChunks(message.serverContent.groundingMetadata.groundingChunks as GroundingChunk[]);
          }

          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          const hasTranscription = message.serverContent?.outputTranscription;

          if (audioData && outputAudioContext && outputAnalyser) {
            store.setMode('TALKING');

            // Optimize for low latency: start immediately if first chunk
            if (sources.size === 0) {
              nextStartTime = outputAudioContext.currentTime + 0.05; // 50ms buffer
            } else {
              nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
            }

            const buffer = await decodeAudioData(decodeAudio(audioData), outputAudioContext, 24000, 1);
            const source = outputAudioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(outputAnalyser);
            source.addEventListener('ended', () => {
              sources.delete(source);
              if (sources.size === 0) {
                store.setMode('IDLE');
                isInterrupting = false; // Reset interruption flag
              }
            });
            source.start(nextStartTime);
            nextStartTime += buffer.duration;
            sources.add(source);
          } else if (hasTranscription && !audioData) {
            // Fallback: Switch to talking mode briefly when there's text but no audio
            store.setMode('TALKING');
            // Simulate speaking duration based on text length (rough estimate)
            const estimatedDuration = Math.max(2, hasTranscription.text.length * 0.05); // ~50ms per character, min 2s
            setTimeout(() => {
              if (sources.size === 0) store.setMode('IDLE');
            }, estimatedDuration * 1000);
            store.addLog({ type: 'info', message: `Réponse textuelle: ${hasTranscription.text}` });
          }

          const interrupted = message.serverContent?.interrupted;
          if (interrupted) {
            handleInterruption();
          }

          if (message.serverContent?.inputTranscription) store.setTranscription('user', message.serverContent.inputTranscription.text);
          if (message.serverContent?.outputTranscription) store.setTranscription('ai', message.serverContent.outputTranscription.text);
        },
        onerror: (e: any) => {
          console.error("Live Session Error:", e);
          const msg = e?.message || "";
          if (msg.includes("implemented") || msg.includes("supported") || msg.includes("enabled") || msg.includes("404")) {
            store.addLog({ type: 'error', message: `Modèle AI introuvable ou obsolète (${LIVE_API_MODEL_ID}). Vérifiez types.ts.` });
          } else {
            store.addLog({ type: 'error', message: "Erreur critique de la session Live API." });
          }
          stopVoiceSession();
        },
        onclose: () => {
          store.addLog({ type: 'info', message: "Session terminée." });
          stopVoiceSession();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: store.config.selectedVoice } }
          // Note: VAD settings are managed server-side by Gemini.
        },
        systemInstruction: store.systemInstruction,
        tools: [
          { functionDeclarations: [sendSalesLeadReportDeclaration, manageTodoListDeclaration, generateMarketingPosterDeclaration] }
        ]
      },
    });
  } catch (err) {
    console.error("Critical Start Error:", err);
    store.setLiveState(false, false);
  }
}

export function stopVoiceSession() {
  const store = useStore.getState();

  // Disable barge-in detection
  disableBargeIn();

  if (audioWorkletNode) {
    try { audioWorkletNode.disconnect(); } catch (e) { }
    audioWorkletNode = null;
  }
  if (stream) {
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) { }
    stream = null;
  }
  if (outputAnalyser) {
    try { outputAnalyser.disconnect(); } catch (e) { }
    outputAnalyser = null;
  }
  if (inputAnalyser) {
    try { inputAnalyser.disconnect(); } catch (e) { }
    inputAnalyser = null;
  }

  if (inputAudioContext && inputAudioContext.state !== 'closed') {
    inputAudioContext.close().catch(() => { });
  }
  inputAudioContext = null;

  if (outputAudioContext && outputAudioContext.state !== 'closed') {
    outputAudioContext.close().catch(() => { });
  }
  outputAudioContext = null;

  sources.forEach(s => { try { s.stop(); } catch (e) { } });
  sources.clear();

  if (sessionPromise) {
    sessionPromise.then(session => {
      try { session.close(); } catch (e) { }
    }).catch(() => { });
    sessionPromise = null;
  }

  if (recognition) {
    try { recognition.stop(); } catch (e) { }
    recognition = null;
  }

  // Reset interruption state
  isInterrupting = false;

  store.setLiveState(false, false);
  store.setMode('IDLE');
  store.setAudioLevel(0);
}

export function setInputMute(muted: boolean) {
  const store = useStore.getState();
  store.setMicMuted(muted);
  if (stream) {
    stream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }
}
