---
name: maximilian-orientation
description: Use when starting any task in the Maximilian repository, or when writing C++ that links maximilian.h, and you need to know how the library is structured, what the setup()/play() contract is, which layer code belongs in, and how to prove a change works. Load this first; the other Maximilian skills assume it.
---

# Maximilian orientation

Maximilian is a dependency-free C++ audio synthesis library. You do not write a program:
you write two functions and a host calls them.

## The contract

```cpp
#include "maximilian.h"

void setup() {
    maxiSettings::setup(44100, 2, 512);   // rate, channels, buffer - call this FIRST
}

void play(double *output) {               // called once per sample, 44100x a second
    output[0] = 0.0;                      // left
    output[1] = 0.0;                      // right
}
```

`output` is pre-allocated and reused. Write every channel you declared. Never allocate,
log, or touch the file system inside `play()`.

## Which layer

| You need | Include | Layer |
|---|---|---|
| oscillators, filters, envelopes, delays, mixing, analysis | `"maximilian.h"` | core, no dependencies |
| FFT, grains, MFCC, Bark, clock, reverb, drum synths, convolution | `"maxiClock.h"`, `"maxiFFT.h"`, … | `src/libs/`, optional |

Include the **specific** extended header you need. `libs/maxim.h` is an umbrella that
pulls in granular code which does not build on 32-bit targets.

## The five-minute tour of the API

- Sound generation: `maxiOsc` — one object, many methods (`.sinewave(f)`, `.saw(f)`,
  `.phasor(f)`, `.noise()`).
- Shaping: `maxiEnvGen` (multi-stage, use `setup(levels, times, curves, looping)`),
  `maxiEnv` (older ADSR, public `trigger` field).
- Tone: `maxiFilter` (`.lores(x, hz, res)`), `maxiSVF`, `maxiBiquad`.
- Time: `maxiClock` (tempo) or a `phasor` counter, `maxiStep` (pitches),
  `maxiRatioSeq` (rhythms).
- Files: `maxiSample` (`.load()`, `.play()`, `.playOnce()`).
- Proof: `agents/verify/` renders offline and measures.

Signatures, units and traps: [api.md](../../reference/api.md) and
[pitfalls.md](../../reference/pitfalls.md).

## How to verify a change

There is no audio device in the loop, so this works anywhere:

```sh
cd agents/verify && ./run.sh          # or ./run.ps1 on Windows
```

You can also compile any sketch as a translation unit before you run it:

```sh
g++ -std=c++17 -fsyntax-only -I src -I src/libs sketch.cpp
```

## Before you finish

- [ ] `maxiSettings::setup()` is the first thing in `setup()`.
- [ ] Nothing in `play()` allocates, prints, or blocks.
- [ ] Every output channel is written every call.
- [ ] Units are right: `lores` is Hz, `lopass` is 0–1 (this bites everyone).
- [ ] If you copied an example, it compiles — four do not, see
      [examples-map.md](../../reference/examples-map.md).

## Next

Pick the skill that matches the job: `maximilian-synthesis`, `maximilian-sequencing`,
`maximilian-samples`, `maximilian-effects`, `maximilian-analysis`, `maximilian-granular`,
`maximilian-realtime-safety`, `maximilian-verification`, `maximilian-porting`.
