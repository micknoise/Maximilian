/*
 * sine_440 - the anchor case.
 *
 * A full-scale reference: one sine at 440 Hz and amplitude 0.5.
 *
 * Physics: a sine of amplitude A has peak A and RMS A/sqrt(2).
 *   0.5      -> peak 0.500000
 *   0.5/sqrt(2) -> RMS 0.353553
 *
 * 44100 samples at 44.1 kHz is exactly 440 cycles of 440 Hz, so the RMS is not an
 * approximation over a partial period - it is the real thing.
 *
 * This is the case to run first if audio "does not work": it isolates the
 * oscillator, the settings and the render path from everything else.
 */

#include "../harness.h"
#include "maximilian.h"

#include <cmath>
#include <cstdio>

maxiOsc sineOsc;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double w = sineOsc.sinewave(440.0) * 0.5;
    output[0] = w;
    output[1] = w;
}

int caseCheck(const maxiMetrics &m) {
    int failures = 0;
    const double expectedPeak = 0.5;
    const double expectedRms = 0.5 / std::sqrt(2.0);
    const double tol = 2.0e-3;

    std::printf("expected peak=%.6f rms=%.6f (tol %.4f)\n", expectedPeak, expectedRms, tol);

    if (std::fabs(m.peak - expectedPeak) > tol) {
        std::printf("  BAD peak: got %.6f, expected %.6f\n", m.peak, expectedPeak);
        ++failures;
    }
    if (std::fabs(m.rms - expectedRms) > tol) {
        std::printf("  BAD rms: got %.6f, expected %.6f\n", m.rms, expectedRms);
        ++failures;
    }
    if (std::fabs(m.dc) > 1.0e-3) {
        std::printf("  BAD dc: got %.6f, expected ~0\n", m.dc);
        ++failures;
    }
    return failures;
}
