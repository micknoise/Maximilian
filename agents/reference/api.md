# API reference

Organised by *what you are trying to do*, not alphabetically. Every fenced block in this
file is a complete translation unit that compiles against the headers as they stand —
`tools/check-docs.py` enforces that, so a snippet here cannot drift from the source.

Units are stated for every argument that has them, because this library mixes Hz,
0–1 normalised values, milliseconds and sample counts in the same call chain. When the
units are not obvious, they are called out as **traps**.

---

## 1. Setup

```cpp
#include "maximilian.h"

void setup() {
    // sample rate, channels, buffer size. Do this before touching anything else.
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    output[0] = 0.0;
    output[1] = 0.0;
}
```

`maxiSettings::setup(rate, channels, bufferSize)` sets three statics that filters,
envelopes and converters read. Defaults are 44100 / 2 / 1024 if you never call it.

## 2. Oscillators

### `maxiOsc`

One object can produce any waveform; the waveform is chosen by **which method you call**,
not by a type. Calling a different method on the same object mid-stream is legal and is
how the counting examples switch timbre per step.

| Call | Output | Notes |
|---|---|---|
| `.sinewave(freq)` / `.coswave(freq)` | −1..1 | computed with `sin`/`cos` |
| `.sinebuf(freq)` / `.sinebuf4(freq)` | −1..1 | wavetable, linear / quadratic interpolation. **Much cheaper**; use these in a tight polyphonic loop |
| `.saw(freq)` | −1..1 | naive saw, aliases at high frequencies |
| `.sawn(freq)` | −1..1 | band-limited ("anti-aliased") saw |
| `.triangle(freq)` | −1..1 | |
| `.square(freq)` | −1..1 | naive square |
| `.pulse(freq, duty)` | −1..1 | `duty` 0–1 |
| `.phasor(freq)` | 0..1 | rising ramp; the workhorse for timing |
| `.phasorBetween(freq, start, end)` | `start`..`end` | ramp between arbitrary values |
| `.impulse(freq)` | 0/1 | one-sample spike per period |
| `.noise()` | −1..1 | white noise, no argument |

`freq` is always in Hz, and it is passed **per sample**, so you can modulate it by simply
adding another signal.

```cpp
#include "maximilian.h"

maxiOsc carrier, modulator;
maxiOsc lfo;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double index = 100.0;            // modulation depth, in Hz of deviation
    const double mod = modulator.sinewave(1.0) * index;
    const double vibrato = lfo.sinebuf(5.0) * 4.0;   // +/- 4 Hz at 5 Hz
    const double w = carrier.sinewave(440.0 + mod + vibrato) * 0.3;
    output[0] = w;
    output[1] = w;
}
```

**Trap:** a naive `saw`/`square`/`pulse` at high frequencies aliases audibly. Prefer
`sawn`, `maxiPolyBLEP`, or add a low-pass. `sinebuf` is not band-limited either, but a
sine has nothing to alias.

**Seen in:** `1.TestTone`, `2.TwoTones`, `3.AM1`–`6.FM2`, `14.monosynth`.

### `maxiPolyBLEP` (extended, `#include "maxiPolyBLEP.h"`)

An alias-free oscillator with an explicit waveform. Cheaper and cleaner than `sawn` when
you are stacking several.

```cpp
#include "maximilian.h"
#include "maxiPolyBLEP.h"

maxiPolyBLEP osc;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    osc.setWaveform(maxiPolyBLEP::Waveform::SAWTOOTH);
    osc.setPulseWidth(0.5);          // only affects the pulse-like waveforms
    osc.setSampleRate(44100.0);      // if you change the global rate after construction
}

void play(double *output) {
    double w = osc.play(220.0) * 0.3;   // play() takes Hz
    output[0] = w;
    output[1] = w;
}
```

Waveforms used by the shipped examples: `SAWTOOTH`, `SQUARE`, `MODIFIED_SQUARE`,
`TRIANGLE`, `RECTANGLE`. **Seen in:** `9.Envelopes1`–`9.Envelopes3`.

## 3. Envelopes and control signals

### `maxiEnvGen` — the current envelope generator

This is the one to use. It is a multi-stage envelope with per-stage level, time and
curve, plus optional looping, holding and retriggering.

