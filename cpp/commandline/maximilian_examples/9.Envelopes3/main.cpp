//Envelopes allow you to shape the sound. 
//This example demonstrates how you can change envelope shape over time

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

    myEnv.setup({0,1,0.2,0},{100,70,10},{1,1,1}, false, true);    
    myEnv2.setup({0.1,1},{30000},{1}, false);  
    myEnv3.setup({100,200},{30000},{2}, false);  
     
    filter.setResonance(0.2);
}

void play(double *output) {
    double controller = myEnv2.play(1);
    double cl = clockPhase.phasor(3 - (controller * 2));
    double trig = rseq.playTrig(cl, {3,3,2});
    myEnv.setLevel(0, controller); //set attack level
    myEnv.setLevel(1, 1.0-controller); //set decay level
    myEnv.setCurve(0, 1.0 + controller); //set attack curve
    myEnv.setTime(2, controller * 300); //set release time
    p.poll(controller,5, "controller: ");
    double ampenv = myEnv.play(trig);
    double frequency = pitchStep.pull(trig, {40,80,170,350,900,3888}, 1);
    double w = osc1.play(frequency) + osc2.play(frequency * (1.02 + (controller * 0.13)));
    w = w * ampenv;
    double cutoff = myEnv3.play(1);
    filter.setCutoff(cutoff);
    w = filter.play(w, 0, 1, 0.3, 0);
    output[0] = w;
    output[1] = output[0];
    
}
