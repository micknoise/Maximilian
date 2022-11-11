//Envelopes allow you to shape the sound. 
//This example demonstrates the envelopes with hold segments.  You can trigger them with a square wave, and they will hold until the square wave returns to 0.

#include "maximilian.h"
#include "maxiPolyBLEP.h"

maxiPolyBLEP osc1;
maxiPolyBLEP osc2;
maxiOsc trig;
maxiEnvGen myEnv, myEnv2, myEnv3;
maxiBiquad filter;



void setup() {
    
    osc1.setWaveform(maxiPolyBLEP::Waveform::MODIFIED_SQUARE);
    osc2.setWaveform(maxiPolyBLEP::Waveform::TRIANGLE);

    myEnv.setup({0,1,1,0.1},{200,maxiEnvGen::HOLD,200},{1,1,1}, false);    
    myEnv2.setup({0,1},{10000},{1}, false);  
    myEnv3.setup({2000,100},{10000},{0.5}, false);  

}

void play(double *output) {
    //use an envelope to slowly decrease the hold time
    double env = myEnv.play(trig.pulse(1, myEnv2.play(1)));
    filter.set(maxiBiquad::LOWPASS, myEnv3.play(1), 2, 3);  
    double frequency = 20 + (env*500);
    output[0] = filter.play(osc1.play(frequency) + osc2.play((frequency + 25) * 2));
    output[1] = output[0];
    
}
