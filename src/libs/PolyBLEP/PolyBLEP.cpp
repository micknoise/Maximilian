/*
PolyBLEP Waveform generator ported from the Jesusonic code by Tale
http://www.taletn.com/reaper/mono_synth/

Permission has been granted to release this port under the WDL/IPlug license:

    This software is provided 'as-is', without any express or implied
    warranty.  In no event will the authors be held liable for any damages
    arising from the use of this software.

    Permission is granted to anyone to use this software for any purpose,
    including commercial applications, and to alter it and redistribute it
    freely, subject to the following restrictions:

    1. The origin of this software must not be misrepresented; you must not
       claim that you wrote the original software. If you use this software
       in a product, an acknowledgment in the product documentation would be
       appreciated but is not required.
    2. Altered source versions must be plainly marked as such, and must not be
       misrepresented as being the original software.
    3. This notice may not be removed or altered from any source distribution.
*/

#include "PolyBLEP.h"

#define _USE_MATH_DEFINES

#include <math.h>
#include <cmath>
#include <cstdint>

const double TWO_PI = 2 * M_PI;

template<typename T>
inline T square_number(const T &x) {
    return x * x;
}

// Adapted from "Phaseshaping Oscillator Algorithms for Musical Sound
// Synthesis" by Jari Kleimola, Victor Lazzarini, Joseph Timoney, and Vesa
// Valimaki.
// http://www.acoustics.hut.fi/publications/papers/smc2010-phaseshaping/
inline double blep(double t, double dt) {
    if (t < dt) {
        return -square_number(t / dt - 1);
    } else if (t > 1 - dt) {
        return square_number((t - 1) / dt + 1);
    } else {
        return 0;
    }
}

// Derived from blep().
inline double blamp(double t, double dt) {
    if (t < dt) {
        t = t / dt - 1;
        return -1 / 3.0 * square_number(t) * t;
    } else if (t > 1 - dt) {
        t = (t - 1) / dt + 1;
        return 1 / 3.0 * square_number(t) * t;
    } else {
        return 0;
    }
}

template<typename T>
inline int64_t bitwiseOrZero(const T &t) {
    return static_cast<int64_t>(t) | 0;
}

PolyBLEP::PolyBLEP(double sampleRate)
        : sampleRate(sampleRate), amplitude(1.0), t(0.0) {
    setSampleRate(sampleRate);
    setFrequency(440.0);
    setWaveform(SINE);
    setPulseWidth(0.5);
}

void PolyBLEP::setdt(double time) {
    freqInSecondsPerSample = time;
}

void PolyBLEP::setFrequency(double freqInHz) {
    setdt(freqInHz / sampleRate);
}

void PolyBLEP::setSampleRate(double sampleRate) {
    const double freqInHz = getFreqInHz();
    this->sampleRate = sampleRate;
    setFrequency(freqInHz);
}

double PolyBLEP::getFreqInHz() const {
    return freqInSecondsPerSample * sampleRate;
}

void PolyBLEP::setPulseWidth(double pulseWidth) {
    this->pulseWidth = pulseWidth;
}

void PolyBLEP::sync(double phase) {
    t = phase;
    if (t >= 0) {
        t -= bitwiseOrZero(t);
    } else {
        t += 1 - bitwiseOrZero(t);
    }
}

void PolyBLEP::setWaveform(Waveform waveform) {
    this->waveform = waveform;
}

double PolyBLEP::get() const {
    if(getFreqInHz() >= sampleRate / 4) {
        return sin();
    } else switch (waveform) {
        case SINE:
            return sin();
        case COSINE:
            return cos();
        case TRIANGLE:
            return tri();
        case SQUARE:
            return sqr();
        case RECTANGLE:
            return rect();
        case SAWTOOTH:
            return saw();
        case RAMP:
            return ramp();
        case MODIFIED_TRIANGLE:
            return tri2();
        case MODIFIED_SQUARE:
            return sqr2();
        case HALF_WAVE_RECTIFIED_SINE:
            return half();
        case FULL_WAVE_RECTIFIED_SINE:
            return full();
        case TRIANGULAR_PULSE:
            return trip();
        case TRAPEZOID_FIXED:
            return trap();
        case TRAPEZOID_VARIABLE:
            return trap2();
        default:
            return 0.0;
    }
}

