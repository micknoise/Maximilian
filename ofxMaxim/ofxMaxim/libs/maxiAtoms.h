/*
 *  gabor.h
 *  mp
 *
 *  Created by Chris on 01/11/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */


#ifdef __APPLE_CC__
#include "TargetConditionals.h"
#endif

#define USEOPENCL 0
#define OSXOPENCL TARGET_OS_MAC && !TARGET_OS_IPHONE && USEOPENCL

#include <iostream>
#include "maximilian.h"
#include <list>
#include <vector>
#include <valarray>
#include <map>
#if OSXOPENCL
#include "maxiAtomKernel.h"
#endif
#include <set>


using namespace std;

enum maxiAtomTypes {
	GABOR
};

struct maxiAtom {
	maxiAtomTypes atomType;
	float length;
	float position;
	float amp;
	static bool atomSortPositionAsc(maxiAtom* a, maxiAtom* b) {return a->position < b->position;}
};

struct maxiGaborAtom : maxiAtom {
	maxiType frequency;
	maxiType phase;
};


class maxiAtomWindowCache {
public:
    float * getWindow(int length);
protected:
    map<int, valarray<float> > windows;
};

//queue atoms into an audio stream
class maxiAccelerator {
public:
	maxiAccelerator();
//	void addAtom(valarray<maxiType> &atom, long offset=0);
    void addAtom(const maxiType freq, const maxiType phase, const maxiType sampleRate, const unsigned int length, const maxiType amp, const unsigned int offset);
	void fillNextBuffer(float *buffer, unsigned int bufferLength);
#if OSXOPENCL
	void fillNextBuffer_OpenCL(float *buffer, unsigned int bufferLength);
	void fillNextBuffer_OpenCLBatch(float *buffer, unsigned int bufferLength);
	void fillNextBuffer_OpenCLBatch2(float *buffer, unsigned int bufferLength);
	void fillNextBuffer_OpenCLBatchTest(float *buffer, unsigned int bufferLength);
#endif
	inline long getSampleIdx(){return sampleIdx;}
    inline maxiAccelerator& setShape(maxiType val) {shape = val; return *this;}
    inline maxiAccelerator& setAtomCountLimit(int val){atomCountLimit = val; return *this;}
    void precacheWindows(set<int> &windowSizes);
    inline int getAtomCount() {return atomQueue.size();}
private:
	long sampleIdx;
	struct queuedAtom {
//        valarray<float> atom;
		long startTime;
		float phase;
        unsigned int length;
        float amp;
        float pos;
        float freq;
//        int offset;
        float *env;
        float phaseInc;
        float maxPhase;
	};
	typedef list<queuedAtom> queuedAtomList;
	queuedAtomList atomQueue;
    valarray<float> gabor;
    maxiAtomWindowCache winCache;
    float shape;
    int atomCountLimit;
#if OSXOPENCL
    maxiAtomKernel clKernel;
    std::vector<structAtomData> atomDataBlock;
#endif
    std::vector<float> atomAmps, atomPhases, atomPhaseIncs;
    std::vector<int> atomPositions, atomLengths;
};

/*load a book in MPTK XML format
 http://mptk.irisa.fr/
 
 how to create a book:
 mpd -n 1000 -R 10 -d ./dic_gabor_two_scales.xml glockenspiel.wav book.xml
*/
class maxiAtomBook {
public:
	~maxiAtomBook();
	typedef vector<maxiAtom*> maxiAtomBookData;
    int numSamples;
	int sampleRate;
    float maxAmp;
	maxiAtomBookData atoms;
    set<int> windowSizes;
	static bool loadMPTKXmlBook(string filename, maxiAtomBook &book, maxiAccelerator &accel, bool verbose = false);
	int getIndexOfAtomBefore(float pos);
	int getIndexOfAtomAfter(float pos);
    std::map<int, int> bookIndex;
    int bookIntervalCount;
};

class maxiAtomBookPlayer {
public:
	maxiAtomBookPlayer();
    void setBook(maxiAtomBook &newBook);
	void play(maxiAccelerator &atomStream);
    inline maxiAtomBookPlayer &setLengthMod(maxiType val) {lengthMod = val; return *this;}
    inline maxiAtomBookPlayer &setFreqMod(maxiType val) {freqMod = val; return *this;}
    inline maxiAtomBookPlayer &setProbability(maxiType val) {probability = val; return *this;}
    inline maxiAtomBookPlayer &setLowFreq(maxiType val) {lowFreq = val; return *this;}
    inline maxiAtomBookPlayer &setHighFreq(maxiType val) {highFreq = val; return *this;}
    inline maxiAtomBookPlayer &setLowAmp(maxiType val) {lowAmp = val; return *this;}
    inline maxiAtomBookPlayer &setHighAmp(maxiType val) {highAmp = val; return *this;}
    inline maxiAtomBookPlayer &setPlaybackSpeed(maxiType val) {playbackSpeed = val; return *this;}
    inline maxiAtomBookPlayer &setGap(maxiType val) {gap = val; return *this;}
    inline maxiAtomBookPlayer &setSnapRange(maxiType val){snapRange = val; snapInvRange = 1.0 / snapRange; return *this;}
    inline maxiAtomBookPlayer &setSnapFreqs(vector<float> &freqs){snapFreqs = freqs; return *this;}
    inline maxiAtomBookPlayer &setFrequencyEnvelopingOn(bool val) {frequencyEnvelopeOn = val; return *this;}
    maxiAtomBookPlayer &setFrequencyEnvelope(int size, float * bins);
    maxiAtomBookPlayer &setLoopStart(float val);
    maxiAtomBookPlayer &setLoopEnd(float val);
    maxiAtomBookPlayer &setLoopLength(float val);
    maxiAtomBookPlayer &moveLoopTo(float val);
    maxiAtomBookPlayer &setBlurWidth(float val);
    maxiAtomBookPlayer &resetAt(int timePos) {resetTime = timePos; return *this;}
    
protected:
    void queueAtomsBetween(maxiAccelerator &atomStream, long start, long end, int blockOffset);
    maxiAtomBook book;
	maxiType atomIdx;
    maxiType lengthMod;
    maxiType probability;
    maxiType lowFreq, highFreq;
    maxiType lowAmp, highAmp;
    maxiType freqMod;
    maxiType playbackSpeed;
    maxiType gap;
    double loopedSamplePos;
    vector<float> snapFreqs;
    maxiType snapRange, snapInvRange;
    maxiType loopStart, loopEnd, loopLength, loopStartAtomIdx, loopEndAtomIdx;
    maxiType blurWidth;
    long blurSizeAtoms;
    int resetTime;
    void resetAtomPosition();
    bool frequencyEnvelopeOn;
    vector<float> frequencyEnvelope;
};

