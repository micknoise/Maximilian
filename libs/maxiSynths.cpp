//
//  maxiSynths.cpp
//  granular
//
//  Created by Michael Grierson on 16/08/2015.
//
//

double pitchRatios[256]= {0.0006517771980725,0.0006905338959768,0.0007315951515920, 0.0007750981021672, 0.0008211878011934, 0.0008700182079338, 0.0009217521874234, 0.0009765623835847, 0.0010346318595111, 0.0010961542138830, 0.0011613349197432, 0.0012303915573284, 0.0013035543961450, 0.0013810677919537, 0.0014631903031841, 0.0015501962043345, 0.0016423756023869, 0.0017400364158675, 0.0018435043748468, 0.0019531247671694, 0.0020692637190223, 0.0021923084277660, 0.0023226698394865, 0.0024607831146568, 0.0026071087922901, 0.0027621355839074, 0.0029263808391988, 0.0031003924086690, 0.0032847514376044, 0.0034800728317350, 0.0036870087496936, 0.0039062497671694, 0.0041385274380445, 0.0043846168555319, 0.0046453396789730, 0.0049215662293136, 0.0052142175845802, 0.0055242711678147, 0.0058527616783977, 0.0062007848173380, 0.0065695028752089, 0.0069601456634700, 0.0073740174993873, 0.0078124995343387, 0.0082770548760891, 0.0087692337110639, 0.0092906802892685, 0.0098431324586272, 0.0104284351691604, 0.0110485423356295, 0.0117055233567953, 0.0124015696346760, 0.0131390057504177, 0.0139202913269401, 0.0147480349987745, 0.0156249990686774, 0.0165541097521782, 0.0175384692847729, 0.0185813605785370, 0.0196862649172544, 0.0208568722009659, 0.0220970865339041, 0.0234110467135906, 0.0248031392693520, 0.0262780115008354, 0.0278405826538801, 0.0294960699975491, 0.0312499981373549, 0.0331082195043564, 0.0350769385695457, 0.0371627211570740, 0.0393725298345089, 0.0417137444019318, 0.0441941730678082, 0.0468220934271812, 0.0496062822639942, 0.0525560230016708, 0.0556811690330505, 0.0589921437203884, 0.0624999962747097, 0.0662164390087128, 0.0701538771390915, 0.0743254423141479, 0.0787450596690178, 0.0834274888038635, 0.0883883461356163, 0.0936441868543625, 0.0992125645279884, 0.1051120460033417, 0.1113623380661011, 0.1179842874407768, 0.1249999925494194, 0.1324328780174255, 0.1403077542781830, 0.1486508846282959, 0.1574901193380356, 0.1668549776077271, 0.1767766922712326, 0.1872883737087250, 0.1984251290559769, 0.2102240920066833, 0.2227246761322021, 0.2359685748815536, 0.2500000000000000, 0.2648657560348511, 0.2806155085563660, 0.2973017692565918, 0.3149802684783936, 0.3337099552154541, 0.3535533845424652, 0.3745767772197723, 0.3968502581119537, 0.4204482138156891, 0.4454493522644043, 0.4719371497631073, 0.5000000000000000, 0.5297315716743469, 0.5612310171127319, 0.5946035385131836, 0.6299605369567871, 0.6674199104309082, 0.7071067690849304, 0.7491535544395447, 0.7937005162239075, 0.8408964276313782, 0.8908987045288086, 0.9438742995262146, 1.0000000000000000, 1.0594631433486938, 1.1224620342254639, 1.1892070770263672, 1.2599210739135742, 1.3348398208618164, 1.4142135381698608, 1.4983071088790894, 1.5874010324478149, 1.6817928552627563, 1.7817974090576172, 1.8877485990524292, 2.0000000000000000, 2.1189262866973877, 2.2449240684509277, 2.3784141540527344, 2.5198421478271484, 2.6696796417236328, 2.8284270763397217, 2.9966142177581787, 3.1748020648956299, 3.3635857105255127, 3.5635950565338135, 3.7754974365234375, 4.0000000000000000, 4.2378525733947754, 4.4898481369018555, 4.7568287849426270, 5.0396842956542969, 5.3393597602844238, 5.6568546295166016, 5.9932284355163574, 6.3496046066284180, 6.7271714210510254, 7.1271901130676270, 7.5509948730468750, 8.0000000000000000, 8.4757051467895508, 8.9796962738037109, 9.5136575698852539, 10.0793685913085938, 10.6787195205688477, 11.3137092590332031, 11.9864568710327148, 12.6992092132568359, 13.4543428421020508, 14.2543802261352539, 15.1019897460937500, 16.0000000000000000, 16.9514102935791016, 17.9593944549560547, 19.0273151397705078, 20.1587371826171875, 21.3574390411376953, 22.6274185180664062, 23.9729137420654297, 25.3984184265136719, 26.9086875915527344, 28.5087604522705078, 30.2039794921875000, 32.0000000000000000, 33.9028205871582031, 35.9187889099121094, 38.0546302795410156, 40.3174743652343750, 42.7148780822753906, 45.2548370361328125, 47.9458274841308594, 50.7968368530273438, 53.8173751831054688, 57.0175209045410156, 60.4079589843750000, 64.0000076293945312, 67.8056411743164062, 71.8375778198242188, 76.1092605590820312, 80.6349563598632812, 85.4297561645507812, 90.5096740722656250, 95.8916625976562500, 101.5936737060546875, 107.6347503662109375, 114.0350418090820312, 120.8159179687500000, 128.0000152587890625, 135.6112823486328125, 143.6751556396484375, 152.2185211181640625, 161.2699127197265625, 170.8595123291015625, 181.0193481445312500, 191.7833251953125000, 203.1873474121093750, 215.2695007324218750, 228.0700836181640625, 241.6318511962890625, 256.0000305175781250, 271.2225646972656250, 287.3503112792968750, 304.4370422363281250, 322.5398254394531250, 341.7190246582031250, 362.0386962890625000, 383.5666503906250000, 406.3746948242187500, 430.5390014648437500, 456.1401977539062500, 483.2637023925781250, 512.0000610351562500, 542.4451293945312500, 574.7006225585937500, 608.8740844726562500, 645.0796508789062500, 683.4380493164062500, 724.0773925781250000, 767.1333007812500000, 812.7494506835937500, 861.0780029296875000, 912.2803955078125000, 966.5274047851562500, 1024.0001220703125000, 1084.8903808593750000, 1149.4012451171875000, 1217.7481689453125000, 1290.1593017578125000, 1366.8762207031250000, 1448.1549072265625000, 1534.2666015625000000, 1625.4989013671875000};

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

void maxiKick::setPitch(double newPitch) {
    
    pitch=newPitch;
    
}

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
              outputs[i]=samples[i].play(pitchRatios[(int)pitch[i]+originalPitch]*((1./samples[i].length)*maxiSettings::sampleRate),0,samples[i].length)*envOut[i];
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


