#include "maximilian.h"
#include "maxiFFT.h"
//
maxiOsc osc1, osc2, osc3, osc4, osc5;
maxiFFT fft;
maxiIFFT ifft;
vector<float> mags, phases;
void setup() {//some inits
    cout << "Setup";
    fft.setup(1024,256);
    ifft.setup(1024,256);
    mags.resize(512, 0);
    phases.resize(512, 0);
}

void play(double *output) {
    double w = 0;
    w = osc1.sawn(maxiMap::linexp(osc2.phasor(0.2), 0, 1, 100, 5000));
    if (fft.process(w)) {
      mags = fft.getMagnitudes();
      phases = fft.getPhases();
      //shift bins up
      for(size_t i=511; i > 0; i--) {
        if (i > 10) {
          mags[i] = mags[i-10];
        }else{
          mags[i] = 0;
        }
      }
    }
    w = ifft.process(mags,phases, maxiIFFT::fftModes::SPECTRUM);
    output[0] = w;
    output[1] = w;
}
