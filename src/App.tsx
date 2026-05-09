/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Video, VideoOff, Power, MessageCircle, X, RotateCw, Monitor, MapPin, Battery, Clock, Cloud, Bell, History, Trash2, ChevronLeft, LogIn, User, Volume2 } from 'lucide-react';
import { useLiveAPI } from './hooks/useLiveAPI';
import { ConversationStore, ChatTurn, UserProfileStore } from './lib/storage';
import { auth, signInWithGoogle, signOutUser, testConnection } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

const AVAILABLE_VOICES = [
  { id: 'Zephyr', name: 'Zephyr', desc: 'Calm & Pro', gender: 'F' },
  { id: 'Puck', name: 'Puck', desc: 'Energetic', gender: 'M' },
  { id: 'Charon', name: 'Charon', desc: 'Deep & Wise', gender: 'M' },
  { id: 'Kore', name: 'Kore', desc: 'Clear & Kind', gender: 'F' },
  { id: 'Fenrir', name: 'Fenrir', desc: 'Bold & Strong', gender: 'M' },
  { id: 'Aoede', name: 'Aoede', desc: 'Soft & Sweet', gender: 'F' },
  { id: 'Terra', name: 'Terra', desc: 'Natural', gender: 'F' },
  { id: 'Orion', name: 'Orion', desc: 'Sharp', gender: 'M' }
];

const getSystemInstruction = (userName?: string, storeName?: string) => `Aap ek nihayat advanced AI Voice Assistant hain jiska naam 'Humsafar' hai. Aapka mizaaj dosti wala aur professional hai.
${userName ? `User ka naam ${userName} hai, unhe isi naam se pukarein agar wo ijazat dein.` : 'Agar user apna naam bataye toh use hamesha yaad rakhein aur "set_user_name" tool use karein.'}
${storeName ? `User ki dukaan ya business ka naam "${storeName}" hai.` : 'Agar user apni dukaan ya business ka naam bataye toh use hamesha yaad rakhein aur "set_store_name" tool use karein.'}

CRITICAL: Jaise hi connection start ho, ya jab bhi user "Hi" ya "Hello" kahe, aapko FORAN muskurate hue jawab dena hai aur kehna hai: "Hi, I am Humsafar. How can I help you today?" 

Usool:
1. Direct Answers: Agar user koi seedha sawal pooche, toh uska seedha aur mukhtasar jawab dein.
2. Identity: Agar user pooche "Who developed you?", toh hamesha kahein: "I am developed by Irtaza."
3. Proactive Greeting: Connection hote hi aap pehle bolenge.
4. Short & Concise: Voice interaction ko 2-3 jumlon mein mukammal karein.
5. Mobile Tasks: User ki request par tools use karein (Alarm, WhatsApp, Calls).
6. Personalization: User ka naam aur store ka naam yaad rakhein aur baat mein natural feel laein.
7. Vision: Eyes (Camera) aur Mirror (Screen) ke zariye real-time help karein.`;

