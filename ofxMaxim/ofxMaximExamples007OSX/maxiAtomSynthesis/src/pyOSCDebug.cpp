/*
 *  pyOSCDebug.cpp
 *  bastardPop
 *
 *  Created by Chris on 25/10/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "pyOSCDebug.h"

pyOSCDebug::pyOSCDebug() {
	ready = false;
}

void pyOSCDebug::setup(string host, int port) {
	osc.setup(host, port);
	ready = true;
}

void pyOSCDebug::clear() {
	if (ready) {
		ofxOscMessage m;
		m.setAddress("/clear");
		osc.sendMessage(m);
	}
}


void pyOSCDebug::send(vector<float> data) {
	send(&(data[0]), data.size());
}

void pyOSCDebug::send(float *data, unsigned int count) {
	if (ready) {
		ofxOscMessage m;
		m.setAddress("/data");
		for(int i=0; i < count; i++) {
			m.addFloatArg(data[i]);
		}
		osc.sendMessage(m);
	}
}


