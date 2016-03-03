#include "maximilian.h"

double outputs[2],moreoutputs[2]; //some track outputs
double filtered,patch1,patch2,tune,delayed,
mixed,ramp,filtered2,noise,pan,more;//a bunch of patch cables
int beat,lastbeat,morebeats,lastmorebeats;//some rhythmic elemts
double env[4]={200,0,0,50};//the kick drum pitch envelope data
double env2[6]={10000,0,9000,5,0,5};//the hi hat pitch envelope dat
double melody[14]={600,0,0,650,0,0,400,0,0,425,0,300,0,315};//the melody data
int rhythm1[16]={1,0,0,1,0,0,1,0,0,1,0,0,1,0,1,0};//another way of doing a rhythm
maxiOsc a,c,d,e,g,h,i,j,squarewave;//some oscillators
maxiEnvelope b,f;//two envelopers
maxiDelayline delay;//a delay line
maxiFilter myfilter,antia;// a FAT filter
maxiMix mymix,bobbins;//some panning busses
maxiSample beats;

void setup() {//some inits
	b.amplitude=env[0];//starting value for envelope b
	f.amplitude=env2[0];//same for f
	beats.load("/Users/chris/src/Maximilian/beat2.wav");//put a path to a soundfile here. Wav format only.
	printf("Summary:\n%s", beats.getSummary());//get info on samples if you like
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	beat=((int) c.phasor(8));//this oscillator is now a counter
	morebeats=((int) e.phasor(0.5,0,16));//so is this one
	patch1=b.line(4,env);//here's envelope b
	patch2=f.line(6,env2);//here's envelop f
	tune=g.saw(melody[morebeats]*0.25);//here's the melody, which occurs at certain times
	
	if (lastbeat!=beat) {//this is a nice sample and hold routine for the kick drum 
		f.trigger(0, env2[0]);//it runs off the hi hat.
		
		
		if (rhythm1[morebeats]==1) {
			b.trigger(0, env[0]);//and gets played when it's time.
		}
	}
	lastbeat=beat;//let's start again. It's a loop
	ramp=i.phasor(0.5,1,2048);//create a basic ramp
	pan=j.phasor(0.25);//some panning from a phasor (object is equal power)
	delayed=delay.dl(tune, ramp, 0.9)*0.125;//the delay line
	//then it all gets mixed.
	mixed=((a.sinewave(patch1)*0.5)+((d.saw(patch2))*0.125)+(delayed*0.3)*0.5);
	//add some noise
	noise=i.noise()*0.25;
	filtered2=beats.play(1*(1./16.),0,beats.length);
	//	filtered2=beats.play(-1);
	
	more=squarewave.pulse(melody[morebeats],pan)*0.05;
	//filter the noise! this lores takes values between 1 and 100 for res, and freq for cutoff.
	filtered=myfilter.lores(filtered2, 1+(pan*10000), 10)*0.4;
	
	//now we send the sounds to some stereo busses.
	mymix.stereo(more+mixed+delayed, outputs, 1-pan);
	bobbins.stereo(filtered, moreoutputs, pan);//invert the pan
	
	//mixing
	
	output[0]=outputs[0]+moreoutputs[0];//stick it in the out!!
	output[1]=outputs[1]+moreoutputs[1];
	
}

