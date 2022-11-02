// Nothing much to say about this other than I like it.

#include "maximilian.h"

maxiOsc mySine,myOtherSine,myLastSine,myPhasor;//Three oscillators


void setup() {//some inits
    //nothing to go here this time
}

void play(double *output) {
    
    output[0]=mySine.sinewave(myOtherSine.sinewave(myLastSine.sinewave(0.1)*30)*440);//awesome bassline
    output[1]=output[0];

}
