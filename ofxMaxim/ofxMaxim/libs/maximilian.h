/*
 *  maximilian.h
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

/*
 Feature request:
 maxiNANINFAlarm
 maxiLimiter
 */

#ifndef MAXIMILIAN_H
#define MAXIMILIAN_H

//#define MAXIMILIAN_PORTAUDIO
#define MAXIMILIAN_RT_AUDIO

/*  Maximilian can be configured to load ogg vorbis format files using the
 *   loadOgg() method.
 *   Uncomment the following to include Sean Barrett's Ogg Vorbis decoder.
 *   If you're on windows, make sure to add the files std_vorbis.c and std_vorbis.h to your project*/
//#define VORBIS

/*
 Floating point precision.  Maximilian runs in double precision by default, for increased sound quality. 
 There may be situations where single precision is required, such as if you improve performance on a mobile device.
 To compile using single precision, define MAXI_SINGLE_PRECISION either here or preferably in your project settings. For example in XCode,
 add -DMAXI_SINGLE_PRECISION to the 'C++ flags'. 
 */
#ifdef MAXI_SINGLE_PRECISION
#define maxiType float
#else
#define maxiType double
#endif

#include <iostream>
#include <fstream>
#include <string.h>
#include <cstdlib>
#include "math.h"
#include <valarray>
#include "ofMain.h" //using ofThread in fileSampleSource

using namespace std;
#ifndef PI
#define PI  3.1415926535897932384626433832795
#endif
#define TWOPI 6.283185307179586476925286766559

class maxiSettings {
public:
	static int sampleRate;
	static int channels;
	static int bufferSize;
	static void setup(int initSampleRate, int initChannels, int initBufferSize) {
		maxiSettings::sampleRate = initSampleRate;
		maxiSettings::channels = initChannels;
		maxiSettings::bufferSize = initBufferSize;
        cout << "Maximilian settings:\n\tSample Rate:\t\t" << initSampleRate << "\n\tChannels:\t\t" << initChannels
                << "\n\tBuffer size:\t\t" << initBufferSize << "\n\tPrecision:\t\t" <<
#ifdef MAXI_SINGLE_PRECISION
        "single"
#else
        "double"
#endif
        << "\n";
	}
};


class maxiOsc {
	
	maxiType frequency;
	maxiType phase;
	maxiType startphase;
	maxiType endphase;
	maxiType output;
	maxiType tri;
	
	
public:
	maxiOsc();
	maxiType sinewave(maxiType frequency);
	maxiType coswave(maxiType frequency);
	maxiType phasor(maxiType frequency);
	maxiType phasor(maxiType frequency, maxiType startphase, maxiType endphase);
	maxiType saw(maxiType frequency);
	maxiType triangle(maxiType frequency);
	maxiType square(maxiType frequency);
	maxiType pulse(maxiType frequency, maxiType duty);
	maxiType noise();
	maxiType sinebuf(maxiType frequency);
	maxiType sinebuf4(maxiType frequency);
	void phaseReset(maxiType phaseIn);
    maxiType sawn(maxiType frequency);    
	
};


class maxiEnvelope {
	
	maxiType period;
	maxiType output;
	maxiType startval;
	maxiType currentval;
	maxiType nextval;
	int isPlaying;

public:	
	maxiType line(int numberofsegments,maxiType segments[100]);
	void trigger(int index,maxiType amp);
	int valindex;
	maxiType amplitude;
	
};


class maxiDelayline {
	maxiType frequency;
	int phase;
	maxiType startphase;
	maxiType endphase;
	maxiType output;
	maxiType memory[88200];
	
public:
	maxiDelayline();
	maxiType dl(maxiType input, int size, maxiType feedback);
	maxiType dl(maxiType input, int size, maxiType feedback, int position);
	
	
};


class maxiFilter { 	
	maxiType gain;
	maxiType input;
	maxiType output;
	maxiType inputs[10];
	maxiType outputs[10];
	maxiType cutoff1;
	maxiType x;//speed
	maxiType y;//pos
	maxiType z;//pole
	maxiType c;//filter coefficient
    
public:
	maxiFilter():x(0.0), y(0.0), z(0.0), c(0.0){};
	maxiType cutoff;
	maxiType resonance;
	maxiType lores(maxiType input,maxiType cutoff1, maxiType resonance);
	maxiType hires(maxiType input,maxiType cutoff1, maxiType resonance);
	maxiType bandpass(maxiType input,maxiType cutoff1, maxiType resonance);
	maxiType lopass(maxiType input,maxiType cutoff);
	maxiType hipass(maxiType input,maxiType cutoff);
	
};

