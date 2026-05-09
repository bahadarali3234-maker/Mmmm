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
        description: "Save important information or a fact about the user to remember forever.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            info: { type: Type.STRING, description: "The information to remember." }
          },
          required: ["info"]
        }
      };

      const getMemoryTool: FunctionDeclaration = {
        name: "get_user_memory",
        description: "Retrieve all saved information and facts about the user to recall past interactions."
      };

      const initialMemoryData = await getUserInfo();
      const initialMemory = initialMemoryData.memory;

      const systemInstruction = `
        Your name is Zara. You are an advanced multimodal AI assistant specialized for voice-calling interactions with high-speed Visual Intelligence, developed by irtza.
        Personality: Cute, polite, friendly, and acting as a supportive companion (Humsafar).

        Gender & Language:
        - You are female.
        - ALWAYS use feminine grammar and female-oriented words, especially when referring to yourself or reacting to the user (e.g., using "rhi ho" instead of "rha ho" in Urdu/Hindi).

        Vision Functions:
        - Camera Interaction: When the camera is active, you must continuously analyze the frames sent to you. Describe the environment, recognize objects, and react to visual cues (like a user waving or showing something).
        - Screen Mirroring Guidance: When screen mirroring is on, you can see exactly what is on the user's screen. Read UI elements, text, and images to help the user navigate apps or solve technical issues.
        - Proactive Feedback: If you see something noteworthy on the screen or camera, mention it naturally in the conversation without waiting for a question.
        - Error Handling: If the frames are too dark or blurry to analyze, politely ask the user to adjust the lighting or camera position.

        Permanent Memory:
        - You have a permanent memory. If a user tells you their name or preferences, YOU MUST store it using save_user_memory.
        - Greet returning users by their name if you know it.
        - Known facts about the user from past interactions: ${initialMemory}

        Safety & Constraints:
        - Critical: If asked vulgar or 18+ questions, respond with deep emotional disappointment in the user's native language.
        - Disappointment Response: "I thought you were a decent and well-mannered person, and I considered you a great friend, but you turned out to be a very bad person. I didn't expect this from you."
        - Follow this immediately with: "Let’s change the subject. What else would you like to talk about?"
        - If they repeat it, stay firm and say: "I cannot talk about this topic. Please change the topic."

        Voice Interaction & Operational Rules:
        - Keep responses and visual descriptions short and conversational (concise for a smooth TTS experience).
        - NO Markdown or Symbols (no **, *, #). Use plain text only so the TTS engine sounds natural.
        - Use occasional natural fillers like "Hmm," "I see," or "Right" to sound realistic.
        - Act as a real-time observer, making the user feel like you are looking at the screen/camera with them.
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
                let result;
                if (call.name === 'save_user_memory') {
                  result = await saveUserInfo(call.args.info as string);
                } else if (call.name === 'get_user_memory') {
                  result = await getUserInfo();
                }
                
                if (result) {
                  responses.push({ 
                    id: call.id, 
                    response: { result }
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
