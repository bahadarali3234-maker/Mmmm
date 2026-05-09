import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, FileVideo, ImageIcon } from 'lucide-react';

interface AvatarDisplayProps {
  state: 'idle' | 'speaking';
  volume?: number;
}

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ state, volume = 0 }) => {
  const [assetsStatus, setAssetsStatus] = useState<{ idle: boolean; speaking: boolean }>({ idle: false, speaking: false });
  const [isChecking, setIsChecking] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Derived animation values
  const scale = 1 + (state === 'speaking' ? volume * 0.05 : 0);
  const brightness = 1 + (state === 'speaking' ? volume * 0.2 : 0);

  useEffect(() => {
    const checkAssets = async () => {
      setIsChecking(true);
      const status = { idle: false, speaking: false };
      
      try {
        const img = new Image();
        img.src = '/avatar_idle.png';
        await new Promise((resolve, reject) => {
          img.onload = () => { status.idle = true; resolve(null); };
          img.onerror = () => { console.error("Idle image failed to load"); reject(); };
        });
      } catch (e) {}

      try {
        const video = document.createElement('video');
        video.src = '/avatar_speaking.mp4';
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = () => { status.speaking = true; resolve(null); };
          video.onerror = () => { console.error("Speaking video failed to load"); reject(); };
        });
      } catch (e) {}

      setAssetsStatus(status);
      setIsChecking(false);
    };
    checkAssets();
  }, []);

  const [videoStarted, setVideoStarted] = useState(false);

  useEffect(() => {
    if (state === 'speaking' && videoRef.current) {
      videoRef.current.play().catch(err => {
        console.error("Avatar: Video play error:", err);
      });
    } else if (state === 'idle' && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setVideoStarted(false);
    }
  }, [state]);

  if (isChecking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!assetsStatus.idle || !assetsStatus.speaking) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-muted rounded-3xl border-2 border-dashed border-muted-foreground/20 aspect-square max-w-sm mx-auto">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <p className="text-center text-sm font-bold text-foreground">
          Avatar Assets Offline
        </p>
        <div className="mt-4 space-y-2 w-full">
          <div className={`flex items-center gap-2 text-xs p-2 rounded ${assetsStatus.idle ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            <ImageIcon className="w-3 h-3" />
            idle.png: {assetsStatus.idle ? 'LOADED' : 'MISSING'}
          </div>
          <div className={`flex items-center gap-2 text-xs p-2 rounded ${assetsStatus.speaking ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            <FileVideo className="w-3 h-3" />
            speaking.mp4: {assetsStatus.speaking ? 'LOADED' : 'MISSING'}
          </div>
        </div>
      </div>
    );
  }

  const showVideo = state === 'speaking' && videoStarted;

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#050505]">
      {/* Background glow that reacts to volume */}
      {state === 'speaking' && (
        <div 
          className="absolute inset-0 z-0 opacity-40 transition-all duration-300"
          style={{ 
            boxShadow: `inset 0 0 ${volume * 200}px rgba(59, 130, 246, 0.4)`,
            filter: `blur(${volume * 40}px)` 
          }}
        />
      )}

      {/* Idle Image - Stays visible as base layer when switching */}
      <motion.img
        src="/avatar_idle.png"
        alt="Avatar Idle"
        className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
        initial={false}
        animate={{ 
          opacity: showVideo ? 0 : 1,
          scale: state === 'idle' ? [1, 1.015, 1] : 1.015,
        }}
        transition={{ 
          opacity: { duration: 0.8, ease: "easeInOut" },
          scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
        }}
      />
      
      <motion.video
        ref={videoRef}
        src="/avatar_speaking.mp4"
        onPlaying={() => setVideoStarted(true)}
        initial={false}
        animate={{ 
          scale: scale,
          filter: `brightness(${brightness})`,
          opacity: showVideo ? 1 : 0
        }}
        transition={{ 
          scale: { type: "spring", stiffness: 200, damping: 25 },
          opacity: { duration: 0.8, ease: "easeInOut" }
        }}
        className="absolute inset-0 w-full h-full object-cover z-20"
        loop
        muted
        playsInline
      />
    </div>
  );
};

const Loader = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
);