| Call | Meaning |
|---|---|
| `setup(levels, times, curves, looping, allowRetrigger=false)` | `levels` has **one more element** than `times` and `curves`. Returns `bool` — check it |
| `play(trigger)` | advance one sample, returns the current level |
| `setLevel(i, v)`, `setCurve(i, v)`, `setTime(i, v)` | edit a stage live; returns `bool` |
| `reset()`, `resetAndArm()` | jump to the start |
| `maxiEnvGen::HOLD` | use as a *time* value to hold until the trigger falls below zero |

```cpp
#include "maximilian.h"

maxiEnvGen env;
maxiOsc osc, trig;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    // 3 stages: 0->1 over 100 ms, 1->0.3 over 400 ms, 0.3->0 over 800 ms
    // curves of 1 are linear; >1 bends the shape
    bool ok = env.setup({0.0, 1.0, 0.3, 0.0}, {100, 400, 800}, {1, 1, 1}, false);
    (void)ok;
}

void play(double *output) {
    const double gate = trig.impulse(2.0);      // a trigger every 500 ms
    const double amp = env.play(gate);
    double w = osc.sinebuf(330.0) * amp * 0.3;
    output[0] = w;
    output[1] = w;
}
```

**Traps:**

- `play()` takes a **trigger signal**, not a boolean. It starts on a *positive zero
  crossing*. Passing a constant `1.0` fires once and then waits forever — which is
  exactly what the shipped examples do when they want a one-shot.
- `levels.size() == times.size() + 1`. Get that wrong and `setup()` returns `false` and
  silently leaves the envelope empty.
- The times are **milliseconds**; the conversion to samples uses the sample rate at the
  moment `setup()` is called.

### `maxiEnv` — the older ADSR/AR (still everywhere)

Deprecated in favour of `maxiEnvGen`, but it is what most examples and most tutorials
use, so you must be able to read it. Its trigger is a **public integer member**, not an
argument to `play()`.

```cpp
#include "maximilian.h"

maxiEnv adsr;
maxiOsc osc, timer;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    adsr.setAttack(10);      // ms
    adsr.setDecay(200);      // ms
    adsr.setSustain(0.5);    // level 0-1
    adsr.setRelease(500);    // ms
}

void play(double *output) {
    const int tick = static_cast<int>(timer.phasor(2.0));   // 2 ticks per second
    adsr.trigger = (tick == 1) ? 1 : 0;
    double w = adsr.adsr(1.0, adsr.trigger) * osc.saw(110.0) * 0.2;
    output[0] = w;
    output[1] = w;
}
```

**Traps:** `adsr(input, trigger)` shapes `input`; pass a constant `1.0` to use it as a
bare envelope. There is also an older overload `adsr(input, attack, decay, sustain,
release, holdtime, trigger)` where attack/decay/release are **coefficients near 1.0, not
milliseconds** — the `0.9995` style seen in `16.Replicant`. Mixing the two conventions
is the single most common envelope bug in this codebase.

### `maxiLine` — a triggered ramp

`prepare(start, end, durationMs, isOneShot)`, then `triggerEnable(1)`, then
`play(trigger)` per sample. Note it is `prepare()`, **not** `setup()`.

### `maxiDyn` / `maxiEnv` hold off

`maxiDyn` is the deprecated dynamics class; `maxiEnv` is the deprecated envelope. Both
still work. New code should use `maxiEnvGen` and `maxiDynamics`.

## 4. Filters

Four filter families, and they do **not** agree on units. This table is the thing to
memorise.

| Class | Call | Cutoff units | Resonance |
|---|---|---|---|
| `maxiFilter` | `.lores(in, cutoff, res)` | **Hz** | ~0–20, rings above ~10 |
| `maxiFilter` | `.hires(in, cutoff, res)` | **Hz** | same |
| `maxiFilter` | `.bandpass(in, cutoff, res)` | **Hz** | same |
| `maxiFilter` | `.lopass(in, cutoff)` | **0–1 normalised** | none |
| `maxiFilter` | `.hipass(in, cutoff)` | **0–1 normalised** | none |
| `maxiSVF` | `.play(in, lp, bp, hp, notch)` | **Hz** via `setCutoff` | via `setResonance(q)` |
| `maxiBiquad` | `.play(in)` | **Hz** via `set(type, cutoff, Q, gain)` | `Q` |

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiFilter resonant;
maxiSVF svf;
maxiBiquad biquad;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    svf.setCutoff(1200.0);      // Hz
    svf.setResonance(3.0);
    biquad.set(maxiBiquad::LOWPASS, 800.0, 1.0, 0.0);   // type, Hz, Q, peak gain
}

