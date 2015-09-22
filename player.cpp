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


#ifdef MAXIMILIAN_PORTAUDIO
#include "portaudio.h"
//#include "pa_mac_core.h"
#elif defined(MAXIMILIAN_RT_AUDIO)
	#if defined( __WIN32__ ) || defined( _WIN32 )
		#include <dsound.h>
	#endif
#include "RtAudio.h"
#endif


void setup();//use this to do any initialisation if you want.

void play(double *output);//run dac! Very very often. Too often in fact. er...

#ifdef MAXIMILIAN_PORTAUDIO
int routing(const void *inputBuffer,
		void *outputBuffer,
		unsigned long nBufferFrames,
		const PaStreamCallbackTimeInfo* timeInfo,
		PaStreamCallbackFlags status,
		void *userData ){
#elif defined(MAXIMILIAN_RT_AUDIO)
int routing	(void *outputBuffer, void *inputBuffer, unsigned int nBufferFrames,
			 double streamTime, RtAudioStreamStatus status, void *userData ) {
#endif
	
	unsigned int i, j;
	
#ifdef MAXIMILIAN_PORTAUDIO
	float *buffer = (float *) outputBuffer;
#elif defined(MAXIMILIAN_RT_AUDIO)
	double *buffer = (double *) outputBuffer;
#endif
	double *lastValues = (double *) userData;
	//	double currentTime = (double) streamTime; Might come in handy for control
	if ( status )
		std::cout << "Stream underflow detected!" << std::endl;
	for ( i=0; i<nBufferFrames; i++ ) {	
	}
	// Write interleaved audio data.
	for ( i=0; i<nBufferFrames; i++ ) {
		play(lastValues);			
		for ( j=0; j<maxiSettings::channels; j++ ) {
			*buffer++=lastValues[j];
		}
	}
	return 0;
}

//This is main()
int main()
{
	setup();
	
#ifdef MAXIMILIAN_PORTAUDIO
	PaStream *stream;
	PaError err;
	err = Pa_Initialize();
	if( err != paNoError )
		std::cout <<   "PortAudio error: " << Pa_GetErrorText( err ) << std::endl;
	
	double data[maxiSettings::channels];
	
	err = Pa_OpenDefaultStream( &stream,
							   0,          /* no input channels */
							   maxiSettings::channels,          /* stereo output */
							   paFloat32,  /* 64 bit floating point output */
							   maxiSettings::sampleRate,
							   maxiSettings::bufferSize,        /* frames per buffer, i.e. the number
												   of sample frames that PortAudio will
												   request from the callback. Many apps
												   may want to use
												   paFramesPerBufferUnspecified, which
												   tells PortAudio to pick the best,
												   possibly changing, buffer size.*/
							   &routing, /* this is your callback function */
							   &data ); /*This is a pointer that will be passed to
										 your callback*/
	
	//PaAlsa_EnableRealtimeScheduling(stream,true);
	
	err = Pa_StartStream( stream );
	if( err != paNoError )
		std::cout <<   "PortAudio error: " << Pa_GetErrorText( err ) << std::endl;
	
	
	char input;
	std::cout << "\nMaximilian is playing ... press <enter> to quit.\n";
	std::cin.get( input );
	
	
	
	err = Pa_Terminate();
	if( err != paNoError )
		std::cout <<  "PortAudio error: "<< Pa_GetErrorText( err ) << std::endl;
	
#elif defined(MAXIMILIAN_RT_AUDIO)
	RtAudio dac(RtAudio::WINDOWS_DS);
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
	//double data[maxiSettings::channels];
	vector<double> data(maxiSettings::channels,0);
	
	try {
		dac.openStream( &parameters, NULL, RTAUDIO_FLOAT64,
					   sampleRate, &bufferFrames, &routing, (void *)&(data[0]));
		
		dac.startStream();
	}
	catch ( RtError& e ) {
		e.printMessage();
		exit( 0 );
	}
	
	char input;
	std::cout << "\nMaximilian is playing ... press <enter> to quit.\n";
	std::cin.get( input );
	
	try {
		// Stop the stream
		dac.stopStream();
	}
	catch (RtError& e) {
		e.printMessage();
	}
	
	if ( dac.isStreamOpen() ) dac.closeStream();
#endif
	
	return 0;
}
