import Maximilian from "../../build/maximilian.wasmmodule.js";
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
      { name: 'gain', defaultValue: 0.3 },
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

    // this.osc = new Module.maxiOsc();
    this.osc = new Maximilian.maxiOsc();
  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    const outputsLength = outputs.length;
    for (let outputId = 0; outputId < outputsLength; ++outputId) {
      let output = outputs[outputId];
      const channelLenght = output.length;
      for (let channelId = 0; channelId < channelLenght; ++channelId) {
        let outputChannel = output[channelId];
        const gain = parameters.gain.length === 1? parameters.gain[0] : parameters.gain[i];
        for (let i = 0; i < outputChannel.length; ++i) {
          outputChannel[i] = this.osc.sinewave(220) * gain;
        }
      }
    }
    return true;
  }
};

registerProcessor("maxi-processor", MaxiProcessor);
