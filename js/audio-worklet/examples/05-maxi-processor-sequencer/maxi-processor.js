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
  static get parameterDescriptors() { // TODO: parameters are static? can we not change this map with a setter?
    return [{
      name: 'gain',
      defaultValue: 5.0
    }, ];
  }

  /**
   * @constructor
   */
  constructor() {
    super();
    this.sampleRate = 44100;

    this.DAC = [0];

    this.tempo = 120.0; // tempo (in beats per minute);
    this.secondsPerBeat = (60.0 / this.tempo);
    this.counterTimeValue = (this.secondsPerBeat / 4); //___16th note

    this.oldClock = 0;
    this.phase = 0;

    this.clock = new Maximilian.maxiOsc();
    this.kick = new Maximilian.maxiSample();
    this.snare = new Maximilian.maxiSample();
    this.closed = new Maximilian.maxiSample();
    this.open = new Maximilian.maxiSample();

    this.initialised = false;

    // this.sequence = "k k s o c k";
    this.sequence = "ksc o o ";
    // this.sequence = "m";
    // this.sequence = "kc kc k scos";

    this.port.onmessage = event => { // message port async handler
      for (const key in event.data) { // event from node scope packs JSON object
        // this[key] = event.data[key]; // get this.audioBlob into local props
        // console.log("key: " + key);
        // console.log("key: " + );
        console.log(key + ": " + event.data[key]);
        // console.log(this[key] + ": " + typeof this[key]);
        if (key !== 'sequence')
          this[key].setSample(this.translateFloat32ArrayToBuffer(event.data[key]));
        else
          this[key] = event.data[key];
      }
    };
  }

  //Deprecated
  generateNoiseBuffer(length) {
    var bufferData = new Maximilian.VectorDouble();
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
    var maxiSampleBufferData = new Maximilian.VectorDouble();
    for (var i = 0; i < audioFloat32Array.length; i++) {
      maxiSampleBufferData.push_back(audioFloat32Array[i]);
    }
    return maxiSampleBufferData;
  }

  translateFloat32ArrayToBuffer(audioFloat32Array) {

    var maxiSampleBufferData = new Maximilian.VectorDouble();
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
          this.open.trigger();
          break;
        case "c":
          this.closed.trigger();
          break;
          // default:
          //   this.kick.trigger();
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
    if (this.closed.isReady()) {
      w += this.closed.playOnce();
    }
    if (this.open.isReady()) {
      w += this.open.playOnce();
    }
    return w * 0.5;
  }

  logGain(gain) {
    return 0.0375 * Math.exp(gain * 0.465);
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
            outputChannel[i] = this.loopPlayer() * this.logGain(parameters.gain[0]);
          }
        } else { // if gain is varying, lenght === 128, gain[i] for each sample of the render quantum
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.loopPlayer() * this.logGain(parameters.gain[i]);
          }
        }
        // DEBUG:
        // console.log(`inputs ${inputs.length}, outputsLen ${outputs.length}, outputLen ${output.length}, outputChannelLen ${outputChannel.length}`);
      }
    }
    return true;
  }

}

registerProcessor("maxi-processor", MaxiProcessor);