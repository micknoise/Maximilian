#include "testApp.h"

//--------------------------------------------------------------
void testApp::setup(){
	maxiSettings::setup(44100, 2, 512);
	ofSoundStreamSetup(maxiSettings::channels,0,this,maxiSettings::sampleRate, maxiSettings::bufferSize, 4);
	ofSoundStreamStart();
}

//--------------------------------------------------------------
void testApp::update(){

}

//--------------------------------------------------------------
void testApp::draw(){

}

void testApp::audioRequested( float * output, int bufferSize, int nChannels ){
	for(int i=0; i < bufferSize; i+=2) {
		float sawFreq = maxiMap::linexp(mouseX,0, ofGetWidth(), 20, 20000);
		float w = sawOsc.saw(sawFreq);

		w = dist.atanDist(w, 10);

		float filtFreq = maxiMap::linexp(mouseY,0, ofGetHeight(), 20, 20000);
		w = filt.hires(w, filtFreq, 0.4);


		output[i] = output[i+1] = w;
	}
}

//--------------------------------------------------------------
void testApp::keyPressed(int key){

}

//--------------------------------------------------------------
void testApp::keyReleased(int key){

}

//--------------------------------------------------------------
void testApp::mouseMoved(int x, int y){

}

//--------------------------------------------------------------
void testApp::mouseDragged(int x, int y, int button){

}

//--------------------------------------------------------------
void testApp::mousePressed(int x, int y, int button){

}

//--------------------------------------------------------------
void testApp::mouseReleased(int x, int y, int button){

}

//--------------------------------------------------------------
void testApp::windowResized(int w, int h){

}

//--------------------------------------------------------------
void testApp::gotMessage(ofMessage msg){

}

//--------------------------------------------------------------
void testApp::dragEvent(ofDragInfo dragInfo){ 

}