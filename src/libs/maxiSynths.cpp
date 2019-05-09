//
//  maxiSynths.cpp
//  granular
//
//  Created by Michael Grierson on 16/08/2015.
//
//

#include "maxiSynths.h"

maxiKick::maxiKick(){

    maxiKick::envelope.setAttack(0);
    maxiKick::setPitch(200);
    maxiKick::envelope.setDecay(1);
    maxiKick::envelope.setSustain(1);
    maxiKick::envelope.setRelease(500);
    maxiKick::envelope.holdtime=1;
    maxiKick::envelope.trigger=0;

};

double maxiKick::play(){

    envOut=envelope.adsr(1.,envelope.trigger);

    if (inverse) {

        envOut=fabs(1-envOut);

    }

    output=kick.sinewave(pitch*envOut)*envOut;

    if (envelope.trigger==1) {
        envelope.trigger=0;
    }

    if (useDistortion) {

        output=distort.fastAtanDist(output, distortion);
    }

    if (useFilter) {

        output=filter.lores(output, cutoff, resonance);

    }

    if (useLimiter) {

        if (output*gain > 1) {

            return 1.;

        } else if (output*gain < -1) {

            return -1.;

        } else {

            return output*gain;

        }



    } else {

        return output*gain;

    }
};

void maxiKick::setRelease(double release) {

    envelope.setRelease(release);

}

// void maxiKick::setPitch(double newPitch) {
//
//     pitch=newPitch;
//
// }
//
void maxiKick::trigger() {

    envelope.trigger=1;

}

maxiSnare::maxiSnare(){

    maxiSnare::envelope.setAttack(0);
    maxiSnare::setPitch(800);
    maxiSnare::envelope.setDecay(20);
    maxiSnare::envelope.setSustain(0.05);
    maxiSnare::envelope.setRelease(300);
    maxiSnare::envelope.holdtime=1;
    maxiSnare::envelope.trigger=0;

};

double maxiSnare::play(){

    envOut=envelope.adsr(1.,envelope.trigger);

    if (inverse) {

        envOut=fabs(1-envOut);

    }

    output=(tone.triangle(pitch*(0.1+(envOut*0.85)))+noise.noise())*envOut;

    if (envelope.trigger==1) {
        envelope.trigger=0;
    }

    if (useDistortion) {

        output=distort.fastAtanDist(output, distortion);
    }

    if (useFilter) {

        output=filter.lores(output, cutoff, resonance);

    }

    if (useLimiter) {

        if (output*gain > 1) {

            return 1.;

        } else if (output*gain < -1) {

            return -1.;

        } else {

            return output*gain;

        }



    } else {

        return output*gain;

    }

};

void maxiSnare::setRelease(double release) {

    envelope.setRelease(release);

}

void maxiSnare::setPitch(double newPitch) {

    pitch=newPitch;

}

void maxiSnare::trigger() {

    envelope.trigger=1;

}

maxiHats::maxiHats(){

    maxiHats::envelope.setAttack(0);
    maxiHats::setPitch(12000);
    maxiHats::envelope.setDecay(20);
    maxiHats::envelope.setSustain(0.1);
    maxiHats::envelope.setRelease(300);
    maxiHats::envelope.holdtime=1;
    maxiHats::envelope.trigger=0;
    maxiHats::filter.setCutoff(8000);
    maxiHats::filter.setResonance(1);

};

double maxiHats::play(){

    envOut=envelope.adsr(1.,envelope.trigger);

    if (inverse) {

        envOut=fabs(1-envOut);

    }

    output=(tone.sinebuf(pitch)+noise.noise())*envOut;

    if (envelope.trigger==1) {
        envelope.trigger=0;
    }

    if (useDistortion) {

        output=distort.fastAtanDist(output, distortion);
    }

    if (useFilter) {

        output=filter.play(output, 0., 0., 1., 0.);

    }

    if (useLimiter) {

        if (output*gain > 1) {

            return 1.;

        } else if (output*gain < -1) {

            return -1.;

        } else {

            return output*gain;

        }



    } else {

        return output*gain;

    }

};

void maxiHats::setRelease(double release) {

    envelope.setRelease(release);

}

void maxiHats::setPitch(double newPitch) {

    pitch=newPitch;

}

void maxiHats::trigger() {

    envelope.trigger=1;

}




maxiClock::maxiClock() {

    playHead=0;
    currentCount=0;
    lastCount=0;
    bpm=120;
    ticks=1;
    maxiClock::setTempo(bpm);

}


