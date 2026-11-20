# AGENTS.md

Guidance for AI coding agents (and new contributors) working in this repository.

Maximilian is a **cross-platform audio synthesis and signal-processing library in C++**.
It is self-contained: the core compiles with no dependencies at all, which is what lets it
run on ESP32, Pi Pico, desktop, iOS and — via Cheerp/Emscripten — in the browser.

This file is the entry point. The detail lives in [`agents/`](agents/README.md), and the
task-shaped instructions live in [`agents/skills/`](agents/skills/).

---

## Five things to do before you change anything

1. **Read the host contract.** You write two functions, not a program:

   ```cpp
   void setup();                 // once, before audio starts
   void play(double *output);    // once per sample, forever
   ```

   The library does not own `main()` and does not open the audio device. In the
   command-line examples that is [player.cpp](cpp/commandline/player.cpp).

2. **Call `maxiSettings::setup()` first**, in `setup()`, before constructing anything.
   Filters and envelopes bake in the sample rate when they are created.

3. **Know which layer you are in.** [src/maximilian.h](src/maximilian.h) is the
   dependency-free core. [src/libs/](src/libs) is the optional extended layer (FFT,
   grains, MFCC, reverb, synths). Do not add dependencies to the core.

4. **Never allocate, log, lock or do file I/O inside `play()`.** It runs 44,100 times a
   second. Use `maxiPoll` to print, `setup()` to allocate.

5. **Verify before you claim.** This library can be tested with no audio device — see
   [Verify](#verify) below. "It compiles" is not "it makes the right sound".

## Reference table

| Question | File |
|---|---|
| How is this codebase put together? | [agents/reference/architecture.md](agents/reference/architecture.md) |
| What does class `X` do, and what units does it take? | [agents/reference/api.md](agents/reference/api.md) |
| Why is my audio silent / crashing / aliasing? | [agents/reference/pitfalls.md](agents/reference/pitfalls.md) |
| How do I do task `Y`? | [agents/reference/api.md](agents/reference/api.md) |
| Which example teaches what, and which still build? | [agents/reference/examples-map.md](agents/reference/examples-map.md) |
| How do I prove my DSP is correct? | [agents/verify/README.md](agents/verify/README.md) |

## Skills

Task-shaped instructions, each a `SKILL.md` in [`agents/skills/`](agents/skills/). Load the
one that matches the job; they are small and cross-reference instead of duplicating.

| Skill | Use when |
|---|---|
| `maximilian-orientation` | starting any task in this repo |
| `maximilian-synthesis` | building an instrument, voice, or sound |
| `maximilian-sequencing` | clocks, steps, ratios, drum patterns |
| `maximilian-samples` | loading, playing, looping, recording audio files |
| `maximilian-effects` | delay, chorus, flanger, distortion, reverb, dynamics |
| `maximilian-analysis` | FFT, spectral features, MFCC, RMS, onset |
| `maximilian-granular` | grains, time-stretch, pitch-shift, atoms |
| `maximilian-realtime-safety` | writing code that will run in the audio callback |
| `maximilian-verification` | proving the DSP is correct without speakers |
| `maximilian-porting` | embedded, JavaScript/Cheerp, openFrameworks, other hosts |

## Build

```sh
# core only - no dependencies, works anywhere with a C++17 compiler
g++ -std=c++17 -O2 -I src -c src/maximilian.cpp -o maximilian.o

# one of the shipped examples (Linux/macOS)
cd cpp/commandline/maximilian_examples/1.TestTone
mkdir -p build && cd build && cmake .. && make && ./maximilian
```

Windows: the command-line CMake path is not wired up
(`maximilianExamples.cmake` ends with `if (WIN32) #TODO`). Build the core only, or use
WSL/MSYS2. Details in [architecture.md](agents/reference/architecture.md#6-build-paths).

## Verify

The library has no audio I/O of its own, so DSP can be rendered offline and measured.
That is the fastest honest check, and it needs no sound card:

```sh
cd agents/verify
./run.sh            # Linux/macOS
./run.ps1           # Windows (PowerShell)
```

A case declares what is true of its output — a 440 Hz sine at amplitude 0.5 has peak
`0.500000` and RMS `0.353553`, and the harness checks exactly that:

```
$ cd agents/verify && ./run.sh
sine_440        frames=44100 samples=88200 peak=0.500000 rms=0.353576 dc=0.000000
                PASS
```

Add a case whenever you add DSP. It is four lines of setup, four of `play()`, and a
handful of comparisons.

## Rules of the road

**Do**

- Match the surrounding style: `double` in, `double` out, per sample, named `play()`.
- Keep the core dependency-free. If it needs a file, a thread or 100 kB of tables, it
  goes in `src/libs/`.
- Add a Doxygen `/*! ... */` comment to every public method you add — `docs/` is
  generated from them.
- Compile an example before you copy its pattern: **four of them are broken** —
  see [examples-map.md](agents/reference/examples-map.md#the-four-that-do-not-build-and-why).
- Use `maxiEnvGen` and `maxiDynamics` for new code; the older `maxiEnv`, `maxiEnvelope`
  and `maxiDyn` are deprecated but must keep working.

**Do not**

- Do not add `using namespace` to any header. `maximilian.h` already does it, and that is
  a wart you should not make worse.
- Do not rename the historic public fields (`maxiFilter::cutoff`, `maxiEnv::trigger`,
  `maxiClock::tick`). Examples and users depend on them.
- Do not reformat files you are not otherwise changing.
- Do not hand-edit `docs/docbuild/xml/` — it is generated by Doxygen.
- Do not hand-edit `docs/*.html` — it is generated by Sphinx, and it is published to
  GitHub Pages by [.github/workflows/static.yml](.github/workflows/static.yml).

## Keeping this file true

Every fenced C++ block in `AGENTS.md` and `agents/**` is compiled by
`tools/check-docs.py`, and every `maxi*` identifier mentioned in them is checked against
the headers. If you change the API, run it:

```sh
python tools/check-docs.py
```

A doc that no longer compiles is a bug. That check is the reason these files can be
trusted, so do not skip it when you edit them.
