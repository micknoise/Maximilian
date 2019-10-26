class CustomProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  constructor() {
    super();
    this.port.onmessage = (event) => {
      console.log(event.data);
    };
  }

  process(inputs, outputs, parameters) {
    
    const output = outputs[0];
    for (let channel = 0; channel < output.length; ++channel) {

      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; ++i) {

        const signal = Math.sin(600);
        const gain = parameters.gain[i];
        outputChannel[i] = signal * gain;
      }
    }
    return true;
  }
};

registerProcessor("custom-processor", CustomProcessor);
