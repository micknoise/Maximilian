#ifndef _TEST_APP
#define _TEST_APP


#include "ofMain.h"
#include "maximilian.h"/* you need this*/


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
	
	
	/* stick you maximilian stuff below */
	
	double wave,sample,outputs[2];
	maxiMix mymix;
	maxiOsc sine1;
	maxiSample beats,beat;
	
};

#endif
