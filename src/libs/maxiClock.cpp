
#include "maxiClock.h"

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

