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
#endif


maxiType sineBuffer2[514]={0,0.012268,0.024536,0.036804,0.049042,0.06131,0.073547,0.085785,0.097992,0.1102,0.12241,0.13455,0.1467,0.15884,0.17093,0.18301,0.19507,0.20709,0.21909,0.23105,0.24295,0.25485,0.26669,0.2785,0.29025,0.30197,0.31366,0.32529,0.33685,0.34839,0.35986,0.37128,0.38266,0.39395,0.40521,0.41641,0.42752,0.4386,0.44958,0.46051,0.47137,0.48215,0.49286,0.50351,0.51407,0.52457,0.53497,0.54529,0.55554,0.5657,0.57578,0.58575,0.59567,0.60547,0.6152,0.62482,0.63437,0.6438,0.65314,0.66238,0.67151,0.68057,0.68951,0.69833,0.70706,0.7157,0.72421,0.7326,0.74091,0.74908,0.75717,0.76514,0.77298,0.7807,0.7883,0.79581,0.80316,0.81042,0.81754,0.82455,0.83142,0.8382,0.84482,0.85132,0.8577,0.86392,0.87006,0.87604,0.88187,0.8876,0.89319,0.89862,0.90396,0.90912,0.91415,0.91907,0.92383,0.92847,0.93295,0.93729,0.9415,0.94556,0.94949,0.95325,0.95691,0.96039,0.96375,0.96692,0.97,0.9729,0.97565,0.97827,0.98074,0.98306,0.98523,0.98724,0.98914,0.99084,0.99243,0.99387,0.99515,0.99628,0.99725,0.99808,0.99875,0.99927,0.99966,0.99988,0.99997,0.99988,0.99966,0.99927,0.99875,0.99808,0.99725,0.99628,0.99515,0.99387,0.99243,0.99084,0.98914,0.98724,0.98523,0.98306,0.98074,0.97827,0.97565,0.9729,0.97,0.96692,0.96375,0.96039,0.95691,0.95325,0.94949,0.94556,0.9415,0.93729,0.93295,0.92847,0.92383,0.91907,0.91415,0.90912,0.90396,0.89862,0.89319,0.8876,0.88187,0.87604,0.87006,0.86392,0.8577,0.85132,0.84482,0.8382,0.83142,0.82455,0.81754,0.81042,0.80316,0.79581,0.7883,0.7807,0.77298,0.76514,0.75717,0.74908,0.74091,0.7326,0.72421,0.7157,0.70706,0.69833,0.68951,0.68057,0.67151,0.66238,0.65314,0.6438,0.63437,0.62482,0.6152,0.60547,0.59567,0.58575,0.57578,0.5657,0.55554,0.54529,0.53497,0.52457,0.51407,0.50351,0.49286,0.48215,0.47137,0.46051,0.44958,0.4386,0.42752,0.41641,0.40521,0.39395,0.38266,0.37128,0.35986,0.34839,0.33685,0.32529,0.31366,0.30197,0.29025,0.2785,0.26669,0.25485,0.24295,0.23105,0.21909,0.20709,0.19507,0.18301,0.17093,0.15884,0.1467,0.13455,0.12241,0.1102,0.097992,0.085785,0.073547,0.06131,0.049042,0.036804,0.024536,0.012268,0,-0.012268,-0.024536,-0.036804,-0.049042,-0.06131,-0.073547,-0.085785,-0.097992,-0.1102,-0.12241,-0.13455,-0.1467,-0.15884,-0.17093,-0.18301,-0.19507,-0.20709,-0.21909,-0.23105,-0.24295,-0.25485,-0.26669,-0.2785,-0.29025,-0.30197,-0.31366,-0.32529,-0.33685,-0.34839,-0.35986,-0.37128,-0.38266,-0.39395,-0.40521,-0.41641,-0.42752,-0.4386,-0.44958,-0.46051,-0.47137,-0.48215,-0.49286,-0.50351,-0.51407,-0.52457,-0.53497,-0.54529,-0.55554,-0.5657,-0.57578,-0.58575,-0.59567,-0.60547,-0.6152,-0.62482,-0.63437,-0.6438,-0.65314,-0.66238,-0.67151,-0.68057,-0.68951,-0.69833,-0.70706,-0.7157,-0.72421,-0.7326,-0.74091,-0.74908,-0.75717,-0.76514,-0.77298,-0.7807,-0.7883,-0.79581,-0.80316,-0.81042,-0.81754,-0.82455,-0.83142,-0.8382,-0.84482,-0.85132,-0.8577,-0.86392,-0.87006,-0.87604,-0.88187,-0.8876,-0.89319,-0.89862,-0.90396,-0.90912,-0.91415,-0.91907,-0.92383,-0.92847,-0.93295,-0.93729,-0.9415,-0.94556,-0.94949,-0.95325,-0.95691,-0.96039,-0.96375,-0.96692,-0.97,-0.9729,-0.97565,-0.97827,-0.98074,-0.98306,-0.98523,-0.98724,-0.98914,-0.99084,-0.99243,-0.99387,-0.99515,-0.99628,-0.99725,-0.99808,-0.99875,-0.99927,-0.99966,-0.99988,-0.99997,-0.99988,-0.99966,-0.99927,-0.99875,-0.99808,-0.99725,-0.99628,-0.99515,-0.99387,-0.99243,-0.99084,-0.98914,-0.98724,-0.98523,-0.98306,-0.98074,-0.97827,-0.97565,-0.9729,-0.97,-0.96692,-0.96375,-0.96039,-0.95691,-0.95325,-0.94949,-0.94556,-0.9415,-0.93729,-0.93295,-0.92847,-0.92383,-0.91907,-0.91415,-0.90912,-0.90396,-0.89862,-0.89319,-0.8876,-0.88187,-0.87604,-0.87006,-0.86392,-0.8577,-0.85132,-0.84482,-0.8382,-0.83142,-0.82455,-0.81754,-0.81042,-0.80316,-0.79581,-0.7883,-0.7807,-0.77298,-0.76514,-0.75717,-0.74908,-0.74091,-0.7326,-0.72421,-0.7157,-0.70706,-0.69833,-0.68951,-0.68057,-0.67151,-0.66238,-0.65314,-0.6438,-0.63437,-0.62482,-0.6152,-0.60547,-0.59567,-0.58575,-0.57578,-0.5657,-0.55554,-0.54529,-0.53497,-0.52457,-0.51407,-0.50351,-0.49286,-0.48215,-0.47137,-0.46051,-0.44958,-0.4386,-0.42752,-0.41641,-0.40521,-0.39395,-0.38266,-0.37128,-0.35986,-0.34839,-0.33685,-0.32529,-0.31366,-0.30197,-0.29025,-0.2785,-0.26669,-0.25485,-0.24295,-0.23105,-0.21909,-0.20709,-0.19507,-0.18301,-0.17093,-0.15884,-0.1467,-0.13455,-0.12241,-0.1102,-0.097992,-0.085785,-0.073547,-0.06131,-0.049042,-0.036804,-0.024536,-0.012268,0,0.012268
};


