import React, { useState, useEffect } from 'react';
import { AvatarDisplay } from './components/AvatarDisplay';
import { ChatInterface } from './components/ChatInterface';
import { useLiveAPI } from './hooks/useLiveAPI';
import { useGroqAPI } from './hooks/useGroqAPI';

function App() {
  const [useGroq, setUseGroq] = useState(false);
  const geminiAPI = useLiveAPI();
  const groqAPI = useGroqAPI();

  const api = useGroq ? groqAPI : geminiAPI;

  // Automatically switch to Groq if Gemini hits a quota error
  useEffect(() => {
    if (geminiAPI.error?.toLowerCase().includes('quota')) {
      console.warn("Gemini Quota exceeded. Attempting to switch to Groq backend...");
      // We don't automatically switch mid-stream as it might be jarring, 
      // but we could set a flag to allow the user or the next connection.
    }
  }, [geminiAPI.error]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-sans">
      <AvatarDisplay 
        state={api.isSpeaking ? 'speaking' : 'idle'} 
        volume={api.volume} 
      />
      
      <div className="relative z-50 pointer-events-none">
        <ChatInterface 
          liveAPI={api} 
          isGroqEnabled={useGroq}
          onToggleGroq={() => {
            api.stop();
            setUseGroq(!useGroq);
          }}
        />
      </div>
    </div>
  );
}

export default App;
