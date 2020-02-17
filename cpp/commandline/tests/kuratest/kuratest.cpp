#include "maximilian.h"

//
maxiOsc osc1, osc2, osc3, osc4, osc5;
maxiFilter filt1;
maxiDistortion dist;
maxiBiquad biquad;
maxiSample samp;
maxiLine line;
maxiKuramotoOscillatorSet kuraSyncSet(2);
maxiAsyncKuramotoOscillator kuraASyncSet(2), kuraASyncSet2(2);


void setup() {//some inits
    cout << "Setup";
//    biquad.set(maxiBiquad::PEAK, 800, 0.1,-10);
    samp.load("/Volumes/LocalDataHD/src/Maximilian/cpp/commandline/beat2.wav");
//    samp.loadOgg("/Volumes/LocalDataHD/src/Maximilian/cpp/commandline/crebit2.ogg");
    samp.trigger();
//    samp.save("/tmp/test.wav");
//    ts.setSample(&samp);

    //kuramoto
//    std::random_device r;
//
//    // Choose a random mean between 1 and 6
//    std::default_random_engine e1(r());
//    std::uniform_int_distribution<int> uniform_dist(0, 1);
//    int mean = uniform_dist(e1);
//    for(int i=0; i < kuraSyncSet.size(); i++) {
//        kuraSyncSet.setPhase(rand(), i);
//    }
    kuraSyncSet.setPhase(0,0);
    kuraSyncSet.setPhase(PI,1);
    kuraASyncSet.setPhase(0,0);
    kuraASyncSet.setPhase(0,1);
    kuraASyncSet2.setPhase(PI,0);
    kuraASyncSet2.setPhase(PI,1);

    //maxiBits Test
//    maxiBits x(0b10101001);
//    maxiBits::bitsig y;
//    y = x.lor(0b1111).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b10101111);
//
//    y = x.land(0b1111).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b00001001);
//
//    y = x.at(1).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b0);
//    y = x.at(7).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b1);
//
//    y = x.shl(3).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b10101001000);
//
//    y = x.shl(0).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t);
//
//    y = x.shr(4).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b1010);
//
//    y = x.r(3,4).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b1001);
//
//    y = x.r(7,2).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b10);
//
//    y = x.inc().t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t+1);
//
//    y = x.dec().t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t-1);
//
//    y = x.add(17).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t+17);
//
//    y = x.add(-255).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t-255);
//
//    y = x.mul(3).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t*3);
//
//    y = x.div(7).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==x.t/7);
//
//    y = x.neg().t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b11111111111111111111111101010110);
//
//    y = x.lxor(0b11110000).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0b01011001);
//
//    y = x.gt(255).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==0);
//    y = x.lt(255).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==1);
//
//    y = x.lte(x).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==1);
//    y = x.gte(x.t-1).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==1);
//
//    y = x.ct(4).t;
//    cout << std::bitset<32>(y) << endl;
//    assert(y==2);
//
//    y = x.r(8,8).mul(x.land(25)).t;
//    cout << std::bitset<32>(y) << endl;



//    cout << std::bitset<40>(x.lor(0b11).t) << endl;
//    cout << std::bitset<40>(x.lor(0b111).shl(25).t) << endl;
//    cout << std::bitset<8>(x.at(2).t) << endl;
//    cout << std::bitset<8>(x.at(3).t) << endl;
}