maxiGrainWindowCache<gaussianWinFunctor> maxiCollider::envCache = maxiGrainWindowCache<gaussianWinFunctor>();

inline void maxiCollider::createGabor(valarray<maxiType> &atom, const maxiType freq, const maxiType sampleRate, const unsigned length,
						 maxiType startPhase, const maxiType kurtotis, const maxiType amp) {
	atom.resize(length);
//    valarray<maxiType> sine;
//    sine.resize(length);
    
	maxiType gausDivisor = (-2.0 * kurtotis * kurtotis);
//    maxiType phase =-1.0;
	maxiType cycleLen = sampleRate / freq;
	maxiType maxPhase = length / cycleLen;
	maxiType inc = 1.0 / length;
    
    
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
    

	
//#ifdef __APPLE_CC__	
//    valarray<maxiType> interpConstants;
//    interpConstants.resize(length);
//    phase = 0.0;
//    vDSP_vramp(&phase, &inc, &interpConstants[0], 1, length);
//    vDSP_vsmsa(&interpConstants[0], 1, &maxPhase, &startPhase, &interpConstants[0], 1, length);
//    maxiType waveTableLength = 512;
//    vDSP_vsmul(&interpConstants[0], 1, &waveTableLength, &interpConstants[0], 1, length);
//    for(uint i=0; i < length; i++) {
//        interpConstants[i] = fmod(interpConstants[i], 512.0f); 
//    }
//    vDSP_vlint(sineBuffer2, &interpConstants[0], 1, &sine[0], 1, length, 514);
//    vDSP_vmul(&atom[0], 1, &sine[0], 1, &atom[0], 1,  length);
//	vDSP_vsmul(&atom[0], 1, &amp, &atom[0], 1, length);
//#else
	maxPhase *= TWOPI;
    for(unsigned int i=0; i < length; i++) {
		//multiply by sinewave
		maxiType x = inc * i;
		atom[i] = (x * maxPhase) + startPhase;
	}
    atom = sin(atom);
    atom *= amp;
//#endif

    maxiType *env = maxiCollider::envCache.getWindow(length);
	for(unsigned i=0; i < length; i++) {
        atom[i] *= env[i];
    }
}




