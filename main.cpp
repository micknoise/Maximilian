#include "maximilian.h"

maxiOsc sound,timer;
maxiEnv AR;
double out;
int trigger, lasttrigger;
int currentCount,lastCount,playHead=0;
int rhythm[8]={1,0,1,0,1,0,1,0};


void setup() {//some inits
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	currentCount=(int)timer.phasor(16);//this sets up a metronome that ticks every so often
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound

		trigger=rhythm[playHead];//read through the array
		playHead++;//iterate the playhead
		if (playHead>7) {//but not if it's too big..
			playHead=0;//in which case reset the playhead
		}
		//cout << "tick\n";//the clock ticks
		lastCount=0;//set lastCount to 0
	}
	
	*output=AR.adsr(sound.pulse(440,0.5),1,0.999, 0.125, 0.9999, 1, trigger);//new, simple ADSR.


	
}

