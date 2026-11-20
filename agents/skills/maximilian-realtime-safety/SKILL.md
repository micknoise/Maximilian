---
name: maximilian-realtime-safety
description: Use before writing or reviewing any code that runs inside Maximilian's audio callback - play() or an audioWorklet/AudioStream callback. Covers allocation, locking, logging and file I/O on the audio thread, parameter smoothing, atomic sharing with the UI thread, buffer reuse, denormals, clipping and the specific ways this codebase makes those mistakes easy.
---

# Real-time safety

`play()` runs on the audio thread. It has a deadline of one sample period — about 22.6
microseconds at 44.1 kHz — and it must never miss it. When it misses, the buffer underruns
and the listener hears a click, not an error message.

This is the discipline that separates a demo from an instrument.

## The rule

> After `setup()` has returned, the audio thread may only do arithmetic on data that is
> already in cache.

Everything else — allocation, free, locks, I/O, logging, exceptions, `std::function` with a
heap-allocated closure, `std::string` construction — is a potential glitch.

| Never in `play()` | Why | Do instead |
|---|---|---|
| `new`, `delete`, `malloc`, `realloc` | the allocator takes a lock | allocate in `setup()`, keep capacity |
| `std::vector::push_back` that may grow | may reallocate | `reserve()` in `setup()`, index into it |
| `std::string` concatenation | allocates | pre-format in `setup()` |
| `cout`, `printf`, `ofLog` | syscall, can block | `maxiPoll::poll(x, 4.0)` |
| file access, `maxiSample::load` | syscall, unbounded | `setup()` |
| `std::mutex`, `lock_guard` | can block on the UI thread | `std::atomic` + smoothing |
| `throw` / `catch` | unwinding is unbounded | return a status, fail in `setup()` |
| `sin`/`cos` in a big inner loop | slow, adds up | `sinebuf` / `sinebuf4` tables |
| unbounded recursion | stack | loops |

## Sharing parameters with a UI thread

Use atomics for the value, and smooth inside the audio thread so a knob jump does not
click. One atomic *store* per UI event and one atomic *load* per sample is lock-free on
every platform this library targets.

```cpp
#include "maximilian.h"
#include <atomic>

maxiOsc osc;
maxiFilter filter;

std::atomic<double> requestedCutoff{1000.0};   // written by the UI thread
double smoothedCutoff = 1000.0;                // owned by the audio thread

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double target = requestedCutoff.load(std::memory_order_relaxed);
    // one-pole smoothing: ~0.1 % per sample is about 20 ms at 44.1 kHz
    smoothedCutoff += (target - smoothedCutoff) * 0.001;

    const double w = filter.lores(osc.saw(110.0), smoothedCutoff, 2.0) * 0.2;
    output[0] = w;
    output[1] = w;
}
```

Never smooth with a branch that jumps the whole way (`if (target != current) current =
target;`) — that is a click.

## Doing work at control rate, not audio rate

If something is expensive, do it once per block instead of once per sample. The library
gives you `maxiSettings::bufferSize` for exactly this, and `maxiClock`/`maxiOsc::impulse`
to rate-limit work.

```cpp
#include "maximilian.h"

maxiOsc osc;
maxiEnvGen env;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    env.setup({0.0, 1.0, 0.0}, {10, 400}, {1, 1}, false);
}

void play(double *output) {
    // The envelope is cheap: three multiplies. That is fine per sample.
    // Anything with a loop over 512 bins would not be, and belongs behind a counter.
    static int counter = 0;
    static double cachedAmp = 0.0;
    if (counter == 0) {
        cachedAmp = env.play(1.0);      // recompute once per block
    }
    counter = (counter + 1) % static_cast<int>(maxiSettings::bufferSize);

    const double w = osc.sinebuf(220.0) * cachedAmp * 0.25;
    output[0] = w;
    output[1] = w;
}
```

`static` locals are fine here because this is a single audio thread; if that assumption ever
changes, make them members instead.

## Numbers that go wrong quietly

- **Denormals.** A decaying filter can reach values like 1e-40, which many CPUs handle in
  hardware but some — especially ARM without flush-to-zero — handle thousands of times
  slower. Add a tiny noise floor, or flush in `setup()` with the platform's FTZ/DAZ controls.
- **Clipping.** Overlapping voices sum. Four voices at 0.5 is 2.0. Divide by the voice count
  or put a limiter last. Clipping in the float domain is distortion, not an error.
- **NaN propagation.** One `sqrt` of a negative or a filter that blew up poisons everything
  downstream, and the only symptom is silence. Assert finiteness in your tests — the
  verification harness checks `std::isfinite` for exactly this reason.
- **State that is never reset.** A triggered envelope that is never retriggered, or a
  `maxiSample` left mid-file, produces "it worked once" bugs.

## This codebase makes it easy to get wrong

Two design facts you must work around rather than fight:

1. **`play(double*)` gives you no information about time or buffer size.** There is no
   timestamp and no frame count. If you need either, your host must record it before
   calling you.
2. **`maxiSample` holds whole files in memory and loads on demand**, so it is tempting to
   load from the callback. Do not. Load in `setup()`, or switch buffers with an atomic index
   and a pre-load.

`14.monosynth` — the teaching example — calls `cout << "tick"` inside `play()`. It is
documented there as a teaching aid, and it is exactly what not to do in an instrument.

## Checklist before shipping audio code

- [ ] No allocation, free, lock, log, file I/O or exception inside `play()`.
- [ ] Every parameter from the UI is atomic and smoothed.
- [ ] Voice sum is divided by the voice count.
- [ ] No NaN can escape: guard divisions, `sqrt`, `log`, filter feedback.
- [ ] Feedback coefficients are < 1.
- [ ] Filters stay below ~0.45 × sample rate.
- [ ] A test renders it and asserts peak, RMS and finiteness — see
      `maximilian-verification`.

Background: [pitfalls.md](../../reference/pitfalls.md) P5, P6, P15.
