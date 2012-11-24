#include "maximilian.h"

//Look mum no aliasing

//synthesiser bits
maxiOsc VCO1,VCO2;
maxiOsc ramp,ramp2,ramp3;
double out;


void setup() {//some inits
    
    //we need this to set the duty cycle for the sqaure wave otherwise it don't work
	VCO2.phaseReset(0.5);
    
}

void play(double *output) {

//      no noise here
//      out=VCO1.sawn(ramp.phasor(0.1,50,8000));

    
//      Band limited square using two band limited saws. Comment the above and uncomment the below.
//      you can hear a tiny bit of aliasing approaching 8000 hz but it should do.
//      It's actually a bit of a weird hack but has nice response.
//        out=VCO1.sawn(ramp.phasor(0.1,50,8000))-VCO2.sawn(ramp2.phasor(0.1,50,8000));
    
//      When you're done testing with the ramps, see here for an easy PWM hack with this approach
      out=VCO1.sawn(100)-(VCO2.sawn(100.1)*0.9);

    
	output[0]=out*0.5;//left channel
	output[1]=out*0.5;//right channel
    
}
