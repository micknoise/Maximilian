/*
Copyright notice for the base64 to arraybuffer conversion algorithm.

Copyright (c) 2011, Daniel Guerrero
All rights reserved.
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL DANIEL GUERRERO BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* global Module */

"use strict";

console.log("running%c Maximilian v2.2.0 (asm.js)", "font-weight: bold; background: #222; color: #fa7a55");


// ------------------------------------------------
// maxiArray - could extend Array object?
// cheaty array method to avoid mixing vector terminology with arrays
// but have to copy everything?!
// better to use GetArrayAsVectorDbl function ???
Module.maxiArray = function maxiArray() {
  this.length = 0;
  var vec = new Module.VectorDouble();

  // this.update = function(){
  //     var lengthsMatch = this.length !== this.vec.size();
  //     if(!lengthsMatch){
  //         if(this.length < this.vec.size()){
  //             for(var i = this.length; i < this.vec.size(); i++){
  //                 this[i] = this.vec.get(i);
  //             }
  //         } else{
  //             for(var i = this.length; i < this.vec.size(); i++){
  //                 delete this[i];
  //             }
  //         }

  //         // reset length var
  //         this.length = this.vec.size();
  //     }
  // };
};

Module.maxiArray.prototype.asVector = function(arrayIn) {
  return this.vec;
};

Module.maxiArray.prototype.asJsArray = function(arrayIn) {
  var arrayOut = [];

  for (var i = 0; i < this.length; i++) {
    array.push(this.vec.get(i)); //FIXME: mz I think this must be a bug? What is "array"? arrayOut maybe?
  }

  return arrayOut;
};

Module.maxiArray.prototype.set = function(arrayIn) {
  this.clear();
  this.vec = GetArrayAsVectorDbl(arrayIn); //FIXME: mz this is part of maxiTools
  this.length = this.vec.size();
  this.SetSqBrackets(true);
};

Module.maxiArray.prototype.push = function(num) {
  this.vec.push_back(num);
  this[this.length] = num;
  this.length++;
};

// set object properties to mimic array
// this doesn't seem particularly efficient or smart
Module.maxiArray.prototype.SetSqBrackets = function(useSq) {
  for (var i = 0; i < this.length; i++) {
    if (useSq) {
      this[i] = this.vec.get(i);
    } else {
      delete this[i];
    }
  }
};

Module.maxiArray.prototype.clear = function(useSq) {
  for (var i = 0; i < this.length; i++) {
    delete this[i];
  }
  Module.vectorTools.clearVectorDbl(this.vec); //FIXME: mz this is also part of maxiTools
  this.length = 0;
};


// tools
Module.maxiTools = function() {};

// not sure this is good
// Module.maxiTools.arrayOfObj = function(obj, num){
//     var array = [];

//     for(var i = 0; i < num; i++){
//         array.push(new obj());
//     }
//     return array;
// };

Module.maxiTools.getArrayAsVectorDbl = function(arrayIn) {
  var vecOut = new Module.VectorDouble();
  for (var i = 0; i < arrayIn.length; i++) {
    vecOut.push_back(arrayIn[i]);
  }

  return vecOut;
};

Module.maxiTools.getBase64 = function(str) {
  //check if the string is a data URI
  if (str.indexOf(';base64,') !== -1) {
    //see where the actual data begins
    var dataStart = str.indexOf(';base64,') + 8;
    //check if the data is base64-encoded, if yes, return it
    // taken from
    // http://stackoverflow.com/a/8571649
    return str.slice(dataStart).match(/^([A-Za-z0-9+\/]{4})*([A-Za-z0-9+\/]{4}|[A-Za-z0-9+\/]{3}=|[A-Za-z0-9+\/]{2}==)$/) ? str.slice(dataStart) : false;
  } else return false;
};

Module.maxiTools._keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

