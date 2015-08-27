//This example shows how to create one of the most fundamental building blocks in computer audio. The sine wave.
//The sine wave is an oscillator - it oscillates back and forth between two values in a particular shape.


#include "maximilian.h"

maxiOsc mySine;//let's create an oscillator and give it a name.

void setup() {//some inits
    //nothing to go here this time
}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    //output[0] is the left output. output[1] is the right output
    output[0]=mySine.sinewave(440);//simple as that!
    
}

