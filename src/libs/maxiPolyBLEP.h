//this is a wrapper around Martin Finke's PolyBLEP library
//https://github.com/martinfinke/PolyBLEP

#include "../maximilian.h"
#include "PolyBLEP/PolyBLEP.h"

#ifdef CHEERP
#define CHEERP_EXPORT [[cheerp::jsexport]]
#include <cheerp/clientlib.h>
#else
#define CHEERP_EXPORT
#endif

/**
 * Anti-aliased oscillators;
*/
class CHEERP_EXPORT maxiPolyBLEP {
public:

  /*! Waveform types:
  *     SINE,
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
  */
  using Waveform = PolyBLEP::Waveform;

  /*! Constructor */
  maxiPolyBLEP() {
    blep.setSampleRate(maxiSettings::sampleRate);
  }

  /**
   * play the oscillator
   * \param freq frequency in Hz
   */
  double play(double freq) {
    blep.setFrequency(freq);
    return blep.getAndInc();
  }

  /*! Set the waveform type */
  void setWaveform(Waveform waveform) {
    blep.setWaveform(waveform);
  }

  /** Change the pulse width (0 <= pw <= 1)*/
  void setPulseWidth(double pw) {
    blep.setPulseWidth(pw);
  }

  /* Set sample rate */
  void setSampleRate(double sampleRate) {
    blep.setSampleRate(sampleRate);
  }

  /* Sync modulation */
  void sync(double phase) {
    blep.sync(phase);
  }

private:
  PolyBLEP blep = PolyBLEP(44100);

};
