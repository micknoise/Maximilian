#include "maximilian.h"

maxiOsc sineBank[10];//let's create an oscillator and give it a name.

void setup() {//some inits
	//nothing to go here this time
}



void play(double *output) {//this is where the magic happens. Very slow magic.
	
    double wave=0;
    double f0 = 100;
    for(int i=0; i < 10; i++) {
        double thisSine = wave + sineBank[i].sinewave(f0 + (i * f0));
        double multiplier = 1.0 / (i+1.0);
        thisSine = thisSine * multiplier;
        wave = wave + thisSine;
    }
    wave *= 0.1;
	*output = wave;//simple as that!
	
    
}

