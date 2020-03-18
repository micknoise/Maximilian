```                                     
  _____ _____ ___   __ _  _____  __ __   __ ____  ____  
 /     \\_   \\  \/  /  |/     \|  |  | |  \_   \/    \
|  Y Y  \/ /_ \>    <|  |  Y Y  \  |  |_|  |/ /_ \  Y  \
|__|_|  (___  /__/\__\__|__|_|  /__|____/__(___  /__|  /
      \/    \/                \/               \/    \/
```
![version](https://img.shields.io/badge/version-2.2-red)
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/mimic-sussex/eppEditor/blob/master/LICENSE)

<br />

### What's Maximilian?

Maximilian is a cross-platform and multi-target audio synthesis and signal processing library. It was written in C++ and provides bindings to Javascript. It's compatible with native implementations for MacOS, Windows, Linux and iOS systems, as well as client-side browser-based applications. The main features are:

- sample playback, recording and looping
- support for WAV and OGG files.
- a selection of oscillators and filters
- enveloping
- multichannel mixing for 1, 2, 4 and 8 channel setups
- controller mapping functions
- effects including delay, distortion, chorus, flanging
- granular synthesis, including time and pitch stretching
- atom synthesis
- real-time music information retrieval functions: spectrum analysis, spectral features, octave analysis, Bark scale analysis, and MFCCs
- example projects for Windows and MacOS, susing command line and OpenFrameworks environments
- example projects for Firefox and Chromium-based browsers using the Web Audio API ScriptProcessorNode (deprecated!)
- example projects for Chromium-based browsers using the Web Audio API AudioWorklet (e.g. Chrome, Brave, Edge, Opera, Vivaldi)


### Basic Examples

You can choose between using RTAudio and PortAudio drivers in player.h by uncommenting the appropriate line.  To use PortAudio, you will need to compile the portAudio library from http://http://www.portaudio.com/ and link it with your executable.

Examples demonstrating different features can be found in the maximilian_examples folder.  To try them, replace the contents of main.cpp with the contents of a tutorial file and compile.

### Web Audio

A transpiled javascript version of the library is included in this repository, for both Script Processor Nodes and AudioWorklets. Try this out at (https://mimicproject.com/guides/maximJS). 


### Mac OS XCode Project

You can run the examples using the 'maximilianTest' XCode 3 project provided.


### MS Windows Visual Studio Project

This is in the maximilianTestWindowsVS2010 folder. You will need to install the DirectX SDK, so that the program can use DirectSound.


### Command Line Compilation in Mac OS

> g++ -Wall -D__MACOSX_CORE__ -o maximilian main.cpp RtAudio.cpp player.cpp maximilian.cpp -framework CoreAudio -framework CoreFoundation -lpthread

> ./maximilian


### Command Line Compilation in Linux

With OSS:
> g++ -Wall -D__LINUX_OSS__ -o maximilian main.cpp RtAudio.cpp player.cpp maximilian.cpp -lpthread

With ALSA:
> g++ -Wall -D__LINUX_ALSA__ -o maximilian main.cpp RtAudio.cpp player.cpp maximilian.cpp -lasound -lpthread

With Jack:
> g++ -Wall -D__UNIX_JACK__ -o maximilian main.cpp RtAudio.cpp player.cpp maximilian.cpp `pkg-config --cflags --libs jack` -lpthread

then:
> ./maximilian



### OpenFrameworks Project

Maximilian works well with the OpenFrameworks C++ creative coding toolkit (http://www.openframeworks.cc).

In the ofxMaxim directory you will find examples to run in Windows, OSX and iOS, including FFT analysis and granular synthesis.  

You can install the ofxMaxim addon by copying the ofxMaxim/ofxMaxim folder into your openframeworks addons directory.

Important: when using Maximilian on OSX, link against the Accelerate framework.


