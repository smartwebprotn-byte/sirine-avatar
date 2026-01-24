import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { VideoFiles } from '../types';
import { Mic, Phone, Loader2, Settings, Video, BrainCircuit, PhoneOff, Play, MicOff } from 'lucide-react';
import { startVoiceSession, stopVoiceSession, setInputMute } from '../services/voice-session';

export const VideoAvatar: React.FC = () => {
  const {
    currentMode, setMode, videoUrls, config, updateConfig,
    audioLevel, isLive, isConnecting, audioAnalyser, toggleConfig, hasPermissions, isTransparent, isMicMuted
  } = useStore();

  // const [talkingIndex, setTalkingIndex] = useState(0);
  const [smoothAudioLevel, setSmoothAudioLevel] = useState(0);
  const [showPlayOverlay, setShowPlayOverlay] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothLevelRef = useRef(0);
  const isTalking = currentMode === 'TALKING';
  const isThinking = currentMode === 'THINKING';
  const isIntro = currentMode === 'INTRO';

  const videoRefs = {
    INTRO: useRef<HTMLVideoElement>(null),
    IDLE: useRef<HTMLVideoElement>(null),
    TALKING: useRef<HTMLVideoElement>(null),
  };

  const handleAction = () => {
    // Proactively try to play the idle/intro video to catch user gesture
    if (!isLive && !isConnecting && !isIntro) {
      if (videoRefs.IDLE.current) videoRefs.IDLE.current.play().catch(() => { });
      if (videoRefs.INTRO.current) videoRefs.INTRO.current.play().catch(() => { });
    }

    if (isLive || isConnecting || isIntro) {
      stopVoiceSession();
      setMode('IDLE');
    } else {
      setMode('IDLE');
      startVoiceSession();
    }
  };

  const attemptPlay = async (videoEl: HTMLVideoElement) => {
    try {
      if (videoEl.paused) {
        await videoEl.play();
      }
      setShowPlayOverlay(false);
    } catch (err) {
      console.warn("Autoplay blocked or playback failed:", err);
      // Only show overlay if the currentMode corresponds to this video ref
      // to avoid showing it for background pre-loading videos
      setShowPlayOverlay(true);
    }
  };

  useEffect(() => {
    let animationId: number;
    const updateSmoothLevel = () => {
      // Linear interpolation for smoother transitions (Lerp)
      const target = audioLevel;
      const lerpFactor = 0.15; // Lower = smoother, higher = more responsive
      smoothLevelRef.current += (target - smoothLevelRef.current) * lerpFactor;
      setSmoothAudioLevel(smoothLevelRef.current);
      animationId = requestAnimationFrame(updateSmoothLevel);
    };
    updateSmoothLevel();
    return () => cancelAnimationFrame(animationId);
  }, [audioLevel]);


  useEffect(() => {
    let modeKey: keyof typeof videoRefs = currentMode === 'INTRO' ? 'INTRO' : 'IDLE';
    if (currentMode === 'TALKING') {
      modeKey = 'TALKING';
    }

    // Optimization: Pre-warm TALKING video when THINKING or Connecting
    // This ensures it's playing (silently) and ready to show instantly
    if ((isThinking || isConnecting) && videoRefs.TALKING.current) {
      if (videoRefs.TALKING.current.paused) {
        videoRefs.TALKING.current.play().catch(() => { });
      }
    }

    const activeRef = videoRefs[modeKey];

    // Manage play/pause states
    Object.entries(videoRefs).forEach(([k, r]) => {
      // Don't pause TALKING video if we are Thinking (keep it warm)
      if (k === 'TALKING' && (isThinking || isConnecting)) return;

      if (k !== modeKey && r.current) {
        r.current.pause();
        // Reset time for intro/idle so they start fresh? No, keep them as is.
      }
    });

    if (activeRef.current) {
      attemptPlay(activeRef.current);
    }
  }, [currentMode, isThinking, isConnecting]); // Added dependencies

  useEffect(() => {
    // Advanced Lip-Sync & Playback Speed Modulation
    if (videoRefs.TALKING.current) {
      const video = videoRefs.TALKING.current;

      if (currentMode === 'TALKING') {
        // Emergency Fix: Ensure video NEVER stops playing
        if (video.paused) video.play().catch(() => { });

        // Optimized for new high-quality video loop
        // Base speed 0.8x (relaxed) to 2.2x (expressive)
        // This creates contrast between quiet and loud parts without freezing
        const baseSpeed = 0.8;
        const dynamicSpeed = baseSpeed + (smoothAudioLevel * 2.5);
        video.playbackRate = Math.min(2.5, dynamicSpeed);
      } else if (isThinking || isConnecting) {
        // Keep it moving slightly or standard speed when pre-warming?
        // Actually for pre-warming, standard speed is fine, it's invisible.
        // But let's keeping it slow to save resources?
        video.playbackRate = 1.0;
      }
    }
  }, [smoothAudioLevel, currentMode, isThinking, isConnecting]);

  const renderLayer = (key: 'INTRO' | 'IDLE' | 'TALKING', ref: React.RefObject<HTMLVideoElement | null>, isActive: boolean) => {
    const url = videoUrls[key.toLowerCase() as keyof VideoFiles];
    const isActuallyTalking = key === 'TALKING';

    // Optimization: Instant transition for Talking (75ms), smoother for others (300ms)
    // This makes the onset of speech feel "snappy" while going back to idle feels "relaxed"
    const transitionDuration = isActuallyTalking && isActive ? 'duration-75' : 'duration-300';

    return (
      <div className={`absolute inset-0 transition-opacity ${transitionDuration} ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
        {!url ? (
          <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center text-white p-6 text-center">
            <Video className="w-10 h-10 opacity-20 mb-2" />
            <span className="text-[8px] font-black uppercase tracking-widest">{key} Manquant</span>
          </div>
        ) : (
          <video
            ref={ref}
            key={url}
            src={url}
            className="w-full h-full object-cover"
            style={{
              filter: isActuallyTalking ? `brightness(${1 + smoothAudioLevel * 0.3}) contrast(${1 + smoothAudioLevel * 0.1})` : 'none',
              transform: 'scale(1.05) translateZ(0)',
              clipPath: 'circle(50% at 50% 50%)',
              WebkitClipPath: 'circle(50% at 50% 50%)'
            }}
            poster="/poster.png"
            muted={key !== 'INTRO'} // Intro might have sound, others muted (audio comes from API)
            loop={key === 'IDLE' || key === 'TALKING'}
            playsInline
            preload="auto"
            onEnded={() => {
              if (key === 'INTRO') {
                startVoiceSession();
              }
            }}
          />
        )}
      </div>
    );
  };

  const getButtonStyles = () => {
    if (isConnecting) return 'bg-blue-600 shadow-[0_0_30px_rgba(37,99,235,0.4)]';
    if (isThinking) return 'bg-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.4)]';
    if (isLive || isIntro) return 'bg-red-600 hover:bg-red-500 shadow-[0_0_40px_rgba(220,38,38,0.5)]';
    return 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.4)]';
  };

  const renderIcon = () => {
    const iconSize = Math.max(24, config.callButtonSize * 0.375);
    if (isConnecting) return <Loader2 style={{ width: `${iconSize}px`, height: `${iconSize}px` }} className="animate-spin text-white" />;
    if (isThinking) return <BrainCircuit style={{ width: `${iconSize}px`, height: `${iconSize}px` }} className="text-white animate-pulse" />;
    if (isLive || isIntro) return <PhoneOff style={{ width: `${iconSize * 0.833}px`, height: `${iconSize * 0.833}px` }} className="text-white" />;
    return <Phone style={{ width: `${iconSize}px`, height: `${iconSize}px` }} className="text-white" />;
  };

  const finalSize = config.baseSize * config.scale;

  // Handle manual interaction to start playback if blocked
  const handleManualPlay = () => {
    let modeKey: keyof typeof videoRefs = currentMode === 'INTRO' ? 'INTRO' : 'IDLE';
    if (currentMode === 'TALKING') modeKey = 'TALKING';

    const activeRef = videoRefs[modeKey];
    if (activeRef.current) {
      activeRef.current.play().then(() => setShowPlayOverlay(false)).catch(err => console.error("Manual play failed:", err));
    }
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      onDragEnd={(event, info) => updateConfig({ posX: config.posX + info.offset.x, posY: config.posY + info.offset.y })}
      style={{ x: config.posX, y: config.posY }}
      className="relative z-[9999] pointer-events-auto cursor-grab active:cursor-grabbing flex items-center justify-center max-w-full"
    >
      <div className="absolute inset-0 pointer-events-none z-0">
        <canvas ref={canvasRef} width={800} height={800} className="w-full h-full" />
      </div>

      <motion.div
        animate={{
          scale: (1.2 + smoothAudioLevel) * config.scale,
          opacity: isThinking ? 0.4 : 0.2
        }}
        style={{ width: finalSize, height: finalSize }}
        className={`absolute rounded-full blur-[140px] pointer-events-none transition-colors duration-500 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${isThinking ? 'bg-amber-500' : (isLive ? 'bg-red-500' : 'bg-emerald-500')}`}
      />

      <div
        style={{
          width: `${finalSize}px`,
          height: `${finalSize}px`,
          maxWidth: '85vw',
          maxHeight: '85vw'
        }}
        className={`relative rounded-full border-4 border-white/10 overflow-hidden z-10 group ${isTransparent ? 'bg-transparent shadow-none' : 'bg-zinc-950 shadow-[0_40px_100px_rgba(0,0,0,1)]'}`}
      >

        {showPlayOverlay && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/60 rounded-full backdrop-blur-sm cursor-pointer" onClick={handleManualPlay}>
            <div className="flex flex-col items-center gap-2">
              <Play className="w-12 h-12 text-white/90" />
              <span className="text-[10px] uppercase font-bold text-white/80 tracking-widest">Activer l'avatar</span>
            </div>
          </div>
        )}

        <div
          className={`w-full h-full relative rounded-full overflow-hidden ${isTransparent ? 'bg-transparent' : 'bg-black'}`}
          style={{
            WebkitMaskImage: '-webkit-radial-gradient(white, black)',
            maskImage: 'radial-gradient(white, black)',
            transform: 'translateZ(0)'
          }}
        >
          {renderLayer('INTRO', videoRefs.INTRO, isIntro)}
          {renderLayer('IDLE', videoRefs.IDLE, (currentMode === 'IDLE' || isThinking || isConnecting) && !isTalking && !isIntro)}
          {renderLayer('TALKING', videoRefs.TALKING, isTalking)}
        </div>
      </div>

      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 z-[70] pointer-events-auto flex items-center gap-4 w-max">
        <button
          onClick={(e) => { e.stopPropagation(); setInputMute(!isMicMuted); }}
          className={`flex items-center justify-center transition-all duration-300 shadow-[0_10px_30px_rgba(0,0,0,0.5)] bg-slate-800 hover:bg-slate-700 active:scale-95 border-2 border-white/10 rounded-full`}
          style={{
            width: `${config.callButtonSize * 0.6}px`,
            height: `${config.callButtonSize * 0.6}px`,
          }}
          title={isMicMuted ? "Activer le micro" : "Désactiver le micro"}
        >
          {isMicMuted ? <MicOff className="w-5 h-5 text-red-400" /> : <Mic className="w-5 h-5 text-white/80" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleAction(); }}
          style={{
            width: `${config.callButtonSize}px`,
            height: `${config.callButtonSize}px`,
            borderRadius: `${config.callButtonSize / 2}px`
          }}
          className={`flex items-center justify-center transition-all duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${getButtonStyles()} active:scale-90 border-4 border-white/10 opacity-100`}
          title={isLive ? "Raccrocher" : "Appeler Sirine"}
        >
          {renderIcon()}
        </button>
      </div>
    </motion.div>
  );
};
