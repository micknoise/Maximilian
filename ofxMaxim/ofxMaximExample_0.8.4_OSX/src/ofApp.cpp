/* This is an example of how to integrate maximilain into openFrameworks,
 including using audio received for input and audio requested for output.
 
 
 You can copy and paste this and use it as a starting example.
 
 */

#include "ofApp.h"

//--------------------------------------------------------------
void ofApp::setup(){	
    
	/* This is stuff you always need.*/
    
    sampleRate 	= 44100; /* Sampling Rate */
	bufferSize	= 512; /* Buffer Size. you have to fill this buffer with sound using the for loop in the audioOut method */

	/* Anything that you would normally find/put in maximilian's setup() method needs to go here. For example, Sample loading.
     
     */
	sample1.load(ofToDataPath("beat2.wav")); // ofToDataPath tells the load function to look in the data folder
	
	ofBackground(255,255,255);
    
    ofSoundStreamSetup(2,2,this, sampleRate, bufferSize, 4); /* this has to happen at the end of setup - it switches on the DAC */


}

//--------------------------------------------------------------
void ofApp::update(){

}

//--------------------------------------------------------------
void ofApp::draw(){
	
    /* You can use any of the data from audio received and audiorequested to draw stuff here.
	 Importantly, most people just use the input and output arrays defined above.
	 Clever people don't do this. This bit of code shows that by default, each signal is going to flip
	 between -1 and 1. You need to account for this somehow. Get the absolute value for example.
	 */

    
}

//--------------------------------------------------------------
void ofApp::audioOut(float * output, int bufferSize, int nChannels) {
    
	
	for (int i = 0; i < bufferSize; i++){
	
        /* Stick your maximilian 'play()' code in here ! Declare your objects in testApp.h.
		 
		 For information on how maximilian works, take a look at the example code at
		 
		 http://www.maximilian.strangeloop.co.uk
		 
		 under 'Tutorials'.
		 
		 */
		
		
        
		sample=sample1.play(1.+myOsc1.saw(10)); // play back the sample but modulate the speed with a sawtooth.
        
        
		channel1.stereo(sample,outputs1,0.5); // use the stereo function of the mix object to pan the sample in the middle.
		
        /* You may end up with lots of outputs. add them here */
        
		output[i*nChannels    ] = outputs1[0];//left output
		output[i*nChannels + 1] = outputs1[1];//right output
		
	}
	
}

//--------------------------------------------------------------
void ofApp::audioIn(float * input, int bufferSize, int nChannels){
	
	// samples are "interleaved"
	for(int i = 0; i < bufferSize; i++){
        
        
    }
    
}


//--------------------------------------------------------------
void ofApp::keyPressed(int key){
    
}

//--------------------------------------------------------------
void ofApp::keyReleased(int key){
    
}

//--------------------------------------------------------------
void ofApp::mouseMoved(int x, int y){
    
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
void ofApp::windowResized(int w, int h){
    
}

//--------------------------------------------------------------
void ofApp::gotMessage(ofMessage msg){
    
}

//--------------------------------------------------------------
void ofApp::dragEvent(ofDragInfo dragInfo){
    
}
