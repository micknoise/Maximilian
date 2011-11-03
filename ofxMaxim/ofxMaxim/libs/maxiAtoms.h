/*
 *  gabor.h
 *  mp
 *
 *  Created by Chris on 01/11/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "someTypes.h"
#include <iostream>
#include "maximilian.h"
#include <list>

using namespace std;

class maxiAtoms {
public:
	static void createGabor(flArr &atom, const float freq, const float sampleRate, const uint length, 
							const float phase, const float kurtotis, const float amp);
};

class maxiAtomStream {
public:
	maxiAtomStream();
	void addAtom(flArr &atom);
	void fillNextBuffer(float *buffer, unsigned int bufferLength);
private:
	long sampleIdx;
	struct queuedAtom {
		flArr atom;
		long startTime;
		unsigned int pos;
	};
	typedef list<queuedAtom> queuedAtomList;
	queuedAtomList atomQueue;
};