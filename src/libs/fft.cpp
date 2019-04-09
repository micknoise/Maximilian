/*
 *  maximilian
 *  platform independent synthesis library using portaudio or rtaudio
 *
 *  Created by Mick Grierson on 29/12/2009.
 *  Copyright 2009 Mick Grierson & Strangeloop Limited. All rights reserved.
 *	Thanks to the Goldsmiths Creative Computing Team.
 *	Special thanks to Arturo Castro for the PortAudio implementation.
 * 
 *	Permission is hereby granted, free of charge, to any person
 *	obtaining a copy of this software and associated documentation
 *	files (the "Software"), to deal in the Software without
 *	restriction, including without limitation the rights to use,
 *	copy, modify, merge, publish, distribute, sublicense, and/or sell
 *	copies of the Software, and to permit persons to whom the
 *	Software is furnished to do so, subject to the following
 *	conditions:
 *	
 *	The above copyright notice and this permission notice shall be
 *	included in all copies or substantial portions of the Software.
 *
 *	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,	
 *	EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 *	OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *	NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 *	HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 *	WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 *	FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 *	OTHER DEALINGS IN THE SOFTWARE.
 *
 */
/*
 
 fft.cpp
 
 Based on K+R Numerical recipes in C and some other stuff hacked about.
 
 */

#include "fft.h"	
#include <stdlib.h>
#include <stdio.h>
#include <math.h>
#include <string.h>
#include <iostream>

int **gFFTBitTable = NULL;
const int MaxFastBits = 16;

inline int IsPowerOfTwo(int x)
{
	if (x < 2)
		return false;
	
	if (x & (x - 1))
		return false;
	
	return true;
}

inline int NumberOfBitsNeeded(int PowerOfTwo)
{
	int i;
	
	if (PowerOfTwo < 2) {
		fprintf(stderr, "Error: FFT called with size %d\n", PowerOfTwo);
		exit(1);
	}
	
	for (i = 0;; i++)
		if (PowerOfTwo & (1 << i))
			return i;
}

inline int ReverseBits(int index, int NumBits)
{
	int i, rev;
	
	for (i = rev = 0; i < NumBits; i++) {
		rev = (rev << 1) | (index & 1);
		index >>= 1;
	}
	
	return rev;
}

void InitFFT()
{
    //	gFFTBitTable = new int *[MaxFastBits];
	//use malloc for 16 byte alignment
	gFFTBitTable = (int**) malloc(MaxFastBits * sizeof(int*));
	
	int len = 2;
	for (int b = 1; b <= MaxFastBits; b++) {
		
        //		gFFTBitTable[b - 1] = new int[len];
		gFFTBitTable[b - 1] = (int*) malloc(len * sizeof(int));
		
		for (int i = 0; i < len; i++)
			gFFTBitTable[b - 1][i] = ReverseBits(i, b);
		
		len <<= 1;
	}
}

inline int FastReverseBits(int i, int NumBits)
{
	if (NumBits <= MaxFastBits)
		return gFFTBitTable[NumBits - 1][i];
	else
		return ReverseBits(i, NumBits);
}

/*
 * Complex Fast Fourier Transform
 */

