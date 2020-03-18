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
	static get parameterDescriptors() {
		return [
			{ name: "gain", defaultValue: 0.3 },
			{ name: "frequency", defaultValue: 440.0 }
		];
	}

	/**
	 * @constructor
	 */
	constructor() {
		super();
		
		this.sampleRate = 44100;
		
		this.sampleIndex = 0;
		
		this.sampleBuffers = [];

		this.type = "sine";

	 	this.port.onmessage = event => {
			// message port async handler
			for (const key in event.data) {
				// event from node scope packs JSON object
				// this[key] = event.data[key]; // get this.audioBlob into local props
				// console.log("key: " + key);
				// console.log("key: " + );
				console.log(key + ": " + event.data[key]);
				// console.log(this[key] + ": " + typeof this[key]);
				if (key !== "sequence") {
					this[key] = new Maximilian.maxiSample(); 
					this[key].setSample( this.translateFloat32ArrayToBuffer(event.data[key]) );
				}
				else 
				  this[key] = event.data[key];
			}
	  };

  	this.osc = new Maximilian.maxiOsc();
  	this.samplePlayer = new Maximilian.maxiSample();
  	this.fft = new Maximilian.maxiFFT();

  	// for storing fft values (required as passing a vector from one class to another isn't currently working)
  	this.magnitudes = new Maximilian.VectorFloat();
  	this.magnitudesDB = new Maximilian.VectorFloat();
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
				if (parameters.gain.length === 1) {
					// if gain is constant, lenght === 1, gain[0]

					for (let i = 0; i < outputChannel.length; ++i) {
						outputChannel[i] = this.osc.sinewave(400) * parameters.gain[0];
					}
				} else {
					// if gain is varying, lenght === 128, gain[i]
					for (let i = 0; i < outputChannel.length; ++i) {
						outputChannel[i] = this.osc.sinewave(400) * parameters.gain[i];
					}
				}
			}
		}
		return true;
	}
}

registerProcessor("maxi-processor", MaxiProcessor);
