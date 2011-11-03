#include "mp.h"

//--------------------------------------------------------------
void mp::setup(){
	ofEnableAlphaBlending();
	ofSetupScreen();
	ofBackground(0, 0, 0);
	ofSetVerticalSync(true);
//	pyd.setup("localhost", 23612);
//	pyd.clear();
	
	
	atomBuffer.resize(512);


	ofxMaxiSettings::setup(44100, 2, 512);
	ofSoundStreamSetup(maxiSettings::channels,0,this, maxiSettings::sampleRate, maxiSettings::bufferSize, 4);/* Call this last ! */
	
}

//--------------------------------------------------------------
void mp::update(){
	flArr test;
	maxiAtoms::createGabor(test, maxiMap::linexp((float)mouseX/ofGetWidth(), 0, 1, 100, 10000) * (1.0 + (ofRandomuf() * 0.2)), 
					   maxiSettings::sampleRate, 
					   maxiMap::linlin((float)mouseY / ofGetHeight(), 0, 1, 2000, 40000) * (1.0 + (ofRandomuf() * 0.3)), 
					   ofRandomf() * PI, 0.3, 0.05);
	atStream.addAtom(test);
	
}

//--------------------------------------------------------------
void mp::draw(){

}

void mp::audioRequested 	(float * output, int bufferSize, int nChannels){
	memset(&atomBuffer[0], 0, sizeof(float) * bufferSize);
	atStream.fillNextBuffer(&(atomBuffer[0]), bufferSize);
	for (int i = 0; i < bufferSize; i++){
		output[i*nChannels    ] = output[i*nChannels + 1] = atomBuffer[i]; 
	}
	
}


//--------------------------------------------------------------
void mp::keyPressed(int key){

}

//--------------------------------------------------------------
void mp::keyReleased(int key){

}

//--------------------------------------------------------------
void mp::mouseMoved(int x, int y ){

}

//--------------------------------------------------------------
void mp::mouseDragged(int x, int y, int button){

}

//--------------------------------------------------------------
void mp::mousePressed(int x, int y, int button){

}

//--------------------------------------------------------------
void mp::mouseReleased(int x, int y, int button){

}

//--------------------------------------------------------------
void mp::windowResized(int w, int h){

}

//--------------------------------------------------------------
void mp::gotMessage(ofMessage msg){

}

//--------------------------------------------------------------
void mp::dragEvent(ofDragInfo dragInfo){ 

}