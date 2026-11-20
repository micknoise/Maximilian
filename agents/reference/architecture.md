# Architecture

Everything an agent (or a new human) needs to know before editing this repository.
Every claim here was checked against the source in this tree; the build claims were
verified with GCC 9.2 (MinGW, Windows) and are marked where they were not.

---

## 1. Two layers, one rule

Maximilian is two libraries that share one set of conventions.

| Layer | Files | Classes | Dependencies |
|---|---|---|---|
| **Core** | `src/maximilian.h`, `src/maximilian.cpp` | `maxiOsc`, `maxiSample`, `maxiFilter`, `maxiSVF`, `maxiBiquad`, `maxiEnvGen`, `maxiDynamics`, `maxiMix`, `maxiDelayline`, `maxiChorus`, `maxiFlanger`, `maxiNonlinearity`, `maxiRingBuf`, `maxiStep`, `maxiRatioSeq`, `maxiZeroCrossingRate`, `maxiRMS`, `maxiPoll`, `maxiMap`, `maxiConvert`, … | **None.** Only the C++ standard library. |
| **Extended** | `src/libs/*.h`, `src/libs/*.cpp` | `maxiFFT`, `maxiIFFT`, `maxiMFCC`, `maxiBark`, `maxiGrains`, `maxiAtoms`, `maxiClock`, `maxiConvolve`, `maxiReverb`, `maxiKick`, `maxiSnare`, `maxiHats`, `maxiSampler` | Core, where it needs it. `src/libs/stb_vorbis.*` is vendored for OGG decoding. |

**The rule:** the core must keep compiling with no dependencies, because it is the layer
that runs on ESP32, Raspberry Pi Pico, and inside the browser builds. Do not move code
from `src/libs/` into `src/maximilian.*`, and do not add an `#include` to
`src/maximilian.h` that a bare-metal toolchain cannot satisfy.

That rule is why a 500 kB `sineTable.h` sits in `src/libs/` and a small 514-point table
lives inline in `maximilian.cpp` instead.

## 2. What to include

```cpp
#include "maximilian.h"       // core only  -> small, dependency-free, always safe
```

For the extended layer, include the **specific** header you need:

```cpp
#include "maximilian.h"
#include "maxiFFT.h"          // not "libs/maxim.h"
```

