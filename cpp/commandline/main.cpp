#include "maximilian.h"

//
maxiOsc osc1, osc2, osc3, osc4, osc5;//One oscillator - can be called anything. Can be any of the available waveforms.
maxiFilter filt1;
maxiDistortion dist;
void setup() {//some inits
    //nothing to go here this time
}

void play(double *output) {
    double ramp = osc4.phasor(0.1) * 20.0;
    double freq = maxiMap::linexp(osc2.sinewave(ramp + 0.1),-1,1,50,200);
    double w = osc1.sawn(freq) + osc3.sawn(freq*1.03);
    w = filt1.lores(w, maxiMap::linexp(osc5.phasor(0.4),0,1,40,4000), 0.9);
    w = dist.atanDist(w,10);
    output[0]= output[1] = w;
    
}