void play(double *output) {
    const double x = osc.sawn(110.0);

    // resonant low pass, cutoff in Hz
    const double a = resonant.lores(x, 1200.0, 5.0);

    // state variable: mix amounts are 0-1, and you choose the blend per sample
    const double b = svf.play(x, 1.0, 0.0, 0.0, 0.0);   // low pass only

    const double c = biquad.play(x);

    // NOTE: lopass/hipass take 0-1, NOT Hz. 800.0 here would be nonsense:
    // resonant.lopass(x, 800.0);
    const double d = resonant.lopass(x, 0.5);

    double w = (a + b + c + d) * 0.05;
    output[0] = w;
    output[1] = w;
}
```

**Traps:**

- `lopass`/`hipass` take 0–1. Everything else takes Hz. Passing Hz to `lopass` is a
  silent no-op-ish filter, not an error.
- `maxiSVF::play` takes **five** arguments after the signal is included: input plus four
  mix amounts. Forgetting the mix arguments does not compile, which is the good outcome.
- Filter coefficients are computed from `maxiSettings::sampleRate` when you call
  `set()`/`setCutoff()`. If you change the sample rate later, re-set the cutoff.
- There is no built-in oversampling: a resonant filter at 12 kHz on a 44.1 kHz stream is
  as unstable as the maths says it is. Keep cutoff below ~0.45 × sample rate.

**Seen in:** `10.Filters` (maxiEnv + maxiFilter), `13.Advanced-Filters` (hand-written
biquad), `9.Envelopes1`–`9.Envelopes3` (maxiSVF, maxiBiquad).

## 5. Effects

### `maxiDelayline`

`dl(input, size, feedback)` — **`size` is in samples**, `feedback` 0–1.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiDelayline delayLine;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double dry = osc.sawn(220.0) * 0.2;
    const int delaySamples = static_cast<int>(0.25 * maxiSettings::sampleRate); // 250 ms
    const double wet = delayLine.dl(dry, delaySamples, 0.6);
    double w = (dry + wet * 0.5) * 0.7;
    output[0] = w;
    output[1] = w;
}
```

`dlFromPosition(input, size, feedback, position)` reads from a set position instead of
pushing a new sample — for tap patterns.

### `maxiChorus` and `maxiFlanger`

Both take `(input, delay, feedback, speed, depth)` with **an `unsigned int` delay**.
Despite the header comment saying "milliseconds", the value is passed straight to
`maxiDelayline::dl` as a **sample count**. At 44.1 kHz, 10–1000 samples is 0.2–23 ms,
which is the musically useful range and what the examples use. `speed` is in Hz (the LFO
rate), `depth` 0–1.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiChorus chorus;
maxiFlanger flanger;
maxiOsc lfo;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double dry = osc.saw(110.0) * 0.2;
    const double speed = 0.1 + (lfo.sinebuf(0.05) * 0.05);   // ~0.05-0.15 Hz

    const double a = chorus.chorus(dry, 800, 0.7, speed, 1.0);
    const double b = flanger.flange(dry, 800, 0.7, speed, 0.6);

    double w = (a + b) * 0.25;
    output[0] = w;
    output[1] = w;
}
```

### `maxiNonlinearity` — distortion

`atanDist(x, shape)`, `fastAtanDist(x, shape)`, `softclip(x)`, `hardclip(x)`,
`asymclip(x, a, b)`, `fastatan(x)`. `shape` controls how hard the curve bends; larger is
more aggressive. `atanDist` is the good-sounding one, `fastAtanDist` is the cheap one.

### Reverb (extended, `#include "maxiReverb.h"`)

`maxiFreeVerb` (`play(input)`, `play(input, roomsize, absorbtion)`),
`maxiFreeVerbStereo` and `maxiDattaroReverb` (`playStereo(input)` returning `double*`),
`maxiSatReverb` (`play`, `playStereo`). All are delay-network reverbs tuned by ear, not
by a parameter model — treat `roomsize`/`absorbtion` as 0–1 knobs and audition.

