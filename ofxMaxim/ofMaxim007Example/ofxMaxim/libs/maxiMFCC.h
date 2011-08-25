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
#pragma pack(16)

#include "maxiFFT.h"

class maxiMFCC {
public:
	maxiMFCC(){};
	~maxiMFCC();
	void setup(unsigned int numBins, unsigned int numFilters, unsigned int numCoeffs, double minFreq, double maxFreq, unsigned int sampleRate);
	void mfcc(float* powerSpectrum, double *mfccs);
	double *melBands;

private:
	unsigned int numFilters, numCoeffs;
	double minFreq, maxFreq;
	unsigned int sampleRate;
//	double **melFilters;
	double *melFilters;
	unsigned int numBins;
//	double **dctMatrix;
	double *dctMatrix;
#ifdef __APPLE_CC__
	double *doubleSpec;
#endif
	
	void melFilterAndLogSquare(float* powerSpectrum);
	void dct(double *mfccs);
	void calcMelFilterBank(double sampleRate, int numBins);
	void createDCTCoeffs();

	
	
};