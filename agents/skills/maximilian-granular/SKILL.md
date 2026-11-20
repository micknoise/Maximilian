---
name: maximilian-granular
description: Use when doing granular synthesis, time-stretching, pitch-shifting or atom-based synthesis in Maximilian, or when you need to inspect maxiGrains and maxiAtoms. Covers maxiTimeStretch, maxiStretch, maxiPitchShift, maxiGrainPlayer, window functors and the maxiAtomBookPlayer, plus the 32-bit build problem that currently blocks this layer.
---

# Granular, stretch and atoms

This is the extended layer: `#include "maxiGrains.h"` or `#include "maxiAtoms.h"`.

> **Read this first.** `maxiGrains.h` does not compile on 32-bit targets (MinGW/Win32, and
> most MCUs) because `std::min` is called with a `size_t` and an `unsigned long`, which are
> distinct types there. It compiles on 64-bit Linux and macOS. If you are on a 32-bit
> target, prefer plain `maxiSample` playback or the `playAtSpeed`/`setPosition` methods, and
> see [pitfalls.md](../../reference/pitfalls.md#p2).

## What the layer gives you

| Class | Purpose |
|---|---|
| `maxiGrainWindowCache<F>` | pre-computed windows, one per window functor `F` |
| `maxiGrain` / `maxiGrainBase` | one grain: position, length, speed, envelope |
| `maxiGrainPlayer` | mixes a list of live grains, frees finished ones |
| `maxiTimeStretch<F>` | time-stretch: play a sample slower/faster **without changing pitch** |
| `maxiStretch` | stretch with an explicit loop region |
| `maxiPitchShift` | shift pitch without changing duration |

Window functors to template on, from `maxiGrains.h`:

`hannWinFunctor`, `hammingWinFunctor`, `cosineWinFunctor`, `rectWinFunctor`,
`triangleWinFunctor`, `triangleNZWinFunctor`, `blackmanHarrisWinFunctor`,
`blackmanNutallWinFunctor`, `gaussianWinFunctor`.

`hannWinFunctor` is the sensible default; `rectWinFunctor` will click.

## Shape of a stretch

`maxiTimeStretch<F>` is constructed from a `maxiSample*`, then `play(speed, grainLength,
overlaps, posMod)` every sample.

Because this header does not build on 32-bit targets, the shape is shown as text rather
than as a compiled snippet — run `tools/check-docs.py` on a 64-bit machine to compile it:

```text
maxiSample sample;
maxiTimeStretch<hannWinFunctor> stretch(&sample);   // takes a maxiSample*

setup():   sample.load("beat2.wav");
play():    stretch.play(1.0, 0.05, 2, 0.0)          // speed, grainLength(s), overlaps, posMod
```

- `speed` 1.0 is normal; 0.5 is half speed with **pitch preserved** (this is the difference
  from `maxiSample::playAtSpeed`, which changes both).
- `grainLength` in seconds. 0.02–0.1 s covers most uses: shorter is grainier, longer is
  smeary.
- `overlaps` 2–4. More overlaps means smoother and more CPU.
- `posMod` jitters the read position — a small amount turns a clean stretch into a cloud.

`maxiStretch::playAtPosition(pitchstretch, pos, grainLength, overlaps)` lets you jump to a
position, which is what you want for scrubbing or a granular "freeze".

## Pitch shifting

`maxiPitchShift` is the single-purpose version: feed it a sample and a ratio, get audio with
the pitch moved and the duration kept.

## Grains by hand

`maxiGrainPlayer` is a live list, constructed from a `maxiSample*`. You `addGrain()` new
grains and call `play()` to mix the ones still alive; the player deletes grains as they
finish.

Because `addGrain` takes ownership and `play()` deletes finished grains, **do not allocate
grains inside your audio callback** — that is a `new`/`delete` pair per grain on the audio
thread. Pre-allocate a fixed pool in `setup()` and reuse it, or accept the cost knowingly.
See the `maximilian-realtime-safety` skill.

## Atoms

`maxiAtoms.h` implements Gabor-atom synthesis — a sparse, event-based representation where
each atom has a time, frequency, amplitude and duration, and is scheduled into a queue.

| Class | Role |
|---|---|
| `maxiAtom`, `maxiGaborAtom` | one event |
| `maxiAtomBook` | a collection of atoms to be played |
| `maxiAtomBookPlayer` | schedules and renders a book |
| `maxiCollider`, `maxiAccelerator` | generate and schedule atoms |

This is research code for analysis/resynthesis of transient material. It is the least
documented part of the library (there is no shipped example that builds), so treat the
header as the specification and verify by listening.

## Practical advice

- **Allocate everything before playback.** Grains, windows and temp buffers are large.
- **A `maxiSample` is the whole file in `double`** — stretching a long file is memory-hungry.
- **Watch the peak.** Overlapping grains sum; four grains at 0.5 amplitude is 2.0. Divide by
  the overlap count or you will clip, and clipping here sounds like distortion, not error.
- **Verify numerically.** The `maximilian-verification` skill shows how to assert that a
  stretch at speed 0.5 produces output whose energy lasts about twice as long.

## Traps

- 32-bit builds fail at `maxiGrains.h:170` (see the note at the top).
- `libs/maxim.h` includes grains, so including the umbrella drags this problem into
  unrelated code — including FFT code. Include specific headers.
- The window cache is templated on the functor; a `maxiTimeStretch<hannWinFunctor>` and a
  `maxiTimeStretch<triangleWinFunctor>` are different types and cannot be swapped at runtime.
- Lengths passed to grains are in **samples**, but `play()`'s `grainLength` is in
  **seconds**. Two different units in the same API — check which one you are touching.

Signatures: [api.md](../../reference/api.md#10-granular-extended-include-maxigrainesh). Build
status: [examples-map.md](../../reference/examples-map.md).
