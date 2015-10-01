//This examples shows another fundamental building block of digital audio - adding two sine waves together. When you add waves together they create a new wave whose amplitude at any time is computed by adding the current amplitudes of each wave together. So, if one wave has an amplitude of 1, and the other has an amplitude of 1, the new wave will be equal to 2 at that point in time. Whereas, later, if one wave has an amplitude of -1, and the other has an amplitude of 1, the new wave - the one you hear - will equal 0. This can create some interesting effects, including 'beating', when the waves interact to create a single wave that fades up and down based on the frequencies of the two interacting waves. The frequency of the 'beating' i.e. the fading in and out, is equal to the difference in frequency between the two waves.

#include "maximilian.h"

maxiOsc mySine,myOtherSine;//Two oscillators with names.

void setup() {//some inits
    //nothing to go here this time
}

void play(double *output) {//this is where the magic happens. Very slow magic.
    
    //output[0] is the left output. output[1] is the right output
    output[0]=mySine.sinewave(440)+myOtherSine.sinewave(441);//these two sines will beat together. They're now a bit too loud though..
    output[1]=output[0];

}