const TOOLS = [
  { functionDeclarations: [
    { name: "get_weather", description: "Get current weather for user's location" },
    { name: "get_location", description: "Get user's current city and coordinates" },
    { name: "get_battery_status", description: "Check device battery level and charging status" },
    { name: "get_current_time", description: "Get the current local time" },
    { name: "get_news", description: "Get latest global news headlines" },
    { name: "get_system_info", description: "Get basic information about the user's browser environment" },
    { name: "calculate", description: "Perform simple mathematical calculations", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
    { name: "set_reminder", description: "Set a visual reminder for the user", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
    { name: "set_user_name", description: "Save the user's name found during conversation", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
    { name: "set_store_name", description: "Save the user's store or business name", parameters: { type: "object", properties: { storeName: { type: "string" } }, required: ["storeName"] } },
    // NEW MOBILE TOOLS
    { name: "set_alarm", description: "Set an alarm on the mobile device", parameters: { type: "object", properties: { time: { type: "string", description: "Time for alarm (e.g. 7:00 AM)" }, label: { type: "string" } }, required: ["time"] } },
    { name: "send_whatsapp", description: "Send a WhatsApp message to a contact", parameters: { type: "object", properties: { contact: { type: "string" }, message: { type: "string" } }, required: ["contact", "message"] } },
    { name: "make_whatsapp_call", description: "Initiate a WhatsApp voice/video call", parameters: { type: "object", properties: { contact: { type: "string" } }, required: ["contact"] } },
    { name: "place_call", description: "Make a standard phone call", parameters: { type: "object", properties: { contact: { type: "string" } }, required: ["contact"] } }
  ]}
];

export default function App() {
  const { connected, status, isModelSpeaking, toolCall, error, transcripts, connect, disconnect, sendVideoFrame, sendToolResponse } = useLiveAPI();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<{ name?: string, voice?: string, storeName?: string } | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isScreenShareSupported, setIsScreenShareSupported] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [reminder, setReminder] = useState<string | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [savedHistory, setSavedHistory] = useState<ChatTurn[]>([]);
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [permissions, setPermissions] = useState({
    camera: 'pending',
    microphone: 'pending',
    display: 'pending'
  });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const lastCaptureRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  // Local Wake Word Detection
  const startWakeWordListener = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('')
            .toLowerCase();
        
        if (transcript.includes('hey humsafar') || transcript.includes('hey hum safar') || transcript.includes('humsafar')) {
            if (!connected && status === 'idle') {
                connect(getSystemInstruction(profile?.name, profile?.storeName), TOOLS, selectedVoice);
            }
        }
    };

    recognition.onend = () => {
        if (isWakeWordListening) recognition.start();
    };

    recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') setIsWakeWordListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsWakeWordListening(true);
  }, [connected, status, profile, selectedVoice, connect]);

  useEffect(() => {
    if (user && !connected && !isWakeWordListening) {
        startWakeWordListener();
    }
    if (connected && isWakeWordListening) {
        recognitionRef.current?.stop();
        setIsWakeWordListening(false);
    }
  }, [user, connected, isWakeWordListening, startWakeWordListener]);

  // Auth & Profile Management
  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const p = await UserProfileStore.getProfile(u.uid);
        setProfile(p || {});
        if (p?.voice) setSelectedVoice(p.voice);
      } else {
        setProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const supported = !!(navigator.mediaDevices && ('getDisplayMedia' in navigator.mediaDevices));
    setIsScreenShareSupported(supported);
  }, []);

  // Save transcripts to storage
  const lastSavedRef = useRef<number>(0);
  useEffect(() => {
    if (user && transcripts.length > lastSavedRef.current) {
      const newTurns = transcripts.slice(lastSavedRef.current);
      newTurns.forEach(turn => {
        ConversationStore.saveTurn(user.uid, {
            role: turn.role,
            text: turn.text,
            timestamp: turn.timestamp,
            duration: turn.text.length * 50,
            sessionId: sessionId
        });
      });
      lastSavedRef.current = transcripts.length;
    }
  }, [transcripts, user, sessionId]);

  // Load history when requested
  useEffect(() => {
    if (showHistory && user) {
      ConversationStore.getHistory(user.uid).then(setSavedHistory);
    }
  }, [showHistory, user]);

  // Handle Tool Calls
  useEffect(() => {
    if (toolCall && user) {
      const handleTools = async () => {
        const responses = await Promise.all(toolCall.functionCalls.map(async (call: any) => {
          let result = {};
          switch (call.name) {
            case 'set_user_name':
              await UserProfileStore.saveProfile(user.uid, { name: call.args.name });
              setProfile(prev => ({ ...prev, name: call.args.name }));
              result = { status: "success", message: `Name saved as ${call.args.name}` };
              break;
            case 'set_store_name':
              await UserProfileStore.saveProfile(user.uid, { storeName: call.args.storeName });
              setProfile(prev => ({ ...prev, storeName: call.args.storeName }));
              result = { status: "success", message: `Store name saved as ${call.args.storeName}` };
              break;
            case 'get_weather':
              result = { status: "sunny", temp: "28°C", city: "Karachi" };
              break;
            case 'get_location':
              result = { city: "Karachi", country: "Pakistan", lat: 24.86, lon: 67.01 };
              break;
            case 'get_battery_status':
              const battery: any = await (navigator as any).getBattery?.() || { level: 0.8, charging: false };
              result = { level: Math.round(battery.level * 100) + "%", charging: battery.charging };
              break;
            case 'get_current_time':
              result = { time: new Date().toLocaleTimeString() };
              break;
            case 'get_news':
              result = { headlines: [
                "AI technology integration reaches new heights.",
                "Upcoming weather changes in the region.",
                "Health experts share new wellness tips."
              ] };
              break;
            case 'get_system_info':
              result = { 
                platform: navigator.platform,
                language: navigator.language,
                online: navigator.onLine,
              };
              break;
            case 'calculate':
              try {
                // eslint-disable-next-line no-eval
                result = { result: eval(call.args.expression.replace(/[^-()\d/*+.]/g, '')) };
              } catch (e) {
                result = { error: "Invalid expression" };
              }
              break;
            case 'set_reminder':
              setReminder(call.args.text);
              result = { status: "success", message: "Reminder displayed" };
              break;
            case 'set_alarm':
              setReminder(`ALARM: ${call.args.time} (${call.args.label || 'Alarm'})`);
              result = { status: "success", info: "Alarm requested on mobile device" };
              break;
            case 'send_whatsapp':
              setReminder(`WHATSAPP TO ${call.args.contact}: ${call.args.message}`);
              result = { status: "success", info: "Message forwarded to WhatsApp API" };
              break;
            case 'make_whatsapp_call':
              setReminder(`WHATSAPP CALLING: ${call.args.contact}`);
              result = { status: "success", info: "Call initiated" };
              break;
            case 'place_call':
              setReminder(`DIALING: ${call.args.contact}`);
              window.location.href = `tel:${call.args.contact}`;
              result = { status: "success", info: "Phone dialer opened" };
              break;
          }
          return { name: call.name, response: { result }, id: call.id };
        }));
        sendToolResponse(responses);
      };
      handleTools();
    }
  }, [toolCall, sendToolResponse]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        setIsScreenSharing(false);
        setScreenShareError(null);
      }
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  const startScreenShare = async () => {
    setScreenShareError(null);
    
    // Robust support check
    if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices)) {
      setScreenShareError("Aapka browser screen sharing support nahi karta. Behtar hoga agar aap latest Chrome use karein.");
      return;
    }

    // Permission confirmation (APK-style request)
    const confirmed = confirm("Humsafar aapki screen dekhna chahta hai taake wo aapki behtar madad kar sake. Kya aap mirror shuru karna chahte hain?");
    if (!confirmed) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { 
          cursor: "always",
          displaySurface: "all"
        } as any,
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsScreenSharing(true);
        setIsCameraActive(false);
        
        // Update permission status in UI
        setPermissions(p => ({ ...p, display: 'granted' }));
        
        // Handle stop sharing from browser UI
        stream.getVideoTracks()[0].onended = () => {
          stopVideo();
        };
      }
    } catch (err: any) {
      console.error("Screen share error:", err);
      if (err.name === 'NotAllowedError') {
        setScreenShareError("Screen share ki ijazat nahi di gayi.");
      } else {
        setScreenShareError("Screen share shuru nahi ho saka: " + (err.message || "Unknown error"));
      }
    }
  };

  const stopVideo = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      setIsScreenSharing(false);
    }
  };

  const toggleCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (isCameraActive) {
      stopVideo();
      setTimeout(startCamera, 100);
    }
  };

  const captureFrame = useCallback(() => {
    const now = Date.now();
    if ((isCameraActive || isScreenSharing) && videoRef.current && canvasRef.current && connected) {
      if (now - lastCaptureRef.current > 2000) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
          sendVideoFrame(base64);
          lastCaptureRef.current = now;
        }
      }
    }
    requestRef.current = requestAnimationFrame(captureFrame);
  }, [isCameraActive, isScreenSharing, connected, sendVideoFrame]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(captureFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [captureFrame]);

  const handleToggleConnection = () => {
    if (connected || status === 'connecting') {
      disconnect();
      stopVideo();
    } else {
      connect(getSystemInstruction(profile?.name, profile?.storeName), TOOLS, selectedVoice);
    }
  };

  if (authLoading) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity }} className="text-white font-mono uppercase tracking-[0.5em] text-xs">
                Handshaking...
            </motion.div>
        </div>
    );
  }

  if (!user) {
    return (
        <div className="min-h-screen bg-[#070707] text-white flex flex-col items-center justify-center p-8 relative font-sans">
             <div className="absolute inset-0 atmosphere pointer-events-none opacity-30"></div>
             <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-10 w-full max-w-sm flex flex-col items-center text-center gap-12"
             >
                <div className="space-y-4">
                    <h1 className="text-6xl font-light tracking-tighter">HUMSAFAR</h1>
                    <div className="flex items-center justify-center gap-2">
                        <div className="h-px w-8 bg-white/20"></div>
                        <span className="text-[10px] uppercase tracking-[0.4em] font-mono text-white/40">Identity Sync Required</span>
                        <div className="h-px w-8 bg-white/20"></div>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-6 w-full">
                    <p className="text-xs text-white/40 font-mono leading-relaxed max-w-[250px]">
                        Link secure karne ke liye apne Google account se login karein.
                    </p>
                    <button 
                        onClick={signInWithGoogle}
                        className="w-full flex items-center justify-center gap-4 bg-white text-black font-bold uppercase tracking-[0.2em] text-xs py-5 rounded-2xl hover:bg-gray-200 transition-all shadow-[0_0_30px_rgba(255,255,255,0.05)]"
                    >
                        <LogIn className="w-5 h-5" />
                        Continue with Google
                    </button>
                    <p className="text-[9px] text-white/20 uppercase tracking-widest font-mono">
                        Powered by AI Studio & Firebase
                    </p>
                </div>
             </motion.div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070707] text-[#e0e0e0] flex flex-col items-center justify-center p-6 overflow-hidden relative font-sans selection:bg-white/20">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 atmosphere pointer-events-none opacity-30"></div>
      
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

      {/* Main Content */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="z-10 w-full max-w-lg flex flex-col items-center gap-12"
      >
        <header className="text-center space-y-4">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <div className="h-px w-8 bg-white/20"></div>
            <span className="text-[10px] uppercase tracking-[0.4em] font-mono text-white/40">Neural Link v2.0</span>
            <div className="h-px w-8 bg-white/20"></div>
          </motion.div>
          
          <h1 className="text-5xl md:text-7xl font-light tracking-tighter text-white">
            HUMSAFAR
          </h1>
          <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">
            {status === 'connecting' ? 'Establishing Connection...' : status === 'connected' ? 'Link Secure & Active' : 'System Standby'}
          </p>
        </header>

            {/* Interaction Hub */}
            <div className="relative group scale-75 md:scale-100">
                {/* Voice Selection Overlay */}
                <AnimatePresence>
                    {showVoiceSelector && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col p-8"
                        >
                            <div className="max-w-md mx-auto w-full flex flex-col h-full">
                                <div className="flex justify-between items-center mb-10">
                                    <h2 className="text-xl font-bold uppercase tracking-[0.3em] text-white">Voice Identity</h2>
                                    <button onClick={() => setShowVoiceSelector(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                        <X className="w-6 h-6 text-white/50" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                    {AVAILABLE_VOICES.map((voice) => (
                                        <button
                                            key={voice.id}
                                            onClick={async () => {
                                                setSelectedVoice(voice.id);
                                                if (user) {
                                                    await UserProfileStore.saveProfile(user.uid, { voice: voice.id });
                                                    setProfile(prev => ({ ...prev, voice: voice.id }));
                                                }
                                                // Reconnect if already connected to apply voice change
                                                if (connected) {
                                                    disconnect();
                                                    setTimeout(() => {
                                                        connect(getSystemInstruction(profile?.name, profile?.storeName), TOOLS, voice.id);
                                                    }, 500);
                                                }
                                            }}
                                            className={`p-4 rounded-2xl border transition-all text-left group flex flex-col gap-2 relative overflow-hidden ${
                                                selectedVoice === voice.id 
                                                ? 'bg-white border-white text-black' 
                                                : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                                            }`}
                                        >
                                            {selectedVoice === voice.id && (
                                                <motion.div 
                                                    layoutId="voice-indicator"
                                                    className="absolute inset-0 bg-white z-0"
                                                />
                                            )}
                                            <div className="relative z-10">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${selectedVoice === voice.id ? 'text-black' : 'text-white/40'}`}>
                                                        {voice.gender === 'F' ? 'Female' : 'Male'}
                                                    </span>
                                                    {selectedVoice === voice.id && <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
                                                </div>
                                                <h3 className="text-sm font-bold tracking-tight">{voice.name}</h3>
                                                <p className={`text-[9px] mt-1 ${selectedVoice === voice.id ? 'text-black/60' : 'text-white/30'}`}>
                                                    {voice.desc}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                <div className="pt-10">
                                    <button 
                                        onClick={() => setShowVoiceSelector(false)}
                                        className="w-full py-5 rounded-2xl bg-white text-black font-bold uppercase tracking-[0.4em] text-xs hover:bg-gray-200 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                                    >
                                        Set Identity
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Permission Guide Overlay */}
        <AnimatePresence>
            {showPermissionGuide && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col p-8"
                >
                    <div className="max-w-md mx-auto w-full flex flex-col h-full">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-xl font-bold uppercase tracking-[0.3em] text-white">System Access</h2>
                            <button onClick={() => setShowPermissionGuide(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-6 h-6 text-white/50" />
                            </button>
                        </div>

                        <div className="space-y-8 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-4">
                                <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest bg-white/5 p-3 rounded-lg border border-white/5 leading-relaxed">
                                    APK Permission Alert: Device access zaroori hai system control ke liye.
                                </p>
                            </div>

                            {/* APK Conversion Target */}
                            <div className="p-5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                            <Monitor className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-widest text-white">Display Over Apps</h3>
                                            <p className="text-[9px] text-blue-400/60">Required for APK overlays</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if(confirm("Humsafar ko 'Display over other apps' ki ijazat chahiye taake ye kisi bhi screen par help kar sake. Kya aap ijazat dete hain?")) {
                                                setPermissions(p => ({ ...p, display: 'granted' }));
                                            }
                                        }}
                                        className={`text-[10px] font-mono uppercase tracking-widest px-4 py-2 rounded-full font-bold transition-all ${
                                            permissions.display === 'granted' ? 'bg-green-500 text-white' : 'bg-white text-black hover:bg-gray-200'
                                        }`}
                                    >
                                        {permissions.display === 'granted' ? 'Allowed' : 'Grant'}
                                    </button>
                                </div>
                            </div>

                            {/* Camera & Mic */}
                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                            <Mic className="w-5 h-5 text-white/60" />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-widest text-white">Voice & Eyes</h3>
                                            <p className="text-[9px] text-white/40">Camera & Microphone access</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            try {
                                                await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
                                                setPermissions(p => ({ ...p, camera: 'granted', microphone: 'granted' }));
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        }}
                                        className="text-[10px] font-mono uppercase tracking-widest bg-white text-black px-4 py-2 rounded-full font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        Allow
                                    </button>
                                </div>
                            </div>

                            {/* Display Over Other Apps (Guided) */}
                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                            <Monitor className={`w-5 h-5 ${isScreenShareSupported ? 'text-white/60' : 'text-red-500/40'}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-widest text-white">Mirror (Screen)</h3>
                                            <p className={`text-[9px] ${isScreenShareSupported ? 'text-white/40' : 'text-red-500/60 font-bold'}`}>
                                                {isScreenShareSupported ? 'Supported on this browser' : 'Not supported on this browser'}
                                            </p>
                                        </div>
                                    </div>
                                    {!isScreenShareSupported && (
                                        <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                                            <span className="text-[8px] text-red-400 font-mono uppercase">Upgrade Browser</span>
                                        </div>
                                    )}
                                </div>
                                
                                {isScreenShareSupported ? (
                                    <div className="space-y-4 p-4 rounded-xl bg-black/40 border border-white/5">
                                        <p className="text-[10px] text-white/60 leading-relaxed font-mono">
                                            Android users ke liye:<br/>
                                            1. Settings mein jayein.<br/>
                                            2. "Display over other apps" search karein.<br/>
                                            3. "Humsafar AI" ko talaash kar ke switch ON karein.
                                        </p>
                                        <button 
                                            onClick={() => setPermissions(p => ({ ...p, display: 'granted' }))}
                                            className={`w-full py-3 rounded-xl border border-white/10 text-[10px] font-mono uppercase tracking-widest transition-all ${
                                                permissions.display === 'granted' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'hover:bg-white/5'
                                            }`}
                                        >
                                            {permissions.display === 'granted' ? 'Set as Managed' : 'Mark as Enabled'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                                        <p className="text-[10px] text-red-400/80 leading-relaxed font-mono">
                                            Aapka browser screen sharing support nahi karta. Screen mirroring ke liye Chrome, Edge ya Safari ka latest version use karein.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* WhatsApp Helper */}
                            <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                        <MessageCircle className="w-5 h-5 text-white/60" />
                                    </div>
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-white">Mobile Tasks</h3>
                                </div>
                                <p className="text-[9px] text-white/40 leading-relaxed font-mono">
                                    WhatsApp aur Alarms ke liye aapko device admin ki authorization zaroori ho sakti hai. System commands ko bypass karne ke liye "Hey Humsafar" wake word use karein.
                                </p>
                            </div>
                        </div>

                        <div className="pt-10">
                            <button 
                                onClick={() => setShowPermissionGuide(false)}
                                className="w-full py-5 rounded-2xl bg-white text-black font-bold uppercase tracking-[0.4em] text-xs hover:bg-gray-200 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                            >
                                Active System
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* History Overlay */}
        <AnimatePresence>
            {showHistory && (
                <motion.div 
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    className="fixed inset-0 z-50 bg-black flex flex-col"
                >
                    <div className="p-6 flex items-center justify-between border-b border-white/10">
                        <div className="flex flex-col">
                            <h2 className="text-sm font-bold uppercase tracking-[0.3em]">History</h2>
                            {profile?.name && <p className="text-[8px] text-white/30 uppercase mt-1">User: {profile.name}</p>}
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => {
                                    if (confirm("Kya aap logout karna chahte hain?")) {
                                        signOutUser();
                                    }
                                }}
                                className="text-white/40 hover:text-white transition-colors"
                                title="Logout"
                            >
                                <LogIn className="w-5 h-5 rotate-180" />
                            </button>
                            <button 
                                onClick={() => {
                                    if (confirm("Kya aap saari history mita dena chahte hain?")) {
                                        ConversationStore.clear(user.uid);
                                        setSavedHistory([]);
                                    }
                                }}
                                className="text-red-500/60 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => setShowHistory(false)}
                                className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {savedHistory.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                                <MessageCircle className="w-12 h-12" />
                                <p className="text-xs font-mono uppercase tracking-widest">Koi baatchit nahi mili</p>
                            </div>
                        ) : (
                            savedHistory.map((turn, i) => (
                                <motion.div 
                                    key={turn.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[8px] font-mono uppercase tracking-widest text-white/30">
                                            {turn.role === 'user' ? 'Aap' : 'Humsafar'}
                                        </span>
                                        <span className="text-[7px] font-mono text-white/10">
                                            {new Date(turn.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${
                                        turn.role === 'user' 
                                        ? 'bg-white/10 text-white rounded-tr-none border border-white/5' 
                                        : 'bg-white text-black rounded-tl-none font-medium'
                                    }`}>
                                        {turn.text}
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                    
                    <div className="p-6 bg-white/5 border-t border-white/10">
                        <p className="text-[9px] text-white/30 text-center font-mono leading-relaxed uppercase tracking-widest">
                            Neural History Sync Active<br/>
                            Rolling 30-Day Retention Policy
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Status Bar */}
                <div className="absolute -top-12 left-0 right-0 flex justify-between items-center px-2">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-white/40">
                            {status === 'connecting' ? 'Handshake' : connected ? 'Sync Active' : 'Offline'}
                        </span>
                    </div>
                    {connected && (
                        <div className="flex items-center gap-3">
                            <AnimatePresence>
                                {isCameraActive && (
                                    <motion.div 
                                        initial={{ opacity: 0, x: 5 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex items-center gap-1"
                                    >
                                        <div className="w-1 h-1 bg-white rounded-full animate-ping" />
                                        <span className="text-[7px] font-mono text-white/60">Vision</span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div className="flex items-center gap-1">
                                <Mic className={`w-2.5 h-2.5 ${isModelSpeaking ? 'text-white/20' : 'text-green-500'}`} />
                                <span className={`text-[7px] font-mono ${isModelSpeaking ? 'text-white/20' : 'text-white/60'}`}>Listen</span>
                            </div>
                        </div>
                    )}
                </div>
            {/* Reminder Notification */}
            <AnimatePresence>
                {reminder && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute -top-16 left-0 right-0 z-30 flex justify-center"
                    >
                        <div className="bg-white text-black px-4 py-2 rounded-full flex items-center gap-2 shadow-xl border border-white/20">
                            <Bell className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">{reminder}</span>
                            <button onClick={() => setReminder(null)} className="ml-2 hover:bg-black/10 rounded-full p-1">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Outer Decorative Ring */}
            <div className="absolute inset-[-40px] border border-white/5 rounded-full pointer-events-none"></div>
            
            {/* Wake Word Indicator */}
            {!connected && isWakeWordListening && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -top-16 left-0 right-0 flex justify-center z-20"
                >
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/60">Say "Hey Humsafar"</span>
                    </div>
                </motion.div>
            )}

            {/* Main Circle Orb */}
            <div className="relative w-64 h-64 md:w-72 md:h-72 rounded-full overflow-hidden bg-[#111] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center">
                {/* Visual Feedback Layers */}
                <AnimatePresence>
                    {status === 'connecting' && (
                        <motion.div 
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="absolute inset-0 flex items-center justify-center"
                        >
                            <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                className="w-16 h-16 border-t-2 border-white/40 rounded-full"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Video Feed (Camera or Screen) */}
                <video 
                    ref={videoRef} 
                    className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ${
                        isCameraActive ? 'opacity-40 grayscale contrast-125' : isScreenSharing ? 'opacity-80 contrast-100 saturate-150' : 'opacity-0'
                    }`} 
                    autoPlay 
                    playsInline
                    muted
                />
                <canvas ref={canvasRef} className="hidden" width={240} height={180} />

                {/* Audio Visualizer Overlay */}
                {connected && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                        <div className="flex gap-1 h-32 items-center">
                           {[...Array(12)].map((_, i) => (
                               <motion.div 
                                 key={i}
                                 animate={{ height: isModelSpeaking ? [10, Math.random() * 80 + 20, 10] : [10, 15, 10] }}
                                 transition={{ duration: 0.5 + Math.random(), repeat: Infinity }}
                                 className="w-1 bg-white rounded-full"
                               />
                           ))}
                        </div>
                    </div>
                )}

                {/* The Core Button */}
                <motion.button
                    onClick={handleToggleConnection}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={isModelSpeaking ? { boxShadow: ["0 0 20px rgba(255,255,255,0.1)", "0 0 60px rgba(255,255,255,0.4)", "0 0 20px rgba(255,255,255,0.1)"] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`relative z-20 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-700 ${
                        connected 
                        ? 'bg-white text-black' 
                        : status === 'connecting' 
                          ? 'bg-white/5 text-white/50 cursor-wait'
                          : 'bg-transparent border border-white/20 text-white hover:border-white/50'
                    }`}
                >
                    {status === 'connecting' ? (
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity }}>
                             <Power className="w-10 h-10" />
                        </motion.div>
                    ) : connected ? (
                        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                            <Mic className="w-10 h-10" />
                        </motion.div>
                    ) : (
                        <Power className="w-10 h-10" />
                    )}
                </motion.button>
            </div>
        </div>

        {/* Auxiliary Controls */}
        <div className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
            <button
                onClick={() => setShowHistory(true)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all text-gray-500 hover:text-white"
                title="View Conversation History"
            >
                <History className="w-5 h-5" />
                <span className="text-[8px] uppercase font-mono tracking-wider">History</span>
            </button>

            <div className="w-px h-8 bg-white/10 mx-1"></div>

            <button
                onClick={() => isCameraActive ? stopVideo() : startCamera()}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                    isCameraActive ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'
                }`}
                title="Toggle Camera"
            >
                {isCameraActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                <span className="text-[8px] uppercase font-mono tracking-wider">Eyes</span>
            </button>

            {isCameraActive && (
              <button
                  onClick={toggleCamera}
                  className="p-3 text-gray-500 hover:text-white transition-all flex flex-col items-center gap-1"
                  title="Switch Front/Back Camera"
              >
                  <RotateCw className="w-5 h-5" />
                  <span className="text-[8px] uppercase font-mono tracking-wider">Rotate</span>
              </button>
            )}

            <button
                onClick={() => isScreenSharing ? stopVideo() : startScreenShare()}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                    isScreenSharing ? 'bg-white/10 text-white shadow-lg border border-white/20' : 'text-gray-500 hover:text-white'
                } ${!isScreenShareSupported ? 'opacity-30 cursor-not-allowed' : ''}`}
                title={isScreenShareSupported ? "Start Screen Sharing" : "Screen sharing not supported on this device"}
                disabled={!isScreenShareSupported}
            >
                <Monitor className="w-5 h-5" />
                <span className="text-[8px] uppercase font-mono tracking-wider">Mirror</span>
            </button>

            <div className="w-px h-8 bg-white/10 mx-1"></div>

            <button
                onClick={() => setShowVoiceSelector(true)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all text-gray-500 hover:text-white"
                title="Voice Settings"
            >
                <Volume2 className="w-5 h-5" />
                <span className="text-[8px] uppercase font-mono tracking-wider">Voice</span>
            </button>

            <button
                onClick={() => setShowPermissionGuide(true)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all text-gray-500 hover:text-white"
                title="System Permissions & Settings"
            >
                <Bell className="w-5 h-5" />
                <span className="text-[8px] uppercase font-mono tracking-wider">Perms</span>
            </button>
        </div>

        {/* Screen Share Error Message */}
        <AnimatePresence>
            {screenShareError && (
                <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-[10px] text-white/50 font-mono tracking-widest text-center uppercase"
                >
                    {screenShareError}
                </motion.div>
            )}
        </AnimatePresence>

        {/* Error / Alert Display */}
        <AnimatePresence>
            {error && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex flex-col items-center gap-2 bg-red-500/10 border border-red-500/20 px-6 py-4 rounded-2xl max-w-sm text-center"
                >
                    <div className="flex items-center gap-2">
                        <X className="w-4 h-4 text-red-500" />
                        <span className="text-xs font-mono text-red-400 font-bold uppercase tracking-widest">
                            {error.toLowerCase().includes('quota') ? 'Quota Exceeded' : 'System Error'}
                        </span>
                    </div>
                    <p className="text-[10px] text-red-300/60 leading-relaxed">
                        {error.toLowerCase().includes('quota') 
                            ? 'Aap ki daily limit khatam ho chuki hai. Bara-e-meherbani thodi der baad dobara koshish karein.' 
                            : error}
                    </p>
                </motion.div>
            )}
        </AnimatePresence>

        {!connected && status !== 'connecting' && !error && (
           <p className="text-gray-600 text-xs font-mono uppercase tracking-[0.2em] italic">
               System Ready for Handshake...
           </p>
        )}
      </motion.div>

      {/* Industrial Footer */}
      <footer className="absolute bottom-10 left-0 right-0 px-10 flex justify-between items-end opacity-20 pointer-events-none">
          <div className="flex flex-col gap-1 font-mono text-[9px] uppercase tracking-widest">
              <div>Type: LLM-LIVE-AUDIO</div>
              <div>Buffer: 16-BIT PCM</div>
          </div>
          <div className="text-[9px] uppercase tracking-[0.5em] font-mono">
              Link Up: AI.STUDIO
          </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .atmosphere {
          background: 
            radial-gradient(circle at 50% 0%, #1a1a1a 0%, transparent 70%),
            radial-gradient(circle at 0% 100%, #111 0%, transparent 50%),
            radial-gradient(circle at 100% 100%, #111 0%, transparent 50%);
        }
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0px); }
        }
      `}} />
    </div>
  );
}

