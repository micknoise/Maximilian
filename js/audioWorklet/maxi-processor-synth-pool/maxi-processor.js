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
    return [{
        name: 'gain',
        defaultValue: 0.2
      },
      { // NOTE: Frequencies can be user-defined hence they should be param from async message port, NOT AudioParams
        name: 'frequency',
        defaultValue: 440.0
      }
    ];
  }

  /**
   * @constructor
   */
  constructor() {
    super();
    this.sampleRate = 44100;
    this.sampleIndex = 0;

    this.DAC = [0];

    // TODO: Implement Obj Pool pattern
    this.osc = new Module.maxiOsc();
    this.oOsc = new Module.maxiOsc();
    this.aOsc = new Module.maxiOsc();

    this.VCO1 = new Module.maxiOsc();
    this.VCO2 = new Module.maxiOsc();
    this.LFO1 = new Module.maxiOsc();
    this.LFO2 = new Module.maxiOsc();
    this.VCF = new Module.maxiFilter();
    this.ADSR = new Module.maxiEnv();
    this.timer = new Module.maxiOsc(); // this is the metronome
    this.currentCount;
    this.lastCount; // these values are used to check if we have a new beat this sample
    this.VCO1out;
    this.VCO2out;
    this.LFO1out;
    this.LFO2out;
    this.VCFout;
    this.ADSRout;

    this.ADSR.setAttack(1000);
    this.ADSR.setDecay(1);
    this.ADSR.setSustain(1);
    this.ADSR.setRelease(1000);


    this.signal = () => {
      return this.osc.sinewave(440);
    };

    this.port.onmessage = event => { // message port async handler
      for (const key in event.data) { // event from node scope packs JSON object
        this[key] = event.data[key]; // de-structure into local props
      }
      // TODO: explore SharedArrayBtuffer
      try {
        this.signal = eval(this.eval);
      } // eval a property function, need to check if it changed
      catch (err) {
        console.log("Error in Worklet evaluation: " + err);
        this.signal = () => {
          return this.osc.sinewave(440);
        };
      }
    };
  }

  monosynth(){

    this.currentCount = Math.round(this.timer.phasor(0.5) * this.sampleIndex / this.sampleRate);// set up a metronome ticking every 2 seconds

    if (this.lastCount != this.currentCount) { //if we have a new timer int this sample, play the sound
      this.ADSR.trigger = 1; //trigger envelope from start
      this.lastCount = 0;
    }
    this.ADSRout = this.ADSR.adsr(1.0, this.ADSR.trigger);
    this.LFO1out = this.LFO1.sinebuf(0.2);//this lfo is a sinewave at 0.2 hz
    this.VCO1out = this.VCO1.pulse(55, 0.6);//here's VCO1. it's a pulse wave at 55 hz, with a pulse width of 0.6
    this.VCO2out = this.VCO2.pulse(110 + this.LFO1out, 0.2);// pulse wave at 110hz with LFO modulation on the frequency, and width of 0.2
    this.VCFout  = this.VCF.lores((this.VCO1out + this.VCO2out) * 0.5, this.ADSRout * 10000, 10);// VCO's into the VCF, using the ADSR as the filter cutoff
    this.ADSR.trigger = 0;
    return this.VCFout * this.ADSRout;
  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    // DEBUG:
    // console.log(`gain: ` + parameters.gain[0]);
    const outputsLength = outputs.length; // NOTE: Typically we will be working with outputs[0] but we need to generalise

    for (let outputId = 0; outputId < outputsLength; ++outputId) {
      let output = outputs[outputId];

      for (let channel = 0; channel < output.length; ++channel) {
        let outputChannel;

        if (this.DAC === undefined || this.DAC.length === 0) {
          outputChannel = output[channel];
        }
        else { // If the user specified a channel configuration for his DAC
          if(this.DAC[channel] === undefined) // If user-specified channel configuration is invalid (e.g. channel 7 in a 5.1 layout)
            break;
          else
            if(output[this.DAC[channel]] !== undefined) { // If user-specified channel configuration is valid
              outputChannel = output[this.DAC[channel]];
            }
            else { // If user-specified channel configuration is a subset of the total number of channel skip loop iterations until total number
              continue;
            }
        }

        if (parameters.gain.length === 1) { // if gain is constant, lenght === 1, gain[0]
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.signal() * this.sampleIndex / this.sampleRate * parameters.gain[0];
          }
        } else { // if gain is varying, lenght === 128, gain[i] for each sample of the render quantum
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.signal() * this.sampleIndex / this.sampleRate * parameters.gain[i];
          }
        }
        // DEBUG:
        // console.log(`inputs ${inputs.length}, outputsLen ${outputs.length}, outputLen ${output.length}, outputChannelLen ${outputChannel.length}`);
      }
      this.sampleIndex++;
    }
    return true;
  }
}

registerProcessor("maxi-processor", MaxiProcessor);
