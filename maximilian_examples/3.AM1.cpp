#include "maximilian.h"

//This shows how to use maximilian to do basic amplitude modulation

maxiOsc mySine,myOtherSine;//Two oscillators. They can be called anything. They can be any of the available waveforms. These ones will be sinewaves

void setup() {//some inits
	//nothing to go here this time	
}

void play(double *output) {
	
	*output=mySine.sinewave(440)*myOtherSine.sinewave(10);
	
}
