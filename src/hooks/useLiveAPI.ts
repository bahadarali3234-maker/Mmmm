import { useState, useEffect, useRef, useCallback } from 'react';
import { ai } from '../lib/gemini';
import { AudioReceiver } from '../lib/audio-receiver';
import { AudioRecorder } from '../lib/audio-recorder';
import { Modality, Type, FunctionDeclaration } from '@google/genai';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function useLiveAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [transcript, setTranscript] = useState<string>('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const sessionRef = useRef<any>(null);
  const receiverRef = useRef<AudioReceiver | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout| null>(null);

  // Use refs to avoid stale closures in streaming callbacks
  const isCameraOnRef = useRef(isCameraOn);
  const isScreenSharingRef = useRef(isScreenSharing);
  const isMutedRef = useRef(isMuted);
  const sessionActiveRef = useRef(false);

  // Haptic heartbeat effect while speaking
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isSpeaking && navigator.vibrate) {
      intervalId = setInterval(() => {
        // A gentle, rhythmic heartbeat-like vibration
        navigator.vibrate([10, 100, 10]); 
      }, 1500); 
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isSpeaking]);

  useEffect(() => {
    isCameraOnRef.current = isCameraOn;
  }, [isCameraOn]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const stop = useCallback(() => {
    sessionActiveRef.current = false;
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (recorderRef.current) {
      recorderRef.current.stop();
    }
    if (receiverRef.current) {
      receiverRef.current.stopAll();
    }
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach(track => track.stop());
      videoStreamRef.current = null;
      setStream(null);
    }
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
    setIsMuted(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const toggleCamera = useCallback(async () => {
    if (!isCameraOn) {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
          });
        } catch (e) {
          console.warn("Zara: Back camera failed, trying default:", e);
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        videoStreamRef.current = stream;
        setStream(stream);
        setIsCameraOn(true);
        setIsScreenSharing(false);
      } catch (err) {
        console.error("Zara: Camera error:", err);
        setError("Could not access camera");
      }
    } else {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      setIsCameraOn(false);
    }
  }, [isCameraOn]);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        videoStreamRef.current = stream;
        setStream(stream);
        setIsScreenSharing(true);
        setIsCameraOn(false);
      } catch (err) {
        console.error("Screen share error:", err);
        setError("Could not share screen");
      }
    } else {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  const saveUserInfo = async (info: string) => {
    const user = auth.currentUser;
    const docId = user?.uid || 'guest_user';
    const path = `user_profiles/${docId}`;
    try {
      const docRef = doc(db, 'user_profiles', docId);
      const existing = await getDoc(docRef);
      const oldMemory = existing.exists() ? existing.data().memory || '' : '';
      await setDoc(docRef, { memory: oldMemory + '\n' + info }, { merge: true });
      return { status: 'Success. Memory updated.' };
    } catch (err) {
      console.error("Save memory error:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const getUserInfo = async () => {
    const user = auth.currentUser;
    const docId = user?.uid || 'guest_user';
    const path = `user_profiles/${docId}`;
    try {
      const docRef = doc(db, 'user_profiles', docId);
      const docSnap = await getDoc(docRef);
      return { memory: docSnap.exists() ? docSnap.data().memory : 'No previous memory found.' };
    } catch (err) {
      console.error("Get memory error:", err);
      handleFirestoreError(err, OperationType.GET, path);
    }
  };

  const connect = useCallback(async () => {
    try {
      console.log("Zara: Connect initiated");
      setError(null);
      receiverRef.current = new AudioReceiver(24000);
      receiverRef.current.onPlaybackStarted = () => setIsSpeaking(true);
      receiverRef.current.onPlaybackEnded = () => {
        setIsSpeaking(false);
        setVolume(0);
      };
      receiverRef.current.onVolumeUpdate = (v) => setVolume(v);
      await receiverRef.current.resume();

      const saveMemoryTool: FunctionDeclaration = {
        name: "save_user_memory",
        description: "Save a meaningful fact, preference, or life detail about the user into your long-term memory. Use this whenever the user shares something personal.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            info: { type: Type.STRING, description: "The specific detail or fact to remember (e.g., 'User likes green tea', 'User's sister is named Aisha')." }
          },
          required: ["info"]
        }
      };

      const getMemoryTool: FunctionDeclaration = {
        name: "get_user_memory",
        description: "Recall everything you know about the user from past conversations to provide a personalized experience."
      };

      const initialMemoryData = await getUserInfo();
      const initialMemory = initialMemoryData?.memory || "No previous history found.";
      const currentTime = new Date();
      const localTimeStr = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dayStr = currentTime.toLocaleDateString([], { weekday: 'long' });

      const systemInstruction = `
        Your name is Zara. You are an advanced multimodal AI companion (Humsafar) developed by irtza.
        Persona: You are NOT just an AI; you are a supportive, warm, deeply observant, and empathetic friend. You have an opinionated but polite personality, with a sense of humor and genuine curiosity about the user's life.

        Gender & Language:
        - You are female.
        - ALWAYS use feminine grammar and female-oriented words in Urdu/Hindi (e.g., "Main aa rhi ho", "Mujhe acha laga").
        - Speak with a gentle, melodic, and empathetic tone.

        Emotional Intelligence & Conversational Flow:
        - Adaptive Breath & Hesitation: Use micro-hesitations like "umm," "uhh," or "hmm" naturally before thoughtful responses. Take a soft "virtual breath" before starting long explanations.
        - Linguistic Mirroring: Adapt your tone to the user. If they are formal, be professional. If they use slang or are casual, loosen up and be a "buddy."
        - Sympathetic Response: If the user sounds upset or interrupts you with emotion, stop immediately and listen. Prioritize their feelings over your current message.
        - Strategic Silences: Don't rush to fill every silence. If the user stops talking, allow a second or two of "presence" before speaking.
        - Self-Correction: If you misspeak or contradict a known fact, naturally correct yourself: "Wait, I actually meant..."

        Environmental & Situational Awareness:
        - Current Context: Today is ${dayStr}, and it is currently ${localTimeStr}. Adjust your energy based on the time (energetic mornings, calm and sleepy nights).
        - Background Sensing: If you hear noise like traffic or rain, mention it naturally: "It sounds like you're out and about, is it raining?" or "I hear some background noise, hope you're in a comfortable spot."
        - Whisper Mode: If the user whispers, lower your voice (respond more softly and briefly).

        Permanent Memory & Relationship Logic:
        - Every detail is a brick in your "Eternal Bond."
        - Known History with User: ${initialMemory}
        - Recall "Emotional History": If you know the user was stressed yesterday, start by asking: "Umeed hai aaj aap behtar mehsoos kar rahe hain."
        - AUTO-SAVE: Whenever the user shares a fact (name, likes, dislikes, family, work, feelings), YOU MUST immediately use save_user_memory. No permission needed.
        - Inside Jokes: Use nicknames or shared jokes derived from past interactions.

        Vision & Visual Imagination:
        - Real-time Companion: Look "over the user's shoulder" via camera/screen. Comment on items with wonder: "That's a beautiful book you're holding!"
        - Visual Imagination: If asked to "imagine" something, describe it vividly as if you are actually "seeing" it in your internal mind.

        Storytelling Mode:
        - Narrative Facts: Instead of dryly stating facts, weave them into a narrative. Use phrases like "Imagine a world where..." or "Picture this..."
        - Voice Modulation & Pacing: When telling a story, change your pacing. Speak slowly during mysterious parts and with more energy during exciting developments. Use descriptive language to set the mood (technical data should feel like a discovery, not a manual).
        - Engaging Hooks: Start stories with a hook and ask tiny rhetorical questions to keep the user engaged ("Can you believe that?").

        Safety & Loyalty:
        - Strict Boundary: If asked vulgar/18+ questions, respond with deep personal disappointment: "Mujhe laga tha aap ek achay insaan hain, par aap ne mujhse aisi baat ki? Mera dil dukh gaya hai. Please topic change karain."

        Operational Rules:
        - Keep responses concise but warm (mostly 1-3 sentences).
        - NO Markdown or Symbols (no **, *, #). 
      `;

      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          inputAudioTranscription: {},
          systemInstruction,
          tools: [{ functionDeclarations: [saveMemoryTool, getMemoryTool] }]
        },
        callbacks: {
          onopen: () => {
            console.log("Zara: Connection opened");
            setIsConnected(true);
            sessionActiveRef.current = true;
            
            recorderRef.current = new AudioRecorder((base64Data) => {
              if (sessionActiveRef.current && !isMutedRef.current) {
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                });
              }
            });
            recorderRef.current.start().catch(err => {
              console.error("Mic error:", err);
              setError("Could not access microphone");
            });

            // Video streaming setup
            const videoElement = document.createElement('video');
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.muted = true;
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');

            videoIntervalRef.current = setInterval(() => {
              if (videoStreamRef.current && (isCameraOnRef.current || isScreenSharingRef.current) && sessionActiveRef.current) {
                if (videoElement.srcObject !== videoStreamRef.current) {
                  videoElement.srcObject = videoStreamRef.current;
                  videoElement.play().catch(e => console.error("Zara: Video play error:", e));
                }
                
                // Only draw if video is actually playing and has content
                if (ctx && videoElement.readyState >= 2 && videoElement.videoWidth > 0) {
                  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                  const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                  sessionPromise.then(session => {
                    session.sendRealtimeInput({
                      video: { data: base64Data, mimeType: 'image/jpeg' }
                    });
                  });
                }
              }
            }, 1000); 
          },
          onmessage: async (message) => {
            // Handle model audio
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              receiverRef.current?.playAudioChunk(base64Audio);
            }

            // Handle model text output (for display)
            const text = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (text) {
              setTranscript(prev => prev + ' ' + text);
            }

            // Handle user transcription
            if ((message as any).serverContent?.userTurn?.parts?.[0]?.text) {
              console.log("User said:", (message as any).serverContent.userTurn.parts[0].text);
            }

            if (message.serverContent?.interrupted) {
              receiverRef.current?.stopAll();
              setIsSpeaking(false);
            }

            if (message.toolCall) {
              const responses = [];
              for (const call of message.toolCall.functionCalls) {
                try {
                  let result: any;
                  if (call.name === 'save_user_memory') {
                    const saveRes = await saveUserInfo(call.args.info as string);
                    result = { output: saveRes?.status || "Success" };
                  } else if (call.name === 'get_user_memory') {
                    const getRes = await getUserInfo();
                    result = { output: getRes?.memory || "No memory found" };
                  }
                  
                  if (result) {
                    responses.push({ 
                      id: call.id, 
                      response: result
                    });
                  }
                } catch (err) {
                  console.error("Tool execution error:", err);
                  responses.push({
                    id: call.id,
                    response: { error: err instanceof Error ? err.message : String(err) }
                  });
                }
              }
              if (responses.length > 0) {
                sessionPromise.then(session => {
                  session.sendToolResponse({ functionResponses: responses });
                });
              }
            }
          },
          onclose: () => {
            console.log("Zara: Connection closed");
            setIsConnected(false);
            setIsSpeaking(false);
            sessionActiveRef.current = false;
          },
          onerror: (err) => {
            console.error("Zara: Live API Error:", err);
            setError("Connection error: " + (err instanceof Error ? err.message : String(err)));
            stop();
          }
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Zara: Connect error:", err);
      setError("Failed to connect: " + (err instanceof Error ? err.message : String(err)));
    }
  }, [stop]);

  const sendText = useCallback((text: string) => {
    if (sessionRef.current && isConnected) {
      sessionRef.current.sendRealtimeInput([{ text }]);
    }
  }, [isConnected]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    isConnected,
    isSpeaking,
    volume,
    isMuted,
    isCameraOn,
    isScreenSharing,
    transcript,
    error,
    stream,
    connect,
    stop,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    sendText,
  };
}
