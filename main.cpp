#include "maximilian.h"

maxiOsc sound,timer;//We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.
maxiEnv AR;
double out;
int trigger, lasttrigger;
int currentCount,lastCount,playHead=0;
int rhythm[8]={1,0,1,0,1,0,1,0};


void setup() {//some inits
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	currentCount=(int)timer.phasor(16);//this sets up a metronome that ticks every 2 seconds
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound

		trigger=rhythm[playHead];
		playHead++;
		if (playHead>7) {
			playHead=0;
		}
		//cout << "tick\n";//the clock ticks
		lastCount=0;//set lastCount to 0
	}
	
	
//	beat=beats.play();//just play the file. Looping is default for all play functions.
	
	*output=AR.adsr(sound.pulse(440,0.5),1,0.999, 0.125, 0.9999, 1, trigger);//new, simple ADSR.

	//	*output=beats.play(0.69);//play the file with a speed setting. 1. is normal speed.
	//	*output=beats.play(0.5,0,44100);//linear interpolationplay with a frequency input, start point and end point. Useful for syncing.
	//	*output=beats.play4(0.5,0,44100);//cubic interpolation play with a frequency input, start point and end point. Useful for syncing.
	
	
}

