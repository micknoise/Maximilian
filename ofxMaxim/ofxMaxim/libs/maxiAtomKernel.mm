//
//  maxiAtomKernel.cpp
//  maxiTestZone
//
//  Created by Chris on 13/09/2013.
//
//

#include "maxiAtomKernel.h"
#import <Cocoa/Cocoa.h>

////////////////////////////////////////////////////////////////////////////////
#include <stdio.h>
#include <stdlib.h>
//#include "maximilian.h"



maxiAtomKernel::maxiAtomKernel() {
    maxAtoms = 2048;
    kernelTimeMA.init(0.9, 0);
    memTimeMA.init(0.9, 0);
}

void maxiAtomKernel::setup(int count) {

    queue = gcl_create_dispatch_queue(CL_DEVICE_TYPE_GPU | CL_DISPATCH_QUEUE_PRIORITY_HIGH,
                                                       NULL);
    
    // In the event that our system does NOT have an OpenCL-compatible GPU,
    // we can use the OpenCL CPU compute device instead.
    if (queue == NULL) {
        queue = gcl_create_dispatch_queue(CL_DEVICE_TYPE_CPU | CL_DISPATCH_QUEUE_PRIORITY_HIGH, NULL);
    }
    
    // This is not required, but let's print out the name of the device
    // we are using to do work.  We could use the same function,
    // clGetDeviceInfo, to obtain all manner of information about the device.
    cl_device_id gpu = gcl_get_device_id_with_dispatch_queue(queue);
    char name[128];
    clGetDeviceInfo(gpu, CL_DEVICE_NAME, 128, name, NULL);
    fprintf(stdout, "Created a dispatch queue using the %s\n", name);
    mem_in  = gcl_malloc(sizeof(cl_float) * count, NULL,
                               CL_MEM_READ_ONLY | CL_MEM_ALLOC_HOST_PTR);
    
    // The output array is not initalized; we're going to fill it up when
    // we execute our kernel.                                                 [4]
    mem_out = gcl_malloc(sizeof(cl_float) * count, NULL,
                               CL_MEM_WRITE_ONLY | CL_MEM_ALLOC_HOST_PTR);
    
    cl_malloc_flags inmemFlags = CL_MEM_READ_ONLY | CL_MEM_ALLOC_HOST_PTR;
//    cl_malloc_flags inmemFlags = CL_MEM_READ_ONLY;
    mem_amps  = gcl_malloc(sizeof(cl_float) * maxAtoms, NULL,inmemFlags);
    mem_phases  = gcl_malloc(sizeof(cl_float) * maxAtoms, NULL,inmemFlags);
    mem_phaseIncs  = gcl_malloc(sizeof(cl_float) * maxAtoms, NULL,inmemFlags);
    mem_positions  = gcl_malloc(sizeof(cl_int) * maxAtoms, NULL,inmemFlags);
    mem_atomLengths  = gcl_malloc(sizeof(cl_int) * maxAtoms, NULL,inmemFlags);
    mem_atomWindowIndexes  = gcl_malloc(sizeof(cl_int) * maxAtoms, NULL,inmemFlags);
    atomWindowIndexes.resize(4096);
    
    bufferSize = count;
//    dispatch_sync(queue, ^{
        mem_atomDataBlock  = gcl_malloc(sizeof(structAtomData) * maxAtoms, NULL, inmemFlags);
//    });
    
    cl_image_format format;
    format.image_channel_order = CL_R;
    format.image_channel_data_type =  CL_UNSIGNED_INT8;
    imBuffer = gcl_create_image(&format, bufferSize, 1, 1, NULL);
    imBufOut.resize(bufferSize,0);
    
}

