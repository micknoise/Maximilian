#include "ofApp.h"

//--------------------------------------------------------------
void ofApp::setup(){
    maxiSettings::setup(44100, 2, 2048);
    
    partConv.setup(ofToDataPath("ChapelBlumlein35ft.wav"), 2048, 512);
//    partConv.setup(ofToDataPath("EMT Plate Long.wav"));
    
    loop.load(ofToDataPath("332285__sirderf__cello-tuning-distant.wav"));
    
    fft.setup(1024,1024,256);
    ifft.setup(1024,1024,256);
    convFFT.setup(1024,1024,256);
    
    ofSoundStreamSetup(maxiSettings::channels, 1, maxiSettings::sampleRate, maxiSettings::bufferSize, 4);
#if defined(__APPLE_CC__)
    cout << "Apple\n";
#endif
#if defined(_NO_VDSP)
    cout <<"novdsp\n";
#endif

}

//--------------------------------------------------------------
void ofApp::update(){

}

//--------------------------------------------------------------
void ofApp::draw(){
    ofBackground(255);
    float div = ofGetWidth() / (float)fft.bins;
    ofSetColor(0,100,0);
    ofNoFill();
    for(int i=0; i < fft.bins; i++) {
        ofSetColor(100,0,0);
        ofDrawRectangle(round(i*div), ofGetHeight(), div, -convFFT.magnitudesDB[i] * 10);
        ofSetColor(0,100,0);
        ofDrawRectangle(round(i*div), ofGetHeight(), div, -fft.magnitudesDB[i] * 10);
    }
    ofDrawBitmapString("MouseX controls effect level", 10,10);
}


void ofApp::audioRequested(float *output, int bufferSize, int nChannels) {
    for(int i=0; i < bufferSize; i++) {
        float w = loop.play();
        if (fft.process(w)) {;
            fft.magsToDB();
        }
//        fft.process(w, maxiFFT::NO_POLAR_CONVERSION);
//        w = ifft.process(fft.magnitudes, fft.phases);
//        w = ifft.process(fft.real, fft.imag, maxiIFFT::COMPLEX);
        float conv = partConv.play(w);
        if (convFFT.process(conv)) {
            convFFT.magsToDB();
        }
        output[i * nChannels] = output[(i * nChannels) + 1] = w + (conv * convLevel);
    }
}


//--------------------------------------------------------------
void ofApp::keyPressed(int key){

}

//--------------------------------------------------------------
void ofApp::keyReleased(int key){

}

//--------------------------------------------------------------
void ofApp::mouseMoved(int x, int y ){
    convLevel = max(0.0f,x / (float)ofGetWidth());
}

//--------------------------------------------------------------
void ofApp::mouseDragged(int x, int y, int button){

}

//--------------------------------------------------------------
void ofApp::mousePressed(int x, int y, int button){

}

//--------------------------------------------------------------
void ofApp::mouseReleased(int x, int y, int button){

}

//--------------------------------------------------------------
void ofApp::mouseEntered(int x, int y){

}

//--------------------------------------------------------------
void ofApp::mouseExited(int x, int y){

}

//--------------------------------------------------------------
void ofApp::windowResized(int w, int h){

}

//--------------------------------------------------------------
void ofApp::gotMessage(ofMessage msg){

}

//--------------------------------------------------------------
void ofApp::dragEvent(ofDragInfo dragInfo){ 

}