double kuraSyncTest() {
    double w=0;
    kuraSyncSet.play(0.5, 2);
    w += osc1.sinewave(maxiMap::linexp(kuraSyncSet.getPhase(0), 0, TWOPI, 200,500));
    w += osc2.sinewave(maxiMap::linexp(kuraSyncSet.getPhase(1), 0, TWOPI, 200,500));

    return w;
}
size_t tm=0;
double kuraASyncTest() {
    double w=0;
    if (tm % 2000 == 0) {
//        if (rand() % 100 < 1) {
        kuraASyncSet.setPhase(kuraASyncSet2.getPhase(0) , 1);
    }
    if (tm % 2000 == 0) {
//    if (rand() % 100 < 1) {
        kuraASyncSet2.setPhase(kuraASyncSet.getPhase(0), 1);
    }
    kuraASyncSet.play(0.1, 1900);
    kuraASyncSet2.play(0.2, 1900);

    w += osc1.sinewave(maxiMap::linexp(kuraASyncSet.getPhase(0), 0, TWOPI, 200,500));
    w += osc2.sinewave(maxiMap::linexp(kuraASyncSet2.getPhase(0), 0, TWOPI, 200,500));
    tm++;
    return w;
}

maxiBits t;

double bitsTest() {
//    auto mask = maxiBits::l(10);
    //    maxiBits q = t.at(15);
//    maxiBits q = t.r(10,9);
//    maxiBits mask(0b111111);
//    maxiBits b = t.at(2).lor(t.at(6)).shl(28);
//    maxiBits q = t.r(18,8).sub(t.r(12,3));
//    maxiBits b = t.sub(t.r(10,2).neg()).mul((t.shr(20).lor(t.shr(13))).lxor(q).land(t.shr(6)));

//    maxiBits seq = 0b10100110;
//    maxiBits mask = t.mul(3).at(14);
//    maxiBits seqidx = t.mul(10).shr(14).land(0b111);
//    maxiBits lfo = t.shr(8).mul(7).land(0b111111111);
//    maxiBits b = t.land(0b1111111).shl(19);
//    maxiBits c = t.mul(lfo.add(129)).land(0b1111111111111111).shl(12);
//
    //    auto b = t & mask;
//    t = t.inc();
//    b = b << 22;
//    cout << b.t << ",";
//    return b.add(c).mul(seq.at(seqidx)).lxor(0b00000000111111111111111111110000)≥.toSignal();
    return 0;
}



maxiTrigger zx;
maxiCounter ct;
maxiIndex idx;
double trigSeqTest() {
    double w = 0;
    int t=0;
    double pulse = osc2.saw(10);
    double seqidx = maxiMap::linlin(osc3.sinewave(1), -1, 1, 0,1);
    double trig = zx.onZX(pulse);
    double count = ct.count(trig,osc4.saw(0.3));
    double seq = idx.pull(trig, seqidx, {0,1,2,3,4,5,6,7,8,9});
    if (trig) {
        cout << count << endl;
    }
    w = trig;
    return w;
}

void play(double *output) {
    double w = 0;
//    double ramp = osc4.phasor(0.1) * 20.0;
//    double freq = maxiMap::linexp(osc2.sinewave(ramp + 0.1),-1,1,50,200);
//    double w = osc1.sawn(freq) + osc3.sawn(freq*1.03);
//    w = filt1.lores(w, maxiMap::linexp(osc5.phasor(0.4),0,1,40,4000), 0.9);
////    w = biquad.play(w);
//    w = dist.atanDist(w,10);
//    w = w + samp.playOnZX(osc1.square(5));
//    w = w + samp.playOnZX(osc1.impulse(5));
//    w=0;
//    w = bitsTest();
   w = kuraASyncTest();
    // w = trigSeqTest();

//    w = w + ts.play(1, 1, 0.05, 2);
//    if (fft.process(w)) {
//    };
//    w = ifft.process(fft.getMagnitudes(), fft.getPhases());
//    w = w + samp.play();
//    vector<double> ch1 = {osc1.sinewave(100), osc2.sinewave(101)};
//    vector<double> ch2 = {osc3.saw(200), osc4.saw(201)};
//    double freq = line.play(osc2.sinewave(0.4));
//    w = osc1.saw(100 + (freq * 1000));
    output[0]= output[1] = w;
//    vector<double> mix = maxiXFade::xfade(ch1, ch2, line.play(1));
//    output[0] = mix[0];
//    output[1] = mix[1];
}
