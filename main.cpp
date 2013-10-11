#include "maximilian.h"

const int NUM = 200;

maxiOsc sineBank[NUM];//let's create an oscillator and give it a name.
maxiOsc modu;
void setup() {//some inits
	//nothing to go here this time
}




void play(double *output) {//this is where the magic happens. Very slow magic.
    double  wave = modu.saw(100);
    *output = wave;//simple as that!
	
    
}

