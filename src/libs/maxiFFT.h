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

/**
 * Fast fourier transform. For spectral audio process and machine listening.
 */
class maxiFFT {

public:

	/*! How to run the FFT - with or without polar conversion*/
  enum fftModes {NO_POLAR_CONVERSION = 0, WITH_POLAR_CONVERSION = 1};

  maxiFFT() {};
  ~maxiFFT() {};

	/**
	 * Configure the FFT. 
	 * \param fftSize the FFT size. This must be a power of 2
	 * \param hopSize the hop size
	 * \param windowSize the window size
	 */
  void setup(int fftSize=1024, int hopSize=512, int windowSize=0);

	/**
	 * Analyse an audio signal with FFT
	 * \param value a signal
	 * \param mode see fftModes enumeration
	 * \returns true when the analysis has run (every [hopsize] samples)
	 */
  bool process(float value, fftModes mode=maxiFFT::WITH_POLAR_CONVERSION);
	/*! \returns a pointer to an array of values containing the real components of the fft analysis*/
  inline float *getReal() {return _fft.getReal();};
	/*! \returns a pointer to an array of values containing the imaginary components of the fft analysis*/
  inline float *getImag() {return _fft.getImg();};

	/*! \returns a vector of magnitudes (assuming the FFT was calcuated with polar conversion)*/
  std::vector<float> & getMagnitudes() {return magnitudes;}
	/*! \returns a vector of magnitudes in decibels (assuming the FFT was calcuated with polar conversion)*/
  std::vector<float> & getMagnitudesDB() {return magsToDB();}
	/*! \returns a vector of phases (assuming the FFT was calcuated with polar conversion)*/
  std::vector<float> & getPhases() {return phases;}

	/*! \returns the number of bins in the FFT analysis*/
  int getNumBins() {return bins;}
	/*! \returns the FFT size*/
  int getFFTSize() {return fftSize;}
	/*! \returns the hop size*/
  int getHopSize() {return hopSize;}
	/*! \returns the window size*/
  int getWindowSize() {return windowSize;}

	//features
	/*! \returns the spectral flatness of the most recent FFT calculation*/
	float spectralFlatness();
	/*! \returns the spectral centroid of the most recent FFT calculation*/
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

/**
 * Inverse FFT transform
 */
class maxiIFFT {

public:
	/*! Configure what kind of data is being given to the inverse FFT*/
  enum fftModes {SPECTRUM=0, /*!< Magnitudes and phases*/
	COMPLEX=1 /*!< Real and imaginary components */
	};

	maxiIFFT(){
	};
  ~maxiIFFT() {};

	/**
	 * Configure the Inverse FFT.
	 * \param fftSize the FFT size. This must be a power of 2
	 * \param hopSize the hop size
	 * \param windowSize the window size
	 */
	void setup(int fftSize=1024, int hopSize=512, int windowSize=0);
	/**
	* Run the inverse transform. Call this function at audio rate, but update the FFT information at FFT rate. See example 20.
	* \param data1 either magnitudes or real values
	* \param data2 either phases or imaginary values
	* \param mode see fftModes
	* \returns the most recent sample an audio signal, creates from the inverse transform of the FFT data
	*/
  float process(std::vector<float> &data1, std::vector<float> &data2, fftModes mode = maxiIFFT::SPECTRUM);
	/*! \returns the number of fft bins */
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


/**
 * An octave analyser. It takes FFT magnitudes and remaps them into pitches
 */
class maxiFFTOctaveAnalyzer {
    /*based on code by David Bollinger
     */
public:

	float samplingRate; // sampling rate in Hz (needed to calculate frequency spans)
	int nSpectrum; // number of spectrum bins in the fft
	/*! the number of averages, after analysis */
	int nAverages; // number of averaging bins here
	int nAveragesPerOctave; // number of averages per octave as requested by user
	float spectrumFrequencySpan; // the "width" of an fft spectrum bin in Hz
	float firstOctaveFrequency; // the "top" of the first averaging bin here in Hz
	float averageFrequencyIncrement; // the root-of-two multiplier between averaging bin frequencies
	/*! An array of averages - the energy across the pitch spectrum*/
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

	/**
	 * Setup the octave analyser
	 * \param samplingRate the sample rate
	 * \param nBandsInTheFFT the number of bins in the FFT
	 * \param nAveragesPerOctave how many frequency bands to split each octave into
	 */
	void setup(float samplingRate, int nBandsInTheFFT, int nAveragesPerOctave);

	/**
	 * Run the analyser
	 * \param fftData a pointer to an array of fft magnitudes
	 */
	void calculate(float * fftData);

};



#endif
