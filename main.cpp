//#include "maximilian.h"
//
//maxiOsc myOsc;
//maxiEnvelope myEnv;
//int counter;
//double vals[12]={1,0.1,0.5,0.0,1.5,0.0,0.1,1,1.0,0.15,1.0,0.1};
//std::vector<double> rampsA(vals, vals+12);
//
//
//void setup() {//some inits
// 
//    myEnv.trigger(true);
//
//}
//
//void play(double *output) {//this is where the magic happens. Very slow magic.
//    
//    counter++;
//    
//    if (counter ==0 || counter % 330400==0) {
//        myEnv.trigger(true);
//    }
//    
//    
//    double out = myEnv.ramps(rampsA);
//    
//    output[0]=myOsc.sinewave(440)*out;
//
//    output[1]=output[0];
//}


//#include "maximilian.h"
//
//maxiOsc myOsc;
//maxiEnvelope myEnv;
//int counter=0;
//
//void setup() {
//}
//
//void play(double *output) {
//    
//    
//    if (counter ==0 || counter % 17640==0) {
//        myEnv.trigger(true);
//    }
//    
//    if (counter % 8821==0) {
//        myEnv.trigger(false);
//    }
//    
//    counter++;
//    
//    double out = myEnv.adsr(0.1,0.2,0.1,3);
//
//    output[0]=myOsc.sinewave(440)*out;
//    
//    output[1]=output[0];
//    
//}

#include "maximilian.h"

maxiOsc myOsc;
maxiEnvelope myEnv;
int counter;

void setup() {
}

void play(double *output) {
    
    
    if (counter ==0 || counter % 8820==0) {
        myEnv.trigger(true);
    }
    
    
    counter++;
    
    double out = myEnv.ar(0.01,1);
    
    output[0]=myOsc.sinewave(440)*out;
    
    output[1]=output[0];
    
}
