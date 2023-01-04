#include "maximilian.h"

maxiSample beats; //We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.

void setup() {//some inits
    
    //relative path to maximilian_examples/12.SamplePlayer/build - please replace if running from a different location
    beats.load("../../../beat2.wav");//load in your samples. Provide the full path to a wav file.
    cout << "Summary:\n" << beats.getSummary() << endl;//get info on samples if you like.
    
}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    // output[0]=beats.play();//just play the file. Looping is default for all play functions.
    output[0]=beats.playAtSpeed(0.68);//play the file with a speed setting. 1. is normal speed.
    
    output[1]=output[0];
}

