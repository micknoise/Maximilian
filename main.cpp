#include "maximilian.h"

maxiOsc myCounter,myOsc, myCutoff;//

maxiFilter myFilter, anotherFilter;

int countIndex;
int frequencies[10] = {100, 200, 400, 340, 440, 880, 660, 120, 333};

double lastOutput = 0.0;
double myOscOutput = 0.0;
//double myCutoff = 0.2;


void setup() {//some inits
    
}

void play(double *output) {
    countIndex = myCounter.phasor(1, 0, 9);
    
    myOscOutput = myOsc.sawn(anotherFilter.lopass(frequencies[countIndex], 0.001));
    
    output[0] = myFilter.lopass(myOscOutput, myCutoff.phasor(0.1, 0.01, 0.5));
    
    output[1] = output[0];
}