maxiAccelerator::maxiAccelerator() {
	sampleIdx = 0;
    gabor.resize(maxiSettings::bufferSize);
    shape = 1.0;
    atomCountLimit = 9999999;
#ifndef TARGET_OS_IPHONE
    clKernel.setup(maxiSettings::bufferSize);
    atomAmps.resize(clKernel.getMaxAtoms());
    atomPhases.resize(clKernel.getMaxAtoms());
    atomPhaseIncs.resize(clKernel.getMaxAtoms());
    atomPositions.resize(clKernel.getMaxAtoms());
    atomLengths.resize(clKernel.getMaxAtoms());
    atomDataBlock.resize(clKernel.getMaxAtoms());
#endif
}

maxiType * maxiAtomWindowCache::getWindow(int length) {
    if (windows.find(length) == windows.end()) {
        windows[length] = valarray<maxiType>();
        windows[length].resize(length);
        maxiType energy = 0;
        maxiType *win = &(windows[length])[0];
        //make a gaussian window, MPTK compatible
        maxiType p = 1.0 / (2.0 * 0.02 * (length + 1) * (length + 1));
        for(int i=0; i < length; i++) {
            maxiType k = (maxiType) i  - ((maxiType)(length - 1)) / 2.0;
            maxiType val = exp(-k*k*p);
            win[i] = val;
            energy += (2.0 * val * val);
        }
        //normalise
        maxiType scale = 1.0/sqrt(energy);
        for (int i=0; i < length; i++ ) {
            win[i] *= scale;
        }
    }
    return &windows[length][0];
}

void maxiAccelerator::precacheWindows(set<int> &windowSizes) {
    for(set<int>::iterator it = windowSizes.begin(); it != windowSizes.end(); ++it) {
        float *env = winCache.getWindow(*it);
#ifndef TARGET_OS_IPHONE
        clKernel.addWindow(env, *it);
#endif
    }
#ifndef TARGET_OS_IPHONE
    clKernel.uploadWindows();
#endif
}



void maxiAccelerator::addAtom(const maxiType freq, const maxiType phase, const maxiType sampleRate, const unsigned int length, const maxiType amp, const unsigned int offset) {
    if (atomQueue.size() < atomCountLimit) {
        queuedAtom quAtom;
        quAtom.freq = freq;
        quAtom.phase = phase;
        quAtom.length = length;
        quAtom.amp = amp;
        quAtom.env = winCache.getWindow(length);
        maxiType cycleLen = sampleRate / freq;
        quAtom.maxPhase = length / cycleLen;
        quAtom.phaseInc = 1.0 / length;
        quAtom.startTime = sampleIdx + offset;
        quAtom.pos = 0;
        atomQueue.push_back(quAtom);
    }
}

