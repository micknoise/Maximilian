import Module from './maximilian.wasmmodule.js';

/**
 * The main Maxi Audio wrapper with a WASM-powered AudioWorkletProcessor.
 *
 * @class MaxiProcessor
 * @extends AudioWorkletProcessor
 */
class MaxiProcessor extends AudioWorkletProcessor {

  /**
   * @getter
   */
  static get parameterDescriptors() {
    return [
      { name: 'gain', defaultValue: 0.1 },
      { name: 'frequency', defaultValue: 440.0 }
    ];
  }

  /**
   * @constructor
   */
  constructor() {
    super();
    this.sampleRate   = 44100;
    this.sampleIndex  = 0;

    this.type         = 'sine';

    this.port.onmessage = event => {
      for (const key in event.data) {
        this[key] = event.data[key];
      }
    };

    this.osc = new Module.maxiOsc();
  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    const outputsLength = outputs.length;

    console.log(`gain: ` + parameters.gain[0]);
    for (let outputId = 0; outputId < outputsLength; ++outputId) {
      let output = outputs[outputId];
      const channelLenght = output.length;
      for (let channelId = 0; channelId < channelLenght; ++channelId) {
        let outputChannel = output[channelId];
        if (parameters.gain.length === 1) { // either gain[0] if constant,
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = this.osc.triangle(400) * this.sampleIndex/44100 * parameters.gain[0];
            // outputChannel[i] = Math.sin(2 * Math.PI * 400 * this.sampleIndex/44100) * parameters.gain[0];
            this.sampleIndex++;
          }
        }
        else {
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = this.osc.triangle(400) * this.sampleIndex/44100 * parameters.gain[i];
            // outputChannel[i] = Math.sin(2 * Math.PI * 400 * this.sampleIndex/44100) * parameters.gain[i];
            this.sampleIndex++;
          }
        }
      }
    }
    return true;

  }

};

registerProcessor("maxi-processor", MaxiProcessor);
