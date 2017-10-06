#include "maximilian.h"

//This shows how the fundamental building block of digital audio - the sine wave.
//
maxiOsc mySine;//One oscillator - can be called anything. Can be any of the available waveforms.
void setup() {//some inits
    //nothing to go here this time
}

void play(double *output) {
    
    output[0]=mySine.sinewave(440);
    output[1]=output[0];
    
}

