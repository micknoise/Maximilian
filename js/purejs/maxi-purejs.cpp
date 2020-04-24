#include <cheerp/clientlib.h>
#include "maximilian.h"
// #include "tester.h"
// #include "math.h"
// #include <cmath>




// class [[cheerp::jsexport]] maxiSVF {
// public:
//     maxiSVF() : v0z(0), v1(0), v2(0) { setParams(1000, 1);}
//
//     //20 < cutoff < 20000
//     inline void setCutoff(double cutoff) {
//         setParams(cutoff, res);
//     }
//
//     //from 0 upwards, starts to ring from 2-3ish, cracks a bit around 10
//     inline void setResonance(double q) {
//         setParams(freq, q);
//     }
//
//     //run the filter, and get a mixture of lowpass, bandpass, highpass and notch outputs
//     inline double play(double w, double lpmix, double bpmix, double hpmix, double notchmix) {
//         double low, band, high, notch;
//         double v1z = v1;
//         double v2z = v2;
//         double v3 = w + v0z - 2.0 * v2z;
//         v1 += g1*v3-g2*v1z;
//         v2 += g3*v3+g4*v1z;
//         v0z = w;
//         low = v2;
//         band = v1;
//         high = w-k*v1-v2;
//         notch = w-k*v1;
//         return (low * lpmix) + (band * bpmix) + (high * hpmix) + (notch * notchmix);
//     }
//
// private:
//     inline void setParams(double _freq, double _res) {
//         freq = _freq;
//         res = _res;
//         g = tan(3.1415926535897932384626433832795 * freq / 44100);
//         damping = res == 0 ? 0 : 1.0 / res;
//         k = damping;
//         ginv = g / (1.0 + g * (g + k));
//         g1 = ginv;
//         g2 = 2.0 * (g + k) * ginv;
//         g3 = g * ginv;
//         g4 = 2.0 * ginv;
//     }
//
//     double v0z, v1, v2, g, damping, k, ginv, g1, g2, g3 ,g4;
//     double freq, res;
//
// };

// webMain is the entry point for web applications written in Cheerp
void webMain()
{
        client::console.log("Maximilian 2 - Javascript Transpile");
}
