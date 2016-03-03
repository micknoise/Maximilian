/* This is an example of how to integrate maximilain into openFrameworks, 
 including using audio received for input and audio requested for output.
 
 
 You can copy and paste this and use it as a starting example.
 
 */


#include "testApp.h"
#include "maximilian.h"/* include the lib */
#include "time.h"



//-------------------------------------------------------------
testApp::~testApp() {
	delete ts, ts2;
}


//--------------------------------------------------------------
void testApp::setup(){
	
	//samples from http://freesound.org
	samp.load(ofToDataPath("2630__Jovica__133_bpm_ATTACK_LOOP_04_electrified_analog_kit_variation_16_mono.wav"));
	samp2.load(ofToDataPath("24620__anamorphosis__GMB_Kantilan_1.wav"));
	samp3.load(ofToDataPath("26393__brfindla__Calango1berimbau.wav"));
	samp4.load(ofToDataPath("68373__juskiddink__Cello_open_string_bowed.wav"));
	samp5.load(ofToDataPath("71515__Microscopia__Wilhelm_Bruder_Sohne_Organ.wav"));
//	samp5.load(ofToDataPath("sine1sec.wav"));
	

	ofEnableAlphaBlending();
	ofSetupScreen();
	ofBackground(0, 0, 0);
	ofSetFrameRate(60);
	
	
	/* This is stuff you always need.*/
	sampleRate 			= 44100; /* Sampling Rate */
	initialBufferSize	= 512;	/* Buffer Size. you have to fill this buffer with sound*/
	lAudioOut			= new float[initialBufferSize];/* outputs */
	rAudioOut			= new float[initialBufferSize];
	lAudioIn			= new float[initialBufferSize];/* inputs */
	rAudioIn			= new float[initialBufferSize];
	
	
	/* This is a nice safe piece of code */
	memset(lAudioOut, 0, initialBufferSize * sizeof(float));
	memset(rAudioOut, 0, initialBufferSize * sizeof(float));
	
	memset(lAudioIn, 0, initialBufferSize * sizeof(float));
	memset(rAudioIn, 0, initialBufferSize * sizeof(float));
	
	
			   	
	ts = new maxiTimestretch<grainPlayerWin>(&samp);
	ts2 = new maxiTimestretch<grainPlayerWin>(&samp2);
	ts3 = new maxiTimestretch<grainPlayerWin>(&samp3);
	ts4 = new maxiTimestretch<grainPlayerWin>(&samp4);
	ts5 = new maxiTimestretch<grainPlayerWin>(&samp5);
	stretches.push_back(ts);
	stretches.push_back(ts2);
	stretches.push_back(ts3);
	stretches.push_back(ts4);
	stretches.push_back(ts5);
	speed = 1;
	grainLength = 0.05;
	current=0;
	
	fft.setup(1024, 512, 256);
	oct.setup(44100, 1024, 10);
	
	int current = 0;
	ofxMaxiSettings::setup(sampleRate, 2, initialBufferSize);
	ofSoundStreamSetup(2,0, this, maxiSettings::sampleRate, initialBufferSize, 4);/* Call this last ! */
	
	ofSetVerticalSync(true);
	ofEnableAlphaBlending();
	ofEnableSmoothing();
}

//--------------------------------------------------------------
void testApp::update(){
}

//--------------------------------------------------------------
void testApp::draw(){
	ofSetColor(160,32,240, 150);
	ofDrawBitmapString(":: ofxMaxim Granular Timestretching Example ::", 10,20);
	ofDrawBitmapString("Move the mouse left to right to change playback speed and direction.", 10,40);
	ofDrawBitmapString("Move the mouse up and down to change the grain length.", 10,60);
	ofDrawBitmapString("Click to cycle through samples.", 10,80);
	
	stringstream s;
	s << "Speed: " << speed;
	ofDrawBitmapString(s.str(), 10,750);
	s.str("");
	s << "Grain length: " << round(grainLength*1000.0) << " ms";
	ofDrawBitmapString(s.str(), 180,750);
	
	ofNoFill();
	for(int i=0; i < oct.nAverages; i++) {
		ofSetColor(200 + ((int)(ofGetFrameNum() * 0.8) % 255),
				   100 + ((int)(ofGetFrameNum() * 1.4) % 255), 
				   ofGetFrameNum() % 255,
				   oct.averages[i] / 20.0 * 255.0);
//		ofCircle(ofGetWidth() / 2, ofGetHeight()/2, i * 5);
		glPushMatrix();
		glTranslatef(ofGetWidth()/2,ofGetHeight()/2, 0);
		glRotatef(0.01 * ofGetFrameNum() * speed * i, 1, 0.1, 0);
//		glutWireSphere(i * 5, 2 + (10 - (fabs(speed) * 10)), 2 + (fabs(speed) * 10));
		glutWireSphere(i * 5, 10, 10);
		glPopMatrix();
	}
	
	
}

//--------------------------------------------------------------
void testApp::audioRequested 	(float * output, int bufferSize, int nChannels){
	for (int i = 0; i < bufferSize; i++){
//		wave = stretches[current]->play(speed, grainLength, 5, 0);
		wave = stretches[current]->play(speed, 0.1, 4, 0);
//		wave = stretches[current]->play2(pos, 0.1, 4);
		if (fft.process(wave)) {
			oct.calculate(fft.magnitudes);
		}
		
		//play result
		mymix.stereo(wave, outputs, 0.5);
		lAudioOut[i] = output[i*nChannels    ] = outputs[0]; /* You may end up with lots of outputs. add them here */
		rAudioOut[i] = output[i*nChannels + 1] = outputs[1];
	}
}

//--------------------------------------------------------------
void testApp::audioReceived 	(float * input, int bufferSize, int nChannels){	
	/* You can just grab this input and stick it in a double, then use it above to create output*/
	for (int i = 0; i < bufferSize; i++){
		/* you can also grab the data out of the arrays*/
		lAudioIn[i] = input[i*2];
		rAudioIn[i] = input[i*2+1];
	}
}
	
//--------------------------------------------------------------
void testApp::keyPressed(int key){
	switch (key) {
		case 'a':
		case 'A':
			current = 0;
			break;
		case 's':
		case 'S':
			current = 1;
			break;
		case 'd':
		case 'D':
			current = 2;
			break;
		case 'f':
		case 'F':
			current = 3;
			break;
		case 'g':
		case 'G':
			current = 4;
			break;
	}

}

//--------------------------------------------------------------
void testApp::keyReleased(int key){

}

//--------------------------------------------------------------
void testApp::mouseMoved(int x, int y ){
	speed = ((double ) x / ofGetWidth() * 4.0) - 2.0;
	grainLength = ((double) y / ofGetHeight() * 0.1) + 0.001;
	pos = ((double) x / ofGetWidth() * 2.0);
//	cout << pos << endl;
	
}

//--------------------------------------------------------------
void testApp::mouseDragged(int x, int y, int button){
}

//--------------------------------------------------------------
void testApp::mousePressed(int x, int y, int button){
	if (++current > stretches.size()-1) current = 0;

}

//--------------------------------------------------------------
void testApp::mouseReleased(int x, int y, int button){

}

//--------------------------------------------------------------
void testApp::windowResized(int w, int h){

}

