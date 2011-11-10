#pragma once

#include "ofMain.h"
#include "ofxMaxim.h"
#include "maxiAtoms.h"
//#include "pyOSCDebug.h"

class mp : public ofBaseApp{

	public:
		void setup();
		void update();
		void draw();

		void keyPressed  (int key);
		void keyReleased(int key);
		void mouseMoved(int x, int y );
		void mouseDragged(int x, int y, int button);
		void mousePressed(int x, int y, int button);
		void mouseReleased(int x, int y, int button);
		void windowResized(int w, int h);
		void dragEvent(ofDragInfo dragInfo);
		void gotMessage(ofMessage msg);
	
		void audioRequested 	(float * input, int bufferSize, int nChannels); /* output method */

//	pyOSCDebug pyd;
	maxiAccelerator atomStream;
	maxiAtomBook book;
	maxiAtomBookPlayer atomPlayer;
	
	flArr atomBuffer;
	flArr atomData;
	


};
