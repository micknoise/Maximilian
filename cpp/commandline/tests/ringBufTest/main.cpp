#include "maximilian.h"
maxiRingBuf rb;
void setup() {//some inits
    rb.setup(10);
    auto sumfunc = [](double val, double n) {
        return val + n;
    };
    for(size_t i=0; i < 20; i++) {
        double sum = rb.reduce(3, sumfunc, 0);
        cout << rb.head() << ", " << rb.tail(3) << "," << sum << endl;
        rb.push(i);
    }
}

void play(double *output) {

}
