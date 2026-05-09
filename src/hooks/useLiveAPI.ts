import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { getAI } from '../lib/gemini';
import { AudioReceiver } from '../lib/audio-receiver';
import { AudioRecorder } from '../lib/audio-recorder';

export function useLiveAPI() {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [isModelSpeaking, setIsModelSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [transcripts, setTranscripts] = useState<{ role: 'user' | 'model', text: string, timestamp: number }[]>([]);
    
    const sessionRef = useRef<any>(null);
    const audioReceiverRef = useRef<AudioReceiver | null>(null);
    const audioRecorderRef = useRef<AudioRecorder | null>(null);
    const [toolCall, setToolCall] = useState<any>(null);

    const cleanup = useCallback(() => {
        audioRecorderRef.current?.stop();
        audioRecorderRef.current = null;
        audioReceiverRef.current?.close();
        audioReceiverRef.current = null;
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
    }, []);

    const connect = useCallback(async (systemInstruction: string, tools?: any[], voiceName: string = "Zephyr") => {
        cleanup();
        setStatus('connecting');
        setError(null);
        
        try {
            const ai = getAI();
            
            audioReceiverRef.current = new AudioReceiver(24000);
            await audioReceiverRef.current.resume();
 
            const sessionPromise = ai.live.connect({
                model: "gemini-3.1-flash-live-preview",
                callbacks: {
                    onopen: async () => {
                        setStatus('connected');
                        
                        audioRecorderRef.current = new AudioRecorder((base64Data) => {
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({
                                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                                });
                            });
                        });
                        await audioRecorderRef.current.start();
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.modelTurn?.parts) {
                            setIsModelSpeaking(true);
                            for (const part of message.serverContent.modelTurn.parts) {
                                if (part.inlineData?.data) {
                                    audioReceiverRef.current?.playAudioChunk(part.inlineData.data);
                                }
                            }
                        }
 
                        // Handle Transcriptions
                        if (message.serverContent?.modelTurn?.parts) {
                            const text = message.serverContent.modelTurn.parts
                                .map(p => p.text || '')
                                .join('')
                                .trim();
                            if (text) {
                                setTranscripts(prev => [...prev, { role: 'model', text, timestamp: Date.now() }]);
                            }
                        }
 
                        if ((message as any).outputAudioTranscription) {
                            const text = (message as any).outputAudioTranscription.text;
                            if (text) {
                                setTranscripts(prev => [...prev, { role: 'model', text, timestamp: Date.now() }]);
                            }
                        }
 
                        if ((message as any).inputAudioTranscription) {
                            const transcription = (message as any).inputAudioTranscription;
                            if (transcription.done && transcription.text) {
                                setTranscripts(prev => [...prev, { role: 'user', text: transcription.text, timestamp: Date.now() }]);
                            }
                        }
 
                        if (message.toolCall) {
                            setToolCall(message.toolCall);
                        }
 
                        if (message.serverContent?.interrupted) {
                            audioReceiverRef.current?.stopAll();
                            setIsModelSpeaking(false);
                        }
 
                        if (message.serverContent?.turnComplete) {
                           setIsModelSpeaking(false);
                        }
                    },
                    onclose: () => {
                        setStatus('idle');
                        cleanup();
                    },
                    onerror: (err) => {
                        setError(err.message || "Connection failed");
                        setStatus('error');
                        cleanup();
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                    },
                    systemInstruction,
                    tools: tools || [],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
            });

            sessionRef.current = await sessionPromise;
        } catch (err: any) {
            setError(err.message || "Failed to initialize session");
            setStatus('error');
        }
    }, [cleanup]);

    const sendToolResponse = useCallback((toolResponses: any[]) => {
        if (sessionRef.current && status === 'connected') {
            sessionRef.current.sendToolResponse({ functionResponses: toolResponses });
        }
    }, [status]);

    const sendVideoFrame = useCallback((base64Data: string) => {
        if (sessionRef.current && status === 'connected') {
            sessionRef.current.sendRealtimeInput({
                video: { data: base64Data, mimeType: 'image/jpeg' }
            });
        }
    }, [status]);

    const disconnect = useCallback(() => {
        cleanup();
        setStatus('idle');
    }, [cleanup]);

    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return { 
        connected: status === 'connected', 
        status, 
        isModelSpeaking, 
        toolCall, 
        error, 
        transcripts,
        connect, 
        disconnect, 
        sendVideoFrame, 
        sendToolResponse 
    };
}
