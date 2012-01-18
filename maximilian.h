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

//#include "ofMain.h"
//#include "ofUtils.h"


#include <iostream>
#include <fstream>
#include <string.h>
#include <cstdlib>
#include "math.h"

using namespace std;
#define TWOPI (3.14159*2)

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
	double position;
	double speed;
	double output;
	
public:
	int	myDataSize;
	short 	myChannels;
	int   	mySampleRate;
	long length;
	void getLength();


	char* 	myData;
	
	// get/set for the Path property

	~maxiSample()
	{
		if (myData) delete[] myData;
	}
	
	maxiSample():myData(NULL){};

	bool load(string fileName, int channel=0);
	
	void trigger();
	
	// read a wav file into this class
	bool read();
	
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
	
	//int open(char *filename) {
	//		// open the wav file
	//		char *path = new char[50];
	//		strcpy(path, filename);
	//		sample *myWav = new sample(path);
	//		return 0;
	//	}	
	//		// print a summary of the wav file
	//	int info() {
	//		char *summary = myWav->getSummary();
	//		printf("Summary:\n%s", summary);	
	//		return 0;
	//	}
	//	int savefile() {	
	//		// write the summary back out
	//		strcpy(path, "testout.wav");
	//		myWav->setPath(path);
	//		myWav->save();
	//		return 0:
	//	}
	//	int close() {
	//		// collect the garbage
	//		delete summary;
	//		delete path;
	//		delete myWav;
	//		
	//		return 0;
	//	}		
	// write out the wav file
	bool save()
	{
		fstream myFile (myPath.c_str(), ios::out | ios::binary);
		
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
		myFile.write (myData, myDataSize);
		
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

#endif
