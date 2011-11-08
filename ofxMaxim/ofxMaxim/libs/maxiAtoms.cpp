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
#include <fstream>
#include "tinyxml.h"

void maxiCollider::createGabor(flArr &atom, const float freq, const float sampleRate, const uint length, 
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



maxiAccelerator::maxiAccelerator() {
	sampleIdx = 0;
}

void maxiAccelerator::addAtom(flArr &atom) {
	queuedAtom quAtom;
	quAtom.atom.copyFromArray(atom);
	quAtom.startTime = sampleIdx;
	quAtom.pos = 0;
	atomQueue.push_back(quAtom);
}

void maxiAccelerator::fillNextBuffer(float *buffer, unsigned int bufferLength) {
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

bool maxiAtomBook::loadMPTKXmlBook(string filename, maxiAtomBook &book) {
	bool ok;
	ifstream f;
	f.open(filename.c_str());
	if (f.fail()) {
		cout << "I couldn't open " << filename << endl;
		ok = false;
	}else {
		cout << "Reading " << filename << endl;
		const int lineBufferSize = 1024;
		char lineBuffer[lineBufferSize];
		string line("");
		//get dictionary definition xml
		while("</dict>" != line) {
			f.getline(lineBuffer, lineBufferSize);
			line = lineBuffer;
			cout << line << endl;
		}
		//this should be "txt"
		f.getline(lineBuffer, lineBufferSize);
		//get rest of data into one string
		string xmlData;
		while(!f.eof()) {
			f.getline(lineBuffer, lineBufferSize);
			xmlData.append(lineBuffer);
		}
		TiXmlDocument doc;
		doc.Parse(xmlData.c_str());
		cout << "Parsed xml, processing atoms...\n";
		TiXmlHandle docHandle = TiXmlHandle(&doc);
		
		TiXmlElement *root = docHandle.FirstChildElement("book").ToElement();
		TiXmlAttribute *nAtomsAtt = root->FirstAttribute();
		cout << nAtomsAtt->Name() << ", " << nAtomsAtt->Value() << endl;
		int nAtoms = atoi(nAtomsAtt->Value());
		TiXmlAttribute *numSamplesAtt = nAtomsAtt->Next()->Next();
		cout << numSamplesAtt->Name() << ", " << numSamplesAtt->Value() << endl;
		book.numSamples = atoi(numSamplesAtt->Value());
		TiXmlAttribute *sampleRateAtt = numSamplesAtt->Next();
		cout << sampleRateAtt->Name() << ", " << sampleRateAtt->Value() << endl;
		book.sampleRate = atoi(sampleRateAtt->Value());
		
		for(int atomIdx=0; atomIdx < nAtoms; atomIdx++) {
			maxiGaborAtom *newAtom = new maxiGaborAtom();
			newAtom->atomType = GABOR;
			TiXmlElement *atom = docHandle.FirstChildElement("book").ChildElement("atom", atomIdx).ToElement();
			TiXmlElement *node = atom->FirstChildElement()->NextSibling()->ToElement();
			newAtom->position = atoi(node->FirstChildElement("p")->FirstChild()->ToText()->Value());
			newAtom->length = atoi(node->FirstChildElement("l")->FirstChild()->ToText()->Value());
			node = node->NextSibling()->ToElement();
			newAtom->amp = atof(node->FirstChild()->ToText()->Value());
			node = node->NextSibling()->NextSibling()->ToElement();
			newAtom->frequency = atof(node->FirstChild()->ToText()->Value());
			node = node->NextSibling()->NextSibling()->ToElement();
			newAtom->phase = atof(node->FirstChild()->ToText()->Value());
			//cout << "Atom: pos: " << newAtom->position << ", length: " << newAtom->length << ", amp: " << newAtom->amp << ", freq: " << newAtom->frequency << ", phase: " << newAtom->phase << endl;
			book.atoms.push_back(newAtom);
		}
		
	}
	return ok;
}

maxiAtomBook::~maxiAtomBook() {
	for(int i=0; i < atoms.size(); i++) delete atoms[i];
}
