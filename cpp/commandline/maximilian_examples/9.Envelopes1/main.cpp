//Envelopes allow you to shape the sound. 

#include "maximilian.h"
#include "maxiPolyBLEP.h"

maxiPolyBLEP osc1;
maxiPolyBLEP osc2;
maxiOsc trig;
maxiEnvGen myEnv, myEnv2, myEnv3;
maxiSVF svf;
maxiNonlinearity dist;


void setup() {
    
    osc1.setWaveform(maxiPolyBLEP::Waveform::SAWTOOTH);
    osc2.setWaveform(maxiPolyBLEP::Waveform::SQUARE);

    myEnv.setup({100,200,380,650,40},{500,2000,125,500},{2,2,2,1}, true);    
    myEnv2.setup({20,3000},{4000},{1.2}, false);    
    myEnv3.setup({1,5,20},{30000,20000},{2,1}, false);

    svf.setResonance(3);
}

void play(double *output) {
    
    double pitchenv = myEnv.play(1);
    double w = osc1.play(pitchenv) + osc2.play(1.08 * pitchenv);
    svf.setCutoff(myEnv2.play(trig.impulse(0.1)));
    w = svf.play(w, 0,1,0,0);
    w = dist.atanDist(w, myEnv3.play(1));
    output[0] = w;
    output[1] = output[0];
    
}