void maxiAccelerator::fillNextBuffer(float *buffer, unsigned int bufferLength) {
	queuedAtomList::iterator it = atomQueue.begin();
	while(it != atomQueue.end()) {
		int atomStart = (*it).startTime + (*it).pos - sampleIdx;
//        cout << "Atomstart: " << atomStart << endl;
		//include in this frame?
		if (atomStart >= 0 && atomStart < bufferLength) {
			//copy into buffer
            int lengthLeft = it->length - it->pos;
            int invOffset = bufferLength - atomStart;
            int renderLength = min(invOffset, lengthLeft);
			for(int i=0; i < renderLength; i++) {
                gabor[i] = ((*it).phaseInc * (i + (*it).pos) * (*it).maxPhase * TWO_PI) + (*it).phase;
			}
#ifdef __VFORCE_H
#ifdef MAXI_SINGLE_PRECISION
            vvcosf(&gabor[0], &gabor[0], &renderLength);
#else
            vvcos(&gabor[0], &gabor[0], &renderLength);
#endif
#else
			for(int i=0; i < renderLength; i++) {
                gabor[i] = cos(gabor[i]);
            }
#endif
            if (shape != 1.0) {
                for(int i=0; i < renderLength; i++) {
                    float v = gabor[i];
                    float sign = v > 0 ? 1.0 : -1.0;
                    v = fabs(v);
                    v = pow(v, shape);
                    v *= sign;
                    gabor[i] = v;
                }
            }
			for(int i=0; i < renderLength; i++) {
                gabor[i] *= (*it).amp;
                gabor[i] *= (*it).env[i + (int)(*it).pos];
                buffer[i + atomStart] += gabor[i];
            }
//            if (it->length == 128) {
//                cout << endl << endl;
//            }
//            if (it->pos == 0) {
//                cout << "new seq: " << (sampleIdx + it->pos) << ", " << it->startTime << endl;
//            }
//            cout << it->pos << ", " << renderLength << endl;
			(*it).pos += renderLength;
//            (*it).offset = 0; //only ever have offset on the first frame
            
		}
		if ((*it).pos >= (*it).length) {
			it = atomQueue.erase(it);
		}else {
			it++;
		}
		
	}
	sampleIdx += bufferLength;
//    cout << atomQueue.size() << endl;
}

#ifndef TARGET_OS_IPHONE
void maxiAccelerator::fillNextBuffer_OpenCL(float *buffer, unsigned int bufferLength) {
	queuedAtomList::iterator it = atomQueue.begin();
	while(it != atomQueue.end()) {
		int atomStart = (*it).startTime + (*it).pos - sampleIdx;
		//include in this frame?
		if (atomStart >= 0 && atomStart < bufferLength) {
			//copy into buffer
            int lengthLeft = it->length - it->pos;
            int invOffset = bufferLength - atomStart;
            int renderLength = min(invOffset, lengthLeft);
            clKernel.gaborSingle(&gabor[0], it->amp, it->phase, (it->phaseInc * it->maxPhase * TWO_PI), (int)(it->pos - atomStart), bufferLength, it->length);
			for(int i=0; i < bufferLength; i++) {
                buffer[i] += gabor[i];
            }
			(*it).pos += renderLength;
		}
		if ((*it).pos >= (*it).length) {
			it = atomQueue.erase(it);
		}else {
			it++;
		}
		
	}
	sampleIdx += bufferLength;
//    cout << atomQueue.size() << endl;
}


void maxiAccelerator::fillNextBuffer_OpenCLBatch(float *buffer, unsigned int bufferLength) {
    int atomCount=0;
	queuedAtomList::iterator it = atomQueue.begin();
	while(it != atomQueue.end()) {
		int atomStart = (*it).startTime + (*it).pos - sampleIdx;
		//include in this frame?
		if (atomStart >= 0 && atomStart < bufferLength) {
			//copy into buffer
            int lengthLeft = it->length - it->pos;
            int invOffset = bufferLength - atomStart;
            int renderLength = min(invOffset, lengthLeft);

            atomAmps[atomCount] = it->amp;
            atomPhases[atomCount] = it->phase;
            atomPhaseIncs[atomCount] = (it->phaseInc * it->maxPhase * TWO_PI);
            atomPositions[atomCount] = (int)(it->pos - atomStart);
            atomLengths[atomCount] = it->length;
            
			(*it).pos += renderLength;
            atomCount++;
		}
		if ((*it).pos >= (*it).length) {
			it = atomQueue.erase(it);
		}else {
			it++;
		}
		
	}
    clKernel.gaborBatch(buffer, atomCount, &atomAmps[0], &atomPhases[0], &atomPhaseIncs[0], &atomPositions[0], &atomLengths[0], bufferLength);
	sampleIdx += bufferLength;
    cout << atomCount << endl;
    
}

