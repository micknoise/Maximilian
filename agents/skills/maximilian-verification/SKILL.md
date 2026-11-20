---
name: maximilian-verification
description: Use when you need to prove that Maximilian DSP code is correct, or when audio cannot be listened to (CI, headless machine, remote agent). Covers the offline render harness in agents/verify, how to add a case, what to assert (peak, RMS, DC, spectral centroid), rendering a WAV to listen to later, and the compile checks in tools/check-docs.py.
---

# Verification without speakers

Maximilian has no audio I/O of its own. That is normally stated as a limitation; here it is
the feature. `play()` is a pure function of object state, so you can call it in a loop and
**measure** the result. No driver, no device, no one listening.

This is how an agent proves it did not break the DSP.

## The harness

```sh
cd agents/verify
./run.sh          # Linux / macOS
./run.ps1         # Windows PowerShell
```

Each case is a normal sketch — `setup()` and `play()` — plus one function that states what
must be true of the rendered audio. The harness renders, measures, and exits non-zero if the
claim is false.

```
sine_440        frames=44100 samples=88200 peak=0.500000 rms=0.353576 dc=0.000000
                expected peak=0.500000 rms=0.353553 (tol 0.0020)
                PASS
```

## What to assert

Prefer physics over snapshots. A recorded golden value tells you "it changed"; a physical
relation tells you "it is wrong".

| Property | Assert against | Tells you |
|---|---|---|
| peak | expected amplitude | gain staging, clipping |
| RMS | `amplitude / sqrt(2)` for a sine | the tone is actually a sine |
| DC | ~0 | filter offset, stuck state |
| spectral centroid | the input frequency | the FFT and windowing work |
| silence after a one-shot | `rms < tiny` | envelopes actually close |
| finiteness | `std::isfinite` | a filter blew up |
| energy ratio | envelope reduces RMS vs ungated | the envelope is wired up |

For noise or filtered noise, assert **bounds** and **invariants** (finite, not silent, peak
below the rail, no DC) — never an exact RMS. Asserting a number for filtered noise is
asserting your random number generator, which proves nothing about the filter.

## Adding a case

Create `agents/verify/cases/my_case.cpp`:

```cpp
#include "harness.h"
#include "maximilian.h"

maxiOsc osc;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double w = osc.sinewave(220.0) * 0.25;
    output[0] = w;
    output[1] = w;
}

int caseCheck(const maxiMetrics &m) {
    // 0.25 amplitude: peak 0.25, RMS 0.25/sqrt(2) = 0.176777
    if (m.peak < 0.24 || m.peak > 0.26) return 1;
    if (m.rms < 0.17 || m.rms > 0.18) return 1;
    return 0;
}
```

(The real files live one directory down and therefore include `"../harness.h"`.)

Then add it to `run.sh`, `run.ps1` and `CMakeLists.txt`. Run it. If it fails, you have
learned something about your DSP, which is the point.

## Listening later

The harness can write what it rendered:

```sh
./build/sine_440 --seconds 2 --wav /tmp/sine.wav
```

Sixteen-bit stereo WAV, ready to open in anything. Useful when you want to hear a
suspicion after reading a number that surprised you.

## Compile checks

Two mechanical checks that catch most "the docs lied" and "the example rotted" errors:

```sh
# every fenced cpp block in AGENTS.md and agents/** must compile
python tools/check-docs.py

# every shipped example, as a translation unit
cd cpp/commandline/maximilian_examples
for d in */; do g++ -std=c++17 -fsyntax-only -I ../../../src -I ../../../src/libs \
  "$d/main.cpp" || echo "BROKEN: $d"; done
```

`check-docs.py` also verifies that every `maxi*` identifier named in the documentation exists
in the headers, so a renamed class cannot hide in prose.

## What this does not prove

Be honest about the boundary:

- It does not prove the sound is **good**, only that it is what you specified.
- It does not test the host, the driver, or the sample-rate negotiation.
- It does not exercise the browser or embedded builds.
- A passing case with a wrong expectation proves nothing. The expectation is the
  interesting part; write down the reasoning in a comment, as the shipped cases do.

## Checklist

- [ ] `run.sh` / `run.ps1` passes before you claim a change works.
- [ ] New DSP has a case, or a stated reason it cannot have one.
- [ ] Assertions are physical, not magic numbers with no explanation.
- [ ] `python tools/check-docs.py` passes if you touched documentation.

Harness: [agents/verify/README.md](../../verify/README.md). Cases:
[`sine_440`](../../verify/cases/sine_440.cpp) (exact),
[`adsr_gate`](../../verify/cases/adsr_gate.cpp) (energy),
[`filtered_noise`](../../verify/cases/filtered_noise.cpp) (bounds),
[`fft_pitch`](../../verify/cases/fft_pitch.cpp) (spectral).