void maxiAtomKernel::gaborSingle(float *output, float amp, float phase, float phaseInc, int pos, int count, int atomLength) {
//    void* mem_in  = gcl_malloc(sizeof(cl_float) * count, input,
//                               CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR);
//    
//    // The output array is not initalized; we're going to fill it up when
//    // we execute our kernel.                                                 [4]
//    void* mem_out = gcl_malloc(sizeof(cl_float) * count, NULL,
//                               CL_MEM_WRITE_ONLY);

    dispatch_sync(queue, ^{
//        gcl_memcpy(mem_in, input, sizeof(cl_float) * count);
        
        // Though we COULD pass NULL as the workgroup size, which would tell
        // OpenCL to pick the one it thinks is best, we can also ask
        // OpenCL for the suggested size, and pass it ourselves.              [6]
//        size_t wgs;
//        gcl_get_kernel_block_workgroup_info(gabor_kernel,
//                                            CL_KERNEL_WORK_GROUP_SIZE,
//                                            sizeof(wgs), &wgs, NULL);
        
        
//        printf("OpenCL determinded workgroup size is %d.\n", wgs);
        
        // The N-Dimensional Range over which we'd like to execute our
        // kernel.  In our example case, we're operating on a 1D buffer, so
        // it makes sense that our range is 1D.
        cl_ndrange range = {
            1,                     // The number of dimensions to use.
            
            {0, 0, 0},             // The offset in each dimension.  We want to
            // process ALL of our data, so this is 0 for
            // our test case.                          [7]
            
            {count, 0, 0},    // The global range -- this is how many items
            // IN TOTAL in each dimension you want to
            // process.
            
            {NULL, 0, 0} // The local size of each workgroup.  This
            // determines the number of workitems per
            // workgroup.  It indirectly affects the
            // number of workgroups, since the global
            // size / local size yields the number of
            // workgroups.  So in our test case, we will
            // have NUM_VALUE / wgs workgroups.
        };
        // Calling the kernel is easy; you simply call it like a function,
        // passing the ndrange as the first parameter, followed by the expected
        // kernel parameters.  Note that we case the 'void*' here to the
        // expected OpenCL types.  Remember -- if you use 'float' in your
        // kernel, that's a 'cl_float' from the application's perspective.   [8]
        
        gabor_kernel(&range, (cl_float*)mem_out, (cl_float) amp, (cl_float) phase, (cl_float) phaseInc, (cl_int) pos, (cl_float*) windowCache, (cl_int) windowIndexes[atomLength], (cl_int) atomLength);
        
        // Getting data out of the device's memory space is also easy; we
        // use gcl_memcpy.  In this case, we take the output computed by the
        // kernel and copy it over to our application's memory space.        [9]
        
        gcl_memcpy(output, mem_out, sizeof(cl_float) * count);
        
    });
    
}

void maxiAtomKernel::gaborBatch(float *output, int atomCount, float *amps, float *phases, float *phaseIncs, int *positions, int *atomLengths, int count) {
    
    dispatch_sync(queue, ^{
        gcl_memcpy(mem_amps, amps, sizeof(cl_float) * atomCount);
        gcl_memcpy(mem_phases, phases, sizeof(cl_float) * atomCount);
        gcl_memcpy(mem_phaseIncs, phaseIncs, sizeof(cl_float) * atomCount);
        gcl_memcpy(mem_positions, positions, sizeof(cl_int) * atomCount);
        gcl_memcpy(mem_atomLengths, atomLengths, sizeof(cl_int) * atomCount);
        for(int i=0; i < atomCount;i++) {
            atomWindowIndexes[i] = windowIndexes[atomLengths[i]];
        }
        gcl_memcpy(mem_atomWindowIndexes, &atomWindowIndexes[0], sizeof(cl_int) * atomCount);
        
        // Though we COULD pass NULL as the workgroup size, which would tell
        // OpenCL to pick the one it thinks is best, we can also ask
        // OpenCL for the suggested size, and pass it ourselves.              [6]
        //        size_t wgs;
        //        gcl_get_kernel_block_workgroup_info(gabor_kernel,
        //                                            CL_KERNEL_WORK_GROUP_SIZE,
        //                                            sizeof(wgs), &wgs, NULL);
        
        
        //        printf("OpenCL determinded workgroup size is %d.\n", wgs);
        
        // The N-Dimensional Range over which we'd like to execute our
        // kernel.  In our example case, we're operating on a 1D buffer, so
        // it makes sense that our range is 1D.
        cl_ndrange range = {
            1,                     // The number of dimensions to use.
            
            {0, 0, 0},             // The offset in each dimension.  We want to
            // process ALL of our data, so this is 0 for
            // our test case.                          [7]
            
            {count, 0, 0},    // The global range -- this is how many items
            // IN TOTAL in each dimension you want to
            // process.
            
            {NULL, 0, 0} // The local size of each workgroup.  This
            // determines the number of workitems per
            // workgroup.  It indirectly affects the
            // number of workgroups, since the global
            // size / local size yields the number of
            // workgroups.  So in our test case, we will
            // have NUM_VALUE / wgs workgroups.
        };
        // Calling the kernel is easy; you simply call it like a function,
        // passing the ndrange as the first parameter, followed by the expected
        // kernel parameters.  Note that we case the 'void*' here to the
        // expected OpenCL types.  Remember -- if you use 'float' in your
        // kernel, that's a 'cl_float' from the application's perspective.   [8]
        
        gaborBatch_kernel(&range, (cl_float*)mem_out, atomCount, (cl_float*) mem_amps, (cl_float*) mem_phases, (cl_float*) mem_phaseIncs, (cl_int*) mem_positions, (cl_float*) windowCache, (cl_int*) mem_atomWindowIndexes, (cl_int*) mem_atomLengths);
        
        // Getting data out of the device's memory space is also easy; we
        // use gcl_memcpy.  In this case, we take the output computed by the
        // kernel and copy it over to our application's memory space.        [9]
        
        gcl_memcpy(output, mem_out, sizeof(cl_float) * count);
        
    });
    
}

