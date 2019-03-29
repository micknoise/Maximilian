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
#include "../maxi_emscr_new.h"
#include <vector>

class maxiFFT {
	
public:
	maxiFFT(){
		_fft = NULL;
		buffer = /* magnitudes = phases  = */window = avgPower = NULL;
	};
	~maxiFFT();
	void setup(int fftSize, int windowSize, int hopSize);
	bool process(float value);
	float magsToDB();
	float /* *magnitudes, *phases, */  *magnitudesDB;
	vector<float> magnitudes, phases;
	float *avgPower;
	int windowSize;
	int hopSize;
	int bins;
	
	vector<float> getMagnitudes() const{
		return magnitudes;
	}
	
	vector<float> getPhases() const{
		return phases;
	}
	
	// properties (emscr)
	float getMagnitude(int n){
		return magnitudes[n];
	}
	
	float getMagnitudeDB(int n){
		return magnitudesDB[n];
	}
	
	float getPhase(int n){
		return phases[n];
	}
	
	
	int getWindowSize() const{
		return windowSize;
	}
	
	void setWindowSize(int size){
		this->windowSize = size;
	}
	
	int getHopSize() const{
		return hopSize;
	}
	
	void setHopSize(int size){
		this->hopSize = size;
	}
	
	int getNumBins() const{
		return hopSize;
	}
	
	void setNumBins(int n){
		this->bins = n;
	}
	
	void setMagnitudes(vector<float> magnitudes_){
		magnitudes = magnitudes_;
	}
	
	void setPhases(vector<float> phases_){
		phases = phases_;
	}
	
	//features
	float spectralFlatness();
	float spectralCentroid();
	
private:
	float *buffer, *window;
	int pos;
	float nextValue;
	int fftSize;
	fft *_fft;
	bool newFFT;
	
};

class maxiIFFT {
	
public:
	maxiIFFT(){
		_fft=0;
	};
	~maxiIFFT();
	void setup(int fftSize, int windowSize, int hopSize);
	//	float process(float *magnitudes, float *phases);
	float process(std::vector<float>& magnitudes, std::vector<float>& phases);
private:
	float *ifftOut, *buffer, *window;
	int windowSize;
	int bins;
	int hopSize;
	int pos;
	float nextValue;
	int fftSize;
	fft *_fft;
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
	
	//	void calculate(float * fftData);
	void calculate(vector<float>&  fftData);
	
	// -------------------------------------------
	// Property functions (emscr)
	
	int getSamplingRate() const{
		return samplingRate;
	}
	
	void setSamplingRate(int rate){
		this->samplingRate = rate;
	}
	
	
	int getNSpectrum() const{
		return nSpectrum;
	}
	
	void setNSpectrum(int nSpectrum){
		this->nSpectrum = nSpectrum;
	}
	
	
	int getNAverages() const{
		return nAverages;
	}
	
	void setNAverages(int nAverages){
		this->nAverages = nAverages;
	}
	
	
	int getNAveragesPerOct() const{
		return nAveragesPerOctave;
	}
	
	void setNAveragesPerOct(int nAverages){
		this->nAveragesPerOctave = nAverages;
	}
	
	
	float	getSpecFreqSpan() const{
		return spectrumFrequencySpan;
	}
	void setSpecFreqSpan(float span){
		this->spectrumFrequencySpan = span;
	}
	
	
	float	getFirstOctFreq()const{
		return firstOctaveFrequency;
	}
	void setFirstOctFreq(float freq) {
		this->firstOctaveFrequency = freq;
	}
	
	
	float	getAvgFreqIncr() const{
		return averageFrequencyIncrement;
	}
	void setAvgFreqIncr(float incr) {
		this->averageFrequencyIncrement = incr;
	}
	
	
	float getAverage(int n) const{
		return averages[n];
	}
	float getPeak(int n) const{
		return peaks[n];
	}
	
	int getPeakHoldTime(int n) const{
		return peakHoldTimes[n];
	}
	
	
	int	getPeakHoldTimeTotal() const{
		return peakHoldTime;
	}
	
	void setPeakHoldTimeTotal(int tm){
		this->peakHoldTime = tm;
	}
	
	
	float	getPeakDecayRate() const{
		return peakDecayRate;
	}
	
	void setPeakDecayRate(float rate){
		this->peakDecayRate = rate;
	}
	
	
	int getSpe2Avg(int n) const{
		return spe2avg[n];
	}
	
	float	getLinEQSlope() const{
		return linearEQSlope;
	}
	void setLinEQSlope(float slope){
		this->linearEQSlope = slope;
	}
	
	float	getLinEQIntercept() const{
		return linearEQIntercept;
	}
	void setLinEQIntercept(float n){
		this->linearEQIntercept = n;
	}
	
	
};

#endif