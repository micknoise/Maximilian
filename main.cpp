#include "maximilian.h"

maxiSample beats;//We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.
maxiDyn compress;
double out;

void setup() {//some inits
	
	beats.load("/Users/mick/Desktop/schub.wav");//load in your samples. Provide the full path to a wav file.
	printf("Summary:\n%s", beats.getSummary());//get info on samples if you like.
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
	out=compress.gate(beats.play(),0.3,5000,0.03,0.9999);//just play the file. Looping is default for all play functions.
	
	output[0]=out;
	output[1]=out;
		
	
}

