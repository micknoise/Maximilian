/* This is an example of how to integrate maximilain into openFrameworks, 
 including using audio received for input and audio requested for output.
 
 
 You can copy and paste this and use it as a starting example.
 
 */


#include "testApp.h"



//-------------------------------------------------------------
testApp::~testApp() {
	
	delete beat.myData; /*you should probably delete myData for any sample object
						 that you've created in testApp.h*/
	
}


//--------------------------------------------------------------
void testApp::setup(){
	/* some standard setup stuff*/

	ofEnableAlphaBlending();
	ofSetupScreen();
	ofBackground(0, 0, 0);
	ofSetVerticalSync(true);
	
	
	sampleRate 			= 44100; /* Sampling Rate */
	initialBufferSize	= 512;
	
	/* Now you can put anything you would normally put in maximilian's 'setup' method in here. */
	
	
	beat.load(ofToDataPath("beat2.wav"));
	beat.getLength();

	
	ofSoundStreamSetup(2,0,this, sampleRate, initialBufferSize, 4);}

//--------------------------------------------------------------
void testApp::update(){

}

//--------------------------------------------------------------
void testApp::draw(){
	
	
	ofSetColor(255, 255, 255,255);
	ofRect(600, 300, sample*150, sample*150); /* audio sigs go between -1 and 1. See?*/
	ofCircle(200, 300, wave*150);
	
}

//--------------------------------------------------------------
void testApp::audioRequested 	(float * output, int bufferSize, int nChannels){

	for (int i = 0; i < bufferSize; i++){
		

		
		sample=beat.play(0.5, 0, beat.length);
		wave=sine1.sinebuf(abs(mouseX));/* mouse controls sinewave pitch. we get abs value to stop it dropping
//										 delow zero and killing the soundcard*/
		
		mymix.stereo(sample + wave, outputs, 0.5);
		
		
		output[i*nChannels    ] = outputs[0]; /* You may end up with lots of outputs. add them here */
		output[i*nChannels + 1] = outputs[1];
	}
	
}

//--------------------------------------------------------------
void testApp::audioReceived 	(float * input, int bufferSize, int nChannels){	

	
	/* You can just grab this input and stick it in a double, then use it above to create output*/
	
	for (int i = 0; i < bufferSize; i++){
		
		/* you can also grab the data out of the arrays*/
		

	}
	
}
	
//--------------------------------------------------------------
void testApp::keyPressed(int key){

}

//--------------------------------------------------------------
void testApp::keyReleased(int key){

}

//--------------------------------------------------------------
void testApp::mouseMoved(int x, int y ){
	
	

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

