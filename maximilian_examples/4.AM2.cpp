#include "maximilian.h"

//This shows how to use maximilian to do basic amplitude modulation

maxiOsc mySine,myOtherSine,myPhasor;//Three oscillators. They can be called anything. They can be any of the available waveforms.


void setup() {//some inits
	//nothing to go here this time	
}

void play(double *output) {
	
	*output=mySine.sinewave(440)*myOtherSine.sinewave(myPhasor.phasor(0.1,0,440));
	
}
