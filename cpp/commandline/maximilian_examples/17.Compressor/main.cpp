#include "maximilian.h"

maxiSample beats; //We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.
maxiDyn compressor; //this is a compressor
maxiDynamics dyn;
maxiOsc osc1, osc2;

void setup() {//some inits
    
    beats.load("../../../beat2.wav");//load in your samples. Provide the full path to a wav file.
    
    dyn.setAttack(400);
    dyn.setRelease(400);
    
}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    
    //here, we're just compressing the file in real-time
    //arguments are input,ratio,threshold,attack,release

    double out=beats.play();
    double oscs = osc1.saw(300);// * (osc2.phasor(0.5) > 0.5);
    out = dyn.play(oscs, out, -12, 4, 10);
    
    
    output[0]=out;
    output[1]=out;
    
}

