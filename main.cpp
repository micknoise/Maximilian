#include "maximilian.h"


maxiOsc timer;//this is the metronome
int currentCount,lastCount,blob;//these values are used to check if we have a new beat this sample

void setup() {//some inits
	//nothing to go here this time	
	
	blob=0;
}

void play(double *output) {
	
	
	currentCount=(int)timer.phasor(1000);//this sets up a metronome that ticks every 2 seconds
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound
				
		cout << "tick\n";//the clock ticks
		blob++;
		cout << blob;
		cout << "\n";
		lastCount=0;//set lastCount to 0
	}
		
}