void FFT(int NumSamples,
         bool InverseTransform,
         float *RealIn, float *ImagIn, float *RealOut, float *ImagOut)
{
	int NumBits;                 /* Number of bits needed to store indices */
	int i, j, k, n;
	int BlockSize, BlockEnd;
	
	double angle_numerator = 2.0 * M_PI;
	float tr, ti;                /* temp real, temp imaginary */
	
	if (!IsPowerOfTwo(NumSamples)) {
		fprintf(stderr, "%d is not a power of two\n", NumSamples);
		exit(1);
	}
	
	if (!gFFTBitTable)
		InitFFT();
	
	if (InverseTransform)
		angle_numerator = -angle_numerator;
	
	NumBits = NumberOfBitsNeeded(NumSamples);
	
	/*
	 **   Do simultaneous data copy and bit-reversal ordering into outputs...
	 */
	
	for (i = 0; i < NumSamples; i++) {
		j = FastReverseBits(i, NumBits);
		RealOut[j] = RealIn[i];
		ImagOut[j] = (ImagIn == NULL) ? 0.0 : ImagIn[i];
	}
	
	/*
	 **   Do the FFT itself...
	 */
	
	BlockEnd = 1;
	for (BlockSize = 2; BlockSize <= NumSamples; BlockSize <<= 1) {
		
		double delta_angle = angle_numerator / (double) BlockSize;
		
		float sm2 = sin(-2 * delta_angle);
		float sm1 = sin(-delta_angle);
		float cm2 = cos(-2 * delta_angle);
		float cm1 = cos(-delta_angle);
		float w = 2 * cm1;
		float ar0, ar1, ar2, ai0, ai1, ai2;
		
		for (i = 0; i < NumSamples; i += BlockSize) {
			ar2 = cm2;
			ar1 = cm1;
			
			ai2 = sm2;
			ai1 = sm1;
			
			for (j = i, n = 0; n < BlockEnd; j++, n++) {
				ar0 = w * ar1 - ar2;
				ar2 = ar1;
				ar1 = ar0;
				
				ai0 = w * ai1 - ai2;
				ai2 = ai1;
				ai1 = ai0;
				
				k = j + BlockEnd;
				tr = ar0 * RealOut[k] - ai0 * ImagOut[k];
				ti = ar0 * ImagOut[k] + ai0 * RealOut[k];
				
				RealOut[k] = RealOut[j] - tr;
				ImagOut[k] = ImagOut[j] - ti;
				
				RealOut[j] += tr;
				ImagOut[j] += ti;
			}
		}
		
		BlockEnd = BlockSize;
	}
	
	/*
	 **   Need to normalize if inverse transform...
	 */
	
	if (InverseTransform) {
		float denom = (float) NumSamples;
		
		for (i = 0; i < NumSamples; i++) {
			RealOut[i] /= denom;
			ImagOut[i] /= denom;
		}
	}
}

/*
 * Real Fast Fourier Transform
 *
 * This function was based on the code in Numerical Recipes in C.
 * In Num. Rec., the inner loop is based on a single 1-based array
 * of interleaved real and imaginary numbers.  Because we have two
 * separate zero-based arrays, our indices are quite different.
 * Here is the correspondence between Num. Rec. indices and our indices:
 *
 * i1  <->  real[i]
 * i2  <->  imag[i]
 * i3  <->  real[n/2-i]
 * i4  <->  imag[n/2-i]
 */

void RealFFT(int NumSamples, float *RealIn, float *RealOut, float *ImagOut)
{
	int Half = NumSamples / 2;
	int i;
	
	float theta = M_PI / Half;
	
	float *tmpReal = (float*) malloc(Half * sizeof(float));
	float *tmpImag = (float*) malloc(Half * sizeof(float));
	
	for (i = 0; i < Half; i++) {
		tmpReal[i] = RealIn[2 * i];
		tmpImag[i] = RealIn[2 * i + 1];
	}
	
	FFT(Half, 0, tmpReal, tmpImag, RealOut, ImagOut);
	
	float wtemp = float (sin(0.5 * theta));
	
	float wpr = -2.0 * wtemp * wtemp;
	float wpi = float (sin(theta));
	float wr = 1.0 + wpr;
	float wi = wpi;
	
	int i3;
	
	float h1r, h1i, h2r, h2i;
	
	for (i = 1; i < Half / 2; i++) {
		
		i3 = Half - i;
		
		h1r = 0.5 * (RealOut[i] + RealOut[i3]);
		h1i = 0.5 * (ImagOut[i] - ImagOut[i3]);
		h2r = 0.5 * (ImagOut[i] + ImagOut[i3]);
		h2i = -0.5 * (RealOut[i] - RealOut[i3]);
		
		RealOut[i] = h1r + wr * h2r - wi * h2i;
		ImagOut[i] = h1i + wr * h2i + wi * h2r;
		RealOut[i3] = h1r - wr * h2r + wi * h2i;
		ImagOut[i3] = -h1i + wr * h2i + wi * h2r;
		
		wr = (wtemp = wr) * wpr - wi * wpi + wr;
		wi = wi * wpr + wtemp * wpi + wi;
	}
	
	RealOut[0] = (h1r = RealOut[0]) + ImagOut[0];
	ImagOut[0] = h1r - ImagOut[0];
	
	free(tmpReal);
	free(tmpImag);
}

