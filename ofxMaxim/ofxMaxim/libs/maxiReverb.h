
#ifndef __maxiReverb__
#define __maxiReverb__

#include "maximilian.h"

class maxiReverbFilters{
public:
    maxiReverbFilters();
    double twopoint(double input);
    double comb1(double input,double size);
    double comb2(double input,double size);
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

class maxiReverb{
public:
    maxiReverb();
    
    double serialallpass(double input,int firstfilter,int numfilters);
    double serialallpass(double input,int firstfilter,int numfilters,double fb);
    double parallelcomb(double input,int firstfilter, int numfilters);
    double apcombcombo(double input,double gain_coef);
    double satrev(double input);
    double* satrevstereo(double input);
    double parallellpcomb(double input,int firstfilter,int numfilters);
    double freeverb(double input);
    double freeverb(double input,double roomsize,double absorbtion);
    double* freeverbstereo(double input,double roomsize,double absorbtion);
    double* dattaro(double input);
    
    
    double fdn4(double input,double size);
    static const int matrixsize16 = 16;
    double hadamardmatrix16[matrixsize16];
    double fdn8(double input,double size);
    static const int matrixsize64 = 64;
    double hadamardmatrix64[matrixsize64];
    
    // 1 / sqrt(2)
    const double fdn4matrixmulti = 0.707107;
    // 1 / pow(2,3.0/2.0)
    const double fdn8matrixmulti = 0.629961;
    
    double fdngain;
    double doutputs[8];
    double fbsignal[8];
    int fdnlengths[8];
    
    
    void setcombtimesms(double times[],int numset);
    void setaptimesms(double times[],int numset);
    void reverbselector(int type);
    
    enum RevType{
        SATREV,
        FREEVERB,
        FREEVERBSTEREO,
        DATTARO,
        FDN
    };
    
private:
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
    
    // for dattorro
    maxiReverbFilters maxiDelays[9];
    static const int numdattarotappos = 14;
    static const int numdattarotaps = 14;
    
    int dattarotapspos[numdattarotappos];
    double dattorotap[numdattarotaps];
    int maxideltimes[4];
    double dattorogains[5];
    
    int dattarofixdellengths[5];
    
    
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
    
    //dattorro
    double sigl,sigr;
    
    
};


#endif /* defined(__maximilianZone__maxiReverb__) */
