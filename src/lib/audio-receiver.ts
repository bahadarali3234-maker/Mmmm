/**
 * Receiver for PCM audio data to be played back using Web Audio API.
 */
export class AudioReceiver {
  private context: AudioContext;
  private analyser: AnalyserNode;
  private nextStartTime: number = 0;
  private sampleRate: number;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  public onPlaybackStarted?: () => void;
  public onPlaybackEnded?: () => void;
  public onVolumeUpdate?: (volume: number) => void;

  constructor(sampleRate: number = 24000) {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate,
    });
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.context.destination);
    this.sampleRate = sampleRate;
  }

  async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.startVolumeAnalysis();
  }

  private startVolumeAnalysis() {
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const checkVolume = () => {
      if (this.context.state === 'closed') return;
      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
      if (this.onVolumeUpdate) {
        this.onVolumeUpdate(average / 128); // Normalize 0-2
      }
      requestAnimationFrame(checkVolume);
    };
    checkVolume();
  }

  playAudioChunk(base64Data: string) {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
    }

    const buffer = this.context.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);

    const startTime = Math.max(this.context.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    if (this.activeSources.size === 0 && this.onPlaybackStarted) {
      this.onPlaybackStarted();
    }

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.onPlaybackEnded) {
        this.onPlaybackEnded();
      }
    };
  }

  stopAll() {
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already stopped
      }
    });
    this.activeSources.clear();
    this.nextStartTime = this.context.currentTime;
    if (this.onPlaybackEnded) {
      this.onPlaybackEnded();
    }
  }

  close() {
    this.stopAll();
    if (this.context.state !== 'closed') {
      this.context.close();
    }
  }
}
