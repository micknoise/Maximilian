/*
 *  arrayType.h
 *  mp
 *
 *  Created by Chris on 01/11/2011.
 *  Copyright 2011 Goldsmiths Creative Computing. All rights reserved.
 *
 */

#pragma once

#include "btAlignedObjectArray.h"

typedef btAlignedObjectArray<float> flArr;
typedef btAlignedObjectArray<double> dbArr;
#ifndef uint
typedef unsigned int uint;
#endif

#ifndef PI
#define PI 3.1415926535897932384626433832795028841968
#endif