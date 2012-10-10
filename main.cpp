currentCount=(int)timer.phasor(8);//this sets up a metronome that ticks 8 times a second


if (lastCount!=currentCount) {//if we have a new timer int this sample, play the sound
    
    kicktrigger=hit[playHead%16];//get the value out of the array for the kick
    snaretrigger=snarehit[playHead%16];//same for the snare
    playHead++;//iterate the playhead
    lastCount=0;//reset the metrotest
}