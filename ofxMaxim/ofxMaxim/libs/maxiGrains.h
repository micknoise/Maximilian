
#ifndef _MAXI_GRAINS_H
#define _MAXI_GRAINS_H
#include "maximilian.h"

#if defined(__APPLE_CC__)
#include "accelerate/accelerate.h"
//Mac users can uncommment the line below to use Apple's accelerate framework for calculating grains. This gives ~300% speed improvement and better sound quality, but doesn't work well on all machines.
//#define MAXIGRAINFAST  
#endif

#include <list>

typedef unsigned long ulong;

//window functions from http://en.wikipedia.org/wiki/Window_function#High-_and_moderate-resolution_windows

struct hannWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return 0.5 * (1.0 - cos((2.0 * PI * windowPos) / (windowLength - 1)));
	}
};

//this window can produce clicks
struct hammingWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return 0.54 - (0.46 * cos((2.0 * PI * windowPos) / (windowLength - 1)));
	}
};


struct cosineWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return sin((PI * windowPos) / (windowLength - 1));
	}
};

struct rectWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return 1;
	}
};

struct triangleWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return (2.0 / (windowLength-1.0)) * (((windowLength-1.0)/2.0) - fabs(windowPos - ((windowLength-1.0)/2.0)));
	}
};

struct triangleNZWinFunctor {
	//non zero end points
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return (2.0 / windowLength) * ((windowLength/2.0) - fabs(windowPos - ((windowLength-1.0)/2.0)));
	}
};

struct blackmanHarrisWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return 0.35875 - 
		(0.48829 * cos((2 * PI * windowPos) / (windowLength-1))) +
		(0.14128 * cos((4 * PI * windowPos) / (windowLength-1))) +
		(0.01168 * cos((6 * PI * windowPos) / (windowLength-1)));
	}
};

struct blackmanNutallWinFunctor {
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
		return 0.3635819 - 
		(0.4891775 * cos((2 * PI * windowPos) / (windowLength-1))) +
		(0.1365995 * cos((4 * PI * windowPos) / (windowLength-1))) +
		(0.0106411 * cos((6 * PI * windowPos) / (windowLength-1)));
	}
};

struct gaussianWinFunctor {
    maxiType gausDivisor;
    gaussianWinFunctor() {
        init(0.3);
    }
    gaussianWinFunctor(maxiType kurtosis) {
        init(kurtosis);
    }
    void init(maxiType kurtosis) {
        gausDivisor = (-2.0 * kurtosis * kurtosis);
    }
	inline maxiType operator()(ulong windowLength, ulong windowPos) {
        maxiType phase = ((windowPos / (maxiType) windowLength) - 0.5) * 2.0;
        return exp((phase * phase) / gausDivisor);
	}
};


template<typename F>
class maxiGrainWindowCache {
public:
	unsigned int cacheSize; 
	
	maxiGrainWindowCache() {
		cacheSize = maxiSettings::sampleRate / 2.0; //allocate mem for up to 500ms grains
		cache = (maxiType**)malloc(cacheSize * sizeof(maxiType*));
		for(int i=0; i < cacheSize; i++) {
			cache[i] = NULL;
		}
	}
	
	~maxiGrainWindowCache() {
		for(int i=0; i < cacheSize; i++) {
			if(NULL != cache[i]) {
				free(cache[i]);
			}
		}
        free(cache);
	}
	
	maxiType* getWindow(const unsigned int length) {
		if (NULL == cache[length]) {
			cache[length] = (maxiType*)malloc(length * sizeof(maxiType));
			for(int i=0; i < length; i++) {
				cache[length][i] = F()(length, i);
			}
		}
		return cache[length];
	}
	
private:
	maxiType** cache;
	
};

class maxiGrainBase {
public:
	virtual maxiType play() {}
    virtual ~maxiGrainBase() {}
	bool finished;
};