/*
 * PowerSpectrum
 *
 * This function computes the same as RealFFT, above, but
 * adds the squares of the real and imaginary part of each
 * coefficient, extracting the power and throwing away the
 * phase.
 *
 * For speed, it does not call RealFFT, but duplicates some
 * of its code.
 */

void PowerSpectrum(int NumSamples, float *In, float *Out)
{
	int Half = NumSamples / 2;
	int i;
	
	float theta = M_PI / Half;
	
	float *tmpReal = new float[Half];
	float *tmpImag = new float[Half];
	float *RealOut = new float[Half];
	float *ImagOut = new float[Half];
	
	for (i = 0; i < Half; i++) {
		tmpReal[i] = In[2 * i];
		tmpImag[i] = In[2 * i + 1];
	}
	
	FFT(Half, 0, tmpReal, tmpImag, RealOut, ImagOut);
	
	float wtemp = float (sin(0.5 * theta));
	
	float wpr = -2.0 * wtemp * wtemp;
	float wpi = float (sin(theta));
	float wr = 1.0 + wpr;
	float wi = wpi;
	
	int i3;
	
	float h1r, h1i, h2r, h2i, rt, it;
	//float total=0;
	
	for (i = 1; i < Half / 2; i++) {
		
		i3 = Half - i;
		
		h1r = 0.5 * (RealOut[i] + RealOut[i3]);
		h1i = 0.5 * (ImagOut[i] - ImagOut[i3]);
		h2r = 0.5 * (ImagOut[i] + ImagOut[i3]);
		h2i = -0.5 * (RealOut[i] - RealOut[i3]);
		
		rt = h1r + wr * h2r - wi * h2i; //printf("Realout%i = %f",i,rt);total+=fabs(rt);
		it = h1i + wr * h2i + wi * h2r; // printf("  Imageout%i = %f\n",i,it);
		
		Out[i] = rt * rt + it * it;
		
		rt = h1r - wr * h2r + wi * h2i;
		it = -h1i + wr * h2i + wi * h2r;
		
		Out[i3] = rt * rt + it * it;
		
		wr = (wtemp = wr) * wpr - wi * wpi + wr;
		wi = wi * wpr + wtemp * wpi + wi;
	}
	//printf("total = %f\n",total);
	rt = (h1r = RealOut[0]) + ImagOut[0];
	it = h1r - ImagOut[0];
	Out[0] = rt * rt + it * it;
	
	rt = RealOut[Half / 2];
	it = ImagOut[Half / 2];
	Out[Half / 2] = rt * rt + it * it;
	
	delete[]tmpReal;
	delete[]tmpImag;
	delete[]RealOut;
	delete[]ImagOut;
}

void WindowFunc(int whichFunction, int NumSamples, float *in)
{
	int i;
	
	if (whichFunction == 1) {
		// Bartlett (triangular) window
		for (i = 0; i < NumSamples / 2; i++) {
			in[i] *= (i / (float) (NumSamples / 2));
			in[i + (NumSamples / 2)] *=
			(1.0 - (i / (float) (NumSamples / 2)));
		}
	}
	
	if (whichFunction == 2) {
		// Hamming
		for (i = 0; i < NumSamples; i++)
			in[i] *= 0.54 - 0.46 * cos(2 * M_PI * i / (NumSamples - 1));
	}
	
	if (whichFunction == 3) {
		// Hanning
		for (i = 0; i < NumSamples; i++)
			in[i] *= 0.50 - 0.50 * cos(2 * M_PI * i / (NumSamples - 1));
	}
}

void fft::genWindow(int whichFunction, int NumSamples, float *window)
{
	int i;
	
	if (whichFunction == 1) {
		// Bartlett (triangular) window
		for (i = 0; i < NumSamples / 2; i++) {
			window[i] = (i / (float) (NumSamples / 2));
			window[i + (NumSamples / 2)] =
			(1.0 - (i / (float) (NumSamples / 2)));
		}
	}
	
	if (whichFunction == 2) {
		// Hamming
		for (i = 0; i < NumSamples; i++)
			window[i] = 0.54 - 0.46 * cos(2 * M_PI * i / (NumSamples - 1));
	}
	
	if (whichFunction == 3) {
		// Hanning
		for (i = 0; i < NumSamples; i++)
			window[i] = 0.50 - 0.50 * cos(2 * M_PI * i / (NumSamples - 1));
	}
}

