#include "maximilian.h"

//
maxiOsc osc1, osc2, osc3, osc4, osc5;
maxiFilter filt1;
maxiDistortion dist;
maxiBiquad biquad;

void setup() {//some inits
//    biquad.set(maxiBiquad::PEAK, 800, 0.1,-10);
}

void play(double *output) {
    double ramp = osc4.phasor(0.1) * 20.0;
    double freq = maxiMap::linexp(osc2.sinewave(ramp + 0.1),-1,1,50,200);
    double w = osc1.sawn(freq) + osc3.sawn(freq*1.03);
    w = filt1.lores(w, maxiMap::linexp(osc5.phasor(0.4),0,1,40,4000), 0.9);
//    w = biquad.play(w);
    w = dist.atanDist(w,10);
    output[0]= output[1] = w;
}

