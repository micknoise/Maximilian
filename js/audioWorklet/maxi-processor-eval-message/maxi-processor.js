import Module from './maximilian.wasmmodule.js';

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

    this.mySine = new Module.maxiOsc();
    this.myOtherSine = new Module.maxiOsc();
    
    this.evalExpression = eval(`() => { return this.mySine.square(30)}`);

    this.port.onmessage = (event) => {
      this.evalExpression = eval(event.data);
      console.log(this.evalExpression);
    }
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
        const gain = parameters.gain;
        const isConstant = gain.length === 1
        let outputChannel = output[channelId];

        for (let i = 0; i < outputChannel.length; ++i) {
          const amp = isConstant ? gain[0] : gain[i];

          // outputChannel[i] = eval(`() => { return this.mySine.sawn(60) * this.myOtherSine.sinewave(0.4)}`;
          // outputChannel[i] = (this.mySine.sawn(60) * this.myOtherSine.sinewave(0.4)) * amp;
          outputChannel[i] = this.evalExpression() * amp;
        }
      }
    }
    return true;
  }

};

registerProcessor("maxi-processor", MaxiProcessor);
