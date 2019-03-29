/*
 contains all bindings for use with emscripten
 */
#ifndef Maxi_Emscripten_maxiFFT_embind_h
#define Maxi_Emscripten_maxiFFT_embind_h

#include <emscripten.h>
#include <emscripten/bind.h>
//#include "fft.cpp"


using namespace emscripten;

EMSCRIPTEN_BINDINGS(my_module_maxiGrains) {
	
	// -------------------------------------------------------------------------------------------
	// LIBS
	
	
	// MAXI TIMESTRETCH
	class_<maxiTimestretch<hannWinFunctor> >("maxiTimestretch")
	.smart_ptr_constructor("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimestretch<hannWinFunctor> >)
	//	.smart_ptr_constructor<maxiSample*>("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimestretch<hannWinFunctor> >)
	.function("setSample", &maxiTimestretch<hannWinFunctor>::setSample, allow_raw_pointers())
	
	.function("getNormalisedPosition", &maxiTimestretch<hannWinFunctor>::getNormalisedPosition)
	.function("getPosition", &maxiTimestretch<hannWinFunctor>::getPosition)
	.function("setPosition", &maxiTimestretch<hannWinFunctor>::setPosition)
	
	.function("play", &maxiTimestretch<hannWinFunctor>::play)
	.function("play2", &maxiTimestretch<hannWinFunctor>::play2)
	;
	
	// MAXI PITCHSHIFT
	
	class_<maxiPitchShift<hannWinFunctor> >("maxiPitchShift")
	.smart_ptr_constructor("shared_ptr<maxiPitchShift<hannWinFunctor> >",&std::make_shared<maxiPitchShift<hannWinFunctor> >)
	.function("setSample", &maxiPitchShift<hannWinFunctor>::setSample, allow_raw_pointers())
	
	.function("play", &maxiPitchShift<hannWinFunctor>::play)
	;
	
	
	// MAXI PITCHSTRETCH
	class_<maxiPitchStretch<hannWinFunctor> >("maxiPitchStretch")
	.smart_ptr_constructor("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiPitchStretch<hannWinFunctor> >)
	//	.smart_ptr_constructor<maxiSample*>("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimestretch<hannWinFunctor> >)
	.function("setSample", &maxiPitchStretch<hannWinFunctor>::setSample, allow_raw_pointers())
	
	.function("getNormalisedPosition", &maxiPitchStretch<hannWinFunctor>::getNormalisedPosition)
	.function("getPosition", &maxiPitchStretch<hannWinFunctor>::getPosition)
	.function("setPosition", &maxiPitchStretch<hannWinFunctor>::setPosition)
	
	.function("setLoopStart", &maxiPitchStretch<hannWinFunctor>::setLoopStart)
	.function("setLoopEnd", &maxiPitchStretch<hannWinFunctor>::setLoopEnd)
	
	.function("play", &maxiPitchStretch<hannWinFunctor>::play)
	;
};
#endif
