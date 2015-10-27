/*
 *  maxiMFCC.cpp
 *  mfccs
 *
 *  Created by Chris on 08/03/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "maxiMFCC.h"


#ifdef __APPLE_CC__
template <>
void maxiMFCCAnalyser<double>::dct(double *mfccs) {
	vDSP_mmulD(melBands, 1, dctMatrix, 1, mfccs, 1, 1, numCoeffs, numFilters);
	double n = (double) numCoeffs;
	vDSP_vsdivD(mfccs, 1, &n, mfccs, 1, numCoeffs);
}

template <>
void maxiMFCCAnalyser<float>::dct(float *mfccs) {
	vDSP_mmul(melBands, 1, dctMatrix, 1, mfccs, 1, 1, numCoeffs, numFilters);
	float n = (float) numCoeffs;
	vDSP_vsdiv(mfccs, 1, &n, mfccs, 1, numCoeffs);
}
#endif

template <>
void maxiMFCCAnalyser<double>::melFilterAndLogSquare(float* powerSpectrum) {
#ifdef __APPLE_CC__
	//conv to double
	vDSP_vspdp(powerSpectrum, 1, doubleSpec, 1, numBins);
	//	vDSP_mmulD(doubleSpec, 1, melFilters, 1, melBands, 1, 1, 42, 512);
	vDSP_mmulD(doubleSpec, 1, melFilters, 1, melBands, 1, 1, numFilters, numBins);
#endif
	melFilterAndLogSq_Part2(powerSpectrum);
}


template <>
void maxiMFCCAnalyser<float>::melFilterAndLogSquare(float* powerSpectrum) {
#ifdef __APPLE_CC__
	vDSP_mmul(powerSpectrum, 1, melFilters, 1, melBands, 1, 1, numFilters, numBins);
#endif
	melFilterAndLogSq_Part2(powerSpectrum);
}

template <class T>
void maxiMFCCAnalyser<T>::melFilterAndLogSq_Part2(float *powerSpectrum) {
#ifdef __APPLE_CC__
#else
	for (unsigned int filter = 0;filter < numFilters;filter++) {
		melBands[filter] = 0.0;
		for (unsigned int bin=0;bin<numBins;bin++) {
			//			int idx = (numBins * filter) + bin;
			int idx = filter + (bin * numFilters);
			//			melBands[filter] += (melFilters[filter][bin] * powerSpectrum[bin]);
			melBands[filter] += (melFilters[idx] * powerSpectrum[bin]);
		}
	}
#endif
	for(unsigned int filter=0; filter < numFilters; filter++) {
		// log the square
		melBands[filter] = melBands[filter] > 0.000001 ? log(melBands[filter] * melBands[filter]) : 0.0;
	}
}












