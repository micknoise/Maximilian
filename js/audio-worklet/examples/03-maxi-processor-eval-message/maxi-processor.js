import Maximilian from '../../build/maximilian.wasmmodule.js';
/**
 * The main Maxi Audio wrapper with a WASM-powered AudioWorkletProcessor.
 *
 * @class MaxiProcessor
 * @extends AudioWorkletProcessor
 */
class MaxiProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{
        name: 'gain',
        defaultValue: 0.5
      },
      {
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
    this.sampleIndex = 1;

    this.mySine = new Maximilian.maxiOsc();
    this.myOtherSine = new Maximilian.maxiOsc();
    this.myLastSine = new Maximilian.maxiOsc();

    this.signal = eval(`() => { return this.mySine.sinewave(440)}`);

    this.port.onmessage = event => { // message port async handler

      try {
        // console.log("Receving message in Worklet evaluation: ");
        for (const key in event.data) { // Event from WebAudio Node scope packs JSON object
          this[key] = event.data[key]; // De-structure into local props
        }
        this.eval = eval(this.eval); // Make a function out of the synth-def string tranferred from the WebAudio Node scope
        this.eval(); // Evaluate the validity of the function before accepting it as the signal. If it is not valid, it will throw a TypeError here, and this.signal will not change
        this.signal = this.eval; // If function is valid, assign it to this.signal() function. this.signal() wil be used in the process() loop
      } // eval a property function, need to check if it changed
      catch (err) {
        if (err instanceof TypeError) {
          console.log("Type Error in worklet evaluation: " + err.name + " – " + err.message);
        } else {
          console.log("Error in worklet evaluation: " + typeof (err) + " – " + err.message);
        }
      }
    };
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
          const gain = parameters.gain.length === 1? parameters.gain[0] : parameters.gain[i]; // if gain is constant, lenght === 1, gain[0]; if gain is varying, lenght === 128, gain[i]
          outputChannel[i] = this.signal() * gain;
        }
      }
    }
    return true;
  }
};

registerProcessor("maxi-processor", MaxiProcessor);