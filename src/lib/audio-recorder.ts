/**
 * Recorder for PCM audio data from microphone.
 */
export class AudioRecorder {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;

  constructor(private onAudioData: (base64Data: string) => void) {}

  async start() {
    try {
      console.log("AudioRecorder: Requesting microphone access...");
      
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support microphone access.");
      }

      // Try with constraints first, fallback to simple audio: true
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
      } catch (innerErr) {
        console.warn("AudioRecorder: Preferred constraints failed, trying basic audio access:", innerErr);
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      console.log("AudioRecorder: Microphone access granted.");
      
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      
      // In some browsers, context starts in 'suspended' state and needs resume()
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.source = this.context.createMediaStreamSource(this.stream);
      
      // ScriptProcessor is deprecated but easiest for a quick implementation without worklets complexity
      this.processor = this.context.createScriptProcessor(2048, 1, 1);
      
      this.source.connect(this.processor);
      this.processor.connect(this.context.destination);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to PCM16
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        this.onAudioData(base64Data);
      };
    } catch (err) {
      console.error("AudioRecorder error:", err);
      throw err;
    }
  }

  stop() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== 'closed') {
      this.context.close();
    }
  }
}
