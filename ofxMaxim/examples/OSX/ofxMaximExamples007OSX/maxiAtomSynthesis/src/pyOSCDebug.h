/*
 *  pyOSCDebug.h
 *  bastardPop
 *
 *  Created by Chris on 25/10/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "ofxOSC.h"
#include <vector>

class pyOSCDebug {
public:
	pyOSCDebug();
	void setup(string host, int port);
	void clear();
	void send(vector<float> data);
	void send(float *data, unsigned int count);
private:
	ofxOscSender osc;
	bool ready;
	
};