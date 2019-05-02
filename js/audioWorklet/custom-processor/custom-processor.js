class CustomProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  constructor() {
    super();
    this.sampleRate = 44100;
    this.sampleIndex = 0;

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

    const output = outputs[0];
    for (let i = 0; i < output[0].length; i++) {

      const func = Math.sin(2 * Math.PI * 600 * this.sampleIndex++/this.sampleRate);
      const gain = parameters.gain[i];
      output[0][i] = func * gain;
      output[1][i] = func * gain;
    }
    return true;
  }
};

registerProcessor("custom-processor", CustomProcessor);
