import { useState, useCallback, useRef, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export function useGroqAPI() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{role: string, content: string}[]>([]);

  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'ur-PK'; // Default to Urdu for Zara

        recognitionRef.current.onresult = (event: any) => {
          const current = event.resultIndex;
          const result = event.results[current];
          const text = result[0].transcript;
          setTranscript(text);

          if (result.isFinal) {
            sendMessage(text);
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech Recognition Error:', event.error);
        };
      }
      synthesisRef.current = window.speechSynthesis;
    }
  }, []);

  const sendMessage = async (message: string) => {
    try {
      // Save to Firebase memory asynchronously if it looks like a fact
      if (message.length > 10 && (message.includes('mera naam') || message.includes('my name') || message.includes('pasand'))) {
        const docId = auth.currentUser?.uid || 'guest_user';
        const docRef = doc(db, 'user_profiles', docId);
        getDoc(docRef).then(snap => {
          const old = snap.exists() ? snap.data().memory || '' : '';
          setDoc(docRef, { memory: old + '\n' + message }, { merge: true });
        });
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history })
      });
      const data = await res.json();
      
      if (data.response) {
        setHistory(prev => [...prev.slice(-10), // Keep last 10 turns for context
          { role: 'user', content: message },
          { role: 'assistant', content: data.response }
        ]);
        speak(data.response);
      }
    } catch (err) {
      console.error('Groq Send Error:', err);
      setError('Groq communication failed.');
    }
  };

  const speak = (text: string) => {
    if (!synthesisRef.current) return;

    // Cancel existing speech
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find a female Urdu/Hindi voice
    const voices = synthesisRef.current.getVoices();
    const zaraVoice = voices.find(v => v.lang.includes('ur') || v.lang.includes('hi')) || voices[0];
    if (zaraVoice) utterance.voice = zaraVoice;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    synthesisRef.current.speak(utterance);
  };

  const connect = useCallback(() => {
    setIsConnected(true);
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
    // Greeting
    speak("Salam! Main Zara hoon. Gemini system busy hai, toh main backend se Groq ki madad le rahi hoon. Aap kaise hain?");
  }, []);

  const stop = useCallback(() => {
    setIsConnected(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }
    setIsSpeaking(false);
  }, []);

  return {
    isConnected,
    isSpeaking,
    transcript,
    error,
    connect,
    stop,
    // Add dummy state for common interface compatibility
    isMuted: false,
    isCameraOn: false,
    isScreenSharing: false,
    toggleMute: () => {},
    toggleCamera: () => {},
    toggleScreenShare: () => {},
    stream: null,
    volume: 0,
    mode: 'groq'
  };
}
