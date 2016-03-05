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

#ifndef MAXIMILIAN_H
#define MAXIMILIAN_H

//#define MAXIMILIAN_PORTAUDIO
#define MAXIMILIAN_RT_AUDIO


#include <iostream>
#include <fstream>
#include <string.h>
#include <cstdlib>
#include "math.h"

#ifdef _WIN32 //|| _WIN64
#include <algorithm>
#endif

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
    double sawn(double frequency);
    double rect(double frequency, double duty=0.5);
	void phaseReset(double phaseIn);
	
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


class maxiSample  {
	
private:
	string 	myPath;
	int 	myChunkSize;
	int	mySubChunk1Size;
	int		readChannel;
	short 	myFormat;
	int   	myByteRate;
	short 	myBlockAlign;
	short 	myBitsPerSample;
	double position, recordPosition;
	double speed;
	double output;
    maxiLagExp<double> loopRecordLag;
	
public:
	int	myDataSize;
	short 	myChannels;
	int   	mySampleRate;
	long length;
	void getLength();
    void setLength(unsigned long numSamples);  
	
	
//	char* 	myData;
    short* temp;
	
	// get/set for the Path property
	
	~maxiSample()
	{
//		if (myData) free(myData);
        if (temp) free(temp);
        printf("freeing SampleData");

	}
	
    maxiSample():temp(NULL),position(0), recordPosition(0), myChannels(1), mySampleRate(maxiSettings::sampleRate) {};
    
    maxiSample& operator=(const maxiSample &source) {
        if (this == &source)
            return *this;
        position=0;
        recordPosition = 0;
        myChannels = source.myChannels;
        mySampleRate = maxiSettings::sampleRate;
        free(temp);
        myDataSize = source.myDataSize;
        temp = (short*) malloc(myDataSize * sizeof(char));
        memcpy(temp, source.temp, myDataSize * sizeof(char));
        length = source.length;
        return *this;
    }
	
	bool load(string fileName, int channel=0);
    
    bool loadOgg(string filename,int channel=0);
	
	void trigger();
	
	// read a wav file into this class
	bool read();
	
	//read an ogg file into this class using stb_vorbis
    bool readOgg();
    
    void loopRecord(double newSample, const bool recordEnabled, const double recordMix, double start = 0.0, double end = 1.0) {
        loopRecordLag.addSample(recordEnabled);
        if (recordPosition < start * length) recordPosition = start * length;
        if(recordEnabled) {
            double currentSample = temp[(unsigned long)recordPosition] / 32767.0;
            newSample = (recordMix * currentSample) + ((1.0 - recordMix) * newSample);
            newSample *= loopRecordLag.value();
            temp[(unsigned long)recordPosition] = newSample * 32767;
        }
        ++recordPosition;
        if (recordPosition >= end * length)
            recordPosition= start * length;
    }
    
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
    bool save() {
        return save(myPath);
    }
    
	bool save(string filename)
	{
        fstream myFile (filename.c_str(), ios::out | ios::binary);
        
        // write the wav file per the wav file format
        myFile.seekp (0, ios::beg);
        myFile.write ("RIFF", 4);
        myFile.write ((char*) &myChunkSize, 4);
        myFile.write ("WAVE", 4);
        myFile.write ("fmt ", 4);
        myFile.write ((char*) &mySubChunk1Size, 4);
        myFile.write ((char*) &myFormat, 2);
        myFile.write ((char*) &myChannels, 2);
        myFile.write ((char*) &mySampleRate, 4);
        myFile.write ((char*) &myByteRate, 4);
        myFile.write ((char*) &myBlockAlign, 2);
        myFile.write ((char*) &myBitsPerSample, 2);
        myFile.write ("data", 4);
        myFile.write ((char*) &myDataSize, 4);
        myFile.write ((char*) temp, myDataSize);
        
        return true;
	}
	
	// return a printable summary of the wav file
	char *getSummary()
	{
		char *summary = new char[250];
		sprintf(summary, " Format: %d\n Channels: %d\n SampleRate: %d\n ByteRate: %d\n BlockAlign: %d\n BitsPerSample: %d\n DataSize: %d\n", myFormat, myChannels, mySampleRate, myByteRate, myBlockAlign, myBitsPerSample, myDataSize);
		std::cout << myDataSize;
		return summary;
	}
    
    void normalise(float maxLevel = 0.99);  //0 < maxLevel < 1.0
    void autoTrim(float alpha = 0.3, float threshold = 6000, bool trimStart = true, bool trimEnd = true); //alpha of lag filter (lower == slower reaction), threshold to mark start and end, < 32767
};


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
	
};


