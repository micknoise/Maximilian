# Examples map

Every example under `cpp/commandline/maximilian_examples/`, what it teaches, and whether
it still compiles against the headers as they stand.

The status columns are **measured**, not asserted: each `main.cpp` was compiled with
`-fsyntax-only` on both toolchains.

- **Linux** — x86_64, GCC 13.5, C++17
- **Win32** — MinGW GCC 9.2 (mingw32), C++17

Regenerate with:

```sh
for d in cpp/commandline/maximilian_examples/*/; do
  g++ -std=c++17 -fsyntax-only -I src -I src/libs "$d/main.cpp" \
    && echo "PASS $(basename $d)" || echo "FAIL $(basename $d)"
done
```

Totals at the time of writing: **25 / 28 pass on Linux, 24 / 28 on Win32.**

## The map

| # | Example | What it teaches | Key API | Linux | Win32 |
|---|---|---|---|---|---|
| 1 | `TestTone` | the smallest possible sketch | `maxiOsc::sinewave` | pass | pass |
| 2 | `TwoTones` | adding waves, beating | `maxiOsc` | pass | pass |
| 3 | `AM1` | amplitude modulation by multiplication | `maxiOsc` | pass | pass |
| 4 | `AM2` | ring modulation above 20 Hz, sidebands | `maxiOsc::phasorBetween` | pass | pass |
| 5 | `FM1` | frequency modulation, modulation index | `maxiOsc` | pass | pass |
| 6 | `FM2` | stacked modulators | `maxiOsc` | pass | pass |
| 7 | `Counting1` | a tempo-aware clock | `maxiClock` | **fail** | **fail** |
| 8 | `Counting2` | a phasor as a counter | `maxiOsc::phasorBetween` | pass | pass |
| 8 | `Counting3` | conditionals on the counter | `maxiOsc` | pass | pass |
| 8 | `Counting4` | a lookup table of pitches, modulated tempo | `maxiOsc::sawn` | pass | pass |
| 9 | `Envelopes1` | `maxiEnvGen` driving pitch, filter and distortion | `maxiEnvGen`, `maxiSVF`, `maxiNonlinearity`, `maxiPolyBLEP` | pass | pass |
| 9 | `Envelopes2` | envelopes with `HOLD` stages, triggered by a pulse | `maxiEnvGen`, `maxiBiquad` | pass | pass |
| 9 | `Envelopes3` | editing envelope stages live | `maxiEnvGen::setLevel/setCurve/setTime`, `maxiStep`, `maxiRatioSeq` | pass | pass |
| 10 | `Filters` | a resonant one-pole filter + ADSR | `maxiFilter::lores`, `maxiEnv` | pass | pass |
| 11 | `Mixing` | equal-power stereo panning | `maxiMix::stereo` | pass | pass |
| 12 | `SamplePlayer` | loading and playing a WAV | `maxiSample::load/playAtSpeed` | pass | pass |
| 13 | `Advanced-Filters` | a hand-written RBJ biquad, no library filter | raw DSP | pass | pass |
| 14 | `monosynth` | the canonical mono synth voice | `maxiOsc`, `maxiFilter`, `maxiEnv` | pass | pass |
| 15 | `polysynth` | six voices with a round-robin allocator | arrays of the above | pass | pass |
| 16 | `Replicant` | a full sequenced track: arpeggio, lead, delay | `maxiConvert` (`convert`), `maxiDelayline` | pass | pass |
| 17 | `Compressor` | `maxiDynamics` with envelope-driven threshold/ratio | `maxiDynamics`, `maxiEnvGen` | pass | pass |
| 18 | `DrumMachine` | trigger + one-shot sample playback | `maxiSample::trigger/playOnce` | pass | pass |
| 19 | `Enveloping2` | an AR envelope gating a sample | `maxiEnv::ar` | **fail** | **fail** |
| 20 | `FFT_example` | analysis → bin shift → resynthesis | `maxiFFT`, `maxiIFFT` | pass | **fail** |
| 21 | `Recording` | writing audio to disk | `maxiRecorder` | **fail** | **fail** |
| 22 | `Analysis` | RMS, zero-crossing rate, polling values | `maxiRMS`, `maxiZeroCrossingRate`, `maxiPoll` | pass | pass |
| 23 | `Chorus` | envelope-modulated chorus | `maxiChorus` | pass | pass |
| 24 | `Flanger` | envelope-modulated flanger | `maxiFlanger` | pass | pass |

## The four that do not build, and why

These are **pre-existing defects, documented rather than silently copied**. Each is a
small fix, but a documentation patch should not be quietly changing example source, so
they are listed here as known issues.

### 7. `Counting1` — missing include

`maxiClock` lives in `src/libs/maxiClock.h`, and the example includes only
`maxiSynths.h`. The compiler's own hint gives it away:

```
error: 'maxiClock' does not name a type; did you mean 'maxiKick'?
```

Fix: add `#include "maxiClock.h"`. **Teach `maxiClock` from this example's prose, not its
build.**

### 19. `Enveloping2` — removed overload

```
error: no matching function for call to 'maxiSample::play(double)'
```

`maxiSample::play()` takes no arguments in the current API; the `play(position)` form is
gone. Fix: `sound1.play()` (and use `setPosition()` if a position is wanted).

### 20. `FFT_example` — collateral damage from `maxiGrains.h` on 32-bit

The example itself is fine and passes on 64-bit. It includes `libs/maxim.h`, which
includes `maxiGrains.h`, which fails to compile on Win32 — see
[pitfalls.md](pitfalls.md#p2). Fix: include `maxiFFT.h` instead of `libs/maxim.h`.

This is the clearest argument for the include-what-you-need rule: an FFT example being
broken by a granular-synthesis header is a layering accident, not an FFT problem.

### 21. `Recording` — class removed

```
error: 'maxiRecorder' does not name a type
```

`maxiRecorder` is not in this tree. Recording to disk now has to be done by the host.
The prose in this example is still worth reading for the pattern, but it cannot be built.

## How to use this map

- **Learning the library?** Follow it in order; 1 → 22 covers every subsystem.
- **Looking for a pattern to copy?** Use the "Key API" column, then read the matching
  section of [api.md](api.md).
- **Doubtful that an example still works?** Compile it with the loop above before you
  build on it. Two of the four failures are API rot that will silently mislead you.
- **Adding an example?** Copy the smallest neighbour's `CMakeLists.txt` (eight lines) and
  run the loop. If it does not appear as `PASS`, fix it before opening a pull request.
