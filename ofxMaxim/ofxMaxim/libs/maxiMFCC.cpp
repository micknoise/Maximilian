/*
 *  maxiMFCC.cpp
 *  mfccs
 *
 *  Created by Chris on 08/03/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "maxiMFCC.h"
#include <math.h>
#include <iostream>
#ifdef __APPLE_CC__
#include <Accelerate/Accelerate.h>
#endif

using namespace std;

void maxiMFCC::setup(unsigned int numBins, unsigned int numFilters, unsigned int numCoeffs, double minFreq, double maxFreq, unsigned int sampleRate) 
{
	this->numFilters = numFilters;
	this->numCoeffs = numCoeffs;
	this->minFreq = minFreq;
	this->maxFreq = maxFreq;
	this->sampleRate = sampleRate;
	this->numBins = numBins;
	melFilters = NULL;
	melBands = (double*) malloc(sizeof(double) * numFilters);
#ifdef __APPLE_CC__
    doubleSpec = (double*)malloc(sizeof(double) * numBins);
#endif
    //create new matrix
    dctMatrix = (double*)malloc(sizeof(double) * numCoeffs * numFilters);
	calcMelFilterBank(sampleRate, numBins);
	createDCTCoeffs();
}

void maxiMFCC::mfcc(float* powerSpectrum, double *mfccs) {
	melFilterAndLogSquare(powerSpectrum);
	dct(mfccs);
}


void maxiMFCC::melFilterAndLogSquare(float* powerSpectrum){
#ifdef __APPLE_CC__
	//conv to double
	vDSP_vspdp(powerSpectrum, 1, doubleSpec, 1, numBins);
	vDSP_mmulD(doubleSpec, 1, melFilters, 1, melBands, 1, 1, 42, 512);
#else
	for (int filter = 0;filter < numFilters;filter++) {
		melBands[filter] = 0.0;
		for (int bin=0;bin<numBins;bin++) {
//			int idx = (numBins * filter) + bin;
			int idx = filter + (bin * numFilters);
//			melBands[filter] += (melFilters[filter][bin] * powerSpectrum[bin]);
			melBands[filter] += (melFilters[idx] * powerSpectrum[bin]);
		}
	}
#endif
	for(int filter=0; filter < numFilters; filter++) {
		// log the square
		melBands[filter] = melBands[filter] > 0.000001 ? log(melBands[filter] * melBands[filter]) : 0.0;
	}
}

void maxiMFCC::dct(double *mfccs){
#ifdef __APPLE_CC__
	vDSP_mmulD(melBands, 1, dctMatrix, 1, mfccs, 1, 1, numCoeffs, numFilters);
	double n = (double) numCoeffs;
	vDSP_vsdivD(mfccs, 1, &n, mfccs, 1, numCoeffs);
#else
	for(int i=0; i < numCoeffs; i++) {
		mfccs[i] = 0.0;
	}
	for(int i=0; i < numCoeffs; i++ ) {
		for(int j=0; j < numFilters; j++) {
			int idx = i + (j * numCoeffs);
//			mfccs[i] += (dctMatrix[i][j] * melBands[j]);
			mfccs[i] += (dctMatrix[idx] * melBands[j]);
		}
	}
	for(int i=0; i < numCoeffs; i++) {
		mfccs[i] /= numCoeffs;
	}
#endif
}

void maxiMFCC::createDCTCoeffs() {
    double k = 3.14159265358979323846/numFilters;
    double w1 = 1.0/(sqrt(numFilters));
    double w2 = sqrt(2.0/numFilters);
	
	
    //generate dct matrix
    for(int i = 0; i < numCoeffs; i++)
    {
		for(int j = 0; j < numFilters; j++)
		{
			int idx = i + (j * numCoeffs);
			//			if(i == 0)
			//				dctMatrix[i][j]= w1 * cos(k * (i+1) * (j + 0.5));
			//			else
			//				dctMatrix[i][j] = w2 * cos(k * (i+1) * (j + 0.5));
			if(i == 0)
				dctMatrix[idx]= w1 * cos(k * (i+1) * (j + 0.5));
			else
				dctMatrix[idx] = w2 * cos(k * (i+1) * (j + 0.5));
		}
    }
	
	
}



// implements this formula:
// mel = 2595 log10(Hz/700 + 1)
inline double hzToMel(double hz){
	return 2595.0 * (log10(hz/700.0 + 1.0));
}

// implements this formula
// Hz = 700 (10^(mel/2595) - 1)
inline double melToHz(double mel){
	return 700.0 * (pow(10, mel/2595.0) - 1.0);
}


void maxiMFCC::calcMelFilterBank(double sampleRate, int numBins){
    double mel, dMel, maxMel, minMel, nyquist, binFreq, start, end, thisF, nextF, prevF;
    int numValidBins;
    
    // ignore bins over nyquist
    numValidBins = numBins;
	
    nyquist = sampleRate/2;
    if (maxFreq > nyquist) {
		maxFreq = nyquist;
    }
	
    maxMel = hzToMel(maxFreq);
    minMel = hzToMel(minFreq);
	
    dMel = (maxMel - minMel) / (numFilters + 2 - 1);
    
    double *filtPos = (double*) malloc(sizeof(double) * (numFilters + 2));
	
    // first generate an array of start and end freqs for each triangle
    mel = minMel;
    for (int i=0;i<numFilters + 2;i++) {
		// start of the triangle
		filtPos[i] = melToHz(mel);
//		std::cout << "[" << i << "] MFCC: centre is at " <<filtPos[i]<<"hz "<<mel<<" mels" << endl;
		mel += dMel;
    }
    // now generate the coefficients for the mag spectrum
	melFilters = (double*) malloc(sizeof(double) * numFilters * numValidBins);
	
    for (int filter = 1; filter < numFilters; filter++) {
		for (int bin=0;bin<numValidBins;bin++) {
			// frequency this bin represents
			binFreq = (double) sampleRate / (double) numValidBins * (double) bin;
			thisF = filtPos[filter];
			nextF = filtPos[filter+1];
			prevF = filtPos[filter-1];
			int idx = filter + (bin * numFilters);
			if (binFreq > nextF || binFreq < prevF) {
				// outside this filter
				melFilters[idx] = 0;
				//cout << "MFCCMYK: filter at " <<thisF << " bin at " <<binFreq <<" coeff " <<melFilters[filter][bin] << endl;
			}
			else {
				double height = 2.0 / (nextF - prevF);

				if (binFreq < thisF) {
					// up
					start = prevF;
					end = thisF;
					melFilters[idx] = (binFreq - start) * (height / (thisF - start));	  
				}
				else {
					// down
					start = thisF;
					end = nextF;
					melFilters[idx] = height + ((binFreq - thisF) * (-height /(nextF - thisF)));	  
				}
//				cout << "MFCCMYK: filter at " <<thisF << " bin at " <<binFreq <<" coeff " <<melFilters[filter][bin] << endl;
				//cout << "MFCCMYK: filter at " <<thisF << " bin at " <<binFreq <<" coeff " <<melFilters[idx] << endl;
			}
		}
    }
}


maxiMFCC::~maxiMFCC() {
	if (melFilters) {
		delete[] melFilters;
		delete[] melBands;
		delete[] dctMatrix;
#ifdef __APPLE_CC__
		delete doubleSpec;
#endif
	}
}


