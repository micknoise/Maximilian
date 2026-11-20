---
name: maximilian-porting
description: Use when running Maximilian somewhere other than the shipped command-line examples - embedded microcontrollers (ESP32, Pi Pico), the browser through Cheerp or Emscripten, openFrameworks, JUCE, PortAudio, SDL, or a custom audio host. Covers the host contract adaptation, CHEERP_EXPORT rules, float vs double conversion, sample-rate handling, and the stale vendored copy inside the openFrameworks addon.
---

# Porting to another host

The library's contract is two free functions. Any host that can call them is a valid port.

```cpp
void setup();                 // once, before the stream opens
void play(double *output);    // once per frame, N channels
```

## The four things every port must do

1. **Configure first.** `maxiSettings::setup(rate, channels, bufferSize)` before constructing
   anything. Filters and envelopes bake in the rate.
2. **Call `play()` once per frame**, not once per buffer. Looping inside the callback is
   normal and correct — see `player.cpp`'s `routing()` callback.
3. **Provide an output array of `maxiSettings::channels` doubles**, reused between calls.
4. **Keep the callback real-time safe.** No allocation, no logging, no locks. See
   `maximilian-realtime-safety`.

## Embedded: ESP32, Pi Pico, ARM Cortex-M

This is the library's stated design target, and the dependency-free core exists for it.

- Copy **`src/maximilian.h` and `src/maximilian.cpp` only**. Do not bring `src/libs/` — it
  is where the FFT tables, `stb_vorbis` and the 500 kB sine table live.
- `double` on most Cortex-M4F/M7 is software-emulated. If your build has FPU single
  precision only, expect `double` math to be slow; prefer `sinebuf` over `sinewave`, and
  keep the voice count low.
- `maxiSample` loads whole files into RAM as `double`. On a board with 320 kB of SRAM, that
  is not viable — use short mono one-shots, or stream from flash yourself.
- **32-bit targets are where `maxiGrains.h` fails to compile** (see
  [pitfalls.md](../../reference/pitfalls.md#p2)). Stay in the core and you are unaffected.

In your I2S / DMA callback, per frame: call `play(frame)` on a `double frame[2]`, then
convert at the boundary — `static_cast<int16_t>(frame[0] * 32767.0)` for each channel.

Watch for: no exceptions (enable `-fno-exceptions` and avoid `throw`), no heap in the
callback, and a sample rate that is whatever your codec actually runs at — call
`maxiSettings::setup()` with that number, not 44100 by habit.

## Browser: two different builds

The same source produces JavaScript two ways, and the difference matters.

| Tool | What it does | Where |
|---|---|---|
| **Cheerp** | transpiles the C++ methods into JavaScript, all in JS memory. Fast per call, so it is used for small DSP functions. | `js/purejs/`, `js/audio-worklet/` |
| **Emscripten** | compiles to a wasm module with embind bindings | `maximilian.embind.cpp` |

If you are **adding** an exported class for Cheerp:

1. Declare it `class CHEERP_EXPORT maxiSomething { ... }`.
2. **Define its constructor in `maximilian.cpp`**, not in the header. This is a Cheerp
   requirement, not style — `maximilian.cpp` ends with a block of `maxiFoo::maxiFoo() {}`
   for exactly this reason.
3. **Avoid overridden functions.** Cheerp handles them badly; give the methods distinct
   names. `phasorBetween` and `dlFromPosition` exist because of this rule.
4. **Use the array macros** (`DOUBLEARRAY`, `DOUBLEARRAY_REF`, `F64_ARRAY_*`) for anything
   taking or returning arrays, so `std::vector<double>` becomes a JS `Float64Array`.

On the web side there are two worklet recipes in `js/`: `audio-worklet/` (current) and
`script-processor-node/` (deprecated — `ScriptProcessorNode` is on its way out of browsers).
The worklet examples load a prebuilt maximilian bundle and expose an `eval`-style processor.

## openFrameworks — read this before editing the addon

`cpp/openFrameworks/ofxMaxim/` contains a **vendored copy** of this library, and it is not
the same library any more:

| File | `src/` | `cpp/openFrameworks/ofxMaxim/libs/` |
|---|---|---|
| `maximilian.h` | 2613 lines | 825 lines |
| last touched | 2024-01-20 | 2020-03-09 |

The addon carries a pre-rewrite generation of the API. That means:

- **Editing a class in `src/` does not update the addon.** If you change the core and an
  openFrameworks user reports an old behaviour, that is why.
- **Documentation in `agents/` describes `src/`, not the addon.** Class names, signatures
  and units in the addon may differ.
- If your task is "fix the openFrameworks example", you are working in a different, older
  codebase that happens to share a name. Check the header before you trust any signature.
- Syncing the addon is a real (and separate) piece of work: it is a port, not a copy, and it
  needs someone to verify the OF build afterwards.

## Other hosts

For JUCE, PortAudio, SDL, CoreAudio or a plugin wrapper, the work is always the same:

- Open a stream at `maxiSettings::sampleRate` and `maxiSettings::channels`.
- In the callback, loop frames and call `play(frame)`.
- Convert `double` to whatever the host wants (`float` for JUCE/CoreAudio, `int16` for
  ALSA/SDL) at the boundary.
- Call `setup()` after the stream's real sample rate is known, not before.

A custom host is also the sane way to test: it takes about 40 lines and no device at all —
which is exactly what `agents/verify/harness.cpp` does.

## Sample rate is not a detail

The library defaults to 44100 Hz. A browser AudioWorklet is often 48000; some embedded
codecs run at 16000. Filters, envelopes and `maxiPolyBLEP` all derive from the current rate,
and nothing recomputes them for you.

- Always pass the **real** rate to `maxiSettings::setup()`.
- If the rate changes, re-call `set()`/`setCutoff()` on filters and
  `maxiPolyBLEP::setSampleRate()` on oscillators.
- Test at 48000 as well as 44100. A tuning bug that only shows at 48 k is the classic
  symptom of a hard-coded rate.

## Porting checklist

- [ ] `maxiSettings::setup()` called with the host's real rate, channels and buffer size.
- [ ] `play()` called once per frame, not once per buffer.
- [ ] Output buffer reused, every channel written.
- [ ] `double` → host format conversion at the boundary only.
- [ ] No allocation, logging or locking in the callback.
- [ ] Core-only build if the target is embedded or 32-bit.
- [ ] Verified at the target rate, not just at 44100.
- [ ] If touching the OF addon: confirmed which generation of the API you are in.

Background: [architecture.md](../../reference/architecture.md#6-build-paths) and
[architecture.md](../../reference/architecture.md#5-the-javascript-layer).