void maxiAccelerator::fillNextBuffer_OpenCLBatch2(float *buffer, unsigned int bufferLength) {
    int atomCount=0;
	queuedAtomList::iterator it = atomQueue.begin();
	while(it != atomQueue.end()) {
		int atomStart = (*it).startTime + (*it).pos - sampleIdx;
		//include in this frame?
		if (atomStart >= 0 && atomStart < bufferLength) {
			//copy into buffer
            int lengthLeft = it->length - it->pos;
            int invOffset = bufferLength - atomStart;
            int renderLength = min(invOffset, lengthLeft);
            
            atomDataBlock[atomCount].amp = it->amp;
            atomDataBlock[atomCount].phase = it->phase;
            atomDataBlock[atomCount].phaseInc = (it->phaseInc * it->maxPhase * TWO_PI);
            atomDataBlock[atomCount].position = (int)(it->pos - atomStart);
            atomDataBlock[atomCount].length = it->length;
            
			(*it).pos += renderLength;
            atomCount++;
		}
		if ((*it).pos >= (*it).length) {
			it = atomQueue.erase(it);
		}else {
			it++;
		}
		
	}
    clKernel.gaborBatch2(buffer, atomDataBlock, atomCount);
	sampleIdx += bufferLength;
    cout << atomCount << endl;
    
}

#endif

#include "tinyxml2.h"

bool maxiAtomBook::loadMPTKXmlBook(string filename, maxiAtomBook &book, maxiAccelerator &accel, bool verbose) {
    if (verbose) cout << "Loading " << filename << endl;
	bool ok = false;
    using namespace tinyxml2;
    book.maxAmp = 0;
    XMLDocument doc;
    if (doc.LoadFile(filename.c_str()) == XML_SUCCESS) {
        if (verbose) cout << "Parsed\n";
		XMLElement *root = doc.RootElement();
        const XMLElement *dict = root->FirstChildElement();
        const XMLElement *bookElem = dict->NextSiblingElement();
        int nAtoms = bookElem->FirstAttribute()->IntValue();
        if (verbose) cout << nAtoms << " atoms in book\n";
        bookElem->QueryIntAttribute("numSamples", &book.numSamples);
        if (verbose) cout << book.numSamples << " samples\n";
        bookElem->QueryIntAttribute("sampleRate", &book.sampleRate);
        if (verbose) cout << "Sample Rate: " << book.sampleRate << " Hz\n";
        
        XMLNode *atomNode = const_cast<XMLNode*>(bookElem->FirstChild());
		for(int atomIdx=0; atomIdx < nAtoms; atomIdx++) {
			maxiGaborAtom *newAtom = new maxiGaborAtom();
			newAtom->atomType = GABOR;
            const XMLElement *supportElem = atomNode->FirstChildElement()->NextSibling()->ToElement();
            newAtom->position = atoi(supportElem->FirstChildElement("p")->GetText());
            newAtom->length = atoi(supportElem->FirstChildElement("l")->GetText());
            const XMLElement *ampElem = supportElem->NextSiblingElement();
            newAtom->amp = atof(ampElem->GetText());
            const XMLElement *freqElem = ampElem->NextSiblingElement()->NextSiblingElement();
            newAtom->frequency = atof(freqElem->GetText());
            const XMLElement *phaseElem = freqElem->NextSiblingElement()->NextSiblingElement();
            newAtom->phase = atof(phaseElem->GetText());
//            if (newAtom->frequency > 0) {
                book.atoms.push_back(newAtom);
//            }
            book.maxAmp = max(book.maxAmp, newAtom->amp);
            
            if (book.windowSizes.find(newAtom->length) == book.windowSizes.end()) {
                book.windowSizes.insert(newAtom->length);
            }
            
            atomNode = atomNode->NextSibling();
		}
        
        
        std::sort(book.atoms.begin(), book.atoms.end(), maxiAtom::atomSortPositionAsc);
        
        if (verbose) {
            for(int i=0; i < book.atoms.size(); i++) {
                cout << "Atom: pos: " << book.atoms[i]->position << ", length: " << book.atoms[i]->length << ", amp: " << book.atoms[i]->amp << ", freq: " << ((maxiGaborAtom*)book.atoms[i])->frequency << ", phase: " << ((maxiGaborAtom*)book.atoms[i])->phase << endl;
            }
        }
        accel.precacheWindows(book.windowSizes);
        ok = true;
    }

	return ok;
}

