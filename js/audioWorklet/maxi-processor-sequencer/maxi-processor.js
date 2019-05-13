import Module from '../build/maximilian.wasmmodule.js';

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

    this.tempo = 120.0; // tempo (in beats per minute);
    this.secondsPerBeat = (60.0 / this.tempo);
    this.counterTimeValue = (this.secondsPerBeat / 4); //___16th note

    this.oldClock = 0;
    this.phase = 0;

    this.maxiAudio = new Module.maxiAudio();
    this.clock = new Module.maxiOsc();
    this.kick = new Module.maxiSample();
    this.snare = new Module.maxiSample();
    this.closedHat = new Module.maxiSample();
    this.openHat = new Module.maxiSample();

    // this.maxiAudio.loadSample("./909b.wav", this.kick);
    // this.maxiAudio.loadSample("./909.wav", this.snare);
    // this.maxiAudio.loadSample("./909closed.wav", this.closedHat);
    // this.maxiAudio.loadSample("./909open.wav", this.openHat);

    // this.kick.setSample(this.generateNoiseBuffer(44100));
    // this.snare.setSample(this.generateNoiseBuffer(44100));
    // this.closedHat.setSample(this.generateNoiseBuffer(44100));
    // this.openHat.setSample(this.generateNoiseBuffer(44100));


    // this.snare.setSample(this.generateNoiseBuffer(44100));
    // this.closedHat.setSample(this.generateNoiseBuffer(44100));
    // this.openHat.setSample(this.generateNoiseBuffer(44100));


    this.initialised = false;


    this.sequence = "kkk";

    // this.sequence = "kc kc k scos";

    this.port.onmessage = event => { // message port async handler
      for (const key in event.data) { // event from node scope packs JSON object
        this[key] = event.data[key]; // get this.audioBlob into local props
        console.log("key: " + key);
        console.log("key: " + this[key]);
      }

      // this.kick.setSample(this.translateBlobToBuffer(this.audioBlob));
      this.kick.setSample(this.translateFloat32ArrayToBuffer(this.audioArray));
    };
  }

  //Deprecated
  generateNoiseBuffer(length) {
    var bufferData = new Module.VectorDouble();
    for (var n = 0; n < length; n++) {
      bufferData.push_back(Math.random(1));
    }
    return bufferData;
  }

  //Deprecated
  translateBlobToBuffer(blob) {

    let arrayBuffer = null;
    let float32Array = null;
    var fileReader = new FileReader();
    fileReader.onload = function (event) {
      arrayBuffer = event.target.result;
      float32Array = new Float32Array(arrayBuffer);
    };
    fileReader.readAsArrayBuffer(blob);
    let audioFloat32Array = fileReader.result;
    var maxiSampleBufferData = new Module.VectorDouble();
    for (var i = 0; i < audioFloat32Array.length; i++) {
      maxiSampleBufferData.push_back(audioFloat32Array[i]);
    }
    return maxiSampleBufferData;
  }

  translateFloat32ArrayToBuffer(audioFloat32Array) {

    var maxiSampleBufferData = new Module.VectorDouble();
    for (var i = 0; i < audioFloat32Array.length; i++) {
      maxiSampleBufferData.push_back(audioFloat32Array[i]);
    }
    return maxiSampleBufferData;
  }


  loopPlayer() {

    let now = this.clock.sinewave(7);

    if (this.oldClock <= 0 && now > 0) {

      var sampleSelector = this.sequence[this.phase++ % this.sequence.length];

      switch (sampleSelector) {
        case "k":
          this.kick.trigger();
          break;
        case "s":
          this.snare.trigger();
          break;
        case "o":
          this.openHat.trigger();
          break;
        case "c":
          this.closedHat.trigger();
          break;
        default:
          this.kick.trigger();
      }
    }

    this.oldClock = now;

    var w = 0.0;

    if (this.kick.isReady()) {
      w += this.kick.playOnce();
    }
    if (this.snare.isReady()) {
      w += this.snare.playOnce();
    }
    if (this.closedHat.isReady()) {
      w += this.closedHat.playOnce();
    }
    if (this.openHat.isReady()) {
      w += this.openHat.playOnce();
    }
    return w * 0.5;
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
        } else { // If the user specified a channel configuration for his DAC
          if (this.DAC[channel] === undefined) // If user-specified channel configuration is invalid (e.g. channel 7 in a 5.1 layout)
            break;
          else {
            if (output[this.DAC[channel]] !== undefined) { // If user-specified channel configuration is valid
              outputChannel = output[this.DAC[channel]];
            } else { // If user-specified channel configuration is a subset of the total number of channel skip loop iterations until total number
              continue;
            }
          }
        }

        if (parameters.gain.length === 1) { // if gain is constant, lenght === 1, gain[0]
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.loopPlayer() * this.sampleIndex / this.sampleRate * parameters.gain[0];
          }
        } else { // if gain is varying, lenght === 128, gain[i] for each sample of the render quantum
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.loopPlayer() * this.sampleIndex / this.sampleRate * parameters.gain[i];
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