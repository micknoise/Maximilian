#include "maximilian.h"

maxiOsc myCounter,mySwitchableOsc,another;//these oscillators will help us count and make sound.
int CurrentCount;//we're going to put the current count in this variable so that we can use it more easily.
double myOscOutput;//we're going to stick the output here to make it easier to mess with stuff.
int myArray[10]={100,200,300,400,300,200,100,240,640,360};

void setup() {//some inits
    //nothing to go here this time
}

void play(double *output) {
    
    CurrentCount=myCounter.phasor(1*((another.sawn(0.1)+1)/2), 1, 9);//phasor can take three arguments; frequency, start value and end value.
    
    if (CurrentCount<5) {//simple if statement
        
        myOscOutput=mySwitchableOsc.square(myArray[CurrentCount]);
    }
    
    else if (CurrentCount>=5) {//and the 'else' bit.
        
        myOscOutput=mySwitchableOsc.sawn(myArray[CurrentCount]);//one osc object can produce whichever waveform you want.
    }
    output[0]=myOscOutput;//point me at your speakers and fire.
    output[1]=output[0];
    
}
