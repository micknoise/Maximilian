#include "maximilian.h"

maxiOsc sound,bass,timer,mod;
maxiEnv envelope;
double bassout,leadout;
int trigger;
int currentCount,lastCount,playHead=0;
int rhythm[8]={1,0,1,0,1,0,1,0};
float pitch[8]={220,220,246.9,261.6};
float currentPitch;



void setup() {//some inits
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	currentCount=(int)timer.phasor(20);//this sets up a metronome that ticks every so often
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound
		trigger=rhythm[playHead%8];//read through the array
		currentPitch=pitch[(playHead%8)/2];
		playHead++;//iterate the playhead
		//cout << "tick\n";//the clock ticks
		lastCount=0;//set lastCount to 0
	}
	
	bassout=envelope.adsr(bass.saw(currentPitch*0.5)+sound.pulse(currentPitch*0.5,mod.phasor(1)),1,0.9995, 0.25, 0.9995, 1, trigger);//new, simple ADSR.
	
	*output=bassout;
	


	
}

