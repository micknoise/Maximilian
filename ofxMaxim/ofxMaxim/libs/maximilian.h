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
	}
};


class maxiOsc {
	
	double frequency;
	double phase;
	double startphase;
	double endphase;
	double output;
	double tri;
	
	
public:
	maxiOsc();
	double sinewave(double frequency);
	double coswave(double frequency);
	double phasor(double frequency);
	double phasor(double frequency, double startphase, double endphase);
	double saw(double frequency);
	double triangle(double frequency);
	double square(double frequency);
	double pulse(double frequency, double duty);
	double noise();
	double sinebuf(double frequency);
	double sinebuf4(double frequency);
	void phaseReset(double phaseIn);
    double sawn(double frequency);    
	
};


class maxiEnvelope {
	
	double period;
	double output;
	double startval;
	double currentval;
	double nextval;
	int isPlaying;

public:	
	double line(int numberofsegments,double segments[100]);
	void trigger(int index,double amp);
	int valindex;
	double amplitude;
	
};


class maxiDelayline {
	double frequency;
	int phase;
	double startphase;
	double endphase;
	double output;
	double memory[88200];
	
public:
	maxiDelayline();
	double dl(double input, int size, double feedback);
	double dl(double input, int size, double feedback, int position);
	
	
};


class maxiFilter { 	
	double gain;
	double input;
	double output;
	double inputs[10];
	double outputs[10];
	double cutoff1;
	double x;//speed
	double y;//pos
	double z;//pole
	double c;//filter coefficient
    
public:
	maxiFilter():x(0.0), y(0.0), z(0.0), c(0.0){};
	double cutoff;
	double resonance;
	double lores(double input,double cutoff1, double resonance);
	double hires(double input,double cutoff1, double resonance);
	double bandpass(double input,double cutoff1, double resonance);
	double lopass(double input,double cutoff);
	double hipass(double input,double cutoff);
	
};

