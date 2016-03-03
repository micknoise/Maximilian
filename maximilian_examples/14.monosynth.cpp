#include "maximilian.h"

//This shows how to use maximilian to build a monophonic synth

//These are the synthesiser bits
maxiOsc VCO1,VCO2,LFO1,LFO2;
maxiFilter VCF;
maxiEnvelope ADSR;

//These are the control values for the envelope

double adsrEnv[8]={1,5,0.125,250,0.125,125,0,500};

//This is a bunch of control signals so that we can hear something

maxiOsc timer;//this is the metronome
int currentCount,lastCount;//these values are used to check if we have a new beat this sample

//and these are some variables we can use to pass stuff around

double VCO1out,VCO2out,LFO1out,LFO2out,VCFout,ADSRout;


void setup() {//some inits
	
	
}

void play(double *output) {
	
	//so this first bit is just a basic metronome so we can hear what we're doing.
	
	currentCount=(int)timer.phasor(0.5);//this sets up a metronome that ticks every 2 seconds
	
	if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound
				
		ADSR.trigger(0, adsrEnv[0]);//trigger the envelope from the start
		
		cout << "tick\n";//the clock ticks
	
		lastCount=0;//set lastCount to 0
	}
	
	//and this is where we build the synth
	
		
	ADSRout=ADSR.line(8,adsrEnv);//our ADSR env has 8 value/time pairs.
	
	LFO1out=LFO1.sinebuf(0.2);//this lfo is a sinewave at 0.2 hz
	
	VCO1out=VCO1.pulse(55,0.6);//here's VCO1. it's a pulse wave at 55 hz, with a pulse width of 0.6
	VCO2out=VCO2.pulse(110+LFO1out,0.2);//here's VCO2. it's a pulse wave at 110hz with LFO modulation on the frequency, and width of 0.2


	VCFout=VCF.lores((VCO1out+VCO2out)*0.5, 250+(ADSRout*15000), 10);//now we stick the VCO's into the VCF, using the ADSR as the filter cutoff 
	
	*output=VCFout*ADSRout;//finally we add the ADSR as an amplitude modulator 
	
}