template<typename F, typename source=memSampleSource>
class maxiGrain : public maxiGrainBase {
public:
	source *sample;
    maxiType pos;
	maxiType dur;
	long sampleStartPos;
	long sampleIdx;
	long sampleDur;
	long sampleEndPos;
	maxiType freq;
	maxiType speed;
	maxiType inc;
	maxiType frequency;
	maxiType* window;
//    short* buffer;
#if defined(__APPLE_CC__) && defined(MAXIGRAINFAST)
//	maxiType* grainSamples;
#endif
	/*
	 position between 0.0 and 1.0
	 duration in seconds
	 */
	maxiGrain(source *sample, const maxiType position, const maxiType duration, const maxiType speed, maxiGrainWindowCache<F> *windowCache) :sample(sample), pos(position), dur(duration), speed(speed)
	{
//        buffer = sample->temp;
		sampleStartPos = sample->getLength() * pos;
		sampleDur = dur * (maxiType)sample->getSampleRate();
		sampleDurMinusOne = sampleDur - 1;
		sampleIdx = 0;
		finished = 0;
		freq = 1.0 / dur;
		sampleEndPos = min(sample->getLength(), sampleStartPos + sampleDur);
		frequency = freq * speed;		
		if (frequency > 0) {
			pos = sampleStartPos;
		}else{
			pos = sampleEndPos;
		}
        if (frequency != 0) {
            inc = sampleDur/(maxiSettings::sampleRate/frequency);
        }else
            inc = 0;
		window = windowCache->getWindow(sampleDur);
		
#if defined(__APPLE_CC__) && defined(MAXIGRAINFAST)
		//premake the grain using fast vector functions, and quadratic interpolation
//		maxiType *sourceData = (maxiType*)malloc(sampleDur * sizeof(maxiType));
//		short* buffer = (short *)sample->temp;
//		//convert sample to maxiType data
//		vDSP_vflt16D(buffer + sampleStartPos, 1, sourceData, 1, min(sampleDur, sample->length - sampleStartPos));
//		//todo: wraping code
//		
//		grainSamples = (maxiType*)malloc(sampleDur * sizeof(maxiType));
//		//make list of interpolation indexes
//		maxiType* interpIndexes = (maxiType*)malloc(sampleDur * sizeof(maxiType));
//		maxiType interpPos = sampleStartPos;
//		for(int i=0; i < sampleDur; i++) {
//			interpIndexes[i] = interpPos - sampleStartPos;
//			interpPos += fabs(inc);
//		}
//		vDSP_vqintD(sourceData, interpIndexes, 1, grainSamples, 1, sampleDur, sampleDur);
//		if (frequency < 0) {
//			vDSP_vrvrsD(grainSamples,1, sampleDur);
//		}
//		static maxiType divFactor = 32767.0;
//		vDSP_vsdivD(grainSamples, 1, &divFactor, grainSamples, 1, sampleDur);
//		vDSP_vmulD(grainSamples, 1, window, 1, grainSamples, 1, sampleDur);
//		delete sourceData, interpIndexes;		
#endif
	}
	
	~maxiGrain() {
#if defined(__APPLE_CC__) && defined(MAXIGRAINFAST)
		delete[] grainSamples;
#endif
	}
	
	inline maxiType play() {
		maxiType output = 0.0;
		if (!finished) {
#if defined(__APPLE_CC__) && defined(MAXIGRAINFAST)
//			output = grainSamples[sampleIdx];
#else
			envValue = window[sampleIdx];
			maxiType remainder;
            pos += inc;
            if (pos >= sample->getLength())
                pos -= sample->getLength();
            else if (pos < 0) 
                pos += sample->getLength();
            
            long posl = floor(pos);
            remainder = pos - posl;
            long a = posl;
            long b = posl+1;
            if (b >= sample->getLength()) {
                b = 0;
            }
            output = (maxiType) ((1-remainder) * sample[a] +
                               remainder * sample[b])/32767.0;//linear interpolation
			output *= envValue;
#endif
		}
		sampleIdx++;
		if (sampleIdx == sampleDur) finished = true;
		return output;
	}
	
protected:	   
	maxiGrain();	
	maxiType envValue;
	ulong sampleDurMinusOne;
};


typedef list<maxiGrainBase*> grainList;

class maxiGrainPlayer {
public:
	grainList grains;
//	maxiSample *sample;
	
//	maxiGrainPlayer(maxiSample *sample) : sample(sample) {
//	}
	
	void addGrain(maxiGrainBase *g) {
		grains.push_back(g);
	}
	
	inline maxiType play() {
		maxiType total = 0.0;		
        grainList::iterator it = grains.begin();
		while(it != grains.end()) {
			total += (*it)->play();
			if ((*it)->finished) {
				delete(*it);
				it = grains.erase(it);
			}else{
                it++;
            }
		}
		return total;
	}
};

//and here's maxiPitchStretch. Args to the play function are basically speed for 'pitch' and rate for playback rate.
//the rest is the same.

template<typename F, typename source=memSampleSource>
class maxiPitchStretch {
public:
	maxiType position;
	source *sample;
	maxiGrainPlayer *grainPlayer;
	maxiGrainWindowCache<F> windowCache;
	maxiType randomOffset;
    long loopStart, loopEnd, loopLength;
    maxiType looper;
	
	maxiPitchStretch(source *sample) : sample(sample) {
		grainPlayer = new maxiGrainPlayer(sample);
		randomOffset=0;
        loopStart = 0.0;
        loopEnd = sample->getLength();
        loopLength =sample->getLength();
		position=0;
        looper = 0;
	}
    
    maxiType getNormalisedPosition() {
        return position / (maxiType) sample->length;
    }
    
    maxiType getPosition() {
        return position;
    }
    
    void setPosition(maxiType pos) {
        position = pos * sample->getLength();
        position = maxiMap::clamp<maxiType>(position, 0, sample->getLength()-1);
    }
    
    void setLoopStart(maxiType val) {
        loopStart = val * sample->getLength();
        loopLength = loopEnd - loopStart;
    }
    
    void setLoopEnd(maxiType val) {
        loopEnd = val * sample->length;
        loopLength = loopEnd - loopStart;
    }
	
	~maxiPitchStretch() {
		delete grainPlayer;
	}
	
