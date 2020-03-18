'use strict';

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
      name: 'gainSyn',
      defaultValue: 2.5
    }, {
      name: 'gainSeq',
      defaultValue: 6.5
    }];
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

    // this.maxiAudio = new Module.maxiAudio();
    this.clock = new Maximilian.maxiOsc();
    this.kick = new Maximilian.maxiSample();
    this.snare = new Maximilian.maxiSample();
    this.closed = new Maximilian.maxiSample();
    this.open = new Maximilian.maxiSample();

    // this.sequence = "k k s o c k";
    this.sequence = "ksc o o ";
    // this.sequence = "m";
    // this.sequence = "kc kc k scos";

    this.initialised = false;

    // TODO: Synth pool
    this.osc = new Module.maxiOsc();
    this.oOsc = new Module.maxiOsc();
    this.aOsc = new Module.maxiOsc();

    this.setupPolysynth();

    this.signal = () => {
      return this.osc.sinewave(440);
    };

    this.port.onmessage = event => { // message port async handler
      for (const key in event.data) { // event from node scope packs JSON object

        // console.log(key + ": " + event.data[key]); // DEBUG

        if (key === 'sequence') { // User-defined DRUM sequence
          this[key] = event.data[key];

        } else if (key === 'eval') { // User-defined SIGNAL expression

          try { // eval a property function, need to check if it changed   
            this.eval = eval(event.data[key]); // Make a function out of the synth-def string tranferred from the WebAudio Node scope
            this.eval(); // Evaluate the validity of the function before accepting it as the signal. If it is not valid, it will throw a TypeError here.
            this.signal = this.eval; // If function is valid, set it as a this.signal() function. this.signal() wil be used in the process() loop
          } catch (err) {
            if (err instanceof TypeError) {
              console.log("Error in worklet evaluation: " + err.name + " – " + err.message);
            } else {
              console.log("Error in worklet evaluation: " + err.name + " – " + err.message);
            }
          }

        } else {
          this[key].setSample(this.translateFloat32ArrayToBuffer(event.data[key]));
        }

      }
    };
  }
  /*
  1.startup,  make single very large float32 array
  2. when sample arrives via message, append this into the array, keep starting index
  2b. pass starting index to maxiSample
  3. add sample size to starting index
  */


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


  /**
   * @setupMonosynth
   */
  setupMonosynth() {

    this.VCO1 = [];
    this.VCO2 = [];
    this.LFO1 = [];
    this.LFO2 = [];
    this.VCF = [];
    this.ADSR = [];

    this.VCO1[0] = new Module.maxiOsc();
    this.VCO2[0] = new Module.maxiOsc();
    this.LFO1[0] = new Module.maxiOsc();
    this.LFO2[0] = new Module.maxiOsc();
    this.VCF[0] = new Module.maxiFilter();
    this.ADSR[0] = new Module.maxiEnv();

    this.VCO1out = [];
    this.VCO2out = [];
    this.LFO1out = [];
    this.LFO2out = [];
    this.VCFout = [];
    this.ADSRout = [];

    this.timer = new Module.maxiOsc(); // this is the metronome
    this.currentCount = 0;
    this.lastCount = 0; // these values are used to check if we have a new beat this sample

    this.ADSR[0].setAttack(1000);
    this.ADSR[0].setDecay(1);
    this.ADSR[0].setSustain(1);
    this.ADSR[0].setRelease(1000);

    this.port.postMessage(`monosynth SET`);
  }


  /**
   * @monosynth
   */
  monosynth(a = 50, d = 1, s = 1, r = 1000) {

    this.currentCount = Math.round(this.timer.phasor(8)); // set up a metronome ticking every 2 seconds
    if (this.lastCount != this.currentCount) { //if we have a new timer int this sample, play the sound
      this.ADSR[0].setAttack(a);
      this.ADSR[0].setDecay(d);
      this.ADSR[0].setSustain(s);
      this.ADSR[0].setRelease(r);
      this.ADSR[0].trigger = 1; // trigger envelope from start
      this.lastCount = 0;
    }
    this.ADSRout[0] = this.ADSR[0].adsr(1.0, this.ADSR[0].trigger);
    this.LFO1out[0] = this.LFO1[0].sinebuf(0.2); // LFO1 is a sinewave at 0.2 hz
    this.VCO1out[0] = this.VCO1[0].pulse(55, 0.6); // VCO1 is pulse wave at 55 hz, with a pulse width of 0.6
    this.VCO2out[0] = this.VCO2[0].pulse(110 + this.LFO1out[0], 0.2); // Pulse wave at 110hz with LFO modulation on the frequency and width of 0.2
    this.VCFout[0] = this.VCF[0].lores((this.VCO1out[0] + this.VCO2out[0]) * 0.5, this.ADSRout[0] * 10000, 10); // VCO's into the VCF, using the ADSR as the filter cutoff
    this.ADSR[0].trigger = 0;

    return this.VCFout[0] * this.ADSRout[0];
  }

  /**
   * @setupPolysynth
   */
  setupPolysynth() {

    let VCO_ArraySize = 6;

    this.VCO1 = [];
    this.VCO2 = [];
    this.LFO1 = [];
    this.LFO2 = [];
    this.VCF = [];
    this.ADSR = [];

    for (let i = 0; i < VCO_ArraySize; ++i) {
      this.VCO1.push(new Module.maxiOsc());
      this.VCO2.push(new Module.maxiOsc());
      this.LFO1.push(new Module.maxiOsc());
      this.LFO2.push(new Module.maxiOsc());
      this.VCF.push(new Module.maxiFilter());
      this.ADSR.push(new Module.maxiEnv());
    }

    // aux
    this.VCO1out = [];
    this.VCO2out = [];
    this.LFO1out = [];
    this.VCFout = [];
    this.ADSRout = [];
    this.pitch = [];

    // zeros
    for (let i = 0; i < VCO_ArraySize; i++) {
      this.VCO1out.push(0);
      this.VCO2out.push(0);
      this.LFO1out.push(0);
      this.VCFout.push(0);
      this.ADSRout.push(0);
      this.pitch.push(0);
    }

    this.timer = new Module.maxiOsc(); // metronome, 25 maxiOsc
    this.currentCount = 0;
    this.lastCount = 0; // these values are used to check if we have a new beat this sample
    this.voice = 0;
    this.mix = 0;

    for (let i = 0; i < VCO_ArraySize; i++) {
      this.ADSR[0].setAttack(1000);
      this.ADSR[0].setDecay(1);
      this.ADSR[0].setSustain(1);
      this.ADSR[0].setRelease(1000);
    }

    //DEBUG
    // this.port.postMessage(`polysynth SET`);
  }

  /**
   * @polysynth
   */
  polysynth(a = 0, d = 200, s = 0.2, r = 2000) {

    let VCO_ArraySize = 6;
    this.mix = 0; // Clear sample accumulator on every play

    this.currentCount = Math.round(this.timer.phasor(8)); // set up a metronome ticking every 2 seconds
    if (this.lastCount != this.currentCount) { //if we have a new timer int this sample, play the sound

      if (this.voice >= VCO_ArraySize) {
        this.voice = 0;
      }

      for (let i = 0; i < VCO_ArraySize; i++) {
        this.ADSR[this.voice].setAttack(a);
        this.ADSR[this.voice].setDecay(d);
        this.ADSR[this.voice].setSustain(s);
        this.ADSR[this.voice].setRelease(r);
        this.ADSR[this.voice].trigger = 1; //trigger envelope from start
      }
      this.pitch[this.voice] = this.voice + 1;
      this.voice++;
      this.lastCount = 0;
    }

    for (let i = 0; i < VCO_ArraySize; i++) {
      this.ADSRout[i] = this.ADSR[i].adsr(1.0, this.ADSR[i].trigger);
      this.LFO1out[i] = this.LFO1[i].sinebuf(0.2); //LFO1 is a sinewave at 0.2 hz
      this.VCO1out[i] = this.VCO1[i].pulse((55 * this.pitch[i]), 0.6); //VCO1 it's a pulse wave at 55 hz, with a pulse width of 0.6
      this.VCO2out[i] = this.VCO2[i].pulse((110 * this.pitch[i]) + this.LFO1out[i], 0.2); // pulse wave at 110hz with LFO modulation on the frequency, and width of 0.2
      this.VCFout[i] = this.VCF[i].lores((this.VCO1out[i] + this.VCO2out[i]) * 0.5, this.ADSRout[i] * 10000, 10); // VCO's into the VCF, using the ADSR as the filter cutoff
      this.mix += this.VCFout[i] / VCO_ArraySize;
      // this.VCFout[i]  = this.VCF[i].lores( (this.VCO1out[i] + this.VCO2out[i]) * 0.5, 250 + ((this.pitch[i] + this.LFO1out[i]) * 10000), 10); // VCO's into the VCF, using the ADSR as the filter cutoff
      // this.mix += this.VCFout[i] * this.ADSRout[i] / VCO_ArraySize;
      this.ADSR[i].trigger = 0;
    }

    return this.mix;
  }

  /**
   * @loopPlayer
   */
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
    // return 0.095 * Math.exp(this.gain * 0.465);
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

        if (parameters.gainSyn.length === 1 && parameters.gainSeq.length === 1) { // if gain is constant, lenght === 1, gain[0]
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.signal() * this.logGain(parameters.gainSyn[0]) + this.loopPlayer() * this.logGain(parameters.gainSeq[0]);
          }
        } else { // if gain is varying, lenght === 128, gain[i] for each sample of the render quantum
          for (let i = 0; i < 128; ++i) {
            outputChannel[i] = this.signal() * this.logGain(parameters.gainSyn[i]) + this.loopPlayer() * this.logGain(parameters.gainSeq[i]);
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