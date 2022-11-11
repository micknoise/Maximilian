//Envelopes allow you to shape the sound. 

#include "maximilian.h"
#include "maxiPolyBLEP.h"

maxiPolyBLEP osc1;//
maxiOsc imp;
maxiEnvGen myEnv;



void setup() {
    
    osc1.setWaveform(maxiPolyBLEP::Waveform::MODIFIED_SQUARE);

    myEnv.setup({0,1,0.1},{10,200},{1,1.3}, false);    
}

void play(double *output) {
    
    double env = myEnv.play(imp.impulse(3));
    output[0] = osc1.play(20 + (env*2000));
    output[1] = output[0];
    
}
