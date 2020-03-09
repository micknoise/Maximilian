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
#include "sineTable.h"
#ifdef __APPLE_CC__
#include <Accelerate/Accelerate.h>
#warning ofxMaxim: Please link against the accelerate framework.
#endif

//#include "tinyxml.h"

float sineBuffer2[514]={0,0.012268,0.024536,0.036804,0.049042,0.06131,0.073547,0.085785,0.097992,0.1102,0.12241,0.13455,0.1467,0.15884,0.17093,0.18301,0.19507,0.20709,0.21909,0.23105,0.24295,0.25485,0.26669,0.2785,0.29025,0.30197,0.31366,0.32529,0.33685,0.34839,0.35986,0.37128,0.38266,0.39395,0.40521,0.41641,0.42752,0.4386,0.44958,0.46051,0.47137,0.48215,0.49286,0.50351,0.51407,0.52457,0.53497,0.54529,0.55554,0.5657,0.57578,0.58575,0.59567,0.60547,0.6152,0.62482,0.63437,0.6438,0.65314,0.66238,0.67151,0.68057,0.68951,0.69833,0.70706,0.7157,0.72421,0.7326,0.74091,0.74908,0.75717,0.76514,0.77298,0.7807,0.7883,0.79581,0.80316,0.81042,0.81754,0.82455,0.83142,0.8382,0.84482,0.85132,0.8577,0.86392,0.87006,0.87604,0.88187,0.8876,0.89319,0.89862,0.90396,0.90912,0.91415,0.91907,0.92383,0.92847,0.93295,0.93729,0.9415,0.94556,0.94949,0.95325,0.95691,0.96039,0.96375,0.96692,0.97,0.9729,0.97565,0.97827,0.98074,0.98306,0.98523,0.98724,0.98914,0.99084,0.99243,0.99387,0.99515,0.99628,0.99725,0.99808,0.99875,0.99927,0.99966,0.99988,0.99997,0.99988,0.99966,0.99927,0.99875,0.99808,0.99725,0.99628,0.99515,0.99387,0.99243,0.99084,0.98914,0.98724,0.98523,0.98306,0.98074,0.97827,0.97565,0.9729,0.97,0.96692,0.96375,0.96039,0.95691,0.95325,0.94949,0.94556,0.9415,0.93729,0.93295,0.92847,0.92383,0.91907,0.91415,0.90912,0.90396,0.89862,0.89319,0.8876,0.88187,0.87604,0.87006,0.86392,0.8577,0.85132,0.84482,0.8382,0.83142,0.82455,0.81754,0.81042,0.80316,0.79581,0.7883,0.7807,0.77298,0.76514,0.75717,0.74908,0.74091,0.7326,0.72421,0.7157,0.70706,0.69833,0.68951,0.68057,0.67151,0.66238,0.65314,0.6438,0.63437,0.62482,0.6152,0.60547,0.59567,0.58575,0.57578,0.5657,0.55554,0.54529,0.53497,0.52457,0.51407,0.50351,0.49286,0.48215,0.47137,0.46051,0.44958,0.4386,0.42752,0.41641,0.40521,0.39395,0.38266,0.37128,0.35986,0.34839,0.33685,0.32529,0.31366,0.30197,0.29025,0.2785,0.26669,0.25485,0.24295,0.23105,0.21909,0.20709,0.19507,0.18301,0.17093,0.15884,0.1467,0.13455,0.12241,0.1102,0.097992,0.085785,0.073547,0.06131,0.049042,0.036804,0.024536,0.012268,0,-0.012268,-0.024536,-0.036804,-0.049042,-0.06131,-0.073547,-0.085785,-0.097992,-0.1102,-0.12241,-0.13455,-0.1467,-0.15884,-0.17093,-0.18301,-0.19507,-0.20709,-0.21909,-0.23105,-0.24295,-0.25485,-0.26669,-0.2785,-0.29025,-0.30197,-0.31366,-0.32529,-0.33685,-0.34839,-0.35986,-0.37128,-0.38266,-0.39395,-0.40521,-0.41641,-0.42752,-0.4386,-0.44958,-0.46051,-0.47137,-0.48215,-0.49286,-0.50351,-0.51407,-0.52457,-0.53497,-0.54529,-0.55554,-0.5657,-0.57578,-0.58575,-0.59567,-0.60547,-0.6152,-0.62482,-0.63437,-0.6438,-0.65314,-0.66238,-0.67151,-0.68057,-0.68951,-0.69833,-0.70706,-0.7157,-0.72421,-0.7326,-0.74091,-0.74908,-0.75717,-0.76514,-0.77298,-0.7807,-0.7883,-0.79581,-0.80316,-0.81042,-0.81754,-0.82455,-0.83142,-0.8382,-0.84482,-0.85132,-0.8577,-0.86392,-0.87006,-0.87604,-0.88187,-0.8876,-0.89319,-0.89862,-0.90396,-0.90912,-0.91415,-0.91907,-0.92383,-0.92847,-0.93295,-0.93729,-0.9415,-0.94556,-0.94949,-0.95325,-0.95691,-0.96039,-0.96375,-0.96692,-0.97,-0.9729,-0.97565,-0.97827,-0.98074,-0.98306,-0.98523,-0.98724,-0.98914,-0.99084,-0.99243,-0.99387,-0.99515,-0.99628,-0.99725,-0.99808,-0.99875,-0.99927,-0.99966,-0.99988,-0.99997,-0.99988,-0.99966,-0.99927,-0.99875,-0.99808,-0.99725,-0.99628,-0.99515,-0.99387,-0.99243,-0.99084,-0.98914,-0.98724,-0.98523,-0.98306,-0.98074,-0.97827,-0.97565,-0.9729,-0.97,-0.96692,-0.96375,-0.96039,-0.95691,-0.95325,-0.94949,-0.94556,-0.9415,-0.93729,-0.93295,-0.92847,-0.92383,-0.91907,-0.91415,-0.90912,-0.90396,-0.89862,-0.89319,-0.8876,-0.88187,-0.87604,-0.87006,-0.86392,-0.8577,-0.85132,-0.84482,-0.8382,-0.83142,-0.82455,-0.81754,-0.81042,-0.80316,-0.79581,-0.7883,-0.7807,-0.77298,-0.76514,-0.75717,-0.74908,-0.74091,-0.7326,-0.72421,-0.7157,-0.70706,-0.69833,-0.68951,-0.68057,-0.67151,-0.66238,-0.65314,-0.6438,-0.63437,-0.62482,-0.6152,-0.60547,-0.59567,-0.58575,-0.57578,-0.5657,-0.55554,-0.54529,-0.53497,-0.52457,-0.51407,-0.50351,-0.49286,-0.48215,-0.47137,-0.46051,-0.44958,-0.4386,-0.42752,-0.41641,-0.40521,-0.39395,-0.38266,-0.37128,-0.35986,-0.34839,-0.33685,-0.32529,-0.31366,-0.30197,-0.29025,-0.2785,-0.26669,-0.25485,-0.24295,-0.23105,-0.21909,-0.20709,-0.19507,-0.18301,-0.17093,-0.15884,-0.1467,-0.13455,-0.12241,-0.1102,-0.097992,-0.085785,-0.073547,-0.06131,-0.049042,-0.036804,-0.024536,-0.012268,0,0.012268
};


