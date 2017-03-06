#pragma once

//#define _NO_VDSP

#include "ofMain.h"
#include "ofxMaxim.h"
#include "maxiConvolve.h"


class ofApp : public ofBaseApp{

	public:
		void setup();
		void update();
		void draw();

		void keyPressed(int key);
		void keyReleased(int key);
		void mouseMoved(int x, int y );
		void mouseDragged(int x, int y, int button);
		void mousePressed(int x, int y, int button);
		void mouseReleased(int x, int y, int button);
		void mouseEntered(int x, int y);
		void mouseExited(int x, int y);
		void windowResized(int w, int h);
		void dragEvent(ofDragInfo dragInfo);
		void gotMessage(ofMessage msg);
        void audioRequested(float *buffer, int bufferSize, int nChannels);
    
private:
    maxiOsc osc;
    maxiConvolve partConv;
    maxiSample loop;
    maxiFFT fft;
    maxiFFT convFFT;
    maxiIFFT ifft;
    
    float convLevel;
};
