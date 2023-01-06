#include "maximilian.h"

maxiOsc osc1, osc2, osc3;
maxiEnvGen pitchEnv;
maxiRMS rms;
maxiRMS slowRms;
maxiPoll poll1, poll2, poll3;
maxiZeroCrossingRate zcr;

void setup() {//some inits
    pitchEnv.setup({20,5000},{60000},{2}, true, false);
    rms.setup(50,40);
    slowRms.setup(1000,1000);
}

void play(double *output) {
    double freq = pitchEnv.play(1);
    double w = osc1.sawn(freq) + osc2.sawn(freq * 2.03);
    double pollFreq=20;
    w = w * osc3.sinewave(0.2);
    poll1.poll(rms.play(w), pollFreq, "rms: ", "");
    poll2.poll(slowRms.play(w), pollFreq, "\t\t slow rms: ", "");
    poll3.poll(zcr.play(w), pollFreq, "\t\t zcr: ");
    output[0]= output[1] = w;
}