void maxiAtomKernel::gaborBatch2(float *output, std::vector<structAtomData> &atomDataBlock, int atomCount) {
    dispatch_sync(queue, ^{
        for(int i=0; i < atomCount;i++) {
            atomDataBlock[i].windowStartIndex = windowIndexes[atomDataBlock[i].length];
        }
        cl_timer memTimer;
        memTimer = gcl_start_timer();
        void *memmap_atomData = gcl_map_ptr(mem_atomDataBlock, CL_MAP_WRITE, sizeof(structAtomData) * maxAtoms);
        memcpy(memmap_atomData, &atomDataBlock[0], sizeof(structAtomData) * atomCount);
        gcl_unmap(memmap_atomData);
        double memTime = gcl_stop_timer(memTimer);
        // Though we COULD pass NULL as the workgroup size, which would tell
        // OpenCL to pick the one it thinks is best, we can also ask
        // OpenCL for the suggested size, and pass it ourselves.              [6]
        //        size_t wgs;
        //        gcl_get_kernel_block_workgroup_info(gabor_kernel,
        //                                            CL_KERNEL_WORK_GROUP_SIZE,
        //                                            sizeof(wgs), &wgs, NULL);
        
        
        //        printf("OpenCL determinded workgroup size is %d.\n", wgs);
        
        // The N-Dimensional Range over which we'd like to execute our
        // kernel.  In our example case, we're operating on a 1D buffer, so
        // it makes sense that our range is 1D.
        cl_ndrange range = {
            1,                     // The number of dimensions to use.
            
            {0, 0, 0},             // The offset in each dimension.  We want to
            // process ALL of our data, so this is 0 for
            // our test case.                          [7]
            
            {bufferSize, 0, 0},    // The global range -- this is how many items
            // IN TOTAL in each dimension you want to
            // process.
            
            {NULL, 0, 0} // The local size of each workgroup.  This
            // determines the number of workitems per
            // workgroup.  It indirectly affects the
            // number of workgroups, since the global
            // size / local size yields the number of
            // workgroups.  So in our test case, we will
            // have NUM_VALUE / wgs workgroups.
        };
        // Calling the kernel is easy; you simply call it like a function,
        // passing the ndrange as the first parameter, followed by the expected
        // kernel parameters.  Note that we case the 'void*' here to the
        // expected OpenCL types.  Remember -- if you use 'float' in your
        // kernel, that's a 'cl_float' from the application's perspective.   [8]
        
        cl_timer kernelTimer = gcl_start_timer();
        gaborBatch2_kernel(&range, (cl_float*)mem_out, (structAtomData*) mem_atomDataBlock, atomCount, (cl_float*) windowCache);
        double kernelTime = gcl_stop_timer(kernelTimer);
        
        // Getting data out of the device's memory space is also easy; we
        // use gcl_memcpy.  In this case, we take the output computed by the
        // kernel and copy it over to our application's memory space.        [9]
        
        cl_timer memOutTimer = gcl_start_timer();
//        gcl_memcpy(output, mem_out, sizeof(cl_float) * bufferSize);
        void *memmap_output = gcl_map_ptr(mem_out, CL_MAP_READ, sizeof(cl_float) * bufferSize);
        memcpy(output, memmap_output, sizeof(cl_float) * bufferSize);
        gcl_unmap(memmap_output);
        double memOutTime = gcl_stop_timer(memOutTimer);
        
        std::cout << "Time: " << memTime << "\t" << kernelTime << "\t" << memOutTime << std::endl;
    });
}

