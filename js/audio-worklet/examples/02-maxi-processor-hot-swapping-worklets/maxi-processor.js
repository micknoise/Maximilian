import Maximilian from "../../build/maximilian.wasmmodule.js";
/**
 * The main Maxi Audio wrapper with a WASM-powered AudioWorkletProcessor.
 *
 * @class MaxiProcessor
 * @extends AudioWorkletProcessor
 */
class MaxiProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  /**
   * @constructor
   */
  constructor() {
    super();
    this.sampleRate = 44100;

    this.port.onmessage = (event) => {
      console.log(event.data);
    };

    this.mySine = new Maximilian.maxiOsc();
    this.myOtherSine = new Maximilian.maxiOsc();
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
        for (let i = 0; i < outputChannel.length; ++i) {
          const gain = parameters.gain.length === 1 ? parameters.gain[0] : parameters.gain[i]
          outputChannel[i] = this.mySine.sawn(60) * this.myOtherSine.sinewave(0.4) * gain;
        }
      }
    }
    return true;

  }

};

registerProcessor("maxi-processor", MaxiProcessor);
