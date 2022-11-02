/*
 *  player.cpp
 *  rtaudiotest
 *
 *  Created by Chris on 23/08/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#include "player.h"
#include "maximilian.h"
#include <iostream>


#if defined( __WIN32__ ) || defined( _WIN32 )
	#include <dsound.h>
#endif
#include "RtAudio.h"


void setup();//use this to do any initialisation if you want.

void play(double *output);//run dac! Very very often. Too often in fact. er...

int routing	(void *outputBuffer, void *inputBuffer, unsigned int nBufferFrames,
			 double streamTime, RtAudioStreamStatus status, void *userData ) {
	
	
	double *buffer = (double *) outputBuffer;
	double *lastValues = (double *) userData;
	//	double currentTime = (double) streamTime; Might come in handy for control
	if ( status )
		std::cout << "Stream underflow detected!" << std::endl;
	for (size_t i=0; i<nBufferFrames; i++ ) {	
	}
	// Write interleaved audio data.
	for (size_t i=0; i<nBufferFrames; i++ ) {
		play(lastValues);			
		for (size_t j=0; j<maxiSettings::channels; j++ ) {
			*buffer++=lastValues[j];
		}
	}
	return 0;
}

void errorCallback( RtAudioErrorType /*type*/, const std::string &errorText )
{
  std::cerr << "\nRtAudio errorCallback: " << errorText << "\n\n";
}

//This is main()
int main()
{
	setup();
  // // Specify our own error callback function.
  // RtAudio dac( RtAudio::UNSPECIFIED, &errorCallback );

  // std::vector<unsigned int> deviceIds = dac.getDeviceIds();
  // if ( deviceIds.size() < 1 ) {
  //   std::cout << "\nNo audio devices found!\n";
  //   exit( 1 );
  // }	


	RtAudio dac(RtAudio::UNSPECIFIED, &errorCallback);
	if ( dac.getDeviceCount() < 1 ) {
		std::cout << "\nNo audio devices found!\n";
		char input;
		std::cin.get( input );
		exit( 0 );
	}
	
	RtAudio::StreamParameters parameters;
	parameters.deviceId = dac.getDefaultOutputDevice();
	parameters.nChannels = maxiSettings::channels;
	parameters.firstChannel = 0;
	unsigned int sampleRate = maxiSettings::sampleRate;
	unsigned int bufferFrames = maxiSettings::bufferSize; 
	vector<double> data(maxiSettings::channels,0);
	
	dac.openStream( &parameters, NULL, RTAUDIO_FLOAT64,
						sampleRate, &bufferFrames, &routing, (void *)&(data[0]));
	
	dac.startStream();
	if ( dac.isStreamOpen()){

		
		char input;
		std::cout << "\nMaximilian is playing ... press <enter> to quit.\n";
		std::cin.get( input );
		
		dac.stopStream();
	}
	if ( dac.isStreamOpen() ) dac.closeStream();
	
	return 0;
}
