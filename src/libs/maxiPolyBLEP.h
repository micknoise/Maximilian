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


class CHEERP_EXPORT maxiPolyBLEP {
public:

  maxiPolyBLEP() {
    blep.setSampleRate(maxiSettings::sampleRate);
  }

  double play(double freq) {
    blep.setFrequency(freq);
    return blep.getAndInc();
  }

  void setWaveform(PolyBLEP::Waveform waveform) {
    blep.setWaveform(waveform);
  }

  void setPulseWidth(double pw) {
    blep.setPulseWidth(pw);
  }

private:
  PolyBLEP blep = PolyBLEP(44100);

};