/*
 * harness.h - shared contract between the offline render harness and its cases.
 *
 * Maximilian's host contract is:
 *
 *     void setup();
 *     void play(double *output);
 *
 * A harness case adds one more function:
 *
 *     int caseCheck(const maxiMetrics &m);
 *
 * which returns 0 when the rendered audio is what the physics says it should be,
 * and non-zero otherwise (after printing why). The case owns its own expectation,
 * so the assertion lives next to the code it describes.
 */

#ifndef MAXIMILIAN_VERIFY_HARNESS_H
#define MAXIMILIAN_VERIFY_HARNESS_H

struct maxiMetrics {
    double peak;        // largest absolute sample seen, any channel
    double rms;         // root mean square over all samples and channels
    double dc;          // mean value over all samples and channels
    long frames;        // frames rendered
    long samples;       // frames * channels
};

#endif // MAXIMILIAN_VERIFY_HARNESS_H