void PolyBLEP::inc() {
    t += freqInSecondsPerSample;
    t -= bitwiseOrZero(t);
}

double PolyBLEP::getAndInc() {
    const double sample = get();
    inc();
    return sample;
}

double PolyBLEP::sin() const {
    return amplitude * std::sin(TWO_PI * t);
}

double PolyBLEP::cos() const {
    return amplitude * std::cos(TWO_PI * t);
}

double PolyBLEP::half() const {
    double t2 = t + 0.5;
    t2 -= bitwiseOrZero(t2);

    double y = (t < 0.5 ? 2 * std::sin(TWO_PI * t) - 2 / M_PI : -2 / M_PI);
    y += TWO_PI * freqInSecondsPerSample * (blamp(t, freqInSecondsPerSample) + blamp(t2, freqInSecondsPerSample));

    return amplitude * y;
}

double PolyBLEP::full() const {
    double _t = this->t + 0.25;
    _t -= bitwiseOrZero(_t);

    double y = 2 * std::sin(M_PI * _t) - 4 / M_PI;
    y += TWO_PI * freqInSecondsPerSample * blamp(_t, freqInSecondsPerSample);

    return amplitude * y;
}

double PolyBLEP::tri() const {
    double t1 = t + 0.25;
    t1 -= bitwiseOrZero(t1);

    double t2 = t + 0.75;
    t2 -= bitwiseOrZero(t2);

    double y = t * 4;

    if (y >= 3) {
        y -= 4;
    } else if (y > 1) {
        y = 2 - y;
    }

    y += 4 * freqInSecondsPerSample * (blamp(t1, freqInSecondsPerSample) - blamp(t2, freqInSecondsPerSample));

    return amplitude * y;
}

double PolyBLEP::tri2() const {
    double pulseWidth = std::fmax(0.0001, std::fmin(0.9999, this->pulseWidth));

    double t1 = t + 0.5 * pulseWidth;
    t1 -= bitwiseOrZero(t1);

    double t2 = t + 1 - 0.5 * pulseWidth;
    t2 -= bitwiseOrZero(t2);

    double y = t * 2;

    if (y >= 2 - pulseWidth) {
        y = (y - 2) / pulseWidth;
    } else if (y >= pulseWidth) {
        y = 1 - (y - pulseWidth) / (1 - pulseWidth);
    } else {
        y /= pulseWidth;
    }

    y += freqInSecondsPerSample / (pulseWidth - pulseWidth * pulseWidth) * (blamp(t1, freqInSecondsPerSample) - blamp(t2, freqInSecondsPerSample));

    return amplitude * y;
}

double PolyBLEP::trip() const {
    double t1 = t + 0.75 + 0.5 * pulseWidth;
    t1 -= bitwiseOrZero(t1);

    double y;
    if (t1 >= pulseWidth) {
        y = -pulseWidth;
    } else {
        y = 4 * t1;
        y = (y >= 2 * pulseWidth ? 4 - y / pulseWidth - pulseWidth : y / pulseWidth - pulseWidth);
    }

    if (pulseWidth > 0) {
        double t2 = t1 + 1 - 0.5 * pulseWidth;
        t2 -= bitwiseOrZero(t2);

        double t3 = t1 + 1 - pulseWidth;
        t3 -= bitwiseOrZero(t3);
        y += 2 * freqInSecondsPerSample / pulseWidth * (blamp(t1, freqInSecondsPerSample) - 2 * blamp(t2, freqInSecondsPerSample) + blamp(t3, freqInSecondsPerSample));
    }
    return amplitude * y;
}