	inline maxiType play(maxiType speed, maxiType rate, maxiType grainLength, int overlaps, maxiType posMod=0.0) {
		position = position + (1 * rate);
        looper++;
		if (position >= loopEnd) position-= loopLength;
		if (position < loopStart) position += loopLength;
		maxiType cycleLength = grainLength * maxiSettings::sampleRate  / overlaps;
        if (looper > cycleLength + randomOffset) {
            looper -= (cycleLength + randomOffset);
			maxiGrain<F, source> *g = new maxiGrain<F>(sample, max(min(1.0, (position / sample->length) + posMod),0.0), grainLength, speed, &windowCache);
			grainPlayer->addGrain(g);
            randomOffset = rand() % 10;
		}
		return grainPlayer->play();
	}
	
};


//template<typename F>
//class maxiTimestretch {
//protected:
//    maxiType position;
//public:
//	maxiSample *sample;
//	maxiGrainPlayer *grainPlayer;
//	maxiGrainWindowCache<F> windowCache;
//	maxiType randomOffset;
//    maxiType looper;
//	
//
//	
//	maxiTimestretch(maxiSample *sample) : sample(sample) {
//		position=0;
//        looper = 0;
//		grainPlayer = new maxiGrainPlayer(sample);
//		randomOffset=0;
//	}
//	
//	~maxiTimestretch() {
//		delete grainPlayer;
//	}
//    
//    maxiType getNormalisedPosition() {
//        return position / (maxiType) sample->length;
//    }
//    
//    maxiType getPosition() {
//        return position;
//    }
//    
//    void setPosition(maxiType pos) {
//        position = pos * sample->length;
//        position = maxiMap::clamp<maxiType>(position, 0, sample->length-1);
//    }
//
//	
//	//play at a speed
//    inline maxiType play(maxiType speed, maxiType grainLength, int overlaps, maxiType posMod=0.0) {
//		position = position + speed;
//        looper++;
//		if (position > sample->length) position-= sample->length;
//		if (position < 0) position += sample->length;
//		maxiType cycleLength = grainLength * maxiSettings::sampleRate  / overlaps;
//        if (looper > cycleLength + randomOffset) {
//            looper -= (cycleLength + randomOffset);
//			speed = (speed > 0 ? 1 : -1);
//			maxiGrain<F> *g = new maxiGrain<F>(sample, max(min(1.0,(position / sample->length) + posMod),0.0), grainLength, speed, &windowCache);			
//			grainPlayer->addGrain(g);
//			randomOffset = rand() % 10;
//		}
//		return grainPlayer->play();
//	}
//	
//    
//    //provide your own position iteration
//	inline maxiType play2(maxiType pos, maxiType grainLength, int overlaps) {
//		looper++;
//		pos *= sample->length;
//		if (0 == floor(fmod(looper, grainLength * maxiSettings::sampleRate / overlaps))) {
//			maxiGrain<F> *g = new maxiGrain<F>(sample, max(min(1.0,(pos / sample->length)),0.0), grainLength, 1, &windowCache);			
//			grainPlayer->addGrain(g);
//		}
//		return grainPlayer->play();
//	}
//};

//in maxiTimeStretch, the speed is either 1 or -1, and the actual speed value only affects the grain position
//in maxiPitchShift, speed is uncoupled from position and allowed to set it's value incrementally, resulting in pitchshift.
//with both high speed values and negative speed values there are some terrific artefacts! 

//template<typename F>
//class maxiPitchShift {
//public:
//	maxiType position;
//	long cycles;
//	maxiSample *sample;
//	maxiGrainPlayer *grainPlayer;
//	maxiGrainWindowCache<F> windowCache;
//	maxiType randomOffset;
//	
//	maxiPitchShift(maxiSample *sample) : sample(sample) {
//		position=0;
//		cycles=0;
//		grainPlayer = new maxiGrainPlayer(sample);
//		randomOffset=0;
//	}
//	
//	~maxiPitchShift() {
//		delete grainPlayer;
//	}
//	
//	maxiType play(maxiType speed, maxiType grainLength, int overlaps, maxiType posMod=0.0) {
//		position = position + 1;
//		cycles++;
//		if (position > sample->length) position=0;
//		if (position < 0) position = sample->length;
//		maxiType cycleLength = grainLength * maxiSettings::sampleRate  / overlaps;
//		maxiType cycleMod = fmod(cycles, cycleLength + randomOffset);
//		if (0 == floor(cycleMod)) {
//			//			cout << cycleMod << endl;
//			//speed = (speed > 0 ? 1 : -1);
//			speed = speed - ((cycleMod / cycleLength) * 0.1);
//			maxiGrain<F> *g = new maxiGrain<F>(sample, max(min(1.0,(position / sample->length) + posMod),0.0), grainLength, speed, &windowCache);			
//			grainPlayer->addGrain(g);
//			//			cout << grainPlayer->grains.size() << endl;
//			//			randomOffset = rand() % 10;
//			//			randomOffset = rand() % 10;
//		}
//		return grainPlayer->play();
//	}
//	
//};


#endif