void maxiClock::ticker() {

    tick=false;
    currentCount=floor(timer.phasor(bps));//this sets up a metronome that ticks n times a second

    if (lastCount!=currentCount) {//if we have a new timer int this sample,

        tick=true;
        playHead++;//iterate the playhead

    }

}


void maxiClock::setTempo(double bpmIn) {

    bpm=bpmIn;
    bps=(bpm/60.)*ticks;
}


void maxiClock::setTicksPerBeat(int ticksPerBeat) {

    ticks=ticksPerBeat;
    maxiClock::setTempo(bpm);

}


maxiSampler::maxiSampler() {

    maxiSampler::voices=32;
    maxiSampler::currentVoice=0;


    for (int i=0;i<voices;i++) {

        maxiSampler::envelopes[i].setAttack(0);
        maxiSampler::envelopes[i].setDecay(1);
        maxiSampler::envelopes[i].setSustain(1.);
        maxiSampler::envelopes[i].setRelease(2000);
        maxiSampler::envelopes[i].holdtime=1;
        maxiSampler::envelopes[i].trigger=0;
        maxiSampler::envOut[i]=0;
        maxiSampler::pitch[i]=0;
        maxiSampler::outputs[i]=0;


    }
}

void maxiSampler::setNumVoices(int numVoices) {

    voices=numVoices;

}

double maxiSampler::play() {

    output=0;

    for (int i=0;i<voices;i++) {

            envOut[i]=envelopes[i].adsr(envOutGain[i],envelopes[i].trigger);

          if (envOut[i]>0.) {
              outputs[i]=samples[i].play(pitchRatios[(int)pitch[i]+originalPitch]*((1./samples[i].getLength())*maxiSettings::sampleRate),0,samples[i].getLength())*envOut[i];
            output+=outputs[i]/voices;

            if (envelopes[i].trigger==1 && !sustain) {
                envelopes[i].trigger=0;

            }

        }

    } return output;

}

void maxiSampler::load(string inFile, bool setall) {

    if (setall) {
        for (int i=0;i<voices;i++) {

            samples[i].load(inFile);

        }

    } else {

        samples[currentVoice].load(inFile);

    }


}

void maxiSampler::setPitch(double pitchIn, bool setall) {

    if (setall) {
        for (int i=0;i<voices;i++) {

            pitch[i]=pitchIn;

        }

    } else {

    pitch[currentVoice]=pitchIn;

    }

}

void maxiSampler::midiNoteOn(double pitchIn, double velocity, bool setall) {

    if (setall) {
        for (int i=0;i<voices;i++) {

            pitch[i]=pitchIn;

        }

    } else {

            pitch[currentVoice]=pitchIn;
            envOutGain[currentVoice]=velocity/128;

    }

}

void maxiSampler::midiNoteOff(double pitchIn, double velocity, bool setall) {


        for (int i=0;i<voices;i++){

            if (pitch[i]==pitchIn) {

                envelopes[i].trigger=0;

        }

    }
}


void maxiSampler::setAttack(double attackD, bool setall) {

    if (setall) {

        for (int i=0;i<voices;i++) {

            envelopes[i].setAttack(attackD);

        }

    } else {

        envelopes[currentVoice].setAttack(attackD);


    }


}

void maxiSampler::setDecay(double decayD, bool setall) {

    if (setall) {

        for (int i=0;i<voices;i++) {

            envelopes[i].setDecay(decayD);

        }

    } else {

        envelopes[currentVoice].setDecay(decayD);


    }


}

void maxiSampler::setSustain(double sustainD, bool setall) {

    if (setall) {

        for (int i=0;i<voices;i++) {

            envelopes[i].setSustain(sustainD);

        }

    } else {

        envelopes[currentVoice].setSustain(sustainD);


    }


}

void maxiSampler::setRelease(double releaseD, bool setall) {

    if (setall) {

        for (int i=0;i<voices;i++) {

            envelopes[i].setRelease(releaseD);

        }

    } else {

        envelopes[currentVoice].setRelease(releaseD);


    }


}

void maxiSampler::setPosition(double positionD, bool setall){

    if (setall) {

        for (int i=0;i<voices;i++) {

            samples[i].setPosition(positionD);

        }

    } else {

        samples[currentVoice].setPosition(positionD);


    }


}

void maxiSampler::trigger() {

    envelopes[currentVoice].trigger=1;
    samples[currentVoice].trigger();
    currentVoice++;
    currentVoice=currentVoice%voices;

}
