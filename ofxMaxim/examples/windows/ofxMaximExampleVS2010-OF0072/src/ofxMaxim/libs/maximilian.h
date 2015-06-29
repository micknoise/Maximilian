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
	double speed;
	double output;
    maxiLagExp<double> loopRecordLag;
	
public:
	double position, recordPosition;
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
    
    void loopRecord(double newSample, const bool recordEnabled, const double recordMix) {
        loopRecordLag.addSample(recordEnabled);
        if(recordEnabled) {
            double currentSample = temp[(unsigned long)recordPosition] / 32767.0;
            newSample = (recordMix * currentSample) + ((1.0 - recordMix) * newSample);
            newSample *= loopRecordLag.value();
            temp[(unsigned long)recordPosition] = newSample * 32767;
        }
        ++recordPosition;
        if (recordPosition == length)
            recordPosition=0;
    }
    
    void clear();
    
    void reset();
	
	double play();
	
	double playOnce();
	
	double playOnce(double speed);
	
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
		return summary;
	}
};


class maxiMap {
public:
	static double inline linlin(double val, double inMin, double inMax, double outMin, double outMax) {
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

class maxiEnvelopeFollower {
public:
    maxiEnvelopeFollower() {
        setAttack(100);
        setRelease(100);
        env = 0;
    }
    void setAttack(double attackMS);
    void setRelease(double releaseMS);
    inline double play(double input) {
        input = fabs(input);
        if (input>env)
            env = attack * (env - input) + input;
        else
            env = release * (env - input) + input;        
        return env;
    }
	void reset() {env=0;}
    inline double getEnv(){return env;}
private:
    double attack, release, env;
};

//from https://ccrma.stanford.edu/~jos/filters/DC_Blocker_Software_Implementations.html
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


#endif
