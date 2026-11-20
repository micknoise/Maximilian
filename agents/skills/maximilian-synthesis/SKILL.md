---
name: maximilian-synthesis
description: Use when building a sound, an instrument, a synth voice, or a drum voice in Maximilian - oscillators, envelopes, filters and how to combine them into a mono or polyphonic voice. Covers maxiOsc, maxiPolyBLEP, maxiEnvGen, maxiEnv, maxiFilter, maxiSVF, maxiBiquad and the canonical signal chain.
---

# Building a voice

The chain is always the same shape:

```
oscillator(s) -> filter -> amplitude envelope -> effects -> output[c]
                     ^
              filter envelope / LFO
```

## Step 1: the oscillator

One `maxiOsc` can make any waveform; the waveform is the method name.

```cpp
#include "maximilian.h"

maxiOsc osc;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double w = osc.saw(110.0) * 0.2;
    output[0] = w;
    output[1] = w;
}
```

- `.sinewave(f)`, `.saw(f)`, `.square(f)`, `.triangle(f)`, `.pulse(f, duty)`,
  `.noise()`, `.phasor(f)`.
- `.sawn(f)` is the band-limited saw and `.sinebuf(f)` the cheap wavetable sine — prefer
  these once you are stacking voices, because naive shapes alias.
- Frequency is passed **per sample**, so modulation is just addition:
  `.sinewave(440 + lfo.sinebuf(5) * 4)`.

For a cleaner anti-aliased oscillator use `maxiPolyBLEP` (`#include "maxiPolyBLEP.h"`),
`setWaveform(maxiPolyBLEP::Waveform::SAWTOOTH)`, then `.play(hz)`.

## Step 2: the amplitude envelope

`maxiEnvGen` is the one to write new code with. Levels are one element longer than times
and curves.

```cpp
#include "maximilian.h"

maxiEnvGen env;
maxiOsc osc;
maxiOsc gate;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    // attack 5ms to 1.0, decay 120ms to 0.4, release 400ms to 0
    env.setup({0.0, 1.0, 0.4, 0.0}, {5, 120, 400}, {1, 1, 1}, false);
}

void play(double *output) {
    const double amp = env.play(gate.impulse(2.0));   // retriggers twice a second
    const double w = osc.sinebuf(220.0) * amp * 0.25;
    output[0] = w;
    output[1] = w;
}
```

**The trigger is a signal, and it fires on a positive zero crossing.** A constant `1.0`
opens the envelope once and never again. `gate.impulse(n)` gives `n` triggers per second.

For a percussive shape, use a short attack and a long decay and pass `{0,1,0}` — the third
level is 0 so it lands on silence.

## Step 3: the filter

`vcf.lores(source, 1200.0, 5.0)` — input, cutoff in Hz, resonance.

| Class | Cutoff | Use |
|---|---|---|
| `maxiFilter::lores/hires/bandpass` | **Hz** | one-pole resonant, cheap, classic |
| `maxiFilter::lopass/hipass` | **0–1** | very cheap, no resonance — different units! |
| `maxiSVF` | Hz via `setCutoff` | 2-pole state variable, smooth modulation, mix lp/bp/hp/notch |
| `maxiBiquad` | Hz via `set(type, hz, Q, gain)` | exact RBJ biquad, 7 response types |

Filter cutoff is often swept by the same envelope as the amplitude — that is the whole
trick behind a "synth" sound. Here is the complete chain, which is the shape every voice
takes:

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiOsc gate;
maxiEnvGen env;
maxiFilter vcf;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    env.setup({0.0, 1.0, 0.2, 0.0}, {5, 200, 300}, {1, 1, 1}, false);
}

void play(double *output) {
    const double e = env.play(gate.impulse(2.0));
    const double tone = vcf.lores(osc.saw(110.0), 200.0 + e * 4000.0, 6.0);
    const double w = tone * e * 0.2;
    output[0] = w;
    output[1] = w;
}
```

## Polyphony

There is no built-in voice allocator. The idiom is arrays plus a round-robin index, exactly
as `15.polysynth` does it:

```cpp
#include "maximilian.h"

const int kVoices = 6;
maxiOsc osc[kVoices];
maxiEnv env[kVoices];
int nextVoice = 0;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    for (int i = 0; i < kVoices; ++i) {
        env[i].setAttack(5);
        env[i].setDecay(150);
        env[i].setSustain(0.4);
        env[i].setRelease(300);
    }
}

void play(double *output) {
    // note-on: whoever asks for a voice gets the next one
    const int voice = nextVoice;
    nextVoice = (nextVoice + 1) % kVoices;
    env[voice].trigger = 1;

    double mix = 0.0;
    for (int i = 0; i < kVoices; ++i) {
        mix += osc[i].sinebuf(110.0 * (i + 1)) * env[i].adsr(1.0, env[i].trigger);
        env[i].trigger = 0;            // note-off next sample unless retriggered
    }
    const double w = (mix / kVoices) * 0.5;
    output[0] = w;
    output[1] = w;
}
```

Rules for polyphony: divide by the voice count (or you clip), trigger and release inside
the same function, and keep the per-voice work allocation-free.

## Drum voices

Two options:

- **From primitives**: a sine with a pitch envelope for a kick, noise through a band-pass
  with a very short decay for a snare, high-passed noise for a hat. Cheap and controllable.
- **The shipped synth classes** (`maxiKick`, `maxiSnare`, `maxiHats`, `maxiSampler`, in
  `#include "maxiSynths.h"`): `trigger()` then `play()` per sample.

```cpp
#include "maximilian.h"
#include "maxiSynths.h"

maxiKick kick;
maxiOsc metronome;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    kick.setRelease(200);
}

void play(double *output) {
    const int tick = static_cast<int>(metronome.phasor(2.0));
    if (tick == 1) kick.trigger();
    const double w = kick.play() * 0.8;
    output[0] = w;
    output[1] = w;
}
```

## Traps

- Envelope times are **milliseconds** in `setAttack(ms)`, but **coefficients near 1.0** in
  the long `adsr(input, a, d, s, r, hold, trigger)` overload. Do not mix them.
- `maxiEnvGen::setup()` returns `bool` — check it. A wrong array length fails silently.
- A resonant filter near Nyquist is unstable by mathematics, not by bug.
- Aliasing: use `sawn`, `sinebuf`, or `maxiPolyBLEP` for anything bright or high.

Full signatures: [api.md](../../reference/api.md#2-oscillators). Failure modes:
[pitfalls.md](../../reference/pitfalls.md). Worked examples: `14.monosynth`,
`15.polysynth`, `9.Envelopes1` in [examples-map.md](../../reference/examples-map.md).
