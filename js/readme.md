Maximilian uses a mixture of Cheerp and Emscripten to transpile the C++ code into something that can be run in the browser. Call overhead in Emscripten can be slow, and this is magnified by single sample processing, so some small functions are transpiled directly to javascript using Cheerp, thereby bypassing call overhead.  These functions are transpiled using the make script in the `purejs` folder, generating a file `build/maximilian.transpile.js` which is then included in the other builds.  You can then build for either audio worklet or script processor node systems.


## Building for Web Audio

Install the Emscripten SDK and Cheerp

```
cd [root]/js/purejs
make  
```

### Script Processor Node Build

```
cd [root]/js/script-processor-node
make
```

The library can be found in the `build` subfolder


### Audio Worklet Build

```
cd [root]/js/audio-worklet
make
```

The library can be found in the `build` subfolder

