#include "ofApp.h"
#include "ofxMaxim.h"



//--------------------------------------------------------------
void ofApp::setup(){
    
    sender.setup(HOST, PORT);
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
    //samp.load(ofToDataPath("filtersweep2.wav"));
    //samp.getLength();
    
    
    fftSize = 1024;
    mfft.setup(fftSize, 512, 256);
    ifft.setup(fftSize, 512, 256);
    
    
    nAverages = 12;
    oct.setup(sampleRate, fftSize/2, nAverages);
    
    mfccs = (double*) malloc(sizeof(double) * 13);
    mfcc.setup(512, 42, 13, 20, 20000, sampleRate);
    
    ofxMaxiSettings::setup(sampleRate, 2, initialBufferSize);
    ofSoundStreamSetup(2,2, this, sampleRate, initialBufferSize, 4);/* Call this last ! */
    
    
    //GUI STUFF
    gui.setup(); // most of the time you don't need a name
    
    /* mfccToggle.setBackgroundColor(ofColor(191,72,250));
     fftToggle.setBackgroundColor(ofColor(191,72,250));
     chromagramToggle.setBackgroundColor(ofColor(191,72,250));
     peakFrequencyToggle.setBackgroundColor(ofColor(191,72,250));
     centroidToggle.setBackgroundColor(ofColor(191,72,250));
     rmsToggle.setBackgroundColor(ofColor(191,72,250)); */
    
    
    gui.add(fftToggle.setup("FFT bin magnitudes (pitch/timbre/volume) (512)", true));
    gui.add(mfccToggle.setup("MFCCs (timbre/vocal) (13)", true));
    gui.add(chromagramToggle.setup("Octave analyser (pitch) (12)", true));
    gui.add(peakFrequencyToggle.setup("Peak frequency (pitch) (1)", true));
    gui.add(centroidToggle.setup("Spectral centroid (timbre) (1)", true));
    gui.add(rmsToggle.setup("RMS (volume) (1)", true));
    
    //gui.setSize(600, 500);
    
    bHide = true;
    
    myfont.loadFont("Arial.ttf", 10);
    
    ofSetVerticalSync(true);

}

//--------------------------------------------------------------
void ofApp::update(){
    
    if (fftToggle) {
        ofxOscMessage m;
        m.setAddress("/fft");
        for (int i = 0; i < fftSize; i++) {
            m.addFloatArg(mfft.magnitudes[i]);
            
        }
        sender.sendMessage(m);
    }
    
    if (mfccToggle) {
        ofxOscMessage m;
        m.setAddress("/mfccs");
        for (int i = 0; i < 13; i++) {
            m.addFloatArg(mfccs[i]);
        }
        sender.sendMessage(m);
    }
    
    if (chromagramToggle) {
        ofxOscMessage m;
        m.setAddress("/octaveBins");
        for (int i = 0; i < oct.nAverages; i++) {
            m.addFloatArg(oct.averages[i]);
        }
        sender.sendMessage(m);
    }
    
    if (peakFrequencyToggle) {
        ofxOscMessage m;
        m.setAddress("/peakFrequency");
        m.addFloatArg(peakFreq);
        sender.sendMessage(m);
    }
    
    if (centroidToggle) {
        ofxOscMessage m;
        m.setAddress("/centroid");
        m.addFloatArg(centroid);
        sender.sendMessage(m);
    }
    if (rmsToggle) {
        ofxOscMessage m;
        m.setAddress("/rms");
        m.addFloatArg(RMS);
        sender.sendMessage(m);
    }
    
    

    
}

