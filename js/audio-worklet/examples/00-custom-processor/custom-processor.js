class CustomProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  constructor() {
    super();

    this.time = 0;
    this.frequency = 440;
    this.sampleRate = 44100;

    this.port.onmessage = (event) => {
      console.log(event.data);
    };
  }

  process(inputs, outputs, parameters) {
    
    for (let i = 0; i < outputs[0][0].length; ++i) {
			// outputChannel.length == 128 samples (fixed render quanta)
			const signal = Math.sin(2 * Math.PI * this.frequency * this.time); // generating a sinewave, 1 sample at the time
		  const gain = parameters.gain.length === 1? parameters.gain[0] : parameters.gain[i];
			outputs[0][0][i] = signal * gain; // [out][left][samplei]
      outputs[0][1][i] = signal * gain; // [out][right][samplei]
			this.time += 1/this.sampleRate;
		}
    return true;
  }
};

registerProcessor("custom-processor", CustomProcessor);