class maxiMix  {
	maxiType input;
	maxiType two[2];
	maxiType four[4];
	maxiType eight[8];
public:
	maxiType x;
	maxiType y;
	maxiType z;
	maxiType *stereo(maxiType input,maxiType two[2],maxiType x);
	maxiType *quad(maxiType input,maxiType four[4], maxiType x,maxiType y);
	maxiType *ambisonic(maxiType input,maxiType eight[8],maxiType x,maxiType y, maxiType z);
	
};

//lagging with an exponential moving average
//a lower alpha value gives a slower lag
template <class T> 
class maxiLagExp {
public:
	T alpha, alphaReciprocal;
	T val;
	
	maxiLagExp() {
		init(0.5, 0.0);
	};
	
	maxiLagExp(T initAlpha, T initVal) {
		init(initAlpha, initVal);
	}
	
	void init(T initAlpha, T initVal) {
		alpha = initAlpha;
		alphaReciprocal = 1.0 - alpha;
		val = initVal;
	}
	
	inline void addSample(T newVal) {
		val = (alpha * newVal) + (alphaReciprocal * val);
	}
	
	inline T value() {
		return val;
	}
};

class sampleSource {
public:
    virtual bool load(string filename, int channel);
    virtual bool save(string filename);
    virtual void unload();
    virtual short& operator[](const long idx) = 0;
    virtual string getSummary();
    virtual long getLength();
    virtual void setLength(unsigned long newLength) ;
    virtual void clear();
    virtual void trim(unsigned long start, unsigned long end);
    virtual int getSampleRate();
    virtual ~sampleSource() {};
};

class memSampleSource : public sampleSource {
public:
    memSampleSource() : sampleSource(), mySampleRate(maxiSettings::sampleRate), length(0), myChannels(1) {}
    bool load(const string filename, const int channel = 0);
    bool save(const string filename);
    void unload();
    short& operator[](const long idx);
    string getSummary();
    long getLength();
    void setLength(unsigned long newLength);
    void clear();
    void trim(unsigned long start, unsigned long end);
    virtual int getSampleRate();
    ~memSampleSource();
protected:
    std::valarray<short> data;
	int myChunkSize;
	int	mySubChunk1Size;
	short myFormat;
	int myByteRate;
	short myBlockAlign;
	short myBitsPerSample;
	int	myDataSize;
	short myChannels;
	int mySampleRate;
    long length;
    
    
};

inline short& memSampleSource::operator[](const long idx) {
    return data[idx];
};

inline long memSampleSource::getLength() {
    return length;
};

inline int memSampleSource::getSampleRate() {
    return mySampleRate;
}


#ifdef VORBIS
class oggSampleSource : public memSampleSource {
public:
    bool load(const string filename, const int channel = 0);
    bool save(const string filename);
protected:
};
#endif

/*
 buffer a file from file storage, using a producer-consumer setup.
 bufferSize is in bytes - this is how much memory the class is using. Increase if you experience glitches
 threadSleepTime is in millisecond, make sure it's low enough so the producer thread can keep up with the playback
 */
class fileSampleSource : public sampleSource, private ofThread {
public:
    fileSampleSource() : sampleSource(), length(1), diffFwd(0), diffRv(0), bufferSize(maxiSettings::sampleRate), blockSize(1024), threadSleepTime(20) {}
    bool load(const string filename, const int channel, int bufferSize, int blockSize, int threadSleepTime);
    bool load(const string filename, const int channel = 0);
    void unload();
    short& operator[](const long idx);
    long getLength();
    virtual int getSampleRate();
    fileSampleSource& operator=(const fileSampleSource &src);
    ~fileSampleSource();
protected:
    void threadedFunction();
    std::valarray<short> data, frame;
    ifstream inFile;
	short numChannels;
    int channel;
    int bufferSize;
    long filePos, fileStartPos, fileEndPos, fileLength, fileWinStartPos, fileWinEndPos, fileWinCenter;
    int bufferPos;
    int bufferCenter;
    long fileCenterPos;
	int mySampleRate;
    long length;
    string filename;
    int blockSize;
    int threadSleepTime;
    
    int diffFwd, diffRv;
private:
};

template<class source = memSampleSource>
class maxiSampler  {
	
private:
	string 	myPath;
    maxiType speed;
	maxiType output;
    maxiLagExp<maxiType> loopRecordLag;
    source samples;
	
public:
	maxiType position, recordPosition;

	inline long getLength() {return samples.getLength();}
    
    void setLength(unsigned long numSamples);  
	
	~maxiSampler(){}
	
