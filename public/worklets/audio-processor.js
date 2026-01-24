// AudioWorkletProcessor pour remplacer ScriptProcessorNode
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input.length > 0) {
      const inputData = input[0];

      for (let i = 0; i < inputData.length; i++) {
        this.buffer[this.bufferIndex] = inputData[i];
        this.bufferIndex++;

        if (this.bufferIndex >= this.bufferSize) {
          // Convertir en Int16Array
          const int16 = new Int16Array(this.bufferSize);
          for (let j = 0; j < this.bufferSize; j++) {
            int16[j] = Math.max(-32768, Math.min(32767, this.buffer[j] * 32768));
          }

          // Envoyer les données au thread principal
          this.port.postMessage({
            audioData: new Uint8Array(int16.buffer)
          });

          this.bufferIndex = 0;
        }
      }
    }

    // Passer l'audio à travers
    if (output.length > 0) {
      for (let channel = 0; channel < output.length; channel++) {
        if (input[channel]) {
          output[channel].set(input[channel]);
        }
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
