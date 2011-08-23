#include "maximilian.h"

maxiOsc mySine;//let's create an oscillator and give it a name.

void setup() {//some inits
	//nothing to go here this time	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
	*output=mySine.sinewave(440);//simple as that! 
	
}

