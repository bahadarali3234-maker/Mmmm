import React from 'react';
import { 
  Loader2, Mic, MicOff, Phone, PhoneOff, AlertCircle, 
  Video, VideoOff, MonitorUp, X 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLiveAPI } from '@/hooks/useLiveAPI';
import { motion, AnimatePresence } from 'motion/react';

interface ChatInterfaceProps {
  liveAPI: any;
  isGroqEnabled: boolean;
  onToggleGroq: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ liveAPI, isGroqEnabled, onToggleGroq }) => {
  const { 
    isConnected, isSpeaking, transcript, error, 
    connect, stop, 
    isMuted, isCameraOn, isScreenSharing, stream,
    toggleMute, toggleCamera, toggleScreenShare
  } = liveAPI;

  const isQuotaError = error?.toLowerCase().includes('quota');

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-end p-12 pointer-events-none">
      <div className="w-full max-w-2xl pointer-events-auto">
        <AnimatePresence mode="wait">
          {!isConnected ? (
            <motion.div
              key="connect-view"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="flex flex-col items-center gap-6"
            >
              <Button
                size="lg"
                onClick={connect}
                className="h-20 px-12 rounded-[2.5rem] bg-white text-black hover:bg-zinc-200 text-xl font-bold uppercase tracking-widest gap-4 shadow-2xl transition-all hover:scale-105 active:scale-95"
              >
                <Phone className="w-8 h-8 fill-current" />
                {isGroqEnabled ? "Start Groq Session" : "Start Conversation"}
              </Button>

              <div className="flex flex-col items-center gap-2">
                <p className="text-[10px] text-zinc-500 font-bold tracking-widest uppercase">
                  {isGroqEnabled ? "Groq Backend Active" : "Gemini Multimodal Live Active"}
                </p>
                <button 
                  onClick={onToggleGroq}
                  className="text-[10px] text-primary hover:text-primary/80 underline font-bold tracking-widest uppercase transition-colors"
                >
                  Switch to {isGroqEnabled ? "Gemini (Full Vision)" : "Groq (Fast Text Backend)"}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="controls-view"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="flex flex-col items-center gap-8"
            >
              {/* Visual Feedback Area */}
              <div className="flex flex-col items-center gap-4">
                <div className="flex justify-center gap-2 h-12 items-center">
                  {[...Array(7)].map((_, i) => (
                    <motion.div
                      key={i}
                      animate={isSpeaking ? { height: [12, 48, 12] } : { height: 6 }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                      className="w-1.5 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                    />
                  ))}
                </div>
                <p className="text-[10px] font-black tracking-[0.4em] uppercase text-primary/80 animate-pulse text-center">
                  {isGroqEnabled ? "Groq Mode: " : ""}
                  {isSpeaking ? "Receiving Transmission" : "Listening for input"}
                </p>
                {transcript && (
                  <p className="text-zinc-400 text-xs italic line-clamp-1 max-w-sm">
                    "{transcript}"
                  </p>
                )}
              </div>

              {/* Main Control Bar */}
              <div className="bg-[#1a1c22]/80 backdrop-blur-3xl px-8 py-5 rounded-[3rem] border border-white/10 shadow-2xl flex items-center gap-6">
                {!isGroqEnabled && (
                  <>
                    <ControlButton
                      onClick={toggleCamera}
                      active={isCameraOn}
                      icon={Video}
                      stream={isCameraOn ? stream : null}
                      isMirror
                    />
                    <ControlButton
                      onClick={toggleScreenShare}
                      active={isScreenSharing}
                      icon={MonitorUp}
                      stream={isScreenSharing ? stream : null}
                    />
                  </>
                )}

                <ControlButton
                  onClick={toggleMute}
                  active={!isMuted}
                  icon={isMuted ? MicOff : Mic}
                  disabled={isGroqEnabled} // Groq uses browser silence detection usually
                />

                <button
                  onClick={stop}
                  className="w-20 h-16 rounded-[2rem] bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-90"
                >
                  <X className="w-8 h-8 stroke-[3]" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(error || isQuotaError) && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
          >
            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-red-500/30 uppercase tracking-widest shadow-2xl">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
            {isQuotaError && !isGroqEnabled && (
              <Button 
                onClick={onToggleGroq}
                variant="outline"
                className="bg-primary/20 hover:bg-primary/30 border-primary/50 text-white text-[10px] uppercase font-black tracking-widest rounded-full px-4 h-8"
              >
                Use Groq Fallback
              </Button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

const ControlButton = ({ onClick, active, icon: Icon, stream, isMirror }: any) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <button
      onClick={onClick}
      className={`relative w-20 h-16 rounded-[2rem] flex items-center justify-center transition-all hover:scale-110 active:scale-90 overflow-hidden ${
        active 
          ? 'bg-zinc-800 text-white hover:bg-zinc-700' 
          : 'bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800'
      }`}
    >
      <AnimatePresence>
        {stream ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-0 flex items-center justify-center bg-black"
          >
            <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/20 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: isMirror ? 'scaleX(-1)' : 'none' }}
              />
            </div>
            <div className="absolute inset-0 bg-primary/10" />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <Icon className={`relative z-10 w-8 h-8 ${active ? 'opacity-100' : 'opacity-40'} ${stream ? 'hidden' : ''}`} />
    </button>
  );
};
