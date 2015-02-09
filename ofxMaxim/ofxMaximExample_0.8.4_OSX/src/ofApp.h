#pragma once

#include "ofMain.h"
#include "ofxMaxim.h"

class ofApp : public ofBaseApp{
	
    public:
    void setup();
    void update();
    void draw();
    
    void keyPressed(int key);
    void keyReleased(int key);
    void mouseMoved(int x, int y);
    void mouseDragged(int x, int y, int button);
    void mousePressed(int x, int y, int button);
    void mouseReleased(int x, int y, int button);
    void windowResized(int w, int h);
    void dragEvent(ofDragInfo dragInfo);
    void gotMessage(ofMessage msg);

    
    void audioOut(float * output, int bufferSize, int nChannels);
    void audioIn(float * input, int bufferSize, int nChannels);
	
	int		bufferSize;
	int		sampleRate;
	
    
    /* stick you maximilian declarations below
     
     For information on how maximilian works, take a look at the example code at
     
     http://www.maximilian.strangeloop.co.uk
     
     under 'Tutorials'.
     
     
     */

	
	ofxMaxiOsc myOsc1;
	ofxMaxiSample sample1;
	double patch1,sample,outputs1[2];
	ofxMaxiMix channel1;

    
};


