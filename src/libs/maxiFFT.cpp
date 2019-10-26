/*
 *  maximilian
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

#include "maxiFFT.h"
#include "../maximilian.h"
#include <iostream>
#include "math.h"

using namespace std;


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//F F T
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void maxiFFT::setup(int _fftSize, int _hopSize, int _windowSize) {
	_fft.setup(_fftSize);
	fftSize = _fftSize;
    windowSize = _windowSize ? _windowSize : fftSize;
	bins = fftSize / 2;
	hopSize = _hopSize;
    buffer.resize(fftSize,0);
    magnitudes.resize(bins,0);
    magnitudesDB.resize(bins,0);
    phases.resize(bins,0);
    pos =windowSize - hopSize;
	newFFT = 0;
    window.resize(fftSize,0);
	fft::genWindow(3, windowSize, &window[0]);
    recalc = true;
}




bool maxiFFT::process(float value, fftModes mode) {
	//add value to buffer at current pos
	buffer[pos++] = value;
	//if buffer full, run fft
	newFFT = pos == windowSize;
	if (newFFT) {
#if defined(__APPLE_CC__) && !defined(_NO_VDSP)
        if (mode == maxiFFT::WITH_POLAR_CONVERSION) {
            _fft.powerSpectrum_vdsp(0, &buffer[0], &window[0], &magnitudes[0], &phases[0]);
        }else{
            _fft.calcFFT_vdsp(&buffer[0], &window[0]);
        }
#else
        if (mode == maxiFFT::WITH_POLAR_CONVERSION) {
            _fft.powerSpectrum(0, &buffer[0], &window[0], &magnitudes[0], &phases[0]);
        }else{
            _fft.calcFFT(0, &buffer[0], &window[0]);
        }
#endif
		//shift buffer back by one hop size
		memcpy(&buffer[0], &buffer[0] + hopSize, (windowSize - hopSize) * sizeof(float));
		//reset pos to start of hop
		pos= windowSize - hopSize;
        recalc = true;
	}
	return newFFT;
}

bool maxiFFT::process(float value, int mode){

  if(mode==0) 
    return maxiFFT::process(value, maxiFFT::fftModes::NO_POLAR_CONVERSION);
  else 
    return maxiFFT::process(value, maxiFFT::fftModes::WITH_POLAR_CONVERSION); 
}

vector<float> & maxiFFT::magsToDB() {
    if(recalc) {
#if defined(__APPLE_CC__) && !defined(_NO_VDSP)
        _fft.convToDB_vdsp(&magnitudes[0], &magnitudesDB[0]);
#else
        _fft.convToDB(&magnitudes[0], &magnitudesDB[0]);
#endif
        recalc = false;
    }
	return magnitudesDB;
}

float maxiFFT::spectralFlatness() {
	float geometricMean=0, arithmaticMean=0;
	for(int i=0; i < bins; i++) {
		if (magnitudes[i] != 0)
			geometricMean += logf(magnitudes[i]);
		arithmaticMean += magnitudes[i];
	}
	geometricMean = expf(geometricMean / (float)bins);
	arithmaticMean /= (float)bins;
	return arithmaticMean !=0 ?  geometricMean / arithmaticMean : 0;
}

float maxiFFT::spectralCentroid() {
	float x=0, y=0;
	for(int i=0; i < bins; i++) {
		x += fabs(magnitudes[i]) * i;
		y += fabs(magnitudes[i]);
	}
	return y != 0 ? x / y * ((float) maxiSettings::sampleRate / fftSize) : 0;
}




//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//I N V E R S E  F F T
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

void maxiIFFT::setup(int _fftSize, int _hopSize, int _windowSize) {
	_fft.setup(_fftSize);
	fftSize = _fftSize;
    windowSize = _windowSize ? _windowSize : fftSize;
	bins = fftSize / 2;
	hopSize = _hopSize;
    buffer.resize(fftSize,0);
    ifftOut.resize(fftSize,0);
	pos =0;
    window.resize(fftSize,0);
	fft::genWindow(3, windowSize, &window[0]);
}

float maxiIFFT::process(vector<float> &mags, vector<float> &phases, fftModes mode) {
	if (0==pos) {
		//do ifft
//        memset(ifftOut, 0, fftSize * sizeof(float));
        std::fill(ifftOut.begin(), ifftOut.end(), 0);
#if defined(__APPLE_CC__) && !defined(_NO_VDSP)
        if (mode == maxiIFFT::SPECTRUM) {
            _fft.inversePowerSpectrum_vdsp(0, &ifftOut[0], &window[0], mags.data(), phases.data());
        }else{
            _fft.inverseFFTComplex_vdsp(0, &ifftOut[0], &window[0], mags.data(), phases.data());
        }
#else
        if (mode == maxiIFFT::SPECTRUM) {
            _fft.inversePowerSpectrum(0, &ifftOut[0], &window[0], mags.data(), phases.data());
        }else{
            _fft.inverseFFTComplex(0, &ifftOut[0], &window[0], mags.data(), phases.data());
        }
#endif
		//add to output
		//shift back by one hop
		memcpy(&buffer[0], &buffer[0]+hopSize, (fftSize - hopSize) * sizeof(float));
		//clear the end chunk
        memset(&buffer[0] + (fftSize - hopSize), 0, hopSize * sizeof(float));
		//merge new output
		for(int i=0; i < fftSize; i++) {
			buffer[i] += ifftOut[i];
		}
	}

	nextValue = buffer[pos];
	//limit the values, this alg seems to spike occasionally (and break the audio drivers)
    if (nextValue > 0.99999f) nextValue = 0.99999f;
    if (nextValue < -0.99999f) nextValue = -0.99999f;
	if (hopSize == ++pos ) {
		pos=0;
	}

	return nextValue;
}








//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//O C T A V E  A N A L Y S E R
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



void maxiFFTOctaveAnalyzer::setup(float samplingRate, int nBandsInTheFFT, int nAveragesPerOctave){

    samplingRate = samplingRate;
    nSpectrum = nBandsInTheFFT;
    spectrumFrequencySpan = (samplingRate / 2.0f) / (float)(nSpectrum);
    nAverages = nBandsInTheFFT;
    // fe:  2f for octave bands, sqrt(2) for half-octave bands, cuberoot(2) for third-octave bands, etc
    if (nAveragesPerOctave==0) // um, wtf?
		nAveragesPerOctave = 1;
//    nAveragesPerOctave = nAveragesPerOctave;
    averageFrequencyIncrement = pow(2.0f, 1.0f/(float)(nAveragesPerOctave));
    // this isn't currently configurable (used once here then no effect), but here's some reasoning:
    // 43 is a good value if you want to approximate "computer" octaves: 44100/2/2/2/2/2/2/2/2/2/2
    // 55 is a good value if you'd rather approximate A-440 octaves: 440/2/2/2
    // 65 is a good value if you'd rather approximate "middle-C" octaves:  ~262/2/2
    // you could easily double it if you felt the lowest band was just rumble noise (as it probably is)
    // but don't go much smaller unless you have a huge fft window size (see below for more why)
    // keep in mind, if you change it, that the number of actual bands may change +/-1, and
    // for some values, the last averaging band may not be very useful (may extend above nyquist)
    firstOctaveFrequency = 55.0f;
    // for each spectrum[] bin, calculate the mapping into the appropriate average[] bin.
    // this gives us roughly log-sized averaging bins, subject to how "fine" the spectrum bins are.
    // with more spectrum bins, you can better map into the averaging bins (especially at low
    // frequencies) or use more averaging bins per octave.  with an fft window size of 2048,
    // sampling rate of 44100, and first octave around 55, that's about enough to do half-octave
    // analysis.  if you don't have enough spectrum bins to map adequately into averaging bins
    // at the requested number per octave then you'll end up with "empty" averaging bins, where
    // there is no spectrum available to map into it.  (so... if you have "nonreactive" averages,
    // either increase fft buffer size, or decrease number of averages per octave, etc)
    spe2avg = new int[nSpectrum];
    int avgidx = 0;
    float averageFreq = firstOctaveFrequency; // the "top" of the first averaging bin
    // we're looking for the "top" of the first spectrum bin, and i'm just sort of
    // guessing that this is where it is (or possibly spectrumFrequencySpan/2?)
    // ... either way it's probably close enough for these purposes
    float spectrumFreq = spectrumFrequencySpan;
    for (int speidx=0; speidx < nSpectrum; speidx++) {
		while (spectrumFreq > averageFreq) {
			avgidx++;
			averageFreq *= averageFrequencyIncrement;
		}
		spe2avg[speidx] = avgidx;
		spectrumFreq += spectrumFrequencySpan;
    }
    nAverages = avgidx;
    averages = new float[nAverages];
    peaks = new float[nAverages];
    peakHoldTimes = new int[nAverages];
    peakHoldTime = 0; // arbitrary
    peakDecayRate = 0.9f; // arbitrary
    linearEQIntercept = 1.0f; // unity -- no eq by default
    linearEQSlope = 0.0f; // unity -- no eq by default
}

void maxiFFTOctaveAnalyzer::calculate(float * fftData){

	int last_avgidx = 0; // tracks when we've crossed into a new averaging bin, so store current average
    float sum = 0.0f; // running total of spectrum data
    int count = 0; // count of spectrums accumulated (for averaging)
    for (int speidx=0; speidx < nSpectrum; speidx++) {
		count++;
		sum += fftData[speidx] * (linearEQIntercept + (float)(speidx) * linearEQSlope);
		int avgidx = spe2avg[speidx];
		if (avgidx != last_avgidx) {

			for (int j = last_avgidx; j < avgidx; j++){
				averages[j] = sum / (float)(count);
			}
			count = 0;
			sum = 0.0f;
		}
		last_avgidx = avgidx;
    }
    // the last average was probably not calculated...
    if ((count > 0) && (last_avgidx < nAverages)){
		averages[last_avgidx] = sum / (float)(count);
	}

    // update the peaks separately
    for (int i=0; i < nAverages; i++) {
		if (averages[i] >= peaks[i]) {
			// save new peak level, also reset the hold timer
			peaks[i] = averages[i];
			peakHoldTimes[i] = peakHoldTime;
		} else {
			// current average does not exceed peak, so hold or decay the peak
			if (peakHoldTimes[i] > 0) {
				peakHoldTimes[i]--;
			} else {
				peaks[i] *= peakDecayRate;
			}
		}
    }
}