## 6. Dynamics

### `maxiDynamics` — compressor with lookahead and RMS detection

```cpp
#include "maximilian.h"

maxiDynamics dyn;
maxiOsc osc;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    dyn.setAttackLow(1);        // ms
    dyn.setReleaseLow(50);      // ms
    dyn.setAttackHigh(10);
    dyn.setReleaseHigh(200);
    dyn.setLookAhead(2);        // ms
    dyn.setRMSWindowSize(10);   // ms
    dyn.setInputAnalyser(maxiDynamics::RMS);   // or maxiDynamics::PEAK
}

void play(double *output) {
    const double dry = osc.sawn(110.0) * 0.5;
    // compress(signal, threshold dB, ratio, knee dB)
    const double w = dyn.compress(dry, -18.0, 4.0, 5.0);
    output[0] = w;
    output[1] = w;
}
```

The four time constants form a two-band arrangement (high/low), which is why there are
both `Low` and `High` setters. See `17.Compressor` for an envelope-driven version.

### `maxiDyn` (deprecated)

`gate(input, threshold, holdtime, attack, release)` and
`compressor(input, ratio, threshold, attack, release)`, plus `compress(input)`.
The `attack`/`release` here are **coefficients near 1.0**, not milliseconds.

## 7. Samples

### `maxiSample`

Loads WAV natively and OGG through the vendored `stb_vorbis`. Playback position is held
internally and advances one sample per call at speed 1.

| Call | Meaning |
|---|---|
| `load(path, channel=0)` | returns `bool`. Path is relative to the **working directory** |
| `loadOgg(path, channel=0)` | same, OGG |
| `getLength()` | length in samples |
| `getSummary()` | printable info |
| `isReady()` | loaded and non-empty |
| `play()` | play at speed 1, **looping** |
| `playAtSpeed(speed)` | speed multiplier; 0.5 = half speed / octave down |
| `playOnce()` | play once, then silence; re-arm with `trigger()` |
| `trigger()` | reset the position to the start (use with `playOnce`) |
| `setPosition(pos)` | seek, 0–1 |
| `playLoop(start, end)` | loop a **normalised** 0–1 sub-range |
| `normalise(maxLevel)` | scale the buffer |
| `autoTrim(alpha, threshold, trimStart, trimEnd)` | remove silence at the edges |

```cpp
#include "maximilian.h"

maxiSample clip;
maxiOsc metronome;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    // relative to the directory you run the binary from, not the source file
    if (!clip.load("beat2.wav")) {
        printf("could not load beat2.wav\n");
    }
}

void play(double *output) {
    double w = 0.0;
    if (clip.isReady()) {
        const int tick = static_cast<int>(metronome.phasor(2.0));
        if (tick == 1) clip.trigger();     // restart on each metronome tick
        w = clip.playOnce() * 0.8;
    }
    output[0] = w;
    output[1] = w;
}
```

**Traps:**

- `play()` loops by default; `playOnce()` does not. The drum-machine idiom is
  `trigger()` then `playOnce()` every sample.
- The path is resolved against the process working directory. Every shipped example uses
  a `../../../` style path because they are run from a `build` subfolder. If a sample
  "does not load", this is why.
- `maxiSample` holds the whole file in memory as `double` — a 3-minute stereo WAV is
  ~63 MB. Not for embedded boards.
- There is **no** `maxiRecorder` class in this tree any more, although
  `21.Recording` still uses one. See [examples-map.md](examples-map.md).

**Seen in:** `12.SamplePlayer`, `18.DrumMachine`, `17.Compressor`, `23.Chorus`,
`24.Flanger`.

## 8. Analysis

### `maxiFFT` / `maxiIFFT` (extended, `#include "maxiFFT.h"`)

`process()` returns `true` when a **new frame** is ready — it is a gate, not a per-sample
value. Do the spectral work inside that `if`, and return audio every sample.

```cpp
#include "maximilian.h"
#include "maxiFFT.h"

maxiOsc osc;
maxiFFT fft;
double centroid = 0.0;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    fft.setup(1024, 512, 1024);     // fftSize, hopSize, windowSize
}

void play(double *output) {
    const float x = static_cast<float>(osc.sinewave(440.0) * 0.5);
    if (fft.process(x)) {
        centroid = fft.spectralCentroid();
    }
    output[0] = x;
    output[1] = x;
}
```

