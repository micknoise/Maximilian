### Developer Notes

#### JavaScript export

Maximilian exports functions using two (!) different systems: Emscripten and Cheerp.  Emscripten works well for more complex/heavyweight processes, but the overhead for function calls means that it's inefficient for small dsp functions, and there are also some issues with memory management. Instead, we use Cheerp, which translates these functions directly into JavaScript, and keeps everything in JavaScript memory space.

##### Exporting using Emscripten

[TBC]

##### Exporting using Cheerp

1. add CHEERP_EXPORT to your clasd definition

```
class CHEERP_EXPORT myClass {

}
```

2. Make sure that the constructor is included in the .cpp file (this is a quirk or Cheerp) - see the end of maximilian.cpp for examples.

3. Cheerp does not work well with overridden functions.