/*
 contains  bindings for use with emscripten
 there are some functions that are transpiled using CHEERP instead for speed - see the purejs folder

 */
#ifndef Maxi_Emscripten_maxi_embind_h
#define Maxi_Emscripten_maxi_embind_h

#include <emscripten.h>
#include <emscripten/bind.h>
#include "maximilian.h"
#include "libs/maxiFFT.h"
#include "libs/maxiGrains.h"
#include "libs/maxiMFCC.h"
#include "libs/maxiReverb.h"
#include "libs/maxiSynths.h"
// #include "libs/fft.cpp"
#include "libs/stb_vorbis.h"

// #define SPN

class vectorTools
{
public:
	static void clearVectorDbl(vector<double> &vecIn)
	{
		vecIn.clear();
	}
	static void clearVectorFloat(vector<float> &vecIn)
	{
		vecIn.clear();
	}
};

using namespace emscripten;

EMSCRIPTEN_BINDINGS(my_module)
{
	register_vector<int>("VectorInt");
	register_vector<double>("VectorDouble");
	register_vector<char>("VectorChar");
	register_vector<unsigned char>("VectorUChar");
	register_vector<float>("VectorFloat");

	class_<vectorTools>("vectorTools")
			.constructor<>()
			.class_function("clearVectorDbl", &vectorTools::clearVectorDbl)
			.class_function("clearVectorFloat", &vectorTools::clearVectorFloat)
			//	.class_function("print", &vectorTools::pr)
			;

	// maxi stuff
	class_<maxiSettings>("maxiSettings")
			// .constructor<>()
			.class_function("setup", &maxiSettings::setup)
			.class_function("getSampleRate", &maxiSettings::getSampleRate)
			// .property("channels", &maxiSettings::getNumChannels, &maxiSettings::setNumChannels)
			// .property("bufferSize", &maxiSettings::getBufferSize, &maxiSettings::setBufferSize);
			;

	// MAXI OSC
// 	class_<maxiOsc>("maxiOsc")
// #ifdef SPN
// 			/*
// 	 		Using a smart_ptr_constructor ensures lifetime management  on the js side
// 	 		by returning a smart_ptr when a constructor is used
// 	 		*/
// 			.smart_ptr_constructor("shared_ptr<maxiOsc>", &std::make_shared<maxiOsc>)
// #else
// 			.constructor<>()
// #endif
// 			.function("sinewave", &maxiOsc::sinewave)
// 			.function("coswave", &maxiOsc::coswave)
// 			.function("phasor", select_overload<double(double)>(&maxiOsc::phasor))
// 			.function("phasor", select_overload<double(double, double, double)>(&maxiOsc::phasor))
// 			.function("saw", &maxiOsc::saw)
// 			.function("triangle", &maxiOsc::triangle)
// 			.function("square", &maxiOsc::square)
// 			.function("pulse", &maxiOsc::pulse)
// 			.function("impulse", &maxiOsc::impulse)
// 			.function("noise", &maxiOsc::noise)
// 			.function("sinebuf", &maxiOsc::sinebuf)
// 			.function("sinebuf4", &maxiOsc::sinebuf4)
// 			.function("sawn", &maxiOsc::sawn)
// 			// .function("rect", &maxiOsc::rect)
// 			.function("phaseReset", &maxiOsc::phaseReset);

	// MAXI ENVELOPE
	class_<maxiEnvelope>("maxiEnvelope")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiEnvelope>", &std::make_shared<maxiEnvelope>)
#else
			.constructor<>()
#endif
			.function("line", &maxiEnvelope::line)
			//	.function("line", &maxiEnvelope::line, allow_raw_pointers()) // if using array version
			.function("trigger", &maxiEnvelope::trigger)

			.property("amplitude", &maxiEnvelope::getAmplitude, &maxiEnvelope::setAmplitude)
			.property("valindex", &maxiEnvelope::getValindex, &maxiEnvelope::setValindex)

			;

	// MAXI DELAYLINE
// 	class_<maxiDelayline>("maxiDelayline")
// #ifdef SPN
// 			.smart_ptr_constructor("shared_ptr<maxiDelayline>", &std::make_shared<maxiDelayline>)
// #else
// 			.constructor<>()
// #endif
// 			.function("dl", select_overload<double(double, int, double)>(&maxiDelayline::dl))
// 			.function("dl", select_overload<double(double, int, double, int)>(&maxiDelayline::dl));

	// MAXI FILTER
// 	class_<maxiFilter>("maxiFilter")
// #ifdef SPN
// 			.smart_ptr_constructor("shared_ptr<maxiFilter>", &std::make_shared<maxiFilter>)
// #else
// 			.constructor<>()
// #endif
// 			.function("lores", &maxiFilter::lores)
// 			.function("hires", &maxiFilter::hires)
// 			.function("bandpass", &maxiFilter::bandpass)
// 			.function("lopass", &maxiFilter::lopass)
// 			.function("hipass", &maxiFilter::hipass)
// 			.property("cutoff", &maxiFilter::getCutoff, &maxiFilter::setCutoff)
// 			.property("resonance", &maxiFilter::getResonance, &maxiFilter::setResonance);

	// MAXI MIX
	class_<maxiMix>("maxiMix")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiMix>", &std::make_shared<maxiMix>)
#else
			.constructor<>()
#endif
			.function("stereo", &maxiMix::stereo, allow_raw_pointers())
			.function("quad", &maxiMix::quad, allow_raw_pointers())
			.function("ambisonic", &maxiMix::ambisonic, allow_raw_pointers());

	//	class_<TemplateClass<int>>("IntTemplateClass")
	//	.constructor<int, int, int>()
	//	.function("getMember", &TemplateClass<int>::getMember)
	//	;

	class_<maxiLine>("maxiLine")
	#ifdef SPN
				.smart_ptr_constructor("shared_ptr<maxiLine>", &std::make_shared<maxiLine>)
	#else
				.constructor<>()
	#endif
		.function("play", &maxiLine::play)
		.function("prepare", &maxiLine::prepare)
		.function("triggerEnable", &maxiLine::triggerEnable)
		.function("isLineComplete", &maxiLine::isLineComplete)
		;

	class_<maxiXFade>("maxiXFade")
	.class_function("xfade", select_overload<vector<double> (vector<double> &, vector<double> &, double)>(&maxiXFade::xfade))
	.class_function("xfade", select_overload<double(double, double, double)>(&maxiXFade::xfade))
		;

	class_<maxiLagExp<double>>("maxiLagExp")
#ifdef SPN
			// not sure how to override constructors with smart_ptr
			.smart_ptr_constructor("shared_ptr<maxiLagExp<double>>", &std::make_shared<maxiLagExp<double>>, allow_raw_pointers())
	//	.smart_ptr_constructor("shared_ptr<maxiLagExp<double>>",&std::make_shared<maxiLagExp<double>>)
#else
			.constructor<>()
#endif
			.function("init", &maxiLagExp<double>::init)
			.function("addSample", &maxiLagExp<double>::addSample)
			.function("value", &maxiLagExp<double>::value)
			.property("alpha", &maxiLagExp<double>::getAlpha, &maxiLagExp<double>::setAlpha)
			.property("alphaReciprocal", &maxiLagExp<double>::getAlphaReciprocal, &maxiLagExp<double>::setAlphaReciprocal)
			.property("val", &maxiLagExp<double>::value, &maxiLagExp<double>::setVal);

	// MAXI SAMPLE
	class_<maxiSample>("maxiSample")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiSample>", &std::make_shared<maxiSample>)
#else
			.constructor<>()
#endif
			//	.property("length", &maxiSample::getLength, &maxiSample::setLength) // no work???
			.function("getLength", &maxiSample::getLength)
			//	.function("setSample", &maxiSample::setSample)
			.function("setSample", select_overload<void(vector<double> &)>(&maxiSample::setSample))
			.function("setSample", select_overload<void(vector<double> &, int)>(&maxiSample::setSample))
			.function("setSampleFromOggBlob", &maxiSample::setSampleFromOggBlob)
			//	.function("getSummary", &maxiSample::getSummary)
			.function("isReady", &maxiSample::isReady)
			.function("playOnce", select_overload<double()>(&maxiSample::playOnce))
			.function("playOnce", select_overload<double(double)>(&maxiSample::playOnce))
			.function("playOnZX", select_overload<double(double)>(&maxiSample::playOnZX))
			.function("playOnZX", select_overload<double(double,double)>(&maxiSample::playOnZX))
			.function("playOnZX", select_overload<double(double,double,double)>(&maxiSample::playOnZX))
			.function("playOnZX", select_overload<double(double,double,double,double)>(&maxiSample::playOnZX))
			.function("playUntil", select_overload<double(double)>(&maxiSample::playUntil))
			.function("playUntil", select_overload<double(double,double)>(&maxiSample::playUntil))
			.function("play", select_overload<double()>(&maxiSample::play))
			.function("play", select_overload<double(double)>(&maxiSample::play))
			.function("play", select_overload<double(double, double, double)>(&maxiSample::play))
			.function("play4", &maxiSample::play4)
			.function("trigger", &maxiSample::trigger)
			.function("clear", &maxiSample::clear)
			.function("normalise", &maxiSample::normalise)
			.function("autoTrim", &maxiSample::autoTrim)
			.function("load", &maxiSample::load)
			.function("read", &maxiSample::read, allow_raw_pointers())
			.function("loopSetPosOnZX", &maxiSample::loopSetPosOnZX);


// 	// MAXI MAP
// 	class_<maxiMap>("maxiMap")
// #ifdef SPN
// 			.smart_ptr_constructor("shared_ptr<maxiMap>", &std::make_shared<maxiMap>)
// #else
// 			.constructor<>()
// #endif
// 	.function("linlin", &maxiMap::linlin)
// 	.function("linexp", &maxiMap::linexp)
// 	.function("explin", &maxiMap::explin)
// 	.function("clamp", &maxiMap::clamp)
// 	.class_function("linlin", &maxiMap::linlin)
// 	.class_function("linexp", &maxiMap::linexp)
// 	.class_function("explin", &maxiMap::explin)
// 	.class_function("clamp", &maxiMap::clamp);

	// MAXI DYN
	class_<maxiDyn>("maxiDyn")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiDyn>", &std::make_shared<maxiDyn>)
#else
			.constructor<>()
#endif
			.function("gate", &maxiDyn::gate)
			.function("compressor", &maxiDyn::compressor)
			.function("compress", &maxiDyn::compress)
			.function("setAttack", &maxiDyn::setAttack)
			.function("setRelease", &maxiDyn::setRelease)
			.function("setThreshold", &maxiDyn::setThreshold)
			.function("setRatio", &maxiDyn::setRatio);

	// MAXI ENV
	class_<maxiEnv>("maxiEnv")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiEnv>", &std::make_shared<maxiEnv>)
#else
			.constructor<>()
#endif
			.function("ar", &maxiEnv::ar)
			//	.function("adsr", &maxiEnv::adsr)
			.function("adsr", select_overload<double(double, double, double, double, double, long, int)>(&maxiEnv::adsr))
			.function("adsr", select_overload<double(double, int)>(&maxiEnv::adsr))
			.function("setAttack", &maxiEnv::setAttack)
			.function("setRelease", &maxiEnv::setRelease)
			.function("setDecay", &maxiEnv::setDecay)
			.function("setSustain", &maxiEnv::setSustain)
			.property("trigger", &maxiEnv::getTrigger, &maxiEnv::setTrigger);

	// CONVERT
	class_<convert>("convert")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<convert>", &std::make_shared<convert>)
#else
			.constructor<>()
#endif
		.function("mtof", &convert::mtof)
		.class_function("mtof", &convert::mtof)
		.function("msToSamps", &convert::msToSamps)
		.class_function("msToSamps", &convert::msToSamps)
			//	.class_function("mtof", &convert::mtof)
			;

class_<maxiSampleAndHold>("maxiSampleAndHold")
		#ifdef SPN
					.smart_ptr_constructor("shared_ptr<maxiSampleAndHold>", &std::make_shared<maxiSampleAndHold>)
		#else
					.constructor<>()
		#endif
				.function("sah", &maxiSampleAndHold::sah)
					;


	// MAXI DISTORTION - for backward compatibility, new stuff in maxiNonlinearity below
	// class_<maxiDistortion>("maxiDistortion")
	// #ifdef SPN
	// 			.smart_ptr_constructor("shared_ptr<maxiDistortion>", &std::make_shared<maxiDistortion>)
	// #else
	// 			.constructor<>()
	// #endif
	// 			.function("fastAtan", &maxiDistortion::fastatan)
	// 			.function("atanDist", &maxiDistortion::atanDist)
	// 			.function("fastAtanDist", &maxiDistortion::fastAtanDist);

		// class_<maxiNonlinearity>("maxiNonlinearity")
		// 		#ifdef SPN
		// 					.smart_ptr_constructor("shared_ptr<maxiNonlinearity>", &std::make_shared<maxiNonlinearity>)
		// 		#else
		// 					.constructor<>()
		// 		#endif
		// 					.function("fastAtan", &maxiNonlinearity::fastatan)
		// 					.function("atanDist", &maxiNonlinearity::atanDist)
		// 					.function("fastAtanDist", &maxiNonlinearity::fastAtanDist)
		// 					.function("softclip", &maxiNonlinearity::softclip)
		// 					.function("hardclip", &maxiNonlinearity::hardclip)
		// 					.function("asymclip", &maxiNonlinearity::asymclip)
		// 				;

	// MAXI FLANGER
	class_<maxiFlanger>("maxiFlanger")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiFlanger>", &std::make_shared<maxiFlanger>)
#else
			.constructor<>()
#endif
			.function("flange", &maxiFlanger::flange);

	// MAXI CHORUS
	class_<maxiChorus>("maxiChorus")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiChorus>", &std::make_shared<maxiChorus>)
#else
			.constructor<>()
#endif
			.function("chorus", &maxiChorus::chorus);

	// MAXI ENVELOPE FOLLOWER
	//	class_<maxiEnvelopeFollowerType<double>>("maxiEnvelopeFollower")
	//	//	.constructor<>()
	//	.smart_ptr_constructor("shared_ptr<maxiEnvelopeFollower>",&std::make_shared<maxiEnvelopeFollowerType<double>>)
	//	.function("setAttack", &maxiEnvelopeFollowerType<double>::setAttack<double>)
	//	.function("setRelease", &maxiEnvelopeFollowerType<double>::setRelease)
	//	.function("play", &maxiEnvelopeFollowerType<double>::play)
	//	.function("reset", &maxiEnvelopeFollowerType<double>::reset)
	//	;

	// MAXI DC BLOCKER
	class_<maxiDCBlocker>("maxiDCBlocker")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiDCBlocker>", &std::make_shared<maxiDCBlocker>)
#else
			.constructor<>()
#endif
			.function("play", &maxiDCBlocker::play);

			// MAXI SVF
class_<maxiSVF>("maxiSVF")
#ifdef SPN
		.smart_ptr_constructor("shared_ptr<maxiSVF>", &std::make_shared<maxiSVF>)
#else
		.constructor<>()
#endif
		.function("setCutoff", &maxiSVF::setCutoff)
		.function("setResonance", &maxiSVF::setResonance)
		.function("play", &maxiSVF::play);

		// MAXI SVF
class_<maxiMath>("maxiMath")
#ifdef SPN
		.smart_ptr_constructor("shared_ptr<maxiMath>", &std::make_shared<maxiMath>)
#else
		.constructor<>()
#endif
	.class_function("add", &maxiMath::add)
	.class_function("sub", &maxiMath::sub)
	.class_function("mul", &maxiMath::mul)
	.class_function("div", &maxiMath::div)
	.class_function("gt", &maxiMath::gt)
	.class_function("lt", &maxiMath::lt)
	.class_function("gte", &maxiMath::gte)
	.class_function("lte", &maxiMath::lte)
	.class_function("mod", &maxiMath::mod)
	.class_function("abs", &maxiMath::abs)
	.class_function("pow", &maxiMath::xpowy);


	// TODO:FB – Uncomment – this is giving me compilation errors on EM
	// MAXI KICK
	// class_<maxiKick>("maxiKick")
	// //	.constructor<>()
	// // .function("setPitch", &maxiKick::setPitch)
	// .smart_ptr_constructor("shared_ptr<maxiKick>",&std::make_shared<maxiKick>)
	// .function("play", &maxiKick::play)
	// .function("setRelease", &maxiKick::setRelease)
	// .function("trigger", &maxiKick::trigger)
	// .property("pitch", &maxiKick::getPitch, &maxiKick::setPitch)
	// .property("distortion", &maxiKick::getDistortion, &maxiKick::setDistortion)
	// .property("cutoff", &maxiKick::getCutoff, &maxiKick::setCutoff)
	// .property("resonance", &maxiKick::getResonance, &maxiKick::setResonance)
	// .property("useDistortion", &maxiKick::getUseDistortion, &maxiKick::setUseDistortion)
	// .property("useLimiter", &maxiKick::getUseLimiter, &maxiKick::setUseLimiter)
	// .property("useFilter", &maxiKick::getUseFilter, &maxiKick::setUseFilter)
	// ;

	// MAXI SNARE
	// class_<maxiSnare>("maxiSnare")
	// //	.constructor<>()
	// .smart_ptr_constructor("shared_ptr<maxiSnare>",&std::make_shared<maxiSnare>)
	// .function("play", &maxiSnare::play)
	// .function("setPitch", &maxiSnare::setPitch)
	// .function("setRelease", &maxiSnare::setRelease)
	// .function("trigger", &maxiSnare::trigger)
	// ;

	// MAXI HATS
	// class_<maxiHats>("maxiHats")
	// //	.constructor<>()
	// .smart_ptr_constructor("shared_ptr<maxiHats>",&std::make_shared<maxiHats>)
	// .function("play", &maxiHats::play)
	// .function("setPitch", &maxiHats::setPitch)
	// .function("setRelease", &maxiHats::setRelease)
	// .function("trigger", &maxiHats::trigger)
	// ;

	// MAXI CLOCK
class_<maxiClock>("maxiClock")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiClock>", &std::make_shared<maxiClock>)
#else
			.constructor<>()
#endif
			.function("ticker", &maxiClock::ticker)
			.function("setTempo", &maxiClock::setTempo)
			.function("setTicksPerBeat", &maxiClock::setTicksPerBeat)
			.function("isTick", &maxiClock::isTick)
			.property("currentCount", &maxiClock::getCurrentCount, &maxiClock::setCurrentCount)
			.property("currentCount", &maxiClock::getLastCount, &maxiClock::setLastCount)
			.property("playHead", &maxiClock::getPlayHead, &maxiClock::setPlayHead)
			.property("bps", &maxiClock::getBps, &maxiClock::setBps)
			.property("bpm", &maxiClock::getBpm, &maxiClock::setBpm)
			.property("tick", &maxiClock::getTick, &maxiClock::setTick)
			.property("ticks", &maxiClock::getTicks, &maxiClock::setTicks)
      ;


class_<maxiKuramotoOscillator>("maxiKuramotoOscillator")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiKuramotoOscillator>", &std::make_shared<maxiKuramotoOscillator>)
#else
			.constructor<>()
#endif
			.function("play", &maxiKuramotoOscillator::play)
			.function("setPhase", &maxiKuramotoOscillator::setPhase)
			.function("getPhase", &maxiKuramotoOscillator::getPhase)
      ;

class_<maxiKuramotoOscillatorSet>("maxiKuramotoOscillatorSet")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiKuramotoOscillatorSet>", &std::make_shared<maxiKuramotoOscillatorSet, const size_t>)
#else
			.constructor<const size_t>()
#endif
			.function("play", &maxiKuramotoOscillatorSet::play)
			.function("setPhase", &maxiKuramotoOscillatorSet::setPhase)
			.function("setPhases", &maxiKuramotoOscillatorSet::setPhases)
			.function("getPhase", &maxiKuramotoOscillatorSet::getPhase)
			.function("size", &maxiKuramotoOscillatorSet::size)
      ;


class_<maxiAsyncKuramotoOscillator, base<maxiKuramotoOscillatorSet>>("maxiAsyncKuramotoOscillator")
#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiAsyncKuramotoOscillator>", &std::make_shared<maxiAsyncKuramotoOscillator, const size_t>)
#else
			.constructor<const size_t>()
#endif
			.function("play", &maxiAsyncKuramotoOscillator::play)
			.function("setPhase", &maxiAsyncKuramotoOscillator::setPhase)
			.function("setPhases", &maxiAsyncKuramotoOscillator::setPhases)
			.function("getPhase", &maxiAsyncKuramotoOscillator::getPhase)
			.function("size", &maxiAsyncKuramotoOscillator::size)
      ;

};







