/*
 * adsr_gate - envelope shape, checked by energy rather than by ear.
 *
 * A 440 Hz sine of amplitude 0.5 is gated by a one-shot AR envelope with a short
 * attack and a 200 ms release. The render window is one second, so most of it is
 * silence after the envelope has closed.
 *
 * What must be true of that render, without knowing the exact curve:
 *   - it never exceeds the source amplitude (0.5) by more than rounding;
 *   - it carries strictly less energy than the ungated sine (0.353553 RMS),
 *     because an envelope that is mostly at zero can only remove energy;
 *   - it is not silent, so the trigger actually arrived.
 *
 * A case like this is how you catch "my envelope never fires" and
 * "my envelope runs away" in one assertion pair.
 */

#include "../harness.h"
#include "maximilian.h"

#include <cmath>
#include <cstdio>

maxiOsc osc;
maxiEnvGen env;
bool triggered = false;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    // 0 -> 1 over 5 ms, 1 -> 0 over 200 ms, linear, not looping.
    const bool ok = env.setup({0.0, 1.0, 0.0}, {5, 200}, {1, 1}, false);
    if (!ok) {
        std::printf("adsr_gate: envelope setup failed - check levels.size() == times.size()+1\n");
    }
}

void play(double *output) {
    // One positive edge, once, at the very first sample.
    const double trigger = triggered ? 0.0 : 1.0;
    triggered = true;
    const double amp = env.play(trigger);
    const double w = osc.sinewave(440.0) * 0.5 * amp;
    output[0] = w;
    output[1] = w;
}

int caseCheck(const maxiMetrics &m) {
    int failures = 0;
    const double ungatedRms = 0.5 / std::sqrt(2.0);

    if (m.peak > 0.51) {
        std::printf("  BAD peak: %.6f exceeds the source amplitude 0.5\n", m.peak);
        ++failures;
    }
    if (m.rms >= ungatedRms * 0.9) {
        std::printf("  BAD rms: %.6f is not reduced by the envelope (ungated %.6f)\n",
                    m.rms, ungatedRms);
        ++failures;
    }
    if (m.rms < 1.0e-4) {
        std::printf("  BAD rms: %.6f - envelope never opened, trigger not seen\n", m.rms);
        ++failures;
    }
    std::printf("check: peak<=0.51, rms<%.6f, rms>1e-4\n", ungatedRms * 0.9);
    return failures;
}
