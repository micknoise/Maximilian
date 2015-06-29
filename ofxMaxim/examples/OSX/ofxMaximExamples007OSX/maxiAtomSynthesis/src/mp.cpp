#include "mp.h"

//--------------------------------------------------------------
void mp::setup(){
	ofEnableAlphaBlending();
	ofSetupScreen();
	ofBackground(0, 0, 0);
	ofSetVerticalSync(true);
//	pyd.setup("localhost", 23612);
//	pyd.clear();
	
	
	maxiAtomBook::loadMPTKXmlBook(ofToDataPath("book100.xml"), book);
	sort(book.atoms.begin(), book.atoms.end(), maxiAtom::atomSortPositionAsc);
	atomBuffer.resize(512);
	atomData.resize(book.atoms[0]->length);

	ofxMaxiSettings::setup(44100, 2, 512);
	ofSoundStreamSetup(maxiSettings::channels,0,this, maxiSettings::sampleRate, maxiSettings::bufferSize, 4);/* Call this last ! */
	
//	flArr test;
//	maxiCollider::createGabor(test, maxiMap::linexp(atom->frequency, 0, 0.2, 20, 20000), 44100, atom->length, atom->phase, 0.3, atom->amp / 40.0);
	
}



//--------------------------------------------------------------
void mp::update(){
	flArr test;
	//generate atoms from mouse position
//	maxiCollider::createGabor(test, maxiMap::linexp((float)mouseX/ofGetWidth(), 0, 1, 100, 10000) * (1.0 + (ofRandomuf() * 0.2)), 
//					   maxiSettings::sampleRate, 
//					   maxiMap::linlin((float)mouseY / ofGetHeight(), 0, 1, 2000, 40000) * (1.0 + (ofRandomuf() * 0.3)), 
//					   ofRandomf() * PI, 0.3, 0.05);
//	atomStream.addAtom(test);

	//play book back one atom at a time
//	static int atomIdx=0;
//	maxiGaborAtom *atom = (maxiGaborAtom*) book.atoms[atomIdx % book.atoms.size()];
//	maxiCollider::createGabor(test, maxiMap::linlin(atom->frequency, 0.0, 1.0, 20, 20000), 44100, atom->length, atom->phase, 0.3, atom->amp / 30.0);
//	atomStream.addAtom(test);	
//	atomIdx++;
//	cout << (atomIdx % book.atoms.size()) << ", " <<  maxiMap::linlin(atom->frequency, 0.0, 1.0, 20, 20000) << ", " << atom->amp << endl;

}

//--------------------------------------------------------------
void mp::draw(){

}

void mp::audioRequested 	(float * output, int bufferSize, int nChannels){
	atomPlayer.play(book, atomStream, output, bufferSize);
	
	memset(&atomBuffer[0], 0, sizeof(float) * bufferSize);
	atomStream.fillNextBuffer(&(atomBuffer[0]), bufferSize);
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