#include "maximilian.h"

maxiSample beats; //We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.
maxiDynamics dyn;
maxiEnvGen threshEnv, ratioEnv;

void setup() {//some inits
    
    beats.load("../../../beat2.wav");//load in your samples. Provide the full path to a wav file.
    
    dyn.setAttackHigh(20);
    dyn.setReleaseHigh(10);
    dyn.setAttackLow(1);
    dyn.setReleaseLow(1);
    dyn.setLookAhead(2);
    dyn.setRMSWindowSize(10);
    dyn.setInputAnalyser(maxiDynamics::RMS);

    threshEnv.setup({0, -30, 0}, {10000,10000}, {1,1}, true);
    ratioEnv.setup({20,1,0.05}, {15000,15000}, {1,1}, true);
    
}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    
    //here, we're just compressing the file in real-time
    //the looping envelopes move the compressor through different threshold and ratio combinations

    double out=beats.play();
    out = dyn.compress(out,  
        threshEnv.play(1), ratioEnv.play(1), 5
    );
    
    
    output[0]=out;
    output[1]=out;
    
}