| Call | Returns |
|---|---|
| `setup(fftSize=1024, hopSize=512, windowSize=0)` | configure; `windowSize` 0 means "same as fftSize" |
| `process(value, mode=WITH_POLAR_CONVERSION)` | `bool`, true on a new frame |
| `getMagnitudes()` / `getMagnitudesDB()` | `std::vector<float>&`, length `fftSize/2` |
| `getPhases()` | `std::vector<float>&` |
| `getNumBins()`, `getFFTSize()`, `getHopSize()`, `getWindowSize()` | ints |

`maxiIFFT::process(magnitudes, phases)` runs the inverse, at audio rate, using whatever
spectrum you last put in. `20.FFT_example` does a crude bin-shift effect with it.

**Trap:** call `getMagnitudes()` inside the `if` and copy it if you need it later; the
returned reference points at the analyser's internal buffer and is overwritten on the
next hop.

### Other analysers (all core, no extra includes)

| Class | Call | Notes |
|---|---|---|
| `maxiRMS` | `setup(maxLengthMs, windowSizeMs)`, then `.play(x)` | running RMS over a window |
| `maxiZeroCrossingRate` | `.play(x)` | crossings per sample, useful for pitch |
| `maxiZeroCrossingDetector` | `.onZX(x)` | fires on a sign change |
| `maxiEnvelopeFollowerType<T>` | `.setAttack(ms)`, `.setRelease(ms)`, `.play(x)`? see note | templated follower, used by `maxiDynamics` |
| `maxiPoll` | `.poll(value, hz, label, "\n")` | prints at a fixed rate and **returns the value**, so it can wrap an expression |

`maxiPoll` is the debugging tool: it is a pass-through, so `filter.play(poll.poll(x, 4))`
prints four times a second and changes nothing.

### `maxiMFCCAnalyser` and `maxiBarkScaleAnalyser` (extended)

MFCCs and Bark-scale loudness, both fed by a normalised spectrum from `maxiFFT`.
`maxiBarkScaleAnalyser` offers `specificLoudness`, `relativeLoudness`, `totalLoudness`,
each taking `float*` spectrum and returning `double*`. These are research-grade utilities
used by the browser examples (`20-analysis-MFCC.html`, `27-MFCCs.html`); they are not
covered by the workbench because they need a real spectrum to be meaningful.

## 9. Sequencing and timing

### `maxiClock` (extended, `#include "maxiClock.h"`)

The idiomatic beat clock. `ticker()` must be called **every sample**; afterwards `tick`
is true for exactly one sample per beat-tick.

```cpp
#include "maximilian.h"
#include "maxiClock.h"

maxiClock beatClock;
maxiOsc osc;
int step = 0;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    beatClock.setTicksPerBeat(4);   // 16ths at 4/4
    beatClock.setTempo(120.0);      // BPM
}

void play(double *output) {
    beatClock.ticker();             // every sample
    if (beatClock.tick) {           // true for one sample per tick
        step = (step + 1) % 16;
    }
    double w = osc.sinebuf(220.0) * 0.2;
    output[0] = w;
    output[1] = w;
}
```

Getters: `getCurrentCount()`, `getLastCount()`, `getPlayHead()`, `getBps()`, `getBpm()`,
`getTick()`, `getTicks()`, `isTick()`. `tick` and `ticks` are also public fields.

### The phasor counter (core only, no include needed)

The older idiom, and it needs no clock class. Convert a phasor to an `int`; the value
changes when the ramp wraps.

**Trap:** this is *sample-rate dependent* in a way the clock is not — the tick count per
second is exactly the phasor frequency, so `phasor(8)` is 8 ticks/second regardless of
tempo. That is why the counting examples are tempo-free.

```cpp
#include "maximilian.h"

maxiOsc counter, osc;
int currentCount = 0;

void play(double *output) {
    const int now = static_cast<int>(counter.phasorBetween(2.0, 1.0, 9.0));
    if (now != currentCount) {
        currentCount = now;                 // a new step happened
    }
    double w = osc.sawn(static_cast<double>(currentCount) * 110.0) * 0.2;
    output[0] = w;
    output[1] = w;
}
```

