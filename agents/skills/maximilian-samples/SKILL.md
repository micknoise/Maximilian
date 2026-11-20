---
name: maximilian-samples
description: Use when playing back, looping, chopping, pitch-shifting or recording an audio file in Maximilian. Covers maxiSample loading WAV and OGG, one-shot triggering, speed and position control, sub-range looping, normalising and trimming, and what to do about recording since maxiRecorder no longer exists.
---

# Working with audio files

`maxiSample` holds a whole file in memory as `double` and plays it back one sample per
call. WAV is native; OGG goes through the vendored `stb_vorbis`.

## Load and play

```cpp
#include "maximilian.h"

maxiSample clip;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    // relative to the WORKING DIRECTORY, not to this source file
    if (!clip.load("beat2.wav")) {
        printf("could not load beat2.wav\n");
    }
    clip.normalise(0.9);            // scale so the peak is 0.9
}

void play(double *output) {
    double w = 0.0;
    if (clip.isReady()) {
        w = clip.play() * 0.8;      // play() LOOPS by default
    }
    output[0] = w;
    output[1] = w;
}
```

Always check the `bool` from `load()` and `isReady()`. A missing file is silence, not an
error, so unchecked code fails silently.

## The playback methods

| Method | Behaviour |
|---|---|
| `play()` | speed 1, **looping** |
| `playAtSpeed(speed)` | looping at a speed multiplier (0.5 = octave down) |
| `playOnce()` | plays once then silence until re-armed |
| `trigger()` | rewinds to the start (use with `playOnce`) |
| `setPosition(pos)` | seek to 0–1 |
| `playLoop(start, end)` | loop a normalised 0–1 sub-range |
| `playUntil(end)` | play from the start to a normalised end point |
| `playWithPhasor(pha)` | position driven directly by a 0–1 signal |

## One-shots: the drum-machine idiom

```cpp
#include "maximilian.h"

maxiSample hit;
maxiOsc metronome;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    hit.load("snare.wav");
}

void play(double *output) {
    const int tick = static_cast<int>(metronome.phasor(2.0));
    if (tick == 1) hit.trigger();       // rewind
    const double w = hit.playOnce() * 0.8;   // play from there, no loop
    output[0] = w;
    output[1] = w;
}
```

`trigger()` + `playOnce()` is the whole idiom. `playOnce()` does not restart on its own.

## Chopping and stretching

- **Seek**: `sample.setPosition(0.5)` jumps to the middle.
- **Loop a region**: `sample.playLoop(0.0, 0.25)` loops the first quarter.
- **Pitch/speed**: `playAtSpeed(2.0)` is an octave up, `0.5` an octave down. This changes
  pitch and duration together (it is tape speed, not time-stretch).
- **Trigger on a beat**: `playOnZX(trigger)`, `playOnZXAtSpeed(trig, speed)`,
  `loopSetPosOnZX(trigger, position)`.

For independent time-stretch and pitch-shift you need the granular layer — see the
`maximilian-granular` skill.

## Preparing a sample

| Call | Effect |
|---|---|
| `normalise(maxLevel)` | scale the buffer so the peak equals `maxLevel` |
| `autoTrim(alpha, threshold, trimStart, trimEnd)` | cut leading/trailing silence |
| `getLength()` | length in samples |
| `getSummary()` | printable description — useful in `setup()` |
| `loadOgg(path)` | same as `load()`, for OGG |

Do this in `setup()`, never in `play()`: `normalise` and `autoTrim` walk the whole buffer.

## Recording

**`maxiRecorder` does not exist in this tree**, although `21.Recording` still uses it. That
example does not compile. Recording has to be done by the host: capture the `output` buffer
in your callback and write it yourself once the stream stops.

If you need this, the honest pattern is to keep a pre-allocated `std::vector` of the
recorded frames, append in `play()`, and write a WAV in your host after the stream ends —
the same 100 lines `agents/verify/harness.cpp` uses to write its debug WAV.

## Memory

A `maxiSample` is the entire file as `double`. Three minutes of 44.1 kHz stereo is about
63 MB. On an MCU, use short mono one-shots, or stream from flash yourself reading
`getLength()` and a position index.

## Traps

- Paths resolve against the working directory. The shipped examples use `../../../` because
  they run from a `build` subfolder — that is not a bug, it is where they run from.
- `play()` loops. If you hear a sound repeating, you wanted `playOnce()`.
- `load()` returns `false` on failure and leaves the object empty; nothing is thrown.
- `setPosition` takes 0–1, `playLoop` takes 0–1, but `playAtSpeedBetweenPoints` takes
  **samples**. Check the signature before you pass a value.

Signatures: [api.md](../../reference/api.md#7-samples). Examples: `12.SamplePlayer`,
`18.DrumMachine`, `21.Recording` (broken). See [examples-map.md](../../reference/examples-map.md).
