/*
 *  maximilian
 *  platform independent synthesis library
 *
 *  Created by Mick Grierson on 29/12/2009.
 *  Copyright 2009 Mick Grierson & Strangeloop Limited. All rights reserved.
 *	Thanks to the Goldsmiths Creative Computing Team.
 *	Special thanks to Arturo Castro for the PortAudio implementation.
 * 
 *	Permission is hereby granted, free of charge, to any person
 *	obtaining a copy of this software and associated documentation
 *	files (the "Software"), to deal in the Software without
 *	restriction, including without limitation the rights to use,
 *	copy, modify, merge, publish, distribute, sublicense, and/or sell
 *	copies of the Software, and to permit persons to whom the
 *	Software is furnished to do so, subject to the following
 *	conditions:
 *	
 *	The above copyright notice and this permission notice shall be
 *	included in all copies or substantial portions of the Software.
 *
 *	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,	
 *	EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 *	OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *	NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 *	HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 *	WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 *	FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 *	OTHER DEALINGS IN THE SOFTWARE.
 *
 */

#ifndef _MAXIM_H
#define _MAXIM_H

//#include "maximilian.h"
#include "maxiFFT.h"
#include "maxiGrains.h"
#include "maxiMFCC.h"
#include "maxiBark.h"
#include "maxiAtoms.h"


//typedef maxiSignal vector<double>;
//
//class maxiBase {
//    virtual maxiSignal play() = {};
//};
//
//class ofMaxiSine : public maxiBase {
//    maxiOsc osc;
//    double freq;
//    
//    void update(double freq) {
//        freq = freq;
//    }
//    void play() {
//        osc.sine(freq);
//    }
//}
//
//
//class maxiNoise : public maxiBase {
//    maxiBase* update() {
//        //do something?
//    };
//    
//    double play() {
//        return rand() / (float)RAND_MAX;
//    }
//};
//
//class maxiAnotherUGen : public maxiBase {
//    maxiBase* update(double param1, bool param2);
//};
//
//class maxiYetAnotherUGen : public maxiBase {
//    maxiBase* update(int something, float somethingElse);
//};
//
//void maxiProcess(maxiSignal &signal, maxiBase *ugen) {
//    double val = ugen->play();
//    for(int i=0; i < signal.size(); i++) {
//        signal[i] = val;
//    }
//}
//
//void maxiBlock(maxiSignal &signal, maxiBase *ugen) {
//    for (int i=0; i < 64; i++) {
//        maxiProcess(signal, ugen);
//    }
//}
//
//typedef maxiUGens vector<maxiBase>
//
//maxiNoise ugen1;
//maxiAnotherUGen ugen2;
//maxiUGens ugen1 = createUGens(maxiNoise, 2);
//
//maxiSignal sig(2);
//maxiProcess(sig, ugen1.update());
//maxiProcess(sig, ugen2.update(8.2, false));
//
//ugen.update(2,3)->play();
            

#endif
