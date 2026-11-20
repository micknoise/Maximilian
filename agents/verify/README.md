# agents/verify

Offline verification of Maximilian DSP. **No audio device, no audio dependencies.**

## Why

The library's `setup()` / `play()` contract means audio is a pure function of object state.
You can therefore call `play()` in a loop, capture the samples, and check them — which is
how you test DSP on a headless machine, in CI, or from an agent that cannot hear.

The point is to make "it compiles" and "it is correct" two different claims, and to check
the second one.

## Run it

```sh
cd agents/verify
./run.sh              # Linux / macOS
./run.ps1             # Windows
```

or with CMake:

```sh
cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
```

Only `sine_440`:

```sh
./run.sh sine_440
```

Set `CXX` if your compiler is not on `PATH` (on Windows, for example:

```powershell
$env:CXX = "C:\MinGW\bin\g++.exe"
```

).

## The cases

| Case | Renders | Asserts |
|---|---|---|
| `sine_440` | 440 Hz sine, amplitude 0.5 | peak `0.5` and RMS `0.353553` to ±0.002, DC ≈ 0. Exact physics: `RMS = A/√2`. |
| `adsr_gate` | 440 Hz sine gated by a one-shot AR envelope | peak never exceeds 0.5; RMS strictly below the ungated value; not silent. |
| `filtered_noise` | white noise through `lores(800 Hz, Q=2)` | all metrics finite, not silent, peak ≤ 1.2, \|DC\| ≤ 0.05. Bounds, not golden values. |
| `fft_pitch` | 440 Hz sine through `maxiFFT` | spectral centroid within 10 % of 440 Hz, and at least one frame reported. |

Deliberately different in kind: an exact-physics case, an energy-relation case, an invariant
case, and a spectral case. Together they cover the failure modes that matter.

`filtered_noise` is the reason the bounds approach exists: `maxiOsc::noise()` uses the C
library's `rand()`, whose sequence differs between glibc and MinGW. Measured peak is
`0.392` on Windows and `0.347` on Linux for the same case — a golden value would be a test
that fails on someone else's platform for no reason. The bounds hold on both.

## Adding a case

1. Create `cases/<name>.cpp`:

   ```cpp
   #include "../harness.h"
   #include "maximilian.h"

   void setup() { maxiSettings::setup(44100, 2, 512); }

   void play(double *output) {
       // your DSP here
       output[0] = 0.0;
       output[1] = 0.0;
   }

   int caseCheck(const maxiMetrics &m) {
       return 0;   // 0 = pass, non-zero = fail (print why first)
   }
   ```

2. Add it to `run.sh`, `run.ps1` and `CMakeLists.txt`.
3. Run it.

Write down **why** the expected value is expected, in a comment. A case whose expectation
nobody can justify is worse than no case.

## The harness

```
build/<case> [--seconds S] [--rate HZ] [--channels N] [--wav FILE]
```

It calls `maxiSettings::setup()`, then `setup()`, then `play()` `S * rate` times, and prints:

```
frames=44100 samples=88200 peak=0.500000 rms=0.353576 dc=0.000000
PASS
```

`--wav` writes 16-bit PCM stereo so you can listen to what the numbers describe.

`maxiSettings` is configured by the harness *before* the case's `setup()` runs, so filter
coefficients are built at the right rate. If your case needs a different rate, say so and
pass `--rate`.

## Limits, stated plainly

- This proves the audio is what you **specified**, not that it sounds good.
- It does not test the RtAudio host, the device, or the browser/embedded builds.
- It is single-threaded and single-process; `maxiSettings` is global state, so a case that
  changes the sample rate must be its own process (which is how the harness runs them).

## Files

| File | Role |
|---|---|
| `harness.h` | the `maxiMetrics` struct shared with cases |
| `harness.cpp` | `main()`: render, measure, call `caseCheck()`, optional WAV |
| `cases/*.cpp` | one sketch + one assertion each |
| `run.sh`, `run.ps1`, `CMakeLists.txt` | three ways to build the same thing |
