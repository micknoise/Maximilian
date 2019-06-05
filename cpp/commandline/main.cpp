#include "maximilian.h"
#include "maxiGrains.h"
#include "maxiFFT.h"

//
maxiOsc osc1, osc2, osc3, osc4, osc5;
maxiFilter filt1;
maxiDistortion dist;
maxiBiquad biquad;
maxiSample samp;
maxiStretch<hannWinFunctor> ts;
maxiFFT fft;
maxiIFFT ifft;
maxiLine line;

void setup() {//some inits
    cout << "Setup";
//    biquad.set(maxiBiquad::PEAK, 800, 0.1,-10);
//    samp.load("/Volumes/LocalDataHD/src/Maximilian/cpp/commandline/beat2.wav");
    samp.loadOgg("/Volumes/LocalDataHD/src/Maximilian/cpp/commandline/crebit2.ogg");
    samp.trigger();
//    samp.save("/tmp/test.wav");
//    ts.setSample(&samp);
    fft.setup(2048, 512);
    ifft.setup(2048, 512);
    line.prepare(-1, 1, 10000);
    line.triggerEnable(1);
}

void play(double *output) {
    double w = 0;
//    double ramp = osc4.phasor(0.1) * 20.0;
//    double freq = maxiMap::linexp(osc2.sinewave(ramp + 0.1),-1,1,50,200);
//    double w = osc1.sawn(freq) + osc3.sawn(freq*1.03);
//    w = filt1.lores(w, maxiMap::linexp(osc5.phasor(0.4),0,1,40,4000), 0.9);
////    w = biquad.play(w);
//    w = dist.atanDist(w,10);
//    w = w + samp.play();
//    w = w + ts.play(1, 1, 0.05, 2);
//    if (fft.process(w)) {
//    };
//    w = ifft.process(fft.getMagnitudes(), fft.getPhases());
//    w = w + samp.play();
    vector<double> ch1 = {osc1.sinewave(100), osc2.sinewave(101)};
    vector<double> ch2 = {osc3.saw(200), osc4.saw(201)};
//    double freq = line.play(osc2.sinewave(0.4));
//    w = osc1.saw(100 + (freq * 1000));
//    output[0]= output[1] = w;
    vector<double> mix = maxiXFade::xfade(ch1, ch2, line.play(1));
    output[0] = mix[0];
    output[1] = mix[1];
}

