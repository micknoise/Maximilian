/*
 contains all bindings for use with emscripten
 */
#ifndef Maxi_Emscripten_maxiFFT_embind_h
#define Maxi_Emscripten_maxiFFT_embind_h

#include <emscripten.h>
#include <emscripten/bind.h>
#include "fft.cpp"

using namespace emscripten;

EMSCRIPTEN_BINDINGS(my_module_maxiFFT) {
	
	// -------------------------------------------------------------------------------------------
	// LIBS
	
	
	// MAXI FFT
	class_<maxiFFT>("maxiFFT")
	//	.constructor<>()
	//	.constructor<int>()
	
	
	.smart_ptr_constructor("shared_ptr<maxiFFT>",&std::make_shared<maxiFFT>)
	.function("setup", &maxiFFT::setup)
	.function("process", &maxiFFT::process)
	.function("magsToDB", &maxiFFT::magsToDB)
	.function("spectralFlatness", &maxiFFT::spectralFlatness)
	.function("spectralCentroid", &maxiFFT::spectralCentroid)
	.function("getMagnitude", &maxiFFT::getMagnitude)
	.function("getMagnitudeDB", &maxiFFT::getMagnitudeDB)
	.function("getPhase", &maxiFFT::getPhase)
	
	.property("windowSize", &maxiFFT::getWindowSize, &maxiFFT::setWindowSize)
	.property("hopSize", &maxiFFT::getHopSize, &maxiFFT::setHopSize)
	.property("bins", &maxiFFT::getNumBins, &maxiFFT::setNumBins)
	.property("magnitudes", &maxiFFT::getMagnitudes, &maxiFFT::setMagnitudes)
	.property("phases", &maxiFFT::getPhases, &maxiFFT::setPhases)

	;
	
	// MAXI IFFT
	class_<maxiIFFT>("maxiIFFT")
	//	.constructor<>()
	//	.constructor<int>()
	
	.smart_ptr_constructor("shared_ptr<maxiIFFT>",&std::make_shared<maxiIFFT>)
	.function("setup", &maxiIFFT::setup)
	.function("process", &maxiIFFT::process)
	
	;
	
	// MAXI IFFT
	class_<maxiFFTOctaveAnalyzer>("maxiFFTOctaveAnalyzer")
	//	.constructor<>()
	//	.constructor<int>()
	
	.smart_ptr_constructor("shared_ptr<maxiFFTOctaveAnalyzer>",&std::make_shared<maxiFFTOctaveAnalyzer>)
	.function("setup", &maxiFFTOctaveAnalyzer::setup)
	.function("calculate", &maxiFFTOctaveAnalyzer::calculate)
	
	//properties
	.property("samplingRate", &maxiFFTOctaveAnalyzer::getSamplingRate, &maxiFFTOctaveAnalyzer::setSamplingRate)
	.property("nSpectrum", &maxiFFTOctaveAnalyzer::getNSpectrum, &maxiFFTOctaveAnalyzer::setNSpectrum)
	.property("nAverages", &maxiFFTOctaveAnalyzer::getNAverages, &maxiFFTOctaveAnalyzer::setNAverages)
	.property("nAveragesPerOctave", &maxiFFTOctaveAnalyzer::getNAveragesPerOct, &maxiFFTOctaveAnalyzer::setNAveragesPerOct)
	.property("spectrumFrequencySpan", &maxiFFTOctaveAnalyzer::getSpecFreqSpan, &maxiFFTOctaveAnalyzer::setSpecFreqSpan)
	.property("firstOctaveFrequency", &maxiFFTOctaveAnalyzer::getFirstOctFreq, &maxiFFTOctaveAnalyzer::setFirstOctFreq)
	.property("averageFrequencyIncrement", &maxiFFTOctaveAnalyzer::getAvgFreqIncr, &maxiFFTOctaveAnalyzer::setAvgFreqIncr)
	
	
	.function("getAverage", &maxiFFTOctaveAnalyzer::getAverage)
	.function("getPeak", &maxiFFTOctaveAnalyzer::getPeak)
	.function("getPeakHoldTime", &maxiFFTOctaveAnalyzer::getPeakHoldTime)
	
	.property("peakHoldTime", &maxiFFTOctaveAnalyzer::getPeakHoldTimeTotal, &maxiFFTOctaveAnalyzer::setPeakHoldTimeTotal)
	.property("peakDecayRate", &maxiFFTOctaveAnalyzer::getPeakDecayRate, &maxiFFTOctaveAnalyzer::setPeakDecayRate)
	
	.function("getSpe2Avg", &maxiFFTOctaveAnalyzer::getSpe2Avg)
	
	.property("linearEQSlope", &maxiFFTOctaveAnalyzer::getLinEQSlope, &maxiFFTOctaveAnalyzer::setLinEQSlope)
	.property("linearEQIntercept", &maxiFFTOctaveAnalyzer::getLinEQIntercept, &maxiFFTOctaveAnalyzer::setLinEQIntercept)
	;
	
};
#endif
