#include "maximilian.h"

maxiSample kick,snare; //we've got two sampleplayers

maxiDyn compress,basscompress;

maxiOsc sound1,sound2,sound3;

maxiFilter slew;//we're going to use this low pass filter for portamento

maxiOsc timer; //and a timer

int currentCount,lastCount,playHead,hit[16]={1,0,0,1,0,0,1,0,0,1,0,1,0,0,0,1}; //This is the sequence for the kick
int snarehit[16]={0,0,0,0,1,0,0,0,0,0,0,0,1,1,0,0};//This is the sequence for the snare
int bassline[8]={220,110,110,220,110,400,1280,260};


int kicktrigger,snaretrigger,basslinetrigger;

double sampleOut,bassout,bassfreq,temp;

void setup() {//some inits
	
    //YOU HAVE TO PROVIDE THE SAMPLES....
    
	kick.load("../../blip.wav");//load in your samples. Provide the full path to a wav file.
	snare.load("../../snare.wav");//load in your samples. Provide the full path to a wav file.

	
	printf("Summary:\n%s", kick.getSummary());//get info on samples if you like.
	//beats.getLength();
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
	
	currentCount=(int)timer.phasor(8);//this sets up a metronome that ticks 8 times a second
	
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound
		
		kicktrigger=hit[playHead%16];//get the value out of the array for the kick
		snaretrigger=snarehit[playHead%16];//same for the snare
		bassfreq=bassline[playHead%8];
		playHead++;//iterate the playhead
		lastCount=0;//reset the metrotest
	}
	
	if (kicktrigger==1 && playHead>64) {//if the sequence has a 1 in it
	
		kick.trigger();//reset the playback position of the sample to 0 (the beginning)
	
	}
	
	if (snaretrigger==1 &&playHead>32) {
		snare.trigger();//likewise for the snare
		
	}
	

		bassout=basscompress.compressor(sound1.pulse(slew.lopass(bassfreq/2,0.001), sound2.phasor(8)*0.25),10,0.5,0.0001,0.995)*0.25;		
		
		sampleOut=compress.compressor(kick.playOnce()+snare.playOnce(),5,0.5),0.0001,0.9995;//just play the file. No looping.

		output[0]=sampleOut+bassout;//left channel
        output[1]=sampleOut+bassout;//right channel

        kicktrigger = 0;//set trigger to 0 at the end of each sample to guarantee retriggering.
        snaretrigger = 0;
}