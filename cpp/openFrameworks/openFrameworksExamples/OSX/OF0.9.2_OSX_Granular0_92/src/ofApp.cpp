/* This is an example of how to integrate maximilain into openFrameworks,
 including using audio received for input and audio requested for output.
 
 
 You can copy and paste this and use it as a starting example.
 
 */

#include "ofApp.h"
//#include "maximilian.h"/* include the lib */
#include "time.h"


//--------------------------------------------------------------
void ofApp::setup(){
    
    /* This is stuff you always need.*/
    
    sender.setup(HOST, SENDPORT);
    receiver.setup(RECEIVEPORT);
    
    
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
    
    sampleRate 	= 44100; /* Sampling Rate */
    bufferSize	= 512; /* Buffer Size. you have to fill this buffer with sound using the for loop in the audioOut method */
    
    
    
    ts = new maxiTimePitchStretch<grainPlayerWin, maxiSample>(&samp);
    ts2 = new maxiTimePitchStretch<grainPlayerWin, maxiSample>(&samp2);
    ts3 = new maxiTimePitchStretch<grainPlayerWin, maxiSample>(&samp3);
    ts4 = new maxiTimePitchStretch<grainPlayerWin, maxiSample>(&samp4);
    ts5 = new maxiTimePitchStretch<grainPlayerWin, maxiSample>(&samp5);
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
    
    ofSetVerticalSync(true);
    ofEnableAlphaBlending();
    ofEnableSmoothing();
    
    /* Anything that you would normally find/put in maximilian's setup() method needs to go here. For example, Sample loading.
     
     */
    
    ofSetSphereResolution(5);
    
    isTraining=true;
    
    ofBackground(0,0,0);
    
    ofSoundStreamSetup(2,2,this, sampleRate, bufferSize, 4); /* this has to happen at the end of setup - it switches on the DAC */
    
    
}

//--------------------------------------------------------------
void ofApp::update(){
    
    //WEKINATOR
    if (!isTraining) {
        
        
        while(receiver.hasWaitingMessages()){
            // get the next message
            ofxOscMessage m;
            receiver.getNextMessage(&m);
            
            // check for mouse moved message
            if(m.getAddress() == "/wek/outputs"){
                
                cout << m.getArgAsFloat(0);
                speed = ((double ) m.getArgAsFloat(0) * 4.0) - 2.0;
                grainLength = (m.getArgAsFloat(1) * 0.1) + 0.001;
                pos = ((double) m.getArgAsFloat(0) * 2.0);
                
            }
        }
        
    }
    
    
}

//--------------------------------------------------------------
void ofApp::draw(){
    
    /* You can use any of the data from audio received and audiorequested to draw stuff here.
     Importantly, most people just use the input and output arrays defined above.
     Clever people don't do this. This bit of code shows that by default, each signal is going to flip
     between -1 and 1. You need to account for this somehow. Get the absolute value for example.
     */
    
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
        glPushMatrix();
        glTranslatef(ofGetWidth()/2,ofGetHeight()/2, 0);
        glRotatef(0.01 * ofGetFrameNum() * speed * i, 0.01 * ofGetFrameNum() * speed * i,0.01 * ofGetFrameNum() * speed * i, 0);
        ofDrawSphere(0, 0, i * 5);
        glPopMatrix();
    }
    
    
    
    
}

//--------------------------------------------------------------
void ofApp::audioOut(float * output, int bufferSize, int nChannels) {
    
    
    for (int i = 0; i < bufferSize; i++){
        
        /* Stick your maximilian 'play()' code in here ! Declare your objects in testApp.h.
         
         For information on how maximilian works, take a look at the example code at
         
         http://www.maximilian.strangeloop.co.uk
         
         under 'Tutorials'.
         
         */
        
        
        wave = stretches[current]->play(1.,speed, grainLength, 4, 0);
        
        if (fft.process(wave)) {
            oct.calculate(fft.magnitudes);
        }
        
        //play result
        mymix.stereo(wave, outputs, 0.5);
        output[i*nChannels    ] = outputs[0]; /* You may end up with lots of outputs. add them here */
        output[i*nChannels + 1] = outputs[1];
        
        
        
        /* You may end up with lots of outputs. add them here */
        
        
    }
    
}

//--------------------------------------------------------------
void ofApp::audioIn(float * input, int bufferSize, int nChannels){
    
    // samples are "interleaved"
    for(int i = 0; i < bufferSize; i++){
        /* you can also grab the data out of the arrays*/
        
    }
    
}


//--------------------------------------------------------------
void ofApp::keyPressed(int key){
    
    isTraining=!isTraining;
    
    cout << isTraining;
    
}

//--------------------------------------------------------------
void ofApp::keyReleased(int key){
    
}

//--------------------------------------------------------------
void ofApp::mouseMoved(int x, int y){
    
    float x1 =  myFilter.lopass(x,0.25);
    float y1 = myFilter2.lopass(y,0.25);
    
    if (isTraining) {
        
        speed = ((double ) x1 / ofGetWidth() * 4.0) - 2.0;
        grainLength = ((double) y1 / ofGetHeight() * 0.1) + 0.001;
        if (grainLength < 0.01 ) grainLength = 0.01;
        if (grainLength > 0.4 ) grainLength = 0.4;
        pos = ((double) x1 / ofGetWidth() * 2.0);
        //	cout << pos << endl;
        
        ofxOscMessage m;
        m.setAddress("/wekinator/control/outputs");
        m.addFloatArg((float)x/ofGetWidth());
        m.addFloatArg((float)y/ofGetHeight());
        m.addFloatArg((float)current/stretches.size()-1);
        sender.sendMessage(m);
        cout << "messageSent" << "\n";
    }
    
    
}

//--------------------------------------------------------------
void ofApp::mouseDragged(int x, int y, int button){
    
}

//--------------------------------------------------------------
void ofApp::mousePressed(int x, int y, int button){
    if (++current > stretches.size()-1) current = 0;
    
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
