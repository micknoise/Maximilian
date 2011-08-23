#include "maximilian.h"

maxiOsc mySine,myOtherSine,myLastSine,myPhasor;//Three oscillators


void setup() {//some inits
	//nothing to go here this time	
}

void play(double *output) {
	
	*output=mySine.sinewave(myOtherSine.sinewave(myLastSine.sinewave(0.1)*30)*440);//awesome bassline
	
}
