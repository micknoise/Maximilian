#include "maximilian.h"

maxiOsc myOsc,myAutoPanner;//
double myStereoOutput[2];
maxiMix myOutputs;//this is the stereo mixer channel.

void setup() {//some inits
    
}

void play(double *output) {
    
    
    myOutputs.stereo(myOsc.noise(),myStereoOutput,(myAutoPanner.sinewave(1)+1)/2);//Stereo, Quad or 8 Channel. Specify the input to be mixed, the output[numberofchannels], and the pan (0-1,equal power).
    output[0]=myStereoOutput[0];//When working with mixing, you need to specify the outputs explicitly
    output[1]=myStereoOutput[1];//
    
}
