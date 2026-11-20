---
name: maximilian-effects
description: Use when adding an effect to audio in Maximilian - delay, echo, chorus, flanging, distortion, reverb, compression, gating or limiting. Covers maxiDelayline, maxiChorus, maxiFlanger, maxiNonlinearity, the reverb classes, maxiDynamics and maxiMix panning.
---

# Effects

Almost every effect follows the same shape: dry signal plus a processed copy, mixed to the
output.

```
dry ---------------------> (+)
  \-> effect -> wet gain ->(+)-> output
```

## Delay and echo

`dl(input, size, feedback)` — **`size` is in samples**, feedback 0–1.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiDelayline echo;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double dry = osc.sawn(220.0) * 0.2;
    const int delaySamples = static_cast<int>(0.25 * maxiSettings::sampleRate); // 250 ms
    const double wet = echo.dl(dry, delaySamples, 0.6);
    const double w = (dry + wet * 0.5) * 0.7;
    output[0] = w;
    output[1] = w;
}
```

Set `feedback` below about 0.95 unless you want it to run away forever. Use
`dlFromPosition(input, size, feedback, position)` for multi-tap patterns.

## Chorus and flanging

Both take `(input, delay, feedback, speed, depth)` and the `delay` is an **`unsigned int`
used as a sample count**, despite the header comment saying milliseconds. `speed` is the
LFO rate in Hz, `depth` is 0–1.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiChorus chorus;
maxiFlanger flanger;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double dry = osc.saw(110.0) * 0.2;
    // delay in samples: 1-20 ms is the classic range at 44.1 kHz (~44-880 samples)
    const double a = chorus.chorus(dry, 400, 0.7, 0.8, 1.0);
    const double b = flanger.flange(dry, 200, 0.6, 0.3, 0.8);
    const double w = (a + b) * 0.25;
    output[0] = w;
    output[1] = w;
}
```

Modulate `speed` with an envelope or LFO for movement; a fixed chorus is nearly a
comb filter.

## Distortion

`maxiNonlinearity` offers six curves. `shape` is the amount of bend, higher is harder.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiNonlinearity dist;
maxiEnvGen driveEnv;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    driveEnv.setup({1.0, 30.0, 1.0}, {4000, 4000}, {1, 1}, true);
}

void play(double *output) {
    const double gain = driveEnv.play(1.0);
    const double x = osc.sinewave(110.0) * 0.8;
    const double w = dist.atanDist(x, gain) * 0.5;
    output[0] = w;
    output[1] = w;
}
```

| Call | Character |
|---|---|
| `atanDist(x, shape)` | smooth, musical, expensive |
| `fastAtanDist(x, shape)` | nearly the same, cheaper |
| `softclip(x)` | gentle odd harmonics |
| `hardclip(x)` | aggressive odd harmonics |
| `asymclip(x, a, b)` | asymmetric, adds even harmonics |
| `fastatan(x)` | cheapest |

Compensate gain: distortion raises perceived level, so scale down afterwards or you clip
the output stage.

## Reverb

`#include "maxiReverb.h"` gives four delay-network reverbs. There is no parameter model to
reason about — `roomsize` and `absorbtion` are feel knobs, 0–1.

```cpp
#include "maximilian.h"
#include "maxiReverb.h"

maxiOsc osc;
maxiFreeVerb reverb;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double dry = osc.sinewave(220.0) * 0.2;
    const double wet = reverb.play(dry, 0.7, 0.5);   // roomsize, absorbtion
    const double w = (dry * 0.7) + (wet * 0.5);
    output[0] = w;
    output[1] = w;
}
```

`maxiFreeVerbStereo`, `maxiDattaroReverb` and `maxiSatReverb` have `playStereo()` returning
`double*` — a pointer to two values, not a copy.

## Compression and gating

`maxiDynamics` is the current class: two-band time constants, RMS or peak detection, and
lookahead.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiDynamics dyn;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    dyn.setAttackLow(1);          // ms
    dyn.setReleaseLow(50);
    dyn.setAttackHigh(10);
    dyn.setReleaseHigh(200);
    dyn.setLookAhead(2);          // ms
    dyn.setRMSWindowSize(10);     // ms
    dyn.setInputAnalyser(maxiDynamics::RMS);
}

void play(double *output) {
    const double dry = osc.sawn(110.0) * 0.5;
    // compress(signal, threshold in dB, ratio, knee in dB)
    const double w = dyn.compress(dry, -18.0, 4.0, 5.0);
    output[0] = w;
    output[1] = w;
}
```

`17.Compressor` modulates the threshold and ratio with envelopes, which is the interesting
use: a compressor whose character moves over time.

The older `maxiDyn` has `gate()` and `compressor()` where attack and release are
**coefficients near 1.0, not milliseconds**. Read it, do not write it.

## Panning and mixing

`maxiMix::stereo(input, vector<double>&, pan)` writes into a caller-owned vector of two
values; `pan` is 0–1 with equal power at the extremes.

```cpp
#include "maximilian.h"

maxiOsc noise;
maxiOsc panner;
maxiMix mixer;
std::vector<double> frame(2, 0.0);

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double pan = (panner.sinewave(0.5) + 1.0) * 0.5;   // 0..1
    mixer.stereo(noise.noise(), frame, pan);
    output[0] = frame[0] * 0.2;
    output[1] = frame[1] * 0.2;
}
```

## Chain order

The conventional order is source → filter → distortion → modulation → delay/reverb →
compressor → output. But the useful rule is: **compression and limiting last**, so nothing
after them can undo their gain control, and **reverb last of the time-based effects**, so
the delay tail is inside the reverb rather than the other way round.

## Traps

- `maxiDelayline` and the chorus/flanger `delay` arguments are **sample counts**, not
  milliseconds. Multiply by `maxiSettings::sampleRate` yourself.
- Feedback at or above 1.0 accumulates without bound. The library will not stop you.
- `playStereo()` returns a pointer into the object's own storage — copy it if you need it
  beyond the current sample.
- Distortion changes level. Re-check peak after adding one; this is exactly what the
  verification harness measures.

Signatures: [api.md](../../reference/api.md#5-effects). Examples: `16.Replicant` (delay),
`23.Chorus`, `24.Flanger`, `17.Compressor`, `11.Mixing`.