Module.maxiTools.removePaddingFromBase64 = function(input) {
  var lkey = Module.maxiTools._keyStr.indexOf(input.charAt(input.length - 1));
  if (lkey === 64) {
    return input.substring(0, input.length - 1);
  }
  return input;
};


// ------------------------------------------------
Module.maxiAudio = function() {
  this.numChannels = 2;
  this.output = 0;

  this.context = null;
  this.source = null;
  this.analyser = null;
  this.maxiAudioProcessor = null;
  this.bufferSize = 1024;
  this.initDone = false;
};

Module.maxiAudio.play = function() {};


Module.INPUT_TYPE = {
  NONE: -2,
  DEFAULT: -1
};
Module.maxiAudio.prototype.init = function(audioIn = Module.INPUT_TYPE.NONE) {
  // Temporary patch until all browsers support unprefixed context.
  this.context = new(window.AudioContext || window.webkitAudioContext)();
  this.source = this.context.createBufferSource();
  this.maxiAudioProcessor = this.context.createScriptProcessor(this.bufferSize, this.numChannels, this.numChannels);
  let handleConnection = function(stream) {
    console.log("Connecting audio input");
    console.log(stream);
    this.audioInputSource = this.context.createMediaStreamSource(stream);
    this.audioInputSource.connect(this.maxiAudioProcessor);
  }.bind(this);
  if (audioIn == Module.INPUT_TYPE.DEFAULT) {
    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })
      .then(handleConnection);
  } else if (audioIn > Module.INPUT_TYPE.DEFAULT) {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      devices = devices.filter((d) => d.kind === 'audioinput');
      navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: devices[audioIn].deviceId
          },
          video: false
        })
        .then(handleConnection);
    });
  } else {
    this.source.connect(this.maxiAudioProcessor);
  }
  this.maxiAudioProcessor.onaudioprocess = function(event) {
      var numInputChannels = event.inputBuffer.numberOfChannels;
      var numChannels = event.outputBuffer.numberOfChannels;
      var outputLength = event.outputBuffer.getChannelData(0).length;
      var audioIn = new Array(numChannels);
      for (var i = 0; i < outputLength; ++i) {
        for (let channel = 0; channel < numInputChannels; channel++) {
          audioIn[channel] = event.inputBuffer.getChannelData(channel)[i];
        }
        var w = this.play(audioIn);
        // var channel = 0;
        if (w instanceof Array) {
          for (channel = 0; channel < numChannels; channel++) {
            event.outputBuffer.getChannelData(channel)[i] = w[channel];
          }
        } else {
          for (channel = 0; channel < numChannels; channel++) {
            event.outputBuffer.getChannelData(channel)[i] = w;
          }
        }
      }
    }
    .bind(this);

  // Connect the processing graph: source -> maxiAudioProcessor -> analyser -> destination
  // this.maxiAudioProcessor.connect(this.analyser);
  this.maxiAudioProcessor.connect(this.context.destination);
  this.initDone = true;
};


Module.maxiAudio.prototype.listInputDevices = function() {
  window.navigator.mediaDevices.enumerateDevices().then((devices) => {
    devices = devices.filter((d) => d.kind === 'audioinput');
    console.log(devices);
  });
}


Module.maxiAudio.prototype.getNumChannels = function() {
  return this.numChannels;
};

// isArray should be second param really
// set num channels and set output as an array
// use this if you want to change number of channels
Module.maxiAudio.prototype.setNumChannels = function(isArray, numChannels_) {

  this.numChannels = numChannels_;
  this.outputIsArray(isArray, numChannels_);

  this.resetAudio();
};

Module.maxiAudio.prototype.setBufferSize = function(newBufferSize) {
  this.bufferSize = newBufferSize;
  this.resetAudio();
};

// use this if you want to keep num of outputs but change
// method e.g. array or not
Module.maxiAudio.prototype.outputIsArray = function(isArray) {
  if (isArray) {
    this.output = new Array(this.numChannels);

    for (var i = 0; i < this.numChannels; i++) {
      this.output[i] = 0;
    }
  } else {
    this.output = 0;
  }
};


