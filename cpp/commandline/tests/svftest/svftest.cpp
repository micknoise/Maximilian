#include "maximilian.h"

//
maxiOsc osc1, osc2, osc3, osc4, osc5;
maxiSVF svf;

void setup() {//some inits
    cout << "Setup";
}

void play(double *output) {
    double w = 0;
    svf.setCutoff(40 + fabs(osc3.sinewave(0.5) * 500.0));
    svf.setResonance(osc2.phasor(0.2) * 1.2);
    w = svf.play(osc1.saw(100), 1, 0, 0, 0);
    output[0] = w;
    output[1] = w;
}
