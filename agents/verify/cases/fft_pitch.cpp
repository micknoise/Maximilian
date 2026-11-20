/*
 * fft_pitch - the spectrum knows the answer, so assert against it.
 *
 * A 440 Hz sine is fed to maxiFFT. On every new analysis frame, the spectral
 * centroid is recorded. For a pure sine the centroid must land on the input
 * frequency (within the resolution of a 1024-point FFT at 44.1 kHz, which is
 * 43 Hz per bin, plus the spread of the window).
 *
 * This case also demonstrates the gate pattern that matters for every spectral
 * sketch: process() returns true once per hop, not once per sample.
 *
 * Build note: this case needs maxiFFT.cpp and fft.cpp, and it includes
 * "maxiFFT.h" directly rather than "libs/maxim.h" (see pitfalls P2).
 */

#include "../harness.h"
#include "maximilian.h"
#include "maxiFFT.h"

#include <cmath>
#include <cstdio>

maxiOsc osc;
maxiFFT fft;

double lastCentroid = 0.0;
long framesAnalysed = 0;

void setup() {
    maxiSettings::setup(44100, 2, 512);
    fft.setup(1024, 512, 1024);
}

void play(double *output) {
    const double w = osc.sinewave(440.0) * 0.5;
    if (fft.process(static_cast<float>(w))) {
        const double c = fft.spectralCentroid();
        if (std::isfinite(c) && c > 0.0) {
            lastCentroid = c;
            ++framesAnalysed;
        }
    }
    output[0] = w;
    output[1] = w;
}

int caseCheck(const maxiMetrics &m) {
    int failures = 0;
    const double expected = 440.0;
    const double tol = expected * 0.10;   // 10%: comfortably wider than one bin

    (void)m;
    std::printf("frames analysed=%ld last spectral centroid=%.2f Hz (expected %.2f +/- %.2f)\n",
                framesAnalysed, lastCentroid, expected, tol);

    if (framesAnalysed == 0) {
        std::printf("  BAD: no analysis frame was ever reported - process() never returned true\n");
        return 1;
    }
    if (std::fabs(lastCentroid - expected) > tol) {
        std::printf("  BAD centroid: %.2f Hz is not %.2f Hz +/- %.2f\n",
                    lastCentroid, expected, tol);
        ++failures;
    }
    return failures;
}