/* constructor */


void fft::setup(int fftSize) {
	n = fftSize;
	half = fftSize / 2;
	//use malloc for 16 byte alignment
    in_real.resize(n,0);
    in_img.resize(n,0);
    out_real.resize(n,0);
    out_img.resize(n,0);
#ifdef __APPLE_CC__
	log2n = log2(n);
    realp.resize(half,0);
    imagp.resize(half,0);
    A.realp = &realp[0];
    A.imagp = &imagp[0];
    if (setupReal==NULL)
        setupReal = vDSP_create_fftsetup(log2n, FFT_RADIX2);
    if (setupReal == NULL) {
        printf("\nFFT_Setup failed to allocate enough memory  for"
               "the real FFT.\n");
    }
    polar.resize(n,0);
#endif
}

//fft::fft(fft const &other) {
////    n = other.n;
////    half = n / 2;
////    //use malloc for 16 byte alignment
////    in_real = other.in_real;
////    in_img = other.in_img;
////    out_real = other.out_real;
////    out_img = other.out_img;
////#ifdef __APPLE_CC__
////    log2n = other.log2n;
////    realp = other.realp;
////    imagp = other.imagp;
////    A.realp = &realp[0];
////    A.imagp = &imagp[0];
////    setupReal = vDSP_create_fftsetup(log2n, FFT_RADIX2);
////    if (setupReal == NULL) {
////        printf("\nFFT_Setup failed to allocate enough memory  for"
////               "the real FFT.\n");
////    }
////    //    polar = (float *) malloc(n * sizeof(float));
////    polar = other.polar;
////#endif
//}


/* destructor */
fft::~fft() {
//    delete[] in_real, out_real, in_img, out_img;
#ifdef __APPLE_CC__
//    std::cout << issetup << std::endl;
    
    if (setupReal != NULL && issetup)
        vDSP_destroy_fftsetup(setupReal);
//    delete[] A.realp;
//    delete[] A.imagp;
//    delete[] polar;
#endif
	
}

float * fft::getReal() {
#ifdef __APPLE_CC__
    return A.realp;
#else
    return &out_real[0];
#endif
}

float * fft::getImg() {
#ifdef __APPLE_CC__
    return A.imagp;
#else
    return &out_img[0];
#endif
}

void fft::calcFFT(int start, float *data, float *window) {
    //windowing
    for (int i = 0; i < n; i++) {
        in_real[i] = data[start + i] * window[i];
    }
    RealFFT(n, &in_real[0], &out_real[0], &out_img[0]);
}

void fft::cartToPol(float *magnitude,float *phase) {
    for (int i = 0; i < half; i++) {
        /* compute power */
        float power = out_real[i]*out_real[i] + out_img[i]*out_img[i];
        /* compute magnitude and phase */
        magnitude[i] = sqrt(power);
        phase[i] = atan2(out_img[i],out_real[i]);
    }
}


/* Calculate the power spectrum */
void fft::powerSpectrum(int start, float *data, float *window, float *magnitude,float *phase) {
	
    calcFFT(start, data, window);
    cartToPol(magnitude, phase);
	
}

void fft::convToDB(float *in, float *out) {
	for (int i = 0; i < half; i++) {
		if (in[i] < 0.000001){ // less than 0.1 nV
			out[i] = 0; // out of range
		} else {
			out[i] = 20.0*log10(in[i] + 1);  // get to to db scale
		}		
	}
}


#ifdef __APPLE_CC__

void fft::calcFFT_vdsp(float *data, float *window) {
    issetup = true;
    uint32_t        i;
    
    //multiply by window
    vDSP_vmul(data, 1, window, 1, &in_real[0], 1, n);
    
    //convert to split complex format - evens and odds
    vDSP_ctoz((COMPLEX *) &in_real[0], 2, &A, 1, half);
    
    
    //calc fft
    vDSP_fft_zrip(setupReal, &A, 1, log2n, FFT_FORWARD);
    
    //scale by 2 (see vDSP docs)
    static float scale=0.5 ;
    vDSP_vsmul(A.realp, 1, &scale, A.realp, 1, half);
    vDSP_vsmul(A.imagp, 1, &scale, A.imagp, 1, half);
}

