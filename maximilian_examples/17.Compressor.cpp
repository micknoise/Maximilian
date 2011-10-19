#include "maximilian.h"

maxiSample beats; //We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.
maxiDyn compressor; //this is a compressor
double out;

void setup() {//some inits
	
	beats.load("/Users/yourusername/somewhere/schub.wav");//load in your samples. Provide the full path to a wav file.
	printf("Summary:\n%s", beats.getSummary());//get info on samples if you like.
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
	
	//here, we're just compressing the file in real-time
	//arguments are input,ratio,threshold,attack,release
	out=compressor.compressor(beats.play(),5,0.25,0.0001,0.9999);

	output[0]=out;	
	output[1]=out;	
	
	//	*output=beats.play(0.69);//play the file with a speed setting. 1. is normal speed.
	//	*output=beats.play(0.5,0,44100);//linear interpolationplay with a frequency input, start point and end point. Useful for syncing.
	//	*output=beats.play4(0.5,0,44100);//cubic interpolation play with a frequency input, start point and end point. Useful for syncing.

}

