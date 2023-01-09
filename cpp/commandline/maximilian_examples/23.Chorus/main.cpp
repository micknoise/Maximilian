// Here is an example of a Maximilian filter being used.
// There are a number of filters in Maximilian, including low and high pass filters.
// There are also resonant filters and a state variable filter.


#include "maximilian.h"

maxiOsc osc;
maxiChorus chorus;
maxiSample beats; 

maxiEnvGen delayEnv, fbEnv, speedEnv;


void setup() {//some inits
    beats.load("../../../beat2.wav");//load in your samples. Provide the full path to a wav file.
    //use envelopes to cycle through parameters
    delayEnv.setup({10, 1000, 10}, {10000,10000}, {1,1}, true);
    fbEnv.setup({0.2,0.99,0.2}, {15000,15000}, {1,1}, true);
    speedEnv.setup({0.01,10,0.01}, {25000,25000}, {1,1}, true);
}

void play(double *output) {
    
    double w = beats.play();
    w = chorus.chorus(w, delayEnv.play(1), fbEnv.play(1), speedEnv.play(1), 1);   
    output[0]=output[1]=w;
    
}
