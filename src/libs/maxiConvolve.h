//
//  maxiConvolve.h
//  Convolver
//
//  Created by Chris Kiefer on 03/03/2017.
//
//  Partitioned Convolution

#ifndef maxiConvolve_h
#define maxiConvolve_h

#include "../maximilian.h"
#include "maxiFFT.h"
#include <iostream>
#include <deque>

typedef vector< vector<float> > floatVV;

class maxiConvolve {
public:
    void setup(std::string impulseFile, int fftsize = 1024, int hopsize = 256);
    float play(float w);
private:
    maxiFFT inFFT;
    maxiIFFT ifft;
    std::deque< vector<float> > FDLReal; //frequency delay line
    std::deque< vector<float> > FDLImag; //frequency delay line
    floatVV impulseReal;
    floatVV impulseImag;
    vector<float> sumReal;
    vector<float> sumImag;
};

#endif /* maxiConvolve_h */
