/*
 * harness.cpp - render a Maximilian sketch offline and measure it.
 *
 * Why this exists: the library has no audio dependencies, so DSP can be tested
 * without an audio device, a driver, or a human listening. That makes it possible
 * for a human *or an agent* to prove that a change did what it claims, in CI or on
 * a laptop with the sound muted.
 *
 * Usage:
 *     harness --seconds 1.0 --rate 44100 --channels 2 [--wav out.wav]
 *
 * The case supplies setup(), play() and caseCheck() (see harness.h).
 */

#include "harness.h"
#include "maximilian.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

/* Supplied by the case being linked in. */
void setup();
void play(double *output);
int caseCheck(const maxiMetrics &m);

namespace {

void writeWav(const std::string &path, const std::vector<double> &interleaved,
              int channels, int rate) {
    FILE *f = std::fopen(path.c_str(), "wb");
    if (!f) {
        std::fprintf(stderr, "harness: could not open %s for writing\n", path.c_str());
        return;
    }

    const unsigned int dataBytes =
        static_cast<unsigned int>(interleaved.size() * sizeof(int16_t));
    const unsigned int riffSize = 36 + dataBytes;
    const unsigned int fmtSize = 16;
    const unsigned int byteRate = static_cast<unsigned int>(rate * channels * 2);
    const unsigned short blockAlign = static_cast<unsigned short>(channels * 2);
    const unsigned short bitsPerSample = 16;
    const unsigned short audioFormat = 1; // PCM
    const unsigned short numChannels = static_cast<unsigned short>(channels);

    std::fwrite("RIFF", 1, 4, f);
    std::fwrite(&riffSize, 4, 1, f);
    std::fwrite("WAVEfmt ", 1, 8, f);
    std::fwrite(&fmtSize, 4, 1, f);
    std::fwrite(&audioFormat, 2, 1, f);
    std::fwrite(&numChannels, 2, 1, f);
    std::fwrite(&rate, 4, 1, f);
    std::fwrite(&byteRate, 4, 1, f);
    std::fwrite(&blockAlign, 2, 1, f);
    std::fwrite(&bitsPerSample, 2, 1, f);
    std::fwrite("data", 1, 4, f);
    std::fwrite(&dataBytes, 4, 1, f);

    for (double v : interleaved) {
        double clamped = v;
        if (clamped > 1.0) clamped = 1.0;
        if (clamped < -1.0) clamped = -1.0;
        int16_t s = static_cast<int16_t>(clamped * 32767.0);
        std::fwrite(&s, sizeof(s), 1, f);
    }
    std::fclose(f);
    std::printf("harness: wrote %s (%u bytes of audio)\n", path.c_str(), dataBytes);
}

} // namespace

int main(int argc, char **argv) {
    double seconds = 1.0;
    int rate = 44100;
    int channels = 2;
    std::string wavPath;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        const bool hasNext = (i + 1) < argc;
        if (arg == "--seconds" && hasNext) {
            seconds = std::atof(argv[++i]);
        } else if (arg == "--rate" && hasNext) {
            rate = std::atoi(argv[++i]);
        } else if (arg == "--channels" && hasNext) {
            channels = std::atoi(argv[++i]);
        } else if (arg == "--wav" && hasNext) {
            wavPath = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            std::printf("usage: harness [--seconds S] [--rate HZ] [--channels N] [--wav FILE]\n");
            return 0;
        } else {
            std::fprintf(stderr, "harness: unknown argument '%s'\n", arg.c_str());
            return 2;
        }
    }

    if (channels < 1 || channels > 8) {
        std::fprintf(stderr, "harness: --channels must be 1..8\n");
        return 2;
    }
    if (seconds <= 0.0) {
        std::fprintf(stderr, "harness: --seconds must be positive\n");
        return 2;
    }

    /* Configure the library before the case constructs anything: filters and
       envelopes bake in the sample rate at construction. See pitfalls.md P7. */
    maxiSettings::setup(static_cast<size_t>(rate), static_cast<size_t>(channels),
                        static_cast<size_t>(512));

    setup();

    const long frames = static_cast<long>(seconds * rate);
    std::vector<double> out(static_cast<size_t>(channels), 0.0);
    std::vector<double> interleaved;
    interleaved.reserve(static_cast<size_t>(frames) * channels);

    maxiMetrics m{0.0, 0.0, 0.0, 0, 0};
    double sum = 0.0;
    double sumSquares = 0.0;

    for (long i = 0; i < frames; ++i) {
        for (int c = 0; c < channels; ++c) out[static_cast<size_t>(c)] = 0.0;
        play(&out[0]);
        for (int c = 0; c < channels; ++c) {
            const double v = out[static_cast<size_t>(c)];
            const double a = std::fabs(v);
            if (a > m.peak) m.peak = a;
            sum += v;
            sumSquares += v * v;
            ++m.samples;
            if (!wavPath.empty()) interleaved.push_back(v);
        }
    }
    m.frames = frames;
    m.dc = (m.samples > 0) ? (sum / static_cast<double>(m.samples)) : 0.0;
    m.rms = (m.samples > 0) ? std::sqrt(sumSquares / static_cast<double>(m.samples)) : 0.0;

    std::printf("frames=%ld samples=%ld peak=%.6f rms=%.6f dc=%.6f\n",
                m.frames, m.samples, m.peak, m.rms, m.dc);

    if (!wavPath.empty()) writeWav(wavPath, interleaved, channels, rate);

    const int verdict = caseCheck(m);
    if (verdict == 0) {
        std::printf("PASS\n");
        return 0;
    }
    std::printf("FAIL\n");
    return 1;
}