class maxiDyn {
	
	
public:
//	double gate(double input, double threshold=0.9, long holdtime=1, double attack=1, double release=0.9995);
//	double compressor(double input, double ratio, double threshold=0.9, double attack=1, double release=0.9995);
    double gate(double input, double threshold=0.9, long holdtime=1, double attack=1, double release=0.9995);
    double compressor(double input, double ratio, double threshold=0.9, double attack=1, double release=0.9995);
    double compress(double input);
    double input;
	double ratio;
	double currentRatio;
	double threshold;
	double output;
	double attack;
	double release;
	double amplitude;
    void setAttack(double attackMS);
    void setRelease(double releaseMS);
    void setThreshold(double thresholdI);
    void setRatio(double ratioF);
	long holdtime;
	long holdcount;
	int attackphase,holdphase,releasephase;
};

class maxiEnv {
	
	
public:
	double ar(double input, double attack=1, double release=0.9, long holdtime=1, int trigger=0);
	double adsr(double input, double attack=1, double decay=0.99, double sustain=0.125, double release=0.9, long holdtime=1, int trigger=0);
    double adsr(double input,int trigger);
	double input;
	double output;
	double attack;
	double decay;
	double sustain;
	double release;
	double amplitude;
    void setAttack(double attackMS);
    void setRelease(double releaseMS);
    void setDecay(double decayMS);
    void setSustain(double sustainL);
	int trigger;
	long holdtime=1;
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

inline double maxiDistortion::fastatan(double x)
{
    return (x / (1.0 + 0.28 * (x * x)));
}

inline double maxiDistortion::atanDist(const double in, const double shape) {
    double out;
    out = (1.0 / atan(shape)) * atan(in * shape);
    return out;
}

inline double maxiDistortion::fastAtanDist(const double in, const double shape) {
    double out;
    out = (1.0 / fastatan(shape)) * fastatan(in * shape);
    return out;
}


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

inline double maxiFlanger::flange(const double input, const unsigned int delay, const double feedback, const double speed, const double depth)
{
    //todo: needs fixing
    double output;
    double lfoVal = lfo.triangle(speed);
    output = dl.dl(input, delay + (lfoVal * depth * delay) + 1, feedback) ;    
    double normalise = (1 - fabs(output));
    output *= normalise;
    return (output + input) / 2.0;
}

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

inline double maxiChorus::chorus(const double input, const unsigned int delay, const double feedback, const double speed, const double depth)
{
    //this needs fixing
    double output1, output2;
    double lfoVal = lfo.noise();
    lfoVal = lopass.lores(lfoVal, speed, 1.0) * 2.0;
    output1 = dl.dl(input, delay + (lfoVal * depth * delay) + 1, feedback) ;    
    output2 = dl2.dl(input, (delay + (lfoVal * depth * delay * 1.02) + 1) * 0.98, feedback * 0.99) ;    
    output1 *= (1.0 - fabs(output1));
    output2 *= (1.0 - fabs(output2));
    return (output1 + output2 + input) / 3.0;
}

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

class maxiDCBlocker {
public:
    double xm1, ym1;
    maxiDCBlocker() : xm1(0), ym1(0) {}
    inline double play(double input, double R) {
        ym1 = input - xm1 + R * ym1;
        xm1 = input;
        return ym1;
    }
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
    inline maxiSVF& setCutoff(double cutoff) {
        setParams(cutoff, res);
        return *this;
    }
    
    //from 0 upwards, starts to ring from 2-3ish, cracks a bit around 10
    inline maxiSVF& setResonance(double q) {
        setParams(freq, q);
        return *this;
    }
    
    //run the filter, and get a mixture of lowpass, bandpass, highpass and notch outputs
    inline double play(double w, double lpmix, double bpmix, double hpmix, double notchmix) {
        double low, band, high, notch;
        double v1z = v1;
        double v2z = v2;
        double v3 = w + v0z - 2.0 * v2z;
        v1 += g1*v3-g2*v1z;
        v2 += g3*v3+g4*v1z;
        v0z = w;
        low = v2;
        band = v1;
        high = w-k*v1-v2;
        notch = w-k*v1;
        return (low * lpmix) + (band * bpmix) + (high * hpmix) + (notch * notchmix);
    }
    
private:
    inline void setParams(double _freq, double _res) {
        freq = _freq;
        res = _res;
        g = tan(PI * freq / maxiSettings::sampleRate);
        damping = res == 0 ? 0 : 1.0 / res;
        k = damping;
        ginv = g / (1.0 + g * (g + k));
        g1 = ginv;
        g2 = 2.0 * (g + k) * ginv;
        g3 = g * ginv;
        g4 = 2.0 * ginv;
    }
    
    double v0z, v1, v2, g, damping, k, ginv, g1, g2, g3 ,g4;
    double freq, res;
    
};


#endif
