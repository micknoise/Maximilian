/* This is an example of how to integrate maximilain into openFrameworks, 
 including using audio received for input and audio requested for output.
 
 
 You can copy and paste this and use it as a starting example.
 
 */


#include "testApp.h"
#include "maximilian.h"/* include the lib */
#include "time.h"



//-------------------------------------------------------------
testApp::~testApp() {
	
}


//--------------------------------------------------------------
void testApp::setup(){
	/* some standard setup stuff*/

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
	
	/* Now you can put anything you would normally put in maximilian's 'setup' method in here. */
	
//	samp.load(ofToDataPath("sinetest_stepping2.wav"));
//		samp.load(ofToDataPath("whitenoise2.wav"));
//	samp.load(ofToDataPath("additive22.wav"));
	//samp.load(ofToDataPath("pinknoise2.wav"));
	samp.load(ofToDataPath("filtersweep2.wav"));
	samp.getLength();
	

	fftSize = 1024;
	mfft.setup(fftSize, 512, 256);
	ifft.setup(fftSize, 512, 256);
	
	
	
	nAverages = 12;
	oct.setup(sampleRate, fftSize/2, nAverages);
	
	mfccs = (double*) malloc(sizeof(double) * 13);
	mfcc.setup(512, 42, 13, 20, 20000, sampleRate);

	ofxMaxiSettings::setup(sampleRate, 2, initialBufferSize);
	ofSoundStreamSetup(2,2, this, sampleRate, initialBufferSize, 4);/* Call this last ! */
	
	ofSetVerticalSync(true);

}

//--------------------------------------------------------------
void testApp::update(){
}

//--------------------------------------------------------------
void testApp::draw(){
	
	ofSetColor(255, 255, 255,255);

	//draw fft output
	float xinc = 900.0 / fftSize * 2.0;
	for(int i=0; i < fftSize / 2; i++) {
		float height = mfft.magnitudesDB[i] / 50.0 * 300;
		ofRect(100 + (i*xinc),250 - height,2, height);
	}
	//draw phases
	ofSetColor(0, 255, 0,100);
	for(int i=0; i < fftSize / 2; i++) {
		float height = mfft.phases[i] / 50.0 * 400;
		ofRect(100 + (i*xinc),300 - height,2, height);
	}
	
//	//octave analyser
//	ofSetColor(255, 0, 0,100);
//	xinc = 900.0 / oct.nAverages;
//	for(int i=0; i < oct.nAverages; i++) {
//		float height = oct.averages[i] / 50.0 * 100;
//		ofRect(100 + (i*xinc),700 - height,2, height);
//	}
	
	//Mel bands
//	cout << "\nMel bands: ";
	ofSetColor(255, 0, 255,100);
	xinc = 900.0 / 42.0;
	for(int i=0; i < 42; i++) {
//		cout << mfcc.melBands[i] << ",";
		float height = mfcc.melBands[i] * 5.0;
		ofRect(100 + (i*xinc),400 - height,10, height);
	}
//	cout << endl;
	
//	cout << "\nMFCCS: ";
	ofSetColor(255, 0, 0,100);
	xinc = 900.0 / 13;
	for(int i=0; i < 13; i++) {
		float height = mfccs[i] * 250.0;
		ofRect(100 + (i*xinc),600 - height,40, height);
//		cout << mfccs[i] << ",";
	}
//	cout << "\n-------" << endl;
	
//	cout << callTime << endl;
	
}

//--------------------------------------------------------------
void testApp::audioRequested 	(float * output, int bufferSize, int nChannels){
//	static double tm;
	for (int i = 0; i < bufferSize; i++){
//		wave = osc.saw(maxiMap::linexp(mouseY + ofGetWindowPositionY(), 0, ofGetScreenHeight(), 200, 8000));
//		wave = lAudioIn[i];
		wave = samp.play(1.);
		//get fft
		if (mfft.process(wave)) {
//			int bins   = fftSize / 2.0;
			//do some manipulation
//			int hpCutoff = floor(((mouseX + ofGetWindowPositionX()) / (float) ofGetScreenWidth()) * fftSize / 2.0);
//highpass
//			memset(mfft.magnitudes, 0, sizeof(float) * hpCutoff);
//			memset(mfft.phases, 0, sizeof(float) * hpCutoff);
//lowpass
//			memset(mfft.magnitudes + hpCutoff, 0, sizeof(float) * (bins - hpCutoff));
//			memset(mfft.phases + hpCutoff, 0, sizeof(float) * (bins - hpCutoff));
			mfft.magsToDB();
//			for(int z=0; z < 512; z++) cout << mfft.magnitudesDB[z] << ",";
//			cout << "---------\n";
			oct.calculate(mfft.magnitudesDB);
			mfcc.mfcc(mfft.magnitudes, mfccs);
			//cout << mfft.spectralFlatness() << ", " << mfft.spectralCentroid() << endl;
		}
		//inverse fft
		gettimeofday(&callTS,NULL);
//		ifftVal = ifft.process(mfft.magnitudes, mfft.phases);
		gettimeofday(&callEndTS,NULL);
		callTime = (float)(callEndTS.tv_usec - callTS.tv_usec) / 1000000.0;
		callTime += (float)(callEndTS.tv_sec - callTS.tv_sec);
		//play result
		mymix.stereo(wave, outputs, 0.5);
//		float mix = ((mouseX + ofGetWindowPositionX()) / (float) ofGetScreenWidth());
//		mymix.stereo((wave * mix) + ((1.0-mix) * ifftVal), outputs, 0.5);
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

