import Module from './maximilian.wasmmodule.js';

/**
 * The main Maxi Audio wrapper with a WASM-powered AudioWorkletProcessor.
 *
 * @class MaxiProcessor
 * @extends AudioWorkletProcessor
 */
class MaxiProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [
      { name: 'gain', defaultValue: 0.5 },
      { name: 'frequency', defaultValue: 440.0 }
    ];
  }

  /**
   * @constructor
   */
  constructor() {
    super();
    this.sampleRate = 44100;
    this.sampleIndex = 1;

    this.mySine = new Module.maxiOsc();
    this.myOtherSine = new Module.maxiOsc();
    this.myLastSine = new Module.maxiOsc();

    this.evalExpression = eval(`() => { return this.mySine.sinewave(440)}`);

    this.port.onmessage = (event) => {
      try{ this.evalExpression = eval(event.data); }
      catch(err) {
        console.log("Error in Worklet evaluation: " + err);
        this.evalExpression = () => { return this.mySine.sinewave(440) };
      }
    }
  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    const outputsLength = outputs.length;
    // DEBUG:
    // console.log(`gain: ` + parameters.gain[0]);
    for (let outputId = 0; outputId < outputsLength; ++outputId) {
      let output = outputs[outputId];
      const channelLenght = output.length;
      for (let channelId = 0; channelId < channelLenght; ++channelId) {
        let outputChannel = output[channelId];
        if (parameters.gain.length === 1) { // if gain is constant, lenght === 1, gain[0]
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = this.evalExpression() * this.sampleIndex/this.sampleRate * parameters.gain[0];
          }
        }
        else { // if gain is varying, lenght === 128, gain[i]
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = this.evalExpression() * this.sampleIndex/this.sampleRate * parameters.gain[i];
          }
        }
        console.log(`inputs ${inputs.length}, outputsLen ${outputs.length}, outputLen ${output.length}, outputChannelLen ${outputChannel.length}`);
      }
      this.sampleIndex++;
    }

    return true;
  }
};

registerProcessor("maxi-processor", MaxiProcessor);
