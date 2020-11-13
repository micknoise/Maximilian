#pragma once

class [[cheerp::jsexport]] testOsc {
	double phase;
public:
	testOsc();
  double triangle(double frequency);
};
