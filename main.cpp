#include "maximilian.h"

maxiSample beats; //We give our sample a name. It's called beats this time. We could have loads of them, but they have to have different names.

void setup() {//some inits
	
<<<<<<< HEAD
	beats.loadOgg("/Users/mickgrierson/Documents/workspace/vorbis_test/ogg_test/thingy2.ogg");//load in your samples. Provide the full path to an ogg file if ogg enabled (uncomment #define VORBIS and add the stb_vorbis files).
	
//    beats.load("/Users/mickgrierson/Documents/workspace/vorbis_test/ogg_test/thingy.wav");//load in your samples. Provide the full path to a wav file.
=======
    beats.loadOgg("/Users/mickgrierson/Documents/workspace/vorbis_test/ogg_test/thingy2.ogg");//load in your samples. Provide the full path to an ogg file if ogg enabled (uncomment #define VORBIS and add the stb_vorbis files).
	
    //beats.load("/Users/mickgrierson/Documents/workspace/vorbis_test/ogg_test/thingy.wav");//load in your samples. Provide the full path to a wav file.
>>>>>>> blaa

    printf("Summary:\n%s", beats.getSummary());//get info on samples if you like.
	
}

void play(double *output) {//this is where the magic happens. Very slow magic.
	
//	    output[0]=beats.play();//just play the file. Looping is default for all play functions.
        output[0]=beats.playOnce();//play the file with a speed setting. 1. is normal speed.
//		*output=beats.play(0.5,0,44100);//linear interpolationplay with a frequency input, start point and end point. Useful for syncing.
//      *output=beats.play4(0.5,0,100000);//cubic interpolation play with a frequency input, start point and end point. Useful for syncing.
	
	
}

