/*
 contains all bindings for use with emscripten
 */
#ifndef Maxi_Emscripten_maxiMFCC_embind_h
#define Maxi_Emscripten_maxiMFCC_embind_h

#include <emscripten.h>
#include <emscripten/bind.h>

using namespace emscripten;

EMSCRIPTEN_BINDINGS(my_module_maxiMFCC) {
	
	// -------------------------------------------------------------------------------------------
	// LIBS
		// MAXI MFCC
	class_<maxiMFCC>("maxiMFCC")
//	.constructor<>()
	//	.constructor<int>()
	
		.smart_ptr_constructor("shared_ptr<maxiMFCC>",&std::make_shared<maxiMFCC>)
		.function("setup", &maxiMFCC::setup)
		.function("mfcc", &maxiMFCC::mfcc, allow_raw_pointers())
	;
};
#endif
