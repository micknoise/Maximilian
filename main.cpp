#include "maximilian.h"

maxiSample mySample;


void setup() {//some inits
    
    mySample.load("/Users/michaelgrierson/Documents/workspace/coursera2/full-stack-mooc-5/code/week2/music_machine_2015/public/bassline32bit.wav");
    cout << mySample.myBitsPerSample;

}

void play(double *output) {
    
    
    output[0]=mySample.play(2);
    
    output[1]=output[0];

}

