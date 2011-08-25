#ifndef _TEST_APP
#define _TEST_APP


#include "ofMain.h"
#include "ofxMaxim.h"
#include "maxiGrains.h"
#include <sys/time.h>

typedef hannWinFunctor grainPlayerWin;

class testApp : public ofBaseApp{

	public:
		~testApp();/* deconsructor is very useful */
		void setup();
		void update();
		void draw();

		void keyPressed  (int key);
		void keyReleased(int key);
		void mouseMoved(int x, int y );
		void mouseDragged(int x, int y, int button);
		void mousePressed(int x, int y, int button);
		void mouseReleased(int x, int y, int button);
		void windowResized(int w, int h);
	
	void audioRequested 	(float * input, int bufferSize, int nChannels); /* output method */
	void audioReceived 	(float * input, int bufferSize, int nChannels); /* input method */
	
	float 	* lAudioOut; /* outputs */
	float   * rAudioOut;

	float * lAudioIn; /* inputs */
	float * rAudioIn;
	
	int		initialBufferSize; /* buffer size */ 
	int		sampleRate;
	
	
	/* stick your maximilian stuff below */
	
	double wave,sample,outputs[2];
	maxiSample samp, samp2, samp3, samp4, samp5;
	vector<maxiTimestretch<grainPlayerWin>*> stretches;
	maxiMix mymix;
	maxiTimestretch<grainPlayerWin> *ts, *ts2, *ts3, *ts4, *ts5;
	double speed, grainLength;
	
	ofxMaxiFFT fft;
	ofxMaxiFFTOctaveAnalyzer oct;
	int current;
	double pos;

};

#endif
