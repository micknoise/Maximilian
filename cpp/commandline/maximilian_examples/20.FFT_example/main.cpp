
#include "maximilian.h"
#include "libs/maxim.h"

maxiSample beats; 
maxiFFT myFFT;
maxiIFFT myInverseFFT;
vector<float> mags = vector<float>(512);
vector<float> mags2 = vector<float>(512);
vector<float> phases = vector<float>(512);
vector<float> phases2 = vector<float>(512);
maxiEnvGen shiftEnv;


void setup() {
    
    beats.load("../../../beat2.wav");//load in your samples. Provide the full path to a wav file.
    myFFT.setup(1024, 512, 1024);
    myInverseFFT.setup(1024, 512, 1024);
    shiftEnv.setup({0,50,0}, {10000,10000}, {1,1}, true);
}

void play(double *output) {
    
    
    float myOut=beats.play();
    
    if (myFFT.process(myOut)) {
        cout << "SC: " << myFFT.spectralCentroid() << endl;
        
        //shift some bins and phases around
        mags = myFFT.getMagnitudes();
        phases = myFFT.getMagnitudes();
        for(size_t b=0; b < mags.size(); b++) {
            size_t binIdx = b-static_cast<int>(shiftEnv.play(1));
            if (binIdx > mags.size()) binIdx = mags.size();
            if (binIdx < 0 || binIdx >= mags.size()) {
                mags2[b] = 0;
                phases2[b]=0;
            }else{
                mags2[b] = mags[binIdx];
                phases2[b] = phases[binIdx];
            }
        }        
    }
    myOut = myInverseFFT.process(mags2, phases2);
    
    //output[0] is the left output. output[1] is the right output
    output[0]=myOut;//simple as that!
    output[1]=output[0];
    
}