	maxiSampler() : position(0), recordPosition(0), myPath("sample.wav") {};
    
    maxiSampler<source>& operator=(const maxiSampler<source> &src);
    
	bool load(string fileName, int channel=0);
    
	void trigger();
	
    void loopRecord(maxiType newSample, const bool recordEnabled, const maxiType recordMix, maxiType start = 0.0, maxiType end = 1.0);
    
    void clear();
    
    void reset();
	
	maxiType play();

    maxiType playLoop(maxiType start, maxiType end); // start and end are between 0.0 and 1.0
	
	maxiType playOnce();
	
	maxiType playOnce(maxiType speed);

    void setPosition(maxiType newPos); // between 0.0 and 1.0
    
    maxiType playUntil(maxiType end);
	
	maxiType play(maxiType speed);
	
	maxiType play(maxiType frequency, maxiType start, maxiType end, maxiType &pos);
	
	maxiType play(maxiType frequency, maxiType start, maxiType end);
	
	maxiType play4(maxiType frequency, maxiType start, maxiType end);
	
	maxiType bufferPlay(unsigned char &bufferin,long length);
	
	maxiType bufferPlay(unsigned char &bufferin,maxiType speed,long length);
	
	maxiType bufferPlay(unsigned char &bufferin,maxiType frequency, maxiType start, maxiType end);
	
	maxiType bufferPlay4(unsigned char &bufferin,maxiType frequency, maxiType start, maxiType end);

    bool hasEnded();
    
    bool save();
	bool save(string filename);
    
	// return a printable summary of the wav file
	string getSummary();
    
    void normalise(float maxLevel = 0.99);  //0 < maxLevel < 1.0
    void autoTrim(float alpha = 0.3, float threshold = 6000, bool trimStart = true, bool trimEnd = true); //alpha of lag filter (lower == slower reaction), threshold to mark start and end, < 32767
};

typedef maxiSampler<memSampleSource> maxiSample;
#ifdef VORBIS
typedef maxiSampler<oggSampleSource> maxiOggSample;
#endif
typedef maxiSampler<fileSampleSource> maxiFileSample;

class maxiMap {
public:
	static maxiType inline linlin(maxiType val, maxiType inMin, maxiType inMax, maxiType outMin, maxiType outMax) {
		val = max(min(val, inMax), inMin);
		return ((val - inMin) / (inMax - inMin) * (outMax - outMin)) + outMin;
	}
	
	static maxiType inline linexp(maxiType val, maxiType inMin, maxiType inMax, maxiType outMin, maxiType outMax) {
		//clipping
		val = max(min(val, inMax), inMin);
		return pow((outMax / outMin), (val - inMin) / (inMax - inMin)) * outMin;
	}
	
	static maxiType inline explin(maxiType val, maxiType inMin, maxiType inMax, maxiType outMin, maxiType outMax) {
		//clipping
		val = max(min(val, inMax), inMin);
		return (log(val/inMin) / log(inMax/inMin) * (outMax - outMin)) + outMin;
	}

    //changed to templated function, e.g. maxiMap::maxiClamp<int>(v, l, h);
    template<typename T>
	static T inline clamp(T v, const T low, const T high) {
        if (v > high)
            v = high;
        else if (v < low) {
            v = low;
        }
		return v;
	}
	
    template<typename T>
    static T wrapUp(T val, T highLimit, T range) {
        return val >= highLimit ? val - range : val;
    }

    template<typename T>
    static T wrapDown(T val, T lowLimit, T range) {
        return val < lowLimit ? val + range : val;
    }

    
};

class maxiDyn {
public:
	maxiType gate(maxiType input, maxiType threshold=0.9, long holdtime=1, maxiType attack=1, maxiType release=0.9995);
	maxiType compressor(maxiType input, maxiType ratio, maxiType threshold=0.9, maxiType attack=1, maxiType release=0.9995);
	maxiType input;
	maxiType ratio;
	maxiType currentRatio;
	maxiType threshold;
	maxiType output;
	maxiType attack;
	maxiType release;
	maxiType amplitude;
	long holdtime;
	long holdcount;
	int attackphase,holdphase,releasephase;
};

class maxiEnv {
public:
	maxiType ar(maxiType input, maxiType attack=1, maxiType release=0.9, long holdtime=1, int trigger=0);
	maxiType adsr(maxiType input, maxiType attack=1, maxiType decay=0.99, maxiType sustain=0.125, maxiType release=0.9, long holdtime=1, int trigger=0);
	maxiType input;
	maxiType output;
	maxiType attack;
	maxiType decay;
	maxiType sustain;
	maxiType release;
	maxiType amplitude;
	int trigger;
	long holdtime;
	long holdcount;
	int attackphase,decayphase,sustainphase,holdphase,releasephase;
};