double PolyBLEP::trap() const {
    double y = 4 * t;
    if (y >= 3) {
        y -= 4;
    } else if (y > 1) {
        y = 2 - y;
    }
    y = std::fmax(-1, std::fmin(1, 2 * y));

    double t1 = t + 0.125;
    t1 -= bitwiseOrZero(t1);

    double t2 = t1 + 0.5;
    t2 -= bitwiseOrZero(t2);

    // Triangle #1
    y += 4 * freqInSecondsPerSample * (blamp(t1, freqInSecondsPerSample) - blamp(t2, freqInSecondsPerSample));

    t1 = t + 0.375;
    t1 -= bitwiseOrZero(t1);

    t2 = t1 + 0.5;
    t2 -= bitwiseOrZero(t2);

    // Triangle #2
    y += 4 * freqInSecondsPerSample * (blamp(t1, freqInSecondsPerSample) - blamp(t2, freqInSecondsPerSample));

    return amplitude * y;
}

double PolyBLEP::trap2() const {
    double pulseWidth = std::fmin(0.9999, this->pulseWidth);
    double scale = 1 / (1 - pulseWidth);

    double y = 4 * t;
    if (y >= 3) {
        y -= 4;
    } else if (y > 1) {
        y = 2 - y;
    }
    y = std::fmax(-1, std::fmin(1, scale * y));

    double t1 = t + 0.25 - 0.25 * pulseWidth;
    t1 -= bitwiseOrZero(t1);

    double t2 = t1 + 0.5;
    t2 -= bitwiseOrZero(t2);

    // Triangle #1
    y += scale * 2 * freqInSecondsPerSample * (blamp(t1, freqInSecondsPerSample) - blamp(t2, freqInSecondsPerSample));

    t1 = t + 0.25 + 0.25 * pulseWidth;
    t1 -= bitwiseOrZero(t1);

    t2 = t1 + 0.5;
    t2 -= bitwiseOrZero(t2);

    // Triangle #2
    y += scale * 2 * freqInSecondsPerSample * (blamp(t1, freqInSecondsPerSample) - blamp(t2, freqInSecondsPerSample));

    return amplitude * y;
}

double PolyBLEP::sqr() const {
    double t2 = t + 0.5;
    t2 -= bitwiseOrZero(t2);

    double y = t < 0.5 ? 1 : -1;
    y += blep(t, freqInSecondsPerSample) - blep(t2, freqInSecondsPerSample);

    return amplitude * y;
}

double PolyBLEP::sqr2() const {
    double t1 = t + 0.875 + 0.25 * (pulseWidth - 0.5);
    t1 -= bitwiseOrZero(t1);

    double t2 = t + 0.375 + 0.25 * (pulseWidth - 0.5);
    t2 -= bitwiseOrZero(t2);

    // Square #1
    double y = t1 < 0.5 ? 1 : -1;

    y += blep(t1, freqInSecondsPerSample) - blep(t2, freqInSecondsPerSample);

    t1 += 0.5 * (1 - pulseWidth);
    t1 -= bitwiseOrZero(t1);

    t2 += 0.5 * (1 - pulseWidth);
    t2 -= bitwiseOrZero(t2);

    // Square #2
    y += t1 < 0.5 ? 1 : -1;

    y += blep(t1, freqInSecondsPerSample) - blep(t2, freqInSecondsPerSample);

    return amplitude * 0.5 * y;
}

double PolyBLEP::rect() const {
    double t2 = t + 1 - pulseWidth;
    t2 -= bitwiseOrZero(t2);

    double y = -2 * pulseWidth;
    if (t < pulseWidth) {
        y += 2;
    }

    y += blep(t, freqInSecondsPerSample) - blep(t2, freqInSecondsPerSample);

    return amplitude * y;
}

double PolyBLEP::saw() const {
    double _t = t + 0.5;
    _t -= bitwiseOrZero(_t);

    double y = 2 * _t - 1;
    y -= blep(_t, freqInSecondsPerSample);

    return amplitude * y;
}

double PolyBLEP::ramp() const {
    double _t = t;
    _t -= bitwiseOrZero(_t);

    double y = 1 - 2 * _t;
    y += blep(_t, freqInSecondsPerSample);

    return amplitude * y;
}
