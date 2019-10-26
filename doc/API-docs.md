### maxiAudio ###

This the audio context. You must always have one to produce sound with maxiLib

#### methods ####

##### .init() #####
initialise the audio engine

##### .outputIsArray( isArray,  numChannels) #####
for multi channel  sound

- isArray = true or false
- numChannels = 2, 4, or 8

##### .loadSample(sampleUrl, maxiSample) #####
load a sample into a maxiSample object

#### properties ####

##### .play #####
the function which is the play loop

#####  .output #####
the current value of the audio output

<br><br>

### maxiSample ###

Stores and plays an audio sample

#### methods ####

##### .play() #####
plays the sample at normal speed

##### .play(playRate) #####
plays the sample at the specified play rate

##### .playOnce() #####
plays the sample once at normal speed

##### .playOnce(playRate) #####
plays the sample once at specified play rate

##### .trigger() #####
set the playhead to zero (use in conjunction with playOnce)

##### .isReady() #####
returns true if sample is loaded

<br><br>

### maxiTimestretch ###

plays a sample at different rates leaving pitch unchanged

#### methods ####

##### .setSample(maxiSample) #####

sets the sample play for timestretch to use

##### .play(rate, grainLength, overlaps, startPos) #####

- rate (eg. 0.5 = half speed)
- grainLength (a time in seconds)
- overlaps (normally 2 is good)
- startPos (where to start playing in the sample - in seconds)

##### .setPosition(startPos) #####

useful for resetting a sound

##### .getPosition() #####

returns position in ???

##### .getNormalisedPosition() #####

Useful for ending sample play back

<br><br>

### maxiPitchShift ###

plays a sample at different pitches leaving the speed unchanged

#### methods ####

##### .setSample(maxiSample) #####

sets the sample play for pitchShift to use

##### .play(pitch, grainLength, overlaps, startPos) #####

- pitch (eg. 0.5 = half pitch)
- grainLength (a time in seconds)
- overlaps (normally 2 is good)
- startPos (where to start playing in the sample - in seconds)

##### .setPosition(startPos) #####

useful for resetting a sound

##### .getPosition() #####

returns position in ???

##### .getNormalisedPosition() #####

Useful for ending sample play back


<br><br>

### maxiPitchStretch ###

plays a sample with independent control of pitch and speed

#### methods ####

##### .setSample(maxiSample) #####

sets the sample play for timestretch to use

##### .play(pitch, rate, grainLength, overlaps, startPos) #####

- pitch (eg. 0.5 = half pitch)
- rate (eg. 0.5 = half speed)
- grainLength (a time in seconds)
- overlaps (normally 2 is good)
- startPos (where to start playing in the sample - in seconds)

##### .getPosition() #####

returns position in ???

##### .getNormalisedPosition() #####

Useful for ending sample play back

##### .setPosition(startPos) #####

useful for resetting a sound

<br><br>

### maxiDelay ###

A simple delay line

#### methods ####

##### .dl(inputSignal, delayTime, foldback) #####

process a signal with delay

- inputSignal (any signal eg. output from an oscillator
- delayTime (a value in milliseconds)
- foldback (how much of the signal to feedback into the delay buffer - determines how long echos last)

<br><br>

### maxiOsc ###

An oscillator with methods for a number of waveforms

#### methods ####

##### .sinewave(frequency) #####

outputs a sine wave at the given frequency between -1.0 & 1.0

##### .triangle(frequency) #####

outputs a triangle wave at the given frequency between -1.0 & 1.0

##### .saw(frequency) #####

outputs a sawtooth wave at the given frequency between -1.0 & 1.0

##### .square(frequency) #####

outputs a square wave at the given frequency between 0.0 & 1.0

##### .phasor(frequency) #####

outputs a linear ramp at the given frequency between 0.0 & 1.0

##### .phaseReset(phase) #####

reset the phase to a specific value

- phase (a value between 0 & 1)

<br><br>

### maxiEnv ###

An adsr envelope.

#### methods ####

##### .setAttack(time) #####
- time = milliseconds

##### .setDecay(time) #####
- time = milliseconds

##### .setSustain(level) #####
- level = a value between 0.0 and 1.0

##### .setRelease(time) #####
- time = milliseconds

##### .adsr(level, trigger) #####
- level (the overall level of the envelope; everything will be scaled by this value)
- trigger (envelope will begin attack when set to 1.0 and release when set to 0.0)

<br><br>

### maxiFilter ###

A bunch of useful filter methods

#### methods ####

##### .lores(input, cutoff, resonance) #####

A lowpass resonant filter. Returns the filtered frequency.

- input =  input signal
- cutoff = cutoff frequency in Hz
- resonance = a value between 0.0 & 10.0

##### .hires(input, cutoff, resonance) #####

A highpass resonant filter. Returns the filtered frequency.

- input =  input signal
- cutoff = cutoff frequency in Hz
- resonance = a value between 0.0 & 10.0

### maxiFFT ###

#### methods ####

##### .setup(fftSize, windowSize, hopSize) #####

must be called before using the FFT

- fftSize = (A power of two, 1024, 512 .. etc)
- windowSize = half the fftSize
- hopSize = half the windowSize

##### .process(sig) #####

returns true if successful

- sig = signal in

##### .getMagnitude(index) #####

get the magnitude of a particular bin

- index = A number between 0 and the fftSize/2

##### .getMagnitudeDB(index) #####

get the decibels of a particular bin

##### .magsToDb() #####

perform the conversion on all bins



<br><br>
### convert ###

A collection of conversion functions. Currently numbering one !

#### methods ####

##### .mtof(midi) #####

pass a midi value and its frequency is returned

<br><br>
### maxiMix ###

A multichannel mixer.

#### methods ####

##### .stereo(sig, outputArray, pan) #####

Makes a stereo mix.

- sig = inputsignal
- outputArray = VectorDbl array (see maxiTools)
- pan = a value between 0 & 1

<br><br>
### maxiTools ###

#### methods ####

##### .getArrayAsVectorDbl(inputArray) #####

Returns the array as a VectorDbl object.  (Needed for maxiMix).

### Undocumented classes ###

- maxiArray
- maxiChorus
- maxiClock
- maxiDCBlocker
- maxiDistortion
- maxiDyn
- maxiEnvelope
- maxiEnvelopeFollower (undefined)

- maxiFFTOctaveAnalyzer
- maxiFlanger
- maxiHats
- maxiIFFT
- maxiKick
- maxiLagExp
- maxiMFCC
- maxiMap
- maxiSVF
- maxiSettings
- maxiSnare
- maxiTools
