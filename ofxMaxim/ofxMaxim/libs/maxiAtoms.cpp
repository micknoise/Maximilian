/*
 *  gabor.cpp
 *  mp
 *
 *  Created by Chris on 01/11/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "maxiAtoms.h"
#include <iostream>

void maxiAtoms::createGabor(flArr &atom, const float freq, const float sampleRate, const uint length, 
						const float startPhase, const float kurtotis, const float amp) {
	atom.resize(length);
	float inc = 1.0 / length * 2.0;
	
	float cycleLen = sampleRate / freq;
	float maxPhase = length / cycleLen * TWOPI;
	
	for(uint i=0; i < length; i++) {
		float x = -1.0 + (inc * i);
		//gaussian envelope
		atom[i] = exp((x * x) / (-2.0 * kurtotis * kurtotis));
		
		//multiply by sinewave
		//rescale x from 0 to 1
		x = (x+1.0) / 2.0;
		
		atom[i] *= sin((x * maxPhase) + startPhase);
	}
	for(uint i=0; i < length; i++) {
		atom[i] *= amp;
	}
}



maxiAtomStream::maxiAtomStream() {
	sampleIdx = 0;
}

void maxiAtomStream::addAtom(flArr &atom) {
	queuedAtom quAtom;
	quAtom.atom.copyFromArray(atom);
	quAtom.startTime = sampleIdx;
	quAtom.pos = 0;
	atomQueue.push_back(quAtom);
}

void maxiAtomStream::fillNextBuffer(float *buffer, unsigned int bufferLength) {
	queuedAtomList::iterator it = atomQueue.begin();
	while(it != atomQueue.end()) {
		int atomStart = (*it).startTime + (*it).pos;
		//include in this frame?
		if (atomStart >= sampleIdx && atomStart < sampleIdx + bufferLength) {
			//copy into buffer
			int renderLength = min(bufferLength, (*it).atom.size() - (*it).pos);
			for(int i=0; i < renderLength; i++) {
				buffer[i] += (*it).atom[i + (*it).pos];
			}
			(*it).pos += renderLength;
		}
		if ((*it).pos == (*it).atom.size()) {
			it = atomQueue.erase(it);
		}else {
			it++;
		}
		
	}
	sampleIdx += bufferLength;
}