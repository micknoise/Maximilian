#ifndef POLY_BLEP_H_INCLUDED
#define POLY_BLEP_H_INCLUDED

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

#ifdef CHEERP
#define CHEERP_EXPORT [[cheerp::jsexport]]
#include <cheerp/clientlib.h>
#else
#define CHEERP_EXPORT
#endif



class CHEERP_EXPORT PolyBLEP {
public:
    enum Waveform {
        SINE=0,
        COSINE,
        TRIANGLE,
        SQUARE,
        RECTANGLE,
        SAWTOOTH,
        RAMP,
        MODIFIED_TRIANGLE,
        MODIFIED_SQUARE,
        HALF_WAVE_RECTIFIED_SINE,
        FULL_WAVE_RECTIFIED_SINE,
        TRIANGULAR_PULSE,
        TRAPEZOID_FIXED,
        TRAPEZOID_VARIABLE
    };

    PolyBLEP(double sampleRate);

    // virtual ~PolyBLEP();

    void setFrequency(double freqInHz);

    void setSampleRate(double sampleRate);

    void setWaveform(Waveform waveform);

    void setPulseWidth(double pw);

    double get() const;

    void inc();

    double getAndInc();

    double getFreqInHz() const;

    void sync(double phase);

protected:
    Waveform waveform;
    double sampleRate;
    double freqInSecondsPerSample;
    double amplitude; // Frequency dependent gain [0.0..1.0]
    double pulseWidth; // [0.0..1.0]
    double t; // The current phase [0.0..1.0) of the oscillator.

    void setdt(double time);

    double sin() const;

    double cos() const;

    double half() const;

    double full() const;

    double tri() const;

    double tri2() const;

    double trip() const;

    double trap() const;

    double trap2() const;

    double sqr() const;

    double sqr2() const;

    double rect() const;

    double saw() const;

    double ramp() const;
};


#endif
