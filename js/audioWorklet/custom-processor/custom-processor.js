class CustomProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  constructor() {
    super();
    this.sampleRate = 44100;

    this.port.onmessage = (event) => {
      console.log(event.data);
    };
  }

  process(inputs, outputs, parameters) {

    // const myParamValues = parameters.myParam;
    // if (myParamValues.length === 1) {
    //   // |myParam| has been a constant value for the current render quantum,
    //   // which can be accessed by |myParamValues[0]|.
    // } else {
    //   // |myParam| has been changed and |myParamValues| has 128 values.
    // }

    const speakers = outputs[0];
    for (let i = 0; i < speakers[0].length; i++) {

      const func = Math.sin(i) + 0.4;
      const gain = parameters.gain[i];
      speakers[0][i] = func * gain;
      speakers[1][i] = func * gain;
    }
    return true;
  }
};

// function wasmReady(){
//
//   var audio = new maxiLib.maxiAudio();
//   // initialise audio
//   audio.init();
//   // create oscillator
//   var mySine = new maxiLib.maxiOsc();
//   // audio.play = function(){
//   //   // direct value to output
//   //   this.output = mySine.sinewave(440);
//   // }
//   console.log("Maxi Audio loaded");
// }


registerProcessor("custom-processor", CustomProcessor);
