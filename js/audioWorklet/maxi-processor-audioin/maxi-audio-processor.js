import Module from './maxi-audio.wasmmodule.js';

/**
 * The main Maxi Audio wrapper with a WASM-powered AudioWorkletProcessor.
 *
 * @class MaxiAudioProcessor
 * @extends AudioWorkletProcessor
 */
class MaxiAudioProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  /**
   * @constructor
   */
  constructor() {
    super();
    this.sampleRate = 44100;
    this.sampleIndex = 0;
    this.port.onmessage = (event) => {
      console.log(event.data);
    };
    this.osc = new Module.maxiOsc();
  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    const outputsLength = outputs.length;
    for (let outputId = 0; outputId < outputsLength; ++outputId) {
      let output = outputs[outputId];
      let input = inputs[outputId];
      const channelLenght = output.length;
      for (let channelId = 0; channelId < channelLenght; ++channelId) {
        let inputChannel = input[channelId];
        let outputChannel = output[channelId];
        if(parameters.gain === 1) {
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = inputChannel[i] * this.osc.sinewave(900) * this.sampleIndex/this.sampleRate * parameters.gain[0];
          }
        }
        else {
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = inputChannel[i] * this.osc.sinewave(900) * this.sampleIndex/this.sampleRate * parameters.gain[i];
          }
        }
        this.sampleIndex++;
      }
    }
    return true;
  }

};

registerProcessor("maxi-audio-processor", MaxiAudioProcessor);
