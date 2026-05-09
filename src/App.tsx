import React, { useState } from 'react';
import { AvatarDisplay } from './components/AvatarDisplay';
import { ChatInterface } from './components/ChatInterface';
import { useLiveAPI } from './hooks/useLiveAPI';

function App() {
  const liveAPI = useLiveAPI();

  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-sans">
      <AvatarDisplay 
        state={liveAPI.isSpeaking ? 'speaking' : 'idle'} 
        volume={liveAPI.volume} 
      />
      
      <div className="relative z-50 pointer-events-none">
        <ChatInterface liveAPI={liveAPI} />
      </div>
    </div>
  );
}

export default App;
