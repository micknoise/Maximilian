import Maximilian from "../../build/maximilian.wasmmodule.js";
// import { VariableBufferKernel } from './ring-buffer-maxi-audio.wasmmodule.js';
import { RENDER_QUANTUM_FRAMES, MAX_CHANNEL_COUNT, HeapAudioBuffer, RingBuffer }
    from '../../common/wasm-audio-helper.js';

/**
 * The main Maxi Audio wrapper with a WASM-powered AudioWorkletProcessor.
 *
 * @class RingBufferMaxiAudioProcessor
 * @extends AudioWorkletProcessor
 */
class RingBufferMaxiAudioProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [{ name: 'gain', defaultValue: 0.1 }];
  }

  /**
   * @constructor
   */
  constructor(options) {
    super();

    this.sampleRate = 44100;

    this._kernelBufferSize = options.processorOptions.kernelBufferSize;
    this._channelCount = options.processorOptions.channelCount;

    // RingBuffers for input and output.
    this._inputRingBuffer =
        new RingBuffer(this._kernelBufferSize, this._channelCount);
    this._outputRingBuffer =
        new RingBuffer(this._kernelBufferSize, this._channelCount);

    // For WASM memory, also for input and output.
    this._heapInputBuffer =
        new HeapAudioBuffer(Module, this._kernelBufferSize, this._channelCount);
    this._heapOutputBuffer =
        new HeapAudioBuffer(Module, this._kernelBufferSize, this._channelCount);

    // WASM audio processing kernel.
    this._kernel = new Module.VariableBufferKernel(this._kernelBufferSize);

    this.port.onmessage = (event) => {
      console.log(event.data);
    };

    this.mySine = new Maximilian.maxiOsc();
    this.myOtherSine = new Maximilian.maxiOsc();

  }

  onAudioProcess(outputs, parameters) {

    // Read through the audio layout: Outputs -> Channels
    const outputsLength = outputs.length;
    for (let outputId = 0; outputId < outputsLength; ++outputId) {
      let output = outputs[outputId];
      const channelLenght = output.length;

      for (let channelId = 0; channelId < channelLenght; ++channelId) {
        const gain = parameters.gain;
        const isConstant = gain.length === 1
        let outputChannel = output[channelId];

        for (let i = 0; i < outputChannel.length; ++i) {
          const amp = isConstant ? gain[0] : gain[i]
          outputChannel[i] = (this.mySine.sinewave(440) + this.myOtherSine.sinewave(441)) * amp;
        }
      }
    }

  }

  /**
   * @process
   */
  process(inputs, outputs, parameters) {

    let input = inputs[0];
    let output = outputs[0];

    // AudioWorkletProcessor always gets 128 frames in and 128 frames out. Here
    // we push 128 frames into the ring buffer.
    this._inputRingBuffer.push(input);

    // Process only if we have enough frames for the kernel.
    if (this._inputRingBuffer.framesAvailable >= this._kernelBufferSize) {
      // Get the queued data from the input ring buffer.

      this._inputRingBuffer.pull(this._heapInputBuffer.getChannelData());

      // This WASM process function can be replaced with ScriptProcessor's
      // |onaudioprocess| callback function. However, if the event handler
      // touches DOM in the main scope, it needs to be translated with the
      // async messaging via MessagePort.
       this._kernel.process(this._heapInputBuffer.getHeapAddress(),
                            this._heapOutputBuffer.getHeapAddress(),
                            this._channelCount);

      // Fill the output ring buffer with the processed data.
      // this._outputRingBuffer.push(this._heapOutputBuffer.getChannelData());
      // Always pull 128 frames out. If the ring buffer does not have enough
      // frames, the output will be silent.
      this._outputRingBuffer.pull(output);
    }

    return true;
  }

};

registerProcessor("ring-buffer-maxi-audio-processor", RingBufferMaxiAudioProcessor);
