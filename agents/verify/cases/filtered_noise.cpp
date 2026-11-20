/*
 * filtered_noise - a smoke test with bounds, not golden numbers.
 *
 * White noise through a resonant low-pass at 800 Hz, Q = 2. Noise has no
 * predictable sample values, so this case asserts the properties that a working
 * filter must have and a broken one will not:
 *
 *   - every output sample is finite (a blown-up biquad gives NaN or inf,
 *     and those poison every metric at once);
 *   - the output is not silent;
 *   - the output stays within a sane range - a resonant filter at Q=2 with a
 *     0..1 noise source must not be approaching full scale;
 *   - there is no significant DC offset (a filter stuck on a coefficient bug
 *     tends to sit at a constant).
 *
 * This is deliberately not an exact RMS match: asserting a number for filtered
 * noise would be asserting the RNG, which proves nothing about the filter.
 * Use it to catch breakage, and use sine_440 for precision.
 */

#include "../harness.h"
#include "maximilian.h"

#include <cmath>
#include <cstdio>

maxiOsc noiseOsc;
maxiFilter filter;

void setup() {
    maxiSettings::setup(44100, 2, 512);
}

void play(double *output) {
    const double source = noiseOsc.noise();
    // lores takes the cutoff in Hz. lopass/hipass would take 0-1 here - see pitfalls P1.
    const double w = filter.lores(source, 800.0, 2.0) * 0.5;
    output[0] = w;
    output[1] = w;
}

int caseCheck(const maxiMetrics &m) {
    int failures = 0;

    if (!std::isfinite(m.peak) || !std::isfinite(m.rms) || !std::isfinite(m.dc)) {
        std::printf("  BAD: non-finite metric - filter produced NaN/inf\n");
        return 1;
    }
    if (m.rms < 1.0e-3) {
        std::printf("  BAD rms: %.6f - output is silent\n", m.rms);
        ++failures;
    }
    if (m.peak > 1.2) {
        std::printf("  BAD peak: %.6f - resonant filter is running away\n", m.peak);
        ++failures;
    }
    if (std::fabs(m.dc) > 0.05) {
        std::printf("  BAD dc: %.6f - filter is offset\n", m.dc);
        ++failures;
    }
    std::printf("check: finite, rms>1e-3, peak<=1.2, |dc|<=0.05\n");
    return failures;
}
