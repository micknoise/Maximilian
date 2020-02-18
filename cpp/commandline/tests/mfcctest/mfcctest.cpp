#include "maximilian.h"
#include "maxiFFT.h"
#include "maxiMFCC.h"

//
maxiOsc osc1, osc2, osc3, osc4, osc5;
maxiFFT fft;
vector<float> mags, phases;
vector<double> mfccs;
maxiMFCC mfcc;

void setup() {//some inits
    cout << "Setup";
    fft.setup(1024,256, 1024);
    mags.resize(512, 0);
    phases.resize(512, 0);
    mfccs.resize(13,0);
    mfcc.setup(fft.getNumBins(), fft.getNumBins()/2, mfccs.size(), 20, 20000);
}

void play(double *output) {
  double w = 0;
  w = osc1.sawn(maxiMap::linexp(osc2.phasor(0.2), 0, 1, 100, 5000));
  if (fft.process(w, maxiFFT::WITH_POLAR_CONVERSION)) {
    mags = fft.getMagnitudes();
    phases = fft.getPhases();
    mfccs = mfcc.mfcc(mags);
    cout << mfccs[1] << endl;
  }
  output[0] = w;
  output[1] = w;
}
