---
name: maximilian-sequencing
description: Use when timing something in Maximilian - a beat clock, a step sequencer, a drum pattern, an arpeggio, or anything that must happen "every 16th" or "once per bar". Covers maxiClock, the phasor counter idiom, maxiStep, maxiRatioSeq and maxiCounter.
---

# Sequencing and timing

Four ways to make something happen, in order of preference.

| Approach | Uses | Tempo-aware | Use when |
|---|---|---|---|
| `maxiClock` | `#include "maxiClock.h"` | yes, in BPM | anything musical |
| `maxiRatioSeq` | `maximilian.h` only | no, but ratio-exact | polyrhythms, tuplets, pattern ratios |
| `maxiStep` | `maximilian.h` only | no | stepping through a list of values |
| phasor counter | `maximilian.h` only | no | demos, quick tests |

## The clock

`ticker()` must be called every sample. Afterwards `tick` is true for exactly one sample.

```cpp
#include "maximilian.h"
#include "maxiClock.h"

maxiClock beatClock;
maxiOsc osc;
int step = 0;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    beatClock.setTicksPerBeat(4);    // 16th notes in 4/4
    beatClock.setTempo(120.0);       // BPM
}

void play(double *output) {
    beatClock.ticker();              // every sample, unconditionally
    if (beatClock.tick) {            // one sample per 16th
        step = (step + 1) % 16;
    }
    const double w = osc.sinebuf(220.0) * 0.2;
    output[0] = w;
    output[1] = w;
}
```

`clock.playHead` / `getPlayHead()` counts ticks; `getCurrentCount()` gives the position in
the bar. This is the class to teach from, but note that `7.Counting1` — the example that
documents it — does not compile because it forgets the include. The code above does.

## Step sequencing: values

`maxiStep::pull(trigger, values, step)` returns a value and advances on each positive zero
crossing of the trigger. This is the cleanest way to sequence pitches.

```cpp
#include "maximilian.h"

maxiOsc clockPhase;
maxiOsc voice;
maxiStep pitch;
maxiRatioSeq rhythm;
maxiEnvGen amp;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    amp.setup({0.0, 1.0, 0.0}, {2, 120}, {1, 1}, false);
}

void play(double *output) {
    const double phase = clockPhase.phasor(2.0);          // one bar every 2 s
    const double trig = rhythm.playTrig(phase, {3, 3, 2}); // two dotted + one
    const double freq = pitch.pull(trig, {220.0, 330.0, 440.0, 550.0}, 1.0);
    const double w = voice.sinebuf(freq) * amp.play(trig) * 0.25;
    output[0] = w;
    output[1] = w;
}
```

## Rhythm from ratios: `maxiRatioSeq`

`playTrig(phase, times)` divides one phasor period into the proportions in `times`.

| `times` | Result in 4/4 |
|---|---|
| `{1,1,1,1}` | four beats |
| `{2,2,2,1,1}` | three half-notes then two quarters |
| `{3,3,2}` | two dotted beats then one beat |
| `{4,4,4,1,1,1,1}` | three beats then four 16ths |
| `{1}` | one whole bar |

Ratios are not limited to integers: a modulated ratio (`{maxiMap::linlin(x,0,1,1,3), 2}`)
gives swing-like behaviour. This is the most "musical" sequencer in the library and it
needs no extra include.

## Drum patterns

The canonical drum machine is an array of 0/1 plus a step index, triggering one-shot
samples. From `18.DrumMachine`:

```cpp
#include "maximilian.h"

maxiSample kick;
maxiSample snare;
maxiOsc metronome;
int playHead = 0;
const int kickHit[16]  = {1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0};
const int snareHit[16] = {0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0};

void setup() {
    maxiSettings::setup(44100, 2, 512);
    // paths are relative to the working directory, not this source file
    kick.load("kick.wav");
    snare.load("snare.wav");
}

void play(double *output) {
    const int tick = static_cast<int>(metronome.phasor(8.0));   // 8 steps per second
    if (tick == 1) {
        if (kickHit[playHead % 16]) kick.trigger();
        if (snareHit[playHead % 16]) snare.trigger();
        ++playHead;
    }
    const double w = (kick.playOnce() + snare.playOnce()) * 0.5;
    output[0] = w;
    output[1] = w;
}
```

`trigger()` rewinds the sample; `playOnce()` plays from there without looping. That pair is
the whole one-shot idiom — calling `playOnce()` alone plays a sample once per program.

## Counting events: `maxiCounter`

`count(incTrigger, resetTrigger)` increments on the first trigger and resets on the second.
Simpler than a clock when you only need "how many times has this happened".

## Traps

- `clock.ticker()` **every** sample. Calling it only inside `if` is the classic bug.
- The phasor counter is sample-rate independent but **tempo-free**: `phasor(8)` is 8 ticks
  per second at any BPM. That is why the counting examples never mention tempo.
- `(int)phasor(f)` yields 0 for the whole first period, so a "value changed" test fires
  late. Use `maxiClock` or `maxiStep` for anything that must land on the beat.
- All the ratio/step triggers fire on **positive zero crossings**, so they need a signal
  that actually returns to negative values.

Examples: `7.Counting1` (does not build), `8.Counting2/3/4`, `9.Envelopes3`,
`18.DrumMachine`. See [examples-map.md](../../reference/examples-map.md). Details:
[api.md](../../reference/api.md#9-sequencing-and-timing).
