#pragma once

#include "ofMain.h"
#include "ofxiOS.h"
#include "ofxiOSExtras.h"
#include "ofxMaxim.h" 
#include "ofxGui.h"
#include "ofxOsc.h"

#include <sys/time.h>

#include "maxiMFCC.h"
#define HOST "localhost"
#define PORT 6448


class ofApp : public ofxiOSApp{
    
public:
    void setup();
    void update();
    void draw();
    void exit();
    
    void touchDown(ofTouchEventArgs & touch);
    void touchMoved(ofTouchEventArgs & touch);
    void touchUp(ofTouchEventArgs & touch);
    void touchDoubleTap(ofTouchEventArgs & touch);
    void touchCancelled(ofTouchEventArgs & touch);
    
    void lostFocus();
    void gotFocus();
    void gotMemoryWarning();
    void deviceOrientationChanged(int newOrientation);
    void audioIn(float * input, int bufferSize, int nChannels);
    void audioOut(float * output, int bufferSize, int nChannels);    
    
    float 	* lAudioOut; /* outputs */
    float   * rAudioOut;
    
    float * lAudioIn; /* inputs */
    float * rAudioIn;
    
    int		initialBufferSize; /* buffer size */
    
    
    //MAXIMILIAN STUFF:
    
    int sampleRate;
    int bufferSize;
    
    maxiMix channel1;
    
    double wave,sample,outputs[2], ifftVal;
    maxiMix mymix;
    maxiOsc osc;
    
    ofxMaxiFFTOctaveAnalyzer oct;
    int nAverages;
    float *ifftOutput;
    int ifftSize;
    
    float peakFreq = 0;
    float centroid = 0;
    float RMS = 0;
    
    ofxMaxiIFFT ifft;
    ofxMaxiFFT mfft;
    int fftSize;
    int bins, dataSize;
    
    float callTime;
    timeval callTS, callEndTS;
    
    maxiMFCC mfcc;
    double *mfccs;
    
    maxiSample samp;
    
    //GUI STUFF
    bool bHide;
    
    ofxToggle mfccToggle;
    ofxToggle fftToggle;
    ofxToggle chromagramToggle;
    ofxToggle peakFrequencyToggle;
    ofxToggle centroidToggle;
    ofxToggle rmsToggle;
    
    ofxPanel gui;
    
    ofTrueTypeFont myfont;
    
    ofxOscSender sender;


};


