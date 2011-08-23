#include "maximilian.h"

maxiOsc mySine,myOtherSine;//Two oscillators with names.

void setup() {//some inits
	//nothing to go here this time	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
	*output=mySine.sinewave(440)+myOtherSine.sinewave(441);//these two sines will beat together. They're now a bit too loud though..
	
}

