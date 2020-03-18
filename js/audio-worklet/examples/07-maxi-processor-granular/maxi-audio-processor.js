import Maximilian from '../../build/maximilian.wasmmodule.js';


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

    this.port.onmessage = (event) => {
      console.log(event.data);
    };

    this.maxiAudio = new Maximilian.maxiAudio();
    this.samplePlayer = new Maximilian.maxiSample();
    this.stretch = new Maximilian.maxiPitchStretch();
    // var grains = new Module.maxiTimestretch();
    // var shift = new Module.maxiPitchShift();

    var speed = 0.5;

    maxiAudio.loadSample("beat2.wav", samplePlayer);

    var grainsSet = false;
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

            // this is necessary as file loading may not complete in setup
          if(samplePlayer.isReady()){

            // set grainPlayer sample
            if(!grainsSet){
              stretch.setSample(samplePlayer);
              // shift.setSample(samplePlayer);
              grainsSet = true;
            }
            outputChannel[i] =  stretch.play(1, 2,0.1, 2, 0) * amp;
        }
      }
    }
    return true;
  }

};

registerProcessor("maxi-audio-processor", MaxiAudioProcessor);
