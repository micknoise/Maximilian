#include "maximilian.h"

maxiSample kick,snare; //We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.

maxiOsc timer;

int currentCount,lastCount,playHead,hit[16]={1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0};
int snarehit[16]={0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0};

int kicktrigger,snaretrigger;

double sampleOut;

void setup() {//some inits
	
	kick.load("/Users/mickgrierson/Documents/audio/blip.wav");//load in your samples. Provide the full path to a wav file.
	snare.load("/Users/mickgrierson/Documents/audio/snare.wav");//load in your samples. Provide the full path to a wav file.
	
	
	printf("Summary:\n%s", kick.getSummary());//get info on samples if you like.
	//beats.getLength();
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
	currentCount=(int)timer.phasor(4);//this sets up a metronome that ticks 8 times a second
	
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound
		
		kicktrigger=hit[playHead%16];
		snaretrigger=snarehit[playHead%16];
		playHead++;
		lastCount=0;
	}
	
	if (kicktrigger==1) {
		
		kick.trigger();
		
	}
	
	if (snaretrigger==1) {
		
		snare.trigger();
		
	}
	
	sampleOut=kick.playOnce()+snare.playOnce();//just play the file. Looping is default for all play functions.
	
	*output=sampleOut;
	
}