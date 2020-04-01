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

#ifndef _MAXI_FFT
#define _MAXI_FFT

//#define _NO_VDSP  //set this if you don't want to use apple's vDSP fft functions


#include "fft.h"
#include "stddef.h"
#include <vector>

class maxiFFT {

public:

  enum fftModes {NO_POLAR_CONVERSION = 0, WITH_POLAR_CONVERSION = 1};

  maxiFFT() {};
  ~maxiFFT() {};
  void setup(int fftSize=1024, int hopSize=512, int windowSize=0);
//  bool process(float value, int fftMode=1);
  bool process(float value, fftModes mode=maxiFFT::WITH_POLAR_CONVERSION);
  inline float *getReal() {return _fft.getReal();};
  inline float *getImag() {return _fft.getImg();};

  std::vector<float> & getMagnitudes() {return magnitudes;}
  std::vector<float> & getMagnitudesDB() {return magsToDB();}
  std::vector<float> & getPhases() {return phases;}

  int getNumBins() {return bins;}
  int getFFTSize() {return fftSize;}
  int getHopSize() {return hopSize;}
  int getWindowSize() {return windowSize;}

	//features
	float spectralFlatness();
	float spectralCentroid();

private:
  std::vector<float> magnitudes, phases, magnitudesDB;
  std::vector<float> buffer, window;
	int pos;
	float nextValue;
	int fftSize;
	fft _fft;
	bool newFFT;
  int windowSize;
  int hopSize;
  int bins;
  float recalc;
  std::vector<float> & magsToDB();

};

class maxiIFFT {

public:
  enum fftModes {SPECTRUM=0, COMPLEX=1};

	maxiIFFT(){
	};
  ~maxiIFFT() {};
	void setup(int fftSize=1024, int hopSize=512, int windowSize=0);
  float process(std::vector<float> &data1, std::vector<float> &data2, fftModes mode = maxiIFFT::SPECTRUM);
  int getNumBins() { return bins; }

private:
    std::vector<float> ifftOut, buffer, window;
	int windowSize;
	int hopSize;
	int bins;
	int pos;
	float nextValue;
	int fftSize;
	fft _fft;
};


class maxiFFTOctaveAnalyzer {
    /*based on code by David Bollinger, http://www.davebollinger.com/
     */
public:

	float samplingRate; // sampling rate in Hz (needed to calculate frequency spans)
	int nSpectrum; // number of spectrum bins in the fft
	int nAverages; // number of averaging bins here
	int nAveragesPerOctave; // number of averages per octave as requested by user
	float spectrumFrequencySpan; // the "width" of an fft spectrum bin in Hz
	float firstOctaveFrequency; // the "top" of the first averaging bin here in Hz
	float averageFrequencyIncrement; // the root-of-two multiplier between averaging bin frequencies
	float * averages; // the actual averages
	float * peaks; // peaks of the averages, aka "maxAverages" in other implementations
	int * peakHoldTimes; // how long to hold THIS peak meter?  decay if == 0
	int peakHoldTime; // how long do we hold peaks? (in fft frames)
	float peakDecayRate; // how quickly the peaks decay:  0f=instantly .. 1f=not at all
	int * spe2avg; // the mapping between spectrum[] indices and averages[] indices
	// the fft's log equalizer() is no longer of any use (it would be nonsense to log scale
	// the spectrum values into log-sized average bins) so here's a quick-and-dirty linear
	// equalizer instead:
	float linearEQSlope; // the rate of linear eq
	float linearEQIntercept; // the base linear scaling used at the first averaging bin
	// the formula is:  spectrum[i] * (linearEQIntercept + i * linearEQSlope)
	// so.. note that clever use of it can also provide a "gain" control of sorts
	// (fe: set intercept to 2f and slope to 0f to double gain)

	void setup(float samplingRate, int nBandsInTheFFT, int nAveragesPerOctave);

	void calculate(float * fftData);

};



#endif