`src/libs/maxim.h` is an umbrella that pulls in FFT, Grains, MFCC, Bark **and** Atoms.
Prefer the specific header: it compiles faster, it keeps your port to embedded hardware
possible, and at the time of writing `maxim.h` transitively includes `maxiGrains.h`,
which does not compile on GCC (see [pitfalls.md](pitfalls.md#p2)).

Note that `maxim.h` deliberately does **not** include `maximilian.h` — an old design
decision. Include both explicitly, in that order, or `maxim.h` alone on a platform where
`maximilian.h` was already included.

## 3. The host contract

This is the whole integration surface. The library does not own `main()` and does not
open the audio device. Your host does.

```cpp
void setup();                 // called once, before audio starts
void play(double *output);    // called once per sample, for the life of the program
```

In the command-line examples the host is [cpp/commandline/player.cpp](../../cpp/commandline/player.cpp):
it constructs an `RtAudio` stream, and its callback loops over the buffer calling
`play()` once per frame, copying `maxiSettings::channels` doubles per call.

```
RtAudio callback (per buffer)
  └── for each frame:
        play(lastValues)                    <- your code writes N channels here
        for each channel: *buffer++ = lastValues[j]
```

`output` is **already allocated** and **reused** across calls. Write into it; never
reallocate it, never assume it is zeroed. Cells for channels you do not write keep the
value from the previous frame, which is a common source of a stuck stereo image.

Any host can implement this contract: RtAudio, PortAudio, JUCE, `ofSoundStream`,
CoreAudio directly, the Web Audio `AudioWorklet` in `js/`, or a bare-metal DAC ISR.

## 4. `maxiSettings`

A single static configuration, read by nearly every class at construction time (filters
compute coefficients from it, `maxiConvert` converts ms to samples with it).

| Setting | Default | Set with |
|---|---|---|
| `sampleRate` | 44100 | `maxiSettings::setup(rate, channels, bufferSize)` |
| `channels` | 2 | same call |
| `bufferSize` | 1024 | same call |

Two consequences that matter:

- **Call `maxiSettings::setup()` in `setup()`, before constructing/using anything that
  bakes in the sample rate.** The examples that omit it are relying on 44100/2/1024.
- **Changing it later does not retroactively fix existing objects.** A `maxiBiquad` or
  `maxiSVF` that already computed coefficients from 44100 stays wrong until you call
  `set()`/`setCutoff()` again. `maxiPolyBLEP` has `setSampleRate()` for exactly this.

## 5. The JavaScript layer

The same C++ source is compiled to JavaScript two different ways, and that is why the
source is full of preprocessor noise.

| Tool | Role | Marker |
|---|---|---|
| **Cheerp** | translates the C++ *methods* into JavaScript, keeping everything in the JS memory space. Fast per call, so it is used for the small DSP functions. | `CHEERP_EXPORT`, defined to `[[cheerp::jsexport]]` when `CHEERP` is defined |
| **Emscripten** | builds a wasm module for heavier processes | `maximilian.embind.cpp` |

Rules that follow, from `developer_notes.md` and the headers:

1. A class exposed to JavaScript is declared `class CHEERP_EXPORT maxiSomething { ... }`.
2. **Its constructor must also be defined in `maximilian.cpp`**, not in the header. This
   is a Cheerp quirk, not a style preference (`maximilian.cpp` ends with a block of
   `maxiFoo::maxiFoo() {}` for this reason).
3. **Cheerp does not handle overridden functions well.** Prefer distinct names. This is
   why the API has `phasorBetween` and `dlFromPosition` — they were renamed to avoid
   overloads.
4. Array parameters go through the `DOUBLEARRAY`, `DOUBLEARRAY_REF` and `F64_ARRAY_*`
   macros so that a `std::vector<double>` in C++ becomes a `Float64Array` in JavaScript.
   When you add a method that takes or returns an array, use the macros; do not write
   `std::vector<double>` directly in a `CHEERP_EXPORT` signature.

## 6. Build paths

| Target | How | Status |
|---|---|---|
| **Linux / macOS, command line** | `cmake` in an example folder, or the manual `g++` line in `README.md` | Works. Links `-lasound -D__LINUX_ALSA__` on Linux; `-framework CoreAudio -framework CoreFoundation -D__MACOSX_CORE__` on macOS. |
| **Windows, command line** | `cpp/commandline/maximilian_examples/maximilianExamples.cmake` has `if (WIN32) #TODO` | **Not wired up.** `player.cpp`'s RtAudio path needs DirectSound (`dsound.h`) on Windows. Use WSL, MSYS2, or build the core alone (see below). |
| **macOS / iOS** | Xcode project `maximilianTest.xcodeproj` | Present, not verified here. |
| **openFrameworks** | `cpp/openFrameworks/ofxMaxim` addon | Present, not verified here. |
| **Browser** | `js/audio-worklet` (AudioWorklet), `js/script-processor-node` (deprecated ScriptProcessor) | Present, not verified here. |
| **Embedded (ESP32, Pico)** | Copy `maximilian.h` + `maximilian.cpp`, call `setup()`/`play()` from your audio path | This is the design intent of the dependency-free core. |

The **core alone** builds anywhere with a C++17 compiler and no flags beyond the include
path — this was verified on Windows with MinGW GCC 9.2. That is also how you test DSP
without an audio device; see **maximilian-verification**.

## 7. Where does new code belong?

| You are adding | Location | Also update |
|---|---|---|
| A generator, filter, envelope, utility that needs no dependencies | `src/maximilian.h` (+ `.cpp` if it has a constructor or non-trivial code) | `docs/docbuild/core.rst` |
| Anything needing FFT, files, threads, or >100 kB of tables | `src/libs/` (+ register in `maxim.h` only if it is broadly useful) | `docs/docbuild/extended.rst` |
| A new example | `cpp/commandline/maximilian_examples/<N>.Name/` with `main.cpp` + the 8-line `CMakeLists.txt` | `README.md` if it teaches something new |
| A JavaScript binding | the class body as usual | `maximilian.embind.cpp` for Emscripten; constructor in `maximilian.cpp` for Cheerp |

Adding a class to the core means it is now a candidate for the embedded and browser
builds. Keep it header-only-friendly, keep it allocation-free after construction, and
keep it `double` in, `double` out, like everything else.

## 8. Style of the codebase

Match what is there; do not reformat.

- Signals are `double`, sample by sample. `float` appears only inside the FFT/spectral
  layer and in `maxiSample`'s buffer accessors.
- Processing methods are named `play()` (or a verb: `process`, `pull`, `chorus`), take
  the input signal as the first argument, and return one `double` per sample.
- Configuration methods are `setup()`, `setX()`, `getX()`.
- Member data in the core is `protected`/`private` with public getters — except for the
  handful of historic public fields (`maxiFilter::cutoff`, `maxiEnv::trigger`,
  `maxiClock::tick`) that the examples and therefore the users depend on. Do not rename
  those; the deprecation cost is not worth it.
- Documentation comments are Doxygen: `/*! text \param x ... */`. They are converted to
  XML, then to the Sphinx site in `docs/`.
