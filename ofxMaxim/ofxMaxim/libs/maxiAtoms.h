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
#include <vector>

using namespace std;

enum maxiAtomTypes {
	GABOR
};

struct maxiAtom {
	maxiAtomTypes atomType;
	float length;
	float position;
	float amp;
	static bool atomSortPositionAsc(maxiAtom* a, maxiAtom* b) {return a->position < b->position;}
};

struct maxiGaborAtom : maxiAtom {
	float frequency;
	float phase;
};

//create atoms
class maxiCollider {
public:
	static void createGabor(flArr &atom, const float freq, const float sampleRate, const uint length, 
							const float phase, const float kurtotis, const float amp);
};

//queue atoms into an audio stream
class maxiAccelerator {
public:
	maxiAccelerator();
	void addAtom(flArr &atom);
	void fillNextBuffer(float *buffer, unsigned int bufferLength);
	inline long getSampleIdx(){return sampleIdx;}
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

//load a book in MPTK XML format
//http://mptk.irisa.fr/

class maxiAtomBook {
public:
	~maxiAtomBook();
	typedef vector<maxiAtom*> maxiAtomBookData;
	unsigned int numSamples;
	unsigned int sampleRate;
	maxiAtomBookData atoms;
	static bool loadMPTKXmlBook(string filename, maxiAtomBook &book);
	
};