//--------------------------------------------------------------
void ofApp::draw(){
    
    float horizWidth = ofGetWidth() * 0.8;
    float horizOffset = ofGetWidth()/10.;
    float fftTop = 50;
    float mfccTop = 220;
    float chromagramTop = 320;
    
    ofSetColor(255, 0, 0,255);
    
    //draw fft output
    float xinc = horizWidth / fftSize * 2.0;
    for(int i=0; i < fftSize / 2; i++) {
        //magnitudesDB took out
        float height = mfft.magnitudes[i] * 5;
        ofRect(horizOffset + (i*xinc),250 - height,2, height);
    }
    
    //	cout << "\nMFCCS: ";
    ofSetColor(0, 255, 0,200);
    xinc = horizWidth / 13;
    for(int i=0; i < 13; i++) {
        float height = mfccs[i] * 30;
        ofRect(horizOffset + (i*xinc),mfccTop - height,40, height);
        //		cout << mfccs[i] << ",";
    }
    
    
    
    
    //octave analyser
    ofSetColor(255, 0, 255,200);
    xinc = horizWidth / oct.nAverages;
    for(int i=0; i < oct.nAverages; i++) {
        float height = oct.averages[i] / 20.0 * 30;
        ofRect(horizOffset + (i*xinc),chromagramTop - height,2, height);
    }
    
    ofSetColor(255, 255, 255,255);
    
    char peakString[255]; // an array of chars
    sprintf(peakString, "Peak Frequency: %.2f", peakFreq);
    myfont.drawString(peakString, horizOffset, chromagramTop);
    
    char centroidString[255]; // an array of chars
    sprintf(centroidString, "Spectral Centroid: %f", centroid);
    myfont.drawString(centroidString, horizOffset, chromagramTop + 35);
    
    char rmsString[255]; // an array of chars
    sprintf(rmsString, "RMS: %.2f", RMS);
    myfont.drawString(rmsString, horizOffset, chromagramTop + 70);
    
    
    
     ofSetColor(255, 0, 255, 200);
     //myfont.drawString("Pitch histogram", 50, 650);
//     xinc = horizWidth / 12.0;
//     int j = 0;
//     float pitchHist[12];
//     for (int i = 0; i < oct.nAverages; i++) {
//     pitchHist[j] += oct.averages[i];
//     j++;
//     j = j % 12;
//     }
//     for(int i=0; i < 12; i++) {
//     float height = pitchHist[i] /40. * 100;
//     ofRect(100 + (i*xinc),chromagramTop - height,50, height);
//     }
    
    
//     ofSetColor(255, 0, 255,200);
//     xinc = horizWidth /12;
//     for(int i=0; i < 12; i++) {
//         float height = chromagram[i] / 50.0 * 100;
//     ofRect(100 + (i*xinc),chromagramTop - height,2, height);
//     }
    
    // chromagram
    
    //Mel bands
    //	cout << "\nMel bands: ";
     ofSetColor(255, 0, 255,100);
     xinc = horizWidth / 42.0;
     for(int i=0; i < 42; i++) {
     //		cout << mfcc.melBands[i] << ",";
     float height = mfcc.melBands[i] * 5.0;
     ofRect(10 + (i*xinc),400 - height,10, height);
     }
    //	cout << endl;
    
    
    //	cout << "\n-------" << endl;
    
    //	cout << callTime << endl;
    
    if( bHide ){
        gui.draw();
    }

    
}

//--------------------------------------------------------------
void ofApp::exit(){
    
}


//--------------------------------------------------------------
void ofApp::audioOut(float * output, int bufferSize, int nChannels) {

	
        //	static double tm;
        
        
        
        for (int i = 0; i < bufferSize; i++){
            //		wave = osc.saw(maxiMap::linexp(mouseY + ofGetWindowPositionY(), 0, ofGetScreenHeight(), 200, 8000));
            wave = osc.sinebuf(20+mouseX*7);
            //wave = samp.play(1.);
            //get fft
            //wave=lAudioIn[i];
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
                
                
                /* for (int j = 0; j < 12; j++) {
                 chromagram[j] = 0;
                 }
                 int j = 0;
                 for (int i = 0; i < oct.nAverages; i++) {
                 chromagram[j] += oct.averages[i];
                 j++;
                 j = j % 12;
                 } */
                
                float sum = 0;
                float maxFreq = 0;
                int maxBin = 0;
                
                for (int i = 0; i < fftSize/2; i++) {
                    sum += mfft.magnitudes[i];
                    if (mfft.magnitudes[i] > maxFreq) {
                        maxFreq=mfft.magnitudes[i];
                        maxBin = i;
                    }
                }
                centroid = sum / (fftSize / 2);
                peakFreq = (float)maxBin/fftSize * 44100;
                
                
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
            // lAudioOut[i] = output[i*nChannels    ] = outputs[0]; /* You may end up with lots of outputs. add them here */
            //rAudioOut[i] = output[i*nChannels + 1] = outputs[1];
            lAudioOut[i] = 0;
            rAudioOut[i] = 0;
            
            output[i*nChannels    ] = wave;
            output[i*nChannels + 1] = wave;
        }

	
}