maxiGrainWindowCache<gaussianWinFunctor> maxiCollider::envCache = maxiGrainWindowCache<gaussianWinFunctor>();

inline void maxiCollider::createGabor(flArr &atom, const float freq, const float sampleRate, const unsigned length, 
						 float startPhase, const float kurtotis, const float amp) {
	atom.resize(length);
    flArr sine;
    sine.resize(length);
    
//	float gausDivisor = (-2.0 * kurtotis * kurtotis);
//    float phase =-1.0;
    
    double *env = maxiCollider::envCache.getWindow(length);
#ifdef __APPLE_CC__	    
    vDSP_vdpsp(env, 1, &atom[0], 1, length);
#else    
	for(unsigned i=0; i < length; i++) {
        atom[i] = env[i];
    }
#endif
    
//#ifdef __APPLE_CC__	    
//    vDSP_vramp(&phase, &inc, &atom[0], 1, length);
//    vDSP_vsq(&atom[0], 1,  &atom[0], 1, length);
//    vDSP_vsdiv(&atom[0], 1, &gausDivisor, &atom[0], 1, length);
//    for(uint i=0; i < length; i++) atom[i] = exp(atom[i]);
//#else
//	for(uint i=0; i < length; i++) {
//		//gaussian envelope
//		atom[i] = exp((phase* phase) / gausDivisor);
//        phase += inc;
//    }
//#endif
    
	float cycleLen = sampleRate / freq;
	float maxPhase = length / cycleLen;
	float inc = 1.0 / length;

	
#ifdef __APPLE_CC__	
    flArr interpConstants;
    interpConstants.resize(length);
    float phase = 0.0;
    vDSP_vramp(&phase, &inc, &interpConstants[0], 1, length);
    vDSP_vsmsa(&interpConstants[0], 1, &maxPhase, &startPhase, &interpConstants[0], 1, length);
    float waveTableLength = 512;
    vDSP_vsmul(&interpConstants[0], 1, &waveTableLength, &interpConstants[0], 1, length);
    for(uint i=0; i < length; i++) {
        interpConstants[i] = fmod(interpConstants[i], 512.0f); 
    }
    vDSP_vlint(sineBuffer2, &interpConstants[0], 1, &sine[0], 1, length, 514);
    vDSP_vmul(&atom[0], 1, &sine[0], 1, &atom[0], 1,  length);
	vDSP_vsmul(&atom[0], 1, &amp, &atom[0], 1, length);
#else
	maxPhase *= TWOPI;
    for(unsigned int i=0; i < length; i++) {
		//multiply by sinewave
		float x = inc * i;
		sine[i] = sin((x * maxPhase) + startPhase);
	}
	for(unsigned int i=0; i < length; i++) {
        atom[i] *= sine[i];
		atom[i] *= amp;
	}
#endif
}



