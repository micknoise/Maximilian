---
name: maximilian-analysis
description: Use when analysing audio in Maximilian rather than producing it - FFT and inverse FFT, spectral centroid and magnitudes, MFCC, Bark-scale loudness, RMS, zero-crossing rate, envelope following, onset detection, or printing values while audio runs. Explains the hop-rate gate pattern that every spectral sketch depends on.
---

# Analysis

Analysis code has one structural rule that everything else follows: **spectral work happens
once per hop, audio happens once per sample.** Get that wrong and the whole thing is either
garbled or too slow.

## The gate pattern

`maxiFFT::process()` returns `true` only when a new frame is ready.

```cpp
#include "maximilian.h"
#include "maxiFFT.h"

maxiOsc osc;
maxiFFT fft;
double centroid = 0.0;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    fft.setup(1024, 512, 1024);        // fftSize, hopSize, windowSize
}

void play(double *output) {
    const double x = osc.sinewave(440.0) * 0.5;

    if (fft.process(static_cast<float>(x))) {   // ~86 times a second, not 44100
        centroid = fft.spectralCentroid();
    }

    output[0] = x;                              // audio leaves every sample
    output[1] = x;
}
```

Note the cast to `float`: the whole spectral layer is `float`, the rest of the library is
`double`.

| Call | Returns |
|---|---|
| `setup(fftSize=1024, hopSize=512, windowSize=0)` | configure; 0 means "same as fftSize" |
| `process(value, mode)` | `bool` — true on a new frame |
| `getMagnitudes()` / `getMagnitudesDB()` | `std::vector<float>&`, length `fftSize/2` |
| `getPhases()` | `std::vector<float>&` |
| `spectralCentroid()` | `double`, in Hz — a rough brightness measure |
| `getNumBins()`, `getFFTSize()`, `getHopSize()`, `getWindowSize()` | ints |

**The vectors are borrowed.** `getMagnitudes()` returns a reference to internal storage that
is overwritten at the next hop. If you need the values later, copy them inside the gate:
`magnitudes = fft.getMagnitudes();` where `magnitudes` is your own
`std::vector<float>` — a copy, not a reference.

## Resynthesis

`maxiIFFT::process(magnitudes, phases)` reconstructs audio from a spectrum you supply,
called at **audio rate**. The pattern is: analyse outside, modify the arrays, then inverse
every sample.

`20.FFT_example` does a crude bin-shift with this. Be aware that example includes
`libs/maxim.h`, which does not build on 32-bit targets — include `maxiFFT.h` instead.

## Cheap analysis, no FFT needed

| Class | Call | What it gives you |
|---|---|---|
| `maxiRMS` | `setup(maxLengthMs, windowSizeMs)`, `.play(x)` | running RMS — level |
| `maxiZeroCrossingRate` | `.play(x)` | crossings per sample — pitch/percussiveness |
| `maxiZeroCrossingDetector` | `.onZX(x)` | fires on a sign change |
| `maxiEnvelopeFollowerType<T>` | `setAttack`, `setRelease` | smoothed amplitude |
| `maxiSampleAndHold` | `.play(trigger)` | capture a value on a trigger |

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiRMS rms;
maxiZeroCrossingRate zcr;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    rms.setup(50, 40);        // max length ms, window ms
}

void play(double *output) {
    const double x = osc.sinewave(440.0) * 0.5;
    const double level = rms.play(x);
    const double rate = zcr.play(x);
    (void)level;
    (void)rate;
    output[0] = x;
    output[1] = x;
}
```

## Printing while audio runs

Never `cout` from `play()` — that is 44,100 prints a second. `maxiPoll` prints at a fixed
rate and **returns its input**, so it can wrap an expression without changing it.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiRMS rms;
maxiPoll poll;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    rms.setup(50, 40);
}

void play(double *output) {
    const double x = osc.sinewave(440.0) * 0.5;
    const double level = poll.poll(rms.play(x), 4.0, "rms: ");
    output[0] = x;
    output[1] = x;
    (void)level;
}
```

`22.Analysis` uses three of these side by side, which is the intended workflow.

## Perceptual analysis

- `maxiMFCCAnalyser` (`#include "maxiMFCC.h"`) — mel-frequency cepstral coefficients, fed a
  normalised spectrum from `maxiFFT`.
- `maxiBarkScaleAnalyser` (`#include "maxiBark.h"`) — `specificLoudness`,
  `relativeLoudness`, `totalLoudness`, each taking a `float*` spectrum and returning
  `double*`.

Both assume a spectrum in the layout `maxiFFT` produces. They are the basis of the browser
analysis examples (`20-analysis-MFCC.html`, `27-MFCCs.html`) and are worth reading before
you reach for an external DSP library.

## Traps

- **Do the work inside the gate.** Anything expensive outside `if (fft.process(x))` runs
  512 times more often than it needs to.
- **Copy borrowed vectors.** A reference obtained in one hop is stale in the next.
- **`float` vs `double`.** The spectral layer is `float`. Casting `double` to `float` is
  required at the boundary; forgetting it is a compile error, not a subtle bug, which is
  the good case.
- **Bin resolution.** A 1024-point FFT at 44.1 kHz has 43 Hz bins. Two notes a semitone
  apart near the bottom of the piano land in the same bin. Use a bigger FFT or a different
  method if you need pitch, not timbre.
- **Analysis of silence** returns zeros; guard divisions by magnitude sums.

Signatures: [api.md](../../reference/api.md#8-analysis). A working, asserted example:
[`agents/verify/cases/fft_pitch.cpp`](../../verify/cases/fft_pitch.cpp) proves a 440 Hz
sine's spectral centroid is 440 Hz ±10%.
