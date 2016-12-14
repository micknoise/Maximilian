#include "maximilian.h"

maxiOsc myOsc;
maxiEnvelope myEnv;
int counter;
double tv[8] = {1,1,0,1,1,2,0,4};

void setup() {//some inits
    
}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    
    
    double out = myEnv.ramps(tv);
    
    output[0]=myOsc.sinewave(440)*out;
    
    output[1]=output[0];
}