EMSCRIPTEN_BINDINGS(my_module_maxiGrains) {

    // MAXI TIMESTRETCH
    class_<maxiTimeStretch<hannWinFunctor> >("maxiTimeStretch")
    .smart_ptr_constructor("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimeStretch<hannWinFunctor> >)
    //    .smart_ptr_constructor<maxiSample*>("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimestretch<hannWinFunctor> >)
    .function("setSample", &maxiTimeStretch<hannWinFunctor>::setSample, allow_raw_pointers())

    .function("getNormalisedPosition", &maxiTimeStretch<hannWinFunctor>::getNormalisedPosition)
    .function("getPosition", &maxiTimeStretch<hannWinFunctor>::getPosition)
    .function("setPosition", &maxiTimeStretch<hannWinFunctor>::setPosition)

    .function("play", &maxiTimeStretch<hannWinFunctor>::play)
    .function("playAtPosition", &maxiTimeStretch<hannWinFunctor>::playAtPosition)
    ;

    // MAXI PITCHSHIFT

    class_<maxiPitchShift<hannWinFunctor> >("maxiPitchShift")
    .smart_ptr_constructor("shared_ptr<maxiPitchShift<hannWinFunctor> >",&std::make_shared<maxiPitchShift<hannWinFunctor> >)
    .function("setSample", &maxiPitchShift<hannWinFunctor>::setSample, allow_raw_pointers())

    .function("play", &maxiPitchShift<hannWinFunctor>::play)
    ;


    // MAXI PITCHSTRETCH
    class_<maxiStretch<hannWinFunctor> >("maxiStretch")
		#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiStretch<hannWinFunctor> >",&std::make_shared<maxiStretch<hannWinFunctor> >)
		#else
			.constructor<>()
		#endif

    .function("setSample", &maxiStretch<hannWinFunctor>::setSample, allow_raw_pointers())

    .function("getNormalisedPosition", &maxiStretch<hannWinFunctor>::getNormalisedPosition)
    .function("getPosition", &maxiStretch<hannWinFunctor>::getPosition)
    .function("setPosition", &maxiStretch<hannWinFunctor>::setPosition)

    .function("setLoopStart", &maxiStretch<hannWinFunctor>::setLoopStart)
		.function("setLoopEnd", &maxiStretch<hannWinFunctor>::setLoopEnd)
		.function("getLoopEnd", &maxiStretch<hannWinFunctor>::getLoopEnd)

		.function("play", &maxiStretch<hannWinFunctor>::play)
		.function("playAtPosition", &maxiStretch<hannWinFunctor>::playAtPosition)
    ;

};
// class maxiBitsWrapper : public maxiBits {
//
// public:
// 	maxiBitsWrapper() : maxiBits() {}
// 	maxiBitsWrapper(const bitsig v) : maxiBits(v) {}
// 	void sett(maxiBits::bitsig v){t=v;}
// 	maxiBits::bitsig gett() {return t;};
// };

EMSCRIPTEN_BINDINGS(my_module_maxibits) {
	class_<maxiBits>("maxiBits")
	// #ifdef SPN
	// // .smart_ptr_constructor("shared_ptr<maxiBits>",&std::make_shared<maxiBits>)
	// .smart_ptr_constructor("shared_ptr<maxiBits, uint32_t>",&std::make_shared<maxiBits, uint32_t>)
	// #else
	// // .constructor<>()
	// .constructor<uint32_t>()
	// #endif

	.class_function("sig", &maxiBits::sig)
	.class_function("at", &maxiBits::at)
	.class_function("shl", &maxiBits::shl)
	.class_function("shr", &maxiBits::shr)
	.class_function("r", &maxiBits::r)
	.class_function("land", &maxiBits::land)
	.class_function("lor", &maxiBits::lor)
	.class_function("lxor", &maxiBits::lxor)
	.class_function("neg", &maxiBits::neg)
	.class_function("inc", &maxiBits::inc)
	.class_function("dec", &maxiBits::dec)
	.class_function("add", &maxiBits::add)
	.class_function("sub", &maxiBits::sub)
	.class_function("mul", &maxiBits::mul)
	.class_function("div", &maxiBits::div)
	.class_function("gt", &maxiBits::gt)
	.class_function("lt", &maxiBits::lt)
	.class_function("gte", &maxiBits::gte)
	.class_function("lte", &maxiBits::lte)
	.class_function("eq", &maxiBits::eq)
	.class_function("noise", &maxiBits::noise)
	.class_function("toSignal", &maxiBits::toSignal)
	.class_function("toTrigSignal", &maxiBits::toTrigSignal)
	.class_function("fromSignal", &maxiBits::fromSignal)
	// .property("t", &maxiBits::gett, &maxiBits::sett)
	;

};



// EMSCRIPTEN_BINDINGS(maxiTrigger) {
//
//     class_<maxiTrigger >("maxiTrigger")
// 		#ifdef SPN
//     .smart_ptr_constructor("shared_ptr<maxiTrigger>",&std::make_shared<maxiTrigger>)
// 		#else
// 			.constructor<>()
// 		#endif
//
//     //    .smart_ptr_constructor<maxiSample*>("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimestretch<hannWinFunctor> >)
// 		.function("onZX", &maxiTrigger::onZX)
// 		.function("onChanged", &maxiTrigger::onChanged)
// 		;
// };

EMSCRIPTEN_BINDINGS(maxiCounter) {

    class_<maxiCounter >("maxiCounter")
		#ifdef SPN
    .smart_ptr_constructor("shared_ptr<maxiCounter>",&std::make_shared<maxiCounter>)
		#else
			.constructor<>()
		#endif
    //    .smart_ptr_constructor<maxiSample*>("shared_ptr<maxiTimestretch<hannWinFunctor> >",&std::make_shared<maxiTimestretch<hannWinFunctor> >)
		.function("count", &maxiCounter::count)
		;
};
//
// EMSCRIPTEN_BINDINGS(maxiIndex) {
//
//     class_<maxiIndex >("maxiIndex")
// 		#ifdef SPN
//     .smart_ptr_constructor("shared_ptr<maxiIndex>",&std::make_shared<maxiIndex>)
// 		#else
// 			.constructor<>()
// 		#endif
// 		.function("pull", &maxiIndex::pull)
// 		;
// };

// EMSCRIPTEN_BINDINGS(maxiRatioSeq) {
//
//     class_<maxiRatioSeq >("maxiRatioSeq")
// 		#ifdef SPN
//     .smart_ptr_constructor("shared_ptr<maxiRatioSeq>",&std::make_shared<maxiRatioSeq>)
// 		#else
// 			.constructor<>()
// 		#endif
// 		.function("playTrig", &maxiRatioSeq::playTrig)
// 		.function("playValues", &maxiRatioSeq::playValues)
// 		;
// };

EMSCRIPTEN_BINDINGS(maxiVerb) {

	class_<maxiSatReverb >("maxiSatReverb")
	#ifdef SPN
	.smart_ptr_constructor("shared_ptr<maxiSatReverb>",&std::make_shared<maxiSatReverb>)
	#else
		.constructor<>()
	#endif
	.function("play", &maxiSatReverb::play)
	;

	class_<maxiFreeVerb >("maxiFreeVerb")
	#ifdef SPN
	.smart_ptr_constructor("shared_ptr<maxiFreeVerb>",&std::make_shared<maxiFreeVerb>)
	#else
		.constructor<>()
	#endif
	.function("play", select_overload<double(double, double, double)>(&maxiFreeVerb::play))
	;
};






template <typename T>
emscripten::val getJSArray(vector<T> & buffer) {
		return emscripten::val(
			 emscripten::typed_memory_view(buffer.size(),
																		 buffer.data()));
}

// template <typename T>
//  std::vector<T> vecFromJSArray(const emscripten::val &v)
// {
//     std::vector<T> rv;
//
//     const auto l = v["length"].as<unsigned>();
//     rv.resize(l);
//
//     emscripten::val memoryView{emscripten::typed_memory_view(l, rv.data())};
//     memoryView.call<void>("set", v);
//
//     return rv;
// }


class maxiFFTAdaptor : public maxiFFT {
public:

	void setup(int fftSize, int hopSize, int windowSize) {
		maxiFFT::setup(fftSize, hopSize, windowSize);
	};
	bool process(float value, fftModes mode=maxiFFT::WITH_POLAR_CONVERSION) {return maxiFFT::process(value, mode);};
	int getNumBins() {return maxiFFT::getNumBins();}
  int getFFTSize() {return maxiFFT::getFFTSize();}
  int getHopSize() {return maxiFFT::getHopSize();}
  int getWindowSize() {return maxiFFT::getWindowSize();}

	//features
	float spectralFlatness() {return maxiFFT::spectralFlatness();};
	float spectralCentroid() {return maxiFFT::spectralCentroid();};


	emscripten::val getMagnitudesAsJSArray() {return getJSArray<float>(getMagnitudes());}
  emscripten::val getMagnitudesDBAsJSArray() {return getJSArray<float>(getMagnitudesDB());}
  emscripten::val getPhasesAsJSArray() {return getJSArray<float>(getPhases());}
};

class maxiIFFTAdaptor : public maxiIFFT {
public:
	void setup(int fftSize=1024, int hopSize=512, int windowSize=0) {
		maxiIFFT::setup(fftSize, hopSize, windowSize);
		data1Vec = vector<float>(fftSize/2);
		data2Vec = vector<float>(fftSize/2);
	}
  float process(double trig, const emscripten::val& data1, const emscripten::val& data2, fftModes mode = maxiIFFT::SPECTRUM) {
		if (trig) {
			data1Vec = vecFromJSArray<float>(data1);
			data2Vec = vecFromJSArray<float>(data2);
		}
		return maxiIFFT::process(data1Vec, data2Vec, mode);
	}
private:
	vector<float> data1Vec, data2Vec;
};

class maxiMFCCAdaptor : public maxiMFCC {
public:

	void setup(unsigned int numBins, unsigned int numFilters, unsigned int numCoeffs, double minFreq, double maxFreq) {
		maxiMFCC::setup(numBins, numFilters, numCoeffs, minFreq, maxFreq);
	}

	emscripten::val mfcc(const emscripten::val& powerSpectrum) {
		auto spectrumVector = vecFromJSArray<float>(powerSpectrum);
		vector<double> coeffs = maxiMFCC::mfcc(spectrumVector);
		return getJSArray<double>(coeffs);
	}

};


EMSCRIPTEN_BINDINGS(maxiSpectral) {


	  // MAXI FFT
	  class_<maxiFFTAdaptor>("maxiFFTAdaptor")
	#ifdef SPN
			.smart_ptr_constructor("shared_ptr<maxiFFTAdaptor>", &std::make_shared<maxiFFTAdaptor>)
	#else
			.constructor<>()
	#endif
	    .function("setup", &maxiFFTAdaptor::setup)
	    // .function("process", select_overload<bool(float, maxiFFT::fftModes)>(&maxiFFT::process) )
	    // .function("process", select_overload<bool(float,int)>(&maxiFFT::process))
	    .function("process", &maxiFFTAdaptor::process)
	    .function("spectralFlatness", &maxiFFTAdaptor::spectralFlatness)
	    .function("spectralCentroid", &maxiFFTAdaptor::spectralCentroid)
	    .function("getMagnitudesAsJSArray", &maxiFFTAdaptor::getMagnitudesAsJSArray)
	    .function("getMagnitudesDBAsJSArray", &maxiFFTAdaptor::getMagnitudesDBAsJSArray)
			.function("getPhasesAsJSArray", &maxiFFTAdaptor::getPhasesAsJSArray)

			.function("getNumBins", &maxiFFTAdaptor::getNumBins)
			.function("getFFTSize", &maxiFFTAdaptor::getFFTSize)
			.function("getHopSize", &maxiFFTAdaptor::getHopSize)
			.function("getWindowSize", &maxiFFTAdaptor::getWindowSize)

			;

	  enum_<maxiFFT::fftModes>("maxiFFTModes")
		.value("WITH_POLAR_CONVERSION", maxiFFT::fftModes::WITH_POLAR_CONVERSION)
	    .value("NO_POLAR_CONVERSION", maxiFFT::fftModes::NO_POLAR_CONVERSION)
	    ;


	  // MAXI IFFT
	  class_<maxiIFFTAdaptor>("maxiIFFTAdaptor")
	#ifdef SPN
				.smart_ptr_constructor("shared_ptr<maxiIFFTAdaptor>", &std::make_shared<maxiIFFTAdaptor>)
	#else
				.constructor<>()
	#endif
	    .function("setup", &maxiIFFTAdaptor::setup)
	    .function("process", &maxiIFFTAdaptor::process)
	    ;

		enum_<maxiIFFT::fftModes>("maxiIFFTModes")
	    .value("SPECTRUM", maxiIFFT::fftModes::SPECTRUM)
	    .value("COMPLEX", maxiIFFT::fftModes::COMPLEX)
	    ;

			// MAXI MFCC
		  class_<maxiMFCCAdaptor>("maxiMFCCAdaptor")
		#ifdef SPN
					.smart_ptr_constructor("shared_ptr<maxiMFCCAdaptor>", &std::make_shared<maxiMFCCAdaptor>)
		#else
					.constructor<>()
		#endif
		    .function("setup", &maxiMFCCAdaptor::setup)
		    .function("mfcc", &maxiMFCCAdaptor::mfcc)
		    ;

}

#endif