maxiAccelerator::maxiAccelerator() {
	sampleIdx = 0;
}

void maxiAccelerator::addAtom(flArr &atom, unsigned int offset) {
	queuedAtom quAtom;
	quAtom.atom = atom;
	quAtom.startTime = sampleIdx + offset;
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
			int renderLength = min((int)bufferLength,(int)( (*it).atom.size() - (*it).pos));
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

//bool maxiAtomBook::loadMPTKXmlBook(string filename, maxiAtomBook &book) {
//	bool ok;
//	ifstream f;
//	f.open(filename.c_str());
//	if (f.fail()) {
//		cout << "I couldn't open " << filename << endl;
//		ok = false;
//	}else {
//		cout << "Reading " << filename << endl;
//		const int lineBufferSize = 1024;
//		char lineBuffer[lineBufferSize];
//		string line("");
//		//get dictionary definition xml
//		while("</dict>" != line) {
//			f.getline(lineBuffer, lineBufferSize);
//			line = lineBuffer;
//		}
//		//this should be "txt"
//		f.getline(lineBuffer, lineBufferSize);
//		//get rest of data into one string
//		string xmlData;
//		while(!f.eof()) {
//			f.getline(lineBuffer, lineBufferSize);
//			xmlData.append(lineBuffer);
//		}
//		TiXmlDocument doc;
//		doc.Parse(xmlData.c_str());
//		cout << "Parsed xml, processing atoms...\n";
//		TiXmlHandle docHandle = TiXmlHandle(&doc);
//		
//		TiXmlElement *root = docHandle.FirstChildElement("book").ToElement();
//		TiXmlAttribute *nAtomsAtt = root->FirstAttribute();
//		cout << nAtomsAtt->Name() << ", " << nAtomsAtt->Value() << endl;
//		int nAtoms = atoi(nAtomsAtt->Value());
//		TiXmlAttribute *numSamplesAtt = nAtomsAtt->Next()->Next();
//		cout << numSamplesAtt->Name() << ", " << numSamplesAtt->Value() << endl;
//		book.numSamples = atoi(numSamplesAtt->Value());
//		TiXmlAttribute *sampleRateAtt = numSamplesAtt->Next();
//		cout << sampleRateAtt->Name() << ", " << sampleRateAtt->Value() << endl;
//		book.sampleRate = atoi(sampleRateAtt->Value());
//		
//		for(int atomIdx=0; atomIdx < nAtoms; atomIdx++) {
//			maxiGaborAtom *newAtom = new maxiGaborAtom();
//			newAtom->atomType = GABOR;
//			TiXmlElement *atom = docHandle.FirstChildElement("book").ChildElement("atom", atomIdx).ToElement();
//			TiXmlElement *node = atom->FirstChildElement()->NextSibling()->ToElement();
//			newAtom->position = atoi(node->FirstChildElement("p")->FirstChild()->ToText()->Value());
//			newAtom->length = atoi(node->FirstChildElement("l")->FirstChild()->ToText()->Value());
//			node = node->NextSibling()->ToElement();
//			newAtom->amp = atof(node->FirstChild()->ToText()->Value());
//			node = node->NextSibling()->NextSibling()->ToElement();
//			newAtom->frequency = atof(node->FirstChild()->ToText()->Value());
//			node = node->NextSibling()->NextSibling()->ToElement();
//			newAtom->phase = atof(node->FirstChild()->ToText()->Value());
//			//cout << "Atom: pos: " << newAtom->position << ", length: " << newAtom->length << ", amp: " << newAtom->amp << ", freq: " << newAtom->frequency << ", phase: " << newAtom->phase << endl;
//			book.atoms.push_back(newAtom);
//		}
//		
//	}
//	return ok;
//}

maxiAtomBook::~maxiAtomBook() {
	for(int i=0; i < atoms.size(); i++) delete atoms[i];
}

maxiAtomBookPlayer::maxiAtomBookPlayer() {
	atomIdx = 0;
}

void maxiAtomBookPlayer::play(maxiAtomBook &book, maxiAccelerator &atomStream, float *output, int bufferSize) {
	//positions
	long idx = atomStream.getSampleIdx();
	int loopedSamplePos = idx % book.numSamples;

	//reset loop?
	if (loopedSamplePos < bufferSize)
		atomIdx = 0;
	
	if (atomIdx < book.atoms.size()) {
		maxiGaborAtom *atom = (maxiGaborAtom*) book.atoms[atomIdx];
		while(atom->position < (idx + bufferSize) % book.numSamples) {
			flArr atomData;
			maxiCollider::createGabor(atomData, maxiMap::linlin(atom->frequency, 0.0, 1.0, 20, 20000), 44100, atom->length, atom->phase, 0.3, atom->amp / 40.0);
			atomStream.addAtom(atomData, loopedSamplePos - atom->position);		
			atomIdx++;
			if (book.atoms.size() == atomIdx)
				break;
			atom = (maxiGaborAtom*) book.atoms[atomIdx];
		}
	}
}
