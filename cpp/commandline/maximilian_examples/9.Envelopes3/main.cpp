//Envelopes allow you to shape the sound. 
//This example demonstrates the envelopes with hold segments.  You can trigger them with a square wave, and they will hold until the square wave returns to 0.

#include "maximilian.h"
#include "maxiPolyBLEP.h"

maxiPolyBLEP osc1;
maxiPolyBLEP osc2;
maxiOsc clockPhase;
maxiEnvGen myEnv, myEnv2, myEnv3;
maxiSVF filter;
maxiRatioSeq rseq;
maxiStep pitchStep;
maxiPoll p;



void setup() {
    
    osc1.setWaveform(maxiPolyBLEP::Waveform::MODIFIED_SQUARE);
    osc2.setWaveform(maxiPolyBLEP::Waveform::RECTANGLE);

    myEnv.setup({0,1,0.2,0},{10,70,200},{1,1,1}, false, true);    
    myEnv2.setup({0.1,1},{20000},{1}, false);  
    myEnv3.setup({2000,100},{10000},{0.5}, false);  

}

void play(double *output) {
    double cl = clockPhase.phasor(1);
    double trig = rseq.playTrig(cl, {3,3,2});
    double attackLevel = myEnv2.play(1);
    myEnv.setLevel(0, attackLevel);
    p.poll(releaseLevel,5, "env2: ");
    double ampenv = myEnv.play(trig);
    double frequency = pitchStep.pull(trig, {40,80,170,350}, 1);
    double w = osc1.play(frequency) + osc2.play(frequency * 1.09);
    w = w * ampenv;
    output[0] = w;
    output[1] = output[0];
    
}
