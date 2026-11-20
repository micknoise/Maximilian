# Pitfalls

The traps that actually cost time in this codebase, in the order they usually bite.
Each has a symptom you can recognise, a cause, and a fix.

<a id="p1"></a>
## P1. `maxiFilter` has two incompatible cutoff units

**Symptom:** a filter "does nothing" or sounds broken, with no error.

**Cause:** `lores`, `hires` and `bandpass` take the cutoff in **Hz**. `lopass` and
`hipass` take a **normalised 0–1** value. Passing `800.0` to `lopass` is not a mistake the
compiler can see.

**Fix:** memorise the table in [api.md](api.md#4-filters), or use `maxiSVF`/`maxiBiquad`
everywhere, which always take Hz.

<a id="p2"></a>
## P2. `src/libs/maxiGrains.h` does not compile on 32-bit targets

**Symptom** (MinGW/Win32, GCC 9.2):

```
maxiGrains.h:170:69: error: no matching function for call to 'min(size_t, long unsigned int)'
```

**Cause:** the grain classes store `sampleStartPos` and `sampleDur` as `unsigned long`
(`maxiGrains.h:143,145`), while `maxiSample::getLength()` returns `size_t`. Lines 170 and
188 then call `std::min` with one of each. Template argument deduction requires both
arguments to have the *same type*, and on Win32/32-bit they do not:

| Platform | `size_t` | `unsigned long` | Result |
|---|---|---|---|
| x86_64 / arm64 Linux, macOS | `unsigned long` | `unsigned long` | same type — **compiles** |
| MinGW / Win32 / most 32-bit MCUs | `unsigned int` | `unsigned long` | distinct types — **fails** |

That is a real problem for this library specifically, because 32-bit embedded targets are
one of its stated platforms. It breaks **any** translation unit that includes
`maxiGrains.h`, which includes everything that includes `libs/maxim.h` — including
`20.FFT_example`, which has nothing to do with grains.

**Fix (until it is patched upstream):** include the specific extended header you need
instead of the umbrella.

```cpp
#include "maximilian.h"
#include "maxiFFT.h"            // compiles everywhere
// #include "libs/maxim.h"      // pulls in maxiGrains.h -> fails on 32-bit
```

The real fix is `std::min<size_t>(...)` at those two sites; it is a source change and
therefore deliberately out of scope for a documentation patch.

<a id="p3"></a>
## P3. The two envelope families trigger differently

**Symptom:** an envelope fires once and never again, or never fires.

**Cause:**

- `maxiEnvGen::play(trigger)` takes a **signal** and starts on a **positive zero
  crossing**. A constant `1.0` starts it once, then there is no further crossing.
- `maxiEnv::trigger` is a **public integer member** that you set to 1/0 yourself, and the
  envelope is advanced by `adsr(input, trigger)`.

**Fix:** drive `maxiEnvGen` from something that returns to zero — `maxiOsc::impulse`,
`maxiStep::pull`, `maxiClock::tick` converted to a pulse, or `maxiZXToPulse`.

<a id="p4"></a>
## P4. Envelope times are milliseconds in one overload and coefficients in another

**Symptom:** an envelope is instant, or takes minutes.

**Cause:** `maxiEnv::setAttack(ms)` is milliseconds. But the long overload
`adsr(input, attack, decay, sustain, release, holdtime, trigger)` wants **coefficients
near 1.0** (e.g. `0.9995`), and `maxiDyn`'s `attack`/`release` are coefficients too. Both
styles appear in the shipped examples.

**Fix:** use the `setX(ms)` setters and the `adsr(input, trigger)` overload, and pass
`1.0` as the input when you want a bare envelope.

<a id="p5"></a>
## P5. `play()` runs once per *sample*, not once per buffer

**Symptom:** audio glitches, crackles, or a machine that dies under load; works fine in a
short test.

**Cause:** at 44.1 kHz with 512-frame buffers, `play()` is called 44,100 times a second.
Anything inside it is executed 44,100 times a second.

**Fix — never do these inside `play()`:**

| Don't | Do instead |
|---|---|
| `new` / `delete` / `push_back` on a `std::vector` that grows | allocate in `setup()`, keep capacity fixed |
| `cout` / `printf` / `ofLog` per sample | `maxiPoll::poll(x, 4)`, which prints at a fixed rate |
| file I/O, loading samples | `setup()` |
| locks, mutexes, `std::atomic` spinning | copy a parameter snapshot at buffer boundaries |
| `sin`/`cos` in a hot polyphonic inner loop | `sinebuf` / `sinebuf4` wavetables |

`maxiPoll` exists precisely because the naive fix (printing from the callback) is what
everyone does first.

<a id="p6"></a>
## P6. The output buffer is reused and is not zeroed

**Symptom:** the right channel holds a stale value; a mono sketch sounds like it drifts.

**Cause:** the host reuses one `double[N]` across all calls. Channels you do not write
keep their previous value.

**Fix:** write every channel you declared in `maxiSettings::channels`, every call.

<a id="p7"></a>
## P7. Changing `maxiSettings` does not update objects already built

**Symptom:** a filter or oscillator is detuned after switching to 48 kHz.

**Cause:** filter coefficients, envelope increments and `maxiPolyBLEP`'s phase increment
are computed from `maxiSettings::sampleRate` at construction or at `set()` time.

**Fix:** call `maxiSettings::setup()` **first**, in `setup()`, before constructing or
configuring anything. If the rate changes at runtime, re-call `set()`/`setCutoff()` on the
affected objects (and `maxiPolyBLEP::setSampleRate`).

<a id="p8"></a>
## P8. Naive waveforms alias, and it is not subtle

**Symptom:** harsh, "ringing" high notes; a sweep sounds gritty near the top.

**Cause:** `saw`, `square` and `pulse` are naive shapes with infinite harmonics. Above a
few hundred Hz they alias badly at 44.1 kHz.

**Fix:** use `sawn` (band-limited) or `maxiPolyBLEP`, or low-pass before the output. A
resonant filter with a cutoff near Nyquist will also sound wrong regardless of the source.

<a id="p9"></a>
## P9. The `(int)phasor(freq)` idiom has edge cases

**Symptom:** a sequencer skips the first step, or double-triggers.

**Cause:** converting a 0–1 ramp to `int` yields 0 for the whole first period, so the
"value changed" test fires late; and the ramp restarts at 0, so adjacent periods can look
like no change if you compare the wrong way.

**Fix:** for anything musical, use `maxiClock` (tempo-aware) or `maxiStep` /
`maxiRatioSeq` (zero-crossing based). Keep the raw phasor idiom for demos only, and
compare against a stored previous value as the counting examples do.

<a id="p10"></a>
## P10. `maxiSample` paths are relative to the *working directory*

**Symptom:** `load()` returns `false` and you hear silence, but the file is definitely there.

**Cause:** paths resolve against the process CWD, not the source file. The shipped
examples live one `build/` folder down and therefore use `../../../beat2.wav`.

**Fix:** pass an absolute path, or resolve relative to your executable. Always check the
`bool` from `load()` and the value of `isReady()`.

<a id="p11"></a>
## P11. `maxiFFT::process()` is a gate, and its buffers are borrowed

**Symptom:** spectral values are garbage, or change unexpectedly between reads.

**Cause:** `process()` returns `true` only on a new hop. `getMagnitudes()` and
`getPhases()` return a **reference to internal storage** that is overwritten on the next
hop.

**Fix:** do the spectral work inside `if (fft.process(x)) { ... }`, and copy the vectors
(not the reference) if you need them after that block. Return audio every sample
regardless.

<a id="p12"></a>
## P12. `maximilian.h` does `using namespace std;`

**Symptom:** name clashes, especially `min`/`max`/`count`/`distance` in your own headers,
or ADL surprises.

**Cause:** line 54 of `maximilian.h` pulls all of `std` into the global namespace for
every translation unit that includes it.

**Fix:** you cannot remove it without breaking every user, so work around it: qualify
your own calls, avoid naming your own types `count`, `distance`, `map`, `clamp`, and do
not add `using namespace` directives of your own in headers.

<a id="p13"></a>
## P13. Cheerp constrains what the API may look like

**Symptom:** JavaScript bindings compile in C++ but fail or misbehave in the browser build.

**Cause:** the Cheerp transpiler has three documented limits.

**Fix:** when adding an exported class — (1) put the constructor in `maximilian.cpp`, not
the header; (2) avoid overridden functions, give them distinct names (that is why
`phasorBetween` and `dlFromPosition` exist); (3) use the `DOUBLEARRAY` /
`DOUBLEARRAY_REF` / `F64_ARRAY_*` macros for array arguments instead of
`std::vector<double>`.

<a id="p14"></a>
## P14. Several classes are deprecated but still in the examples

**Symptom:** you copy a tutorial and build on a class that will not be maintained.

| Deprecated | Use instead |
|---|---|
| `maxiEnvelope` | `maxiEnvGen` |
| `maxiEnv` | `maxiEnvGen` |
| `maxiDyn` | `maxiDynamics` |

Read the old ones, write the new ones. If you must extend an example that uses the old
class, keep using it there — do not silently migrate a teaching example to a different
API, because the comments explain the old one.

<a id="p15"></a>
## P15. `maxiSettings` is global mutable state

**Symptom:** tests interfere with each other; a unit test passes alone and fails in a
suite.

**Cause:** sample rate, channel count and buffer size are static globals. Every object
reads them.

**Fix:** in a test or a render harness, set them once at the start of each case and
construct the DSP objects **after** that. Do not run two sample rates in one process.

<a id="p16"></a>
## P16. The Windows command-line build is not wired up

**Symptom:** `cmake` on Windows fails or produces a binary that does not open an audio
device.

**Cause:** `cpp/commandline/maximilian_examples/maximilianExamples.cmake` ends with
`if (WIN32) #TODO`, and `player.cpp`'s RtAudio path needs DirectSound headers on Windows.

**Fix:** on Windows, build the **core only** for testing DSP (no RtAudio, no `player.cpp`),
which is what the verification harness does. For a real Windows audio app, add the
DirectSound link yourself or use MSYS2/WSL, or host the library in JUCE/openFrameworks.

<a id="p17"></a>
## P17. A variable named `sample` or `clock` does not compile — on one platform

**Symptom:** a perfectly reasonable declaration fails, and the error blames redeclaration
rather than your code.

| Declaration | Fails on Windows | Fails on Linux/macOS |
|---|---|---|
| `maxiSample sample;` | **yes** — `reference to 'sample' is ambiguous` | no |
| `maxiClock clock;` | no | **yes** — `'maxiClock clock' redeclared as different kind of entity` |

**Cause:** the same wart from two directions. `maximilian.h` does `using namespace std;`
(P12), and only under `_WIN32` includes `<algorithm>`, which in C++17 declares
`std::sample()`. So on Windows an unqualified `sample` names both your variable and the
standard function template.

On Linux and macOS `<algorithm>` is not included, so `sample` is fine — but `<ctime>` has
already been pulled in transitively, and it declares `clock()`. Same collision, opposite
platform.

**This is the trap that proves the method.** Both cases compile perfectly on the machine of
whoever wrote the snippet and fail on somebody else's. Only compiling the documentation on
two toolchains finds them; no amount of proofreading will.

**Fix:** do not name variables after anything in the C or C++ standard library. Confirmed
collisions here: `sample`, `clock`. Treat the rest as taken too — `count`, `clamp`,
`distance`, `fill`, `generate`, `swap`, `min`, `max`, `transform`, `sort`, `time`, `data`.

```cpp
#include "maximilian.h"

maxiSample clip;        // not "sample"
maxiOsc metronome;      // not "clock"

void setup() {
    maxiSettings::setup(44100, 2, 512);
    clip.load("beat2.wav");
}

void play(double *output) {
    const double gate = metronome.impulse(2.0);
    const double w = clip.isReady() ? clip.play() * 0.5 * gate : 0.0;
    output[0] = w;
    output[1] = w;
}
```

<a id="p18"></a>
## P18. `maxiEnvGen::setup()` prints to stdout

**Symptom:** unexpected lines like
`Stage 0	1	220	0.00454545	1` appear in your console, your log, or a test's captured
output the moment you configure an envelope.

**Cause:** `maxiEnvGen::setup()` contains a leftover debug print of every stage
(`maximilian.h:2392`), plus diagnostic messages on failure (lines 2383 and 2399).

**Fix:** nothing to do at the call site — it is unconditional. Expect the output, and do not
let it corrupt a machine-readable log:

- in tests, consume stdout deliberately (the verification harness matches its metric line
  with `^frames=` rather than taking the first line);
- if you need clean stdout, redirect it around the `setup()` call;
- do not add a `cout` of your own next to it, and do not remove these by hand in a
  documentation change — it is a source edit with its own review.

It is a two-line cleanup and a good first pull request, separately from anything else.
