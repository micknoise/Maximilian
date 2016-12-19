#include "maximilian.h"

maxiOsc myOsc;
maxiEnvelope myEnv;
int counter;
double vals[12]={1,0.1,0.5,0.0,1.5,0.0,0.1,1,1.0,0.15,1.0,0.1};
std::vector<double> rampsA(vals, vals+12);


void setup() {//some inits
 
    myEnv.note(true);

}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    counter++;
    
    if (counter ==0 || counter % 330400==0) {
        myEnv.note(true);
    }
    
    
    double out = myEnv.ramps(rampsA);
    
    output[0]=myOsc.sinewave(440)*out;

    output[1]=output[0];
}


//#include "maximilian.h"
//
//maxiOsc myOsc;
//maxiEnvelope myEnv;
//int counter;
//
//void setup() {
//    cout << myEnv.trigger << endl;
//}
//
//void play(double *output) {
//    
//    
//    if (counter ==0 || counter % 88201==0) {
//        myEnv.note(true);
//    }
//    
//    if (counter % 44100==0) {
//        myEnv.note(false);
//    }
//    
//    counter++;
//    
//    double out = myEnv.adsr();
//
//    output[0]=myOsc.sinewave(440)*out;
//    
//    output[1]=output[0];
//    
//}

//#include "maximilian.h"
//
//maxiOsc myOsc;
//maxiEnvelope myEnv;
//int counter;
//
//void setup() {
//    cout << myEnv.trigger << endl;
//}
//
//void play(double *output) {
//    
//    
//    if (counter ==0 || counter % 88200==0) {
//        myEnv.note(true);
//    }
//    
//    
//    counter++;
//    
//    double out = myEnv.ar(1,1);
//    
//    output[0]=myOsc.sinewave(440)*out;
//    
//    output[1]=output[0];
//    
//}
