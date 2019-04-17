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
  static get parameterDescriptors() { // TODO: parameters are static? can we not change this map with a setter?
    return [
      { name: 'gain', defaultValue: 0.2 },
      { name: 'frequency', defaultValue: 440.0 } // NOTE: we might want frequency as a param from async message port
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


    // TODO: Implement
    this.osc = new Module.maxiOsc();
    this.oOsc = new Module.maxiOsc();
    this.aOsc = new Module.maxiOsc();

    this.signal = () => { return this.osc.sinewave(440) };

    this.port.onmessage = event => {  // message port async handler
      for (const key in event.data) { // event from node scope packs JSON object
        this[key] = event.data[key];  // de-structure into local props
      }
      try{ this.signal = eval(this.eval); } // eval a property function
      catch(err) {
        console.log("Error in Worklet evaluation: " + err);
        this.signal = () => { return this.osc.sinewave(440) };
      }
    };
  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    // TODO:
    // sine(20) >> DAC
    // sine(400) >> DAC(0)
    // sine(2349) >> DAC(0,4,5)

    // if(this.DAC !== undefined)
    //   this.DAC.map(channel => { outputChannel[channel] = evalExpression})

    const outputsLength = outputs.length;
    // DEBUG:
    // console.log(`gain: ` + parameters.gain[0]);

    // for (let outputId = 0; outputId < outputsLength; ++outputId) {
      // let output = outputs[outputId];
      let output = outputs[0];
      const channelLenght = output.length;
      for (let channelId = 0; channelId < channelLenght; ++channelId) {
        let outputChannel = output[0];
        // let outputChannel = output[channelId];
        if (parameters.gain.length === 1) { // if gain is constant, lenght === 1, gain[0]
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = this.signal() * this.sampleIndex/this.sampleRate * parameters.gain[0];
          }
        }
        else { // if gain is varying, lenght === 128, gain[i]
          for (let i = 0; i < outputChannel.length; ++i) {
            outputChannel[i] = this.signal() * this.sampleIndex/this.sampleRate * parameters.gain[i];
          }
        }
        // DEBUG:
        console.log(`inputs ${inputs.length}, outputsLen ${outputs.length}, outputLen ${output.length}, outputChannelLen ${outputChannel.length}`);
      }
      this.sampleIndex++;
    // }
    return true;
  }
};

registerProcessor("maxi-processor", MaxiProcessor);