void fft::cartToPol_vdsp(float *magnitude,float *phase) {
    //back to split complex format
    vDSP_ztoc(&A, 1, (COMPLEX*) &out_real[0], 2, half);
    
    //convert to polar
    vDSP_polar(&out_real[0], 2, &polar[0], 2, half);
    
    for (uint32_t i = 0; i < half; i++) {
        magnitude[i]=polar[2*i];
        phase[i]=polar[2*i + 1];
    }
}


/* Calculate the power spectrum */
void fft::powerSpectrum_vdsp(int start, float *data, float *window, float *magnitude,float *phase) {
    calcFFT_vdsp(data, window);
    cartToPol_vdsp(magnitude, phase);
}

void fft::convToDB_vdsp(float *in, float *out) {
	float ref = 1.0;
	vDSP_vdbcon(in, 1, &ref, out, 1, half, 1);
	//get rid of any -infs
	float vmin=0.0;
	float vmax=9999999.0;
	vDSP_vclip(out, 1, &vmin, &vmax, out, 1, half);
}

#endif

void fft::polToCart(float *magnitude,float *phase) {
    /* get real and imag part */
    for (int i = 0; i < half; i++) {
        //		float mag = pow(10.0, magnitude[i] / 20.0) - 1.0;
        //		in_real[i] = mag *cos(phase[i]);
        //		in_img[i]  = mag *sin(phase[i]);
        in_real[i] = magnitude[i] *cos(phase[i]);
        in_img[i]  = magnitude[i] *sin(phase[i]);
    }
    
    /* zero negative frequencies */
    memset(&in_real[0]+half, 0.0, sizeof(float) * half);
    memset(&in_img[0]+half, 0.0, sizeof(float) * half);
}

void fft::calcIFFT(int start, float *finalOut, float *window) {
    FFT(n, 1, &in_real[0], &in_img[0], &out_real[0], &out_img[0]); // second parameter indicates inverse transform
    for (int i = 0; i < n; i++) {
        finalOut[start + i] += out_real[i] * window[i];
    }
}

void fft::inverseFFTComplex(int start, float *finalOut, float *window, float *real, float *imaginary) {
    for(int i=0; i < half; i++) {
        out_real[i] = real[i];
        out_img[i] = imaginary[i];
    }
    calcIFFT(start, finalOut, window);
}


void fft::inversePowerSpectrum(int start, float *finalOut, float *window, float *magnitude,float *phase) {
    polToCart(magnitude, phase);
    calcIFFT(start, finalOut, window);
}



#ifdef __APPLE_CC__

void fft::polToCart_vdsp(float *magnitude,float *phase) {
    for (uint32_t i = 0; i < half; i++) {
        //		polar[2*i] = pow(10.0, magnitude[i] / 20.0) - 1.0;
        polar[2*i] = magnitude[i];
        polar[2*i + 1] = phase[i];
    }
    
    vDSP_rect(&polar[0], 2, &in_real[0], 2, half);
    
    vDSP_ctoz((COMPLEX*) &in_real[0], 2, &A, 1, half);
}

void fft::calcIFFT_vdsp(float *finalOut, float *window) {
    vDSP_fft_zrip(setupReal, &A, 1, log2n, FFT_INVERSE);
    vDSP_ztoc(&A, 1, (COMPLEX*) &out_real[0], 2, half);
    
    float scale = 1./n;
    vDSP_vsmul(&out_real[0], 1, &scale, &out_real[0], 1, n);
    
    //multiply by window
    vDSP_vmul(&out_real[0], 1, window, 1, finalOut, 1, n);
}

void fft::inversePowerSpectrum_vdsp(int start, float *finalOut, float *window, float *magnitude,float *phase) {
	
    polToCart_vdsp(magnitude, phase);
    calcIFFT_vdsp(finalOut, window);
	
}

void fft::inverseFFTComplex_vdsp(int start, float *finalOut, float *window, float *real, float *imaginary) {
    for(int i=0; i < half; i++) {
        A.realp[i] = real[i];
        A.imagp[i] = imaginary[i];
    }
    calcIFFT_vdsp(finalOut, window);
}

#endif
