//
//  maxiConvolve.cpp
//  Convolver
//
//  Created by Chris Kiefer on 03/03/2017.
//
//

#include "maxiConvolve.h"
using namespace std;

void maxiConvolve::setup(std::string impulseFile, int fftsize, int hopsize) {
    auto  analyseImpulse = [fftsize, hopsize](maxiSample &impulse, floatVV &impulseReal, floatVV &impulseImag) {
        
        float maxReal=0;
        float maxImag=0;
        
        auto pushFFTFrame = [&impulseReal, &impulseImag](maxiFFT &fft, float &maxReal, float &maxImag) {
            vector<float> realVector;
            realVector.assign(fft.getReal(), fft.getReal() + fft.bins);
            impulseReal.push_back(realVector);
            for(int i=0; i < realVector.size(); i++) {
                if (realVector[i] > maxReal) maxReal = realVector[i];
            }
            vector<float> imagVector;
            imagVector.assign(fft.getImag(), fft.getImag() + fft.bins);
            impulseImag.push_back(imagVector);
            for(int i=0; i < imagVector.size(); i++) {
                if (imagVector[i] > maxImag) maxImag = imagVector[i];
            }
        };
        
        maxiFFT fft;
        fft.setup(fftsize,fftsize,hopsize);
        for(int i=0; i < impulse.length; i++) {
            if (fft.process(impulse.play(), maxiFFT::NO_POLAR_CONVERSION)) {
                pushFFTFrame(fft, maxReal, maxImag);
            };
        }
        for(int i=0; i < fft.bins - (impulse.length % fft.bins); i++) {
            if (fft.process(0, maxiFFT::NO_POLAR_CONVERSION)) {
                pushFFTFrame(fft, maxReal, maxImag);
            };
        }
        
        for (int i=0; i < impulseReal.size(); i++) {
            for(int j=0; j < impulseReal[i].size(); j++) {
                impulseReal[i][j] /= maxReal;
                impulseImag[i][j] /= maxImag;
            }
        }
    };

    
    maxiSample impulseSample;
    impulseSample.load(impulseFile);
    analyseImpulse(impulseSample, impulseReal, impulseImag);
    cout << "Impulse loaded, " << impulseReal.size() << " frames\n";
    
    inFFT.setup(fftsize,fftsize,hopsize);
    ifft.setup(fftsize,fftsize,hopsize);
    
    for(int i=0; i < impulseReal.size(); i++) {
        vector<float> blank;
        blank.resize(inFFT.bins, 0);
        FDLReal.push_front(blank);
        FDLImag.push_front(blank);
    }
    
    sumReal.resize(inFFT.bins, 0);
    sumImag.resize(inFFT.bins, 0);
    
}

float maxiConvolve::play(float w) {
    if (inFFT.process(w, maxiFFT::NO_POLAR_CONVERSION)) {
        vector<float> realFrame;
        realFrame.assign(inFFT.getReal(), inFFT.getReal() + inFFT.bins);
        
        FDLReal.push_front(realFrame);
        FDLReal.pop_back();

        vector<float> imagFrame;
        imagFrame.assign(inFFT.getImag(), inFFT.getImag() + inFFT.bins);
        FDLImag.push_front(imagFrame);
        FDLImag.pop_back();
        
        std::fill(sumReal.begin(), sumReal.end(), 0);
        std::fill(sumImag.begin(), sumImag.end(), 0);
        
        auto impRealIt = impulseReal.begin();
        auto impImagIt = impulseImag.begin();
        auto fdlRealIt = FDLReal.begin();
        for(auto fdlImagIt = FDLImag.begin(); fdlImagIt != FDLImag.end(); ++fdlRealIt, ++fdlImagIt, ++impRealIt, ++impImagIt) {
            sumReal[0] += ((*impRealIt)[0] * (*fdlRealIt)[0]);
            sumImag[0] += ((*impImagIt)[0] * (*fdlImagIt)[0]);
            for(int i=1; i < sumReal.size(); i++) {
                sumReal[i] += ((*impRealIt)[i] * (*fdlRealIt)[i]) - ((*impImagIt)[i] * (*fdlImagIt)[i]);
                sumImag[i] += ((*impRealIt)[i] * (*fdlImagIt)[i]) + ((*impImagIt)[i] * (*fdlRealIt)[i]);
            }
        }
//        float scale = sqrt((float)FDLReal.size());
//        for(int i=0; i < sumReal.size(); i++) {
//            sumReal[i] /= scale;
//            sumImag[i] /= scale;
//        }
    }
    return ifft.process(&sumReal[0], &sumImag[0], maxiIFFT::COMPLEX);
}