void maxiAtomKernel::gaborBatchTest(float *output, std::vector<structAtomData> &atomDataBlock, int atomCount) {
    dispatch_semaphore_t dsema = dispatch_semaphore_create(0);
    dispatch_async(queue, ^{
//        for(int i=0; i < atomCount;i++) {
//            atomDataBlock[i].windowStartIndex = windowIndexes[atomDataBlock[i].length];
//        }
//        cl_timer memTimer;
//        memTimer = gcl_start_timer();
//        void *memmap_atomData = gcl_map_ptr(mem_atomDataBlock, CL_MAP_WRITE, sizeof(structAtomData) * maxAtoms);
//        memcpy(memmap_atomData, &atomDataBlock[0], sizeof(structAtomData) * atomCount);
//        gcl_unmap(memmap_atomData);
//        double memTime = gcl_stop_timer(memTimer);

        size_t wgs;
        gcl_get_kernel_block_workgroup_info(gabor_kernel,
                                            CL_KERNEL_WORK_GROUP_SIZE,
                                            sizeof(wgs), &wgs, NULL);


//        printf("OpenCL determinded workgroup size is %d.\n", wgs);
        
        cl_ndrange range = {
            1,                     // The number of dimensions to use.
            
            {0, 0, 0},             // The offset in each dimension.  We want to
            // process ALL of our data, so this is 0 for
            // our test case.                          [7]
            
            {bufferSize, 0, 0},    // The global range -- this is how many items
            // IN TOTAL in each dimension you want to
            // process.
            
            {wgs, 0, 0} // The local size of each workgroup.  This
            // determines the number of workitems per
            // workgroup.  It indirectly affects the
            // number of workgroups, since the global
            // size / local size yields the number of
            // workgroups.  So in our test case, we will
            // have NUM_VALUE / wgs workgroups.
        };
        
        cl_timer kernelTimer = gcl_start_timer();
        gaborImTestKernel_kernel(&range, imBuffer, (cl_float) 1.0);
        double kernelTime = gcl_stop_timer(kernelTimer);
        kernelTimeMA.addsample(kernelTime);

        
        // Getting data out of the device's memory space is also easy; we
        // use gcl_memcpy.  In this case, we take the output computed by the
        // kernel and copy it over to our application's memory space.        [9]
        
        cl_timer memOutTimer = gcl_start_timer();
        //        gcl_memcpy(output, mem_out, sizeof(cl_float) * bufferSize);
//        void *memmap_output = gcl_map_ptr(mem_out, CL_MAP_READ, sizeof(cl_float) * bufferSize);
//        memcpy(output, memmap_output, sizeof(cl_float) * bufferSize);
//        gcl_unmap(memmap_output);
        const size_t origin[3] = { 0, 0, 0 };
        const size_t region[3] = { bufferSize, 1, 1 };
        gcl_copy_image_to_ptr(&imBufOut[0], imBuffer, origin, region);
        double memOutTime = gcl_stop_timer(memOutTimer);
        memTimeMA.addsample(memOutTime);
        dispatch_semaphore_signal(dsema);
        
    });
    dispatch_semaphore_wait(dsema, DISPATCH_TIME_FOREVER);
    for(int i=0; i < bufferSize; i++) {
        output[i] = imBufOut[i];
    }
    static int ct=0;
//    if(ct++ % 100 == 0) {
        std::cout << "Time: " /*<< memTime << "\t" */<< kernelTimeMA.value() << "\t" << memTimeMA.value() << std::endl;
//    }
}


void maxiAtomKernel::addWindow(float *win, int size) {
    windowIndexes[size] = windows.size();
    for(int i=0; i < size; i++) {
        windows.push_back(win[i]);
    }
}

void maxiAtomKernel::uploadWindows() {
    windowCache = gcl_malloc(sizeof(cl_float) * windows.size(), &windows[0],
                               CL_MEM_READ_ONLY | CL_MEM_COPY_HOST_PTR);
}


maxiAtomKernel::~maxiAtomKernel() {
    gcl_free(mem_in);
    gcl_free(mem_out);
}