//--------------------------------------------------------------
void ofApp::audioIn(float * input, int bufferSize, int nChannels){
	
    for (int i = 0; i < bufferSize; i++){
        
        lAudioIn[i]=input[i*nChannels];
        rAudioIn[i]=input[i*nChannels +1];

        
//        //		wave = osc.saw(maxiMap::linexp(mouseY + ofGetWindowPositionY(), 0, ofGetScreenHeight(), 200, 8000));
//        wave = lAudioIn[i];
//        //wave = samp.play(1.);
//        //get fft
//        if (mfft.process(wave)) {
//            //			int bins   = fftSize / 2.0;
//            //do some manipulation
//            //			int hpCutoff = floor(((mouseX + ofGetWindowPositionX()) / (float) ofGetScreenWidth()) * fftSize / 2.0);
//            //highpass
//            //			memset(mfft.magnitudes, 0, sizeof(float) * hpCutoff);
//            //			memset(mfft.phases, 0, sizeof(float) * hpCutoff);
//            //lowpass
//            //			memset(mfft.magnitudes + hpCutoff, 0, sizeof(float) * (bins - hpCutoff));
//            //			memset(mfft.phases + hpCutoff, 0, sizeof(float) * (bins - hpCutoff));
//            mfft.magsToDB();
//            //			for(int z=0; z < 512; z++) cout << mfft.magnitudesDB[z] << ",";
//            //			cout << "---------\n";
//            oct.calculate(mfft.magnitudesDB);
//            
//            
////             for (int j = 0; j < 12; j++) {
////             chromagram[j] = 0;
////             }
////             int j = 0;
////             for (int i = 0; i < oct.nAverages; i++) {
////             chromagram[j] += oct.averages[i];
////             j++;
////             j = j % 12;
////             } 
//            
//            float sum = 0;
//            float maxFreq = 0;
//            int maxBin = 0;
//            
//            for (int i = 0; i < fftSize/2; i++) {
//                sum += mfft.magnitudes[i];
//                if (mfft.magnitudes[i] > maxFreq) {
//                    maxFreq=mfft.magnitudes[i];
//                    maxBin = i;
//                }
//            }
//            centroid = sum / (fftSize / 2);
//            peakFreq = (float)maxBin/fftSize * 44100;
//            
//            
//            mfcc.mfcc(mfft.magnitudes, mfccs);
//            //cout << mfft.spectralFlatness() << ", " << mfft.spectralCentroid() << endl;
//        }
//        //inverse fft
//        gettimeofday(&callTS,NULL);
//        //		ifftVal = ifft.process(mfft.magnitudes, mfft.phases);
//        gettimeofday(&callEndTS,NULL);
//        callTime = (float)(callEndTS.tv_usec - callTS.tv_usec) / 1000000.0;
//        callTime += (float)(callEndTS.tv_sec - callTS.tv_sec);
//        //play result
//        mymix.stereo(wave, outputs, 0.5);
//        //		float mix = ((mouseX + ofGetWindowPositionX()) / (float) ofGetScreenWidth());
//        //		mymix.stereo((wave * mix) + ((1.0-mix) * ifftVal), outputs, 0.5);
//        // lAudioOut[i] = output[i*nChannels    ] = outputs[0]; /* You may end up with lots of outputs. add them here */
//        //rAudioOut[i] = output[i*nChannels + 1] = outputs[1];
//        lAudioOut[i] = 0;
//        rAudioOut[i] = 0;
        
    }
    
    

    
}


//--------------------------------------------------------------
void ofApp::touchDown(ofTouchEventArgs &touch){
    
}

//--------------------------------------------------------------
void ofApp::touchMoved(ofTouchEventArgs &touch){
    
}

//--------------------------------------------------------------
void ofApp::touchUp(ofTouchEventArgs &touch){
    
}

//--------------------------------------------------------------
void ofApp::touchDoubleTap(ofTouchEventArgs &touch){
    
}

//--------------------------------------------------------------
void ofApp::touchCancelled(ofTouchEventArgs & touch){
    
}

//--------------------------------------------------------------
void ofApp::lostFocus(){
    
}

//--------------------------------------------------------------
void ofApp::gotFocus(){
    
}

//--------------------------------------------------------------
void ofApp::gotMemoryWarning(){
    
}

//--------------------------------------------------------------
void ofApp::deviceOrientationChanged(int newOrientation){
    
}