class convert {
public:
	maxiType mtof(int midinote);
};



class maxiDistortion {
public:
    /*atan distortion, see http://www.musicdsp.org/showArchiveComment.php?ArchiveID=104*/
    /*shape from 1 (soft clipping) to infinity (hard clipping)*/
    maxiType atanDist(const maxiType in, const maxiType shape);
    maxiType fastAtanDist(const maxiType in, const maxiType shape);
    maxiType fastatan( maxiType x );
};


class maxiFlanger {
public:
    //delay = delay time - ~800 sounds good
    //feedback = 0 - 1
    //speed = lfo speed in Hz, 0.0001 - 10 sounds good
    //depth = 0 - 1
    maxiType flange(const maxiType input, const unsigned int delay, const maxiType feedback, const maxiType speed, const maxiType depth);
    maxiDelayline dl;
    maxiOsc lfo;

};

class maxiChorus {
public:
    //delay = delay time - ~800 sounds good
    //feedback = 0 - 1
    //speed = lfo speed in Hz, 0.0001 - 10 sounds good
    //depth = 0 - 1
    maxiType chorus(const maxiType input, const unsigned int delay, const maxiType feedback, const maxiType speed, const maxiType depth);
    maxiDelayline dl, dl2;
    maxiOsc lfo;
    maxiFilter lopass;
    
};

class maxiEnvelopeFollower {
public:
    maxiEnvelopeFollower();
    maxiEnvelopeFollower& setAttack(maxiType attackMS);
    maxiEnvelopeFollower& setRelease(maxiType releaseMS);
    maxiType play(maxiType input);
	void reset();
    maxiType getEnv();
    void setEnv(maxiType val);
protected:
    maxiType attack, release, env;
};

//from https://ccrma.stanford.edu/~jos/filters/DC_Blocker_Software_Implementations.html
class maxiDCBlocker {
public:
    maxiType xm1, ym1;
    maxiDCBlocker() : xm1(0), ym1(0) {}
    inline maxiType play(maxiType input, maxiType R);
};

/*
 State Variable Filter
 
 algorithm from  http://www.cytomic.com/files/dsp/SvfLinearTrapOptimised.pdf
 usage:
 either set the parameters separately as required (to save CPU)
 
 filter.setCutoff(param1);
 filter.setResonance(param2);
 
 w = filter.play(w, 0.0, 1.0, 0.0, 0.0);
 
 or set everything together at once
 
 w = filter.setCutoff(param1).setResonance(param2).play(w, 0.0, 1.0, 0.0, 0.0);
 
 */
class maxiSVF {
public:
    maxiSVF() : v0z(0), v1(0), v2(0) { setParams(1000, 1);}
    
    //20 < cutoff < 20000
    maxiSVF& setCutoff(maxiType cutoff);
    
    //from 0 upwards, starts to ring from 2-3ish, cracks a bit around 10
    maxiSVF& setResonance(maxiType q);
    
    //run the filter, and get a mixture of lowpass, bandpass, highpass and notch outputs
    maxiType play(maxiType w, maxiType lpmix, maxiType bpmix, maxiType hpmix, maxiType notchmix);
    
private:
    void setParams(maxiType _freq, maxiType _res);
    
    maxiType v0z, v1, v2, g, damping, k, ginv, g1, g2, g3 ,g4;
    maxiType freq, res;
    
};

/*
 Bit quantisation and downsampling
 bitdepth: this can be a floating point value. Try between 0.5 and 32. More pronounced in low ranges.
 sampleHoldCount: the number of frames to wait before updating the output.  1 = no effect, 2 = half sample rate, 3 = 0.333 * sample rate etc
 */
class maxiBitCrusher {
public:
    maxiBitCrusher();
    maxiBitCrusher& setBitDepth(const maxiType bitdepth);
    maxiBitCrusher& setSampleHoldCount(const unsigned int val);
    maxiType play(const maxiType val);
protected:
    maxiType bitRange;
    maxiType holdVal;
    unsigned int sampleHoldCount;
    unsigned int counter;
};

/*
 A simple limiter based on the envelope follower. Use like this:
 limiter.setLimit(0.9).setAttack(10).setRelease(100);
 w = limiter.play(w);
 */
class maxiLimiter : public maxiEnvelopeFollower {
public:
    maxiLimiter();
    maxiType play(const maxiType val);
    maxiLimiter& setLimit(maxiType val);
protected:
    maxiType limit;
};

#endif