maxiAtomBook::~maxiAtomBook() {
	for(int i=0; i < atoms.size(); i++) delete atoms[i];
}

maxiAtomBookPlayer::maxiAtomBookPlayer() {
	atomIdx = 0;
    probability = 1.0;
    lengthMod = 1.0;
    lowFreq = 20;
    highFreq = 20000;
    lowAmp=0;
    highAmp = 1;
    freqMod = 1;
    playbackSpeed = 1.0;
    gap = 1.0;
    loopedSamplePos = 0;
    snapRange = 1.1;
    snapInvRange = 1.0 / snapRange;
}


void maxiAtomBookPlayer::play(maxiAtomBook &book, maxiAccelerator &atomStream) {
	//positions
	long idx = atomStream.getSampleIdx();

    //    cout << atomIdx << ", " << idx << ", " << loopedSamplePos << endl;
    int totalBlockSize = maxiSettings::bufferSize * playbackSpeed;
	int blockSize = min(totalBlockSize, static_cast<int>(book.numSamples - loopedSamplePos));
    int blockOffset = 0;
    queueAtomsBetween(book, atomStream, loopedSamplePos, loopedSamplePos + blockSize, blockOffset);
    bool loopingThisFrame = blockSize < totalBlockSize;
    if (loopingThisFrame) {
        blockOffset = blockSize;
        blockSize = totalBlockSize - blockSize;
        loopedSamplePos = 0;
        queueAtomsBetween(book, atomStream, loopedSamplePos, loopedSamplePos + blockSize, blockOffset);
    }
    
//	if (atomIdx < book.atoms.size()) {
//	}
    loopedSamplePos += blockSize;
//    if (loopedSamplePos >= book.numSamples) {
//        loopedSamplePos = ;
//    }
//    cout << atomCount << endl;
}

void maxiAtomBookPlayer::queueAtomsBetween(maxiAtomBook &book, maxiAccelerator &atomStream, long start, long end, int blockOffset) {
    static int atomCount = 0;    
    maxiGaborAtom *atom = (maxiGaborAtom*) book.atoms[static_cast<int>(floor(atomIdx))];
    //        cout << atom->position << ", " << loopedSamplePos << ", " << (loopedSamplePos + maxiSettings::bufferSize) << endl;
    float speedMod = playbackSpeed == 0 ? 0 : 1.0 / playbackSpeed;
    while(atom->position < end && atom->position >= start) {
        if (rand() / static_cast<maxiType>(RAND_MAX) < probability) {
            maxiType freq = 44100.0 * atom->frequency;
            maxiType amp = atom->amp;
            if (freq >= lowFreq && freq <= highFreq && amp >= lowAmp && amp <= highAmp * book.maxAmp) {
                if (fmod(atomIdx, gap) <= 1.0 / gap) {
                    if (snapFreqs.size() > 0) {
                        for(int f=0; f < snapFreqs.size(); f++) {
                            if (freq >= snapFreqs[f] * snapInvRange && freq < snapFreqs[f] * snapRange) {
                                freq = snapFreqs[f];
                                break;
                            }
                        }
                    }
                    if (freqMod != 1.0) {
                        freq *= freqMod;
                        freq = maxiMap::clamp<maxiType>(freq, 20, 20000);
                    }
//                    float inv = maxiMap::explin(freq, 20, 20000, 0, 1);
//                    inv = 1.0 - inv;
//                    freq = maxiMap::linexp(inv, 0, 1, 20, 20000);
                    atomStream.addAtom(freq, atom->phase, 44100, atom->length * lengthMod * speedMod, amp, (blockOffset + atom->position - loopedSamplePos) * speedMod);
                    atomCount++;
                }
           }
        }
        atomIdx += playbackSpeed;
        if (atomIdx >= book.atoms.size()) {
            atomIdx = 0;
            break;
        }
        atom = (maxiGaborAtom*) book.atoms[static_cast<int>(floor(atomIdx))];
    }
}