class maxiMix  {
	double input;
	double two[2];
	double four[4];
	double eight[8];
public:
	double x;
	double y;
	double z;
	double *stereo(double input,double two[2],double x);
	double *quad(double input,double four[4], double x,double y);
	double *ambisonic(double input,double eight[8],double x,double y, double z);
	
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
    virtual short& operator[](const int idx) = 0;
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
    short& operator[](const int idx);
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

inline short& memSampleSource::operator[](const int idx) {
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

class fileSampleSource : public sampleSource, private ofThread {
public:
    fileSampleSource() : sampleSource(), length(1), bufferSize(maxiSettings::sampleRate), diffFwd(0), diffRv(0) {}
    bool load(const string filename, const int channel = 0);
    void unload();
    short& operator[](const int idx);
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
    unsigned long filePos, fileStartPos, fileEndPos, fileLength, fileWinStartPos, fileWinEndPos, fileWinCenter;
    int bufferPos;
    int bufferCenter;
    unsigned long fileCenterPos;
	int mySampleRate;
    long length;
    string filename;
    int blockSize;
    
    int diffFwd, diffRv;
private:
};

template<class source = memSampleSource>
class maxiSampler  {
	
private:
	string 	myPath;
    double speed;
	double output;
    maxiLagExp<double> loopRecordLag;
    source samples;
	
public:
	double position, recordPosition;

	inline long getLength() {return samples.getLength();}
    
    void setLength(unsigned long numSamples);  
	
	~maxiSampler(){}
	
	maxiSampler() : position(0), recordPosition(0), myPath("sample.wav") {};
    
    maxiSampler<source>& operator=(const maxiSampler<source> &src);
    
	bool load(string fileName, int channel=0);
    
	void trigger();
	
    void loopRecord(double newSample, const bool recordEnabled, const double recordMix, double start = 0.0, double end = 1.0);
    
    void clear();
    
    void reset();
	
	double play();

    double playLoop(double start, double end); // start and end are between 0.0 and 1.0
	
	double playOnce();
	
	double playOnce(double speed);

    void setPosition(double newPos); // between 0.0 and 1.0
    
    double playUntil(double end);
	
	double play(double speed);
	
	double play(double frequency, double start, double end, double &pos);
	
	double play(double frequency, double start, double end);
	
	double play4(double frequency, double start, double end);
	
	double bufferPlay(unsigned char &bufferin,long length);
	
	double bufferPlay(unsigned char &bufferin,double speed,long length);
	
	double bufferPlay(unsigned char &bufferin,double frequency, double start, double end);
	
	double bufferPlay4(unsigned char &bufferin,double frequency, double start, double end);

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
	static double inline linlin(double val, double inMin, double inMax, double outMin, double outMax) {
		val = max(min(val, inMax), inMin);
		return ((val - inMin) / (inMax - inMin) * (outMax - outMin)) + outMin;
	}
	
	static double inline linexp(double val, double inMin, double inMax, double outMin, double outMax) {
		//clipping
		val = max(min(val, inMax), inMin);
		return pow((outMax / outMin), (val - inMin) / (inMax - inMin)) * outMin;
	}
	
	static double inline explin(double val, double inMin, double inMax, double outMin, double outMax) {
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
 
    
};

class maxiDyn {
public:
	double gate(double input, double threshold=0.9, long holdtime=1, double attack=1, double release=0.9995);
	double compressor(double input, double ratio, double threshold=0.9, double attack=1, double release=0.9995);
	double input;
	double ratio;
	double currentRatio;
	double threshold;
	double output;
	double attack;
	double release;
	double amplitude;
	long holdtime;
	long holdcount;
	int attackphase,holdphase,releasephase;
};

class maxiEnv {
public:
	double ar(double input, double attack=1, double release=0.9, long holdtime=1, int trigger=0);
	double adsr(double input, double attack=1, double decay=0.99, double sustain=0.125, double release=0.9, long holdtime=1, int trigger=0);
	double input;
	double output;
	double attack;
	double decay;
	double sustain;
	double release;
	double amplitude;
	int trigger;
	long holdtime;
	long holdcount;
	int attackphase,decayphase,sustainphase,holdphase,releasephase;
};

class convert {
public:
	double mtof(int midinote);
};



class maxiDistortion {
public:
    /*atan distortion, see http://www.musicdsp.org/showArchiveComment.php?ArchiveID=104*/
    /*shape from 1 (soft clipping) to infinity (hard clipping)*/
    double atanDist(const double in, const double shape);
    double fastAtanDist(const double in, const double shape);
    double fastatan( double x );
};


class maxiFlanger {
public:
    //delay = delay time - ~800 sounds good
    //feedback = 0 - 1
    //speed = lfo speed in Hz, 0.0001 - 10 sounds good
    //depth = 0 - 1
    double flange(const double input, const unsigned int delay, const double feedback, const double speed, const double depth);
    maxiDelayline dl;
    maxiOsc lfo;

};

class maxiChorus {
public:
    //delay = delay time - ~800 sounds good
    //feedback = 0 - 1
    //speed = lfo speed in Hz, 0.0001 - 10 sounds good
    //depth = 0 - 1
    double chorus(const double input, const unsigned int delay, const double feedback, const double speed, const double depth);
    maxiDelayline dl, dl2;
    maxiOsc lfo;
    maxiFilter lopass;
    
};

template<typename T>
class maxiEnvelopeFollowerType {
public:
    maxiEnvelopeFollowerType() {
        setAttack(100);
        setRelease(100);
        env = 0;
    }
    void setAttack(T attackMS) {
        attack = pow( 0.01, 1.0 / (attackMS * maxiSettings::sampleRate * 0.001 ) );        
    }
    void setRelease(T releaseMS) {
        release = pow( 0.01, 1.0 / (releaseMS * maxiSettings::sampleRate * 0.001 ) );            
    }
    inline T play(T input) {
        input = fabs(input);
        if (input>env)
            env = attack * (env - input) + input;
        else
            env = release * (env - input) + input;        
        return env;
    }
	void reset() {env=0;}
    inline T getEnv(){return env;}
    inline void setEnv(T val){env = val;}
private:
    T attack, release, env;
};

typedef maxiEnvelopeFollowerType<double> maxiEnvelopeFollower;
typedef maxiEnvelopeFollowerType<float> maxiEnvelopeFollowerF;

//from https://ccrma.stanford.edu/~jos/filters/DC_Blocker_Software_Implementations.html
class maxiDCBlocker {
public:
    double xm1, ym1;
    maxiDCBlocker() : xm1(0), ym1(0) {}
    inline double play(double input, double R);
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
    maxiSVF& setCutoff(double cutoff);
    
    //from 0 upwards, starts to ring from 2-3ish, cracks a bit around 10
    maxiSVF& setResonance(double q);
    
    //run the filter, and get a mixture of lowpass, bandpass, highpass and notch outputs
    double play(double w, double lpmix, double bpmix, double hpmix, double notchmix);
    
private:
    void setParams(double _freq, double _res);
    
    double v0z, v1, v2, g, damping, k, ginv, g1, g2, g3 ,g4;
    double freq, res;
    
};

#endif
