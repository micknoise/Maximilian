#ifdef USEOPENCL

kernel void gabor(global float* output, const float amp, const float phase, const float phaseInc, int pos, global float* windows, const int windowStartIndex, const int length) // [1]
{
    size_t i = get_global_id(0);
    int idx = i + pos;
    idx = max(idx, 0);
    idx = min(idx, length);
    float v = phase + (idx * phaseInc);
    v = native_cos(v) * amp;
    float env = windows[windowStartIndex + idx];
    v *= env;
    output[i] = v;
}

kernel void gaborBatch(global float* output, int atomCount, global float* amps, global float* phases, global float* phaseIncs, global int* positions, global float* windows, global int* windowStartIndexes, global int* lengths) // [1]
{
    size_t i = get_global_id(0);
    for(int atom=0; atom < atomCount; atom++) {
        int idx = i + positions[atom];
        idx = clamp(idx, 0, lengths[atom]);
        float v = phases[atom] + (idx * phaseIncs[atom]);
        v = native_cos(v) * amps[atom];
        float env = windows[windowStartIndexes[atom] + idx];
        v *= env;
        output[i] = atom == 0 ? v : output[i] + v;
    }
}

typedef struct structAtomData{
    float amp, phase, phaseInc;
    int position, windowStartIndex, length;
} atomDataContainer;

kernel void gaborBatch2(global float* output, global atomDataContainer *atomData, int atomCount, global float* windows) // [1]
{
    size_t i = get_global_id(0);
    float cellValue=0;
    for(int atom=0; atom < atomCount; atom++) {
        global atomDataContainer *currAtom = &atomData[atom];
        int idx = i + currAtom->position;
        idx = clamp(idx, 0, currAtom->length);
        float v = currAtom->phase + (idx * currAtom->phaseInc);
        v = native_cos(v) * currAtom->amp;
        float env = windows[currAtom->windowStartIndex + idx];
        v *= env;
        cellValue += v;
    }
    output[i] = cellValue;
}


kernel void gaborBatchTestKernel(global float* output, float amp) // [1]
{
    size_t i = get_global_id(0);
//    float cellValue=0;
//    for(int atom=0; atom < atomCount; atom++) {
//        global atomDataContainer *currAtom = &atomData[atom];
//        int idx = i + currAtom->position;
//        idx = clamp(idx, 0, currAtom->length);
//        float v = currAtom->phase + (idx * currAtom->phaseInc);
//        v = native_cos(v) * currAtom->amp;
//        float env = windows[currAtom->windowStartIndex + idx];
//        v *= env;
//        cellValue += v;
//    }
    //output[i] = cellValue;
//    float v = 1.0 * i;
//    float f = convert_float(i);
    output[i] = sin(amp * i * 0.001f) * cos(i * 0.0001f);
}

kernel void gaborImTestKernel(write_only image2d_t output, float amp) // [1]
{
    size_t i = get_global_id(0);
    //    float cellValue=0;
    //    for(int atom=0; atom < atomCount; atom++) {
    //        global atomDataContainer *currAtom = &atomData[atom];
    //        int idx = i + currAtom->position;
    //        idx = clamp(idx, 0, currAtom->length);
    //        float v = currAtom->phase + (idx * currAtom->phaseInc);
    //        v = native_cos(v) * currAtom->amp;
    //        float env = windows[currAtom->windowStartIndex + idx];
    //        v *= env;
    //        cellValue += v;
    //    }
    //output[i] = cellValue;
    //    float v = 1.0 * i;
    //    float f = convert_float(i);
    //    output[i] = sin(amp * i * 0.001f) * cos(i * 0.0001f);
    //output[i] = sin(amp * i * 0.001f) * cos(i * 0.0001f);
//    uint4 val;
//    val.x=1;
//    val.y=1;
//    val.z=1;
//    val.w=1;
    uint val = 1;
//    float val = sin(amp * i * 0.001f) * cos(i * 0.0001f);
    write_imageui(output, (int2)(i, 0), val);
}

#endif
