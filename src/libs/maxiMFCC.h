/*
 *  maxiMFCC.h
 *  mfccs
 *
 *  Created by Chris on 08/03/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *

 Based on Matthew Yee-King's MFCCMYK java class
 */

#pragma once
//#pragma pack(16)

//#include "../maxi_emscr_new.h"
//#include "maxiFFT.h"
#include <math.h>
#include <iostream>
#include <cstdlib>
#include <vector>
#ifdef __APPLE_CC__
#include <Accelerate/Accelerate.h>
#endif
#include "../maximilian.h"
using namespace std;


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

template <class T>
class maxiMFCCAnalyser {
public:
	T *melBands;
	maxiMFCCAnalyser():melFilters(NULL),dctMatrix(NULL), melBands(NULL){};
	~maxiMFCCAnalyser() {
		if (melFilters) {
			delete[] melFilters;
			delete[] melBands;
			delete[] dctMatrix;
#ifdef __APPLE_CC__
			delete doubleSpec;
#endif
		}
	}

	void setup(unsigned int numBins, unsigned int numFilters, unsigned int numCoeffs, double minFreq, double maxFreq)
	{
		this->numFilters = numFilters;
		this->numCoeffs = numCoeffs;
		this->minFreq = minFreq;
		this->maxFreq = maxFreq;
		this->sampleRate = maxiSettings::sampleRate;
		this->numBins = numBins;
		melFilters = NULL;
		melBands = (T*) malloc(sizeof(T) * numFilters);
    coeffs.resize(numCoeffs,0);
#ifdef __APPLE_CC__
		doubleSpec = (T*)malloc(sizeof(T) * numBins);
#endif
		//create new matrix
		dctMatrix = (T*)malloc(sizeof(T) * numCoeffs * numFilters);

		calcMelFilterBank(sampleRate, numBins);
		createDCTCoeffs();
	}

	vector<T>& mfcc(vector<float>& powerSpectrum) {
		melFilterAndLogSquare(powerSpectrum.data());
		dct(coeffs.data());
    return coeffs;
	}

private:
	unsigned int numFilters, numCoeffs;
	double minFreq, maxFreq;
	unsigned int sampleRate;
	T *melFilters;
	unsigned int numBins;
	T *dctMatrix;
  vector<T> coeffs;
#ifdef __APPLE_CC__
	T *doubleSpec;
#endif

#ifdef __APPLE_CC__
	void dct(T *mfccs); //define later
#else
	void dct(T *mfccs) {
		for(int i=0; i < numCoeffs; i++) {
			mfccs[i] = 0.0;
		}
		for(int i=0; i < numCoeffs; i++ ) {
			for(int j=0; j < numFilters; j++) {
				int idx = i + (j * numCoeffs);
				mfccs[i] += (dctMatrix[idx] * melBands[j]);
			}
		}
		for(int i=0; i < numCoeffs; i++) {
			mfccs[i] /= numCoeffs;
		}
	}
#endif

	void melFilterAndLogSquare(float* powerSpectrum);
	void melFilterAndLogSq_Part2(float *powerSpectrum);


	void calcMelFilterBank(double sampleRate, int numBins) {

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

		T *filtPos = (T*) malloc(sizeof(double) * (numFilters + 2));

		// first generate an array of start and end freqs for each triangle
		mel = minMel;
		for (int i=0;i<numFilters + 2;i++) {
			// start of the triangle
			filtPos[i] = melToHz(mel);
			//		std::cout << "[" << i << "] MFCC: centre is at " <<filtPos[i]<<"hz "<<mel<<" mels" << endl;
			mel += dMel;
		}
		// now generate the coefficients for the mag spectrum
		melFilters = (T*) malloc(sizeof(T) * numFilters * numValidBins);

		for (int filter = 1; filter < numFilters; filter++) {
			for (int bin=0;bin<numValidBins;bin++) {
				// frequency this bin represents
				binFreq = (T) sampleRate / (T) numValidBins * (T) bin;
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
					T height = 2.0 / (nextF - prevF);

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
	void createDCTCoeffs() {
		T k = 3.14159265358979323846/numFilters;
		T w1 = 1.0/(sqrt(numFilters));
		T w2 = sqrt(2.0/numFilters);


		//generate dct matrix
		for(int i = 0; i < numCoeffs; i++)
		{
			for(int j = 0; j < numFilters; j++)
			{
				int idx = i + (j * numCoeffs);
				if(i == 0)
					dctMatrix[idx]= w1 * cos(k * (i+1) * (j + 0.5));
				else
					dctMatrix[idx] = w2 * cos(k * (i+1) * (j + 0.5));
			}
		}


	}



};



typedef maxiMFCCAnalyser<double> maxiMFCC;
//typedef maxiMFCCAnalyser<float> maxiFloatMFCC;
