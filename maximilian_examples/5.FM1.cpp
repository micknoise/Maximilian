#include "maximilian.h"

maxiOsc mySine,myOtherSine;//Two oscillators


void setup() {//some inits
	//nothing to go here this time	
}

void play(double *output) {
	
	*output=mySine.sinewave(myOtherSine.sinewave(1)*440);
	
}
