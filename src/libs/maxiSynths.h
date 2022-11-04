//
//  maxiSynths.h
//  granular
//
//  Created by Michael Grierson on 16/08/2015.
//

#ifndef __granular__maxiSynths__
#define __granular__maxiSynths__

#include <stdio.h>
#include <iostream>
#include <fstream>
#include <string.h>
#include <cstdlib>
#include "math.h"
#include "../maximilian.h"


class maxiKick {
public:
    maxiKick();
    double play();
    void trigger();
    // void setPitch(double pitch);
    void setRelease(double releaseD);

    void setPitch(double v) {pitch = v;}
    double getPitch() const {return pitch;}
    void setDistortion(double v) {distortion = v;}
    double getDistortion() const {return distortion;}
    void setCutoff(double v) {cutoff = v;}
    double getCutoff()  const{return cutoff;}
    void setResonance(double v) {resonance = v;}
    double getResonance() const {return resonance;}

    void setUseDistortion(bool v) {useDistortion = v;}
    double getUseDistortion()  const {return useDistortion;}
    void setUseLimiter(bool v) {useLimiter = v;}
    double getUseLimiter()  const {return useLimiter;}
    void setUseFilter(bool v) {useFilter = v;}
    double getUseFilter()  const {return useFilter;}


  private:
    double pitch;
    double output = 0 ;
    double outputD =0 ;
    double envOut;
    bool useDistortion = false;
    bool useLimiter = false;
    bool useFilter = false;
    double distortion = 0;
    bool inverse = false;
    double cutoff;
    double resonance;
    double gain = 1;
    maxiOsc kick;
    maxiEnv envelope;
    maxiDistortion distort;
    maxiFilter filter;
};

class maxiSnare {
public:
    maxiSnare();
    double play();
    void setPitch(double pitch);
    void setRelease(double releaseD);
    void trigger();
    double pitch;
    double output = 0 ;
    double outputD = 0 ;
    double envOut;
    bool useDistortion = false;
    bool useLimiter = false;
    bool useFilter = true;
    double distortion = 0;
    bool inverse = false;
    double cutoff;
    double resonance;
    double gain = 1;
    maxiOsc tone;
    maxiOsc noise;
    maxiEnv envelope;
    maxiDistortion distort;
    maxiFilter filter;



};

class maxiHats {

public:
    maxiHats();
    double play();
    void setPitch(double pitch);
    void setRelease(double releaseD);
    void trigger();
    double pitch;
    double output = 0;
    double outputD = 0;
    double envOut;
    bool useDistortion = false;
    bool useLimiter = false;
    bool useFilter = false;
    double distortion = 0;
    bool inverse = false;
    double cutoff;
    double resonance;
    double gain = 1;
    maxiOsc tone;
    maxiOsc noise;
    maxiEnv envelope;
    maxiDistortion distort;
    maxiSVF filter;


};


class maxiSynth {



};


class granularSynth {



};


class maxiSampler {

public:
    maxiSampler();
    double play();
    void setPitch(double pitch, bool setall=false);
    void midiNoteOn(double pitch, double velocity, bool setall=false);
    void midiNoteOff(double pitch, double velocity, bool setall=false);
    void setAttack(double attackD,bool setall=true);
    void setDecay(double decayD,bool setall=true);
    void setSustain(double sustainD,bool setall=true);
    void setRelease(double releaseD,bool setall=true);
    void setPosition(double positionD,bool setall=true);
    void load(string inFile,bool setall=true);
    void setNumVoices(int numVoices);
    double position;
    void trigger();
    double pitch[32];
    int originalPitch=67;
    double outputs[32];
    double outputD = 0;
    double envOut[32];
    double envOutGain[32];
    double output;
    bool useDistortion = false;
    bool useLimiter = false;
    bool useFilter = false;
    double distortion = 0;
    bool inverse = false;
    double cutoff;
    double resonance;
    double gain = 1;
    int voices;
    int currentVoice=0;
    convert mtof;
    maxiOsc LFO1;
    maxiOsc LFO2;
    maxiOsc LFO3;
    maxiOsc LFO4;
    maxiSample samples[32];
    maxiEnv envelopes[32];
    maxiDistortion distort;
    maxiSVF filters[32];
    bool sustain = true;


};



#endif
