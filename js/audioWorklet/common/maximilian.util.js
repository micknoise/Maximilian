export const getArrayAsVectorDbl = (arrayIn) => {
  var vecOut = new exports.VectorDouble();
  for (var i = 0; i < arrayIn.length; i++) {
    vecOut.push_back(arrayIn[i]);
  }
  return vecOut;
};

export const getBase64 = (str) => {
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

export const _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

export const removePaddingFromBase64 = (input) => {
  var lkey = Module.maxiTools._keyStr.indexOf(input.charAt(input.length - 1));
  if (lkey === 64) {
    return input.substring(0, input.length - 1);
  }
  return input;
};


const sendAudioArray = (float32Array, customNode) => {
  if (float32Array !== undefined && customNode !== undefined) {
    console.log('f32array: ' + float32Array);
    customNode.port.postMessage({
      audioArray: float32Array,
    });
  }
}

export const loadSampleToArray = (audioContext, sampleObjectName, url, sendDataToWorklet) => {
  var data = [];

  var context = audioContext;

  //check if url is actually a base64-encoded string
  var b64 = getBase64(url);
  if (b64) {
    //convert to arraybuffer
    //modified version of this:
    // https://github.com/danguer/blog-examples/blob/master/js/base64-binary.js
    var ab_bytes = (b64.length / 4) * 3;
    var arrayBuffer = new ArrayBuffer(ab_bytes);

    b64 = removePaddingFromBase64(removePaddingFromBase64(b64));

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
      enc1 = _keyStr.indexOf(b64.charAt(j++));
      enc2 = _keyStr.indexOf(b64.charAt(j++));
      enc3 = _keyStr.indexOf(b64.charAt(j++));
      enc4 = _keyStr.indexOf(b64.charAt(j++));

      chr1 = (enc1 << 2) | (enc2 >> 4);
      chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      chr3 = ((enc3 & 3) << 6) | enc4;

      uarray[i] = chr1;
      if (enc3 !== 64) {
        uarray[i + 1] = chr2;
      }
      if (enc4 !== 64) {
        uarray[i + 2] = chr3;
      }
    }

    // https://webaudio.github.io/web-audio-api/#dom-baseaudiocontext-decodeaudiodata
    // Asynchronously decodes the audio file data contained in the ArrayBuffer.
    audioContext.decodeAudioData(
      arrayBuffer, // has its content-type determined by sniffing
      function (buffer) { // successCallback, argument is an AudioBuffer representing the decoded PCM audio data.
        // source.buffer = buffer;
        // source.loop = true;
        // source.start(0);
        data = buffer.getChannelData(0);
        if (data) sendDataToWorklet(sampleObjectName, data);
      },
      function (buffer) { // errorCallback
        console.log("Error decoding source!");
      }
    );
  } else {
    // Load asynchronously
    // NOTE: This is giving me an error
    // Uncaught ReferenceError: XMLHttpRequest is not defined (index):97 MaxiProcessor Error detected: undefined
    // NOTE: followed the trail to the wasmmodule.js
    // when loading on if (typeof XMLHttpRequest !== 'undefined') {
    // throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. 
    // Use --embed-file or --preload-file in emcc on the main thread.");
    var request = new XMLHttpRequest();
    request.addEventListener("load", () => console.log("The transfer is complete."));
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.onload = function () {
      audioContext.decodeAudioData(
        request.response,
        function (buffer) {
          data = buffer.getChannelData(0);
          if (data) sendDataToWorklet(sampleObjectName, data);
        },
        function (buffer) {
          console.log("Error decoding source!");
        }
      );
    };
    request.send();
  }
  return "Loading module";
};