### `maxiStep` — value sequencer

`pull(trigSig, values, step)` returns the current value and advances the index on each
positive zero crossing of `trigSig`. The values are a `std::vector<double>` (brace list
works). This is the cleanest way to sequence pitches.

### `maxiRatioSeq` — rhythm from ratios

`playTrig(phase, times)` divides one phasor period into the proportions in `times` and
returns a trigger at the start of each. `{1,1,1,1}` is four beats, `{3,3,2}` is two
dotted beats then one, `{1}` is a whole bar.

### `maxiCounter`

`count(incTrigger, resetTrigger)` — increments on the first trigger, resets on the second.
Simpler than a clock when all you need is "how many times has this happened".

## 10. Granular (extended, `#include "maxiGrains.h"`)

> **Build note:** `maxiGrains.h` does not compile on 32-bit targets (MinGW/Win32, and any
> MCU where `size_t` is not `unsigned long`) because of an ambiguous `std::min` at lines
> 170 and 188. It compiles on 64-bit Linux and macOS. See [pitfalls.md](pitfalls.md#p2).

`maxiTimeStretch<Window>` and `maxiStretch` are templated on a window functor
(`hannWinFunctor`, `hammingWinFunctor`, `triangleWinFunctor`, …) and are constructed from
a `maxiSample*`. `maxiTimeStretch::play(speed, grainLength, overlaps, posMod)` and
`maxiStretch::playAtPosition(pitchstretch, pos, grainLength, overlaps)`.

`maxiPitchShift` is the non-templated single-purpose version. `maxiGrainPlayer` takes
`addGrain()` calls and mixes whatever is alive.

## 11. Utilities

| Class | Purpose |
|---|---|
| `maxiConvert` | `mtof(midiNote)`, `msToSamps(ms)`, `sampsToMs(n)`, `ampToDbs(amp)`, `dbsToAmp(db)` — all `static`. **`convert` is a typedef for it**, so old code says `convert mtof; mtof.mtof(60)` |
| `maxiMap` | `linlin`, `linexp`, `explin`, `clamp` — all `static` |
| `maxiMix` | `stereo(in, vector<double>&, pan)`, `quad(...)`, `ambisonic(...)` — equal-power panning into a caller-owned vector |
| `maxiRingBuf` | `setup(n)`, `push(x)`, `head()`, `tail(n)`, `reduce(n, fn, init)`, `size()` |
| `maxiSampleAndHold` | `play(trigger)` — samples the input on each zero crossing |
| `maxiBits` | bit-crushing |
| `maxiXFade`, `maxiLagExp`, `maxiTrigger` | crossfade, lag/slew, generic trigger detection |

`maxiMap` and `maxiConvert` are pure functions with no state — safe to call anywhere,
including on a control thread.

## 12. Quick lookup: "I want to …"

| Task | Use | Example |
|---|---|---|
| Make a tone | `maxiOsc::sinewave` | `1.TestTone` |
| Make it move | add a second osc to the frequency | `5.FM1` |
| Shape an amplitude | `maxiEnvGen` (new) / `maxiEnv` (old) | `9.Envelopes1` |
| Filter it | `maxiFilter::lores` (Hz) | `10.Filters` |
| Play a file | `maxiSample::load` + `play` | `12.SamplePlayer` |
| Trigger a one-shot | `trigger()` + `playOnce()` | `18.DrumMachine` |
| Keep time | `maxiClock` | `7.Counting1` |
| Sequence notes | `maxiStep` | `9.Envelopes3` |
| Make a rhythm | `maxiRatioSeq` | `9.Envelopes3` |
| Pan it | `maxiMix::stereo` | `11.Mixing` |
| Add echo | `maxiDelayline::dl` | `16.Replicant` |
| Distort it | `maxiNonlinearity::atanDist` | `9.Envelopes1` |
| Compress it | `maxiDynamics::compress` | `17.Compressor` |
| Analyse pitch content | `maxiFFT` + `spectralCentroid` | `20.FFT_example` |
| Measure level | `maxiRMS` | `22.Analysis` |
| Print a value while running | `maxiPoll::poll` | `22.Analysis` |