Module.maxiAudio.prototype.resetAudio = function() {
  if (this.initDone) {
    this.source.disconnect();
    this.maxiAudioProcessor.disconnect();
    this.analyser.disconnect();
  }

  this.init();
};


// option to load sample if a different context is used
Module.maxiAudio.prototype.loadSample = function(url, samplePlayer, onLoaded, contextIn) {
  var data = [];
  var context;

  if (!contextIn) {
    context = this.context;
  } else {
    context = contextIn;
  }

  samplePlayer.clear();

  //check if url is actually a base64-encoded string
  var b64 = Module.maxiTools.getBase64(url);
  if (b64) {
    //convert to arraybuffer
    //modified version of this:
    // https://github.com/danguer/blog-examples/blob/master/js/base64-binary.js
    var ab_bytes = (b64.length / 4) * 3;
    var arrayBuffer = new ArrayBuffer(ab_bytes);

    b64 = Module.maxiTools.removePaddingFromBase64(Module.maxiTools.removePaddingFromBase64(b64));

    var bytes = parseInt((b64.length / 4) * 3, 10);

    var uarray;
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    var j = 0;

    uarray = new Uint8Array(arrayBuffer);

    b64 = b64.replace(/[^A-Za-z0-9\+\/\=]/g, "");

    for (i = 0; i < bytes; i += 3) {
      //get the 3 octects in 4 ascii chars
      enc1 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));
      enc2 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));
      enc3 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));
      enc4 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      uarray[i] = chr1;
      if (enc3 !== 64) uarray[i + 1] = chr2;
      if (enc4 !== 64) uarray[i + 2] = chr3;
    }

    context.decodeAudioData(
      arrayBuffer,
      function(buffer) {
        // source.buffer = buffer;
        // source.loop = true;
        // source.start(0);
        data = buffer.getChannelData(0);

        if (data) {
          var myBufferData = new Module.VectorDouble();
          // Module.vectorTools.clearVectorDbl(myBufferData);

          for (var n = 0; n < data.length; n++) {
            myBufferData.push_back(data[n]);
          }

          samplePlayer.setSample(myBufferData /*, context.sampleRate*/ );
        }

      },

      function(buffer) {
        console.log("Error decoding source!");
      }
    );


  } else {
    // Load asynchronously
    var request = new XMLHttpRequest();
    request.addEventListener("load",
      function(evt) {
        console.log("The transfer is complete.");
      });
    request.open("GET", url, true);

    request.responseType = "arraybuffer";

    if (url.split(".").pop() == "ogg") {
      request.onload = function() {
        var oggData = request.response; // Note: not oReq.responseText
        if (oggData) {
          var oggDataBytes = new Uint8Array(oggData);
          console.log(oggDataBytes);
          var myBufferData = new Module.VectorUChar();
          for (var n = 0; n < oggDataBytes.length; n++) {
            myBufferData.push_back(oggDataBytes[n]);
          }
          console.log(myBufferData);
          let res = samplePlayer.setSampleFromOggBlob(myBufferData, 0);
          if (onLoaded) {
            onLoaded(samplePlayer);
          };
        }
      }
    } else {
      request.onload = function() {
        context.decodeAudioData(
          request.response,
          function(buffer) {
            data = buffer.getChannelData(0);
            if (data) {
              var myBufferData = new Module.VectorDouble();
              // Module.vectorTools.clearVectorDbl(myBufferData);

              for (var n = 0; n < data.length; n++) {
                myBufferData.push_back(data[n]);
              }

              samplePlayer.setSample(myBufferData /*, context.sampleRate*/ );
              if (onLoaded) {
                onLoaded(samplePlayer);
              };
            }

          },

          function(buffer) {
            console.log("Error decoding source!");
          }
        );
      };
    }
    request.send();
  }

};
