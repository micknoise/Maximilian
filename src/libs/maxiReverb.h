/*
 Coded by Tom Rushmore,
 http:///github.com/tomrushmore
 */
/*
 *  platform independent synthesis library using portaudio or rtaudio
 *
 *  Created by Mick Grierson on 29/12/2009.
 *  Copyright 2009 Mick Grierson & Strangeloop Limited. All rights reserved.
 *	Thanks to the Goldsmiths Creative Computing Team.
 *	Special thanks to Arturo Castro for the PortAudio implementation.
 *
 *	Permission is hereby granted, free of charge, to any person
 *	obtaining a copy of this software and associated documentation
 *	files (the "Software"), to deal in the Software without
 *	restriction, including without limitation the rights to use,
 *	copy, modify, merge, publish, distribute, sublicense, and/or sell
 *	copies of the Software, and to permit persons to whom the
 *	Software is furnished to do so, subject to the following
 *	conditions:
 *
 *	The above copyright notice and this permission notice shall be
 *	included in all copies or substantial portions of the Software.
 *
 *	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 *	EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 *	OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *	NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 *	HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 *	WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 *	FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 *	OTHER DEALINGS IN THE SOFTWARE.
 *
 */

#ifndef __maxiReverb__
#define __maxiReverb__

#include "../maximilian.h"
#include <valarray>

class maxiReverbFilters{
public:
    maxiReverbFilters();
    double twopoint(double input);
    double comb1(double input,double size);
    double combff(double input,double size);
    double combfb(double input,double size,double fb);
    double lpcombfb(double input,double size,double fb, double cutoff);

    double allpass(double input,double size);
    double allpass(double input,double size,double fback);
    double allpasstap(double input,double size,int tap);
    void setlength(int length);
    double onetap(double input,double size);
    double tapd(double input,double size, double * taps,int numtaps);
    double tapdwgain(double input,double size, double * taps,int numtaps,double * gain);
    double tapdpos(double input,int size, int * taps,int numtaps);
    double gettap(int tap);

private:
    std::valarray<double> delay_line;
    double a;
    int delay_index;
    int delay_size;
    double output;
    double feedback;
    double gain_cof;

    maxiFilter mf;


};

class maxiReverbBase{
public:
    maxiReverbBase();

protected:
    double parallellpcomb(double input,int firstfilter,int numfilters);
    void setcombtimesms(double times[],int numset);
    void setaptimesms(double times[],int numset);
    double serialallpass(double input,int firstfilter,int numfilters);
    double serialallpass(double input,int firstfilter,int numfilters,double fb);
    double parallelcomb(double input,int firstfilter, int numfilters);
    double apcombcombo(double input,double gain_coef);

    double fbsignal[8];
    void setweights(double weights[],int numset,double *filter);
    int mstodellength(double ms);
    void setcombtimes(int times[],int numset);
    void setaptimes(int times[],int numset);
    void setcombweights(double weights[],int numset);
    void setcombweightsall(double feedback);
    void setapweights(double weights[],int numset);
    void setlpcombcutoff(double *cutoff, int numset);
    void setlpcombcutoffall(double cutoff);
    void setcombfeedback(double *feedback,int numset);
    void limitnumfilters(int * num);

    static int const numfilters = 32;
    maxiReverbFilters fArrayAllP[numfilters];
    maxiReverbFilters fArrayTwo[numfilters];
    maxiFilter fArrayLP[numfilters];


    double fbcomb[numfilters];
    double fbap[numfilters];
    double combgainweight[numfilters];
    double apgainweight[numfilters];
    double lpcombcutoff[numfilters];
    double feedbackcombfb[numfilters];
    double output;
    double stereooutput[2];
    double accumulator;
    float numsamplesms;

    maxiReverbFilters earlyref;
    double taps[numfilters];
    double tapsgain[numfilters];
    int numtaps;
    int tapdellength;
};

class maxiSatReverb : private maxiReverbBase {
public:
    maxiSatReverb();
    double play(double input);
    double* playStereo(double input);

};

class maxiFreeVerb : private maxiReverbBase {
public:
    maxiFreeVerb();
    double play(double input);
    double play(double input,double roomsize,double absorbtion);
};

class maxiFreeVerbStereo : private maxiReverbBase {
public:
    maxiFreeVerbStereo();
    double* playStereo(double input,double roomsize,double absorbtion);
};

class maxiDattaroReverb : private maxiReverbBase {
public:
    maxiDattaroReverb();
    double* playStereo(double input);
private:
    maxiReverbFilters maxiDelays[9];
    static const int numdattarotappos = 14;
    static const int numdattarotaps = 14;

    int dattarotapspos[numdattarotappos];
    double dattorotap[numdattarotaps];
    int maxideltimes[4];
    double dattorogains[5];
    int dattarofixdellengths[5];
    double sigl,sigr;

};


#endif /* defined(__maximilianZone__maxiReverb__) */
