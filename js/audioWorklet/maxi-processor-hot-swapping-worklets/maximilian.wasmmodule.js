// Copyright 2010 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)


// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).

var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

if (Module['ENVIRONMENT']) {
  throw new Error('Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -s ENVIRONMENT=web or -s ENVIRONMENT=node)');
}


// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)




// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = '';
function locateFile(path) {
  if (Module['locateFile']) {
    return Module['locateFile'](path, scriptDirectory);
  } else {
    return scriptDirectory + path;
  }
}

if (ENVIRONMENT_IS_NODE) {
  scriptDirectory = __dirname + '/';

  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
    ret = tryParseAsDataURI(filename);
    if (!ret) {
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    }
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', abort);

  Module['quit'] = function(status) {
    process['exit'](status);
  };

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
} else
if (ENVIRONMENT_IS_SHELL) {


  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      var data = tryParseAsDataURI(f);
      if (data) {
        return intArrayToString(data);
      }
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    data = tryParseAsDataURI(f);
    if (data) {
      return data;
    }
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status) {
      quit(status);
    }
  }
} else
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  if (ENVIRONMENT_IS_WORKER) { // Check worker, not web, since window could be polyfilled
    scriptDirectory = self.location.href;
  } else if (document.currentScript) { // web
    scriptDirectory = document.currentScript.src;
  }
  // blob urls look like blob:http://site.com/etc/etc and we cannot infer anything from them.
  // otherwise, slice off the final part of the url to find the script directory.
  // if scriptDirectory does not contain a slash, lastIndexOf will return -1,
  // and scriptDirectory will correctly be replaced with an empty string.
  if (scriptDirectory.indexOf('blob:') !== 0) {
    scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf('/')+1);
  } else {
    scriptDirectory = '';
  }


  Module['read'] = function shell_read(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
    } catch (err) {
      var data = tryParseAsDataURI(url);
      if (data) {
        return intArrayToString(data);
      }
      throw err;
    }
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
      } catch (err) {
        var data = tryParseAsDataURI(url);
        if (data) {
          return data;
        }
        throw err;
      }
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      var data = tryParseAsDataURI(url);
      if (data) {
        onload(data.buffer);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  Module['setWindowTitle'] = function(title) { document.title = title };
} else
{
  throw new Error('environment detection error');
}

// Set up the out() and err() hooks, which are how we can print to stdout or
// stderr, respectively.
// If the user provided Module.print or printErr, use that. Otherwise,
// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
var out = Module['print'] || (typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null));
var err = Module['printErr'] || (typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || out));

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;

// perform assertions in shell.js after we set up out() and err(), as otherwise if an assertion fails it cannot print the message
assert(typeof Module['memoryInitializerPrefixURL'] === 'undefined', 'Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['pthreadMainPrefixURL'] === 'undefined', 'Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['cdInitializerPrefixURL'] === 'undefined', 'Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead');
assert(typeof Module['filePackagePrefixURL'] === 'undefined', 'Module.filePackagePrefixURL option was removed, use Module.locateFile instead');



// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  abort('staticAlloc is no longer available at runtime; instead, perform static allocations at compile time (using makeStaticAlloc)');
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  if (end <= _emscripten_get_heap_size()) {
    HEAP32[DYNAMICTOP_PTR>>2] = end;
  } else {
    return 0;
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  return Math.ceil(size / factor) * factor;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0, 'getNativeTypeSize invalid bits ' + bits + ', type ' + type);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    err(text);
  }
}

var asm2wasmImports = { // special asm2wasm imports
    "f64-rem": function(x, y) {
        return x % y;
    },
    "debugger": function() {
        debugger;
    }
};



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// Add a wasm function to the table.
// Attempting to call this with JS function will cause of table.set() to fail
function addWasmFunction(func) {
  var table = wasmTable;
  var ret = table.length;
  table.grow(1);
  table.set(ret, func);
  return ret;
}

// 'sig' parameter is currently only used for LLVM backend under certain
// circumstance: RESERVED_FUNCTION_POINTERS=1, EMULATED_FUNCTION_POINTERS=0.
function addFunction(func, sig) {

  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';

}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}

var tempRet0 = 0;

var setTempRet0 = function(value) {
  tempRet0 = value;
}

var getTempRet0 = function() {
  return tempRet0;
}

function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 1024;




// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html


if (typeof WebAssembly !== 'object') {
  abort('No WebAssembly support found. Build with -s WASM=0 to target JavaScript instead.');
}


/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}




// Wasm globals

var wasmMemory;

// Potentially used for direct table calls.
var wasmTable;


//========================================
// Runtime essentials
//========================================

// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

// C calling interface.
function ccall(ident, returnType, argTypes, args, opts) {
  // For fast lookup of conversion functions
  var toC = {
    'string': function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        var len = (str.length << 2) + 1;
        ret = stackAlloc(len);
        stringToUTF8(str, ret, len);
      }
      return ret;
    },
    'array': function(arr) {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };

  function convertReturnValue(ret) {
    if (returnType === 'string') return UTF8ToString(ret);
    if (returnType === 'boolean') return Boolean(ret);
    return ret;
  }

  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  ret = convertReturnValue(ret);
  if (stack !== 0) stackRestore(stack);
  return ret;
}

function cwrap(ident, returnType, argTypes, opts) {
  return function() {
    return ccall(ident, returnType, argTypes, arguments, opts);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_DYNAMIC = 2; // Cannot be freed except through sbrk
var ALLOC_NONE = 3; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [_malloc,
    stackAlloc,
    dynamicAlloc][allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}




/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  abort("this function has been removed - you should use UTF8ToString(ptr, maxBytesToRead) instead!");
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}


// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ArrayToString(u8Array, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
  while (u8Array[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var str = '';
    // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = u8Array[idx++];
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      var u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      var u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        if ((u0 & 0xF8) != 0xF0) warnOnce('Invalid UTF-8 leading byte 0x' + u0.toString(16) + ' encountered when deserializing a UTF-8 string on the asm.js/wasm heap to a JS string!');
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (u8Array[idx++] & 63);
      }

      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
  return str;
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns a
// copy of that string as a Javascript String object.
// maxBytesToRead: an optional length that specifies the maximum number of bytes to read. You can omit
//                 this parameter to scan the string until the first \0 byte. If maxBytesToRead is
//                 passed, and the string at [ptr, ptr+maxBytesToReadr[ contains a null byte in the
//                 middle, then the string will cut short at that byte index (i.e. maxBytesToRead will
//                 not produce a string of exact length [ptr, ptr+maxBytesToRead[)
//                 N.B. mixing frequent uses of UTF8ToString() with and without maxBytesToRead may
//                 throw JS JIT optimizations off, so it is worth to consider consistently using one
//                 style or the other.
/**
 * @param {number} ptr
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ToString(ptr, maxBytesToRead) {
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u >= 0x200000) warnOnce('Invalid Unicode code point 0x' + u.toString(16) + ' encountered when serializing a JS string to an UTF-8 string on the asm.js/wasm heap! (Valid unicode code points should be in range 0-0x1FFFFF).');
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) ++len;
    else if (u <= 0x7FF) len += 2;
    else if (u <= 0xFFFF) len += 3;
    else len += 4;
  }
  return len;
}


// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}





function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (y + ' [' + x + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}



// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}


var STATIC_BASE = 1024,
    STACK_BASE = 52976,
    STACKTOP = STACK_BASE,
    STACK_MAX = 5295856,
    DYNAMIC_BASE = 5295856,
    DYNAMICTOP_PTR = 52720;

assert(STACK_BASE % 16 === 0, 'stack must start aligned');
assert(DYNAMIC_BASE % 16 === 0, 'heap must start aligned');



var TOTAL_STACK = 5242880;
if (Module['TOTAL_STACK']) assert(TOTAL_STACK === Module['TOTAL_STACK'], 'the stack size can no longer be determined at runtime')

var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) err('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');







// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  if (typeof WebAssembly === 'object' && typeof WebAssembly.Memory === 'function') {
    assert(TOTAL_MEMORY % WASM_PAGE_SIZE === 0);
    wasmMemory = new WebAssembly.Memory({ 'initial': TOTAL_MEMORY / WASM_PAGE_SIZE, 'maximum': TOTAL_MEMORY / WASM_PAGE_SIZE });
    buffer = wasmMemory.buffer;
  } else
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}


  HEAP32[0] = 0x63736d65; /* 'emsc' */



// Endianness check (note: assumes compiler arch was little-endian)
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the main() is called

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


assert(Math.imul, 'This browser does not support Math.imul(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.fround, 'This browser does not support Math.fround(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.clz32, 'This browser does not support Math.clz32(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');
assert(Math.trunc, 'This browser does not support Math.trunc(), build with LEGACY_VM_SUPPORT or POLYFILL_OLD_MATH_FUNCTIONS to add in a polyfill');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;



// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err('still waiting on run dependencies:');
          }
          err('dependency: ' + dep);
        }
        if (shown) {
          err('(end of list)');
        }
      }, 10000);
    }
  } else {
    err('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;






// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}




var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAABugh6YAABf2ACf38AYAN/f38AYAF/AX9gA39/fwF/YAF/AGAEf39/fwF/YAJ/fAF8YAR/fHx8AXxgA398fAF8YAF/AXxgAn98AGADf39/AXxgA39/fABgBH98f3wBfGAFf3x/fH8BfGAEf3x/fABgBX98f3x8AGAGf3x/fHx8AGADf3x8AGAFfHx8fHwBfGADfHx8AXxgBn98fH98fAF8YAZ/fHx8fHwBfGAGf3x8fH9/AXxgCH98fHx8fH9/AXxgA398fwF8YAJ/fwF8YAZ/fH98fHwBfGACf3wBf2ACf38Bf2AFf39/f38Bf2AIf39/f39/f38Bf2AGf39/f39/AX9gAABgBH9/f38AYAZ/f39/f38AYAV/f39/fwBgA39/fAF8YAR/f3x8AXxgBX9/fHx8AXxgB39/fHx8fHwBfGAJf398fHx8fH9/AXxgB39/fHx8f38BfGAHf398fH98fAF8YAR/f3x/AXxgBX9/fH98AXxgB39/fH98fHwBfGAGf398f3x/AXxgBH9/f38BfGADf39/AX1gA39/fAF/YAR/f398AX9gBH9/f30Bf2AFf39/f3wBf2AGf39/f398AX9gB39/f39/f38Bf2AKf39/f39/f39/fwF/YAt/f39/f39/f39/fwF/YAx/f39/f39/f39/f38Bf2AFf39/f34Bf2AEf39/fwF+YAR/f3x8AGAFf398f3wAYAZ/f3x/fHwAYAd/f3x/fHx8AGADf399AGAEf39/fABgBH9/f30AYAd/f39/f39/AGAKf39/f39/f39/fwBgD39/f39/f39/f39/f39/fwBgBX9/fn9/AGAJf39/f39/f39/AX9gDX9/f39/f39/f39/f38Bf2AIf39/f39/f38AYAt/f39/f39/f39/fwBgEH9/f39/f39/f39/f39/f38AYA1/f39/f39/f39/f39/AGAMf39/f39/f39/f39/AGABfAF8YAF9AX1gAn99AGABfwF9YAN/f34AYAR/f39+AX5gBX9/f39/AXxgBn9/f39/fwF8YAJ/fwF+YAJ8fwF8YAJ8fAF8YAF8AX5gA35/fwF/YAJ+fwF/YAZ/fH9/f38Bf2ADf39/AX5gA3x8fwF8YAJ8fwF/YAJ/fwF9YAR/f398AXxgBX9/f3x8AXxgBn9/f3x8fAF8YAh/f398fHx8fAF8YAp/f398fHx8fH9/AXxgCH9/f3x8fH9/AXxgCH9/f3x8f3x8AXxgBX9/f3x/AXxgBn9/f3x/fAF8YAh/f398f3x8fAF8YAd/f398f3x/AXxgBH9/f38BfWAFf39/f30Bf2AHf39/f39/fAF/YAZ/f39/f34Bf2AFf39/f38BfmAFf39/fHwAYAZ/f398f3wAYAd/f398f3x8AGAIf39/fH98fHwAYAV/f39/fABgBX9/f399AGAGf39/fn9/AALcG5sBA2VudgtnZXRUZW1wUmV0MAAAA2VudhJhYm9ydFN0YWNrT3ZlcmZsb3cABQNlbnYNbnVsbEZ1bmNfZGRkZAAFA2Vudg9udWxsRnVuY19kZGRkZGQABQNlbnYLbnVsbEZ1bmNfZGkABQNlbnYMbnVsbEZ1bmNfZGlkAAUDZW52DW51bGxGdW5jX2RpZGQABQNlbnYObnVsbEZ1bmNfZGlkZGQABQNlbnYQbnVsbEZ1bmNfZGlkZGRkZAAFA2VudhJudWxsRnVuY19kaWRkZGRkaWkABQNlbnYQbnVsbEZ1bmNfZGlkZGRpaQAFA2VudhBudWxsRnVuY19kaWRkaWRkAAUDZW52DW51bGxGdW5jX2RpZGkABQNlbnYObnVsbEZ1bmNfZGlkaWQABQNlbnYQbnVsbEZ1bmNfZGlkaWRkZAAFA2Vudg9udWxsRnVuY19kaWRpZGkABQNlbnYMbnVsbEZ1bmNfZGlpAAUDZW52DW51bGxGdW5jX2RpaWQABQNlbnYObnVsbEZ1bmNfZGlpZGQABQNlbnYPbnVsbEZ1bmNfZGlpZGRkAAUDZW52EW51bGxGdW5jX2RpaWRkZGRkAAUDZW52E251bGxGdW5jX2RpaWRkZGRkaWkABQNlbnYRbnVsbEZ1bmNfZGlpZGRkaWkABQNlbnYRbnVsbEZ1bmNfZGlpZGRpZGQABQNlbnYObnVsbEZ1bmNfZGlpZGkABQNlbnYPbnVsbEZ1bmNfZGlpZGlkAAUDZW52EW51bGxGdW5jX2RpaWRpZGRkAAUDZW52EG51bGxGdW5jX2RpaWRpZGkABQNlbnYNbnVsbEZ1bmNfZGlpaQAFA2Vudg5udWxsRnVuY19kaWlpaQAFA2Vudg1udWxsRnVuY19maWlpAAUDZW52Cm51bGxGdW5jX2kABQNlbnYLbnVsbEZ1bmNfaWkABQNlbnYMbnVsbEZ1bmNfaWlkAAUDZW52DG51bGxGdW5jX2lpaQAFA2Vudg1udWxsRnVuY19paWlkAAUDZW52DW51bGxGdW5jX2lpaWkABQNlbnYObnVsbEZ1bmNfaWlpaWQABQNlbnYObnVsbEZ1bmNfaWlpaWYABQNlbnYObnVsbEZ1bmNfaWlpaWkABQNlbnYPbnVsbEZ1bmNfaWlpaWlkAAUDZW52D251bGxGdW5jX2lpaWlpaQAFA2VudhBudWxsRnVuY19paWlpaWlkAAUDZW52EG51bGxGdW5jX2lpaWlpaWkABQNlbnYRbnVsbEZ1bmNfaWlpaWlpaWkABQNlbnYSbnVsbEZ1bmNfaWlpaWlpaWlpAAUDZW52FG51bGxGdW5jX2lpaWlpaWlpaWlpAAUDZW52FW51bGxGdW5jX2lpaWlpaWlpaWlpaQAFA2VudhZudWxsRnVuY19paWlpaWlpaWlpaWlpAAUDZW52D251bGxGdW5jX2lpaWlpagAFA2Vudg5udWxsRnVuY19qaWlpaQAFA2VudgpudWxsRnVuY192AAUDZW52C251bGxGdW5jX3ZpAAUDZW52DG51bGxGdW5jX3ZpZAAFA2Vudg1udWxsRnVuY192aWRkAAUDZW52Dm51bGxGdW5jX3ZpZGlkAAUDZW52D251bGxGdW5jX3ZpZGlkZAAFA2VudhBudWxsRnVuY192aWRpZGRkAAUDZW52DG51bGxGdW5jX3ZpaQAFA2Vudg1udWxsRnVuY192aWlkAAUDZW52Dm51bGxGdW5jX3ZpaWRkAAUDZW52D251bGxGdW5jX3ZpaWRpZAAFA2VudhBudWxsRnVuY192aWlkaWRkAAUDZW52EW51bGxGdW5jX3ZpaWRpZGRkAAUDZW52DW51bGxGdW5jX3ZpaWYABQNlbnYNbnVsbEZ1bmNfdmlpaQAFA2Vudg5udWxsRnVuY192aWlpZAAFA2Vudg5udWxsRnVuY192aWlpZgAFA2Vudg5udWxsRnVuY192aWlpaQAFA2Vudg9udWxsRnVuY192aWlpaWkABQNlbnYQbnVsbEZ1bmNfdmlpaWlpaQAFA2VudhFudWxsRnVuY192aWlpaWlpaQAFA2VudhRudWxsRnVuY192aWlpaWlpaWlpaQAFA2VudhludWxsRnVuY192aWlpaWlpaWlpaWlpaWlpAAUDZW52D251bGxGdW5jX3ZpaWppaQAFA2VudgtpbnZva2VfZGlpaQAxA2VudgtpbnZva2VfZmlpaQAxA2VudghpbnZva2VfaQADA2VudglpbnZva2VfaWkAHgNlbnYKaW52b2tlX2lpaQAEA2VudgtpbnZva2VfaWlpaQAGA2VudgxpbnZva2VfaWlpaWkAHwNlbnYOaW52b2tlX2lpaWlpaWkAOANlbnYPaW52b2tlX2lpaWlpaWlpACADZW52EGludm9rZV9paWlpaWlpaWkASQNlbnYSaW52b2tlX2lpaWlpaWlpaWlpADoDZW52E2ludm9rZV9paWlpaWlpaWlpaWkAOwNlbnYUaW52b2tlX2lpaWlpaWlpaWlpaWkASgNlbnYIaW52b2tlX3YABQNlbnYJaW52b2tlX3ZpAAEDZW52Cmludm9rZV92aWkAAgNlbnYLaW52b2tlX3ZpaWkAIwNlbnYMaW52b2tlX3ZpaWlpACUDZW52D2ludm9rZV92aWlpaWlpaQBLA2VudhJpbnZva2VfdmlpaWlpaWlpaWkATANlbnYXaW52b2tlX3ZpaWlpaWlpaWlpaWlpaWkATQNlbnYZX19fY3hhX2FsbG9jYXRlX2V4Y2VwdGlvbgADA2VudhJfX19jeGFfYmVnaW5fY2F0Y2gAAwNlbnYQX19fY3hhX2VuZF9jYXRjaAAiA2VudhxfX19jeGFfZmluZF9tYXRjaGluZ19jYXRjaF8yAAADZW52HF9fX2N4YV9maW5kX21hdGNoaW5nX2NhdGNoXzMAAwNlbnYVX19fY3hhX2ZyZWVfZXhjZXB0aW9uAAUDZW52Dl9fX2N4YV9yZXRocm93ACIDZW52DF9fX2N4YV90aHJvdwACA2VudgdfX19sb2NrAAUDZW52C19fX21hcF9maWxlAB4DZW52El9fX3Jlc3VtZUV4Y2VwdGlvbgAFA2VudgtfX19zZXRFcnJObwAFA2Vudg1fX19zeXNjYWxsMTQwAB4DZW52DV9fX3N5c2NhbGwxNDUAHgNlbnYNX19fc3lzY2FsbDE0NgAeA2VudgxfX19zeXNjYWxsNTQAHgNlbnYLX19fc3lzY2FsbDYAHgNlbnYMX19fc3lzY2FsbDkxAB4DZW52CV9fX3VubG9jawAFA2VudhZfX2VtYmluZF9yZWdpc3Rlcl9ib29sACUDZW52F19fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzAE4DZW52Jl9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2NsYXNzX2Z1bmN0aW9uAEUDZW52I19fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2NvbnN0cnVjdG9yACQDZW52IF9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2Z1bmN0aW9uAEsDZW52IF9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX3Byb3BlcnR5AEYDZW52F19fZW1iaW5kX3JlZ2lzdGVyX2VtdmFsAAEDZW52F19fZW1iaW5kX3JlZ2lzdGVyX2Zsb2F0AAIDZW52GV9fZW1iaW5kX3JlZ2lzdGVyX2ludGVnZXIAJQNlbnYdX19lbWJpbmRfcmVnaXN0ZXJfbWVtb3J5X3ZpZXcAAgNlbnYbX19lbWJpbmRfcmVnaXN0ZXJfc21hcnRfcHRyAE8DZW52HF9fZW1iaW5kX3JlZ2lzdGVyX3N0ZF9zdHJpbmcAAQNlbnYdX19lbWJpbmRfcmVnaXN0ZXJfc3RkX3dzdHJpbmcAAgNlbnYWX19lbWJpbmRfcmVnaXN0ZXJfdm9pZAABA2VudgxfX2VtdmFsX2NhbGwABgNlbnYOX19lbXZhbF9kZWNyZWYABQNlbnYOX19lbXZhbF9pbmNyZWYABQNlbnYSX19lbXZhbF90YWtlX3ZhbHVlAB4DZW52Bl9hYm9ydAAiA2VudhlfZW1zY3JpcHRlbl9nZXRfaGVhcF9zaXplAAADZW52Fl9lbXNjcmlwdGVuX21lbWNweV9iaWcABANlbnYXX2Vtc2NyaXB0ZW5fcmVzaXplX2hlYXAAAwNlbnYHX2dldGVudgADA2VudhJfbGx2bV9zdGFja3Jlc3RvcmUABQNlbnYPX2xsdm1fc3RhY2tzYXZlAAADZW52El9wdGhyZWFkX2NvbmRfd2FpdAAeA2VudhRfcHRocmVhZF9nZXRzcGVjaWZpYwADA2VudhNfcHRocmVhZF9rZXlfY3JlYXRlAB4DZW52DV9wdGhyZWFkX29uY2UAHgNlbnYUX3B0aHJlYWRfc2V0c3BlY2lmaWMAHgNlbnYLX3N0cmZ0aW1lX2wAHwNlbnYXYWJvcnRPbkNhbm5vdEdyb3dNZW1vcnkAAwNl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ASIBIgEiASIBIgEiASIBIgEiAQIBBQEBIwEBBQEBAQEAACIAAQAFHgUCIgMFAQMBAQUBAgIFBARLAR4CBEUEAQICBAQESwEeRQQBBSIAAQUEJCUjBCMjJQYkJSMiBSIFAAUDBQUDBQMFBQUDBAQEJCUjIyQlBQMFAAQDAQMEBAQDCBcbJicoKSorLC0uLzAMY2RlZmdoaWprbG0xVm4DHjMENAY2bx83IXA4IEk6O0pxcgUBDT4/QEECQ3N0dXZEI3d4JSRFS0xNeRUUCgcJCBcZGBYaDhwPGyYnKCkqKywtLi8wDDEyAAMdHjMENDUGNh83ITggOTo7PD0iBQsTEBESAQ0+P0BBQgJDRCMlJEVGR0gxNjgfQ3dFcgYpB38BIwELfwFBAAt/AUEAC3wBIwILfAEjAwt/AUHwnQMLfwFB8J3DAgsH8wxeEF9fX2N4YV9jYW5fY2F0Y2gAgQ8WX19fY3hhX2lzX3BvaW50ZXJfdHlwZQCCDxFfX19lcnJub19sb2NhdGlvbgD+CQ5fX19nZXRUeXBlTmFtZQD5CQdfZmZsdXNoAJgKBV9mcmVlAPgKD19sbHZtX2Jzd2FwX2kzMgCEDwdfbWFsbG9jAPcKB19tZW1jcHkAhQ8IX21lbW1vdmUAhg8HX21lbXNldACHDxdfcHRocmVhZF9jb25kX2Jyb2FkY2FzdACABBNfcHRocmVhZF9tdXRleF9sb2NrAIAEFV9wdGhyZWFkX211dGV4X3VubG9jawCABAVfc2JyawCIDwlfc2V0VGhyZXcAgw8MZHluQ2FsbF9kZGRkAIkPDmR5bkNhbGxfZGRkZGRkAIoPCmR5bkNhbGxfZGkAiw8LZHluQ2FsbF9kaWQAjA8MZHluQ2FsbF9kaWRkAI0PDWR5bkNhbGxfZGlkZGQAjg8PZHluQ2FsbF9kaWRkZGRkAI8PEWR5bkNhbGxfZGlkZGRkZGlpAJAPD2R5bkNhbGxfZGlkZGRpaQCRDw9keW5DYWxsX2RpZGRpZGQAkg8MZHluQ2FsbF9kaWRpAJMPDWR5bkNhbGxfZGlkaWQAlA8PZHluQ2FsbF9kaWRpZGRkAJUPDmR5bkNhbGxfZGlkaWRpAJYPC2R5bkNhbGxfZGlpAJcPDGR5bkNhbGxfZGlpZACYDw1keW5DYWxsX2RpaWRkAJkPDmR5bkNhbGxfZGlpZGRkAJoPEGR5bkNhbGxfZGlpZGRkZGQAmw8SZHluQ2FsbF9kaWlkZGRkZGlpAJwPEGR5bkNhbGxfZGlpZGRkaWkAnQ8QZHluQ2FsbF9kaWlkZGlkZACeDw1keW5DYWxsX2RpaWRpAJ8PDmR5bkNhbGxfZGlpZGlkAKAPEGR5bkNhbGxfZGlpZGlkZGQAoQ8PZHluQ2FsbF9kaWlkaWRpAKIPDGR5bkNhbGxfZGlpaQCjDw1keW5DYWxsX2RpaWlpAKQPDGR5bkNhbGxfZmlpaQCbEAlkeW5DYWxsX2kApg8KZHluQ2FsbF9paQCnDwtkeW5DYWxsX2lpZACoDwtkeW5DYWxsX2lpaQCpDwxkeW5DYWxsX2lpaWQAqg8MZHluQ2FsbF9paWlpAKsPDWR5bkNhbGxfaWlpaWQArA8NZHluQ2FsbF9paWlpZgCcEA1keW5DYWxsX2lpaWlpAK4PDmR5bkNhbGxfaWlpaWlkAK8PDmR5bkNhbGxfaWlpaWlpALAPD2R5bkNhbGxfaWlpaWlpZACxDw9keW5DYWxsX2lpaWlpaWkAsg8QZHluQ2FsbF9paWlpaWlpaQCzDxFkeW5DYWxsX2lpaWlpaWlpaQC0DxNkeW5DYWxsX2lpaWlpaWlpaWlpALUPFGR5bkNhbGxfaWlpaWlpaWlpaWlpALYPFWR5bkNhbGxfaWlpaWlpaWlpaWlpaQC3Dw5keW5DYWxsX2lpaWlpagCdEA1keW5DYWxsX2ppaWlpAJ4QCWR5bkNhbGxfdgC6DwpkeW5DYWxsX3ZpALsPC2R5bkNhbGxfdmlkALwPDGR5bkNhbGxfdmlkZAC9Dw1keW5DYWxsX3ZpZGlkAL4PDmR5bkNhbGxfdmlkaWRkAL8PD2R5bkNhbGxfdmlkaWRkZADADwtkeW5DYWxsX3ZpaQDBDwxkeW5DYWxsX3ZpaWQAwg8NZHluQ2FsbF92aWlkZADDDw5keW5DYWxsX3ZpaWRpZADEDw9keW5DYWxsX3ZpaWRpZGQAxQ8QZHluQ2FsbF92aWlkaWRkZADGDwxkeW5DYWxsX3ZpaWYAnxAMZHluQ2FsbF92aWlpAMgPDWR5bkNhbGxfdmlpaWQAyQ8NZHluQ2FsbF92aWlpZgCgEA1keW5DYWxsX3ZpaWlpAMsPDmR5bkNhbGxfdmlpaWlpAMwPD2R5bkNhbGxfdmlpaWlpaQDNDxBkeW5DYWxsX3ZpaWlpaWlpAM4PE2R5bkNhbGxfdmlpaWlpaWlpaWkAzw8YZHluQ2FsbF92aWlpaWlpaWlpaWlpaWlpANAPDmR5bkNhbGxfdmlpamlpAKEQE2VzdGFibGlzaFN0YWNrU3BhY2UAmQELZ2xvYmFsQ3RvcnMAlQEKc3RhY2tBbGxvYwCWAQxzdGFja1Jlc3RvcmUAmAEJc3RhY2tTYXZlAJcBCcwbAQAjAAvkDdIPvAHTD7kBugG7AdQP9AipAa0BrwGzAbQBtgGnCbQByAHKAcwBzgHQAdIBzAHaAdQP1A/UD9QP1A/UD9QP1A/UD9QP1A/UD9QP1A/VD/UI+Aj5CP0IgAn6CPcI9gj+CJgJvwHVD9UP1Q/VD9YP+wj/CIYJhwnAAcEBxAHXD/wIiAmJCYoJ/wXXD9cP2A/7BZcJxwHZD50J2g+cCdsPlgncD54J3Q+ECd4PwgHDAd4P3w+FCeAPmATBBMEE2wXBBKIJtwjBBMEE4A/gD+AP4A/gD+AP4Q+LBKYGlAfiD5QEiwWXB/UH4g/iD+IP4w+PBIgF4w/kD6IGmQjkD+UPzAbmD8gG5w+eBugP0QbpD+ME6g+2B9YH6g/rD+cE7A+BCfUG6AvrC+wP7A/sD+0PugTuD+0L7w+3A7cD3wPfA98D3wPfA98D3wPfA98D3wPfA98D3wPfA98D3wPfA/4B/gH+Af4B3AupDqsOrQ7VDu8P7w/vD/AP+gmABIAEhguHC4AEgASOC48LrwuvC7cLuAu8C70LkAK5DLoMuwy8DL0Mvgy/DJAC2gzbDNwM3QzeDN8M4AyADYANgASADYANgATgAuACgATgAuACgASABIAEiwKpDYAEqw3GDccNzQ3ODYACgAKAAoAEgASLAuoO7Q7tDvMOrgO4A8IDygOiAaQBpgHVA5IC3QOfBJICpwSrAcgEkgLQBOwEkgL0BJAFkgKYBbgFkgLABeAFkgLoBYMGkgKLBqwGkgK0Br0B2gaSAuIG+QaSAoEHmgeSAqIHugeSAsIH2QeSAuEH+AeSAoAInAiSAqQIxgiSAs4I1AHVAdcBvQHcAd4B8AH/AeIBswK8AuAB4wLsAtkCiQOSA+IBmAKGBLMOhgSGBIYEhgSGBIYEhgSGBIYEhgSGBIYEhgSGBIYEhgSABIAEgATwD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8Q/FAcYB8Q/yD/QDrw6xBNoE/gSiBcoF8gWVBr4G7AaLB6wHzAfrB4oIrgjYCIgLiAuQC5ALsQu1C7kLvgu5DbsNvQ3WDdgN2g3QA+ADqQTQA9IE9gSaBcIF6gWNBrYG0APkBoMHpAfEB+MHggimCNAI6gjQA/AIjwLIAvUCngP9A9kL8g/yD/MPlAj0D/sJ/An/CYAKxwqCC4ULiQuCC40LkQuwC7QLxQvKC5oNmg26DbwNvw3SDdcN2Q3cDdgO9A71DpUC5wHLAqsC+ALbAqED5wGcCogNxg6QDdEO9A/0D/QP9A/0D/QP9A/0D/QP9A/0D/QP9A/0D/QP9A/0D/QP9A/0D/QP9A/0D/UP0wL2D6oD9w++DdMN1A3VDdsNpAKBA4EB3Qv1C/UL+Av8C6QM9w/4D54MnwytDK4M+A/4D/gP+Q/DC8gLmQyaDJwMoAyoDKkMqwyvDJ8NoA2oDaoNwA3dDZ8NpQ2fDbAN+Q/5D/kP+Q/5D/kP+Q/5D/kP+Q/5D/oPkg2WDfoP+w/OC88L0AvRC9IL0wvUC9UL1gvXC9gL/gv/C4AMgQyCDIMMhAyFDIYMhwyIDLMMtAy1DLYMtwzUDNUM1gzXDNgMkw2XDZEJsAz7D/sP+w/7D/sP+w/7D/sP+w/7D/sP+w/7D/sP+w/7D/sP+w/7D/sP+w/7D/sP+w/7D/sP+w/8D/gM/AyFDYYNjQ2ODf0LmAz8D/wP/A/8D/wP/A/8D/0PuAzZDJ0Nng2mDacNpA2kDa4Nrw39D/0P/Q/9D/0P/g/bC4kM/g//D4cNjw3/D4AQ5wuMDIAQgRCbDJ0MqgysDIEQgRCBEIIQ8gv6C4IQgxDUDmZisg7CDMEMwAzkDOMM4gzjDeUN6Q3rDe0N7w3xDfcN+Q37Df0N/w2BDoMOhQ6HDokOiw6NDo8OkQ6TDpUOlw6ZDuQOgxCDEIMQgxCDEIMQgxCDEIMQ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IANBsPgBNgIAIANB+MoBQdUBEGcLCwVBACEECyAAIAQ2AgAgACACQQJ0IARqIgI2AgggACACNgIEIAAgAUECdCAEajYCDAuoAQEFfyABQQRqIgQoAgBBACAAQQRqIgIoAgAgACgCACIGayIDQQJ1a0ECdGohBSAEIAU2AgAgA0EASgRAIAUgBiADEIUPGgsgACgCACEDIAAgBCgCADYCACAEIAM2AgAgAigCACEDIAIgAUEIaiICKAIANgIAIAIgAzYCACAAQQhqIgAoAgAhAiAAIAFBDGoiACgCADYCACAAIAI2AgAgASAEKAIANgIAC0UBA38gACgCBCICIABBCGoiAygCACIBRwRAIAMgAUF8aiACa0ECdkF/c0ECdCABajYCAAsgACgCACIARQRADwsgABC0DgsIAEH/////Awu6AgEIfyMJIQUjCUEgaiQJIwkjCk4EQEEgEAELIAUhAyAAKAIIIABBBGoiBigCACIEa0ECdSABTwRAIAEhACAGKAIAIgQhAwNAIAMgAigCADYCACADQQRqIQMgAEF/aiIADQALIAYgAUECdCAEajYCACAFJAkPCyABIAQgACgCAGtBAnVqIQQgABDsASIHIARJBEAgABDTDgsgAyAEIAAoAgggACgCACIIayIJQQF1IgogCiAESRsgByAJQQJ1IAdBAXZJGyAGKAIAIAhrQQJ1IABBCGoQ6QFBACQFQRIgAyABIAIQWyMFIQFBACQFIAFBAXEEQBBjIQEQABogAxDrASABEGoLQQAkBUE/IAAgAxBaIwUhAEEAJAUgAEEBcQRAEGMhARAAGiADEOsBIAEQagsgAxDrASAFJAkLQAEDfyABIQMgAEEIaiIEKAIAIgUhAANAIAAgAigCADYCACAAQQRqIQAgA0F/aiIDDQALIAQgAUECdCAFajYCAAsDAAELBwAgABD2AQsEAEEACxMAIABFBEAPCyAAEPcBIAAQtA4LBQAQ+AELBQAQ+QELBQAQ+gELBgBBsLABCx8BAX8gACgCACIBRQRADwsgACAAKAIANgIEIAEQtA4LBgBBsLABCwYAQciwAQsGAEHYsAELBgBBlYUCCwYAQZiFAgsGAEGahQILIAEBf0EMELMOIgBBADYCACAAQQA2AgQgAEEANgIIIAALEQAgAEEfcUGaAWoRAAAQggILBABBAQsFABCDAgsEACAACwYAQcjMAQtzAQN/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCEFIAEQggIhAyAAKAIAIQEgAyAAKAIEIgBBAXVqIQMgAEEBcQR/IAEgAygCAGooAgAFIAELIQAgBSACEIICNgIAIAMgBSAAQf8BcUHgCmoRAQAgBCQJCwQAQQMLBQAQiAILJQECf0EIELMOIQEgACgCBCECIAEgACgCADYCACABIAI2AgQgAQsGAEHMzAELBgBBnYUCC3sBA38jCSEFIwlBEGokCSMJIwpOBEBBEBABCyAFIQYgARCCAiEEIAAoAgAhASAEIAAoAgQiAEEBdWohBCAAQQFxBH8gASAEKAIAaigCAAUgAQshACACEIICIQEgBiADEIICNgIAIAQgASAGIABBH3FB+gxqEQIAIAUkCQsEAEEECwUAEI0CCwUAQYAICwYAQaKFAgt1AQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAyEEIAEQggIhAiAAKAIAIQEgAiAAKAIEIgBBAXVqIQIgAEEBcQR/IAEgAigCAGooAgAFIAELIQAgBCACIABB/wFxQboBahEDADYCACAEEJICIQAgAyQJIAALBABBAgsFABCTAgsHACAAKAIACwYAQdjMAQsGAEGohQILeAECfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgAhBCADIgAgARCCAiACEIICIARBH3FB+gxqEQIAQQAkBUGOASAAEE4hASMFIQJBACQFIAJBAXEEQBBjIQEQABogABCZAiABEGoFIAAQmQIgAyQJIAEPC0EACwUAEJoCCxUBAX9BBBCzDiIBIAAoAgA2AgAgAQsPACAAKAIAEIMBIAAoAgALMgAgACgCACEAQQAkBUGcAiAAEFkjBSEAQQAkBSAAQQFxBEBBABBkIQAQABogABDhAQsLBgBB4MwBCwYAQb+FAgs2AQF/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiABEJ4CIAAQnwIgAhCCAhCEATYCACACJAkLCQAgAEEBEKMCCzUBAX8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIAA2AgAgAiABEJICEKACIAIQoQIgAiQJCwUAEKICCxkAIAAoAgAgATYCACAAIAAoAgBBCGo2AgALAwABCwYAQYjMAQsJACAAIAE2AgALVwEBfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgAhACABEIICIQEgAhCCAiECIAQgAxCCAjYCACABIAIgBCAAQT9xQYAEahEEABCCAiEAIAQkCSAACwUAEKYCCwUAQZAICwYAQcSFAgs1AQJ/IABBBGoiAygCACICIAAoAghGBEAgACABEKwCBSACIAErAwA5AwAgAyACQQhqNgIACwtFAQJ/IABBBGoiBCgCACAAKAIAa0EDdSIDIAFJBEAgACABIANrIAIQsQIPCyADIAFNBEAPCyAEIAAoAgAgAUEDdGo2AgALLAAgASgCBCABKAIAa0EDdSACSwRAIAAgASgCACACQQN0ahDOAgUgABCdAgsLFwAgACgCACABQQN0aiACKwMAOQMAQQEL3QEBCH8jCSEGIwlBIGokCSMJIwpOBEBBIBABCyAGIQIgAEEEaiIIKAIAIAAoAgBrQQN1QQFqIQMgABCwAiIHIANJBEAgABDTDgsgAiADIAAoAgggACgCACIJayIEQQJ1IgUgBSADSRsgByAEQQN1IAdBAXZJGyAIKAIAIAlrQQN1IABBCGoQrQIgAkEIaiIEKAIAIgUgASsDADkDACAEIAVBCGo2AgBBACQFQcEAIAAgAhBaIwUhAEEAJAUgAEEBcQRAEGMhABAAGiACEK8CIAAQagUgAhCvAiAGJAkLC6oBAQJ/IABBADYCDCAAIAM2AhAgAQRAAkAgAUH/////AU0EQCABQQN0ELMOIQQMAQtBCBBgIQNBACQFQcAAIANBltsCEFojBSEFQQAkBSAFQQFxBEAQYyEFEAAaIAMQZSAFEGoFIANBsPgBNgIAIANB+MoBQdUBEGcLCwVBACEECyAAIAQ2AgAgACACQQN0IARqIgI2AgggACACNgIEIAAgAUEDdCAEajYCDAuoAQEFfyABQQRqIgQoAgBBACAAQQRqIgIoAgAgACgCACIGayIDQQN1a0EDdGohBSAEIAU2AgAgA0EASgRAIAUgBiADEIUPGgsgACgCACEDIAAgBCgCADYCACAEIAM2AgAgAigCACEDIAIgAUEIaiICKAIANgIAIAIgAzYCACAAQQhqIgAoAgAhAiAAIAFBDGoiACgCADYCACAAIAI2AgAgASAEKAIANgIAC0UBA38gACgCBCICIABBCGoiAygCACIBRwRAIAMgAUF4aiACa0EDdkF/c0EDdCABajYCAAsgACgCACIARQRADwsgABC0DgsIAEH/////AQu7AgEIfyMJIQUjCUEgaiQJIwkjCk4EQEEgEAELIAUhAyAAKAIIIABBBGoiBigCACIEa0EDdSABTwRAIAEhACAGKAIAIgQhAwNAIAMgAisDADkDACADQQhqIQMgAEF/aiIADQALIAYgAUEDdCAEajYCACAFJAkPCyABIAQgACgCAGtBA3VqIQQgABCwAiIHIARJBEAgABDTDgsgAyAEIAAoAgggACgCACIIayIJQQJ1IgogCiAESRsgByAJQQN1IAdBAXZJGyAGKAIAIAhrQQN1IABBCGoQrQJBACQFQRMgAyABIAIQWyMFIQFBACQFIAFBAXEEQBBjIQEQABogAxCvAiABEGoLQQAkBUHBACAAIAMQWiMFIQBBACQFIABBAXEEQBBjIQEQABogAxCvAiABEGoLIAMQrwIgBSQJC0ABA38gASEDIABBCGoiBCgCACIFIQADQCAAIAIrAwA5AwAgAEEIaiEAIANBf2oiAw0ACyAEIAFBA3QgBWo2AgALBwAgABC4AgsTACAARQRADwsgABD3ASAAELQOCwUAELkCCwUAELoCCwUAELsCCwYAQYixAQsGAEGIsQELBgBBoLEBCwYAQbCxAQsRACAAQR9xQZoBahEAABCCAgsFABC+AgsGAEHszAELcwEDfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSABEIICIQMgACgCACEBIAMgACgCBCIAQQF1aiEDIABBAXEEfyABIAMoAgBqKAIABSABCyEAIAUgAhDBAjkDACADIAUgAEH/AXFB4ApqEQEAIAQkCQsFABDCAgsEACAACwYAQfDMAQsGAEHlhgILewEDfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiABEIICIQQgACgCACEBIAQgACgCBCIAQQF1aiEEIABBAXEEfyABIAQoAgBqKAIABSABCyEAIAIQggIhASAGIAMQwQI5AwAgBCABIAYgAEEfcUH6DGoRAgAgBSQJCwUAEMYCCwUAQaAICwYAQeqGAgt1AQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAyEEIAEQggIhAiAAKAIAIQEgAiAAKAIEIgBBAXVqIQIgAEEBcQR/IAEgAigCAGooAgAFIAELIQAgBCACIABB/wFxQboBahEDADYCACAEEJICIQAgAyQJIAALBQAQygILBgBB/MwBC3gBAn8jCSEDIwlBEGokCSMJIwpOBEBBEBABCyAAKAIAIQQgAyIAIAEQggIgAhCCAiAEQR9xQfoMahECAEEAJAVBjgEgABBOIQEjBSECQQAkBSACQQFxBEAQYyEBEAAaIAAQmQIgARBqBSAAEJkCIAMkCSABDwtBAAsFABDNAgsGAEGEzQELNgEBfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIgARDPAiAAENACIAIQggIQhAE2AgAgAiQJCzUBAX8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIAA2AgAgAiABELQBENECIAIQoQIgAiQJCwUAENICCxkAIAAoAgAgATkDACAAIAAoAgBBCGo2AgALBgBBsMwBC1cBAX8jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAAKAIAIQAgARCCAiEBIAIQggIhAiAEIAMQwQI5AwAgASACIAQgAEE/cUGABGoRBAAQggIhACAEJAkgAAsFABDVAgsFAEGwCAsGAEHwhgILOAECfyAAQQRqIgIoAgAiAyAAKAIIRgRAIAAgARDcAgUgAyABLAAAOgAAIAIgAigCAEEBajYCAAsLPwECfyAAQQRqIgQoAgAgACgCAGsiAyABSQRAIAAgASADayACEOECDwsgAyABTQRADwsgBCABIAAoAgBqNgIACw0AIAAoAgQgACgCAGsLJgAgASgCBCABKAIAayACSwRAIAAgAiABKAIAahD7AgUgABCdAgsLFAAgASAAKAIAaiACLAAAOgAAQQEL1QEBCH8jCSEFIwlBIGokCSMJIwpOBEBBIBABCyAFIQIgAEEEaiIHKAIAIAAoAgBrQQFqIQQgABDgAiIGIARJBEAgABDTDgsgAiAEIAAoAgggACgCACIIayIJQQF0IgMgAyAESRsgBiAJIAZBAXZJGyAHKAIAIAhrIABBCGoQ3QIgAkEIaiIDKAIAIAEsAAA6AAAgAyADKAIAQQFqNgIAQQAkBUHCACAAIAIQWiMFIQBBACQFIABBAXEEQBBjIQAQABogAhDfAiAAEGoFIAIQ3wIgBSQJCwtBACAAQQA2AgwgACADNgIQIAAgAQR/IAEQsw4FQQALIgM2AgAgACACIANqIgI2AgggACACNgIEIAAgASADajYCDAufAQEFfyABQQRqIgQoAgAgAEEEaiICKAIAIAAoAgAiBmsiA2shBSAEIAU2AgAgA0EASgRAIAUgBiADEIUPGgsgACgCACEDIAAgBCgCADYCACAEIAM2AgAgAigCACEDIAIgAUEIaiICKAIANgIAIAIgAzYCACAAQQhqIgAoAgAhAiAAIAFBDGoiACgCADYCACAAIAI2AgAgASAEKAIANgIAC0IBA38gACgCBCICIABBCGoiAygCACIBRwRAA0AgAUF/aiIBIAJHDQALIAMgATYCAAsgACgCACIARQRADwsgABC0DgsIAEH/////BwueAgEIfyMJIQUjCUEgaiQJIwkjCk4EQEEgEAELIAUhAyAAKAIIIABBBGoiBCgCACIGayABTwRAA0AgBCgCACACLAAAOgAAIAQgBCgCAEEBajYCACABQX9qIgENAAsgBSQJDwsgASAGIAAoAgBraiEHIAAQ4AIiCCAHSQRAIAAQ0w4LIAMgByAAKAIIIAAoAgAiCWsiCkEBdCIGIAYgB0kbIAggCiAIQQF2SRsgBCgCACAJayAAQQhqEN0CQQAkBUEUIAMgASACEFsjBSEBQQAkBSABQQFxBEAQYyEBEAAaIAMQ3wIgARBqC0EAJAVBwgAgACADEFojBSEAQQAkBSAAQQFxBEAQYyEBEAAaIAMQ3wIgARBqCyADEN8CIAUkCQsvACAAQQhqIQADQCAAKAIAIAIsAAA6AAAgACAAKAIAQQFqNgIAIAFBf2oiAQ0ACwsHACAAEOgCCxMAIABFBEAPCyAAEPcBIAAQtA4LBQAQ6QILBQAQ6gILBQAQ6wILBgBB2LEBCwYAQdixAQsGAEHwsQELBgBBgLIBCxEAIABBH3FBmgFqEQAAEIICCwUAEO4CCwYAQZDNAQtzAQN/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCEFIAEQggIhAyAAKAIAIQEgAyAAKAIEIgBBAXVqIQMgAEEBcQR/IAEgAygCAGooAgAFIAELIQAgBSACEIICOgAAIAMgBSAAQf8BcUHgCmoRAQAgBCQJCwUAEPECCwYAQZTNAQt7AQN/IwkhBSMJQRBqJAkjCSMKTgRAQRAQAQsgBSEGIAEQggIhBCAAKAIAIQEgBCAAKAIEIgBBAXVqIQQgAEEBcQR/IAEgBCgCAGooAgAFIAELIQAgAhCCAiEBIAYgAxCCAjoAACAEIAEgBiAAQR9xQfoMahECACAFJAkLBQAQ9AILBQBBwAgLdQEDfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCABEIICIQIgACgCACEBIAIgACgCBCIAQQF1aiECIABBAXEEfyABIAIoAgBqKAIABSABCyEAIAQgAiAAQf8BcUG6AWoRAwA2AgAgBBCSAiEAIAMkCSAACwUAEPcCCwYAQaDNAQt4AQJ/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgACgCACEEIAMiACABEIICIAIQggIgBEEfcUH6DGoRAgBBACQFQY4BIAAQTiEBIwUhAkEAJAUgAkEBcQRAEGMhARAAGiAAEJkCIAEQagUgABCZAiADJAkgAQ8LQQALBQAQ+gILBgBBqM0BCzYBAX8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIAEQ/AIgABD9AiACEIICEIQBNgIAIAIkCQs1AQF/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiAANgIAIAIgARD/AhD+AiACEKECIAIkCQsFABCAAwsfACAAKAIAIAFBGHRBGHU2AgAgACAAKAIAQQhqNgIACwcAIAAsAAALBgBB4MsBC1cBAX8jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAAKAIAIQAgARCCAiEBIAIQggIhAiAEIAMQggI6AAAgASACIAQgAEE/cUGABGoRBAAQggIhACAEJAkgAAsFABCDAwsFAEHQCAs1AQJ/IABBBGoiAygCACICIAAoAghGBEAgACABEIcDBSACIAEoAgA2AgAgAyACQQRqNgIACwtFAQJ/IABBBGoiBCgCACAAKAIAa0ECdSIDIAFJBEAgACABIANrIAIQiAMPCyADIAFNBEAPCyAEIAAoAgAgAUECdGo2AgALLAAgASgCBCABKAIAa0ECdSACSwRAIAAgASgCACACQQJ0ahCkAwUgABCdAgsL3QEBCH8jCSEGIwlBIGokCSMJIwpOBEBBIBABCyAGIQIgAEEEaiIIKAIAIAAoAgBrQQJ1QQFqIQMgABDsASIHIANJBEAgABDTDgsgAiADIAAoAgggACgCACIJayIEQQF1IgUgBSADSRsgByAEQQJ1IAdBAXZJGyAIKAIAIAlrQQJ1IABBCGoQ6QEgAkEIaiIEKAIAIgUgASgCADYCACAEIAVBBGo2AgBBACQFQcMAIAAgAhBaIwUhAEEAJAUgAEEBcQRAEGMhABAAGiACEOsBIAAQagUgAhDrASAGJAkLC7sCAQh/IwkhBSMJQSBqJAkjCSMKTgRAQSAQAQsgBSEDIAAoAgggAEEEaiIGKAIAIgRrQQJ1IAFPBEAgASEAIAYoAgAiBCEDA0AgAyACKAIANgIAIANBBGohAyAAQX9qIgANAAsgBiABQQJ0IARqNgIAIAUkCQ8LIAEgBCAAKAIAa0ECdWohBCAAEOwBIgcgBEkEQCAAENMOCyADIAQgACgCCCAAKAIAIghrIglBAXUiCiAKIARJGyAHIAlBAnUgB0EBdkkbIAYoAgAgCGtBAnUgAEEIahDpAUEAJAVBFSADIAEgAhBbIwUhAUEAJAUgAUEBcQRAEGMhARAAGiADEOsBIAEQagtBACQFQcMAIAAgAxBaIwUhAEEAJAUgAEEBcQRAEGMhARAAGiADEOsBIAEQagsgAxDrASAFJAkLBwAgABCOAwsTACAARQRADwsgABD3ASAAELQOCwUAEI8DCwUAEJADCwUAEJEDCwYAQaiyAQsGAEGosgELBgBBwLIBCwYAQdCyAQsRACAAQR9xQZoBahEAABCCAgsFABCUAwsGAEG0zQELcwEDfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSABEIICIQMgACgCACEBIAMgACgCBCIAQQF1aiEDIABBAXEEfyABIAMoAgBqKAIABSABCyEAIAUgAhCXAzgCACADIAUgAEH/AXFB4ApqEQEAIAQkCQsFABCYAwsEACAACwYAQbjNAQsGAEGsiQILewEDfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiABEIICIQQgACgCACEBIAQgACgCBCIAQQF1aiEEIABBAXEEfyABIAQoAgBqKAIABSABCyEAIAIQggIhASAGIAMQlwM4AgAgBCABIAYgAEEfcUH6DGoRAgAgBSQJCwUAEJwDCwUAQeAICwYAQbGJAgt1AQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAyEEIAEQggIhAiAAKAIAIQEgAiAAKAIEIgBBAXVqIQIgAEEBcQR/IAEgAigCAGooAgAFIAELIQAgBCACIABB/wFxQboBahEDADYCACAEEJICIQAgAyQJIAALBQAQoAMLBgBBxM0BC3gBAn8jCSEDIwlBEGokCSMJIwpOBEBBEBABCyAAKAIAIQQgAyIAIAEQggIgAhCCAiAEQR9xQfoMahECAEEAJAVBjgEgABBOIQEjBSECQQAkBSACQQFxBEAQYyEBEAAaIAAQmQIgARBqBSAAEJkCIAMkCSABDwtBAAsFABCjAwsGAEHMzQELNgEBfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIgARClAyAAEKYDIAIQggIQhAE2AgAgAiQJCzUBAX8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIAA2AgAgAiABEKgDEKcDIAIQoQIgAiQJCwUAEKkDCxkAIAAoAgAgATgCACAAIAAoAgBBCGo2AgALBwAgACoCAAsGAEGozAELVwEBfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgAhACABEIICIQEgAhCCAiECIAQgAxCXAzgCACABIAIgBCAAQT9xQYAEahEEABCCAiEAIAQkCSAACwUAEKwDCwUAQfAICwYAQbeJAgsHACAAELMDCw4AIABFBEAPCyAAELQOCwUAELQDCwUAELUDCwUAELYDCwYAQeCyAQsGAEHgsgELBgBB6LIBCwYAQfiyAQsHAEEBELMOCxEAIABBH3FBmgFqEQAAEIICCwUAELoDCwYAQdjNAQsUACABEIICIABB/wNxQbgGahEFAAsFABC9AwsGAEHczQELBgBB6okCCxQAIAEQggIgAEH/A3FBuAZqEQUACwUAEMEDCwYAQeTNAQsHACAAEMYDCwUAEMcDCwUAEMgDCwUAEMkDCwYAQYizAQsGAEGIswELBgBBkLMBCwYAQaCzAQsRACAAQR9xQZoBahEAABCCAgsFABDMAwsGAEHszQELHQAgARCCAiACEIICIAMQggIgAEEfcUH6DGoRAgALBQAQzwMLBQBBgAkLawEDfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCAAKAIAIQIgASAAKAIEIgFBAXVqIQAgAUEBcQRAIAIgACgCAGooAgAhAgsgBCAAIAJB/wFxQboBahEDADYCACAEEJICIQAgAyQJIAALQwEBfyAAKAIAIQMgASAAKAIEIgFBAXVqIQAgAUEBcQRAIAMgACgCAGooAgAhAwsgACACEIICIANB/wFxQeAKahEBAAsFABCiAgtAAQJ/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgACgCBCECIAEgACgCADYCACABIAI2AgQgARCHAiEAIAEkCSAAC0ABAn8jCSEBIwlBEGokCSMJIwpOBEBBEBABCyAAKAIEIQIgASAAKAIANgIAIAEgAjYCBCABEIcCIQAgASQJIAALBwAgABDZAwsFABDaAwsFABDbAwsFABDcAwsGAEGwswELBgBBsLMBCwYAQbizAQsGAEHIswELaAEDfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIiASAAQf8DcUG4BmoRBQBBACQFQY8BIAEQTiEDIwUhAEEAJAUgAEEBcQRAEGMhABAAGiABEIMEIAAQagUgARCDBCACJAkgAw8LQQALBQAQhwQLGQEBf0EIELMOIgBBADYCACAAQQA2AgQgAAvuAQEGfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAJBDGohBiACQQhqIQMgAiEHQQgQsw4hBEEAJAVBxAAgAkEEaiIFIAEQWiMFIQFBACQFIAFBAXEEQBBjIQEQABogBBC0DiABEGoLQQAkBUHFACADIAUQWiMFIQFBACQFIAFBAXEEQBBjIQAQABoFIAdBADYCAEEAJAUgBiAHKAIANgIAQQsgBCAAIAMgBhBcIwUhAEEAJAUgAEEBcQR/EGMhARAAGiADEOcDIAEFIAMQ5wMgBRCZAiACJAkgBA8LIQALIAUQmQIgBBC0DiAAEGpBAAsTACAARQRADwsgABCDBCAAELQOCwUAEIQECwQAQQILCQAgACABEKMCCwkAIAAgARDoAwuUAwEFfyMJIQMjCUEgaiQJIwkjCk4EQEEgEAELIAMhCCADQRBqIQYgA0EIaiEHIAAgATYCAEEAJAVBkAFBFBBOIQQjBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUHGACAHIAIQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgUgBEEANgIEIARBADYCCCAEQfjNATYCACAGIAE2AgBBACQFQccAIAZBBGogBxBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVByAAgBEEMaiAGEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABogBhDwAwUgBhDwAyAAIAQ2AgQgBxDnAyAIIAE2AgAgCCABNgIEIAAgCBDtAyADJAkPCwsgBBChAiAHEOcDCyAEELQOCyAAEGEaQQAkBUHJACACIAEQWiMFIQBBACQFIABBAXFFBEBBACQFQQIQWEEAJAULEGMhABAAGkEAJAVBAxBYIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQagsLBwAgABCZAgs2AQF/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiABEOkDIAAQ6gMgAhCCAhCEATYCACACJAkLNQEBfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIgADYCACACIAEQmAIQoAIgAhChAiACJAkLBQAQ6wMLBgBB6LABCwkAIAAgARDvAwsDAAELaAEBfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELIAEgABD8AyABEJkCIAFBBGoiAhCdAkEAJAVBPCAAIAIQTxojBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAIQmQIgABBqBSACEJkCIAEkCQsLFQEBfyAAIAEoAgAiAjYCACACEIMBCwoAIABBBGoQ+gMLGAAgAEH4zQE2AgAgAEEMahD7AyAAEKECCwwAIAAQ8QMgABC0DgtBAQF/IAAoAgwhAUEAJAVByQAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEG8iwJGGwsHACAAELQOCwkAIAAgARD3AwsTACAAIAEoAgA2AgAgAUEANgIACxkAIAAgASgCADYCACAAQQRqIAFBBGoQ+QMLCQAgACABEPYDCwcAIAAQ5wMLBwAgABDwAwsLACAAIAFBCBD+AwsdACAAKAIAEIIBIAAgASgCADYCACABQQA2AgAgAAtOAQF/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAxD/AyAAIAEoAgAgA0EIaiIAEIAEIAAQgQQgAxCCAiACQQ9xQcQEahEGABCjAiADJAkLKwEBfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELIAEgADYCACABEKECIAEkCQsEAEEACwUAEIIECwYAQZiDAwtKAQJ/IAAoAgQiAEUEQA8LIABBBGoiAigCACEBIAIgAUF/ajYCACABBEAPCyAAKAIAKAIIIQEgACABQf8DcUG4BmoRBQAgABCwDgsGAEHoswELBgBBqIwCCzIBAn9BCBCzDiIBIAAoAgA2AgAgASAAQQRqIgIoAgA2AgQgAEEANgIAIAJBADYCACABCwYAQYzOAQsHACAAEIkEC2kBA38jCSEBIwlBEGokCSMJIwpOBEBBEBABC0HAABCzDiICQQA2AgQgAkEANgIIIAJBmM4BNgIAIAJBEGoiAxDzCCAAIAM2AgAgACACNgIEIAEgAzYCACABIAM2AgQgACABEO0DIAEkCQsMACAAEKECIAAQtA4LeAEDfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSABEIICIQMgACgCACEBIAMgACgCBCIAQQF1aiEDIABBAXEEfyABIAMoAgBqKAIABSABCyEAIAUgAyACEMECIABBD3FBJmoRBwA5AwAgBRC0ASECIAQkCSACCwUAEI0ECwYAQazOAQsGAEHmjAILggEBA38jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGIQcgARCCAiEFIAAoAgAhASAFIAAoAgQiAEEBdWohBSAAQQFxBH8gASAFKAIAaigCAAUgAQshACAHIAUgAhDBAiADEMECIAQQwQIgAEEHcUE+ahEIADkDACAHELQBIQIgBiQJIAILBABBBQsFABCSBAsFAEGQCQsGAEHrjAILfQEDfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiABEIICIQQgACgCACEBIAQgACgCBCIAQQF1aiEEIABBAXEEfyABIAQoAgBqKAIABSABCyEAIAYgBCACEMECIAMQwQIgAEEHcUE2ahEJADkDACAGELQBIQIgBSQJIAILBQAQlgQLBQBBsAkLBgBB8owCC3UCA38BfCMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCABEIICIQIgACgCACEBIAIgACgCBCIAQQF1aiECIABBAXEEfyABIAIoAgBqKAIABSABCyEAIAQgAiAAQR9xQQZqEQoAOQMAIAQQtAEhBSADJAkgBQsFABCaBAsGAEG4zgELBgBB+IwCC0kBAX8gARCCAiEDIAAoAgAhASADIAAoAgQiA0EBdWohACADQQFxBEAgASAAKAIAaigCACEBCyAAIAIQwQIgAUEfcUG4CmoRCwALBQAQngQLBgBBwM4BCwcAIAAQowQLBQAQpAQLBQAQpQQLBQAQpgQLBgBBgLQBCwYAQYC0AQsGAEGItAELBgBBmLQBC2gBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIgEgAEH/A3FBuAZqEQUAQQAkBUGRASABEE4hAyMFIQBBACQFIABBAXEEQBBjIQAQABogARCDBCAAEGoFIAEQgwQgAiQJIAMPC0EACwUAELcEC+4BAQZ/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAkEMaiEGIAJBCGohAyACIQdBCBCzDiEEQQAkBUHEACACQQRqIgUgARBaIwUhAUEAJAUgAUEBcQRAEGMhARAAGiAEELQOIAEQagtBACQFQcoAIAMgBRBaIwUhAUEAJAUgAUEBcQRAEGMhABAAGgUgB0EANgIAQQAkBSAGIAcoAgA2AgBBDCAEIAAgAyAGEFwjBSEAQQAkBSAAQQFxBH8QYyEBEAAaIAMQ5wMgAQUgAxDnAyAFEJkCIAIkCSAEDwshAAsgBRCZAiAEELQOIAAQakEACxMAIABFBEAPCyAAEIMEIAAQtA4LBQAQtgQLlAMBBX8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADIQggA0EQaiEGIANBCGohByAAIAE2AgBBACQFQZABQRQQTiEEIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVBywAgByACEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFIARBADYCBCAEQQA2AgggBEHUzgE2AgAgBiABNgIAQQAkBUHMACAGQQRqIAcQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQc0AIARBDGogBhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaIAYQrQQFIAYQrQQgACAENgIEIAcQ5wMgCCABNgIAIAggATYCBCAAIAgQ7QMgAyQJDwsLIAQQoQIgBxDnAwsgBBC0DgsgABBhGkEAJAVBzgAgAiABEFojBSEAQQAkBSAAQQFxRQRAQQAkBUECEFhBACQFCxBjIQAQABpBACQFQQMQWCMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEGoLCwoAIABBBGoQtAQLGAAgAEHUzgE2AgAgAEEMahC1BCAAEKECCwwAIAAQrgQgABC0DgtBAQF/IAAoAgwhAUEAJAVBzgAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEGyjgJGGwsZACAAIAEoAgA2AgAgAEEEaiABQQRqELMECwkAIAAgARD2AwsHACAAEOcDCwcAIAAQrQQLBgBBuLQBCwYAQejOAQsHACAAELkEC5oBAQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQtByAAQsw4iAkEANgIEIAJBADYCCCACQfTOATYCACACQRBqIgFCADcDACABQgA3AwggAUIANwMQIAFCADcDGCABQgA3AyAgAUIANwMoIAFCADcDMCAAIAJBEGoiATYCACAAIAI2AgQgAyABNgIAIAMgATYCBCAAIAMQ7QMgAyQJC4ABAgN/AXwjCSEFIwlBEGokCSMJIwpOBEBBEBABCyAFIQYgARCCAiEEIAAoAgAhASAEIAAoAgQiAEEBdWohBCAAQQFxBH8gASAEKAIAaigCAAUgAQshACAGIAQgAhCCAiADEIICIABBB3FBjgFqEQwAOQMAIAYQtAEhByAFJAkgBwsFABC8BAsFAEHACQsGAEHsjwILTgEBfyABEIICIQQgACgCACEBIAQgACgCBCIEQQF1aiEAIARBAXEEQCABIAAoAgBqKAIAIQELIAAgAhCCAiADEMECIAFBD3FB4AxqEQ0ACwUAEMAECwUAQdAJC2sCA38BfCMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCAAKAIAIQIgASAAKAIEIgFBAXVqIQAgAUEBcQRAIAIgACgCAGooAgAhAgsgBCAAIAJBH3FBBmoRCgA5AwAgBBC0ASEFIAMkCSAFC0IBAX8gACgCACEDIAEgACgCBCIBQQF1aiEAIAFBAXEEQCADIAAoAgBqKAIAIQMLIAAgAhDBAiADQR9xQbgKahELAAsFABDSAgtAAQJ/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgACgCBCECIAEgACgCADYCACABIAI2AgQgARCHAiEAIAEkCSAAC0ABAn8jCSEBIwlBEGokCSMJIwpOBEBBEBABCyAAKAIEIQIgASAAKAIANgIAIAEgAjYCBCABEIcCIQAgASQJIAALQAECfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgQhAiABIAAoAgA2AgAgASACNgIEIAEQhwIhACABJAkgAAtAAQJ/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgACgCBCECIAEgACgCADYCACABIAI2AgQgARCHAiEAIAEkCSAACwcAIAAQzAQLBQAQzQQLBQAQzgQLBQAQzwQLBgBB0LQBCwYAQdC0AQsGAEHYtAELBgBB6LQBC2gBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIgEgAEH/A3FBuAZqEQUAQQAkBUGSASABEE4hAyMFIQBBACQFIABBAXEEQBBjIQAQABogARCDBCAAEGoFIAEQgwQgAiQJIAMPC0EACwUAEOAEC+4BAQZ/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAkEMaiEGIAJBCGohAyACIQdBCBCzDiEEQQAkBUHEACACQQRqIgUgARBaIwUhAUEAJAUgAUEBcQRAEGMhARAAGiAEELQOIAEQagtBACQFQc8AIAMgBRBaIwUhAUEAJAUgAUEBcQRAEGMhABAAGgUgB0EANgIAQQAkBSAGIAcoAgA2AgBBDSAEIAAgAyAGEFwjBSEAQQAkBSAAQQFxBH8QYyEBEAAaIAMQ5wMgAQUgAxDnAyAFEJkCIAIkCSAEDwshAAsgBRCZAiAEELQOIAAQakEACxMAIABFBEAPCyAAEIMEIAAQtA4LBQAQ3wQLlAMBBX8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADIQggA0EQaiEGIANBCGohByAAIAE2AgBBACQFQZABQRQQTiEEIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB0AAgByACEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFIARBADYCBCAEQQA2AgggBEGQzwE2AgAgBiABNgIAQQAkBUHRACAGQQRqIAcQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQdIAIARBDGogBhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaIAYQ1gQFIAYQ1gQgACAENgIEIAcQ5wMgCCABNgIAIAggATYCBCAAIAgQ7QMgAyQJDwsLIAQQoQIgBxDnAwsgBBC0DgsgABBhGkEAJAVB0wAgAiABEFojBSEAQQAkBSAAQQFxRQRAQQAkBUECEFhBACQFCxBjIQAQABpBACQFQQMQWCMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEGoLCwoAIABBBGoQ3QQLGAAgAEGQzwE2AgAgAEEMahDeBCAAEKECCwwAIAAQ1wQgABC0DgtBAQF/IAAoAgwhAUEAJAVB0wAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEGskQJGGwsZACAAIAEoAgA2AgAgAEEEaiABQQRqENwECwkAIAAgARD2AwsHACAAEOcDCwcAIAAQ1gQLBgBBiLUBCwYAQaTPAQsHACAAEOIEC2oBA38jCSEBIwlBEGokCSMJIwpOBEBBEBABC0H4iCsQsw4iAkEANgIEIAJBADYCCCACQbDPATYCACACQRBqIgMQgwkgACADNgIAIAAgAjYCBCABIAM2AgAgASADNgIEIAAgARDtAyABJAkLgwEBA38jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGIQcgARCCAiEFIAAoAgAhASAFIAAoAgQiAEEBdWohBSAAQQFxBH8gASAFKAIAaigCAAUgAQshACAHIAUgAhDBAiADEIICIAQQwQIgAEEBcUHSAGoRDgA5AwAgBxC0ASECIAYkCSACCwUAEOUECwUAQeAJCwYAQemSAguIAQEDfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAchCCABEIICIQYgACgCACEBIAYgACgCBCIAQQF1aiEGIABBAXEEfyABIAYoAgBqKAIABSABCyEAIAggBiACEMECIAMQggIgBBDBAiAFEIICIABBAXFB2ABqEQ8AOQMAIAgQtAEhAiAHJAkgAgsEAEEGCwUAEOoECwUAQYAKCwYAQfCSAgsHACAAEPAECwUAEPEECwUAEPIECwUAEPMECwYAQaC1AQsGAEGgtQELBgBBqLUBCwYAQbi1AQtoAQN/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiIBIABB/wNxQbgGahEFAEEAJAVBkwEgARBOIQMjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAEQgwQgABBqBSABEIMEIAIkCSADDwtBAAsFABCEBQvuAQEGfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAJBDGohBiACQQhqIQMgAiEHQQgQsw4hBEEAJAVBxAAgAkEEaiIFIAEQWiMFIQFBACQFIAFBAXEEQBBjIQEQABogBBC0DiABEGoLQQAkBUHUACADIAUQWiMFIQFBACQFIAFBAXEEQBBjIQAQABoFIAdBADYCAEEAJAUgBiAHKAIANgIAQQ4gBCAAIAMgBhBcIwUhAEEAJAUgAEEBcQR/EGMhARAAGiADEOcDIAEFIAMQ5wMgBRCZAiACJAkgBA8LIQALIAUQmQIgBBC0DiAAEGpBAAsTACAARQRADwsgABCDBCAAELQOCwUAEIMFC5QDAQV/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgAyEIIANBEGohBiADQQhqIQcgACABNgIAQQAkBUGQAUEUEE4hBCMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQdUAIAcgAhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBSAEQQA2AgQgBEEANgIIIARBzM8BNgIAIAYgATYCAEEAJAVB1gAgBkEEaiAHEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUHXACAEQQxqIAYQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGiAGEPoEBSAGEPoEIAAgBDYCBCAHEOcDIAggATYCACAIIAE2AgQgACAIEO0DIAMkCQ8LCyAEEKECIAcQ5wMLIAQQtA4LIAAQYRpBACQFQdgAIAIgARBaIwUhAEEAJAUgAEEBcUUEQEEAJAVBAhBYQQAkBQsQYyEAEAAaQQAkBUEDEFgjBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABBqCwsKACAAQQRqEIEFCxgAIABBzM8BNgIAIABBDGoQggUgABChAgsMACAAEPsEIAAQtA4LQQEBfyAAKAIMIQFBACQFQdgAIABBEGoiACABEFojBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABDnAwsLFAAgAEEQakEAIAEoAgRBppQCRhsLGQAgACABKAIANgIAIABBBGogAUEEahCABQsJACAAIAEQ9gMLBwAgABDnAwsHACAAEPoECwYAQdi1AQsGAEHgzwELBwAgABCGBQtpAQN/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQtBgAIQsw4iAkEANgIEIAJBADYCCCACQezPATYCACACQRBqIgMQhwUgACADNgIAIAAgAjYCBCABIAM2AgAgASADNgIEIAAgARDtAyABJAkLJgEBfyAAQcABaiIBQgA3AwAgAUIANwMIIAFCADcDECABQgA3AxgLggEBA38jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGIQcgARCCAiEFIAAoAgAhASAFIAAoAgQiAEEBdWohBSAAQQFxBH8gASAFKAIAaigCAAUgAQshACAHIAUgAhDBAiADEMECIAQQwQIgAEEHcUE+ahEIADkDACAHELQBIQIgBiQJIAILBQAQigULBQBBoAoLfQEDfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiABEIICIQQgACgCACEBIAQgACgCBCIAQQF1aiEEIABBAXEEfyABIAQoAgBqKAIABSABCyEAIAYgBCACEMECIAMQwQIgAEEHcUE2ahEJADkDACAGELQBIQIgBSQJIAILBQAQjQULBQBBwAoLQAECfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgQhAiABIAAoAgA2AgAgASACNgIEIAEQhwIhACABJAkgAAtAAQJ/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgACgCBCECIAEgACgCADYCACABIAI2AgQgARCHAiEAIAEkCSAACwcAIAAQlAULBQAQlQULBQAQlgULBQAQlwULBgBB8LUBCwYAQfC1AQsGAEH4tQELBgBBiLYBC2gBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIgEgAEH/A3FBuAZqEQUAQQAkBUGUASABEE4hAyMFIQBBACQFIABBAXEEQBBjIQAQABogARCDBCAAEGoFIAEQgwQgAiQJIAMPC0EACwUAEKgFC+4BAQZ/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAkEMaiEGIAJBCGohAyACIQdBCBCzDiEEQQAkBUHEACACQQRqIgUgARBaIwUhAUEAJAUgAUEBcQRAEGMhARAAGiAEELQOIAEQagtBACQFQdkAIAMgBRBaIwUhAUEAJAUgAUEBcQRAEGMhABAAGgUgB0EANgIAQQAkBSAGIAcoAgA2AgBBDyAEIAAgAyAGEFwjBSEAQQAkBSAAQQFxBH8QYyEBEAAaIAMQ5wMgAQUgAxDnAyAFEJkCIAIkCSAEDwshAAsgBRCZAiAEELQOIAAQakEACxMAIABFBEAPCyAAEIMEIAAQtA4LBQAQpwULlAMBBX8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADIQggA0EQaiEGIANBCGohByAAIAE2AgBBACQFQZABQRQQTiEEIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB2gAgByACEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFIARBADYCBCAEQQA2AgggBEGI0AE2AgAgBiABNgIAQQAkBUHbACAGQQRqIAcQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQdwAIARBDGogBhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaIAYQngUFIAYQngUgACAENgIEIAcQ5wMgCCABNgIAIAggATYCBCAAIAgQ7QMgAyQJDwsLIAQQoQIgBxDnAwsgBBC0DgsgABBhGkEAJAVB3QAgAiABEFojBSEAQQAkBSAAQQFxRQRAQQAkBUECEFhBACQFCxBjIQAQABpBACQFQQMQWCMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEGoLCwoAIABBBGoQpQULGAAgAEGI0AE2AgAgAEEMahCmBSAAEKECCwwAIAAQnwUgABC0DgtBAQF/IAAoAgwhAUEAJAVB3QAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEH4lgJGGwsZACAAIAEoAgA2AgAgAEEEaiABQQRqEKQFCwkAIAAgARD2AwsHACAAEOcDCwcAIAAQngULBgBBqLYBCwYAQZzQAQsHACAAEKoFC9UBAQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQtBiAEQsw4iAkEANgIEIAJBADYCCCACQajQATYCACACQRBqIgFCADcDACABQgA3AwggAUIANwMQIAFCADcDGCABQgA3AyAgAUIANwMoIAFCADcDMCABQgA3AzggAUFAa0IANwMAIAFCADcDSCABQgA3A1AgAUIANwNYIAFCADcDYCABQgA3A2ggAUIANwNwIAAgAkEQaiIBNgIAIAAgAjYCBCADIAE2AgAgAyABNgIEIAAgAxDtAyADJAkLUwEBfyABEIICIQUgACgCACEBIAUgACgCBCIFQQF1aiEAIAVBAXEEQCABIAAoAgBqKAIAIQELIAAgAhDBAiADEIICIAQQwQIgAUEBcUHaCmoREAALBQAQrQULBQBB0AoLBgBBoJgCC1gBAX8gARCCAiEGIAAoAgAhASAGIAAoAgQiBkEBdWohACAGQQFxBEAgASAAKAIAaigCACEBCyAAIAIQwQIgAxCCAiAEEMECIAUQwQIgAUEBcUHcCmoREQALBQAQsQULBQBB8AoLBgBBp5gCC10BAX8gARCCAiEHIAAoAgAhASAHIAAoAgQiB0EBdWohACAHQQFxBEAgASAAKAIAaigCACEBCyAAIAIQwQIgAxCCAiAEEMECIAUQwQIgBhDBAiABQQFxQd4KahESAAsEAEEHCwUAELYFCwUAQZALCwYAQa+YAgsHACAAELwFCwUAEL0FCwUAEL4FCwUAEL8FCwYAQcC2AQsGAEHAtgELBgBByLYBCwYAQdi2AQtoAQN/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiIBIABB/wNxQbgGahEFAEEAJAVBlQEgARBOIQMjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAEQgwQgABBqBSABEIMEIAIkCSADDwtBAAsFABDQBQvuAQEGfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAJBDGohBiACQQhqIQMgAiEHQQgQsw4hBEEAJAVBxAAgAkEEaiIFIAEQWiMFIQFBACQFIAFBAXEEQBBjIQEQABogBBC0DiABEGoLQQAkBUHeACADIAUQWiMFIQFBACQFIAFBAXEEQBBjIQAQABoFIAdBADYCAEEAJAUgBiAHKAIANgIAQRAgBCAAIAMgBhBcIwUhAEEAJAUgAEEBcQR/EGMhARAAGiADEOcDIAEFIAMQ5wMgBRCZAiACJAkgBA8LIQALIAUQmQIgBBC0DiAAEGpBAAsTACAARQRADwsgABCDBCAAELQOCwUAEM8FC5QDAQV/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgAyEIIANBEGohBiADQQhqIQcgACABNgIAQQAkBUGQAUEUEE4hBCMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQd8AIAcgAhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBSAEQQA2AgQgBEEANgIIIARBxNABNgIAIAYgATYCAEEAJAVB4AAgBkEEaiAHEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUHhACAEQQxqIAYQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGiAGEMYFBSAGEMYFIAAgBDYCBCAHEOcDIAggATYCACAIIAE2AgQgACAIEO0DIAMkCQ8LCyAEEKECIAcQ5wMLIAQQtA4LIAAQYRpBACQFQeIAIAIgARBaIwUhAEEAJAUgAEEBcUUEQEEAJAVBAhBYQQAkBQsQYyEAEAAaQQAkBUEDEFgjBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABBqCwsKACAAQQRqEM0FCxgAIABBxNABNgIAIABBDGoQzgUgABChAgsMACAAEMcFIAAQtA4LQQEBfyAAKAIMIQFBACQFQeIAIABBEGoiACABEFojBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABDnAwsLFAAgAEEQakEAIAEoAgRB8pkCRhsLGQAgACABKAIANgIAIABBBGogAUEEahDMBQsJACAAIAEQ9gMLBwAgABDnAwsHACAAEMYFCwYAQfi2AQsGAEHY0AELBwAgABDSBQuYAQEFfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhAkEoELMOIgFBADYCBCABQQA2AgggAUHk0AE2AgBBACQFQZ0CIAFBEGoiAxBZIwUhBUEAJAUgBUEBcQRAEGMhABAAGiABEKECIAEQtA4gABBqBSAAIAM2AgAgACABNgIEIAIgAzYCACACIAM2AgQgACACEO0DIAQkCQsLGQAgAEQAAAAAAADgP0QAAAAAAAAAABCxAQtOAQF/IAEQggIhBCAAKAIAIQEgBCAAKAIEIgRBAXVqIQAgBEEBcQRAIAEgACgCAGooAgAhAQsgACACEMECIAMQwQIgAUEBcUHYCmoREwALBQAQ1gULBQBBsAsLBgBBr5sCC0kBAX8gARCCAiEDIAAoAgAhASADIAAoAgQiA0EBdWohACADQQFxBEAgASAAKAIAaigCACEBCyAAIAIQwQIgAUEfcUG4CmoRCwALBQAQ2gULBgBB+NABC3UCA38BfCMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCABEIICIQIgACgCACEBIAIgACgCBCIAQQF1aiECIABBAXEEfyABIAIoAgBqKAIABSABCyEAIAQgAiAAQR9xQQZqEQoAOQMAIAQQtAEhBSADJAkgBQsFABDdBQsGAEGE0QELQAECfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgQhAiABIAAoAgA2AgAgASACNgIEIAEQhwIhACABJAkgAAtAAQJ/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgACgCBCECIAEgACgCADYCACABIAI2AgQgARCHAiEAIAEkCSAACwcAIAAQ5AULBQAQ5QULBQAQ5gULBQAQ5wULBgBBkLcBCwYAQZC3AQsGAEGYtwELBgBBqLcBC2gBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIgEgAEH/A3FBuAZqEQUAQQAkBUGWASABEE4hAyMFIQBBACQFIABBAXEEQBBjIQAQABogARCDBCAAEGoFIAEQgwQgAiQJIAMPC0EACwUAEPgFC+4BAQZ/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAkEMaiEGIAJBCGohAyACIQdBCBCzDiEEQQAkBUHEACACQQRqIgUgARBaIwUhAUEAJAUgAUEBcQRAEGMhARAAGiAEELQOIAEQagtBACQFQeMAIAMgBRBaIwUhAUEAJAUgAUEBcQRAEGMhABAAGgUgB0EANgIAQQAkBSAGIAcoAgA2AgBBESAEIAAgAyAGEFwjBSEAQQAkBSAAQQFxBH8QYyEBEAAaIAMQ5wMgAQUgAxDnAyAFEJkCIAIkCSAEDwshAAsgBRCZAiAEELQOIAAQakEACxMAIABFBEAPCyAAEIMEIAAQtA4LBQAQ9wULlAMBBX8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADIQggA0EQaiEGIANBCGohByAAIAE2AgBBACQFQZABQRQQTiEEIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB5AAgByACEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFIARBADYCBCAEQQA2AgggBEGU0QE2AgAgBiABNgIAQQAkBUHlACAGQQRqIAcQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQeYAIARBDGogBhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaIAYQ7gUFIAYQ7gUgACAENgIEIAcQ5wMgCCABNgIAIAggATYCBCAAIAgQ7QMgAyQJDwsLIAQQoQIgBxDnAwsgBBC0DgsgABBhGkEAJAVB5wAgAiABEFojBSEAQQAkBSAAQQFxRQRAQQAkBUECEFhBACQFCxBjIQAQABpBACQFQQMQWCMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEGoLCwoAIABBBGoQ9QULGAAgAEGU0QE2AgAgAEEMahD2BSAAEKECCwwAIAAQ7wUgABC0DgtBAQF/IAAoAgwhAUEAJAVB5wAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEHTnAJGGwsZACAAIAEoAgA2AgAgAEEEaiABQQRqEPQFCwkAIAAgARD2AwsHACAAEOcDCwcAIAAQ7gULBgBByLcBCwYAQajRAQsHACAAEPoFC2MBA38jCSEBIwlBEGokCSMJIwpOBEBBEBABC0EQELMOIgJBADYCBCACQQA2AgggAkG00QE2AgAgACACQQxqIgM2AgAgACACNgIEIAEgAzYCACABIAM2AgQgACABEO0DIAEkCQtYAQF/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgACgCACEAIAYgARDBAiACEMECIAMQwQIgBBDBAiAFEMECIABBA3FBAmoRFAA5AwAgBhC0ASEBIAYkCSABCwUAEP0FCwUAQcALCwYAQfudAgtLAQF/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgACgCACEAIAQgARDBAiACEMECIAMQwQIgAEEBcREVADkDACAEELQBIQEgBCQJIAELBQAQgQYLBQBB4AsLBgBBg54CCwcAIAAQhwYLBQAQiAYLBQAQiQYLBQAQigYLBgBB4LcBCwYAQeC3AQsGAEHotwELBgBB+LcBC2gBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIgEgAEH/A3FBuAZqEQUAQQAkBUGXASABEE4hAyMFIQBBACQFIABBAXEEQBBjIQAQABogARCDBCAAEGoFIAEQgwQgAiQJIAMPC0EACwUAEJsGC+4BAQZ/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAkEMaiEGIAJBCGohAyACIQdBCBCzDiEEQQAkBUHEACACQQRqIgUgARBaIwUhAUEAJAUgAUEBcQRAEGMhARAAGiAEELQOIAEQagtBACQFQegAIAMgBRBaIwUhAUEAJAUgAUEBcQRAEGMhABAAGgUgB0EANgIAQQAkBSAGIAcoAgA2AgBBEiAEIAAgAyAGEFwjBSEAQQAkBSAAQQFxBH8QYyEBEAAaIAMQ5wMgAQUgAxDnAyAFEJkCIAIkCSAEDwshAAsgBRCZAiAEELQOIAAQakEACxMAIABFBEAPCyAAEIMEIAAQtA4LBQAQmgYLlAMBBX8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADIQggA0EQaiEGIANBCGohByAAIAE2AgBBACQFQZABQRQQTiEEIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB6QAgByACEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFIARBADYCBCAEQQA2AgggBEHQ0QE2AgAgBiABNgIAQQAkBUHqACAGQQRqIAcQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQesAIARBDGogBhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaIAYQkQYFIAYQkQYgACAENgIEIAcQ5wMgCCABNgIAIAggATYCBCAAIAgQ7QMgAyQJDwsLIAQQoQIgBxDnAwsgBBC0DgsgABBhGkEAJAVB7AAgAiABEFojBSEAQQAkBSAAQQFxRQRAQQAkBUECEFhBACQFCxBjIQAQABpBACQFQQMQWCMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEGoLCwoAIABBBGoQmAYLGAAgAEHQ0QE2AgAgAEEMahCZBiAAEKECCwwAIAAQkgYgABC0DgtBAQF/IAAoAgwhAUEAJAVB7AAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEGnnwJGGwsZACAAIAEoAgA2AgAgAEEEaiABQQRqEJcGCwkAIAAgARD2AwsHACAAEOcDCwcAIAAQkQYLBgBBmLgBCwYAQeTRAQsHACAAEJ0GC7kBAQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQtB6AAQsw4iAkEANgIEIAJBADYCCCACQfDRATYCACACQRBqIgFCADcDACABQgA3AwggAUIANwMQIAFCADcDGCABQgA3AyAgAUIANwMoIAFCADcDMCABQgA3AzggAUFAa0IANwMAIAFCADcDSCABQgA3A1AgACACQRBqIgE2AgAgACACNgIEIAMgATYCACADIAE2AgQgACADEO0DIAMkCQuNAQEDfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAghCSABEIICIQcgACgCACEBIAcgACgCBCIAQQF1aiEHIABBAXEEfyABIAcoAgBqKAIABSABCyEAIAkgByACEMECIAMQwQIgBBCCAiAFEMECIAYQwQIgAEEBcUHOAGoRFgA5AwAgCRC0ASECIAgkCSACCwUAEKAGCwUAQfALCwYAQc+gAguNAQEDfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAghCSABEIICIQcgACgCACEBIAcgACgCBCIAQQF1aiEHIABBAXEEfyABIAcoAgBqKAIABSABCyEAIAkgByACEMECIAMQwQIgBBDBAiAFEMECIAYQwQIgAEEDcUHGAGoRFwA5AwAgCRC0ASECIAgkCSACCwUAEKQGCwUAQZAMCwYAQdigAgt4AQN/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCEFIAEQggIhAyAAKAIAIQEgAyAAKAIEIgBBAXVqIQMgAEEBcQR/IAEgAygCAGooAgAFIAELIQAgBSADIAIQwQIgAEEPcUEmahEHADkDACAFELQBIQIgBCQJIAILBQAQqAYLBgBBhNIBC0kBAX8gARCCAiEDIAAoAgAhASADIAAoAgQiA0EBdWohACADQQFxBEAgASAAKAIAaigCACEBCyAAIAIQwQIgAUEfcUG4CmoRCwALBQAQqwYLBgBBkNIBCwcAIAAQsAYLBQAQsQYLBQAQsgYLBQAQswYLBgBBsLgBCwYAQbC4AQsGAEG4uAELBgBByLgBC2gBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIgEgAEH/A3FBuAZqEQUAQQAkBUGYASABEE4hAyMFIQBBACQFIABBAXEEQBBjIQAQABogARCDBCAAEGoFIAEQgwQgAiQJIAMPC0EACwUAEMQGC+4BAQZ/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAkEMaiEGIAJBCGohAyACIQdBCBCzDiEEQQAkBUHEACACQQRqIgUgARBaIwUhAUEAJAUgAUEBcQRAEGMhARAAGiAEELQOIAEQagtBACQFQe0AIAMgBRBaIwUhAUEAJAUgAUEBcQRAEGMhABAAGgUgB0EANgIAQQAkBSAGIAcoAgA2AgBBEyAEIAAgAyAGEFwjBSEAQQAkBSAAQQFxBH8QYyEBEAAaIAMQ5wMgAQUgAxDnAyAFEJkCIAIkCSAEDwshAAsgBRCZAiAEELQOIAAQakEACxMAIABFBEAPCyAAEIMEIAAQtA4LBQAQwwYLlAMBBX8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADIQggA0EQaiEGIANBCGohByAAIAE2AgBBACQFQZABQRQQTiEEIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB7gAgByACEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFIARBADYCBCAEQQA2AgggBEGk0gE2AgAgBiABNgIAQQAkBUHvACAGQQRqIAcQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQfAAIARBDGogBhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaIAYQugYFIAYQugYgACAENgIEIAcQ5wMgCCABNgIAIAggATYCBCAAIAgQ7QMgAyQJDwsLIAQQoQIgBxDnAwsgBBC0DgsgABBhGkEAJAVB8QAgAiABEFojBSEAQQAkBSAAQQFxRQRAQQAkBUECEFhBACQFCxBjIQAQABpBACQFQQMQWCMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEGoLCwoAIABBBGoQwQYLGAAgAEGk0gE2AgAgAEEMahDCBiAAEKECCwwAIAAQuwYgABC0DgtBAQF/IAAoAgwhAUEAJAVB8QAgAEEQaiIAIAEQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAEOcDCwsUACAAQRBqQQAgASgCBEH/oQJGGwsZACAAIAEoAgA2AgAgAEEEaiABQQRqEMAGCwkAIAAgARD2AwsHACAAEOcDCwcAIAAQugYLBgBB6LgBCwYAQbjSAQsHACAAEMYGC74BAQN/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQtB6AAQsw4iAkEANgIEIAJBADYCCCACQcTSATYCACACQRBqIgFCADcDACABQgA3AwggAUIANwMQIAFCADcDGCABQgA3AyAgAUIANwMoIAFCADcDMCABQgA3AzggAUFAa0IANwMAIAFCADcDSCABQgA3A1AgARDHBiAAIAJBEGoiATYCACAAIAI2AgQgAyABNgIAIAMgATYCBCAAIAMQ7QMgAyQJCwkAIABBATYCPAuNAQEDfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAghCSABEIICIQcgACgCACEBIAcgACgCBCIAQQF1aiEHIABBAXEEfyABIAcoAgBqKAIABSABCyEAIAkgByACEMECIAMQwQIgBBDBAiAFEIICIAYQggIgAEEBcUHMAGoRGAA5AwAgCRC0ASECIAgkCSACCwUAEMoGCwUAQbAMCwYAQaejAguXAQEDfyMJIQojCUEQaiQJIwkjCk4EQEEQEAELIAohCyABEIICIQkgACgCACEBIAkgACgCBCIAQQF1aiEJIABBAXEEfyABIAkoAgBqKAIABSABCyEAIAsgCSACEMECIAMQwQIgBBDBAiAFEMECIAYQwQIgBxCCAiAIEIICIABBAXFBygBqERkAOQMAIAsQtAEhAiAKJAkgAgsEAEEJCwUAEM8GCwUAQdAMCwYAQbCjAgt+AQN/IwkhBSMJQRBqJAkjCSMKTgRAQRAQAQsgBSEGIAEQggIhBCAAKAIAIQEgBCAAKAIEIgBBAXVqIQQgAEEBcQR/IAEgBCgCAGooAgAFIAELIQAgBiAEIAIQwQIgAxCCAiAAQQFxQdAAahEaADkDACAGELQBIQIgBSQJIAILBQAQ0wYLBQBBgA0LBgBBu6MCC0kBAX8gARCCAiEDIAAoAgAhASADIAAoAgQiA0EBdWohACADQQFxBEAgASAAKAIAaigCACEBCyAAIAIQwQIgAUEfcUG4CmoRCwALBQAQ1wYLBgBB2NIBC0ABAn8jCSEBIwlBEGokCSMJIwpOBEBBEBABCyAAKAIEIQIgASAAKAIANgIAIAEgAjYCBCABEIcCIQAgASQJIAALQAECfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELIAAoAgQhAiABIAAoAgA2AgAgASACNgIEIAEQhwIhACABJAkgAAsHACAAEN4GCwUAEN8GCwUAEOAGCwUAEOEGCwYAQYC5AQsGAEGAuQELBgBBiLkBCwYAQZi5AQtoAQN/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiIBIABB/wNxQbgGahEFAEEAJAVBmQEgARBOIQMjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAEQgwQgABBqBSABEIMEIAIkCSADDwtBAAsFABDyBgvuAQEGfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAJBDGohBiACQQhqIQMgAiEHQQgQsw4hBEEAJAVBxAAgAkEEaiIFIAEQWiMFIQFBACQFIAFBAXEEQBBjIQEQABogBBC0DiABEGoLQQAkBUHyACADIAUQWiMFIQFBACQFIAFBAXEEQBBjIQAQABoFIAdBADYCAEEAJAUgBiAHKAIANgIAQRQgBCAAIAMgBhBcIwUhAEEAJAUgAEEBcQR/EGMhARAAGiADEOcDIAEFIAMQ5wMgBRCZAiACJAkgBA8LIQALIAUQmQIgBBC0DiAAEGpBAAsTACAARQRADwsgABCDBCAAELQOCwUAEPEGC5QDAQV/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgAyEIIANBEGohBiADQQhqIQcgACABNgIAQQAkBUGQAUEUEE4hBCMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQfMAIAcgAhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBSAEQQA2AgQgBEEANgIIIARB7NIBNgIAIAYgATYCAEEAJAVB9AAgBkEEaiAHEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUH1ACAEQQxqIAYQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGiAGEOgGBSAGEOgGIAAgBDYCBCAHEOcDIAggATYCACAIIAE2AgQgACAIEO0DIAMkCQ8LCyAEEKECIAcQ5wMLIAQQtA4LIAAQYRpBACQFQfYAIAIgARBaIwUhAEEAJAUgAEEBcUUEQEEAJAVBAhBYQQAkBQsQYyEAEAAaQQAkBUEDEFgjBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABBqCwsKACAAQQRqEO8GCxgAIABB7NIBNgIAIABBDGoQ8AYgABChAgsMACAAEOkGIAAQtA4LQQEBfyAAKAIMIQFBACQFQfYAIABBEGoiACABEFojBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABDnAwsLFAAgAEEQakEAIAEoAgRB36QCRhsLGQAgACABKAIANgIAIABBBGogAUEEahDuBgsJACAAIAEQ9gMLBwAgABDnAwsHACAAEOgGCwYAQbi5AQsGAEGA0wELBwAgABD0BgtjAQN/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQtBEBCzDiICQQA2AgQgAkEANgIIIAJBjNMBNgIAIAAgAkEMaiIDNgIAIAAgAjYCBCABIAM2AgAgASADNgIEIAAgARDtAyABJAkLewIDfwF8IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCEFIAEQggIhAyAAKAIAIQEgAyAAKAIEIgBBAXVqIQMgAEEBcQR/IAEgAygCAGooAgAFIAELIQAgBSADIAIQggIgAEEPcUHaAGoRGwA5AwAgBRC0ASEGIAQkCSAGCwUAEPcGCwYAQaDTAQsGAEGHpgILBwAgABD9BgsFABD+BgsFABD/BgsFABCABwsGAEHQuQELBgBB0LkBCwYAQdi5AQsGAEHouQELaAEDfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIiASAAQf8DcUG4BmoRBQBBACQFQZoBIAEQTiEDIwUhAEEAJAUgAEEBcQRAEGMhABAAGiABEIMEIAAQagUgARCDBCACJAkgAw8LQQALBQAQkQcL7gEBBn8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACQQxqIQYgAkEIaiEDIAIhB0EIELMOIQRBACQFQcQAIAJBBGoiBSABEFojBSEBQQAkBSABQQFxBEAQYyEBEAAaIAQQtA4gARBqC0EAJAVB9wAgAyAFEFojBSEBQQAkBSABQQFxBEAQYyEAEAAaBSAHQQA2AgBBACQFIAYgBygCADYCAEEVIAQgACADIAYQXCMFIQBBACQFIABBAXEEfxBjIQEQABogAxDnAyABBSADEOcDIAUQmQIgAiQJIAQPCyEACyAFEJkCIAQQtA4gABBqQQALEwAgAEUEQA8LIAAQgwQgABC0DgsFABCQBwuUAwEFfyMJIQMjCUEgaiQJIwkjCk4EQEEgEAELIAMhCCADQRBqIQYgA0EIaiEHIAAgATYCAEEAJAVBkAFBFBBOIQQjBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUH4ACAHIAIQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgUgBEEANgIEIARBADYCCCAEQbTTATYCACAGIAE2AgBBACQFQfkAIAZBBGogBxBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB+gAgBEEMaiAGEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABogBhCHBwUgBhCHByAAIAQ2AgQgBxDnAyAIIAE2AgAgCCABNgIEIAAgCBDtAyADJAkPCwsgBBChAiAHEOcDCyAEELQOCyAAEGEaQQAkBUH7ACACIAEQWiMFIQBBACQFIABBAXFFBEBBACQFQQIQWEEAJAULEGMhABAAGkEAJAVBAxBYIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQagsLCgAgAEEEahCOBwsYACAAQbTTATYCACAAQQxqEI8HIAAQoQILDAAgABCIByAAELQOC0EBAX8gACgCDCEBQQAkBUH7ACAAQRBqIgAgARBaIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQ5wMLCxQAIABBEGpBACABKAIEQcqnAkYbCxkAIAAgASgCADYCACAAQQRqIAFBBGoQjQcLCQAgACABEPYDCwcAIAAQ5wMLBwAgABCHBwsGAEGIugELBgBByNMBCwcAIAAQkwcLYwEDfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELQRAQsw4iAkEANgIEIAJBADYCCCACQdTTATYCACAAIAJBDGoiAzYCACAAIAI2AgQgASADNgIAIAEgAzYCBCAAIAEQ7QMgASQJC3gBA38jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAEIQUgARCCAiEDIAAoAgAhASADIAAoAgQiAEEBdWohAyAAQQFxBH8gASADKAIAaigCAAUgAQshACAFIAMgAhDBAiAAQQ9xQSZqEQcAOQMAIAUQtAEhAiAEJAkgAgsFABCWBwsGAEHo0wELfQEDfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiABEIICIQQgACgCACEBIAQgACgCBCIAQQF1aiEEIABBAXEEfyABIAQoAgBqKAIABSABCyEAIAYgBCACEMECIAMQwQIgAEEHcUE2ahEJADkDACAGELQBIQIgBSQJIAILBQAQmQcLBQBBkA0LBwAgABCeBwsFABCfBwsFABCgBwsFABChBwsGAEGgugELBgBBoLoBCwYAQai6AQsGAEG4ugELaAEDfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIiASAAQf8DcUG4BmoRBQBBACQFQZsBIAEQTiEDIwUhAEEAJAUgAEEBcQRAEGMhABAAGiABEIMEIAAQagUgARCDBCACJAkgAw8LQQALBQAQsgcL7gEBBn8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACQQxqIQYgAkEIaiEDIAIhB0EIELMOIQRBACQFQcQAIAJBBGoiBSABEFojBSEBQQAkBSABQQFxBEAQYyEBEAAaIAQQtA4gARBqC0EAJAVB/AAgAyAFEFojBSEBQQAkBSABQQFxBEAQYyEAEAAaBSAHQQA2AgBBACQFIAYgBygCADYCAEEWIAQgACADIAYQXCMFIQBBACQFIABBAXEEfxBjIQEQABogAxDnAyABBSADEOcDIAUQmQIgAiQJIAQPCyEACyAFEJkCIAQQtA4gABBqQQALEwAgAEUEQA8LIAAQgwQgABC0DgsFABCxBwuUAwEFfyMJIQMjCUEgaiQJIwkjCk4EQEEgEAELIAMhCCADQRBqIQYgA0EIaiEHIAAgATYCAEEAJAVBkAFBFBBOIQQjBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUH9ACAHIAIQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgUgBEEANgIEIARBADYCCCAEQfzTATYCACAGIAE2AgBBACQFQf4AIAZBBGogBxBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVB/wAgBEEMaiAGEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABogBhCoBwUgBhCoByAAIAQ2AgQgBxDnAyAIIAE2AgAgCCABNgIEIAAgCBDtAyADJAkPCwsgBBChAiAHEOcDCyAEELQOCyAAEGEaQQAkBUGAASACIAEQWiMFIQBBACQFIABBAXFFBEBBACQFQQIQWEEAJAULEGMhABAAGkEAJAVBAxBYIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQagsLCgAgAEEEahCvBwsYACAAQfzTATYCACAAQQxqELAHIAAQoQILDAAgABCpByAAELQOC0EBAX8gACgCDCEBQQAkBUGAASAAQRBqIgAgARBaIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQ5wMLCxQAIABBEGpBACABKAIEQbyqAkYbCxkAIAAgASgCADYCACAAQQRqIAFBBGoQrgcLCQAgACABEPYDCwcAIAAQ5wMLBwAgABCoBwsGAEHYugELBgBBkNQBCwcAIAAQtAcLqwEBBH8jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAEIQNBqIkrELMOIgFBADYCBCABQQA2AgggAUGc1AE2AgAgAUEQaiICQQBBmIkrEIcPGkEAJAVBngIgAhBZIwUhAkEAJAUgAkEBcQRAEGMhABAAGiABEKECIAEQtA4gABBqBSAAIAFBEGoiAjYCACAAIAE2AgQgAyACNgIAIAMgAjYCBCAAIAMQ7QMgBCQJCwsRACAAEIMJIABB6IgrahDzCAuNAQEDfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAghCSABEIICIQcgACgCACEBIAcgACgCBCIAQQF1aiEHIABBAXEEfyABIAcoAgBqKAIABSABCyEAIAkgByACEMECIAMQggIgBBDBAiAFEMECIAYQwQIgAEEDcUHUAGoRHAA5AwAgCRC0ASECIAgkCSACCwUAELgHCwUAQaANCwYAQfOrAgsHACAAEL4HCwUAEL8HCwUAEMAHCwUAEMEHCwYAQfC6AQsGAEHwugELBgBB+LoBCwYAQYi7AQtoAQN/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiIBIABB/wNxQbgGahEFAEEAJAVBnAEgARBOIQMjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAEQgwQgABBqBSABEIMEIAIkCSADDwtBAAsFABDSBwvuAQEGfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAJBDGohBiACQQhqIQMgAiEHQQgQsw4hBEEAJAVBxAAgAkEEaiIFIAEQWiMFIQFBACQFIAFBAXEEQBBjIQEQABogBBC0DiABEGoLQQAkBUGBASADIAUQWiMFIQFBACQFIAFBAXEEQBBjIQAQABoFIAdBADYCAEEAJAUgBiAHKAIANgIAQRcgBCAAIAMgBhBcIwUhAEEAJAUgAEEBcQR/EGMhARAAGiADEOcDIAEFIAMQ5wMgBRCZAiACJAkgBA8LIQALIAUQmQIgBBC0DiAAEGpBAAsTACAARQRADwsgABCDBCAAELQOCwUAENEHC5QDAQV/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgAyEIIANBEGohBiADQQhqIQcgACABNgIAQQAkBUGQAUEUEE4hBCMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQYIBIAcgAhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBSAEQQA2AgQgBEEANgIIIARBuNQBNgIAIAYgATYCAEEAJAVBgwEgBkEEaiAHEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUGEASAEQQxqIAYQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGiAGEMgHBSAGEMgHIAAgBDYCBCAHEOcDIAggATYCACAIIAE2AgQgACAIEO0DIAMkCQ8LCyAEEKECIAcQ5wMLIAQQtA4LIAAQYRpBACQFQYUBIAIgARBaIwUhAEEAJAUgAEEBcUUEQEEAJAVBAhBYQQAkBQsQYyEAEAAaQQAkBUEDEFgjBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABBqCwsKACAAQQRqEM8HCxgAIABBuNQBNgIAIABBDGoQ0AcgABChAgsMACAAEMkHIAAQtA4LQQEBfyAAKAIMIQFBACQFQYUBIABBEGoiACABEFojBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABDnAwsLFAAgAEEQakEAIAEoAgRBqq0CRhsLGQAgACABKAIANgIAIABBBGogAUEEahDOBwsJACAAIAEQ9gMLBwAgABDnAwsHACAAEMgHCwYAQai7AQsGAEHM1AELBwAgABDUBwutAQEEfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhA0GAlNYAELMOIgFBADYCBCABQQA2AgggAUHY1AE2AgAgAUEQaiICQQBB8JPWABCHDxpBACQFQZ8CIAIQWSMFIQJBACQFIAJBAXEEQBBjIQAQABogARChAiABELQOIAAQagUgACABQRBqIgI2AgAgACABNgIEIAMgAjYCACADIAI2AgQgACADEO0DIAQkCQsLJwAgABCDCSAAQeiIK2oQgwkgAEHQkdYAahDzCCAAQYCS1gBqEIcFC40BAQN/IwkhCCMJQRBqJAkjCSMKTgRAQRAQAQsgCCEJIAEQggIhByAAKAIAIQEgByAAKAIEIgBBAXVqIQcgAEEBcQR/IAEgBygCAGooAgAFIAELIQAgCSAHIAIQwQIgAxCCAiAEEMECIAUQwQIgBhDBAiAAQQNxQdQAahEcADkDACAJELQBIQIgCCQJIAILBQAQ2AcLBQBBwA0LBwAgABDdBwsFABDeBwsFABDfBwsFABDgBwsGAEHAuwELBgBBwLsBCwYAQci7AQsGAEHYuwELaAEDfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIiASAAQf8DcUG4BmoRBQBBACQFQZ0BIAEQTiEDIwUhAEEAJAUgAEEBcQRAEGMhABAAGiABEIMEIAAQagUgARCDBCACJAkgAw8LQQALBQAQ8QcL7gEBBn8jCSECIwlBEGokCSMJIwpOBEBBEBABCyACQQxqIQYgAkEIaiEDIAIhB0EIELMOIQRBACQFQcQAIAJBBGoiBSABEFojBSEBQQAkBSABQQFxBEAQYyEBEAAaIAQQtA4gARBqC0EAJAVBhgEgAyAFEFojBSEBQQAkBSABQQFxBEAQYyEAEAAaBSAHQQA2AgBBACQFIAYgBygCADYCAEEYIAQgACADIAYQXCMFIQBBACQFIABBAXEEfxBjIQEQABogAxDnAyABBSADEOcDIAUQmQIgAiQJIAQPCyEACyAFEJkCIAQQtA4gABBqQQALEwAgAEUEQA8LIAAQgwQgABC0DgsFABDwBwuUAwEFfyMJIQMjCUEgaiQJIwkjCk4EQEEgEAELIAMhCCADQRBqIQYgA0EIaiEHIAAgATYCAEEAJAVBkAFBFBBOIQQjBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUGHASAHIAIQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgUgBEEANgIEIARBADYCCCAEQfTUATYCACAGIAE2AgBBACQFQYgBIAZBBGogBxBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBUEAJAVBiQEgBEEMaiAGEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABogBhDnBwUgBhDnByAAIAQ2AgQgBxDnAyAIIAE2AgAgCCABNgIEIAAgCBDtAyADJAkPCwsgBBChAiAHEOcDCyAEELQOCyAAEGEaQQAkBUGKASACIAEQWiMFIQBBACQFIABBAXFFBEBBACQFQQIQWEEAJAULEGMhABAAGkEAJAVBAxBYIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQagsLCgAgAEEEahDuBwsYACAAQfTUATYCACAAQQxqEO8HIAAQoQILDAAgABDoByAAELQOC0EBAX8gACgCDCEBQQAkBUGKASAAQRBqIgAgARBaIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQ4QEFIAAQ5wMLCxQAIABBEGpBACABKAIEQZiwAkYbCxkAIAAgASgCADYCACAAQQRqIAFBBGoQ7QcLCQAgACABEPYDCwcAIAAQ5wMLBwAgABDnBwsGAEH4uwELBgBBiNUBCwcAIAAQ8wcLaAEDfyMJIQEjCUEQaiQJIwkjCk4EQEEQEAELQSAQsw4iAkEANgIEIAJBADYCCCACQZTVATYCACACQRBqIgMQ9AcgACADNgIAIAAgAjYCBCABIAM2AgAgASADNgIEIAAgARDtAyABJAkLEAAgAEIANwMAIABCADcDCAt9AQN/IwkhBSMJQRBqJAkjCSMKTgRAQRAQAQsgBSEGIAEQggIhBCAAKAIAIQEgBCAAKAIEIgBBAXVqIQQgAEEBcQR/IAEgBCgCAGooAgAFIAELIQAgBiAEIAIQwQIgAxDBAiAAQQdxQTZqEQkAOQMAIAYQtAEhAiAFJAkgAgsFABD3BwsFAEHgDQsHACAAEPwHCwUAEP0HCwUAEP4HCwUAEP8HCwYAQZC8AQsGAEGQvAELBgBBmLwBCwYAQai8AQtoAQN/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiIBIABB/wNxQbgGahEFAEEAJAVBngEgARBOIQMjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAEQgwQgABBqBSABEIMEIAIkCSADDwtBAAsFABCQCAvuAQEGfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAJBDGohBiACQQhqIQMgAiEHQQgQsw4hBEEAJAVBxAAgAkEEaiIFIAEQWiMFIQFBACQFIAFBAXEEQBBjIQEQABogBBC0DiABEGoLQQAkBUGLASADIAUQWiMFIQFBACQFIAFBAXEEQBBjIQAQABoFIAdBADYCAEEAJAUgBiAHKAIANgIAQRkgBCAAIAMgBhBcIwUhAEEAJAUgAEEBcQR/EGMhARAAGiADEOcDIAEFIAMQ5wMgBRCZAiACJAkgBA8LIQALIAUQmQIgBBC0DiAAEGpBAAsTACAARQRADwsgABCDBCAAELQOCwUAEI8IC5QDAQV/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgAyEIIANBEGohBiADQQhqIQcgACABNgIAQQAkBUGQAUEUEE4hBCMFIQVBACQFIAVBAXEEQEEAEGQhABAAGgVBACQFQYwBIAcgAhBaIwUhBUEAJAUgBUEBcQRAQQAQZCEAEAAaBSAEQQA2AgQgBEEANgIIIARBsNUBNgIAIAYgATYCAEEAJAVBjQEgBkEEaiAHEFojBSEFQQAkBSAFQQFxBEBBABBkIQAQABoFQQAkBUGOASAEQQxqIAYQWiMFIQVBACQFIAVBAXEEQEEAEGQhABAAGiAGEIYIBSAGEIYIIAAgBDYCBCAHEOcDIAggATYCACAIIAE2AgQgACAIEO0DIAMkCQ8LCyAEEKECIAcQ5wMLIAQQtA4LIAAQYRpBACQFQY8BIAIgARBaIwUhAEEAJAUgAEEBcUUEQEEAJAVBAhBYQQAkBQsQYyEAEAAaQQAkBUEDEFgjBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABBqCwsKACAAQQRqEI0ICxgAIABBsNUBNgIAIABBDGoQjgggABChAgsMACAAEIcIIAAQtA4LQQEBfyAAKAIMIQFBACQFQY8BIABBEGoiACABEFojBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDhAQUgABDnAwsLFAAgAEEQakEAIAEoAgRB87ICRhsLGQAgACABKAIANgIAIABBBGogAUEEahCMCAsJACAAIAEQ9gMLBwAgABDnAwsHACAAEIYICwYAQci8AQsGAEHE1QELBwAgABCSCAtpAQN/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQtB+AAQsw4iAkEANgIEIAJBADYCCCACQdDVATYCACACQRBqIgMQkwggACADNgIAIAAgAjYCBCABIAM2AgAgASADNgIEIAAgARDtAyABJAkLLgAgAEIANwMAIABCADcDCCAAQgA3AxAgAEQAAAAAAECPQEQAAAAAAADwPxDjAQtMAQF/IAEQggIhAyAAKAIAIQEgAyAAKAIEIgNBAXVqIQAgA0EBcQRAIAEgACgCAGooAgAhAQsgACACEMECIAFBA3FBugNqER0AEJYICwUAEJcIC5QBAQF/QegAELMOIgEgACkDADcDACABIAApAwg3AwggASAAKQMQNwMQIAEgACkDGDcDGCABIAApAyA3AyAgASAAKQMoNwMoIAEgACkDMDcDMCABIAApAzg3AzggAUFAayAAQUBrKQMANwMAIAEgACkDSDcDSCABIAApA1A3A1AgASAAKQNYNwNYIAEgACkDYDcDYCABCwYAQeTVAQsGAEGbtAILjQEBA38jCSEIIwlBEGokCSMJIwpOBEBBEBABCyAIIQkgARCCAiEHIAAoAgAhASAHIAAoAgQiAEEBdWohByAAQQFxBH8gASAHKAIAaigCAAUgAQshACAJIAcg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ACABEKECDAELIABB/wFxIQMgAEH/AXEiBCABLABLRwRAIAFBFGoiBSgCACICIAEoAhBJBEAgBSACQQFqNgIAIAIgAzoAACAEIQAMAgsLIAEgABCPCiEACyAAC4wDAQh/IwkhCSMJQZAIaiQJIwkjCk4EQEGQCBABCyAJQYAIaiIHIAEoAgAiBTYCACADQYACIABBAEciCxshBiAAIAkiCCALGyEDIAZBAEcgBUEAR3EEQAJAQQAhAANAAkAgAkECdiIKIAZPIgwgAkGDAUtyRQ0CIAIgBiAKIAwbIgVrIQIgAyAHIAUgBBDXCiIFQX9GDQAgBkEAIAUgAyAIRiIKG2shBiADIAVBAnQgA2ogChshAyAAIAVqIQAgBygCACIFQQBHIAZBAEdxDQEMAgsLQX8hAEEAIQYgBygCACEFCwVBACEACyAFBEAgBkEARyACQQBHcQRAAkADQCADIAUgAiAEEKIKIghBAmpBA08EQCAHIAggBygCAGoiBTYCACADQQRqIQMgAEEBaiEAIAZBf2oiBkEARyACIAhrIgJBAEdxDQEMAgsLAkACQAJAIAhBf2sOAgABAgsgCCEADAILIAdBADYCAAwBCyAEQQA2AgALCwsgCwRAIAEgBygCADYCAAsgCSQJIAALDAAgACABQQAQ5wq2C/kBAgR/AXwjCSEEIwlBgAFqJAkjCSMKTgRAQYABEAELIAQiA0IANwIAIANCADcCCCADQgA3AhAgA0IANwIYIANCADcCICADQgA3AiggA0IANwIwIANCADcCOCADQUBrQgA3AgAgA0IANwJIIANCADcCUCADQgA3AlggA0IANwJgIANCADcCaCADQgA3AnAgA0EANgJ4IANBBGoiBSAANgIAIANBCGoiBkF/NgIAIAMgADYCLCADQX82AkwgA0EAEJ4KIAMgAkEBEKUKIQcgAygCbCAFKAIAIAYoAgBraiECIAEEQCABIAAgAmogACACGzYCAAsgBCQJIAcLCwAgACABQQEQ5woLCwAgACABQQIQ5woLCQAgACABEOYKCwkAIAAgARDoCgsJACAAIAEQ6QoLMAECfyACBEAgACEDA0AgA0EEaiEEIAMgATYCACACQX9qIgIEQCAEIQMMAQsLCyAAC28BA38gACABa0ECdSACSQRAA0AgAkF/aiICQQJ0IABqIAJBAnQgAWooAgA2AgAgAg0ACwUgAgRAIAAhAwNAIAFBBGohBCADQQRqIQUgAyABKAIANgIAIAJBf2oiAgRAIAQhASAFIQMMAQsLCwsgAAsUAEEAIAAgASACQZiEAyACGxCiCgvsAgEGfyMJIQgjCUGQAmokCSMJIwpOBEBBkAIQAQsgCEGAAmoiBiABKAIAIgU2AgAgA0GAAiAAQQBHIgobIQQgACAIIgcgChshAyAEQQBHIAVBAEdxBEACQEEAIQADQAJAIAIgBE8iCSACQSBLckUNAiACIAQgAiAJGyIFayECIAMgBiAFQQAQ4woiBUF/Rg0AIARBACAFIAMgB0YiCRtrIQQgAyADIAVqIAkbIQMgACAFaiEAIAYoAgAiBUEARyAEQQBHcQ0BDAILC0F/IQBBACEEIAYoAgAhBQsFQQAhAAsgBQRAIARBAEcgAkEAR3EEQAJAA0AgAyAFKAIAQQAQwgoiB0EBakECTwRAIAYgBigCAEEEaiIFNgIAIAMgB2ohAyAAIAdqIQAgBCAHayIEQQBHIAJBf2oiAkEAR3ENAQwCCwsgBwRAQX8hAAUgBkEANgIACwsLCyAKBEAgASAGKAIANgIACyAIJAkgAAvWAQEDfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIhASAAvUIgiKdB/////wdxIgNB/MOk/wNJBHwgA0GewZryA0kEfEQAAAAAAADwPwUgAEQAAAAAAAAAABDdCgsFAnwgACAAoSADQf//v/8HSw0AGgJAAkACQAJAIAAgARDeCkEDcQ4DAAECAwsgASsDACABKwMIEN0KDAMLIAErAwAgASsDCEEBENwKmgwCCyABKwMAIAErAwgQ3QqaDAELIAErAwAgASsDCEEBENwKCwshACACJAkgAAvQAQEDfyMJIQIjCUEQaiQJIwkjCk4EQEEQEAELIAIhASAAvUIgiKdB/////wdxIgNB/MOk/wNJBEAgA0GAgMDyA08EQCAARAAAAAAAAAAAQQAQ3AohAAsFAnwgACAAoSADQf//v/8HSw0AGgJAAkACQAJAIAAgARDeCkEDcQ4DAAECAwsgASsDACABKwMIQQEQ3AoMAwsgASsDACABKwMIEN0KDAILIAErAwAgASsDCEEBENwKmgwBCyABKwMAIAErAwgQ3QqaCyEACyACJAkgAAuNAQEDfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhAiAAvUIgiKdB/////wdxIgFB/MOk/wNJBEAgAUGAgIDyA08EQCAARAAAAAAAAAAAQQAQ4AohAAsFIAFB//+//wdLBHwgACAAoQUgACACEN4KIQEgAisDACACKwMIIAFBAXEQ4AoLIQALIAMkCSAAC4oEAwJ/AX4CfCAAvSIDQj+IpyECIANCIIinQf////8HcSIBQf//v6AESwRAIABEGC1EVPsh+b9EGC1EVPsh+T8gAhsgA0L///////////8Ag0KAgICAgICA+P8AVhsPCyABQYCA8P4DSQRAIAFBgICA8gNJBH8gAA8FQX8LIQEFIACZIQAgAUGAgMz/A0kEfCABQYCAmP8DSQR8QQAhASAARAAAAAAAAABAokQAAAAAAADwv6AgAEQAAAAAAAAAQKCjBUEBIQEgAEQAAAAAAADwv6AgAEQAAAAAAADwP6CjCwUgAUGAgI6ABEkEfEECIQEgAEQAAAAAAAD4v6AgAEQAAAAAAAD4P6JEAAAAAAAA8D+gowVBAyEBRAAAAAAAAPC/IACjCwshAAsgACAAoiIFIAWiIQQgBSAEIAQgBCAEIAREEdoi4zqtkD+iROsNdiRLe6k/oKJEUT3QoGYNsT+gokRuIEzFzUW3P6CiRP+DAJIkScI/oKJEDVVVVVVV1T+goiEFIAQgBCAEIAREmv3eUi3erb8gBEQvbGosRLSiP6KhokRtmnSv8rCzv6CiRHEWI/7Gcby/oKJExOuYmZmZyb+goiEEIAFBAEgEfCAAIAAgBCAFoKKhBSABQQN0QaCtAWorAwAgACAEIAWgoiABQQN0QcCtAWorAwChIAChoSIAIACaIAJFGwsLnwMDAn8BfgV8IAC9IgNCIIinIgFBgIDAAEkgA0IAUyICcgRAAkAgA0L///////////8Ag0IAUQRARAAAAAAAAPC/IAAgAKKjDwsgAkUEQEHLdyECIABEAAAAAAAAUEOivSIDQiCIpyEBIANC/////w+DIQMMAQsgACAAoUQAAAAAAAAAAKMPCwUgAUH//7//B0sEQCAADwsgAUGAgMD/A0YgA0L/////D4MiA0IAUXEEf0QAAAAAAAAAAA8FQYF4CyECCyADIAFB4r4laiIBQf//P3FBnsGa/wNqrUIghoS/RAAAAAAAAPC/oCIEIAREAAAAAAAA4D+ioiEFIAQgBEQAAAAAAAAAQKCjIgYgBqIiByAHoiEAIAIgAUEUdmq3IghEAADg/kIu5j+iIAQgCER2PHk17znqPaIgBiAFIAAgACAARJ/GeNAJmsM/okSveI4dxXHMP6CiRAT6l5mZmdk/oKIgByAAIAAgAEREUj7fEvHCP6JE3gPLlmRGxz+gokRZkyKUJEnSP6CiRJNVVVVVVeU/oKKgoKKgIAWhoKALwhADC38Bfgh8IAC9Ig1CIIinIQcgDachCCAHQf////8HcSEDIAG9Ig1CIIinIgVB/////wdxIgQgDaciBnJFBEBEAAAAAAAA8D8PCyAIRSIKIAdBgIDA/wNGcQRARAAAAAAAAPA/DwsgA0GAgMD/B00EQCADQYCAwP8HRiAIQQBHcSAEQYCAwP8HS3JFBEAgBEGAgMD/B0YiCyAGQQBHcUUEQAJAAkACQCAHQQBIIgkEfyAEQf///5kESwR/QQIhAgwCBSAEQf//v/8DSwR/IARBFHYhAiAEQf///4kESwRAQQIgBkGzCCACayICdiIMQQFxa0EAIAwgAnQgBkYbIQIMBAsgBgR/QQAFQQIgBEGTCCACayICdiIGQQFxa0EAIAQgBiACdEYbIQIMBQsFQQAhAgwDCwsFQQAhAgwBCyECDAILIAZFDQAMAQsgCwRAIANBgIDAgHxqIAhyRQRARAAAAAAAAPA/DwsgBUF/SiECIANB//+//wNLBEAgAUQAAAAAAAAAACACGw8FRAAAAAAAAAAAIAGaIAIbDwsACyAEQYCAwP8DRgRAIABEAAAAAAAA8D8gAKMgBUF/ShsPCyAFQYCAgIAERgRAIAAgAKIPCyAFQYCAgP8DRiAHQX9KcQRAIACfDwsLIACZIQ4gCgRAIANFIANBgICAgARyQYCAwP8HRnIEQEQAAAAAAADwPyAOoyAOIAVBAEgbIQAgCUUEQCAADwsgAiADQYCAwIB8anIEQCAAmiAAIAJBAUYbDwsgACAAoSIAIACjDwsLIAkEQAJAAkACQAJAIAIOAgIAAQtEAAAAAAAA8L8hEAwCC0QAAAAAAADwPyEQDAELIAAgAKEiACAAow8LBUQAAAAAAADwPyEQCyAEQYCAgI8ESwRAAkAgBEGAgMCfBEsEQCADQYCAwP8DSQRAIwhEAAAAAAAAAAAgBUEASBsPBSMIRAAAAAAAAAAAIAVBAEobDwsACyADQf//v/8DSQRAIBBEnHUAiDzkN36iRJx1AIg85Dd+oiAQRFnz+MIfbqUBokRZ8/jCH26lAaIgBUEASBsPCyADQYCAwP8DTQRAIA5EAAAAAAAA8L+gIgBEAAAAYEcV9z+iIg8gAERE3134C65UPqIgACAAokQAAAAAAADgPyAARFVVVVVVVdU/IABEAAAAAAAA0D+ioaKhokT+gitlRxX3P6KhIgCgvUKAgICAcIO/IhEhDiARIA+hIQ8MAQsgEEScdQCIPOQ3fqJEnHUAiDzkN36iIBBEWfP4wh9upQGiRFnz+MIfbqUBoiAFQQBKGw8LBSAORAAAAAAAAEBDoiIAvUIgiKcgAyADQYCAwABJIgIbIQQgACAOIAIbIQAgBEEUdUHMd0GBeCACG2ohAyAEQf//P3EiBEGAgMD/A3IhAiAEQY+xDkkEQEEAIQQFIARB+uwuSSIFIQQgAyAFQQFzQQFxaiEDIAIgAkGAgEBqIAUbIQILIARBA3RBgK4BaisDACITIAC9Qv////8PgyACrUIghoS/Ig8gBEEDdEHgrQFqKwMAIhGhIhJEAAAAAAAA8D8gESAPoKMiFKIiDr1CgICAgHCDvyIAIAAgAKIiFUQAAAAAAAAIQKAgDiAAoCAUIBIgAkEBdUGAgICAAnJBgIAgaiAEQRJ0aq1CIIa/IhIgAKKhIA8gEiARoaEgAKKhoiIPoiAOIA6iIgAgAKIgACAAIAAgACAARO9ORUoofso/okRl28mTSobNP6CiRAFBHalgdNE/oKJETSaPUVVV1T+gokT/q2/btm3bP6CiRAMzMzMzM+M/oKKgIhGgvUKAgICAcIO/IgCiIhIgDyAAoiAOIBEgAEQAAAAAAAAIwKAgFaGhoqAiDqC9QoCAgIBwg78iAEQAAADgCcfuP6IiDyAEQQN0QfCtAWorAwAgDiAAIBKhoUT9AzrcCcfuP6IgAET1AVsU4C8+PqKhoCIAoKAgA7ciEaC9QoCAgIBwg78iEiEOIBIgEaEgE6EgD6EhDwsgACAPoSABoiABIA1CgICAgHCDvyIAoSAOoqAhASAOIACiIgAgAaAiDr0iDUIgiKchAiANpyEDIAJB//+/hARKBEAgAyACQYCAwPt7anIEQCAQRJx1AIg85Dd+okScdQCIPOQ3fqIPCyABRP6CK2VHFZc8oCAOIAChZARAIBBEnHUAiDzkN36iRJx1AIg85Dd+og8LBSACQYD4//8HcUH/l8OEBEsEQCADIAJBgOi8+wNqcgRAIBBEWfP4wh9upQGiRFnz+MIfbqUBog8LIAEgDiAAoWUEQCAQRFnz+MIfbqUBokRZ8/jCH26lAaIPCwsLIAJB/////wdxIgNBgICA/wNLBH8gAkGAgMAAIANBFHZBgnhqdmoiA0EUdkH/D3EhBCAAIANBgIBAIARBgXhqdXGtQiCGv6EiDiEAIAEgDqC9IQ1BACADQf//P3FBgIDAAHJBkwggBGt2IgNrIAMgAkEASBsFQQALIQIgEEQAAAAAAADwPyANQoCAgIBwg78iDkQAAAAAQy7mP6IiDyABIA4gAKGhRO85+v5CLuY/oiAORDlsqAxhXCA+oqEiDqAiACAAIAAgAKIiASABIAEgASABRNCkvnJpN2Y+okTxa9LFQb27vqCiRCzeJa9qVhE/oKJEk72+FmzBZr+gokQ+VVVVVVXFP6CioSIBoiABRAAAAAAAAADAoKMgDiAAIA+hoSIBIAAgAaKgoSAAoaEiAL0iDUIgiKcgAkEUdGoiA0GAgMAASAR8IAAgAhCpCgUgDUL/////D4MgA61CIIaEvwuiDwsLCyAAIAGgC5o3AQx/IwkhCiMJQRBqJAkjCSMKTgRAQRAQAQsgCiEJIABB9QFJBH9BnIQDKAIAIgVBECAAQQtqQXhxIABBC0kbIgJBA3YiAHYiAUEDcQRAIAFBAXFBAXMgAGoiAUEDdEHEhANqIgJBCGoiBCgCACIDQQhqIgYoAgAhACAAIAJGBEBBnIQDQQEgAXRBf3MgBXE2AgAFIAAgAjYCDCAEIAA2AgALIAMgAUEDdCIAQQNyNgIEIAAgA2pBBGoiACAAKAIAQQFyNgIAIAokCSAGDwsgAkGkhAMoAgAiB0sEfyABBEAgASAAdEECIAB0IgBBACAAa3JxIgBBACAAa3FBf2oiAEEMdkEQcSIBIAAgAXYiAEEFdkEIcSIBciAAIAF2IgBBAnZBBHEiAXIgACABdiIAQQF2QQJxIgFyIAAgAXYiAEEBdkEBcSIBciAAIAF2aiIDQQN0QcSEA2oiBEEIaiIGKAIAIgFBCGoiCCgCACEAIAAgBEYEQEGchANBASADdEF/cyAFcSIANgIABSAAIAQ2AgwgBiAANgIAIAUhAAsgASACQQNyNgIEIAEgAmoiBCADQQN0IgMgAmsiBUEBcjYCBCABIANqIAU2AgAgBwRAQbCEAygCACEDIAdBA3YiAkEDdEHEhANqIQFBASACdCICIABxBH8gAUEIaiICKAIABUGchAMgACACcjYCACABQQhqIQIgAQshACACIAM2AgAgACADNgIMIAMgADYCCCADIAE2AgwLQaSEAyAFNgIAQbCEAyAENgIAIAokCSAIDwtBoIQDKAIAIgsEf0EAIAtrIAtxQX9qIgBBDHZBEHEiASAAIAF2IgBBBXZBCHEiAXIgACABdiIAQQJ2QQRxIgFyIAAgAXYiAEEBdkECcSIBciAAIAF2IgBBAXZBAXEiAXIgACABdmpBAnRBzIYDaigCACIDIQEgAygCBEF4cSACayEIA0ACQCABKAIQIgBFBEAgASgCFCIARQ0BCyAAIgEgAyABKAIEQXhxIAJrIgAgCEkiBBshAyAAIAggBBshCAwBCwsgAiADaiIMIANLBH8gAygCGCEJIAMgAygCDCIARgRAAkAgA0EUaiIBKAIAIgBFBEAgA0EQaiIBKAIAIgBFBEBBACEADAILCwNAAkAgAEEUaiIEKAIAIgYEfyAEIQEgBgUgAEEQaiIEKAIAIgZFDQEgBCEBIAYLIQAMAQsLIAFBADYCAAsFIAMoAggiASAANgIMIAAgATYCCAsgCQRAAkAgAyADKAIcIgFBAnRBzIYDaiIEKAIARgRAIAQgADYCACAARQRAQaCEA0EBIAF0QX9zIAtxNgIADAILBSAJQRBqIgEgCUEUaiADIAEoAgBGGyAANgIAIABFDQELIAAgCTYCGCADKAIQIgEEQCAAIAE2AhAgASAANgIYCyADKAIUIgEEQCAAIAE2AhQgASAANgIYCwsLIAhBEEkEQCADIAIgCGoiAEEDcjYCBCAAIANqQQRqIgAgACgCAEEBcjYCAAUgAyACQQNyNgIEIAwgCEEBcjYCBCAIIAxqIAg2AgAgBwRAQbCEAygCACEEIAdBA3YiAUEDdEHEhANqIQBBASABdCIBIAVxBH8gAEEIaiICKAIABUGchAMgASAFcjYCACAAQQhqIQIgAAshASACIAQ2AgAgASAENgIMIAQgATYCCCAEIAA2AgwLQaSEAyAINgIAQbCEAyAMNgIACyAKJAkgA0EIag8FIAILBSACCwUgAgsFIABBv39LBH9BfwUCfyAAQQtqIgBBeHEhAUGghAMoAgAiBQR/QQAgAWshAwJAAkAgAEEIdiIABH8gAUH///8HSwR/QR8FIAAgAEGA/j9qQRB2QQhxIgJ0IgRBgOAfakEQdkEEcSEAQQ4gACACciAEIAB0IgBBgIAPakEQdkECcSICcmsgACACdEEPdmoiAEEBdCABIABBB2p2QQFxcgsFQQALIgdBAnRBzIYDaigCACIABH9BACECIAFBAEEZIAdBAXZrIAdBH0YbdCEGQQAhBAN/IAAoAgRBeHEgAWsiCCADSQRAIAgEfyAIIQMgAAUgACECQQAhBgwECyECCyAEIAAoAhQiBCAERSAEIABBEGogBkEfdkECdGooAgAiAEZyGyEEIAZBAXQhBiAADQAgAgsFQQAhBEEACyEAIAAgBHJFBEAgASAFQQIgB3QiAEEAIABrcnEiAkUNBBpBACEAIAJBACACa3FBf2oiAkEMdkEQcSIEIAIgBHYiAkEFdkEIcSIEciACIAR2IgJBAnZBBHEiBHIgAiAEdiICQQF2QQJxIgRyIAIgBHYiAkEBdkEBcSIEciACIAR2akECdEHMhgNqKAIAIQQLIAQEfyAAIQIgAyEGIAQhAAwBBSAACyEEDAELIAIhAyAGIQIDfyAAKAIEQXhxIAFrIgYgAkkhBCAGIAIgBBshAiAAIAMgBBshAyAAKAIQIgQEfyAEBSAAKAIUCyIADQAgAyEEIAILIQMLIAQEfyADQaSEAygCACABa0kEfyABIARqIgcgBEsEfyAEKAIYIQkgBCAEKAIMIgBGBEACQCAEQRRqIgIoAgAiAEUEQCAEQRBqIgIoAgAiAEUEQEEAIQAMAgsLA0ACQCAAQRRqIgYoAgAiCAR/IAYhAiAIBSAAQRBqIgYoAgAiCEUNASAGIQIgCAshAAwBCwsgAkEANgIACwUgBCgCCCICIAA2AgwgACACNgIICyAJBEACQCAEIAQoAhwiAkECdEHMhgNqIgYoAgBGBEAgBiAANgIAIABFBEBBoIQDIAVBASACdEF/c3EiADYCAAwCCwUgCUEQaiICIAlBFGogBCACKAIARhsgADYCACAARQRAIAUhAAwCCwsgACAJNgIYIAQoAhAiAgRAIAAgAjYCECACIAA2AhgLIAQoAhQiAgR/IAAgAjYCFCACIAA2AhggBQUgBQshAAsFIAUhAAsgA0EQSQRAIAQgASADaiIAQQNyNgIEIAAgBGpBBGoiACAAKAIAQQFyNgIABQJAIAQgAUEDcjYCBCAHIANBAXI2AgQgAyAHaiADNgIAIANBA3YhASADQYACSQRAIAFBA3RBxIQDaiEAQZyEAygCACICQQEgAXQiAXEEfyAAQQhqIgIoAgAFQZyEAyABIAJyNgIAIABBCGohAiAACyEBIAIgBzYCACABIAc2AgwgByABNgIIIAcgADYCDAwBCyADQQh2IgEEfyADQf///wdLBH9BHwUgASABQYD+P2pBEHZBCHEiAnQiBUGA4B9qQRB2QQRxIQFBDiABIAJyIAUgAXQiAUGAgA9qQRB2QQJxIgJyayABIAJ0QQ92aiIBQQF0IAMgAUEHanZBAXFyCwVBAAsiAUECdEHMhgNqIQIgByABNgIcIAdBEGoiBUEANgIEIAVBADYCAEEBIAF0IgUgAHFFBEBBoIQDIAAgBXI2AgAgAiAHNgIAIAcgAjYCGCAHIAc2AgwgByAHNgIIDAELIAMgAigCACIAKAIEQXhxRgRAIAAhAQUCQCADQQBBGSABQQF2ayABQR9GG3QhAgNAIABBEGogAkEfdkECdGoiBSgCACIBBEAgAkEBdCECIAMgASgCBEF4cUYNAiABIQAMAQsLIAUgBzYCACAHIAA2AhggByAHNgIMIAcgBzYCCAwCCwsgAUEIaiIAKAIAIgIgBzYCDCAAIAc2AgAgByACNgIIIAcgATYCDCAHQQA2AhgLCyAKJAkgBEEIag8FIAELBSABCwUgAQsFIAELCwsLIQBBpIQDKAIAIgIgAE8EQEGwhAMoAgAhASACIABrIgNBD0sEQEGwhAMgACABaiIFNgIAQaSEAyADNgIAIAUgA0EBcjYCBCABIAJqIAM2AgAgASAAQQNyNgIEBUGkhANBADYCAEGwhANBADYCACABIAJBA3I2AgQgASACakEEaiIAIAAoAgBBAXI2AgALIAokCSABQQhqDwtBqIQDKAIAIgIgAEsEQEGohAMgAiAAayICNgIAQbSEAyAAQbSEAygCACIBaiIDNgIAIAMgAkEBcjYCBCABIABBA3I2AgQgCiQJIAFBCGoPCyAAQTBqIQQgAEEvaiIGQfSHAygCAAR/QfyHAygCAAVB/IcDQYAgNgIAQfiHA0GAIDYCAEGAiANBfzYCAEGEiANBfzYCAEGIiANBADYCAEHYhwNBADYCAEH0hwMgCUFwcUHYqtWqBXM2AgBBgCALIgFqIghBACABayIJcSIFIABNBEAgCiQJQQAPC0HUhwMoAgAiAQRAIAVBzIcDKAIAIgNqIgcgA00gByABS3IEQCAKJAlBAA8LCwJAAkBB2IcDKAIAQQRxBEBBACECBQJAAkACQEG0hAMoAgAiAUUNAEHchwMhAwNAAkAgAygCACIHIAFNBEAgByADKAIEaiABSw0BCyADKAIIIgMNAQwCCwsgCSAIIAJrcSICQf////8HSQRAIAIQiA8iASADKAIAIAMoAgRqRgRAIAFBf0cNBgUMAwsFQQAhAgsMAgtBABCIDyIBQX9GBH9BAAVBzIcDKAIAIgggBSABQfiHAygCACICQX9qIgNqQQAgAmtxIAFrQQAgASADcRtqIgJqIQMgAkH/////B0kgAiAAS3EEf0HUhwMoAgAiCQRAIAMgCE0gAyAJS3IEQEEAIQIMBQsLIAEgAhCIDyIDRg0FIAMhAQwCBUEACwshAgwBC0EAIAJrIQggAUF/RyACQf////8HSXEgBCACS3FFBEAgAUF/RgRAQQAhAgwCBQwECwALQfyHAygCACIDIAYgAmtqQQAgA2txIgNB/////wdPDQIgAxCID0F/RgR/IAgQiA8aQQAFIAIgA2ohAgwDCyECC0HYhwNB2IcDKAIAQQRyNgIACyAFQf////8HSQRAIAUQiA8hAUEAEIgPIgMgAWsiBCAAQShqSyEFIAQgAiAFGyECIAVBAXMgAUF/RnIgAUF/RyADQX9HcSABIANJcUEBc3JFDQELDAELQcyHAyACQcyHAygCAGoiAzYCACADQdCHAygCAEsEQEHQhwMgAzYCAAtBtIQDKAIAIgUEQAJAQdyHAyEDAkACQANAIAEgAygCACIEIAMoAgQiBmpGDQEgAygCCCIDDQALDAELIANBBGohCCADKAIMQQhxRQRAIAQgBU0gASAFS3EEQCAIIAIgBmo2AgAgBUEAIAVBCGoiAWtBB3FBACABQQdxGyIDaiEBIAJBqIQDKAIAaiIEIANrIQJBtIQDIAE2AgBBqIQDIAI2AgAgASACQQFyNgIEIAQgBWpBKDYCBEG4hANBhIgDKAIANgIADAMLCwsgAUGshAMoAgBJBEBBrIQDIAE2AgALIAEgAmohBEHchwMhAwJAAkADQCAEIAMoAgBGDQEgAygCCCIDDQALDAELIAMoAgxBCHFFBEAgAyABNgIAIANBBGoiAyACIAMoAgBqNgIAIAAgAUEAIAFBCGoiAWtBB3FBACABQQdxG2oiCWohBiAEQQAgBEEIaiIBa0EHcUEAIAFBB3EbaiICIAlrIABrIQMgCSAAQQNyNgIEIAIgBUYEQEGohAMgA0GohAMoAgBqIgA2AgBBtIQDIAY2AgAgBiAAQQFyNgIEBQJAIAJBsIQDKAIARgRAQaSEAyADQaSEAygCAGoiADYCAEGwhAMgBjYCACAGIABBAXI2AgQgACAGaiAANgIADAELIAIoAgQiAEEDcUEBRgRAIABBeHEhByAAQQN2IQUgAEGAAkkEQCACKAIIIgAgAigCDCIBRgRAQZyEA0GchAMoAgBBASAFdEF/c3E2AgAFIAAgATYCDCABIAA2AggLBQJAIAIoAhghCCACIAIoAgwiAEYEQAJAIAJBEGoiAUEEaiIFKAIAIgAEQCAFIQEFIAEoAgAiAEUEQEEAIQAMAgsLA0ACQCAAQRRqIgUoAgAiBAR/IAUhASAEBSAAQRBqIgUoAgAiBEUNASAFIQEgBAshAAwBCwsgAUEANgIACwUgAigCCCIBIAA2AgwgACABNgIICyAIRQ0AIAIgAigCHCIBQQJ0QcyGA2oiBSgCAEYEQAJAIAUgADYCACAADQBBoIQDQaCEAygCAEEBIAF0QX9zcTYCAAwCCwUgCEEQaiIBIAhBFGogAiABKAIARhsgADYCACAARQ0BCyAAIAg2AhggAkEQaiIFKAIAIgEEQCAAIAE2AhAgASAANgIYCyAFKAIEIgFFDQAgACABNgIUIAEgADYCGAsLIAIgB2ohAiADIAdqIQMLIAJBBGoiACAAKAIAQX5xNgIAIAYgA0EBcjYCBCADIAZqIAM2AgAgA0EDdiEBIANBgAJJBEAgAUEDdEHEhANqIQBBnIQDKAIAIgJBASABdCIBcQR/IABBCGoiAigCAAVBnIQDIAEgAnI2AgAgAEEIaiECIAALIQEgAiAGNgIAIAEgBjYCDCAGIAE2AgggBiAANgIMDAELIANBCHYiAAR/IANB////B0sEf0EfBSAAIABBgP4/akEQdkEIcSIBdCICQYDgH2pBEHZBBHEhAEEOIAAgAXIgAiAAdCIAQYCAD2pBEHZBAnEiAXJrIAAgAXRBD3ZqIgBBAXQgAyAAQQdqdkEBcXILBUEACyIBQQJ0QcyGA2ohACAGIAE2AhwgBkEQaiICQQA2AgQgAkEANgIAQaCEAygCACICQQEgAXQiBXFFBEBBoIQDIAIgBXI2AgAgACAGNgIAIAYgADYCGCAGIAY2AgwgBiAGNgIIDAELIAMgACgCACIAKAIEQXhxRgRAIAAhAQUCQCADQQBBGSABQQF2ayABQR9GG3QhAgNAIABBEGogAkEfdkECdGoiBSgCACIBBEAgAkEBdCECIAMgASgCBEF4cUYNAiABIQAMAQsLIAUgBjYCACAGIAA2AhggBiAGNgIMIAYgBjYCCAwCCwsgAUEIaiIAKAIAIgIgBjYCDCAAIAY2AgAgBiACNgIIIAYgATYCDCAGQQA2AhgLCyAKJAkgCUEIag8LC0HchwMhAwNAAkAgAygCACIEIAVNBEAgBCADKAIEaiIGIAVLDQELIAMoAgghAwwBCwsgBkFRaiIEQQhqIQMgBSAEQQAgA2tBB3FBACADQQdxG2oiAyADIAVBEGoiCUkbIgNBCGohBEG0hAMgAUEAIAFBCGoiCGtBB3FBACAIQQdxGyIIaiIHNgIAQaiEAyACQVhqIgsgCGsiCDYCACAHIAhBAXI2AgQgASALakEoNgIEQbiEA0GEiAMoAgA2AgAgA0EEaiIIQRs2AgAgBEHchwMpAgA3AgAgBEHkhwMpAgA3AghB3IcDIAE2AgBB4IcDIAI2AgBB6IcDQQA2AgBB5IcDIAQ2AgAgA0EYaiEBA0AgAUEEaiICQQc2AgAgAUEIaiAGSQRAIAIhAQwBCwsgAyAFRwRAIAggCCgCAEF+cTYCACAFIAMgBWsiBEEBcjYCBCADIAQ2AgAgBEEDdiECIARBgAJJBEAgAkEDdEHEhANqIQFBnIQDKAIAIgNBASACdCICcQR/IAFBCGoiAygCAAVBnIQDIAIgA3I2AgAgAUEIaiEDIAELIQIgAyAFNgIAIAIgBTYCDCAFIAI2AgggBSABNgIMDAILIARBCHYiAQR/IARB////B0sEf0EfBSABIAFBgP4/akEQdkEIcSICdCIDQYDgH2pBEHZBBHEhAUEOIAEgAnIgAyABdCIBQYCAD2pBEHZBAnEiAnJrIAEgAnRBD3ZqIgFBAXQgBCABQQdqdkEBcXILBUEACyICQQJ0QcyGA2ohASAFIAI2AhwgBUEANgIUIAlBADYCAEGghAMoAgAiA0EBIAJ0IgZxRQRAQaCEAyADIAZyNgIAIAEgBTYCACAFIAE2AhggBSAFNgIMIAUgBTYCCAwCCyAEIAEoAgAiASgCBEF4cUYEQCABIQIFAkAgBEEAQRkgAkEBdmsgAkEfRht0IQMDQCABQRBqIANBH3ZBAnRqIgYoAgAiAgRAIANBAXQhAyAEIAIoAgRBeHFGDQIgAiEBDAELCyAGIAU2AgAgBSABNgIYIAUgBTYCDCAFIAU2AggMAwsLIAJBCGoiASgCACIDIAU2AgwgASAFNgIAIAUgAzYCCCAFIAI2AgwgBUEANgIYCwsFQayEAygCACIDRSABIANJcgRAQayEAyABNgIAC0HchwMgATYCAEHghwMgAjYCAEHohwNBADYCAEHAhANB9IcDKAIANgIAQbyEA0F/NgIAQdCEA0HEhAM2AgBBzIQDQcSEAzYCAEHYhANBzIQDNgIAQdSEA0HMhAM2AgBB4IQDQdSEAzYCAEHchANB1IQDNgIAQeiEA0HchAM2AgBB5IQDQdyEAzYCAEHwhANB5IQDNgIAQeyEA0HkhAM2AgBB+IQDQeyEAzYCAEH0hANB7IQDNgIAQYCFA0H0hAM2AgBB/IQDQfSEAzYCAEGIhQNB/IQDNgIAQYSFA0H8hAM2AgBBkIUDQYSFAzYCAEGMhQNBhIUDNgIAQZiFA0GMhQM2AgBBlIUDQYyFAzYCAEGghQNBlIUDNgIAQZyFA0GUhQM2AgBBqIUDQZyFAzYCAEGkhQNBnIUDNgIAQbCFA0GkhQM2AgBBrIUDQaSFAzYCAEG4hQNBrIUDNgIAQbSFA0GshQM2AgBBwIUDQbSFAzYCAEG8hQNBtIUDNgIAQciFA0G8hQM2AgBBxIUDQbyFAzYCAEHQhQNBxIUDNgIAQcyFA0HEhQM2AgBB2IUDQcyFAzYCAEHUhQNBzIUDNgIAQeCFA0HUhQM2AgBB3IUDQdSFAzYCAEHohQNB3IUDNgIAQeSFA0HchQM2AgBB8IUDQeSFAzYCAEHshQNB5IUDNgIAQfiFA0HshQM2AgBB9IUDQeyFAzYCAEGAhgNB9IUDNgIAQfyFA0H0hQM2AgBBiIYDQfyFAzYCAEGEhgNB/IUDNgIAQZCGA0GEhgM2AgBBjIYDQYSGAzYCAEGYhgNBjIYDNgIAQZSGA0GMhgM2AgBBoIYDQZSGAzYCAEGchgNBlIYDNgIAQaiGA0GchgM2AgBBpIYDQZyGAzYCAEGwhgNBpIYDNgIAQayGA0GkhgM2AgBBuIYDQayGAzYCAEG0hgNBrIYDNgIAQcCGA0G0hgM2AgBBvIYDQbSGAzYCAEHIhgNBvIYDNgIAQcSGA0G8hgM2AgBBtIQDIAFBACABQQhqIgNrQQdxQQAgA0EHcRsiA2oiBTYCAEGohAMgAkFYaiICIANrIgM2AgAgBSADQQFyNgIEIAEgAmpBKDYCBEG4hANBhIgDKAIANgIAC0GohAMoAgAiASAASwRAQaiEAyABIABrIgI2AgBBtIQDIABBtIQDKAIAIgFqIgM2AgAgAyACQQFyNgIEIAEgAEEDcjYCBCAKJAkgAUEIag8LCxD+CUEMNgIAIAokCUEAC/gNAQh/IABFBEAPC0GshAMoAgAhBCAAQXhqIgIgAEF8aigCACIDQXhxIgBqIQUgA0EBcQR/IAIFAn8gAigCACEBIANBA3FFBEAPCyAAIAFqIQAgAiABayICIARJBEAPCyACQbCEAygCAEYEQCACIAVBBGoiASgCACIDQQNxQQNHDQEaQaSEAyAANgIAIAEgA0F+cTYCACACIABBAXI2AgQgACACaiAANgIADwsgAUEDdiEEIAFBgAJJBEAgAigCCCIBIAIoAgwiA0YEQEGchANBnIQDKAIAQQEgBHRBf3NxNgIAIAIMAgUgASADNgIMIAMgATYCCCACDAILAAsgAigCGCEHIAIgAigCDCIBRgRAAkAgAkEQaiIDQQRqIgQoAgAiAQRAIAQhAwUgAygCACIBRQRAQQAhAQwCCwsDQAJAIAFBFGoiBCgCACIGBH8gBCEDIAYFIAFBEGoiBCgCACIGRQ0BIAQhAyAGCyEBDAELCyADQQA2AgALBSACKAIIIgMgATYCDCABIAM2AggLIAcEfyACIAIoAhwiA0ECdEHMhgNqIgQoAgBGBEAgBCABNgIAIAFFBEBBoIQDQaCEAygCAEEBIAN0QX9zcTYCACACDAMLBSAHQRBqIgMgB0EUaiACIAMoAgBGGyABNgIAIAIgAUUNAhoLIAEgBzYCGCACQRBqIgQoAgAiAwRAIAEgAzYCECADIAE2AhgLIAQoAgQiAwR/IAEgAzYCFCADIAE2AhggAgUgAgsFIAILCwsiByAFTwRADwsgBUEEaiIDKAIAIgFBAXFFBEAPCyABQQJxBEAgAyABQX5xNgIAIAIgAEEBcjYCBCAAIAdqIAA2AgAgACEDBSAFQbSEAygCAEYEQEGohAMgAEGohAMoAgBqIgA2AgBBtIQDIAI2AgAgAiAAQQFyNgIEQbCEAygCACACRwRADwtBsIQDQQA2AgBBpIQDQQA2AgAPC0GwhAMoAgAgBUYEQEGkhAMgAEGkhAMoAgBqIgA2AgBBsIQDIAc2AgAgAiAAQQFyNgIEIAAgB2ogADYCAA8LIAAgAUF4cWohAyABQQN2IQQgAUGAAkkEQCAFKAIIIgAgBSgCDCIBRgRAQZyEA0GchAMoAgBBASAEdEF/c3E2AgAFIAAgATYCDCABIAA2AggLBQJAIAUoAhghCCAFKAIMIgAgBUYEQAJAIAVBEGoiAUEEaiIEKAIAIgAEQCAEIQEFIAEoAgAiAEUEQEEAIQAMAgsLA0ACQCAAQRRqIgQoAgAiBgR/IAQhASAGBSAAQRBqIgQoAgAiBkUNASAEIQEgBgshAAwBCwsgAUEANgIACwUgBSgCCCIBIAA2AgwgACABNgIICyAIBEAgBSgCHCIBQQJ0QcyGA2oiBCgCACAFRgRAIAQgADYCACAARQRAQaCEA0GghAMoAgBBASABdEF/c3E2AgAMAwsFIAhBEGoiASAIQRRqIAEoAgAgBUYbIAA2AgAgAEUNAgsgACAINgIYIAVBEGoiBCgCACIBBEAgACABNgIQIAEgADYCGAsgBCgCBCIBBEAgACABNgIUIAEgADYCGAsLCwsgAiADQQFyNgIEIAMgB2ogAzYCACACQbCEAygCAEYEQEGkhAMgAzYCAA8LCyADQQN2IQEgA0GAAkkEQCABQQN0QcSEA2ohAEGchAMoAgAiA0EBIAF0IgFxBH8gAEEIaiIDKAIABUGchAMgASADcjYCACAAQQhqIQMgAAshASADIAI2AgAgASACNgIMIAIgATYCCCACIAA2AgwPCyADQQh2IgAEfyADQf///wdLBH9BHwUgACAAQYD+P2pBEHZBCHEiAXQiBEGA4B9qQRB2QQRxIQBBDiAAIAFyIAQgAHQiAEGAgA9qQRB2QQJxIgFyayAAIAF0QQ92aiIAQQF0IAMgAEEHanZBAXFyCwVBAAsiAUECdEHMhgNqIQAgAiABNgIcIAJBADYCFCACQQA2AhBBoIQDKAIAIgRBASABdCIGcQRAAkAgAyAAKAIAIgAoAgRBeHFGBEAgACEBBQJAIANBAEEZIAFBAXZrIAFBH0YbdCEEA0AgAEEQaiAEQR92QQJ0aiIGKAIAIgEEQCAEQQF0IQQgAyABKAIEQXhxRg0CIAEhAAwBCwsgBiACNgIAIAIgADYCGCACIAI2AgwgAiACNgIIDAILCyABQQhqIgAoAgAiAyACNgIMIAAgAjYCACACIAM2AgggAiABNgIMIAJBADYCGAsFQaCEAyAEIAZyNgIAIAAgAjYCACACIAA2AhggAiACNgIMIAIgAjYCCAtBvIQDQbyEAygCAEF/aiIANgIAIAAEQA8LQeSHAyEAA0AgACgCACICQQhqIQAgAg0AC0G8hANBfzYCAAuGAQECfyAARQRAIAEQ9woPCyABQb9/SwRAEP4JQQw2AgBBAA8LIABBeGpBECABQQtqQXhxIAFBC0kbEPoKIgIEQCACQQhqDwsgARD3CiICRQRAQQAPCyACIAAgAEF8aigCACIDQXhxQQRBCCADQQNxG2siAyABIAMgAUkbEIUPGiAAEPgKIAILyQcBCn8gACAAQQRqIgcoAgAiBkF4cSICaiEEIAZBA3FFBEAgAUGAAkkEQEEADwsgAiABQQRqTwRAIAIgAWtB/IcDKAIAQQF0TQRAIAAPCwtBAA8LIAIgAU8EQCACIAFrIgJBD00EQCAADwsgByABIAZBAXFyQQJyNgIAIAAgAWoiASACQQNyNgIEIARBBGoiAyADKAIAQQFyNgIAIAEgAhD7CiAADwtBtIQDKAIAIARGBEBBqIQDKAIAIAJqIgUgAWshAiAAIAFqIQMgBSABTQRAQQAPCyAHIAEgBkEBcXJBAnI2AgAgAyACQQFyNgIEQbSEAyADNgIAQaiEAyACNgIAIAAPC0GwhAMoAgAgBEYEQCACQaSEAygCAGoiAyABSQRAQQAPCyADIAFrIgJBD0sEQCAHIAEgBkEBcXJBAnI2AgAgACABaiIBIAJBAXI2AgQgACADaiIDIAI2AgAgA0EEaiIDIAMoAgBBfnE2AgAFIAcgAyAGQQFxckECcjYCACAAIANqQQRqIgEgASgCAEEBcjYCAEEAIQFBACECC0GkhAMgAjYCAEGwhAMgATYCACAADwsgBCgCBCIDQQJxBEBBAA8LIAIgA0F4cWoiCCABSQRAQQAPCyAIIAFrIQogA0EDdiEFIANBgAJJBEAgBCgCCCICIAQoAgwiA0YEQEGchANBnIQDKAIAQQEgBXRBf3NxNgIABSACIAM2AgwgAyACNgIICwUCQCAEKAIYIQkgBCAEKAIMIgJGBEACQCAEQRBqIgNBBGoiBSgCACICBEAgBSEDBSADKAIAIgJFBEBBACECDAILCwNAAkAgAkEUaiIFKAIAIgsEfyAFIQMgCwUgAkEQaiIFKAIAIgtFDQEgBSEDIAsLIQIMAQsLIANBADYCAAsFIAQoAggiAyACNgIMIAIgAzYCCAsgCQRAIAQoAhwiA0ECdEHMhgNqIgUoAgAgBEYEQCAFIAI2AgAgAkUEQEGghANBoIQDKAIAQQEgA3RBf3NxNgIADAMLBSAJQRBqIgMgCUEUaiADKAIAIARGGyACNgIAIAJFDQILIAIgCTYCGCAEQRBqIgUoAgAiAwRAIAIgAzYCECADIAI2AhgLIAUoAgQiAwRAIAIgAzYCFCADIAI2AhgLCwsLIApBEEkEfyAHIAZBAXEgCHJBAnI2AgAgACAIakEEaiIBIAEoAgBBAXI2AgAgAAUgByABIAZBAXFyQQJyNgIAIAAgAWoiASAKQQNyNgIEIAAgCGpBBGoiAiACKAIAQQFyNgIAIAEgChD7CiAACwvoDAEGfyAAIAFqIQUgACgCBCIDQQFxRQRAAkAgACgCACECIANBA3FFBEAPCyABIAJqIQEgACACayIAQbCEAygCAEYEQCAFQQRqIgIoAgAiA0EDcUEDRw0BQaSEAyABNgIAIAIgA0F+cTYCACAAIAFBAXI2AgQgBSABNgIADwsgAkEDdiEEIAJBgAJJBEAgACgCCCICIAAoAgwiA0YEQEGchANBnIQDKAIAQQEgBHRBf3NxNgIADAIFIAIgAzYCDCADIAI2AggMAgsACyAAKAIYIQcgACAAKAIMIgJGBEACQCAAQRBqIgNBBGoiBCgCACICBEAgBCEDBSADKAIAIgJFBEBBACECDAILCwNAAkAgAkEUaiIEKAIAIgYEfyAEIQMgBgUgAkEQaiIEKAIAIgZFDQEgBCEDIAYLIQIMAQsLIANBADYCAAsFIAAoAggiAyACNgIMIAIgAzYCCAsgBwRAIAAgACgCHCIDQQJ0QcyGA2oiBCgCAEYEQCAEIAI2AgAgAkUEQEGghANBoIQDKAIAQQEgA3RBf3NxNgIADAMLBSAHQRBqIgMgB0EUaiAAIAMoAgBGGyACNgIAIAJFDQILIAIgBzYCGCAAQRBqIgQoAgAiAwRAIAIgAzYCECADIAI2AhgLIAQoAgQiAwRAIAIgAzYCFCADIAI2AhgLCwsLIAVBBGoiAygCACICQQJxBEAgAyACQX5xNgIAIAAgAUEBcjYCBCAAIAFqIAE2AgAgASEDBSAFQbSEAygCAEYEQEGohAMgAUGohAMoAgBqIgE2AgBBtIQDIAA2AgAgACABQQFyNgIEQbCEAygCACAARwRADwtBsIQDQQA2AgBBpIQDQQA2AgAPCyAFQbCEAygCAEYEQEGkhAMgAUGkhAMoAgBqIgE2AgBBsIQDIAA2AgAgACABQQFyNgIEIAAgAWogATYCAA8LIAEgAkF4cWohAyACQQN2IQQgAkGAAkkEQCAFKAIIIgEgBSgCDCICRgRAQZyEA0GchAMoAgBBASAEdEF/c3E2AgAFIAEgAjYCDCACIAE2AggLBQJAIAUoAhghByAFKAIMIgEgBUYEQAJAIAVBEGoiAkEEaiIEKAIAIgEEQCAEIQIFIAIoAgAiAUUEQEEAIQEMAgsLA0ACQCABQRRqIgQoAgAiBgR/IAQhAiAGBSABQRBqIgQoAgAiBkUNASAEIQIgBgshAQwBCwsgAkEANgIACwUgBSgCCCICIAE2AgwgASACNgIICyAHBEAgBSgCHCICQQJ0QcyGA2oiBCgCACAFRgRAIAQgATYCACABRQRAQaCEA0GghAMoAgBBASACdEF/c3E2AgAMAwsFIAdBEGoiAiAHQRRqIAIoAgAgBUYbIAE2AgAgAUUNAgsgASAHNgIYIAVBEGoiBCgCACICBEAgASACNgIQIAIgATYCGAsgBCgCBCICBEAgASACNgIUIAIgATYCGAsLCwsgACADQQFyNgIEIAAgA2ogAzYCACAAQbCEAygCAEYEQEGkhAMgAzYCAA8LCyADQQN2IQIgA0GAAkkEQCACQQN0QcSEA2ohAUGchAMoAgAiA0EBIAJ0IgJxBH8gAUEIaiIDKAIABUGchAMgAiADcjYCACABQQhqIQMgAQshAiADIAA2AgAgAiAANgIMIAAgAjYCCCAAIAE2AgwPCyADQQh2IgEEfyADQf///wdLBH9BHwUgASABQYD+P2pBEHZBCHEiAnQiBEGA4B9qQRB2QQRxIQFBDiABIAJyIAQgAXQiAUGAgA9qQRB2QQJxIgJyayABIAJ0QQ92aiIBQQF0IAMgAUEHanZBAXFyCwVBAAsiAkECdEHMhgNqIQEgACACNgIcIABBADYCFCAAQQA2AhBBoIQDKAIAIgRBASACdCIGcUUEQEGghAMgBCAGcjYCACABIAA2AgAgACABNgIYIAAgADYCDCAAIAA2AggPCyADIAEoAgAiASgCBEF4cUYEQCABIQIFAkAgA0EAQRkgAkEBdmsgAkEfRht0IQQDQCABQRBqIARBH3ZBAnRqIgYoAgAiAgRAIARBAXQhBCADIAIoAgRBeHFGDQIgAiEBDAELCyAGIAA2AgAgACABNgIYIAAgADYCDCAAIAA2AggPCwsgAkEIaiIBKAIAIgMgADYCDCABIAA2AgAgACADNgIIIAAgAjYCDCAAQQA2AhgLBwAgABD9CgthAQF/IABB/N0BNgIAQQAkBUGaASAAQQAQWiMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEOEBBSAAQRxqENoLIAAoAiAQ+AogACgCJBD4CiAAKAIwEPgKIAAoAjwQ+AoLC1YBBH8gAEEgaiEDIABBJGohBCAAKAIoIQIDQCACBEAgAygCACACQX9qIgJBAnRqKAIAIQUgASAAIAQoAgAgAkECdGooAgAgBUEfcUH6DGoRAgAMAQsLCwwAIAAQ/QogABC0DgsTACAAQYzeATYCACAAQQRqENoLCwwAIAAQgAsgABC0DgsEACAACxAAIABCADcDACAAQn83AwgLEAAgAEIANwMAIABCfzcDCAuqAQEGfxCOCRogAEEMaiEFIABBEGohBkEAIQQDQAJAIAQgAk4NACAFKAIAIgMgBigCACIHSQR/IAEgAyACIARrIgggByADayIDIAggA0gbIgMQigsaIAUgAyAFKAIAajYCACABIANqBSAAKAIAKAIoIQMgACADQf8BcUG6AWoRAwAiA0F/Rg0BIAEgAxCUCToAAEEBIQMgAUEBagshASADIARqIQQMAQsLIAQLBQAQjgkLRgEBfyAAKAIAKAIkIQEgACABQf8BcUG6AWoRAwAQjglGBH8QjgkFIABBDGoiASgCACEAIAEgAEEBajYCACAALAAAEJQJCwsFABCOCQupAQEHfxCOCSEHIABBGGohBSAAQRxqIQhBACEEA0ACQCAEIAJODQAgBSgCACIGIAgoAgAiA0kEfyAGIAEgAiAEayIJIAMgBmsiAyAJIANIGyIDEIoLGiAFIAMgBSgCAGo2AgAgAyAEaiEEIAEgA2oFIAAoAgAoAjQhAyAAIAEsAAAQlAkgA0E/cUG+A2oRHgAgB0YNASAEQQFqIQQgAUEBagshAQwBCwsgBAsTACACBEAgACABIAIQhQ8aCyAACxMAIABBzN4BNgIAIABBBGoQ2gsLDAAgABCLCyAAELQOC7MBAQZ/EI4JGiAAQQxqIQUgAEEQaiEGQQAhBANAAkAgBCACTg0AIAUoAgAiAyAGKAIAIgdJBH8gASADIAIgBGsiCCAHIANrQQJ1IgMgCCADSBsiAxCSCxogBSAFKAIAIANBAnRqNgIAIANBAnQgAWoFIAAoAgAoAighAyAAIANB/wFxQboBahEDACIDQX9GDQEgASADEIICNgIAQQEhAyABQQRqCyEBIAMgBGohBAwBCwsgBAsFABCOCQtGAQF/IAAoAgAoAiQhASAAIAFB/wFxQboBahEDABCOCUYEfxCOCQUgAEEMaiIBKAIAIQAgASAAQQRqNgIAIAAoAgAQggILCwUAEI4JC7IBAQd/EI4JIQcgAEEYaiEFIABBHGohCEEAIQQDQAJAIAQgAk4NACAFKAIAIgYgCCgCACIDSQR/IAYgASACIARrIgkgAyAGa0ECdSIDIAkgA0gbIgMQkgsaIAUgBSgCACADQQJ0ajYCACADIARqIQQgA0ECdCABagUgACgCACgCNCEDIAAgASgCABCCAiADQT9xQb4DahEeACAHRg0BIARBAWohBCABQQRqCyEBDAELCyAECxYAIAIEfyAAIAEgAhDRChogAAUgAAsLEwAgAEGs3wEQ7QMgAEEIahD8CgsMACAAEJMLIAAQtA4LEwAgACAAKAIAQXRqKAIAahCTCwsTACAAIAAoAgBBdGooAgBqEJQLCxMAIABB3N8BEO0DIABBCGoQ/AoLDAAgABCXCyAAELQOCxMAIAAgACgCAEF0aigCAGoQlwsLEwAgACAAKAIAQXRqKAIAahCYCwsTACAAQYzgARDtAyAAQQRqEPwKCwwAIAAQmwsgABC0DgsTACAAIAAoAgBBdGooAgBqEJsLCxMAIAAgACgCAEF0aigCAGoQnAsLEwAgAEG84AEQ7QMgAEEEahD8CgsMACAAEJ8LIAAQtA4LEwAgACAAKAIAQXRqKAIAahCfCwsTACAAIAAoAgBBdGooAgBqEKALC2ABAX8gACABNgIYIAAgAUU2AhAgAEEANgIUIABBgiA2AgQgAEEANgIMIABBBjYCCCAAQSBqIgJCADcCACACQgA3AgggAkIANwIQIAJCADcCGCACQgA3AiAgAEEcahCuDgsMACAAIAFBHGoQrA4LLwEBfyAAQYzeATYCACAAQQRqEK4OIABBCGoiAUIANwIAIAFCADcCCCABQgA3AhALLwEBfyAAQczeATYCACAAQQRqEK4OIABBCGoiAUIANwIAIAFCADcCCCABQgA3AhALBQAQqAsLBwBBABCpCwvdBQECf0G0jQNB7NgBKAIAIgBB7I0DEKoLQYyIA0GQ3wE2AgBBlIgDQaTfATYCAEGQiANBADYCAEGUiANBtI0DEKMLQdyIA0EANgIAQeCIAxCOCTYCAEH0jQMgAEGsjgMQqwtB5IgDQcDfATYCAEHsiANB1N8BNgIAQeiIA0EANgIAQeyIA0H0jQMQowtBtIkDQQA2AgBBuIkDEI4JNgIAQbSOA0Hs2QEoAgAiAEHkjgMQrAtBvIkDQfDfATYCAEHAiQNBhOABNgIAQcCJA0G0jgMQowtBiIoDQQA2AgBBjIoDEI4JNgIAQeyOAyAAQZyPAxCtC0GQigNBoOABNgIAQZSKA0G04AE2AgBBlIoDQeyOAxCjC0HcigNBADYCAEHgigMQjgk2AgBBpI8DQezXASgCACIAQdSPAxCsC0HkigNB8N8BNgIAQeiKA0GE4AE2AgBB6IoDQaSPAxCjC0GwiwNBADYCAEG0iwMQjgk2AgBB5IoDKAIAQXRqKAIAQfyKA2ooAgAhAUGMjANB8N8BNgIAQZCMA0GE4AE2AgBBkIwDIAEQowtB2IwDQQA2AgBB3IwDEI4JNgIAQdyPAyAAQYyQAxCtC0G4iwNBoOABNgIAQbyLA0G04AE2AgBBvIsDQdyPAxCjC0GEjANBADYCAEGIjAMQjgk2AgBBuIsDKAIAQXRqKAIAQdCLA2ooAgAhAEHgjANBoOABNgIAQeSMA0G04AE2AgBB5IwDIAAQowtBrI0DQQA2AgBBsI0DEI4JNgIAQYyIAygCAEF0aigCAEHUiANqQbyJAzYCAEHkiAMoAgBBdGooAgBBrIkDakGQigM2AgBB5IoDKAIAQXRqIgAoAgBB6IoDaiIBIAEoAgBBgMAAcjYCAEG4iwMoAgBBdGoiASgCAEG8iwNqIgIgAigCAEGAwAByNgIAIAAoAgBBrIsDakG8iQM2AgAgASgCAEGAjANqQZCKAzYCAAuXAQEBfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAAQpQsgAEGM4gE2AgAgACABNgIgIAAgAjYCKCAAEI4JNgIwIABBADoANCAAKAIAKAIIIQIgAyIBIABBBGoQrA5BACQFIAIgACABEFojBSECQQAkBSACQQFxBEAQYyECEAAaIAEQ2gsgABCACyACEGoFIAEQ2gsgAyQJCwuXAQEBfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAAQpgsgAEHM4QE2AgAgACABNgIgIAAgAjYCKCAAEI4JNgIwIABBADoANCAAKAIAKAIIIQIgAyIBIABBBGoQrA5BACQFIAIgACABEFojBSECQQAkBSACQQFxBEAQYyECEAAaIAEQ2gsgABCLCyACEGoFIAEQ2gsgAyQJCwuqAQEDfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAAQpQsgAEGM4QE2AgAgACABNgIgIAQiASAAQQRqEKwOQQAkBUE9IAFB1JIDEE8hAyMFIQVBACQFIAVBAXEEQBBjIQIQABogARDaCyAAEIALIAIQagUgARDaCyAAIAM2AiQgACACNgIoIAMoAgAoAhwhASAAIAMgAUH/AXFBugFqEQMAQQFxOgAsIAQkCQsLqgEBA38jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAAEKYLIABBzOABNgIAIAAgATYCICAEIgEgAEEEahCsDkEAJAVBPSABQdySAxBPIQMjBSEFQQAkBSAFQQFxBEAQYyECEAAaIAEQ2gsgABCLCyACEGoFIAEQ2gsgACADNgIkIAAgAjYCKCADKAIAKAIcIQEgACADIAFB/wFxQboBahEDAEEBcToALCAEJAkLC08BAX8gACgCACgCGCECIAAgAkH/AXFBugFqEQMAGiAAIAFB3JIDENkLIgE2AiQgASgCACgCHCECIAAgASACQf8BcUG6AWoRAwBBAXE6ACwLzwEBCX8jCSEBIwlBEGokCSMJIwpOBEBBEBABCyABIQQgAEEkaiEGIABBKGohByABQQhqIgJBCGohCCACIQkgAEEgaiEFAkACQANAAkAgBigCACIDKAIAKAIUIQAgAyAHKAIAIAIgCCAEIABBH3FB3ARqER8AIQMgBCgCACAJayIAIAJBASAAIAUoAgAQjgpHBEBBfyEADAELAkACQCADQQFrDgIBAAQLQX8hAAwBCwwBCwsMAQsgBSgCABCYCkEAR0EfdEEfdSEACyABJAkgAAtnAQJ/IAAsACwEQCABQQQgAiAAKAIgEI4KIQMFAkBBACEDA0AgAyACTg0BIAAoAgAoAjQhBCAAIAEoAgAQggIgBEE/cUG+A2oRHgAQjglHBEAgA0EBaiEDIAFBBGohAQwBCwsLCyADC8oCAQx/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgA0EQaiEEIANBCGohAiADQQRqIQUgAyEGAn8CQCABEI4JEJAJDQACfyACIAEQggI2AgAgACwALARAIAJBBEEBIAAoAiAQjgpBAUYNAhCOCQwBCyAFIAQ2AgAgAkEEaiEJIABBJGohCiAAQShqIQsgBEEIaiEMIAQhDSAAQSBqIQggAiEAAkADQAJAIAooAgAiAigCACgCDCEHIAIgCygCACAAIAkgBiAEIAwgBSAHQQ9xQdAFahEgACECIAAgBigCAEYNAiACQQNGDQAgAkEBRiEHIAJBAk8NAiAFKAIAIA1rIgAgBEEBIAAgCCgCABCOCkcNAiAGKAIAIQAgBw0BDAQLCyAAQQFBASAIKAIAEI4KQQFHDQAMAgsQjgkLDAELIAEQsgsLIQAgAyQJIAALFgAgABCOCRCQCQR/EI4JQX9zBSAACwtPAQF/IAAoAgAoAhghAiAAIAJB/wFxQboBahEDABogACABQdSSAxDZCyIBNgIkIAEoAgAoAhwhAiAAIAEgAkH/AXFBugFqEQMAQQFxOgAsC2cBAn8gACwALARAIAFBASACIAAoAiAQjgohAwUCQEEAIQMDQCADIAJODQEgACgCACgCNCEEIAAgASwAABCUCSAEQT9xQb4DahEeABCOCUcEQCADQQFqIQMgAUEBaiEBDAELCwsLIAMLygIBDH8jCSEDIwlBIGokCSMJIwpOBEBBIBABCyADQRBqIQQgA0EIaiECIANBBGohBSADIQYCfwJAIAEQjgkQkAkNAAJ/IAIgARCUCToAACAALAAsBEAgAkEBQQEgACgCIBCOCkEBRg0CEI4JDAELIAUgBDYCACACQQFqIQkgAEEkaiEKIABBKGohCyAEQQhqIQwgBCENIABBIGohCCACIQACQANAAkAgCigCACICKAIAKAIMIQcgAiALKAIAIAAgCSAGIAQgDCAFIAdBD3FB0AVqESAAIQIgACAGKAIARg0CIAJBA0YNACACQQFGIQcgAkECTw0CIAUoAgAgDWsiACAEQQEgACAIKAIAEI4KRw0CIAYoAgAhACAHDQEMBAsLIABBAUEBIAgoAgAQjgpBAUcNAAwCCxCOCQsMAQsgARCVCQshACADJAkgAAt0AQN/IABBJGoiAiABQdySAxDZCyIBNgIAIAEoAgAoAhghAyAAQSxqIgQgASADQf8BcUG6AWoRAwA2AgAgAigCACIBKAIAKAIcIQIgACABIAJB/wFxQboBahEDAEEBcToANSAEKAIAQQhKBEBB2sgCEP8MCwsJACAAQQAQugsLCQAgAEEBELoLC9YCAQl/IwkhBCMJQSBqJAkjCSMKTgRAQSAQAQsgBEEQaiEFIARBCGohBiAEQQRqIQcgBCECIAEQjgkQkAkhCCAAQTRqIgksAABBAEchAyAIBEAgA0UEQCAJIAAoAjAiARCOCRCQCUEBc0EBcToAAAsFAkAgAwRAIAcgAEEwaiIDKAIAEIICNgIAIAAoAiQiCCgCACgCDCEKAn8CQAJAAkAgCCAAKAIoIAcgB0EEaiACIAUgBUEIaiAGIApBD3FB0AVqESAAQQFrDgMCAgABCyAFIAMoAgA6AAAgBiAFQQFqNgIACyAAQSBqIQADQCAGKAIAIgIgBU0EQEEBIQJBAAwDCyAGIAJBf2oiAjYCACACLAAAIAAoAgAQ4QpBf0cNAAsLQQAhAhCOCQshACACRQRAIAAhAQwCCwUgAEEwaiEDCyADIAE2AgAgCUEBOgAACwsgBCQJIAEL4QMCDX8BfiMJIQYjCUEgaiQJIwkjCk4EQEEgEAELIAZBEGohBCAGQQhqIQUgBkEEaiEMIAYhByAAQTRqIgIsAAAEQCAAQTBqIgcoAgAhACABBEAgBxCOCTYCACACQQA6AAALBSAAKAIsIgJBASACQQFKGyECIABBIGohCEEAIQMCQAJAA0AgAyACTw0BIAgoAgAQ1QoiCUF/RwRAIAMgBGogCToAACADQQFqIQMMAQsLEI4JIQAMAQsCQAJAIAAsADUEQCAFIAQsAAA2AgAMAQUCQCAAQShqIQMgAEEkaiEJIAVBBGohDQJAAkACQANAAkAgAygCACIKKQIAIQ8gCSgCACILKAIAKAIQIQ4CQCALIAogBCACIARqIgogDCAFIA0gByAOQQ9xQdAFahEgAEEBaw4DAAQDAQsgAygCACAPNwIAIAJBCEYNAyAIKAIAENUKIgtBf0YNAyAKIAs6AAAgAkEBaiECDAELCwwCCyAFIAQsAAA2AgAMAQsQjgkhAAwBCwwCCwsMAQsgAQRAIAAgBSgCABCCAjYCMAUCQANAIAJBAEwNASAEIAJBf2oiAmosAAAQggIgCCgCABDhCkF/Rw0ACxCOCSEADAILCyAFKAIAEIICIQALCwsgBiQJIAALdAEDfyAAQSRqIgIgAUHUkgMQ2QsiATYCACABKAIAKAIYIQMgAEEsaiIEIAEgA0H/AXFBugFqEQMANgIAIAIoAgAiASgCACgCHCECIAAgASACQf8BcUG6AWoRAwBBAXE6ADUgBCgCAEEISgRAQdrIAhD/DAsLCQAgAEEAEL8LCwkAIABBARC/CwvWAgEJfyMJIQQjCUEgaiQJIwkjCk4EQEEgEAELIARBEGohBSAEQQRqIQYgBEEIaiEHIAQhAiABEI4JEJAJIQggAEE0aiIJLAAAQQBHIQMgCARAIANFBEAgCSAAKAIwIgEQjgkQkAlBAXNBAXE6AAALBQJAIAMEQCAHIABBMGoiAygCABCUCToAACAAKAIkIggoAgAoAgwhCgJ/AkACQAJAIAggACgCKCAHIAdBAWogAiAFIAVBCGogBiAKQQ9xQdAFahEgAEEBaw4DAgIAAQsgBSADKAIAOgAAIAYgBUEBajYCAAsgAEEgaiEAA0AgBigCACICIAVNBEBBASECQQAMAwsgBiACQX9qIgI2AgAgAiwAACAAKAIAEOEKQX9HDQALC0EAIQIQjgkLIQAgAkUEQCAAIQEMAgsFIABBMGohAwsgAyABNgIAIAlBAToAAAsLIAQkCSABC+EDAg1/AX4jCSEGIwlBIGokCSMJIwpOBEBBIBABCyAGQRBqIQQgBkEIaiEFIAZBBGohDCAGIQcgAEE0aiICLAAABEAgAEEwaiIHKAIAIQAgAQRAIAcQjgk2AgAgAkEAOgAACwUgACgCLCICQQEgAkEBShshAiAAQSBqIQhBACEDAkACQANAIAMgAk8NASAIKAIAENUKIglBf0cEQCADIARqIAk6AAAgA0EBaiEDDAELCxCOCSEADAELAkACQCAALAA1BEAgBSAELAAAOgAADAEFAkAgAEEoaiEDIABBJGohCSAFQQFqIQ0CQAJAAkADQAJAIAMoAgAiCikCACEPIAkoAgAiCygCACgCECEOAkAgCyAKIAQgAiAEaiIKIAwgBSANIAcgDkEPcUHQBWoRIABBAWsOAwAEAwELIAMoAgAgDzcCACACQQhGDQMgCCgCABDVCiILQX9GDQMgCiALOgAAIAJBAWohAgwBCwsMAgsgBSAELAAAOgAADAELEI4JIQAMAQsMAgsLDAELIAEEQCAAIAUsAAAQlAk2AjAFAkADQCACQQBMDQEgBCACQX9qIgJqLAAAEJQJIAgoAgAQ4QpBf0cNAAsQjgkhAAwCCwsgBSwAABCUCSEACwsLIAYkCSAACwcAIAAQoQILDAAgABDACyAAELQOCyIBAX8gAARAIAAoAgAoAgQhASAAIAFB/wNxQbgGahEFAAsLVwEBfwJ/AkADfwJ/IAMgBEYNAkF/IAEgAkYNABpBfyABLAAAIgAgAywAACIFSA0AGiAFIABIBH9BAQUgA0EBaiEDIAFBAWohAQwCCwsLDAELIAEgAkcLCxkAIABCADcCACAAQQA2AgggACACIAMQxgsLPwEBf0EAIQADQCABIAJHBEAgASwAACAAQQR0aiIAQYCAgIB/cSIDIANBGHZyIABzIQAgAUEBaiEBDAELCyAAC7IBAQZ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBiEHIAIgASIDayIEQW9LBEAgABC5DgsgBEELSQRAIAAgBDoACwUgACAEQRBqQXBxIggQsw4iBTYCACAAIAhBgICAgHhyNgIIIAAgBDYCBCAFIQALIAIgA2shBSAAIQMDQCABIAJHBEAgAyABEJMJIAFBAWohASADQQFqIQMMAQsLIAdBADoAACAAIAVqIAcQkwkgBiQJCwwAIAAQwAsgABC0DgtXAQF/An8CQAN/An8gAyAERg0CQX8gASACRg0AGkF/IAEoAgAiACADKAIAIgVIDQAaIAUgAEgEf0EBBSADQQRqIQMgAUEEaiEBDAILCwsMAQsgASACRwsLGQAgAEIANwIAIABBADYCCCAAIAIgAxDLCwtBAQF/QQAhAANAIAEgAkcEQCABKAIAIABBBHRqIgNBgICAgH9xIQAgAyAAIABBGHZycyEAIAFBBGohAQwBCwsgAAuGAgEFfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiACIAFrQQJ1IgNB7////wNLBEAgABC5DgsgA0ECSQRAIAAgAzoACyAAIQQFAkAgA0EEakF8cSIHQf////8DTQRAIAAgB0ECdBCzDiIENgIAIAAgB0GAgICAeHI2AgggACADNgIEDAELQQgQYCEAQQAkBUHAACAAQZbbAhBaIwUhA0EAJAUgA0EBcQRAEGMhAxAAGiAAEGUgAxBqBSAAQbD4ATYCACAAQfjKAUHVARBnCwsLA0AgASACRwRAIAQgARDMCyABQQRqIQEgBEEEaiEEDAELCyAGQQA2AgAgBCAGEMwLIAUkCQsMACAAIAEoAgA2AgALDAAgABChAiAAELQOC9MEAQh/IwkhCiMJQTBqJAkjCSMKTgRAQTAQAQsgCkEoaiEHIAoiBkEgaiEIIAZBJGohCyAGQRxqIQwgBkEYaiENIAMoAgRBAXEEQAJAIAcgAxCkC0EAJAVBPSAHQaSQAxBPIQgjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAcQ2gsFAkAgBxDaCyAHIAMQpAtBACQFQT0gB0G0kAMQTyEAIwUhA0EAJAUgA0EBcQRAEGMhABAAGiAHENoLDAELIAcQ2gsgACgCACgCGCEDQQAkBSADIAYgABBaIwUhA0EAJAUgA0EBcQRAEGMhABAAGgUCQCAAKAIAKAIcIQNBACQFIAMgBkEMaiAAEFojBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAYQvQ4MAQsgDSACKAIANgIAQQAkBSAHIA0oAgA2AgBBByABIAcgBiAGQRhqIgAgCCAEQQEQUyECIwUhA0EAJAUgA0EBcQRAEGMhARAAGgNAIABBdGoiABC9DiAAIAZHDQALIAEhAAwBCyAFIAIgBkY6AAAgASgCACEJA0AgAEF0aiIAEL0OIAAgBkcNAAsMBAsLCwsgABBqCwUgCEF/NgIAIAAoAgAoAhAhCSALIAEoAgA2AgAgDCACKAIANgIAIAYgCygCADYCACAHIAwoAgA2AgAgASAAIAYgByADIAQgCCAJQT9xQYAFahEhADYCAAJAAkACQAJAIAgoAgAOAgABAgsgBUEAOgAADAILIAVBAToAAAwBCyAFQQE6AAAgBEEENgIACyABKAIAIQkLIAokCSAJC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQ+wshACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEPkLIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRD3CyEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQ9gshACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEPQLIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRDuCyEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQ7AshACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEOoLIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRDlCyEAIAYkCSAAC8QLARJ/IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcABaiESIAlBoAFqIRMgCUHQAWohCCAJQcwBaiEKIAkhDiAJQcgBaiEUIAlBxAFqIRUgCUHcAWoiC0IANwIAIAtBADYCCEEAIQADQCAAQQNHBEAgAEECdCALakEANgIAIABBAWohAAwBCwsgCCADEKQLQQAkBUE9IAhBpJADEE8hACMFIQNBACQFAkACQCADQQFxDQAgACgCACgCICEDQQAkBSADIABBkK4BQaquASATEFEaIwUhAEEAJAUgAEEBcQ0AIAgQ2gsgCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiIMLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAogCCgCACAIIAwsAABBAEgbIgA2AgAgFCAONgIAIBVBADYCACAIQQRqIRYgCEEIaiEXIAEoAgAiAyEPAn8CQAJAA0ACQCADBH8gAygCDCIGIAMoAhBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhB0EAJAUgB0EBcQ0CBSAGLAAAEJQJIQYLIAYQjgkQkAkEfyABQQA2AgBBACEDQQAhD0EBBUEACwVBACEDQQAhD0EBCyENAkACQCACKAIAIgZFDQAgBigCDCIHIAYoAhBGBEAgBigCACgCJCEHQQAkBSAHIAYQTiEHIwUhEEEAJAUgEEEBcQ0DBSAHLAAAEJQJIQcLIAcQjgkQkAkEQCACQQA2AgAMAQUgDUUNBgsMAQsgDQR/QQAhBgwFBUEACyEGCyAKKAIAIAAgFigCACAMLAAAIgdB/wFxIAdBAEgbIgdqRgRAQQAkBUEWIAggB0EBdEEAEFsjBSEAQQAkBSAAQQFxDQMgDCwAAEEASAR/IBcoAgBB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgCiAHIAgoAgAgCCAMLAAAQQBIGyIAajYCAAsgA0EMaiINKAIAIgcgA0EQaiIQKAIARgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIRFBACQFIBFBAXENAQUgBywAABCUCSEHC0EAJAVBASAHQf8BcUEQIAAgCiAVQQAgCyAOIBQgExBVIQcjBSERQQAkBSARQQFxDQAgBw0DIA0oAgAiBiAQKAIARgRAIAMoAgAoAighBkEAJAUgBiADEE4aIwUhBkEAJAUgBkEBcQ0BBSANIAZBAWo2AgAgBiwAABCUCRoLDAELCxBjIQAQAAwCCxBjIQAQAAwBCyAKKAIAIABrIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXFFBEACQCAMLAAAIQAgCCgCACEOQQAkBUEYEE0hByMFIQpBACQFIApBAXFFBEBBACQFIBIgBTYCAEEJIA4gCCAAQQBIGyAHQe7JAiASEFEhACMFIQVBACQFIAVBAXFFBEAgAEEBRwRAIARBBDYCAAsgAwR/IAMoAgwiACADKAIQRgRAIA8oAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENBAUgACwAABCUCSEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAZFDQAgBigCDCIAIAYoAhBGBEAgBigCACgCJCEAQQAkBSAAIAYQTiEAIwUhBUEAJAUgBUEBcQ0GBSAALAAAEJQJIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gCxC9DiAJJAkgAA8LCwsLEGMhABAACxoLIAgQvQ4MAQsQYyEAEAAaIAgQ2gsLIAsQvQ4gABBqQQALDwAgACgCACABEN4LEN8LCz4BAn8gACgCACIAQQRqIgIoAgAhASACIAFBf2o2AgAgAUUEQCAAKAIAKAIIIQEgACABQf8DcUG4BmoRBQALC6cDAQN/An8CQCACIAMoAgAiCkYiC0UNACAJLQAYIABB/wFxRiIMRQRAIAktABkgAEH/AXFHDQELIAMgAkEBajYCACACQStBLSAMGzoAACAEQQA2AgBBAAwBCyAAQf8BcSAFQf8BcUYgBigCBCAGLAALIgZB/wFxIAZBAEgbQQBHcQRAQQAgCCgCACIAIAdrQaABTg0BGiAEKAIAIQEgCCAAQQRqNgIAIAAgATYCACAEQQA2AgBBAAwBCyAJQRpqIQdBACEFA38CfyAFIAlqIQYgByAFQRpGDQAaIAVBAWohBSAGLQAAIABB/wFxRw0BIAYLCyAJayIAQRdKBH9BfwUCQAJAAkAgAUEIaw4JAAIAAgICAgIBAgtBfyAAIAFODQMaDAELIABBFk4EQEF/IAsNAxpBfyAKIAJrQQNODQMaQX8gCkF/aiwAAEEwRw0DGiAEQQA2AgAgAEGQrgFqLAAAIQAgAyAKQQFqNgIAIAogADoAAEEADAMLCyAAQZCuAWosAAAhACADIApBAWo2AgAgCiAAOgAAIAQgBCgCAEEBajYCAEEACwsLNABBiP4CLAAARQRAQYj+AhD+DgRAQayQA0H/////B0HxyQJBABDMCjYCAAsLQayQAygCAAtFAQF/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCADNgIAIAEQ1AohASAAIAIgBBCbCiEAIAEEQCABENQKGgsgBCQJIAALgwEBBH8jCSEBIwlBMGokCSMJIwpOBEBBMBABCyABQRhqIQQgAUEQaiICQaICNgIAIAJBADYCBCABQSBqIgMgAikCADcCACABIgIgAyAAEOILIAAoAgBBf0cEQCADIAI2AgAgBCADNgIAIAAgBEGjAhCxDgsgACgCBEF/aiEAIAEkCSAACzQBAX8gACABEOALBEAgACgCCCABQQJ0aigCAA8FQQQQYCICEP0OIAJBiMsBQdoBEGcLQQALKQAgACgCDCAAKAIIIgBrQQJ1IAFLBH8gAUECdCAAaigCAEEARwVBAAsLIQEBf0GwkANBsJADKAIAIgFBAWo2AgAgACABQQFqNgIECycBAX8gASgCACEDIAEoAgQhASAAIAI2AgAgACADNgIEIAAgATYCCAsNACAAKAIAKAIAEOQLC0EBAn8gACgCBCEBIAAoAgAgACgCCCICQQF1aiEAIAJBAXEEQCABIAAoAgBqKAIAIQELIAAgAUH/A3FBuAZqEQUAC/MKAhZ/AXwjCSEJIwlB8AFqJAkjCSMKTgRAQfABEAELIAlByAFqIQwgCSEQIAlBxAFqIQ0gCUHAAWohESAJQeUBaiESIAlB5AFqIRUgCUHYAWoiCiADIAlBoAFqIhYgCUHnAWoiFyAJQeYBaiIYEOYLIAlBzAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgEkEBOgAAIBVBxQA6AAAgCEEEaiEZIAhBCGohGiABKAIAIgMhEwJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCUCSEHCyAHEI4JEJAJBH8gAUEANgIAQQAhA0EAIRNBAQVBAAsFQQAhA0EAIRNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRRBACQFIBRBAXENAwUgBiwAABCUCSEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBkoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAaKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiFCgCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQlAkhBgsgFywAACEPIBgsAAAhG0EAJAVBASAGQf8BcSASIBUgACAMIA8gGyAKIBAgDSARIBYQVyEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgFCgCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQFqNgIAIAcsAAAQlAkaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBtFIBIsAABFckUEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQMgACAGIAQQSyEcIwUhAEEAJAUgAEEBcUUEQAJAIAUgHDkDACANKAIAIQBBACQFQRwgCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEygCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEJQJIQALIAAQjgkQkAkEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQlAkhAAsgABCOCRCQCQRAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBC9DiAKEL0OIAkkCSAADwsLCxBjIQAQABoLCyAIEL0OIAoQvQ4gABBqQQALvgIBA38jCSEHIwlBEGokCSMJIwpOBEBBEBABCyAHIgYgARCkC0EAJAVBPSAGQaSQAxBPIQEjBSEFQQAkBQJAAkAgBUEBcQ0AIAEoAgAoAiAhBUEAJAUgBSABQZCuAUGwrgEgAhBRGiMFIQFBACQFIAFBAXENAEEAJAVBPSAGQbSQAxBPIQEjBSECQQAkBSACQQFxRQRAIAEoAgAoAgwhAkEAJAUgAiABEE4hAiMFIQVBACQFIAVBAXFFBEAgAyACOgAAIAEoAgAoAhAhAkEAJAUgAiABEE4hAiMFIQNBACQFIANBAXFFBEAgBCACOgAAIAEoAgAoAhQhAkEAJAUgAiAAIAEQWiMFIQBBACQFIABBAXFFBEAgBhDaCyAHJAkPCwsLCxBjIQAQABoMAQsQYyEAEAAaCyAGENoLIAAQagvXBAEBfyAAQf8BcSAFQf8BcUYEfyABLAAABH8gAUEAOgAAIAQgBCgCACIAQQFqNgIAIABBLjoAACAHKAIEIAcsAAsiAEH/AXEgAEEASBsEfyAJKAIAIgAgCGtBoAFIBH8gCigCACEBIAkgAEEEajYCACAAIAE2AgBBAAVBAAsFQQALBUF/CwUCfyAAQf8BcSAGQf8BcUYEQCAHKAIEIAcsAAsiBUH/AXEgBUEASBsEQEF/IAEsAABFDQIaQQAgCSgCACIAIAhrQaABTg0CGiAKKAIAIQEgCSAAQQRqNgIAIAAgATYCACAKQQA2AgBBAAwCCwsgC0EgaiEMQQAhBQN/An8gBSALaiEGIAwgBUEgRg0AGiAFQQFqIQUgBi0AACAAQf8BcUcNASAGCwsgC2siBUEfSgR/QX8FIAVBkK4BaiwAACEAAkACQAJAIAVBFmsOBAEBAAACCyAEKAIAIgEgA0cEQEF/IAFBf2osAABB3wBxIAIsAABB/wBxRw0EGgsgBCABQQFqNgIAIAEgADoAAEEADAMLIAJB0AA6AAAgBCAEKAIAIgFBAWo2AgAgASAAOgAAQQAMAgsgAEHfAHEiAyACLAAARgRAIAIgA0GAAXI6AAAgASwAAARAIAFBADoAACAHKAIEIAcsAAsiAUH/AXEgAUEASBsEQCAJKAIAIgEgCGtBoAFIBEAgCigCACECIAkgAUEEajYCACABIAI2AgALCwsLIAQgBCgCACIBQQFqNgIAIAEgADoAAEEAIAVBFUoNARogCiAKKAIAQQFqNgIAQQALCwsLoQECA38BfCMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCAAIAFGBEAgAkEENgIARAAAAAAAAAAAIQYFEP4JKAIAIQUQ/glBADYCACAAIAQQ3AsQ7AohBhD+CSgCACIARQRAEP4JIAU2AgALAkACQCABIAQoAgBGBEAgAEEiRg0BBUQAAAAAAAAAACEGDAELDAELIAJBBDYCAAsLIAMkCSAGC6ACAQV/IABBBGoiBigCACIHIABBC2oiCCwAACIEQf8BcSIFIARBAEgbBEACQCABIAJHBEAgAiEEIAEhBQNAIAUgBEF8aiIESQRAIAUoAgAhByAFIAQoAgA2AgAgBCAHNgIAIAVBBGohBQwBCwsgCCwAACIEQf8BcSEFIAYoAgAhBwsgAkF8aiEGIAAoAgAgACAEQRh0QRh1QQBIIgIbIgAgByAFIAIbaiEFAkACQANAAkAgACwAACICQQBKIAJB/wBHcSEEIAEgBk8NACAEBEAgASgCACACRw0DCyABQQRqIQEgAEEBaiAAIAUgAGtBAUobIQAMAQsLDAELIANBBDYCAAwBCyAEBEAgBigCAEF/aiACTwRAIANBBDYCAAsLCwsL8woCFn8BfCMJIQkjCUHwAWokCSMJIwpOBEBB8AEQAQsgCUHIAWohDCAJIRAgCUHEAWohDSAJQcABaiERIAlB5QFqIRIgCUHkAWohFSAJQdgBaiIKIAMgCUGgAWoiFiAJQecBaiIXIAlB5gFqIhgQ5gsgCUHMAWoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACASQQE6AAAgFUHFADoAACAIQQRqIRkgCEEIaiEaIAEoAgAiAyETAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHLAAAEJQJIQcLIAcQjgkQkAkEfyABQQA2AgBBACEDQQAhE0EBBUEACwVBACEDQQAhE0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhFEEAJAUgFEEBcQ0DBSAGLAAAEJQJIQYLIAYQjgkQkAkEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgGSgCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUEWIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBooAgBB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiIUKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBiwAABCUCSEGCyAXLAAAIQ8gGCwAACEbQQAkBUEBIAZB/wFxIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBAWo2AgAgBywAABCUCRoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBBCAAIAYgBBBLIRwjBSEAQQAkBSAAQQFxRQRAAkAgBSAcOQMAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCATKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAsAAAQlAkhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACwAABCUCSEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAuhAQIDfwF8IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAyEEIAAgAUYEQCACQQQ2AgBEAAAAAAAAAAAhBgUQ/gkoAgAhBRD+CUEANgIAIAAgBBDcCxDrCiEGEP4JKAIAIgBFBEAQ/gkgBTYCAAsCQAJAIAEgBCgCAEYEQCAAQSJGDQEFRAAAAAAAAAAAIQYMAQsMAQsgAkEENgIACwsgAyQJIAYL9AoCFn8BfSMJIQkjCUHwAWokCSMJIwpOBEBB8AEQAQsgCUHIAWohDCAJIRAgCUHEAWohDSAJQcABaiERIAlB5QFqIRIgCUHkAWohFSAJQdgBaiIKIAMgCUGgAWoiFiAJQecBaiIXIAlB5gFqIhgQ5gsgCUHMAWoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACASQQE6AAAgFUHFADoAACAIQQRqIRkgCEEIaiEaIAEoAgAiAyETAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHLAAAEJQJIQcLIAcQjgkQkAkEfyABQQA2AgBBACEDQQAhE0EBBUEACwVBACEDQQAhE0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhFEEAJAUgFEEBcQ0DBSAGLAAAEJQJIQYLIAYQjgkQkAkEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgGSgCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUEWIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBooAgBB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiIUKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBiwAABCUCSEGCyAXLAAAIQ8gGCwAACEbQQAkBUEBIAZB/wFxIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBAWo2AgAgBywAABCUCRoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBASAAIAYgBBBMtiEcIwUhAEEAJAUgAEEBcUUEQAJAIAUgHDgCACANKAIAIQBBACQFQRwgCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEygCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEJQJIQALIAAQjgkQkAkEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQlAkhAAsgABCOCRCQCQRAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBC9DiAKEL0OIAkkCSAADwsLCxBjIQAQABoLCyAIEL0OIAoQvQ4gABBqQQALmQECA38BfSMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCAAIAFGBEAgAkEENgIAQwAAAAAhBgUQ/gkoAgAhBRD+CUEANgIAIAAgBBDcCxDqCiEGEP4JKAIAIgBFBEAQ/gkgBTYCAAsCQAJAIAEgBCgCAEYEQCAAQSJGDQEFQwAAAAAhBgwBCwwBCyACQQQ2AgALCyADJAkgBgvJCgITfwF+IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxDvCyEUIAAgAyAJQaABahDwCyEVIAlB1AFqIgogAyAJQeABaiIWEPELIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCUCSEHCyAHEI4JEJAJBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCUCSEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQlAkhBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEJQJGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEBIAAgBiAEIBQQohAhGSMFIQBBACQFIABBAXFFBEACQCAFIBk3AwAgDSgCACEAQQAkBUEcIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACwAABCUCSEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAALAAAEJQJIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gChC9DiAJJAkgAA8LCwsQYyEAEAAaCwsgCBC9DiAKEL0OIAAQakEAC2wAAn8CQAJAAkACQCAAKAIEQcoAcQ5BAgMDAwMDAwMBAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwADC0EIDAMLQRAMAgtBAAwBC0EKCwsLACAAIAEgAhDzCwu0AQEEfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUiBCABEKQLQQAkBUE9IARBtJADEE8hASMFIQNBACQFIANBAXFFBEAgASgCACgCECEDQQAkBSADIAEQTiEDIwUhBkEAJAUgBkEBcUUEQCACIAM6AAAgASgCACgCFCECQQAkBSACIAAgARBaIwUhAEEAJAUgAEEBcUUEQCAEENoLIAUkCQ8LCwsQYyEAEAAaIAQQ2gsgABBqC7cBAgN/AX4jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAEIQUgACABRgRAIAJBBDYCAEIAIQcFAkAgACwAAEEtRgRAIAJBBDYCAEIAIQcMAQsQ/gkoAgAhBhD+CUEANgIAIAAgBSADENwLENgKIQcQ/gkoAgAiAEUEQBD+CSAGNgIACwJAAkAgASAFKAIARgRAIABBIkYEQEJ/IQcMAgsFQgAhBwwBCwwBCyACQQQ2AgALCwsgBCQJIAcLBgBBkK4BC8YKARN/IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxDvCyEUIAAgAyAJQaABahDwCyEVIAlB1AFqIgogAyAJQeABaiIWEPELIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCUCSEHCyAHEI4JEJAJBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCUCSEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQlAkhBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEJQJGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEKIAAgBiAEIBQQUSEAIwUhBkEAJAUgBkEBcUUEQAJAIAUgADYCACANKAIAIQBBACQFQRwgCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEigCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEJQJIQALIAAQjgkQkAkEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQlAkhAAsgABCOCRCQCQRAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBC9DiAKEL0OIAkkCSAADwsLCxBjIQAQABoLCyAIEL0OIAoQvQ4gABBqQQALugECA38BfiMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSAAIAFGBH8gAkEENgIAQQAFAn8gACwAAEEtRgRAIAJBBDYCAEEADAELEP4JKAIAIQYQ/glBADYCACAAIAUgAxDcCxDYCiEHEP4JKAIAIgBFBEAQ/gkgBjYCAAsgASAFKAIARgR/IABBIkYgB0L/////D1ZyBH8gAkEENgIAQX8FIAenCwUgAkEENgIAQQALCwshACAEJAkgAAvGCgETfyMJIQkjCUHwAWokCSMJIwpOBEBB8AEQAQsgCUHEAWohDCAJIRAgCUHAAWohDSAJQbwBaiERIAMQ7wshFCAAIAMgCUGgAWoQ8AshFSAJQdQBaiIKIAMgCUHgAWoiFhDxCyAJQcgBaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIAhBBGohFyAIQQhqIRggASgCACIDIRICQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcsAAAQlAkhBwsgBxCOCRCQCQR/IAFBADYCAEEAIRJBACEDQQEFQQALBUEAIRJBACEDQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSETQQAkBSATQQFxDQMFIAYsAAAQlAkhBgsgBhCOCRCQCQRAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAXKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRYgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGCgCAEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhMoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGLAAAEJQJIQYLIBYsAAAhD0EAJAVBASAGQf8BcSAUIAAgDCARIA8gCiAQIA0gFRBVIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByATKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBAWo2AgAgBywAABCUCRoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIGwRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBCyAAIAYgBCAUEFEhACMFIQZBACQFIAZBAXFFBEACQCAFIAA2AgAgDSgCACEAQQAkBUEcIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACwAABCUCSEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAALAAAEJQJIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gChC9DiAJJAkgAA8LCwsQYyEAEAAaCwsgCBC9DiAKEL0OIAAQakEAC8YKARN/IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxDvCyEUIAAgAyAJQaABahDwCyEVIAlB1AFqIgogAyAJQeABaiIWEPELIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCUCSEHCyAHEI4JEJAJBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCUCSEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQlAkhBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEJQJGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEMIAAgBiAEIBQQUSEAIwUhBkEAJAUgBkEBcUUEQAJAIAUgADsBACANKAIAIQBBACQFQRwgCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEigCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEJQJIQALIAAQjgkQkAkEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQlAkhAAsgABCOCRCQCQRAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBC9DiAKEL0OIAkkCSAADwsLCxBjIQAQABoLCyAIEL0OIAoQvQ4gABBqQQALvQECA38BfiMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSAAIAFGBH8gAkEENgIAQQAFAn8gACwAAEEtRgRAIAJBBDYCAEEADAELEP4JKAIAIQYQ/glBADYCACAAIAUgAxDcCxDYCiEHEP4JKAIAIgBFBEAQ/gkgBjYCAAsgASAFKAIARgR/IABBIkYgB0L//wNWcgR/IAJBBDYCAEF/BSAHp0H//wNxCwUgAkEENgIAQQALCwshACAEJAkgAAvJCgITfwF+IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxDvCyEUIAAgAyAJQaABahDwCyEVIAlB1AFqIgogAyAJQeABaiIWEPELIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCUCSEHCyAHEI4JEJAJBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCUCSEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQlAkhBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEJQJGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUECIAAgBiAEIBQQohAhGSMFIQBBACQFIABBAXFFBEACQCAFIBk3AwAgDSgCACEAQQAkBUEcIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACwAABCUCSEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAALAAAEJQJIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gChC9DiAJJAkgAA8LCwsQYyEAEAAaCwsgCBC9DiAKEL0OIAAQakEAC7EBAgN/AX4jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAEIQUgACABRgRAIAJBBDYCAEIAIQcFEP4JKAIAIQYQ/glBADYCACAAIAUgAxDcCxDZCiEHEP4JKAIAIgBFBEAQ/gkgBjYCAAsgASAFKAIARgRAIABBIkYEQCACQQQ2AgBC////////////AEKAgICAgICAgIB/IAdCAFUbIQcLBSACQQQ2AgBCACEHCwsgBCQJIAcLxgoBE38jCSEJIwlB8AFqJAkjCSMKTgRAQfABEAELIAlBxAFqIQwgCSEQIAlBwAFqIQ0gCUG8AWohESADEO8LIRQgACADIAlBoAFqEPALIRUgCUHUAWoiCiADIAlB4AFqIhYQ8QsgCUHIAWoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACAIQQRqIRcgCEEIaiEYIAEoAgAiAyESAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHLAAAEJQJIQcLIAcQjgkQkAkEfyABQQA2AgBBACESQQAhA0EBBUEACwVBACESQQAhA0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhE0EAJAUgE0EBcQ0DBSAGLAAAEJQJIQYLIAYQjgkQkAkEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgFygCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUEWIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBgoAgBB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiITKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBiwAABCUCSEGCyAWLAAAIQ9BACQFQQEgBkH/AXEgFCAAIAwgESAPIAogECANIBUQVSEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgEygCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQFqNgIAIAcsAAAQlAkaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBsEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQ0gACAGIAQgFBBRIQAjBSEGQQAkBSAGQQFxRQRAAkAgBSAANgIAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAsAAAQlAkhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACwAABCUCSEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAvfAQIDfwF+IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCEFIAAgAUYEfyACQQQ2AgBBAAUQ/gkoAgAhBhD+CUEANgIAIAAgBSADENwLENkKIQcQ/gkoAgAiAEUEQBD+CSAGNgIACyABIAUoAgBGBH8CfyAAQSJGBEAgAkEENgIAQf////8HIAdCAFUNARoFAkAgB0KAgICAeFMEQCACQQQ2AgAMAQsgB6cgB0L/////B1cNAhogAkEENgIAQf////8HDAILC0GAgICAeAsFIAJBBDYCAEEACwshACAEJAkgAAv9CgEOfyMJIRMjCUHwAGokCSMJIwpOBEBB8AAQAQsgEyEMAkACQCADIAJrQQxtIghB5ABLBEAgCBD3CiIMBEAgDCEODAIFQQAkBUEEEFhBACQFEGMhABAAGgsFQQAhDgwBCwwBCyACIQcgDCEJQQAhCwNAIAMgB0cEQCAHLAALIgpBAEgEfyAHKAIEBSAKQf8BcQsEQCAJQQE6AAAFIAlBAjoAACALQQFqIQsgCEF/aiEICyAHQQxqIQcgCUEBaiEJDAELC0EAIRAgCyEJIAghCwJAAkACQAJAAkADQAJAIAAoAgAiCAR/IAgoAgwiByAIKAIQRgRAIAgoAgAoAiQhB0EAJAUgByAIEE4hCCMFIQdBACQFIAdBAXENBAUgBywAABCUCSEICyAIEI4JEJAJBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshCiABKAIAIggEfyAIKAIMIgcgCCgCEEYEQCAIKAIAKAIkIQdBACQFIAcgCBBOIQcjBSENQQAkBSANQQFxDQQFIAcsAAAQlAkhBwsgBxCOCRCQCQR/IAFBADYCAEEAIQhBAQVBAAsFQQAhCEEBCyENIAAoAgAhByAKIA1zIAtBAEdxRQ0AIAcoAgwiCCAHKAIQRgRAIAcoAgAoAiQhCEEAJAUgCCAHEE4hCCMFIQdBACQFIAdBAXENBAUgCCwAABCUCSEICyAIQf8BcSENIAZFBEAgBCgCACgCDCEIQQAkBSAIIAQgDRBPIQ0jBSEIQQAkBSAIQQFxDQQLIBBBAWohESACIQpBACEHIAwhDyAJIQgDQCADIApHBEAgDywAAEEBRgRAAkAgCkELaiIULAAAQQBIBH8gCigCAAUgCgsgEGosAAAhCSAGRQRAIAQoAgAoAgwhEkEAJAUgEiAEIAkQTyEJIwUhEkEAJAUgEkEBcQ0JCyANQf8BcSAJQf8BcUcEQCAPQQA6AAAgC0F/aiELDAELIBQsAAAiB0EASAR/IAooAgQFIAdB/wFxCyARRgR/IA9BAjoAACAIQQFqIQggC0F/aiELQQEFQQELIQcLCyAKQQxqIQogD0EBaiEPDAELCyAHBEACQCAAKAIAIgdBDGoiCigCACIJIAcoAhBGBEAgBygCACgCKCEJQQAkBSAJIAcQThojBSEHQQAkBSAHQQFxDQgFIAogCUEBajYCACAJLAAAEJQJGgsgCCALakEBSwRAIAIhByAMIQkDQCADIAdGDQIgCSwAAEECRgRAIAcsAAsiCkEASAR/IAcoAgQFIApB/wFxCyARRwRAIAlBADoAACAIQX9qIQgLCyAHQQxqIQcgCUEBaiEJDAAACwALCwsgESEQIAghCQwBCwsCQAJAIAcEQAJAIAcoAgwiBCAHKAIQRgRAIAcoAgAoAiQhBEEAJAUgBCAHEE4hBCMFIQZBACQFIAZBAXENAQUgBCwAABCUCSEECyAEEI4JEJAJBEAgAEEANgIAQQEhBAwDBSAAKAIARSEEDAMLAAsFQQEhBAwBCwwBCwJAAkACQCAIRQ0AIAgoAgwiACAIKAIQRgRAIAgoAgAoAiQhAEEAJAUgACAIEE4hACMFIQZBACQFIAZBAXENBAUgACwAABCUCSEACyAAEI4JEJAJBEAgAUEANgIADAEFIARFDQILDAILIAQNAAwBCyAFIAUoAgBBAnI2AgALAkACQANAIAIgA0YNASAMLAAAQQJHBEAgAkEMaiECIAxBAWohDAwBCwsMAQsgBSAFKAIAQQRyNgIAIAMhAgsgDgRAIA4Q+AoLIBMkCSACDwsQYyEAEAAaDAQLEGMhABAAGgwDCxBjIQAQABoMAgsQYyEAEAAaDAELEGMhABAAGgsgDgRAIA4Q+AoLCyAAEGpBAAvTBAEIfyMJIQojCUEwaiQJIwkjCk4EQEEwEAELIApBKGohByAKIgZBIGohCCAGQSRqIQsgBkEcaiEMIAZBGGohDSADKAIEQQFxBEACQCAHIAMQpAtBACQFQT0gB0HEkAMQTyEIIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAHENoLBQJAIAcQ2gsgByADEKQLQQAkBUE9IAdBzJADEE8hACMFIQNBACQFIANBAXEEQBBjIQAQABogBxDaCwwBCyAHENoLIAAoAgAoAhghA0EAJAUgAyAGIAAQWiMFIQNBACQFIANBAXEEQBBjIQAQABoFAkAgACgCACgCHCEDQQAkBSADIAZBDGogABBaIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAGEL0ODAELIA0gAigCADYCAEEAJAUgByANKAIANgIAQQggASAHIAYgBkEYaiIAIAggBEEBEFMhAiMFIQNBACQFIANBAXEEQBBjIQEQABoDQCAAQXRqIgAQvQ4gACAGRw0ACyABIQAMAQsgBSACIAZGOgAAIAEoAgAhCQNAIABBdGoiABC9DiAAIAZHDQALDAQLCwsLIAAQagsFIAhBfzYCACAAKAIAKAIQIQkgCyABKAIANgIAIAwgAigCADYCACAGIAsoAgA2AgAgByAMKAIANgIAIAEgACAGIAcgAyAEIAggCUE/cUGABWoRIQA2AgACQAJAAkACQCAIKAIADgIAAQILIAVBADoAAAwCCyAFQQE6AAAMAQsgBUEBOgAAIARBBDYCAAsgASgCACEJCyAKJAkgCQtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEJcMIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCWDCEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQlQwhACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEJQMIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCTDCEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQjwwhACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEI4MIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCNDCEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQigwhACAGJAkgAAvACwESfyMJIQkjCUGwAmokCSMJIwpOBEBBsAIQAQsgCUGIAmohEiAJQaABaiETIAlBmAJqIQggCUGUAmohCiAJIQ4gCUGQAmohFCAJQYwCaiEVIAlBpAJqIgtCADcCACALQQA2AghBACEAA0AgAEEDRwRAIABBAnQgC2pBADYCACAAQQFqIQAMAQsLIAggAxCkC0EAJAVBPSAIQcSQAxBPIQAjBSEDQQAkBQJAAkAgA0EBcQ0AIAAoAgAoAjAhA0EAJAUgAyAAQZCuAUGqrgEgExBRGiMFIQBBACQFIABBAXENACAIENoLIAhCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiDCwAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAKIAgoAgAgCCAMLAAAQQBIGyIANgIAIBQgDjYCACAVQQA2AgAgCEEEaiEWIAhBCGohFyABKAIAIgMhDwJ/AkACQANAAkAgAwR/IAMoAgwiBiADKAIQRgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQdBACQFIAdBAXENAgUgBigCABCCAiEGCyAGEI4JEJAJBH8gAUEANgIAQQAhA0EAIQ9BAQVBAAsFQQAhA0EAIQ9BAQshDQJAAkAgAigCACIGRQ0AIAYoAgwiByAGKAIQRgRAIAYoAgAoAiQhB0EAJAUgByAGEE4hByMFIRBBACQFIBBBAXENAwUgBygCABCCAiEHCyAHEI4JEJAJBEAgAkEANgIADAEFIA1FDQYLDAELIA0Ef0EAIQYMBQVBAAshBgsgCigCACAAIBYoAgAgDCwAACIHQf8BcSAHQQBIGyIHakYEQEEAJAVBFiAIIAdBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAwsAABBAEgEfyAXKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAogByAIKAIAIAggDCwAAEEASBsiAGo2AgALIANBDGoiDSgCACIHIANBEGoiECgCAEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSERQQAkBSARQQFxDQEFIAcoAgAQggIhBwtBACQFQQIgB0EQIAAgCiAVQQAgCyAOIBQgExBVIQcjBSERQQAkBSARQQFxDQAgBw0DIA0oAgAiBiAQKAIARgRAIAMoAgAoAighBkEAJAUgBiADEE4aIwUhBkEAJAUgBkEBcQ0BBSANIAZBBGo2AgAgBigCABCCAhoLDAELCxBjIQAQAAwCCxBjIQAQAAwBCyAKKAIAIABrIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXFFBEACQCAMLAAAIQAgCCgCACEOQQAkBUEYEE0hByMFIQpBACQFIApBAXFFBEBBACQFIBIgBTYCAEEJIA4gCCAAQQBIGyAHQe7JAiASEFEhACMFIQVBACQFIAVBAXFFBEAgAEEBRwRAIARBBDYCAAsgAwR/IAMoAgwiACADKAIQRgRAIA8oAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENBAUgACgCABCCAiEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAZFDQAgBigCDCIAIAYoAhBGBEAgBigCACgCJCEAQQAkBSAAIAYQTiEAIwUhBUEAJAUgBUEBcQ0GBSAAKAIAEIICIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gCxC9DiAJJAkgAA8LCwsLEGMhABAACxoLIAgQvQ4MAQsQYyEAEAAaIAgQ2gsLIAsQvQ4gABBqQQALoAMBA38CfwJAIAIgAygCACIKRiILRQ0AIAAgCSgCYEYiDEUEQCAJKAJkIABHDQELIAMgAkEBajYCACACQStBLSAMGzoAACAEQQA2AgBBAAwBCyAAIAVGIAYoAgQgBiwACyIGQf8BcSAGQQBIG0EAR3EEQEEAIAgoAgAiACAHa0GgAU4NARogBCgCACEBIAggAEEEajYCACAAIAE2AgAgBEEANgIAQQAMAQsgCUHoAGohB0EAIQUDfwJ/IAVBAnQgCWohBiAHIAVBGkYNABogBUEBaiEFIAYoAgAgAEcNASAGCwsgCWsiBUECdSEAIAVB3ABKBH9BfwUCQAJAAkAgAUEIaw4JAAIAAgICAgIBAgtBfyAAIAFODQMaDAELIAVB2ABOBEBBfyALDQMaQX8gCiACa0EDTg0DGkF/IApBf2osAABBMEcNAxogBEEANgIAIABBkK4BaiwAACEAIAMgCkEBajYCACAKIAA6AABBAAwDCwsgAEGQrgFqLAAAIQAgAyAKQQFqNgIAIAogADoAACAEIAQoAgBBAWo2AgBBAAsLC+8KAhZ/AXwjCSEJIwlB0AJqJAkjCSMKTgRAQdACEAELIAlBqAJqIQwgCSEQIAlBpAJqIQ0gCUGgAmohESAJQc0CaiESIAlBzAJqIRUgCUG4AmoiCiADIAlBoAFqIhYgCUHIAmoiFyAJQcQCaiIYEIsMIAlBrAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgEkEBOgAAIBVBxQA6AAAgCEEEaiEZIAhBCGohGiABKAIAIgMhEwJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABCCAiEHCyAHEI4JEJAJBH8gAUEANgIAQQAhA0EAIRNBAQVBAAsFQQAhA0EAIRNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRRBACQFIBRBAXENAwUgBigCABCCAiEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBkoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAaKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiFCgCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQggIhBgsgFygCACEPIBgoAgAhG0EAJAVBAiAGIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABCCAhoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBAyAAIAYgBBBLIRwjBSEAQQAkBSAAQQFxRQRAAkAgBSAcOQMAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCATKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQggIhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABCCAiEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAu+AgEDfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAciBiABEKQLQQAkBUE9IAZBxJADEE8hASMFIQVBACQFAkACQCAFQQFxDQAgASgCACgCMCEFQQAkBSAFIAFBkK4BQbCuASACEFEaIwUhAUEAJAUgAUEBcQ0AQQAkBUE9IAZBzJADEE8hASMFIQJBACQFIAJBAXFFBEAgASgCACgCDCECQQAkBSACIAEQTiECIwUhBUEAJAUgBUEBcUUEQCADIAI2AgAgASgCACgCECECQQAkBSACIAEQTiECIwUhA0EAJAUgA0EBcUUEQCAEIAI2AgAgASgCACgCFCECQQAkBSACIAAgARBaIwUhAEEAJAUgAEEBcUUEQCAGENoLIAckCQ8LCwsLEGMhABAAGgwBCxBjIQAQABoLIAYQ2gsgABBqC8QEAQF/IAAgBUYEfyABLAAABH8gAUEAOgAAIAQgBCgCACIAQQFqNgIAIABBLjoAACAHKAIEIAcsAAsiAEH/AXEgAEEASBsEfyAJKAIAIgAgCGtBoAFIBH8gCigCACEBIAkgAEEEajYCACAAIAE2AgBBAAVBAAsFQQALBUF/CwUCfyAAIAZGBEAgBygCBCAHLAALIgVB/wFxIAVBAEgbBEBBfyABLAAARQ0CGkEAIAkoAgAiACAIa0GgAU4NAhogCigCACEBIAkgAEEEajYCACAAIAE2AgAgCkEANgIAQQAMAgsLIAtBgAFqIQxBACEFA38CfyAFQQJ0IAtqIQYgDCAFQSBGDQAaIAVBAWohBSAGKAIAIABHDQEgBgsLIAtrIgBB/ABKBH9BfwUgAEECdUGQrgFqLAAAIQUCQAJAAkACQCAAQah/aiIGQQJ2IAZBHnRyDgQBAQAAAgsgBCgCACIAIANHBEBBfyAAQX9qLAAAQd8AcSACLAAAQf8AcUcNBRoLIAQgAEEBajYCACAAIAU6AABBAAwECyACQdAAOgAADAELIAVB3wBxIgMgAiwAAEYEQCACIANBgAFyOgAAIAEsAAAEQCABQQA6AAAgBygCBCAHLAALIgFB/wFxIAFBAEgbBEAgCSgCACIBIAhrQaABSARAIAooAgAhAiAJIAFBBGo2AgAgASACNgIACwsLCwsgBCAEKAIAIgFBAWo2AgAgASAFOgAAIABB1ABKBH9BAAUgCiAKKAIAQQFqNgIAQQALCwsLC+8KAhZ/AXwjCSEJIwlB0AJqJAkjCSMKTgRAQdACEAELIAlBqAJqIQwgCSEQIAlBpAJqIQ0gCUGgAmohESAJQc0CaiESIAlBzAJqIRUgCUG4AmoiCiADIAlBoAFqIhYgCUHIAmoiFyAJQcQCaiIYEIsMIAlBrAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgEkEBOgAAIBVBxQA6AAAgCEEEaiEZIAhBCGohGiABKAIAIgMhEwJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABCCAiEHCyAHEI4JEJAJBH8gAUEANgIAQQAhA0EAIRNBAQVBAAsFQQAhA0EAIRNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRRBACQFIBRBAXENAwUgBigCABCCAiEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBkoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAaKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiFCgCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQggIhBgsgFygCACEPIBgoAgAhG0EAJAVBAiAGIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABCCAhoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBBCAAIAYgBBBLIRwjBSEAQQAkBSAAQQFxRQRAAkAgBSAcOQMAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCATKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQggIhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABCCAiEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAvwCgIWfwF9IwkhCSMJQdACaiQJIwkjCk4EQEHQAhABCyAJQagCaiEMIAkhECAJQaQCaiENIAlBoAJqIREgCUHNAmohEiAJQcwCaiEVIAlBuAJqIgogAyAJQaABaiIWIAlByAJqIhcgCUHEAmoiGBCLDCAJQawCaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIBJBAToAACAVQcUAOgAAIAhBBGohGSAIQQhqIRogASgCACIDIRMCQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcoAgAQggIhBwsgBxCOCRCQCQR/IAFBADYCAEEAIQNBACETQQEFQQALBUEAIQNBACETQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSEUQQAkBSAUQQFxDQMFIAYoAgAQggIhBgsgBhCOCRCQCQRAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAZKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRYgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGigCAEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhQoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGKAIAEIICIQYLIBcoAgAhDyAYKAIAIRtBACQFQQIgBiASIBUgACAMIA8gGyAKIBAgDSARIBYQVyEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgFCgCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQRqNgIAIAcoAgAQggIaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBtFIBIsAABFckUEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQEgACAGIAQQTLYhHCMFIQBBACQFIABBAXFFBEACQCAFIBw4AgAgDSgCACEAQQAkBUEcIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBMoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACgCABCCAiEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAAKAIAEIICIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gChC9DiAJJAkgAA8LCwsQYyEAEAAaCwsgCBC9DiAKEL0OIAAQakEAC8UKAhN/AX4jCSEJIwlBsAJqJAkjCSMKTgRAQbACEAELIAlBkAJqIQwgCSEQIAlBjAJqIQ0gCUGIAmohESADEO8LIRQgACADIAlBoAFqEJAMIRUgCUGgAmoiCiADIAlBrAJqIhYQkQwgCUGUAmoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACAIQQRqIRcgCEEIaiEYIAEoAgAiAyESAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHKAIAEIICIQcLIAcQjgkQkAkEfyABQQA2AgBBACESQQAhA0EBBUEACwVBACESQQAhA0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhE0EAJAUgE0EBcQ0DBSAGKAIAEIICIQYLIAYQjgkQkAkEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgFygCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUEWIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBgoAgBB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiITKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBigCABCCAiEGCyAWKAIAIQ9BACQFQQIgBiAUIAAgDCARIA8gCiAQIA0gFRBVIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByATKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABCCAhoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIGwRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBASAAIAYgBCAUEKIQIRkjBSEAQQAkBSAAQQFxRQRAAkAgBSAZNwMAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQggIhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABCCAiEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAsLACAAIAEgAhCSDAu0AQEEfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUiBCABEKQLQQAkBUE9IARBzJADEE8hASMFIQNBACQFIANBAXFFBEAgASgCACgCECEDQQAkBSADIAEQTiEDIwUhBkEAJAUgBkEBcUUEQCACIAM2AgAgASgCACgCFCECQQAkBSACIAAgARBaIwUhAEEAJAUgAEEBcUUEQCAEENoLIAUkCQ8LCwsQYyEAEAAaIAQQ2gsgABBqC5MBAQJ/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCIAIAEQpAtBACQFQT0gAEHEkAMQTyEBIwUhA0EAJAUgA0EBcUUEQCABKAIAKAIwIQNBACQFIAMgAUGQrgFBqq4BIAIQURojBSEBQQAkBSABQQFxRQRAIAAQ2gsgBCQJIAIPCwsQYyEBEAAaIAAQ2gsgARBqQQALwgoBE38jCSEJIwlBsAJqJAkjCSMKTgRAQbACEAELIAlBkAJqIQwgCSEQIAlBjAJqIQ0gCUGIAmohESADEO8LIRQgACADIAlBoAFqEJAMIRUgCUGgAmoiCiADIAlBrAJqIhYQkQwgCUGUAmoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACAIQQRqIRcgCEEIaiEYIAEoAgAiAyESAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHKAIAEIICIQcLIAcQjgkQkAkEfyABQQA2AgBBACESQQAhA0EBBUEACwVBACESQQAhA0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhE0EAJAUgE0EBcQ0DBSAGKAIAEIICIQYLIAYQjgkQkAkEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgFygCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUEWIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBgoAgBB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiITKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBigCABCCAiEGCyAWKAIAIQ9BACQFQQIgBiAUIAAgDCARIA8gCiAQIA0gFRBVIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByATKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABCCAhoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIGwRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBCiAAIAYgBCAUEFEhACMFIQZBACQFIAZBAXFFBEACQCAFIAA2AgAgDSgCACEAQQAkBUEcIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACgCABCCAiEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAAKAIAEIICIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gChC9DiAJJAkgAA8LCwsQYyEAEAAaCwsgCBC9DiAKEL0OIAAQakEAC8IKARN/IwkhCSMJQbACaiQJIwkjCk4EQEGwAhABCyAJQZACaiEMIAkhECAJQYwCaiENIAlBiAJqIREgAxDvCyEUIAAgAyAJQaABahCQDCEVIAlBoAJqIgogAyAJQawCaiIWEJEMIAlBlAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABCCAiEHCyAHEI4JEJAJBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBigCABCCAiEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQggIhBgsgFigCACEPQQAkBUECIAYgFCAAIAwgESAPIAogECANIBUQVSEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgEygCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQRqNgIAIAcoAgAQggIaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBsEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQsgACAGIAQgFBBRIQAjBSEGQQAkBSAGQQFxRQRAAkAgBSAANgIAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQggIhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABCCAiEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAvCCgETfyMJIQkjCUGwAmokCSMJIwpOBEBBsAIQAQsgCUGQAmohDCAJIRAgCUGMAmohDSAJQYgCaiERIAMQ7wshFCAAIAMgCUGgAWoQkAwhFSAJQaACaiIKIAMgCUGsAmoiFhCRDCAJQZQCaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIAhBBGohFyAIQQhqIRggASgCACIDIRICQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcoAgAQggIhBwsgBxCOCRCQCQR/IAFBADYCAEEAIRJBACEDQQEFQQALBUEAIRJBACEDQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSETQQAkBSATQQFxDQMFIAYoAgAQggIhBgsgBhCOCRCQCQRAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAXKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRYgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGCgCAEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhMoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGKAIAEIICIQYLIBYoAgAhD0EAJAVBAiAGIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EEajYCACAHKAIAEIICGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEMIAAgBiAEIBQQUSEAIwUhBkEAJAUgBkEBcUUEQAJAIAUgADsBACANKAIAIQBBACQFQRwgCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEigCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAAKAIAEIICIQALIAAQjgkQkAkEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAoAgAQggIhAAsgABCOCRCQCQRAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBC9DiAKEL0OIAkkCSAADwsLCxBjIQAQABoLCyAIEL0OIAoQvQ4gABBqQQALxQoCE38BfiMJIQkjCUGwAmokCSMJIwpOBEBBsAIQAQsgCUGQAmohDCAJIRAgCUGMAmohDSAJQYgCaiERIAMQ7wshFCAAIAMgCUGgAWoQkAwhFSAJQaACaiIKIAMgCUGsAmoiFhCRDCAJQZQCaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIAhBBGohFyAIQQhqIRggASgCACIDIRICQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcoAgAQggIhBwsgBxCOCRCQCQR/IAFBADYCAEEAIRJBACEDQQEFQQALBUEAIRJBACEDQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSETQQAkBSATQQFxDQMFIAYoAgAQggIhBgsgBhCOCRCQCQRAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAXKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRYgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGCgCAEH/////B3FBf2oFQQoLIQBBACQFQRYgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhMoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGKAIAEIICIQYLIBYoAgAhD0EAJAVBAiAGIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EEajYCACAHKAIAEIICGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUECIAAgBiAEIBQQohAhGSMFIQBBACQFIABBAXFFBEACQCAFIBk3AwAgDSgCACEAQQAkBUEcIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACgCABCCAiEACyAAEI4JEJAJBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAAKAIAEIICIQALIAAQjgkQkAkEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQvQ4gChC9DiAJJAkgAA8LCwsQYyEAEAAaCwsgCBC9DiAKEL0OIAAQakEAC8IKARN/IwkhCSMJQbACaiQJIwkjCk4EQEGwAhABCyAJQZACaiEMIAkhECAJQYwCaiENIAlBiAJqIREgAxDvCyEUIAAgAyAJQaABahCQDCEVIAlBoAJqIgogAyAJQawCaiIWEJEMIAlBlAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUEWIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABCCAiEHCyAHEI4JEJAJBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBigCABCCAiEGCyAGEI4JEJAJBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBFiAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBFiAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQggIhBgsgFigCACEPQQAkBUECIAYgFCAAIAwgESAPIAogECANIBUQVSEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgEygCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQRqNgIAIAcoAgAQggIaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBsEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQ0gACAGIAQgFBBRIQAjBSEGQQAkBSAGQQFxRQRAAkAgBSAANgIAIA0oAgAhAEEAJAVBHCAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQggIhAAsgABCOCRCQCQR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABCCAiEACyAAEI4JEJAJBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEL0OIAoQvQ4gCSQJIAAPCwsLEGMhABAAGgsLIAgQvQ4gChC9DiAAEGpBAAv0CgEOfyMJIRMjCUHwAGokCSMJIwpOBEBB8AAQAQsgEyEMAkACQCADIAJrQQxtIghB5ABLBEAgCBD3CiIMBEAgDCEODAIFQQAkBUEEEFhBACQFEGMhABAAGgsFQQAhDgwBCwwBCyACIQcgDCEJQQAhCwNAIAMgB0cEQCAHLAALIgpBAEgEfyAHKAIEBSAKQf8BcQsEQCAJQQE6AAAFIAlBAjoAACALQQFqIQsgCEF/aiEICyAHQQxqIQcgCUEBaiEJDAELC0EAIRAgCyEJIAghCwJAAkACQAJAAkADQAJAIAAoAgAiCAR/IAgoAgwiByAIKAIQRgRAIAgoAgAoAiQhB0EAJAUgByAIEE4hCCMFIQdBACQFIAdBAXENBAUgBygCABCCAiEICyAIEI4JEJAJBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshCiABKAIAIggEfyAIKAIMIgcgCCgCEEYEQCAIKAIAKAIkIQdBACQFIAcgCBBOIQcjBSENQQAkBSANQQFxDQQFIAcoAgAQggIhBwsgBxCOCRCQCQR/IAFBADYCAEEAIQhBAQVBAAsFQQAhCEEBCyENIAAoAgAhByAKIA1zIAtBAEdxRQ0AIAcoAgwiCCAHKAIQRgRAIAcoAgAoAiQhCEEAJAUgCCAHEE4hCCMFIQdBACQFIAdBAXENBAUgCCgCABCCAiEICyAGBEAgCCENBSAEKAIAKAIcIQdBACQFIAcgBCAIEE8hDSMFIQhBACQFIAhBAXENBAsgEEEBaiERIAIhCkEAIQcgDCEPIAkhCANAIAMgCkcEQCAPLAAAQQFGBEACQCAKQQtqIhQsAABBAEgEfyAKKAIABSAKCyAQQQJ0aigCACEJIAZFBEAgBCgCACgCHCESQQAkBSASIAQgCRBPIQkjBSESQQAkBSASQQFxDQkLIAkgDUcEQCAPQQA6AAAgC0F/aiELDAELIBQsAAAiB0EASAR/IAooAgQFIAdB/wFxCyARRgR/IA9BAjoAACAIQQFqIQggC0F/aiELQQEFQQELIQcLCyAKQQxqIQogD0EBaiEPDAELCyAHBEACQCAAKAIAIgdBDGoiCigCACIJIAcoAhBGBEAgBygCACgCKCEJQQAkBSAJIAcQThojBSEHQQAkBSAHQQFxDQgFIAogCUEEajYCACAJKAIAEIICGgsgCCALakEBSwRAIAIhByAMIQkDQCADIAdGDQIgCSwAAEECRgRAIAcsAAsiCkEASAR/IAcoAgQFIApB/wFxCyARRwRAIAlBADoAACAIQX9qIQgLCyAHQQxqIQcgCUEBaiEJDAAACwALCwsgESEQIAghCQwBCwsCQAJAIAcEQAJAIAcoAgwiBCAHKAIQRgRAIAcoAgAoAiQhBEEAJAUgBCAHEE4hBCMFIQZBACQFIAZBAXENAQUgBCgCABCCAiEECyAEEI4JEJAJBEAgAEEANgIAQQEhBAwDBSAAKAIARSEEDAMLAAsFQQEhBAwBCwwBCwJAAkACQCAIRQ0AIAgoAgwiACAIKAIQRgRAIAgoAgAoAiQhAEEAJAUgACAIEE4hACMFIQZBACQFIAZBAXENBAUgACgCABCCAiEACyAAEI4JEJAJBEAgAUEANgIADAEFIARFDQILDAILIAQNAAwBCyAFIAUoAgBBAnI2AgALAkACQANAIAIgA0YNASAMLAAAQQJHBEAgAkEMaiECIAxBAWohDAwBCwsMAQsgBSAFKAIAQQRyNgIAIAMhAgsgDgRAIA4Q+AoLIBMkCSACDwsQYyEAEAAaDAQLEGMhABAAGgwDCxBjIQAQABoMAgsQYyEAEAAaDAELEGMhABAAGgsgDgRAIA4Q+AoLCyAAEGpBAAvtAwEGfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAhBBGohBSAIIQYgAigCBEEBcQRAAkAgBSACEKQLQQAkBUE9IAVBtJADEE8hACMFIQJBACQFIAJBAXEEQBBjIQAQABogBRDaCwUgBRDaCyAAKAIAIQIgBARAIAIoAhghAiAFIAAgAkH/AXFB4ApqEQEABSACKAIcIQIgBSAAIAJB/wFxQeAKahEBAAsgBUEEaiEGIAUoAgAiAiAFIAVBC2oiCSwAACIAQQBIGyEDAkADQCACIAUgAEEYdEEYdUEASCICGyAGKAIAIABB/wFxIAIbaiADRwRAIAMsAAAhAiABKAIAIgAEQCAAQRhqIgooAgAiBCAAKAIcRgRAIAAoAgAoAjQhBCACEJQJIQJBACQFIAQgACACEE8hACMFIQJBACQFIAJBAXENBAUgCiAEQQFqNgIAIAQgAjoAACACEJQJIQALIAAQjgkQkAkEQCABQQA2AgALCyADQQFqIQMgCSwAACEAIAUoAgAhAgwBCwsgASgCACEHIAUQvQ4MAgsQYyEAEAAaIAUQvQ4LIAAQagsFIAAoAgAoAhghByAGIAEoAgA2AgAgBSAGKAIANgIAIAAgBSACIAMgBEEBcSAHQR9xQdwEahEfACEHCyAIJAkgBwv8AgEKfyMJIQkjCUEgaiQJIwkjCk4EQEEgEAELIAkiAEEMaiEKIABBBGohCyAAQQhqIQwgAEEQaiIGQcvLAigAADYAACAGQc/LAi4AADsABCAGQQFqQdHLAkEBIAJBBGoiBSgCABCmDCAFKAIAQQl2QQFxIg1BDWohBRCLASEOIwkhCCMJIAUiB0EPakFwcWokCSMJIwpOBEAgB0EPakFwcRABCxDcCyEHIAAgBDYCACAIIAggBSAHIAYgABChDCAIaiIFIAIQogwhByMJIQQjCSANQQF0QRhyQX9qIgZBD2pBcHFqJAkjCSMKTgRAIAZBD2pBcHEQAQsgACACEKQLQQAkBUEBIAggByAFIAQgCiALIAAQXSMFIQVBACQFIAVBAXEEQBBjIQEQABogABDaCyABEGoFIAAQ2gsgDCABKAIANgIAIAooAgAhASALKAIAIQUgACAMKAIANgIAIAAgBCABIAUgAiADEJEJIQAgDhCKASAJJAkgAA8LQQAL7QIBCn8jCSEAIwlBIGokCSMJIwpOBEBBIBABCyAAQQhqIQUgAEEYaiELIABBEGohDCAAQRRqIQ0gACIGQiU3AwAgAEEBakHIywJBASACQQRqIgcoAgAQpgwgBygCAEEJdkEBcSIKQRdqIQcQiwEhDiMJIQkjCSAHIghBD2pBcHFqJAkjCSMKTgRAIAhBD2pBcHEQAQsQ3AshCCAFIAQ3AwAgCSAJIAcgCCAGIAUQoQwgCWoiBiACEKIMIQgjCSEHIwkgCkEBdEEsckF/aiIKQQ9qQXBxaiQJIwkjCk4EQCAKQQ9qQXBxEAELIAUgAhCkC0EAJAVBASAJIAggBiAHIAsgDCAFEF0jBSEGQQAkBSAGQQFxBEAQYyEAEAAaIAUQ2gsgABBqBSAFENoLIA0gASgCADYCACALKAIAIQEgDCgCACEGIAUgDSgCADYCACAFIAcgASAGIAIgAxCRCSEBIA4QigEgACQJIAEPC0EAC/kCAQp/IwkhCSMJQSBqJAkjCSMKTgRAQSAQAQsgCSIAQQxqIQogAEEEaiELIABBCGohDCAAQRBqIgZBy8sCKAAANgAAIAZBz8sCLgAAOwAEIAZBAWpB0csCQQAgAkEEaiIFKAIAEKYMIAUoAgBBCXZBAXEiDUEMciEFEIsBIQ4jCSEIIwkgBSIHQQ9qQXBxaiQJIwkjCk4EQCAHQQ9qQXBxEAELENwLIQcgACAENgIAIAggCCAFIAcgBiAAEKEMIAhqIgUgAhCiDCEHIwkhBCMJIA1BAXRBFXIiBkEPakFwcWokCSMJIwpOBEAgBkEPakFwcRABCyAAIAIQpAtBACQFQQEgCCAHIAUgBCAKIAsgABBdIwUhBUEAJAUgBUEBcQRAEGMhARAAGiAAENoLIAEQagUgABDaCyAMIAEoAgA2AgAgCigCACEBIAsoAgAhBSAAIAwoAgA2AgAgACAEIAEgBSACIAMQkQkhACAOEIoBIAkkCSAADwtBAAvtAgEKfyMJIQAjCUEgaiQJIwkjCk4EQEEgEAELIABBCGohBSAAQRhqIQsgAEEQaiEMIABBFGohDSAAIgZCJTcDACAAQQFqQcjLAkEAIAJBBGoiBygCABCmDCAHKAIAQQl2QQFxQRZyIgpBAWohBxCLASEOIwkhCSMJIAciCEEPakFwcWokCSMJIwpOBEAgCEEPakFwcRABCxDcCyEIIAUgBDcDACAJIAkgByAIIAYgBRChDCAJaiIGIAIQogwhCCMJIQcjCSAKQQF0QX9qIgpBD2pBcHFqJAkjCSMKTgRAIApBD2pBcHEQAQsgBSACEKQLQQAkBUEBIAkgCCAGIAcgCyAMIAUQXSMFIQZBACQFIAZBAXEEQBBjIQAQABogBRDaCyAAEGoFIAUQ2gsgDSABKAIANgIAIAsoAgAhASAMKAIAIQYgBSANKAIANgIAIAUgByABIAYgAiADEJEJIQEgDhCKASAAJAkgAQ8LQQAL0wUBDn8jCSEGIwlBsAFqJAkjCSMKTgRAQbABEAELIAZBqAFqIQkgBkGQAWohDCAGQYABaiEPIAZB+ABqIQogBkHoAGohByAGIQ0gBkGgAWohECAGQZwBaiERIAZBmAFqIRIgBkHgAGoiC0IlNwMAIAtBAWpB5JMDIAIoAgQQowwhBSAGQaQBaiIOIAZBQGsiCDYCABDcCyEAAkACQCAFBH8gByACKAIINgIAIAcgBDkDCCAIQR4gACALIAcQoQwFIAogBDkDACAIQR4gACALIAoQoQwLIgBBHUoEQAJAAkAgBQRAQQAkBUEYEE0hBSMFIQBBACQFIABBAXFFBEAgAigCCCEAQQAkBSAPIAA2AgAgDyAEOQMIQQ4gDiAFIAsgDxBRIQAjBSEFQQAkBSAFQQFxRQ0CCwVBACQFQRgQTSEFIwUhAEEAJAUgAEEBcUUEQEEAJAUgDCAEOQMAQQ4gDiAFIAsgDBBRIQAjBSEFQQAkBSAFQQFxRQ0CCwsMAQsgDigCACIFBEAgBSEHDAMFQQAkBUEEEFhBACQFCwsQYyEAEAAaBUEAIQUgDigCACEHDAELDAELIAcgACAHaiIMIAIQogwhCgJAAkAgByAIRgRAQQAhCAwBBSAAQQF0EPcKIg0EQCANIQgMAgVBACQFQQQQWEEAJAUQYyEAEAAaCwsMAQsgCSACEKQLQQAkBUECIAcgCiAMIA0gECARIAkQXSMFIQBBACQFIABBAXEEQBBjIQAQABogCRDaCwUCQCAJENoLIBIgASgCADYCACAQKAIAIQogESgCACEAQQAkBSAJIBIoAgA2AgBBIyAJIA0gCiAAIAIgAxBSIQIjBSEAQQAkBSAAQQFxBEAQYyEAEAAaDAELIAEgAjYCACAIBEAgCBD4CgsgBQRAIAUQ+AoLIAYkCSACDwsLIAgEQCAIEPgKCwsgBQRAIAUQ+AoLCyAAEGpBAAvTBQEOfyMJIQYjCUGwAWokCSMJIwpOBEBBsAEQAQsgBkGoAWohCSAGQZABaiEMIAZBgAFqIQ8gBkH4AGohCiAGQegAaiEHIAYhDSAGQaABaiEQIAZBnAFqIREgBkGYAWohEiAGQeAAaiILQiU3AwAgC0EBakHGywIgAigCBBCjDCEFIAZBpAFqIg4gBkFAayIINgIAENwLIQACQAJAIAUEfyAHIAIoAgg2AgAgByAEOQMIIAhBHiAAIAsgBxChDAUgCiAEOQMAIAhBHiAAIAsgChChDAsiAEEdSgRAAkACQCAFBEBBACQFQRgQTSEFIwUhAEEAJAUgAEEBcUUEQCACKAIIIQBBACQFIA8gADYCACAPIAQ5AwhBDiAOIAUgCyAPEFEhACMFIQVBACQFIAVBAXFFDQILBUEAJAVBGBBNIQUjBSEAQQAkBSAAQQFxRQRAQQAkBSAMIAQ5AwBBDiAOIAUgCyAMEFEhACMFIQVBACQFIAVBAXFFDQILCwwBCyAOKAIAIgUEQCAFIQcMAwVBACQFQQQQWEEAJAULCxBjIQAQABoFQQAhBSAOKAIAIQcMAQsMAQsgByAAIAdqIgwgAhCiDCEKAkACQCAHIAhGBEBBACEIDAEFIABBAXQQ9woiDQRAIA0hCAwCBUEAJAVBBBBYQQAkBRBjIQAQABoLCwwBCyAJIAIQpAtBACQFQQIgByAKIAwgDSAQIBEgCRBdIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAJENoLBQJAIAkQ2gsgEiABKAIANgIAIBAoAgAhCiARKAIAIQBBACQFIAkgEigCADYCAEEjIAkgDSAKIAAgAiADEFIhAiMFIQBBACQFIABBAXEEQBBjIQAQABoMAQsgASACNgIAIAgEQCAIEPgKCyAFBEAgBRD4CgsgBiQJIAIPCwsgCARAIAgQ+AoLCyAFBEAgBRD4CgsLIAAQakEAC5oCAQh/IwkhACMJQeAAaiQJIwkjCk4EQEHgABABCyAAIQcgAEHMAGohCiAAQdAAaiIGQcDLAigAADYAACAGQcTLAi4AADsABBDcCyEIIABByABqIgUgBDYCACAAQTBqIgRBFCAIIAYgBRChDCIMIARqIQYgBCAGIAIQogwhCCAFIAIQpAtBACQFQT0gBUGkkAMQTyELIwUhCUEAJAUgCUEBcQRAEGMhABAAGiAFENoLIAAQagUgBRDaCyALKAIAKAIgIQkgCyAEIAYgByAJQQ9xQcQEahEGABogCiABKAIANgIAIAUgCigCADYCACAFIAcgByAMaiIBIAggBGsgB2ogBiAIRhsgASACIAMQkQkhASAAJAkgAQ8LQQALRwEBfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUgBDYCACACENQKIQIgACABIAMgBRDGCiEAIAIEQCACENQKGgsgBSQJIAALoAEAAkACQAJAIAIoAgRBsAFxQRh0QRh1QRBrDhEAAgICAgICAgICAgICAgICAQILAkACQCAALAAAIgJBK2sOAwABAAELIABBAWohAAwCCyACQTBGIAEgAGtBAUpxRQ0BAkAgACwAAUHYAGsOIQACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAILIABBAmohAAwBCyABIQALIAAL4QEBBH8gAkGAEHEEQCAAQSs6AAAgAEEBaiEACyACQYAIcQRAIABBIzoAACAAQQFqIQALIAJBgIABcSEDIAJBhAJxIgRBhAJGIgUEf0EABSAAQS46AAAgAEEqOgABIABBAmohAEEBCyECA0AgASwAACIGBEAgACAGOgAAIAFBAWohASAAQQFqIQAMAQsLIAACfwJAAkAgBEEEayIBBEAgAUH8AUYEQAwCBQwDCwALIANBCXZB5gBzDAILIANBCXZB5QBzDAELIANBCXYhASABQeEAcyABQecAcyAFGws6AAAgAgtFAQF/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCADNgIAIAEQ1AohASAAIAIgBBDiCiEAIAEEQCABENQKGgsgBCQJIAAL6goBDn8jCSEQIwlBEGokCSMJIwpOBEBBEBABCyAGQaSQAxDZCyEKIAZBtJADENkLIg4oAgAoAhQhBiAQIg0gDiAGQf8BcUHgCmoRAQAgBSADNgIAAkACfwJAAkAgACwAACIIQStrDgMAAQABCyAKKAIAKAIcIQZBACQFIAYgCiAIEE8hCCMFIQZBACQFIAZBAXEEQBBjIQAQABoMAwUgBSAFKAIAIgZBAWo2AgAgBiAIOgAAIABBAWoMAgsACyAACyEIAkACQAJAIAIiEiAIa0EBTA0AIAgsAABBMEcNAAJAIAhBAWoiCSwAAEHYAGsOIQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAELIAooAgAoAhwhBkEAJAUgBiAKQTAQTyEHIwUhBkEAJAUgBkEBcUUEQCAFIAUoAgAiBkEBajYCACAGIAc6AAAgCEECaiEIIAksAAAhByAKKAIAKAIcIQZBACQFIAYgCiAHEE8hByMFIQZBACQFIAZBAXFFBEAgBSAFKAIAIgZBAWo2AgAgBiAHOgAAIAghBgNAAkAgBiACTw0FIAYsAAAhC0EAJAVBGBBNIQkjBSEHQQAkBSAHQQFxDQAgCyAJENIKRQ0FIAZBAWohBgwBCwsQYyEAEAAaDAULCwwCCyAIIQYDQAJAIAYgAk8NAiAGLAAAIQtBACQFQRgQTSEJIwUhB0EAJAUgB0EBcQ0AIAsgCRDLCkUNAiAGQQFqIQYMAQsLEGMhABAAGgwCCyANQQRqIhMoAgAgDUELaiIRLAAAIgdB/wFxIAdBAEgbBH8gBiAIRwRAAkAgBiEHIAghCQNAIAkgB0F/aiIHTw0BIAksAAAhCyAJIAcsAAA6AAAgByALOgAAIAlBAWohCQwAAAsACwsgDigCACgCECEHQQAkBSAHIA4QTiEUIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwDCyAIIQtBACEHQQAhCQJAAkADQCALIAZJBEAgByANKAIAIA0gESwAAEEASBtqLAAAIgxBAEogCSAMRnEEQCAFIAUoAgAiCUEBajYCACAJIBQ6AAAgByAHIBMoAgAgESwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEJCyALLAAAIQ8gCigCACgCHCEMQQAkBSAMIAogDxBPIQ8jBSEMQQAkBSAMQQFxDQIgBSAFKAIAIgxBAWo2AgAgDCAPOgAAIAtBAWohCyAJQQFqIQkMAQsLDAELEGMhABAAGgwDCyADIAggAGtqIgcgBSgCACIIRgR/IAoFA38gByAIQX9qIghJBH8gBywAACEJIAcgCCwAADoAACAIIAk6AAAgB0EBaiEHDAEFIAoLCwsFIAUoAgAhCSAKKAIAKAIgIQdBACQFIAcgCiAIIAYgCRBRGiMFIQdBACQFIAdBAXENASAFIAUoAgAgBiAIa2o2AgAgCgshCAJAAkACQANAIAYgAkkEQCAGLAAAIglBLkYNAyAIKAIAKAIcIQdBACQFIAcgCiAJEE8hCSMFIQdBACQFIAdBAXENAiAFIAUoAgAiB0EBajYCACAHIAk6AAAgBkEBaiEGDAELCwwCCxBjIQAQABoMAwsgDigCACgCDCEIQQAkBSAIIA4QTiEHIwUhCEEAJAUgCEEBcQ0BIAUgBSgCACIIQQFqNgIAIAggBzoAACAGQQFqIQYLIAUoAgAhByAKKAIAKAIgIQhBACQFIAggCiAGIAIgBxBRGiMFIQhBACQFIAhBAXFFBEAgBSAFKAIAIBIgBmtqIgU2AgAgBCAFIAMgASAAa2ogASACRhs2AgAgDRC9DiAQJAkPCwsQYyEAEAAaCyANEL0OIAAQagvIAQEBfyADQYAQcQRAIABBKzoAACAAQQFqIQALIANBgARxBEAgAEEjOgAAIABBAWohAAsDQCABLAAAIgQEQCAAIAQ6AAAgAUEBaiEBIABBAWohAAwBCwsgAAJ/AkACQAJAIANBygBxQQhrDjkBAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgACC0HvAAwCCyADQQl2QSBxQfgAcwwBC0HkAEH1ACACGws6AAAL0gcBC38jCSEPIwlBEGokCSMJIwpOBEBBEBABCyAGQaSQAxDZCyEJIAZBtJADENkLIgooAgAoAhQhBiAPIgwgCiAGQf8BcUHgCmoRAQACQCAMQQRqIhEoAgAgDEELaiIQLAAAIgZB/wFxIAZBAEgbBEACQCAFIAM2AgACQCACAn8CQAJAIAAsAAAiBkEraw4DAAEAAQsgCSgCACgCHCEHQQAkBSAHIAkgBhBPIQYjBSEHQQAkBSAHQQFxRQRAIAUgBSgCACIHQQFqNgIAIAcgBjoAACAAQQFqDAILDAILIAALIgZrQQFKBEAgBiwAAEEwRgRAAkACQCAGQQFqIgcsAABB2ABrDiEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABCyAJKAIAKAIcIQhBACQFIAggCUEwEE8hCCMFIQtBACQFIAtBAXENAyAFIAUoAgAiC0EBajYCACALIAg6AAAgBywAACEHIAkoAgAoAhwhCEEAJAUgCCAJIAcQTyEHIwUhCEEAJAUgCEEBcQ0DIAUgBSgCACIIQQFqNgIAIAggBzoAACAGQQJqIQYLCwsgAiAGRwRAAkAgAiEHIAYhCANAIAggB0F/aiIHTw0BIAgsAAAhCyAIIAcsAAA6AAAgByALOgAAIAhBAWohCAwAAAsACwsgCigCACgCECEHQQAkBSAHIAoQTiELIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwECyAGIQhBACEHQQAhCgJAAkADQCAIIAJJBEAgByAMKAIAIAwgECwAAEEASBtqLAAAIg1BAEcgCiANRnEEQCAFIAUoAgAiCkEBajYCACAKIAs6AAAgByAHIBEoAgAgECwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEKCyAILAAAIQ0gCSgCACgCHCEOQQAkBSAOIAkgDRBPIQ0jBSEOQQAkBSAOQQFxDQIgBSAFKAIAIg5BAWo2AgAgDiANOgAAIAhBAWohCCAKQQFqIQoMAQsLDAELEGMhABAAGgwECyADIAYgAGtqIgcgBSgCACIGRgRAIAchBQwCCwNAIAcgBkF/aiIGSQRAIAcsAAAhCCAHIAYsAAA6AAAgBiAIOgAAIAdBAWohBwwBCwsgBSgCACEFDAELEGMhABAAGgwCCwUgCSgCACgCICEGQQAkBSAGIAkgACACIAMQURojBSEGQQAkBSAGQQFxBEAQYyEAEAAaDAIFIAUgAyACIABraiIFNgIACwsgBCAFIAMgASAAa2ogASACRhs2AgAgDBC9DiAPJAkPCyAMEL0OIAAQagvwAwEGfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAhBBGohBSAIIQYgAigCBEEBcQRAAkAgBSACEKQLQQAkBUE9IAVBzJADEE8hACMFIQJBACQFIAJBAXEEQBBjIQAQABogBRDaCwUgBRDaCyAAKAIAIQIgBARAIAIoAhghAiAFIAAgAkH/AXFB4ApqEQEABSACKAIcIQIgBSAAIAJB/wFxQeAKahEBAAsgBUEEaiEGIAUoAgAiAiAFIAVBC2oiCSwAACIAQQBIGyEDAkADQCAGKAIAIABB/wFxIABBGHRBGHVBAEgiABtBAnQgAiAFIAAbaiADRwRAIAMoAgAhAiABKAIAIgAEQCAAQRhqIgooAgAiBCAAKAIcRgRAIAAoAgAoAjQhBCACEIICIQJBACQFIAQgACACEE8hACMFIQJBACQFIAJBAXENBAUgCiAEQQRqNgIAIAQgAjYCACACEIICIQALIAAQjgkQkAkEQCABQQA2AgALCyADQQRqIQMgCSwAACEAIAUoAgAhAgwBCwsgASgCACEHIAUQvQ4MAgsQYyEAEAAaIAUQvQ4LIAAQagsFIAAoAgAoAhghByAGIAEoAgA2AgAgBSAGKAIANgIAIAAgBSACIAMgBEEBcSAHQR9xQdwEahEfACEHCyAIJAkgBwv/AgEKfyMJIQkjCUEgaiQJIwkjCk4EQEEgEAELIAkiAEEMaiEKIABBBGohCyAAQQhqIQwgAEEQaiIGQcvLAigAADYAACAGQc/LAi4AADsABCAGQQFqQdHLAkEBIAJBBGoiBSgCABCmDCAFKAIAQQl2QQFxIg1BDWohBRCLASEOIwkhCCMJIAUiB0EPakFwcWokCSMJIwpOBEAgB0EPakFwcRABCxDcCyEHIAAgBDYCACAIIAggBSAHIAYgABChDCAIaiIFIAIQogwhByMJIQQjCSANQQF0QRhyQX9qQQJ0IgZBD2pBcHFqJAkjCSMKTgRAIAZBD2pBcHEQAQsgACACEKQLQQAkBUEDIAggByAFIAQgCiALIAAQXSMFIQVBACQFIAVBAXEEQBBjIQEQABogABDaCyABEGoFIAAQ2gsgDCABKAIANgIAIAooAgAhASALKAIAIQUgACAMKAIANgIAIAAgBCABIAUgAiADELAMIQAgDhCKASAJJAkgAA8LQQAL8AIBCn8jCSEAIwlBIGokCSMJIwpOBEBBIBABCyAAQQhqIQUgAEEYaiELIABBEGohDCAAQRRqIQ0gACIGQiU3AwAgAEEBakHIywJBASACQQRqIgcoAgAQpgwgBygCAEEJdkEBcSIKQRdqIQcQiwEhDiMJIQkjCSAHIghBD2pBcHFqJAkjCSMKTgRAIAhBD2pBcHEQAQsQ3AshCCAFIAQ3AwAgCSAJIAcgCCAGIAUQoQwgCWoiBiACEKIMIQgjCSEHIwkgCkEBdEEsckF/akECdCIKQQ9qQXBxaiQJIwkjCk4EQCAKQQ9qQXBxEAELIAUgAhCkC0EAJAVBAyAJIAggBiAHIAsgDCAFEF0jBSEGQQAkBSAGQQFxBEAQYyEAEAAaIAUQ2gsgABBqBSAFENoLIA0gASgCADYCACALKAIAIQEgDCgCACEGIAUgDSgCADYCACAFIAcgASAGIAIgAxCwDCEBIA4QigEgACQJIAEPC0EAC/wCAQp/IwkhCSMJQSBqJAkjCSMKTgRAQSAQAQsgCSIAQQxqIQogAEEEaiELIABBCGohDCAAQRBqIgZBy8sCKAAANgAAIAZBz8sCLgAAOwAEIAZBAWpB0csCQQAgAkEEaiIFKAIAEKYMIAUoAgBBCXZBAXEiDUEMciEFEIsBIQ4jCSEIIwkgBSIHQQ9qQXBxaiQJIwkjCk4EQCAHQQ9qQXBxEAELENwLIQcgACAENgIAIAggCCAFIAcgBiAAEKEMIAhqIgUgAhCiDCEHIwkhBCMJIA1BAXRBFXJBAnQiBkEPakFwcWokCSMJIwpOBEAgBkEPakFwcRABCyAAIAIQpAtBACQFQQMgCCAHIAUgBCAKIAsgABBdIwUhBUEAJAUgBUEBcQRAEGMhARAAGiAAENoLIAEQagUgABDaCyAMIAEoAgA2AgAgCigCACEBIAsoAgAhBSAAIAwoAgA2AgAgACAEIAEgBSACIAMQsAwhACAOEIoBIAkkCSAADwtBAAvwAgEKfyMJIQAjCUEgaiQJIwkjCk4EQEEgEAELIABBCGohBSAAQRhqIQsgAEEQaiEMIABBFGohDSAAIgZCJTcDACAAQQFqQcjLAkEAIAJBBGoiBygCABCmDCAHKAIAQQl2QQFxQRZyIgpBAWohBxCLASEOIwkhCSMJIAciCEEPakFwcWokCSMJIwpOBEAgCEEPakFwcRABCxDcCyEIIAUgBDcDACAJIAkgByAIIAYgBRChDCAJaiIGIAIQogwhCCMJIQcjCSAKQQF0QX9qQQJ0IgpBD2pBcHFqJAkjCSMKTgRAIApBD2pBcHEQAQsgBSACEKQLQQAkBUEDIAkgCCAGIAcgCyAMIAUQXSMFIQZBACQFIAZBAXEEQBBjIQAQABogBRDaCyAAEGoFIAUQ2gsgDSABKAIANgIAIAsoAgAhASAMKAIAIQYgBSANKAIANgIAIAUgByABIAYgAiADELAMIQEgDhCKASAAJAkgAQ8LQQAL1AUBDn8jCSEGIwlB4AJqJAkjCSMKTgRAQeACEAELIAZB2AJqIQkgBkHAAmohDCAGQbACaiEPIAZBqAJqIQogBkGYAmohByAGIQ0gBkHQAmohECAGQcwCaiERIAZByAJqIRIgBkGQAmoiC0IlNwMAIAtBAWpB5JMDIAIoAgQQowwhBSAGQdQCaiIOIAZB8AFqIgg2AgAQ3AshAAJAAkAgBQR/IAcgAigCCDYCACAHIAQ5AwggCEEeIAAgCyAHEKEMBSAKIAQ5AwAgCEEeIAAgCyAKEKEMCyIAQR1KBEACQAJAIAUEQEEAJAVBGBBNIQUjBSEAQQAkBSAAQQFxRQRAIAIoAgghAEEAJAUgDyAANgIAIA8gBDkDCEEOIA4gBSALIA8QUSEAIwUhBUEAJAUgBUEBcUUNAgsFQQAkBUEYEE0hBSMFIQBBACQFIABBAXFFBEBBACQFIAwgBDkDAEEOIA4gBSALIAwQUSEAIwUhBUEAJAUgBUEBcUUNAgsLDAELIA4oAgAiBQRAIAUhBwwDBUEAJAVBBBBYQQAkBQsLEGMhABAAGgVBACEFIA4oAgAhBwwBCwwBCyAHIAAgB2oiDCACEKIMIQoCQAJAIAcgCEYEQEEAIQgMAQUgAEEDdBD3CiINBEAgDSEIDAIFQQAkBUEEEFhBACQFEGMhABAAGgsLDAELIAkgAhCkC0EAJAVBBCAHIAogDCANIBAgESAJEF0jBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAkQ2gsFAkAgCRDaCyASIAEoAgA2AgAgECgCACEKIBEoAgAhAEEAJAUgCSASKAIANgIAQSQgCSANIAogACACIAMQUiECIwUhAEEAJAUgAEEBcQRAEGMhABAAGgwBCyABIAI2AgAgCARAIAgQ+AoLIAUEQCAFEPgKCyAGJAkgAg8LCyAIBEAgCBD4CgsLIAUEQCAFEPgKCwsgABBqQQAL1AUBDn8jCSEGIwlB4AJqJAkjCSMKTgRAQeACEAELIAZB2AJqIQkgBkHAAmohDCAGQbACaiEPIAZBqAJqIQogBkGYAmohByAGIQ0gBkHQAmohECAGQcwCaiERIAZByAJqIRIgBkGQAmoiC0IlNwMAIAtBAWpBxssCIAIoAgQQowwhBSAGQdQCaiIOIAZB8AFqIgg2AgAQ3AshAAJAAkAgBQR/IAcgAigCCDYCACAHIAQ5AwggCEEeIAAgCyAHEKEMBSAKIAQ5AwAgCEEeIAAgCyAKEKEMCyIAQR1KBEACQAJAIAUEQEEAJAVBGBBNIQUjBSEAQQAkBSAAQQFxRQRAIAIoAgghAEEAJAUgDyAANgIAIA8gBDkDCEEOIA4gBSALIA8QUSEAIwUhBUEAJAUgBUEBcUUNAgsFQQAkBUEYEE0hBSMFIQBBACQFIABBAXFFBEBBACQFIAwgBDkDAEEOIA4gBSALIAwQUSEAIwUhBUEAJAUgBUEBcUUNAgsLDAELIA4oAgAiBQRAIAUhBwwDBUEAJAVBBBBYQQAkBQsLEGMhABAAGgVBACEFIA4oAgAhBwwBCwwBCyAHIAAgB2oiDCACEKIMIQoCQAJAIAcgCEYEQEEAIQgMAQUgAEEDdBD3CiINBEAgDSEIDAIFQQAkBUEEEFhBACQFEGMhABAAGgsLDAELIAkgAhCkC0EAJAVBBCAHIAogDCANIBAgESAJEF0jBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAkQ2gsFAkAgCRDaCyASIAEoAgA2AgAgECgCACEKIBEoAgAhAEEAJAUgCSASKAIANgIAQSQgCSANIAogACACIAMQUiECIwUhAEEAJAUgAEEBcQRAEGMhABAAGgwBCyABIAI2AgAgCARAIAgQ+AoLIAUEQCAFEPgKCyAGJAkgAg8LCyAIBEAgCBD4CgsLIAUEQCAFEPgKCwsgABBqQQALoQIBCH8jCSEAIwlB0AFqJAkjCSMKTgRAQdABEAELIAAhByAAQbwBaiEKIABBwAFqIgZBwMsCKAAANgAAIAZBxMsCLgAAOwAEENwLIQggAEG4AWoiBSAENgIAIABBoAFqIgRBFCAIIAYgBRChDCIMIARqIQYgBCAGIAIQogwhCCAFIAIQpAtBACQFQT0gBUHEkAMQTyELIwUhCUEAJAUgCUEBcQRAEGMhABAAGiAFENoLIAAQagUgBRDaCyALKAIAKAIwIQkgCyAEIAYgByAJQQ9xQcQEahEGABogCiABKAIANgIAIAUgCigCADYCACAFIAcgDEECdCAHaiIBIAggBGtBAnQgB2ogBiAIRhsgASACIAMQsAwhASAAJAkgAQ8LQQAL8gIBB38jCSEKIwlBEGokCSMJIwpOBEBBEBABCyAKIQcgACgCACIGBEACQCAEQQxqIgwoAgAiBCADIAFrQQJ1IghrQQAgBCAIShshCCACIgQgAWsiCUECdSELIAlBAEoEQCAGKAIAKAIwIQkgBiABIAsgCUE/cUGABGoRBAAgC0cEQCAAQQA2AgBBACEGDAILCyAIQQBKBEAgB0IANwIAIAdBADYCCCAHIAggBRDJDiAHKAIAIAcgBywAC0EASBshASAGKAIAKAIwIQVBACQFIAUgBiABIAgQUCEBIwUhBUEAJAUgBUEBcQRAEGMhBRAAGiAHEL0OIAUQagsgASAIRgRAIAcQvQ4FIABBADYCACAHEL0OQQAhBgwCCwsgAyAEayIDQQJ1IQEgA0EASgRAIAYoAgAoAjAhAyAGIAIgASADQT9xQYAEahEEACABRwRAIABBADYCAEEAIQYMAgsLIAxBADYCAAsFQQAhBgsgCiQJIAYLgwsBDn8jCSEQIwlBEGokCSMJIwpOBEBBEBABCyAGQcSQAxDZCyELIAZBzJADENkLIg0oAgAoAhQhBiAQIgwgDSAGQf8BcUHgCmoRAQAgBSADNgIAAkACfwJAAkAgACwAACIGQStrDgMAAQABCyALKAIAKAIsIQhBACQFIAggCyAGEE8hBiMFIQhBACQFIAhBAXEEQBBjIQAQABoMAwUgBSAFKAIAIghBBGo2AgAgCCAGNgIAIABBAWoMAgsACyAACyEGAkACQAJAIAIiEiAGa0EBTA0AIAYsAABBMEcNAAJAIAZBAWoiCCwAAEHYAGsOIQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAELIAsoAgAoAiwhB0EAJAUgByALQTAQTyEHIwUhCUEAJAUgCUEBcUUEQCAFIAUoAgAiCUEEajYCACAJIAc2AgAgBkECaiEGIAgsAAAhCCALKAIAKAIsIQdBACQFIAcgCyAIEE8hCCMFIQdBACQFIAdBAXFFBEAgBSAFKAIAIgdBBGo2AgAgByAINgIAIAYhCANAAkAgCCACTw0FIAgsAAAhB0EAJAVBGBBNIQkjBSEKQQAkBSAKQQFxDQAgByAJENIKRQ0FIAhBAWohCAwBCwsQYyEAEAAaDAULCwwCCyAGIQgDQAJAIAggAk8NAiAILAAAIQdBACQFQRgQTSEJIwUhCkEAJAUgCkEBcQ0AIAcgCRDLCkUNAiAIQQFqIQgMAQsLEGMhABAAGgwCCyAMQQRqIhMoAgAgDEELaiIRLAAAIgdB/wFxIAdBAEgbBEAgBiAIRwRAAkAgCCEHIAYhCQNAIAkgB0F/aiIHTw0BIAksAAAhCiAJIAcsAAA6AAAgByAKOgAAIAlBAWohCQwAAAsACwsgDSgCACgCECEHQQAkBSAHIA0QTiEUIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwDCyAGIQlBACEHQQAhCgJAAkADQCAJIAhJBEAgByAMKAIAIAwgESwAAEEASBtqLAAAIg5BAEogCiAORnEEQCAFIAUoAgAiCkEEajYCACAKIBQ2AgAgByAHIBMoAgAgESwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEKCyAJLAAAIQ4gCygCACgCLCEPQQAkBSAPIAsgDhBPIQ4jBSEPQQAkBSAPQQFxDQIgBSAFKAIAIg9BBGo2AgAgDyAONgIAIAlBAWohCSAKQQFqIQoMAQsLDAELEGMhABAAGgwDCyAGIABrQQJ0IANqIgkgBSgCACIKRgR/IAshByAJBSAKIQYDfyAJIAZBfGoiBkkEfyAJKAIAIQcgCSAGKAIANgIAIAYgBzYCACAJQQRqIQkMAQUgCyEHIAoLCwshBgUgBSgCACEHIAsoAgAoAjAhCUEAJAUgCSALIAYgCCAHEFEaIwUhB0EAJAUgB0EBcQ0BIAUgBSgCACAIIAZrQQJ0aiIGNgIAIAshBwsCQAJAAkADQCAIIAJJBEAgCCwAACIGQS5GDQMgBygCACgCLCEJQQAkBSAJIAsgBhBPIQkjBSEGQQAkBSAGQQFxDQIgBSAFKAIAIgpBBGoiBjYCACAKIAk2AgAgCEEBaiEIDAELCwwCCxBjIQAQABoMAwsgDSgCACgCDCEGQQAkBSAGIA0QTiEHIwUhBkEAJAUgBkEBcQ0BIAUgBSgCACIJQQRqIgY2AgAgCSAHNgIAIAhBAWohCAsgCygCACgCMCEHQQAkBSAHIAsgCCACIAYQURojBSEGQQAkBSAGQQFxRQRAIAUgBSgCACASIAhrQQJ0aiIFNgIAIAQgBSABIABrQQJ0IANqIAEgAkYbNgIAIAwQvQ4gECQJDwsLEGMhABAAGgsgDBC9DiAAEGoL2wcBC38jCSEPIwlBEGokCSMJIwpOBEBBEBABCyAGQcSQAxDZCyEJIAZBzJADENkLIgooAgAoAhQhBiAPIgwgCiAGQf8BcUHgCmoRAQACQCAMQQRqIhEoAgAgDEELaiIQLAAAIgZB/wFxIAZBAEgbBEACQCAFIAM2AgACQCACAn8CQAJAIAAsAAAiBkEraw4DAAEAAQsgCSgCACgCLCEHQQAkBSAHIAkgBhBPIQYjBSEHQQAkBSAHQQFxRQRAIAUgBSgCACIHQQRqNgIAIAcgBjYCACAAQQFqDAILDAILIAALIgZrQQFKBEAgBiwAAEEwRgRAAkACQCAGQQFqIgcsAABB2ABrDiEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABCyAJKAIAKAIsIQhBACQFIAggCUEwEE8hCCMFIQtBACQFIAtBAXENAyAFIAUoAgAiC0EEajYCACALIAg2AgAgBywAACEHIAkoAgAoAiwhCEEAJAUgCCAJIAcQTyEHIwUhCEEAJAUgCEEBcQ0DIAUgBSgCACIIQQRqNgIAIAggBzYCACAGQQJqIQYLCwsgAiAGRwRAAkAgAiEHIAYhCANAIAggB0F/aiIHTw0BIAgsAAAhCyAIIAcsAAA6AAAgByALOgAAIAhBAWohCAwAAAsACwsgCigCACgCECEHQQAkBSAHIAoQTiELIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwECyAGIQhBACEHQQAhCgJAAkADQCAIIAJJBEAgByAMKAIAIAwgECwAAEEASBtqLAAAIg1BAEcgCiANRnEEQCAFIAUoAgAiCkEEajYCACAKIAs2AgAgByAHIBEoAgAgECwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEKCyAILAAAIQ0gCSgCACgCLCEOQQAkBSAOIAkgDRBPIQ0jBSEOQQAkBSAOQQFxDQIgBSAFKAIAIg5BBGo2AgAgDiANNgIAIAhBAWohCCAKQQFqIQoMAQsLDAELEGMhABAAGgwECyAGIABrQQJ0IANqIgcgBSgCACIGRgRAIAchBQwCCwNAIAcgBkF8aiIGSQRAIAcoAgAhCCAHIAYoAgA2AgAgBiAINgIAIAdBBGohBwwBCwsgBSgCACEFDAELEGMhABAAGgwCCwUgCSgCACgCMCEGQQAkBSAGIAkgACACIAMQURojBSEGQQAkBSAGQQFxBEAQYyEAEAAaDAIFIAUgAiAAa0ECdCADaiIFNgIACwsgBCAFIAEgAGtBAnQgA2ogASACRhs2AgAgDBC9DiAPJAkPCyAMEL0OIAAQagtxAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFQdjPAkHgzwIQxQwhACAGJAkgAAu0AQEEfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIABBCGoiBigCACgCFCEIIAYgCEH/AXFBugFqEQMAIQYgB0EEaiIIIAEoAgA2AgAgByACKAIANgIAIAYoAgAgBiAGLAALIgFBAEgiAhsiCSAGKAIEIAFB/wFxIAIbaiEBIAdBCGoiAiAIKAIANgIAIAdBDGoiBiAHKAIANgIAIAAgAiAGIAMgBCAFIAkgARDFDCEAIAckCSAAC5cBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByEIIAdBBGoiBiADEKQLQQAkBUE9IAZBpJADEE8hAyMFIQlBACQFIAlBAXEEQBBjIQAQABogBhDaCyAAEGoFIAYQ2gsgCCACKAIANgIAIAYgCCgCADYCACAAIAVBGGogASAGIAQgAxDDDCABKAIAIQAgByQJIAAPC0EAC5cBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByEIIAdBBGoiBiADEKQLQQAkBUE9IAZBpJADEE8hAyMFIQlBACQFIAlBAXEEQBBjIQAQABogBhDaCyAAEGoFIAYQ2gsgCCACKAIANgIAIAYgCCgCADYCACAAIAVBEGogASAGIAQgAxDEDCABKAIAIQAgByQJIAAPC0EAC5cBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByEIIAdBBGoiBiADEKQLQQAkBUE9IAZBpJADEE8hAyMFIQlBACQFIAlBAXEEQBBjIQAQABogBhDaCyAAEGoFIAYQ2gsgCCACKAIANgIAIAYgCCgCADYCACAAIAVBFGogASAGIAQgAxDQDCABKAIAIQAgByQJIAAPC0EAC6QOASN/IwkhByMJQZABaiQJIwkjCk4EQEGQARABCyAHQfAAaiEKIAdB/ABqIQ0gB0H4AGohDiAHQfQAaiEPIAdB7ABqIRAgB0HoAGohESAHQeQAaiESIAdB4ABqIRMgB0HcAGohFCAHQdgAaiEVIAdB1ABqIRYgB0HQAGohFyAHQcwAaiEYIAdByABqIRkgB0HEAGohGiAHQUBrIRsgB0E8aiEcIAdBOGohHSAHQTRqIR4gB0EwaiEfIAdBLGohICAHQShqISEgB0EkaiEiIAdBIGohIyAHQRxqISQgB0EYaiElIAdBFGohJiAHQRBqIScgB0EMaiEoIAdBCGohKSAHQQRqISogByELIARBADYCACAHQYABaiIIIAMQpAtBACQFQT0gCEGkkAMQTyEJIwUhDEEAJAUgDEEBcQRAEGMhDBAAGiAIENoLIAwQagsgCBDaCwJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgBkEYdEEYdUElaw5VFhcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFwABFwQXBRcGBxcXFwoXFxcXDg8QFxcXExUXFxcXFxcXAAECAwMXFwEXCBcXCQsXDBcNFwsXFxESFBcLIA0gAigCADYCACAIIA0oAgA2AgAgACAFQRhqIAEgCCAEIAkQwwwMFwsgDiACKAIANgIAIAggDigCADYCACAAIAVBEGogASAIIAQgCRDEDAwWCyAAQQhqIgYoAgAoAgwhCyAGIAtB/wFxQboBahEDACEGIA8gASgCADYCACAQIAIoAgA2AgAgBigCACAGIAYsAAsiAkEASCILGyIJIAYoAgQgAkH/AXEgCxtqIQIgCiAPKAIANgIAIAggECgCADYCACABIAAgCiAIIAMgBCAFIAkgAhDFDDYCAAwVCyARIAIoAgA2AgAgCCARKAIANgIAIAAgBUEMaiABIAggBCAJEMYMDBQLIBIgASgCADYCACATIAIoAgA2AgAgCiASKAIANgIAIAggEygCADYCACABIAAgCiAIIAMgBCAFQbDPAkG4zwIQxQw2AgAMEwsgFCABKAIANgIAIBUgAigCADYCACAKIBQoAgA2AgAgCCAVKAIANgIAIAEgACAKIAggAyAEIAVBuM8CQcDPAhDFDDYCAAwSCyAWIAIoAgA2AgAgCCAWKAIANgIAIAAgBUEIaiABIAggBCAJEMcMDBELIBcgAigCADYCACAIIBcoAgA2AgAgACAFQQhqIAEgCCAEIAkQyAwMEAsgGCACKAIANgIAIAggGCgCADYCACAAIAVBHGogASAIIAQgCRDJDAwPCyAZIAIoAgA2AgAgCCAZKAIANgIAIAAgBUEQaiABIAggBCAJEMoMDA4LIBogAigCADYCACAIIBooAgA2AgAgACAFQQRqIAEgCCAEIAkQywwMDQsgGyACKAIANgIAIAggGygCADYCACAAIAEgCCAEIAkQzAwMDAsgHCACKAIANgIAIAggHCgCADYCACAAIAVBCGogASAIIAQgCRDNDAwLCyAdIAEoAgA2AgAgHiACKAIANgIAIAogHSgCADYCACAIIB4oAgA2AgAgASAAIAogCCADIAQgBUHAzwJBy88CEMUMNgIADAoLIB8gASgCADYCACAgIAIoAgA2AgAgCiAfKAIANgIAIAggICgCADYCACABIAAgCiAIIAMgBCAFQcvPAkHQzwIQxQw2AgAMCQsg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IAVB4K4BQYCvARDnDDYCAAwSCyAWIAIoAgA2AgAgCCAWKAIANgIAIAAgBUEIaiABIAggBCAJEOkMDBELIBcgAigCADYCACAIIBcoAgA2AgAgACAFQQhqIAEgCCAEIAkQ6gwMEAsgGCACKAIANgIAIAggGCgCADYCACAAIAVBHGogASAIIAQgCRDrDAwPCyAZIAIoAgA2AgAgCCAZKAIANgIAIAAgBUEQaiABIAggBCAJEOwMDA4LIBogAigCADYCACAIIBooAgA2AgAgACAFQQRqIAEgCCAEIAkQ7QwMDQsgGyACKAIANgIAIAggGygCADYCACAAIAEgCCAEIAkQ7gwMDAsgHCACKAIANgIAIAggHCgCADYCACAAIAVBCGogASAIIAQgCRDvDAwLCyAdIAEoAgA2AgAgHiACKAIANgIAIAogHSgCADYCACAIIB4oAgA2AgAgASAAIAogCCADIAQgBUGArwFBrK8BEOcMNgIADAoLIB8gASgCADYCACAgIAIoAgA2AgAgCiAfKAIANgIAIAggICgCADYCACABIAAgCiAIIAMgBCAFQbCvAUHErwEQ5ww2AgAMCQsgISACKAIANgIAIAggISgCADYCACAAIAUgASAIIAQgCRDwDAwICyAiIAEoAgA2AgAgIyACKAIANgIAIAogIigCADYCACAIICMoAgA2AgAgASAAIAogCCADIAQgBUHQrwFB8K8BEOcMNgIADAcLICQgAigCADYCACAIICQoAgA2AgAgACAFQRhqIAEgCCAEIAkQ8QwMBgsgACgCACgCFCEGICUgASgCADYCACAmIAIoAgA2AgAgCiAlKAIANgIAIAggJigCADYCACAAIAogCCADIAQgBSAGQT9xQYAFahEhAAwGCyAAQQhqIgYoAgAoAhghCyAGIAtB/wFxQboBahEDACEGICcgASgCADYCACAoIAIoAgA2AgAgBigCACAGIAYsAAsiC0EASCIJGyECIAYoAgQgC0H/AXEgCRtBAnQgAmohBiAKICcoAgA2AgAgCCAoKAIANgIAIAEgACAKIAggAyAEIAUgAiAGEOcMNgIADAQLICkgAigCADYCACAIICkoAgA2AgAgACAFQRRqIAEgCCAEIAkQ8gwMAwsgKiACKAIANgIAIAggKigCADYCACAAIAVBFGogASAIIAQgCRDzDAwCCyALIAIo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QbgBIQMMBwsLIAAoAgAiBCgCDCIKIAQoAhBGBEAgBCgCACgCJCEKQQAkBSAKIAQQTiEEIwUhCkEAJAUgCkEBcQRAQbgBIQMMBwsFIAooAgAQggIhBAsgCSAJKAIAIgpBBGo2AgAgCiAENgIAIBogGigCAEF/ajYCACAAKAIAIgRBDGoiDCgCACIKIAQoAhBGBEAgBCgCACgCKCEKQQAkBSAKIAQQThojBSEEQQAkBSAEQQFxBEBBuAEhAwwHCwUgDCAKQQRqNgIAIAooAgAQggIaCwwAAAsACwsgCSgCACAIKAIARgRAQYUCIQMMAwsMAQsDQCAAKAIAIgMEfyADKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBIyEDDAULBSAEKAIAEIICIQMLIAMQjgkQkAkEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEEAkACQCAMRQ0AIAwoAgwiAyAMKAIQRgRAIAwoAgAoAiQhA0EAJAUgAyAMEE4hAyMFIQpBACQFIApBAXEEQEEjIQMMBgsFIAMoAgAQggIhAwsgAxCOCRCQCQRAIAFBADYCAAwBBSAERQ0ECwwBCyAEDQJBACEMCyAAKAIAIgMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEjIQMMBAsFIAQoAgAQggIhAwsgBygCACgCDCEEQQAkBSAEIAdBgMAAIAMQUCEDIwUhBEEAJAUgBEEBcQRAQSMhAwwDCyADRQ0BIAAoAgAiA0EMaiIKKAIAIgQgAygCEEYEQCADKAIAKAIoIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBIyEDDAQLBSAKIARBBGo2AgAgBCgCABCCAiEDC0EAJAVBngEgEiADEFojBSEDQQAkBSADQQFxRQ0AC0EjIQMMAQsgFEEBaiEUDAELCwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCADQSNrDuUBAAERERERERERERERERERAhERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERAxERERERERERERERBBEREREREREREREREREREREREREREREREREREREREQUGEREHEREREREREREREREREREREREREREREREICQoRCxERERERERERERERERERERERERERERERERERERERERERERERDBERERERERERERERERERERERERERERERERENEREREREREREREQ4RDxELEGMhERAAGgwRCxBjIREQABoMEAsgBSAFKAIAQQRyNgIAQQAhAAwNCyAFIAUoAgBBBHI2AgBBACEADAwLEGMhERAAGgwNCxBjIREQABoMDAsQYyEREAAaDAsLIAUgBSgCAEEEcjYCAEEAIQAMCAsQYyEREAAaDAkLEGMhERAAGgwICxBjIREQABoMBwsQYyEREAAaDAYLIAUgBSgCAEEEcjYCAEEAIQAMAwsgBSAFKAIAQQRyNgIAQQAhAAwCCyAFIAUoAgBBBHI2AgBBACEADAELIAIEQAJAIAJBC2ohByACQQRqIQhBASEGAkADQAJAIAYgBywAACIDQQBIBH8gCCgCAAUgA0H/AXELTw0DIAAoAgAiAwR/IAMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXENBAUgBCgCABCCAiEDCyADEI4JEJAJBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBAJAAkAgASgCACIDRQ0AIAMoAgwiCSADKAIQRgRAIAMoAgAoAiQhCUEAJAUgCSADEE4hAyMFIQlBACQFIAlBAXENBQUgCSgCABCCAiEDCyADEI4JEJAJBEAgAUEANgIADAEFIARFDQMLDAELIAQNAQsgACgCACIDKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxDQMFIAQoAgAQggIhAwsgBywAAEEASAR/IAIoAgAFIAILIAZBAnRqKAIAIANHDQAgACgCACIDQQxqIgkoAgAiBCADKAIQRgRAIAMoAgAoAighBEEAJAUgBCADEE4aIwUhA0EAJAUgA0EBcQ0DBSAJIARBBGo2AgAgBCgCABCCAhoLIAZBAWohBgwBCwsgBSAFKAIAQQRyNgIAQQAhAAwDCxBjIREQABoMBAsLIBMoAgAiACAVKAIAIgFGBEBBASEAAQUgIUEANgIAQQAkBUEcIBcgACABICEQXCMFIQBBACQFIABBAXEEQBBjIREQ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AWohAQwBCwsgAgsIABCBCigCAAsIABCLCigCAAsIABCICigCAAsYACAAQfTzATYCACAAQQxqEL0OIAAQoQILDAAgABDEDSAAELQOCwcAIAAsAAgLBwAgACwACQsMACAAIAFBDGoQug4LIAAgAEIANwIAIABBADYCCCAAQaPaAkGj2gIQjwkQuw4LIAAgAEIANwIAIABBADYCCCAAQZ3aAkGd2gIQjwkQuw4LGAAgAEGc9AE2AgAgAEEQahC9DiAAEKECCwwAIAAQyw0gABC0DgsHACAAKAIICwcAIAAoAgwLDAAgACABQRBqELoOCyAAIABCADcCACAAQQA2AgggAEHU9AFB1PQBEOEMEMgOCyAAIABCADcCACAAQQA2AgggAEG89AFBvPQBEOEMEMgOCyUAIAJBgAFJBH8gARDDDSACQQF0ai4BAHFB//8DcUEARwVBAAsLRgADQCABIAJHBEAgAyABKAIAQYABSQR/EMMNIQAgASgCAEEBdCAAai8BAAVBAAs7AQAgA0ECaiEDIAFBBGohAQwBCwsgAgtKAANAAkAgAiADRgRAIAMhAgwBCyACKAIAQYABSQRAEMMNIQAgASACKAIAQQF0IABqLgEAcUH//wNxDQELIAJBBGohAgwBCwsgAgtKAANAAkAgAiADRgRAIAMhAgwBCyACKAIAQYABTw0AEMMNIQAgASACKAIAQQF0IABqLgEAcUH//wNxBEAgAkEEaiECDAILCwsgAgsaACABQYABSQR/EMINIAFBAnRqKAIABSABCwtCAANAIAEgAkcEQCABKAIAIgBBgAFJBEAQwg0hACABKAIAQQJ0IABqKAIAIQALIAEgADYCACABQQRqIQEMAQsLIAILGgAgAUGAAUkEfxDBDSABQQJ0aigCAAUgAQsLQgADQCABIAJHBEAgASgCACIAQYABSQRAEMENIQAgASgCAEECdCAAaigCACEACyABIAA2AgAgAUEEaiEBDAELCyACCwoAIAFBGHRBGHULKQADQCABIAJHBEAgAyABLAAANgIAIANBBGohAyABQQFqIQEMAQsLIAILEQAgAUH/AXEgAiABQYABSRsLTgECfyACIAFrQQJ2IQUgASEAA0AgACACRwRAIAQgACgCACIGQf8BcSADIAZBgAFJGzoAACAEQQFqIQQgAEEEaiEADAELCyAFQQJ0IAFq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KAIMNgIMIAAgASgCEDYCECAAIAEoAhQ2AhQgACABKAIYNgIYIAAgASgCHDYCHCAAIAEoAiA2AiAgACABKAIkNgIkIAAgASgCKDYCKCAAIAEoAiw2AiwgACABKAIwNgIwIAAgASgCNDYCNCAAIAEoAjg2AjggACABKAI8NgI8IABBQGshACABQUBrIQEMAQsLA0AgACACSARAIAAgASgCADYCACAAQQRqIQAgAUEEaiEBDAELCwUgA0EEayECA0AgACACSARAIAAgASwAADoAACAAIAEsAAE6AAEgACABLAACOgACIAAgASwAAzoAAyAAQQRqIQAgAUEEaiEBDAELCwsDQCAAIANIBEAgACABLAAAOgAAIABBAWohACABQQFqIQEMAQsLIAQLYAEBfyABIABIIAAgASACakhxBEAgACEDIAEgAmohASAAIAJqIQADQCACQQBKBEAgAkEBayECIABBAWsiACABQQFrIgEsAAA6AAAMAQsLIAMhAAUgACABIAIQhQ8aCyAAC5gCAQR/IAAgAmohBCABQf8BcSEBIAJBwwBOBEADQCAAQQNxBEAgACABOgAAIABBAWohAAwBCwsgAUEIdCABciABQRB0ciABQRh0ciEDIARBfHEiBUFAaiEGA0AgACAGTARAIAAgAzYCACAAIAM2AgQgACADNgIIIAAgAzYCDCAAIAM2AhAgACADNgIUIAAgAzYCGCAAIAM2AhwgACADNgIgIAAgAzYCJCAAIAM2AiggACADNgIsIAAgAzYCMCAAIAM2AjQgACADNgI4IAAgAzYCPCAAQUBrIQAMAQsLA0AgACAFSARAIAAgAzYCACAAQQRqIQAMAQsLCwNAIAAgBEgEQCAAIAE6AAAgAEEBaiEADAELCyAEIAJrC1IBAn8gACMEKAIAIgJqIgEgAkggAEEASnEgAUEASHIEQCABEJIBGkEMEGtBfw8LIAEQhgFMBEAjBCABNgIABSABEIgBRQRAQQwQa0F/DwsLIAILEAAgASACIAMgAEEBcREVAAsXACABIAIgAyAEIAUgAEEDcUECahEUAAsPACABIABBH3FBBmoRCgALEQAgASACIABBD3FBJmoRBwALEwAgASACIAMgAEEHcUE2ahEJAAsVACABIAIgAyAEIABBB3FBPmoRCAALGgAgASACIAMgBCAFIAYgAEEDcUHGAGoRFwALHgAgASACIAMgBCAFIAYgByAIIABBAXFBygBqERkACxoAIAEgAiADIAQgBSAGIABBAXFBzABqERgACxoAIAEgAiADIAQgBSAGIABBAXFBzgBqERYACxQAIAEgAiADIABBAXFB0ABqERoACxYAIAEgAiADIAQgAEEBcUHSAGoRDgALGgAgASACIAMgBCAFIAYgAEEDcUHUAGoRHAALGAAgASACIAMgBCAFIABBAXFB2ABqEQ8ACxIAIAEgAiAAQQ9xQdoAahEbAAsUACABIAIgAyAAQQNxQeoAahEmAAsWACABIAIgAyAEIABBB3FB7gBqEScACxgAIAEgAiADIAQgBSAAQQNxQfYAahEoAAscACABIAIgAyAEIAUgBiAHIABBA3FB+gBqESkACyAAIAEgAiADIAQgBSAGIAcgCCAJIABBAXFB/gBqESoACxwAIAEgAiADIAQgBSAGIAcgAEEBcUGAAWoRKwALHAAgASACIAMgBCAFIAYgByAAQQFxQYIBahEsAAsWACABIAIgAyAEIABBAXFBhAFqES0ACxgAIAEgAiADIAQgBSAAQQFxQYYBahEuAAscACABIAIgAyAEIAUgBiAHIABBA3FBiAFqES8ACxoAIAEgAiADIAQgBSAGIABBAXFBjAFqETAACxQAIAEgAiADIABBB3FBjgFqEQwACxYAIAEgAiADIAQgAEEBcUGWAWoRMQALFAAgASACIAMgAEEBcUGYAWoRMgALDgAgAEEfcUGaAWoRAAALEQAgASAAQf8BcUG6AWoRAwALEgAgASACIABBA3FBugNqER0ACxIAIAEgAiAAQT9xQb4DahEeAAsUACABIAIgAyAAQQFxQf4DahEzAAsUACABIAIgAyAAQT9xQYAEahEEAAsWACABIAIgAyAEIABBAXFBwARqETQACxYAIAEgAiADIAQgAEEBcUHCBGoRNQALFgAgASACIAMgBCAAQQ9xQcQEahEGAAsYACABIAIgAyAEIAUgAEEHcUHUBGoRNgALGAAgASACIAMgBCAFIABBH3FB3ARqER8ACxoAIAEgAiADIAQgBSAGIABBA3FB/ARqETcACxoAIAEgAiADIAQgBSAGIABBP3FBgAVqESEACxwAIAEgAiADIAQgBSAGIAcgAEEPcUHABWoROAALHgAgASACIAMgBCAFIAYgByAIIABBD3FB0AVqESAACyIAIAEgAiADIAQgBSAGIAcgCCAJIAogAEEDcUHgBWoROQALJAAgASACIAMgBCAFIAYgByAIIAkgCiALIABBA3FB5AVqEToACyYAIAEgAiADIAQgBSAGIAcgCCAJIAogCyAMIABBA3FB6AVqETsACxgAIAEgAiADIAQgBSAAQQdxQewFahE8AAsWACABIAIgAyAEIABBA3FB9AVqET0ACw4AIABBP3FB+AVqESIACxEAIAEgAEH/A3FBuAZqEQUACxIAIAEgAiAAQR9xQbgKahELAAsUACABIAIgAyAAQQFxQdgKahETAAsWACABIAIgAyAEIABBAXFB2gpqERAACxgAIAEgAiADIAQgBSAAQQFxQdwKahERAAsaACABIAIgAyAEIAUgBiAAQQFxQd4KahESAAsTACABIAIgAEH/AXFB4ApqEQEACxQAIAEgAiADIABBD3FB4AxqEQ0ACxYAIAEgAiADIAQgAEEBcUHwDGoRPgALGAAgASACIAMgBCAFIABBAXFB8gxqET8ACxoAIAEgAiADIAQgBSAGIABBAXFB9AxqEUAACxwAIAEgAiADIAQgBSAGIAcgAEEBcUH2DGoRQQALFAAgASACIAMgAEEBcUH4DGoRQgALFAAgASACIAMgAEEfcUH6DGoRAgALFgAgASACIAMgBCAAQQNxQZoNahFDAAsWACABIAIgAyAEIABBAXFBng1qEUQACxYAIAEgAiADIAQgAEEfcUGgDWoRIwALGAAgASACIAMgBCAFIABBA3FBwA1qESUACxoAIAEgAiADIAQgBSAGIABBB3FBxA1qESQACxwAIAEgAiADIAQgBSAGIAcgAEEHcUHMDWoRRQALIgAgASACIAMgBCAFIAYgByAIIAkgCiAAQQdxQdQNahFGAAssACABIAIgAyAEIAUgBiAHIAggCSAKIAsgDCANIA4gDyAAQQNxQdwNahFHAAsYACABIAIgAyAEIAUgAEEDcUHgDWoRSAALDwBBABACRAAAAAAAAAAACw8AQQEQA0QAAAAAAAAAAAsPAEECEAREAAAAAAAAAAALDwBBAxAFRAAAAAAAAAAACw8AQQQQBkQAAAAAAAAAAAsPAEEFEAdEAAAAAAAAAAALDwBBBhAIRAAAAAAAAAAACw8AQQcQCUQAAAAAAAAAAAsPAEEIEApEAAAAAAAAAAAL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AFAAAABRAAAAUgAAAFMAAABUAAAAVQAAAFYAAABXAAAAWAAAAFkAAABaAAAAewAAAHwAAAB9AAAAfgAAAH8AQfCUAQuhAgoAAABkAAAA6AMAABAnAACghgEAQEIPAICWmAAA4fUF/////////////////////////////////////////////////////////////////wABAgMEBQYHCAn/////////CgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiP///////8KCwwNDg8QERITFBUWFxgZGhscHR4fICEiI/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8AQaCXAQsYEQAKABEREQAAAAAFAAAAAAAACQAAAAALAEHAlwELIREADwoREREDCgcAARMJCwsAAAkGCwAACwAGEQAAABEREQBB8ZcBCwELAEH6lwELGBEACgoREREACgAAAgAJCwAAAAkACwAACwBBq5gBCwEMAEG3mAELFQwAAAAADAAAAAAJDAAAAAAADAAADABB5ZgBCwEOAEHxmAELFQ0AAAAEDQAAAAAJDgAAAAAADgAADgBBn5kBCwEQAEGrmQELHg8AAAAADwAAAAAJEAAAAAAAEAAAEAAAEgAAABISEgBB4pkBCw4SAAAAEhISAAAAAAAACQBBk5oBCwELAEGfmgELFQoAAAAACgAAAAAJCwAAAAAACwAACwBBzZoBCwEMAEHZmgELfgwAAAAADAAAAAAJDAAAAAAADAAADAAAMDEyMzQ1Njc4OUFCQ0RFRlQhIhkNAQIDEUscDBAECx0SHidobm9wcWIgBQYPExQVGggWBygkFxgJCg4bHyUjg4J9JiorPD0+P0NHSk1YWVpbXF1eX2BhY2RlZmdpamtscnN0eXp7fABB4JsBC9cOSWxsZWdhbCBieXRlIHNlcXVlbmNlAERvbWFpbiBlcnJvcgBSZXN1bHQgbm90IHJlcHJlc2VudGFibGUATm90IGEgdHR5AFBlcm1pc3Npb24gZGVuaWVkAE9wZXJhdGlvbiBub3QgcGVybWl0dGVkAE5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnkATm8gc3VjaCBwcm9jZXNzAEZpbGUgZXhpc3RzAFZhbHVlIHRvbyBsYXJnZSBmb3IgZGF0YSB0eXBlAE5vIHNwYWNlIGxlZnQgb24gZGV2aWNlAE91dCBvZiBtZW1vcnkAUmVzb3VyY2UgYnVzeQBJbnRlcnJ1cHRlZCBzeXN0ZW0gY2FsbABSZXNvdXJjZSB0ZW1wb3JhcmlseSB1bmF2YWlsYWJsZQBJbnZhbGlkIHNlZWsAQ3Jvc3MtZGV2aWNlIGxpbmsAUmVhZC1vbmx5IGZpbGUgc3lzdGVtAERpcmVjdG9yeSBub3QgZW1wdHkAQ29ubmVjdGlvbiByZXNldCBieSBwZWVyAE9wZXJhdGlvbiB0aW1lZCBvdXQAQ29ubmVjdGlvbiByZWZ1c2VkAEhvc3QgaXMgZG93bgBIb3N0IGlzIHVucmVhY2hhYmxlAEFkZHJlc3MgaW4gdXNlAEJyb2tlbiBwaXBlAEkvTyBlcnJvcgBObyBzdWNoIGRldmljZSBvciBhZGRyZXNzAEJsb2NrIGRldmljZSByZXF1aXJlZABObyBzdWNoIGRldmljZQBOb3QgYSBkaXJlY3RvcnkASXMgYSBkaXJlY3RvcnkAVGV4dCBmaWxlIGJ1c3kARXhlYyBmb3JtYXQgZXJyb3IASW52YWxpZCBhcmd1bWVudABBcmd1bWVudCBsaXN0IHRvbyBsb25nAFN5bWJvbGljIGxpbmsgbG9vcABGaWxlbmFtZSB0b28gbG9uZwBUb28gbWFueSBvcGVuIGZpbGVzIGluIHN5c3RlbQBObyBmaWxlIGRlc2NyaXB0b3JzIGF2YWlsYWJsZQBCYWQgZmlsZSBkZXNjcmlwdG9yAE5vIGNoaWxkIHByb2Nlc3MAQmFkIGFkZHJlc3MARmlsZSB0b28gbGFyZ2UAVG9vIG1hbnkgbGlua3MATm8gbG9ja3MgYXZhaWxhYmxlAFJlc291cmNlIGRlYWRsb2NrIHdvdWxkIG9jY3VyAFN0YXRlIG5vdCByZWNvdmVyYWJsZQBQcmV2aW91cyBvd25lciBkaWVkAE9wZXJhdGlvbiBjYW5jZWxlZABGdW5jdGlvbiBub3QgaW1wbGVtZW50ZWQATm8gbWVzc2FnZSBvZiBkZXNpcmVkIHR5cGUASWRlbnRpZmllciByZW1vdmVkAERldmljZSBub3QgYSBzdHJlYW0ATm8gZGF0YSBhdmFpbGFibGUARGV2aWNlIHRpbWVvdXQAT3V0IG9mIHN0cmVhbXMgcmVzb3VyY2VzAExpbmsgaGFzIGJlZW4gc2V2ZXJlZABQcm90b2NvbCBlcnJvcgBCYWQgbWVzc2FnZQBGaWxlIGRlc2NyaXB0b3IgaW4gYmFkIHN0YXRlAE5vdCBhIHNvY2tldABEZXN0aW5hdGlvbiBhZGRyZXNzIHJlcXVpcmVkAE1lc3NhZ2UgdG9vIGxhcmdlAFByb3RvY29sIHdyb25nIHR5cGUgZm9yIHNvY2tldABQcm90b2NvbCBub3QgYXZhaWxhYmxlAFByb3RvY29sIG5vdCBzdXBwb3J0ZWQAU29ja2V0IHR5cGUgbm90IHN1cHBvcnRlZABOb3Qgc3VwcG9ydGVkAFByb3RvY29sIGZhbWlseSBub3Qgc3VwcG9ydGVkAEFkZHJlc3MgZmFtaWx5IG5vdCBzdXBwb3J0ZWQgYnkgcHJvdG9jb2wAQWRkcmVzcyBub3QgYXZhaWxhYmxlAE5ldHdvcmsgaXMgZG93bgBOZXR3b3JrIHVucmVhY2hhYmxlAENvbm5lY3Rpb24gcmVzZXQgYnkgbmV0d29yawBDb25uZWN0aW9uIGFib3J0ZWQATm8gYnVmZmVyIHNwYWNlIGF2YWlsYWJsZQBTb2NrZXQgaXMgY29ubmVjdGVkAFNvY2tldCBub3QgY29ubmVjdGVkAENhbm5vdCBzZW5kIGFmdGVyIHNvY2tldCBzaHV0ZG93bgBPcGVyYXRpb24gYWxyZWFkeSBpbiBwcm9ncmVzcwBPcGVyYXRpb24gaW4gcHJvZ3Jlc3MAU3RhbGUgZmlsZSBoYW5kbGUAUmVtb3RlIEkvTyBlcnJvcgBRdW90YSBleGNlZWRlZABObyBtZWRpdW0gZm91bmQAV3JvbmcgbWVkaXVtIHR5cGUATm8gZXJyb3IgaW5mb3JtYXRpb24AAAAAAABMQ19DVFlQRQAAAABMQ19OVU1FUklDAABMQ19USU1FAAAAAABMQ19DT0xMQVRFAABMQ19NT05FVEFSWQBMQ19NRVNTQUdFUwBBwKoBC5cCAwAAAAQAAAAEAAAABgAAAIP5ogBE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aXJlcwBiYW5kcGFzcwBsb3Bhc3MAaGlwYXNzAGN1dG9mZgByZXNvbmFuY2UAbWF4aU1peABzaGFyZWRfcHRyPG1heGlNaXg+AHN0ZXJlbwBxdWFkAGFtYmlzb25pYwBtYXhpTGFnRXhwAHNoYXJlZF9wdHI8bWF4aUxhZ0V4cDxkb3VibGU+PgBpbml0AGFkZFNhbXBsZQB2YWx1ZQBhbHBoYQBhbHBoYVJlY2lwcm9jYWwAdmFsAG1heGlNYXAAc2hhcmVkX3B0cjxtYXhpTWFwPgBsaW5saW4AbGluZXhwAGV4cGxpbgBjbGFtcABtYXhpRHluAHNoYXJlZF9wdHI8bWF4aUR5bj4AZ2F0ZQBjb21wcmVzc29yAGNvbXByZXNzAHNldEF0dGFjawBzZXRSZWxlYXNlAHNldFRocmVzaG9sZABzZXRSYXRpbwBtYXhpRW52AHNoYXJlZF9wdHI8bWF4aUVudj4AYXIAYWRzcgBzZXREZWNheQBzZXRTdXN0YWluAGNvbnZlcnQAc2hhcmVkX3B0cjxjb252ZXJ0PgBtdG9mAG1heGlEaXN0b3J0aW9uAHNoYXJlZF9wdHI8bWF4aURpc3RvcnRpb24+AGZhc3RBdGFuAGF0YW5EaXN0AGZhc3RBdGFuRGlzdABtYXhpRmxhbmdlcgBzaGFyZWRfcHRyPG1heGlGbGFuZ2VyPgBmbGFuZ2UAbWF4aUNob3J1cwBzaGFyZWRfcHRyPG1heGlDaG9ydXM+AGNob3J1cwBtYXhpRENCbG9ja2VyAHNoYXJlZF9wdHI8bWF4aURDQmxvY2tlcj4AcGxheQBtYXhpU1ZGAHNoYXJlZF9wdHI8bWF4aVNWRj4Ac2V0Q3V0b2ZmAHNldFJlc29uYW5jZQBtYXhpS2ljawBzaGFyZWRfcHRyPG1heGlLaWNrPgBwaXRjaABkaXN0b3J0aW9uAHVzZURpc3RvcnRpb24AdXNlTGltaXRlcgB1c2VGaWx0ZXIAbWF4aUNsb2NrAHNoYXJlZF9wdHI8bWF4aUNsb2NrPgB0aWNrZXIAc2V0VGVtcG8Ac2V0VGlja3NQZXJCZWF0AGlzVGljawBjdXJyZW50Q291bnQAcGxheUhlYWQAYnBzAGJwbQB0aWNrAHRpY2tzAHB1c2hfYmFjawByZXNpemUAc2l6ZQBnZXQAc2V0AE5TdDNfXzI2dmVjdG9ySWlOU185YWxsb2NhdG9ySWlFRUVFAE5TdDNfXzIxM19fdmVjdG9yX2Jhc2VJaU5TXzlhbGxvY2F0b3JJaUVFRUUATlN0M19fMjIwX192ZWN0b3JfYmFzZV9jb21tb25JTGIxRUVFAFBOU3QzX18yNnZlY3RvcklpTlNfOWFsbG9jYXRvcklpRUVFRQBQS05TdDNfXzI2dmVjdG9ySWlOU185YWxsb2NhdG9ySWlFRUVFAGlpAHYAdmkAdmlpaQB2aWlpaQBpaWkATjEwZW1zY3JpcHRlbjN2YWxFAGlpaWkAaWlpaWkATlN0M19fMjZ2ZWN0b3JJZE5TXzlhbGxvY2F0b3JJZEVFRUUATlN0M19fMjEzX192ZWN0b3JfYmFzZUlkTlNfOWFsbG9jYXRvcklkRUVFRQBQTlN0M19fMjZ2ZWN0b3JJZE5TXzlhbGxvY2F0b3JJZEVFRUUAUEtOU3QzX18yNnZlY3RvcklkTlNfOWFsbG9jYXRvcklkRUVFRQB2aWlkAHZpaWlkAGlpaWlkAE5TdDNfXzI2dmVjdG9ySWNOU185YWxsb2NhdG9ySWNFRUVFAE5TdDNfXzIxM19fdmVjdG9yX2Jhc2VJY05TXzlhbGxvY2F0b3JJY0VFRUUAUE5TdDNfXzI2dmVjdG9ySWNOU185YWxsb2NhdG9ySWNFRUVFAFBLTlN0M19fMjZ2ZWN0b3JJY05TXzlhbGxvY2F0b3JJY0VFRUUATlN0M19fMjZ2ZWN0b3JJZk5TXzlhbGxvY2F0b3JJZkVFRUUATlN0M19fMjEzX192ZWN0b3JfYmFzZUlmTlNfOWFsbG9jYXRvcklmRUVFRQBQTlN0M19fMjZ2ZWN0b3JJZk5TXzlhbGxvY2F0b3JJZkVFRUUAUEtOU3QzX18yNnZlY3RvcklmTlNfOWFsbG9jYXRvcklmRUVFRQB2aWlmAHZpaWlmAGlpaWlmADExdmVjdG9yVG9vbHMAUDExdmVjdG9yVG9vbHMAUEsxMXZlY3RvclRvb2xzAHZpaQAxMm1heGlTZXR0aW5ncwBQMTJtYXhpU2V0dGluZ3MAUEsxMm1heGlTZXR0aW5ncwA3bWF4aU9zYwBQN21heGlPc2MAUEs3bWF4aU9zYwBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQN21heGlPc2NOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySTdtYXhpT3NjRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aU9zY0VFAGkATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJN21heGlPc2NOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpZABkaWlkZGQAZGlpZGQAZGlpADEybWF4aUVudmVsb3BlAFAxMm1heGlFbnZlbG9wZQBQSzEybWF4aUVudmVsb3BlAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVAxMm1heGlFbnZlbG9wZU4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTJtYXhpRW52ZWxvcGVFRUUxMXZhbF9kZWxldGVyRQBOU3QzX18yMTBzaGFyZWRfcHRySTEybWF4aUVudmVsb3BlRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJMTJtYXhpRW52ZWxvcGVOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpaWkAMTNtYXhpRGVsYXlsaW5lAFAxM21heGlEZWxheWxpbmUAUEsxM21heGlEZWxheWxpbmUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEzbWF4aURlbGF5bGluZU4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTNtYXhpRGVsYXlsaW5lRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxM21heGlEZWxheWxpbmVFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxM21heGlEZWxheWxpbmVOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpZGlkAGRpaWRpZGkAMTBtYXhpRmlsdGVyAFAxMG1heGlGaWx0ZXIAUEsxMG1heGlGaWx0ZXIATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEwbWF4aUZpbHRlck4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTBtYXhpRmlsdGVyRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxMG1heGlGaWx0ZXJFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxMG1heGlGaWx0ZXJOU185YWxsb2NhdG9ySVMxX0VFRUUAN21heGlNaXgAUDdtYXhpTWl4AFBLN21heGlNaXgATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdtYXhpTWl4TjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aU1peEVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN21heGlNaXhFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3bWF4aU1peE5TXzlhbGxvY2F0b3JJUzFfRUVFRQB2aWlkaWQAdmlpZGlkZAB2aWlkaWRkZAAxMG1heGlMYWdFeHBJZEUAUDEwbWF4aUxhZ0V4cElkRQBQSzEwbWF4aUxhZ0V4cElkRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQMTBtYXhpTGFnRXhwSWRFTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMl9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzJfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckkxMG1heGlMYWdFeHBJZEVFRUUxMXZhbF9kZWxldGVyRQBOU3QzX18yMTBzaGFyZWRfcHRySTEwbWF4aUxhZ0V4cElkRUVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTEwbWF4aUxhZ0V4cElkRU5TXzlhbGxvY2F0b3JJUzJfRUVFRQB2aWlkZAA3bWF4aU1hcABQN21heGlNYXAAUEs3bWF4aU1hcABOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQN21heGlNYXBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySTdtYXhpTWFwRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aU1hcEVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTdtYXhpTWFwTlNfOWFsbG9jYXRvcklTMV9FRUVFAGRpZGRkZGQAZGlkZGQAN21heGlEeW4AUDdtYXhpRHluAFBLN21heGlEeW4ATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdtYXhpRHluTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aUR5bkVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN21heGlEeW5FRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3bWF4aUR5bk5TXzlhbGxvY2F0b3JJUzFfRUVFRQBkaWlkZGlkZABkaWlkZGRkZAA3bWF4aUVudgBQN21heGlFbnYAUEs3bWF4aUVudgBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQN21heGlFbnZOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySTdtYXhpRW52RUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aUVudkVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTdtYXhpRW52TlNfOWFsbG9jYXRvcklTMV9FRUVFAGRpaWRkZGlpAGRpaWRkZGRkaWkAZGlpZGkAN2NvbnZlcnQAUDdjb252ZXJ0AFBLN2NvbnZlcnQATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdjb252ZXJ0TjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3Y29udmVydEVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN2NvbnZlcnRFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3Y29udmVydE5TXzlhbGxvY2F0b3JJUzFfRUVFRQBkaWlpADE0bWF4aURpc3RvcnRpb24AUDE0bWF4aURpc3RvcnRpb24AUEsxNG1heGlEaXN0b3J0aW9uAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVAxNG1heGlEaXN0b3J0aW9uTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckkxNG1heGlEaXN0b3J0aW9uRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxNG1heGlEaXN0b3J0aW9uRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJMTRtYXhpRGlzdG9ydGlvbk5TXzlhbGxvY2F0b3JJUzFfRUVFRQAxMW1heGlGbGFuZ2VyAFAxMW1heGlGbGFuZ2VyAFBLMTFtYXhpRmxhbmdlcgBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQMTFtYXhpRmxhbmdlck4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTFtYXhpRmxhbmdlckVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJMTFtYXhpRmxhbmdlckVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTExbWF4aUZsYW5nZXJOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpZGlkZGQAMTBtYXhpQ2hvcnVzAFAxMG1heGlDaG9ydXMAUEsxMG1heGlDaG9ydXMATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEwbWF4aUNob3J1c04xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTBtYXhpQ2hvcnVzRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxMG1heGlDaG9ydXNFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxMG1heGlDaG9ydXNOU185YWxsb2NhdG9ySVMxX0VFRUUAMTNtYXhpRENCbG9ja2VyAFAxM21heGlEQ0Jsb2NrZXIAUEsxM21heGlEQ0Jsb2NrZXIATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEzbWF4aURDQmxvY2tlck4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTNtYXhpRENCbG9ja2VyRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxM21heGlEQ0Jsb2NrZXJFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxM21heGlEQ0Jsb2NrZXJOU185YWxsb2NhdG9ySVMxX0VFRUUAN21heGlTVkYAUDdtYXhpU1ZGAFBLN21heGlTVkYATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdtYXhpU1ZGTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aVNWRkVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN21heGlTVkZFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3bWF4aVNWRk5TXzlhbGxvY2F0b3JJUzFfRUVFRQBpaWlkADhtYXhpS2ljawBQOG1heGlLaWNrAFBLOG1heGlLaWNrAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVA4bWF4aUtpY2tOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySThtYXhpS2lja0VFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJOG1heGlLaWNrRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJOG1heGlLaWNrTlNfOWFsbG9jYXRvcklTMV9FRUVFADltYXhpQ2xvY2sAUDltYXhpQ2xvY2sAUEs5bWF4aUNsb2NrAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVA5bWF4aUNsb2NrTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk5bWF4aUNsb2NrRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk5bWF4aUNsb2NrRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJOW1heGlDbG9ja05TXzlhbGxvY2F0b3JJUzFfRUVFRQB2b2lkAGJvb2wAc3RkOjpzdHJpbmcAc3RkOjpiYXNpY19zdHJpbmc8dW5zaWduZWQgY2hhcj4Ac3RkOjp3c3RyaW5nAGVtc2NyaXB0ZW46OnZhbABlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgY2hhcj4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8c2hvcnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIHNob3J0PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50OF90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MTZfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dWludDMyX3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGxvbmcgZG91YmxlPgBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0llRUUAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8ZG91YmxlPgBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lkRUUAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8ZmxvYXQ+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWZFRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBsb25nPgBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0ltRUUAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZz4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJbEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWpFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lpRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJdEVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SXNFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0loRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJYUVFAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGNoYXI+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWNFRQBOU3QzX18yMTJiYXNpY19zdHJpbmdJd05TXzExY2hhcl90cmFpdHNJd0VFTlNfOWFsbG9jYXRvckl3RUVFRQBOU3QzX18yMjFfX2Jhc2ljX3N0cmluZ19jb21tb25JTGIxRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0loTlNfMTFjaGFyX3RyYWl0c0loRUVOU185YWxsb2NhdG9ySWhFRUVFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0ljTlNfMTFjaGFyX3RyYWl0c0ljRUVOU185YWxsb2NhdG9ySWNFRUVFAGRvdWJsZQBmbG9hdAB1bnNpZ25lZCBsb25nAGxvbmcAdW5zaWduZWQgaW50AGludAB1bnNpZ25lZCBzaG9ydABzaG9ydAB1bnNpZ25lZCBjaGFyAHNpZ25lZCBjaGFyAGNoYXIAaW5maW5pdHkAAAECBAcDBgUALSsgICAwWDB4AChudWxsKQAtMFgrMFggMFgtMHgrMHggMHgAaW5mAElORgBuYW4ATkFOAC4ATENfQUxMAExBTkcAQy5VVEYtOABQT1NJWABNVVNMX0xPQ1BBVEgATlN0M19fMjhpb3NfYmFzZUUATlN0M19fMjliYXNpY19pb3NJY05TXzExY2hhcl90cmFpdHNJY0VFRUUATlN0M19fMjliYXNpY19pb3NJd05TXzExY2hhcl90cmFpdHNJd0VFRUUATlN0M19fMjE1YmFzaWNfc3RyZWFtYnVmSWNOU18xMWNoYXJfdHJhaXRzSWNFRUVFAE5TdDNfXzIxNWJhc2ljX3N0cmVhbWJ1Zkl3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRQBOU3QzX18yMTNiYXNpY19pc3RyZWFtSWNOU18xMWNoYXJfdHJhaXRzSWNFRUVFAE5TdDNfXzIxM2Jhc2ljX2lzdHJlYW1Jd05TXzExY2hhcl90cmFpdHNJd0VFRUUATlN0M19fMjEzYmFzaWNfb3N0cmVhbUljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRQBOU3QzX18yMTNiYXNpY19vc3RyZWFtSXdOU18xMWNoYXJfdHJhaXRzSXdFRUVFAE5TdDNfXzIxMV9fc3Rkb3V0YnVmSXdFRQBOU3QzX18yMTFfX3N0ZG91dGJ1ZkljRUUAdW5zdXBwb3J0ZWQgbG9jYWxlIGZvciBzdGFuZGFyZCBpbnB1dABOU3QzX18yMTBfX3N0ZGluYnVmSXdFRQBOU3QzX18yMTBfX3N0ZGluYnVmSWNFRQBOU3QzX18yN2NvbGxhdGVJY0VFAE5TdDNfXzI2bG9jYWxlNWZhY2V0RQBOU3QzX18yN2NvbGxhdGVJd0VFACVwAEMATlN0M19fMjdudW1fZ2V0SWNOU18xOWlzdHJlYW1idWZfaXRlcmF0b3JJY05TXzExY2hhcl90cmFpdHNJY0VFRUVFRQBOU3QzX18yOV9fbnVtX2dldEljRUUATlN0M19fMjE0X19udW1fZ2V0X2Jhc2VFAE5TdDNfXzI3bnVtX2dldEl3TlNfMTlpc3RyZWFtYnVmX2l0ZXJhdG9ySXdOU18xMWNoYXJfdHJhaXRzSXdFRUVFRUUATlN0M19fMjlfX251bV9nZXRJd0VFACVwAAAAAEwAbGwAJQAAAAAAbABOU3QzX18yN251bV9wdXRJY05TXzE5b3N0cmVhbWJ1Zl9pdGVyYXRvckljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRUVFAE5TdDNfXzI5X19udW1fcHV0SWNFRQBOU3QzX18yMTRfX251bV9wdXRfYmFzZUUATlN0M19fMjdudW1fcHV0SXdOU18xOW9zdHJlYW1idWZfaXRlcmF0b3JJd05TXzExY2hhcl90cmFpdHNJd0VFRUVFRQBOU3QzX18yOV9fbnVtX3B1dEl3RUUAJUg6JU06JVMAJW0vJWQvJXkAJUk6JU06JVMgJXAAJWEgJWIgJWQgJUg6JU06JVMgJVkAQU0AUE0ASmFudWFyeQBGZWJydWFyeQBNYXJjaABBcHJpbABNYXkASnVuZQBKdWx5AEF1Z3VzdABTZXB0ZW1iZXIAT2N0b2JlcgBOb3ZlbWJlcgBEZWNlbWJlcgBKYW4ARmViAE1hcgBBcHIASnVuAEp1bABBdWcAU2VwAE9jdABOb3YARGVjAFN1bmRheQBNb25kYXkAVHVlc2RheQBXZWRuZXNkYXkAVGh1cnNkYXkARnJpZGF5AFNhdHVyZGF5AFN1bgBNb24AVHVlAFdlZABUaHUARnJpAFNhdAAlbS8lZC8leSVZLSVtLSVkJUk6JU06JVMgJXAlSDolTSVIOiVNOiVTJUg6JU06JVNOU3QzX18yOHRpbWVfZ2V0SWNOU18xOWlzdHJlYW1idWZfaXRlcmF0b3JJY05TXzExY2hhcl90cmFpdHNJY0VFRUVFRQBOU3QzX18yMjBfX3RpbWVfZ2V0X2Nfc3RvcmFnZUljRUUATlN0M19fMjl0aW1lX2Jhc2VFAE5TdDNfXzI4dGltZV9nZXRJd05TXzE5aXN0cmVhbWJ1Zl9pdGVyYXRvckl3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRUVFAE5TdDNfXzIyMF9fdGltZV9nZXRfY19zdG9yYWdlSXdFRQBOU3QzX18yOHRpbWVfcHV0SWNOU18xOW9zdHJlYW1idWZfaXRlcmF0b3JJY05TXzExY2hhcl90cmFpdHNJY0VFRUVFRQBOU3QzX18yMTBfX3RpbWVfcHV0RQBsb2NhbGUgbm90IHN1cHBvcnRlZABOU3QzX18yOHRpbWVfcHV0SXdOU18xOW9zdHJlYW1idWZfaXRlcmF0b3JJd05TXzExY2hhcl90cmFpdHNJd0VFRUVFRQBOU3QzX18yMTBtb25leXB1bmN0SWNMYjBFRUUATlN0M19fMjEwbW9uZXlfYmFzZUUATlN0M19fMjEwbW9uZXlwdW5jdEljTGIxRUVFAE5TdDNfXzIxMG1vbmV5cHVuY3RJd0xiMEVFRQBOU3QzX18yMTBtb25leXB1bmN0SXdMYjFFRUUAMDEyMzQ1Njc4OQAlTGYAbW9uZXlfZ2V0IGVycm9yAE5TdDNfXzI5bW9uZXlfZ2V0SWNOU18xOWlzdHJlYW1idWZfaXRlcmF0b3JJY05TXzExY2hhcl90cmFpdHNJY0VFRUVFRQBOU3QzX18yMTFfX21vbmV5X2dldEljRUUAMDEyMzQ1Njc4OQBOU3QzX18yOW1vbmV5X2dldEl3TlNfMTlpc3RyZWFtYnVmX2l0ZXJhdG9ySXdOU18xMWNoYXJfdHJhaXRzSXdFRUVFRUUATlN0M19fMjExX19tb25leV9nZXRJd0VFACUuMExmAE5TdDNfXzI5bW9uZXlfcHV0SWNOU18xOW9zdHJlYW1idWZfaXRlcmF0b3JJY05TXzExY2hhcl90cmFpdHNJY0VFRUVFRQBOU3QzX18yMTFfX21vbmV5X3B1dEljRUUATlN0M19fMjltb25leV9wdXRJd05TXzE5b3N0cmVhbWJ1Zl9pdGVyYXRvckl3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRUVFAE5TdDNfXzIxMV9fbW9uZXlfcHV0SXdFRQBOU3QzX18yOG1lc3NhZ2VzSWNFRQBOU3QzX18yMTNtZXNzYWdlc19iYXNlRQBOU3QzX18yMTdfX3dpZGVuX2Zyb21fdXRmOElMbTMyRUVFAE5TdDNfXzI3Y29kZWN2dElEaWMxMV9fbWJzdGF0ZV90RUUATlN0M19fMjEyY29kZWN2dF9iYXNlRQBOU3QzX18yMTZfX25hcnJvd190b191dGY4SUxtMzJFRUUATlN0M19fMjhtZXNzYWdlc0l3RUUATlN0M19fMjdjb2RlY3Z0SWNjMTFfX21ic3RhdGVfdEVFAE5TdDNfXzI3Y29kZWN2dEl3YzExX19tYnN0YXRlX3RFRQBOU3QzX18yN2NvZGVjdnRJRHNjMTFfX21ic3RhdGVfdEVFAE5TdDNfXzI2bG9jYWxlNV9faW1wRQBOU3QzX18yNWN0eXBlSWNFRQBOU3QzX18yMTBjdHlwZV9iYXNlRQBOU3QzX18yNWN0eXBlSXdFRQBmYWxzZQB0cnVlAE5TdDNfXzI4bnVtcHVuY3RJY0VFAE5TdDNfXzI4bnVtcHVuY3RJd0VFAE5TdDNfXzIxNF9fc2hhcmVkX2NvdW50RQBOU3QzX18yMTlfX3NoYXJlZF93ZWFrX2NvdW50RQBiYXNpY19zdHJpbmcAYWxsb2NhdG9yPFQ+OjphbGxvY2F0ZShzaXplX3QgbikgJ24nIGV4Y2VlZHMgbWF4aW11bSBzdXBwb3J0ZWQgc2l6ZQB2ZWN0b3IAdGVybWluYXRpbmcgd2l0aCAlcyBleGNlcHRpb24gb2YgdHlwZSAlczogJXMAdGVybWluYXRpbmcgd2l0aCAlcyBleGNlcHRpb24gb2YgdHlwZSAlcwB0ZXJtaW5hdGluZyB3aXRoICVzIGZvcmVpZ24gZXhjZXB0aW9uAHRlcm1pbmF0aW5nAHVuY2F1Z2h0AFN0OWV4Y2VwdGlvbgBOMTBfX2N4eGFiaXYxMTZfX3NoaW1fdHlwZV9pbmZvRQBTdDl0eXBlX2luZm8ATjEwX19jeHhhYml2MTIwX19zaV9jbGFzc190eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExN19fY2xhc3NfdHlwZV9pbmZvRQBwdGhyZWFkX29uY2UgZmFpbHVyZSBpbiBfX2N4YV9nZXRfZ2xvYmFsc19mYXN0KCkAY2Fubm90IGNyZWF0ZSBwdGhyZWFkIGtleSBmb3IgX19jeGFfZ2V0X2dsb2JhbHMoKQBjYW5ub3QgemVybyBvdXQgdGhyZWFkIHZhbHVlIGZvciBfX2N4YV9nZXRfZ2xvYmFscygpAHRlcm1pbmF0ZV9oYW5kbGVyIHVuZXhwZWN0ZWRseSByZXR1cm5lZAB0ZXJtaW5hdGVfaGFuZGxlciB1bmV4cGVjdGVkbHkgdGhyZXcgYW4gZXhjZXB0aW9uAHN0ZDo6YmFkX2FsbG9jAFN0OWJhZF9hbGxvYwBTdDExbG9naWNfZXJyb3IAU3QxM3J1bnRpbWVfZXJyb3IAU3QxMmxlbmd0aF9lcnJvcgBzdGQ6OmJhZF9jYXN0AFN0OGJhZF9jYXN0AE4xMF9fY3h4YWJpdjExOV9fcG9pbnRlcl90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExN19fcGJhc2VfdHlwZV9pbmZvRQBOMTBfX2N4eGFiaXYxMjNfX2Z1bmRhbWVudGFsX3R5cGVfaW5mb0UAdgBEbgBiAGMAaABhAHMAdABpAGoAbQBmAGQATjEwX19jeHhhYml2MTIxX192bWlfY2xhc3NfdHlwZV9pbmZvRQ==';
if (!isDataURI(wasmBinaryFile)) {
  wasmBinaryFile = locateFile(wasmBinaryFile);
}

function getBinary() {
  try {
    if (Module['wasmBinary']) {
      return new Uint8Array(Module['wasmBinary']);
    }
    var binary = tryParseAsDataURI(wasmBinaryFile);
    if (binary) {
      return binary;
    }
    if (Module['readBinary']) {
      return Module['readBinary'](wasmBinaryFile);
    } else {
      throw "sync fetching of the wasm failed: you can preload it to Module['wasmBinary'] manually, or emcc.py will do that for you when generating HTML (but not JS)";
    }
  }
  catch (err) {
    abort(err);
  }
}

function getBinaryPromise() {
  // if we don't have the binary yet, and have the Fetch api, use that
  // in some environments, like Electron's render process, Fetch api may be present, but have a different context than expected, let's only use it on the Web
  if (!Module['wasmBinary'] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === 'function') {
    return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function(response) {
      if (!response['ok']) {
        throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
      }
      return response['arrayBuffer']();
    }).catch(function () {
      return getBinary();
    });
  }
  // Otherwise, getBinary should be able to get it synchronously
  return new Promise(function(resolve, reject) {
    resolve(getBinary());
  });
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
function createWasm(env) {
  // prepare imports
  var info = {
    'env': env
    ,
    'global': {
      'NaN': NaN,
      'Infinity': Infinity
    },
    'global.Math': Math,
    'asm2wasm': asm2wasmImports
  };
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  function receiveInstance(instance, module) {
    var exports = instance.exports;
    Module['asm'] = exports;
    removeRunDependency('wasm-instantiate');
  }
  addRunDependency('wasm-instantiate');

  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to run the instantiation parallel
  // to any other async startup actions they are performing.
  if (Module['instantiateWasm']) {
    try {
      return Module['instantiateWasm'](info, receiveInstance);
    } catch(e) {
      err('Module.instantiateWasm callback failed with error: ' + e);
      return false;
    }
  }

  var instance;
  var module;
  try {
    module = new WebAssembly.Module(getBinary());
    instance = new WebAssembly.Instance(module, info)
  } catch (e) {
    err('failed to compile wasm module: ' + e);
    if (e.toString().indexOf('imported Memory with incompatible size') >= 0) {
      err('Memory size incompatibility issues may be due to changing TOTAL_MEMORY at runtime to something too large. Use ALLOW_MEMORY_GROWTH to allow any size memory (and also make sure not to set TOTAL_MEMORY at runtime to something smaller than it was at compile time).');
    }
    return false;
  }
  receiveInstance(instance, module);
  return Module['asm']; // exports were assigned here
}

// Provide an "asm.js function" for the application, called to "link" the asm.js module. We instantiate
// the wasm module at that time, and it receives imports and provides exports and so forth, the app
// doesn't need to care that it is wasm or asm.js.

Module['asm'] = function(global, env, providedBuffer) {
  // memory was already allocated (so js could use the buffer)
  env['memory'] = wasmMemory
  ;
  // import table
  env['table'] = wasmTable = new WebAssembly.Table({
    'initial': 1764,
    'maximum': 1764,
    'element': 'anyfunc'
  });
  env['__memory_base'] = 1024; // tell the memory segments where to place themselves
  env['__table_base'] = 0; // table starts at 0 by default (even in dynamic linking, for the main module)

  var exports = createWasm(env);
  assert(exports, 'binaryen setup failed (no wasm support?)');
  return exports;
};

// === Body ===

var ASM_CONSTS = [];





// STATICTOP = STATIC_BASE + 51952;
/* global initializers */  __ATINIT__.push({ func: function() { globalCtors() } });








/* no memory initializer */
var tempDoublePtr = 52960
assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];
  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];
  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];
}

function copyTempDouble(ptr) {
  HEAP8[tempDoublePtr] = HEAP8[ptr];
  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];
  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];
  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];
  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];
  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];
  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];
  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];
}

// {{PRE_LIBRARY}}


  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  
  function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        err('exception during cxa_free_exception: ' + e);
      }
    }var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var key in EXCEPTIONS.infos) {
          var ptr = +key; // the iteration key is a string, and if we throw this, it must be an integer as that is what we look for
          var adj = EXCEPTIONS.infos[ptr].adjusted;
          var len = adj.length;
          for (var i = 0; i < len; i++) {
            if (adj[i] === adjusted) {
              return ptr;
            }
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  
   function ___cxa_end_catch() {
      // Clear state flag.
      _setThrew(0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }


  function ___cxa_rethrow() {
      var ptr = EXCEPTIONS.caught.pop();
      ptr = EXCEPTIONS.deAdjust(ptr);
      if (!EXCEPTIONS.infos[ptr].rethrown) {
        // Only pop if the corresponding push was through rethrow_primary_exception
        EXCEPTIONS.caught.push(ptr)
        EXCEPTIONS.infos[ptr].rethrown = true;
      }
      EXCEPTIONS.last = ptr;
      throw ptr;
    }

  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted.push(thrown);
          return ((setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: [ptr],
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

  function ___gxx_personality_v0() {
    }

  function ___lock() {}

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else err('failed to set errno from JS');
      return value;
    }function ___map_file(pathname, size) {
      ___setErrNo(1);
      return -1;
    }


  
  
  
  var PATH={splitPath:function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function (parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function (path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function (path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function (path) {
        return PATH.splitPath(path)[3];
      },join:function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function (l, r) {
        return PATH.normalize(l + '/' + r);
      },resolve:function () {
        var resolvedPath = '',
          resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
          var path = (i >= 0) ? arguments[i] : FS.cwd();
          // Skip empty and invalid entries
          if (typeof path !== 'string') {
            throw new TypeError('Arguments to path.resolve must be strings');
          } else if (!path) {
            return ''; // an invalid portion invalidates the whole thing
          }
          resolvedPath = path + '/' + resolvedPath;
          resolvedAbsolute = path.charAt(0) === '/';
        }
        // At this point the path should be resolved to a full absolute path, but
        // handle relative paths to be safe (might happen when process.cwd() fails)
        resolvedPath = PATH.normalizeArray(resolvedPath.split('/').filter(function(p) {
          return !!p;
        }), !resolvedAbsolute).join('/');
        return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
      },relative:function (from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);
        function trim(arr) {
          var start = 0;
          for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
          }
          var end = arr.length - 1;
          for (; end >= 0; end--) {
            if (arr[end] !== '') break;
          }
          if (start > end) return [];
          return arr.slice(start, end - start + 1);
        }
        var fromParts = trim(from.split('/'));
        var toParts = trim(to.split('/'));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
          if (fromParts[i] !== toParts[i]) {
            samePartsLength = i;
            break;
          }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
          outputParts.push('..');
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join('/');
      }};
  
  var TTY={ttys:[],init:function () {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // currently, FS.init does not distinguish if process.stdin is a file or TTY
        //   // device, it always assumes it's a TTY device. because of this, we're forcing
        //   // process.stdin to UTF8 encoding to at least make stdin reading compatible
        //   // with text files until FS.init can be refactored.
        //   process['stdin']['setEncoding']('utf8');
        // }
      },shutdown:function () {
        // https://github.com/emscripten-core/emscripten/pull/1555
        // if (ENVIRONMENT_IS_NODE) {
        //   // inolen: any idea as to why node -e 'process.stdin.read()' wouldn't exit immediately (with process.stdin being a tty)?
        //   // isaacs: because now it's reading from the stream, you've expressed interest in it, so that read() kicks off a _read() which creates a ReadReq operation
        //   // inolen: I thought read() in that case was a synchronous operation that just grabbed some amount of buffered data if it exists?
        //   // isaacs: it is. but it also triggers a _read() call, which calls readStart() on the handle
        //   // isaacs: do process.stdin.pause() and i'd think it'd probably close the pending call
        //   process['stdin']['pause']();
        // }
      },register:function (dev, ops) {
        TTY.ttys[dev] = { input: [], output: [], ops: ops };
        FS.registerDevice(dev, TTY.stream_ops);
      },stream_ops:{open:function (stream) {
          var tty = TTY.ttys[stream.node.rdev];
          if (!tty) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          stream.tty = tty;
          stream.seekable = false;
        },close:function (stream) {
          // flush any pending line data
          stream.tty.ops.flush(stream.tty);
        },flush:function (stream) {
          stream.tty.ops.flush(stream.tty);
        },read:function (stream, buffer, offset, length, pos /* ignored */) {
          if (!stream.tty || !stream.tty.ops.get_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          var bytesRead = 0;
          for (var i = 0; i < length; i++) {
            var result;
            try {
              result = stream.tty.ops.get_char(stream.tty);
            } catch (e) {
              throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }
            if (result === undefined && bytesRead === 0) {
              throw new FS.ErrnoError(ERRNO_CODES.EAGAIN);
            }
            if (result === null || result === undefined) break;
            bytesRead++;
            buffer[offset+i] = result;
          }
          if (bytesRead) {
            stream.node.timestamp = Date.now();
          }
          return bytesRead;
        },write:function (stream, buffer, offset, length, pos) {
          if (!stream.tty || !stream.tty.ops.put_char) {
            throw new FS.ErrnoError(ERRNO_CODES.ENXIO);
          }
          try {
            for (var i = 0; i < length; i++) {
              stream.tty.ops.put_char(stream.tty, buffer[offset+i]);
            }
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO);
          }
          if (length) {
            stream.node.timestamp = Date.now();
          }
          return i;
        }},default_tty_ops:{get_char:function (tty) {
          if (!tty.input.length) {
            var result = null;
            if (ENVIRONMENT_IS_NODE) {
              // we will read data by chunks of BUFSIZE
              var BUFSIZE = 256;
              var buf = new Buffer(BUFSIZE);
              var bytesRead = 0;
  
              var isPosixPlatform = (process.platform != 'win32'); // Node doesn't offer a direct check, so test by exclusion
  
              var fd = process.stdin.fd;
              if (isPosixPlatform) {
                // Linux and Mac cannot use process.stdin.fd (which isn't set up as sync)
                var usingDevice = false;
                try {
                  fd = fs.openSync('/dev/stdin', 'r');
                  usingDevice = true;
                } catch (e) {}
              }
  
              try {
                bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null);
              } catch(e) {
                // Cross-platform differences: on Windows, reading EOF throws an exception, but on other OSes,
                // reading EOF returns 0. Uniformize behavior by treating the EOF exception to return 0.
                if (e.toString().indexOf('EOF') != -1) bytesRead = 0;
                else throw e;
              }
  
              if (usingDevice) { fs.closeSync(fd); }
              if (bytesRead > 0) {
                result = buf.slice(0, bytesRead).toString('utf-8');
              } else {
                result = null;
              }
            } else
            if (typeof window != 'undefined' &&
              typeof window.prompt == 'function') {
              // Browser.
              result = window.prompt('Input: ');  // returns null on cancel
              if (result !== null) {
                result += '\n';
              }
            } else if (typeof readline == 'function') {
              // Command line.
              result = readline();
              if (result !== null) {
                result += '\n';
              }
            }
            if (!result) {
              return null;
            }
            tty.input = intArrayFromString(result, true);
          }
          return tty.input.shift();
        },put_char:function (tty, val) {
          if (val === null || val === 10) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val); // val == 0 would cut text output off in the middle.
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            out(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }},default_tty1_ops:{put_char:function (tty, val) {
          if (val === null || val === 10) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          } else {
            if (val != 0) tty.output.push(val);
          }
        },flush:function (tty) {
          if (tty.output && tty.output.length > 0) {
            err(UTF8ArrayToString(tty.output, 0));
            tty.output = [];
          }
        }}};
  
  var MEMFS={ops_table:null,mount:function (mount) {
        return MEMFS.createNode(null, '/', 16384 | 511 /* 0777 */, 0);
      },createNode:function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
          // no supported
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }
        if (!MEMFS.ops_table) {
          MEMFS.ops_table = {
            dir: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                lookup: MEMFS.node_ops.lookup,
                mknod: MEMFS.node_ops.mknod,
                rename: MEMFS.node_ops.rename,
                unlink: MEMFS.node_ops.unlink,
                rmdir: MEMFS.node_ops.rmdir,
                readdir: MEMFS.node_ops.readdir,
                symlink: MEMFS.node_ops.symlink
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek
              }
            },
            file: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: {
                llseek: MEMFS.stream_ops.llseek,
                read: MEMFS.stream_ops.read,
                write: MEMFS.stream_ops.write,
                allocate: MEMFS.stream_ops.allocate,
                mmap: MEMFS.stream_ops.mmap,
                msync: MEMFS.stream_ops.msync
              }
            },
            link: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr,
                readlink: MEMFS.node_ops.readlink
              },
              stream: {}
            },
            chrdev: {
              node: {
                getattr: MEMFS.node_ops.getattr,
                setattr: MEMFS.node_ops.setattr
              },
              stream: FS.chrdev_stream_ops
            }
          };
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
          node.node_ops = MEMFS.ops_table.dir.node;
          node.stream_ops = MEMFS.ops_table.dir.stream;
          node.contents = {};
        } else if (FS.isFile(node.mode)) {
          node.node_ops = MEMFS.ops_table.file.node;
          node.stream_ops = MEMFS.ops_table.file.stream;
          node.usedBytes = 0; // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
          // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
          // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
          // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
          node.contents = null; 
        } else if (FS.isLink(node.mode)) {
          node.node_ops = MEMFS.ops_table.link.node;
          node.stream_ops = MEMFS.ops_table.link.stream;
        } else if (FS.isChrdev(node.mode)) {
          node.node_ops = MEMFS.ops_table.chrdev.node;
          node.stream_ops = MEMFS.ops_table.chrdev.stream;
        }
        node.timestamp = Date.now();
        // add the new node to the parent
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },getFileDataAsRegularArray:function (node) {
        if (node.contents && node.contents.subarray) {
          var arr = [];
          for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
          return arr; // Returns a copy of the original data.
        }
        return node.contents; // No-op, the file contents are already in a JS array. Return as-is.
      },getFileDataAsTypedArray:function (node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes); // Make sure to not return excess unused bytes.
        return new Uint8Array(node.contents);
      },expandFileStorage:function (node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return; // No need to expand, the storage was already large enough.
        // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
        // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
        // avoid overshooting the allocation cap by a very large margin.
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2.0 : 1.125)) | 0);
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256); // At minimum allocate 256b for each file when expanding.
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity); // Allocate new storage.
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0); // Copy old data over to the new storage.
        return;
      },resizeFileStorage:function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
          node.contents = null; // Fully decommit when requesting a resize to zero.
          node.usedBytes = 0;
          return;
        }
        if (!node.contents || node.contents.subarray) { // Resize a typed array if that is being used as the backing store.
          var oldContents = node.contents;
          node.contents = new Uint8Array(new ArrayBuffer(newSize)); // Allocate new storage.
          if (oldContents) {
            node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes))); // Copy old data over to the new storage.
          }
          node.usedBytes = newSize;
          return;
        }
        // Backing with a JS array.
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize;
      },node_ops:{getattr:function (node) {
          var attr = {};
          // device numbers reuse inode numbers.
          attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
          attr.ino = node.id;
          attr.mode = node.mode;
          attr.nlink = 1;
          attr.uid = 0;
          attr.gid = 0;
          attr.rdev = node.rdev;
          if (FS.isDir(node.mode)) {
            attr.size = 4096;
          } else if (FS.isFile(node.mode)) {
            attr.size = node.usedBytes;
          } else if (FS.isLink(node.mode)) {
            attr.size = node.link.length;
          } else {
            attr.size = 0;
          }
          attr.atime = new Date(node.timestamp);
          attr.mtime = new Date(node.timestamp);
          attr.ctime = new Date(node.timestamp);
          // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
          //       but this is not required by the standard.
          attr.blksize = 4096;
          attr.blocks = Math.ceil(attr.size / attr.blksize);
          return attr;
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
          if (attr.size !== undefined) {
            MEMFS.resizeFileStorage(node, attr.size);
          }
        },lookup:function (parent, name) {
          throw FS.genericErrors[ERRNO_CODES.ENOENT];
        },mknod:function (parent, name, mode, dev) {
          return MEMFS.createNode(parent, name, mode, dev);
        },rename:function (old_node, new_dir, new_name) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          if (FS.isDir(old_node.mode)) {
            var new_node;
            try {
              new_node = FS.lookupNode(new_dir, new_name);
            } catch (e) {
            }
            if (new_node) {
              for (var i in new_node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
              }
            }
          }
          // do the internal rewiring
          delete old_node.parent.contents[old_node.name];
          old_node.name = new_name;
          new_dir.contents[new_name] = old_node;
          old_node.parent = new_dir;
        },unlink:function (parent, name) {
          delete parent.contents[name];
        },rmdir:function (parent, name) {
          var node = FS.lookupNode(parent, name);
          for (var i in node.contents) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY);
          }
          delete parent.contents[name];
        },readdir:function (node) {
          var entries = ['.', '..']
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newname, oldpath) {
          var node = MEMFS.createNode(parent, newname, 511 /* 0777 */ | 40960, 0);
          node.link = oldpath;
          return node;
        },readlink:function (node) {
          if (!FS.isLink(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return node.link;
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          var contents = stream.node.contents;
          if (position >= stream.node.usedBytes) return 0;
          var size = Math.min(stream.node.usedBytes - position, length);
          assert(size >= 0);
          if (size > 8 && contents.subarray) { // non-trivial, and typed array
            buffer.set(contents.subarray(position, position + size), offset);
          } else {
            for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
          }
          return size;
        },write:function (stream, buffer, offset, length, position, canOwn) {
  
          if (!length) return 0;
          var node = stream.node;
          node.timestamp = Date.now();
  
          if (buffer.subarray && (!node.contents || node.contents.subarray)) { // This write is from a typed array to a typed array?
            if (canOwn) {
              assert(position === 0, 'canOwn must imply no weird position inside the file');
              node.contents = buffer.subarray(offset, offset + length);
              node.usedBytes = length;
              return length;
            } else if (node.usedBytes === 0 && position === 0) { // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
              node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
              node.usedBytes = length;
              return length;
            } else if (position + length <= node.usedBytes) { // Writing to an already allocated and used subrange of the file?
              node.contents.set(buffer.subarray(offset, offset + length), position);
              return length;
            }
          }
  
          // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
          MEMFS.expandFileStorage(node, position+length);
          if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position); // Use typed array write if available.
          else {
            for (var i = 0; i < length; i++) {
             node.contents[position + i] = buffer[offset + i]; // Or fall back to manual write if not.
            }
          }
          node.usedBytes = Math.max(node.usedBytes, position+length);
          return length;
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.usedBytes;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        },allocate:function (stream, offset, length) {
          MEMFS.expandFileStorage(stream.node, offset + length);
          stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length);
        },mmap:function (stream, buffer, offset, length, position, prot, flags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          var ptr;
          var allocated;
          var contents = stream.node.contents;
          // Only make a new copy when MAP_PRIVATE is specified.
          if ( !(flags & 2) &&
                (contents.buffer === buffer || contents.buffer === buffer.buffer) ) {
            // We can't emulate MAP_SHARED when the file is not backed by the buffer
            // we're mapping to (e.g. the HEAP buffer).
            allocated = false;
            ptr = contents.byteOffset;
          } else {
            // Try to avoid unnecessary slices.
            if (position > 0 || position + length < stream.node.usedBytes) {
              if (contents.subarray) {
                contents = contents.subarray(position, position + length);
              } else {
                contents = Array.prototype.slice.call(contents, position, position + length);
              }
            }
            allocated = true;
            ptr = _malloc(length);
            if (!ptr) {
              throw new FS.ErrnoError(ERRNO_CODES.ENOMEM);
            }
            buffer.set(contents, ptr);
          }
          return { ptr: ptr, allocated: allocated };
        },msync:function (stream, buffer, offset, length, mmapFlags) {
          if (!FS.isFile(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV);
          }
          if (mmapFlags & 2) {
            // MAP_PRIVATE calls need not to be synced back to underlying fs
            return 0;
          }
  
          var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
          // should we check if bytesWritten and length are the same?
          return 0;
        }}};
  
  var IDBFS={dbs:{},indexedDB:function () {
        if (typeof indexedDB !== 'undefined') return indexedDB;
        var ret = null;
        if (typeof window === 'object') ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, 'IDBFS used, but indexedDB not supported');
        return ret;
      },DB_VERSION:21,DB_STORE_NAME:"FILE_DATA",mount:function (mount) {
        // reuse all of the core MEMFS functionality
        return MEMFS.mount.apply(null, arguments);
      },syncfs:function (mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
          if (err) return callback(err);
  
          IDBFS.getRemoteSet(mount, function(err, remote) {
            if (err) return callback(err);
  
            var src = populate ? remote : local;
            var dst = populate ? local : remote;
  
            IDBFS.reconcile(src, dst, callback);
          });
        });
      },getDB:function (name, callback) {
        // check the cache first
        var db = IDBFS.dbs[name];
        if (db) {
          return callback(null, db);
        }
  
        var req;
        try {
          req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION);
        } catch (e) {
          return callback(e);
        }
        if (!req) {
          return callback("Unable to connect to IndexedDB");
        }
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          var transaction = e.target.transaction;
  
          var fileStore;
  
          if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
            fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME);
          } else {
            fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME);
          }
  
          if (!fileStore.indexNames.contains('timestamp')) {
            fileStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
        req.onsuccess = function() {
          db = req.result;
  
          // add to the cache
          IDBFS.dbs[name] = db;
          callback(null, db);
        };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },getLocalSet:function (mount, callback) {
        var entries = {};
  
        function isRealDir(p) {
          return p !== '.' && p !== '..';
        };
        function toAbsolute(root) {
          return function(p) {
            return PATH.join2(root, p);
          }
        };
  
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
  
        while (check.length) {
          var path = check.pop();
          var stat;
  
          try {
            stat = FS.stat(path);
          } catch (e) {
            return callback(e);
          }
  
          if (FS.isDir(stat.mode)) {
            check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)));
          }
  
          entries[path] = { timestamp: stat.mtime };
        }
  
        return callback(null, { type: 'local', entries: entries });
      },getRemoteSet:function (mount, callback) {
        var entries = {};
  
        IDBFS.getDB(mount.mountpoint, function(err, db) {
          if (err) return callback(err);
  
          try {
            var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readonly');
            transaction.onerror = function(e) {
              callback(this.error);
              e.preventDefault();
            };
  
            var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
            var index = store.index('timestamp');
  
            index.openKeyCursor().onsuccess = function(event) {
              var cursor = event.target.result;
  
              if (!cursor) {
                return callback(null, { type: 'remote', db: db, entries: entries });
              }
  
              entries[cursor.primaryKey] = { timestamp: cursor.key };
  
              cursor.continue();
            };
          } catch (e) {
            return callback(e);
          }
        });
      },loadLocalEntry:function (path, callback) {
        var stat, node;
  
        try {
          var lookup = FS.lookupPath(path);
          node = lookup.node;
          stat = FS.stat(path);
        } catch (e) {
          return callback(e);
        }
  
        if (FS.isDir(stat.mode)) {
          return callback(null, { timestamp: stat.mtime, mode: stat.mode });
        } else if (FS.isFile(stat.mode)) {
          // Performance consideration: storing a normal JavaScript array to a IndexedDB is much slower than storing a typed array.
          // Therefore always convert the file contents to a typed array first before writing the data to IndexedDB.
          node.contents = MEMFS.getFileDataAsTypedArray(node);
          return callback(null, { timestamp: stat.mtime, mode: stat.mode, contents: node.contents });
        } else {
          return callback(new Error('node type not supported'));
        }
      },storeLocalEntry:function (path, entry, callback) {
        try {
          if (FS.isDir(entry.mode)) {
            FS.mkdir(path, entry.mode);
          } else if (FS.isFile(entry.mode)) {
            FS.writeFile(path, entry.contents, { canOwn: true });
          } else {
            return callback(new Error('node type not supported'));
          }
  
          FS.chmod(path, entry.mode);
          FS.utime(path, entry.timestamp, entry.timestamp);
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },removeLocalEntry:function (path, callback) {
        try {
          var lookup = FS.lookupPath(path);
          var stat = FS.stat(path);
  
          if (FS.isDir(stat.mode)) {
            FS.rmdir(path);
          } else if (FS.isFile(stat.mode)) {
            FS.unlink(path);
          }
        } catch (e) {
          return callback(e);
        }
  
        callback(null);
      },loadRemoteEntry:function (store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) { callback(null, event.target.result); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },storeRemoteEntry:function (store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },removeRemoteEntry:function (store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() { callback(null); };
        req.onerror = function(e) {
          callback(this.error);
          e.preventDefault();
        };
      },reconcile:function (src, dst, callback) {
        var total = 0;
  
        var create = [];
        Object.keys(src.entries).forEach(function (key) {
          var e = src.entries[key];
          var e2 = dst.entries[key];
          if (!e2 || e.timestamp > e2.timestamp) {
            create.push(key);
            total++;
          }
        });
  
        var remove = [];
        Object.keys(dst.entries).forEach(function (key) {
          var e = dst.entries[key];
          var e2 = src.entries[key];
          if (!e2) {
            remove.push(key);
            total++;
          }
        });
  
        if (!total) {
          return callback(null);
        }
  
        var errored = false;
        var completed = 0;
        var db = src.type === 'remote' ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], 'readwrite');
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return callback(err);
            }
            return;
          }
          if (++completed >= total) {
            return callback(null);
          }
        };
  
        transaction.onerror = function(e) {
          done(this.error);
          e.preventDefault();
        };
  
        // sort paths in ascending order so directory entries are created
        // before the files inside them
        create.sort().forEach(function (path) {
          if (dst.type === 'local') {
            IDBFS.loadRemoteEntry(store, path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeLocalEntry(path, entry, done);
            });
          } else {
            IDBFS.loadLocalEntry(path, function (err, entry) {
              if (err) return done(err);
              IDBFS.storeRemoteEntry(store, path, entry, done);
            });
          }
        });
  
        // sort paths in descending order so files are deleted before their
        // parent directories
        remove.sort().reverse().forEach(function(path) {
          if (dst.type === 'local') {
            IDBFS.removeLocalEntry(path, done);
          } else {
            IDBFS.removeRemoteEntry(store, path, done);
          }
        });
      }};
  
  var NODEFS={isWindows:false,staticInit:function () {
        NODEFS.isWindows = !!process.platform.match(/^win/);
        var flags = process["binding"]("constants");
        // Node.js 4 compatibility: it has no namespaces for constants
        if (flags["fs"]) {
          flags = flags["fs"];
        }
        NODEFS.flagsForNodeMap = {
          "1024": flags["O_APPEND"],
          "64": flags["O_CREAT"],
          "128": flags["O_EXCL"],
          "0": flags["O_RDONLY"],
          "2": flags["O_RDWR"],
          "4096": flags["O_SYNC"],
          "512": flags["O_TRUNC"],
          "1": flags["O_WRONLY"]
        };
      },bufferFrom:function (arrayBuffer) {
        // Node.js < 4.5 compatibility: Buffer.from does not support ArrayBuffer
        // Buffer.from before 4.5 was just a method inherited from Uint8Array
        // Buffer.alloc has been added with Buffer.from together, so check it instead
        return Buffer.alloc ? Buffer.from(arrayBuffer) : new Buffer(arrayBuffer);
      },mount:function (mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, '/', NODEFS.getMode(mount.opts.root), 0);
      },createNode:function (parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node;
      },getMode:function (path) {
        var stat;
        try {
          stat = fs.lstatSync(path);
          if (NODEFS.isWindows) {
            // Node.js on Windows never represents permission bit 'x', so
            // propagate read bits to execute bits
            stat.mode = stat.mode | ((stat.mode & 292) >> 2);
          }
        } catch (e) {
          if (!e.code) throw e;
          throw new FS.ErrnoError(ERRNO_CODES[e.code]);
        }
        return stat.mode;
      },realPath:function (node) {
        var parts = [];
        while (node.parent !== node) {
          parts.push(node.name);
          node = node.parent;
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts);
      },flagsForNode:function (flags) {
        flags &= ~0x200000 /*O_PATH*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x800 /*O_NONBLOCK*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x8000 /*O_LARGEFILE*/; // Ignore this flag from musl, otherwise node.js fails to open the file.
        flags &= ~0x80000 /*O_CLOEXEC*/; // Some applications may pass it; it makes no sense for a single process.
        var newFlags = 0;
        for (var k in NODEFS.flagsForNodeMap) {
          if (flags & k) {
            newFlags |= NODEFS.flagsForNodeMap[k];
            flags ^= k;
          }
        }
  
        if (!flags) {
          return newFlags;
        } else {
          throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
        }
      },node_ops:{getattr:function (node) {
          var path = NODEFS.realPath(node);
          var stat;
          try {
            stat = fs.lstatSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          // node.js v0.10.20 doesn't report blksize and blocks on Windows. Fake them with default blksize of 4096.
          // See http://support.microsoft.com/kb/140365
          if (NODEFS.isWindows && !stat.blksize) {
            stat.blksize = 4096;
          }
          if (NODEFS.isWindows && !stat.blocks) {
            stat.blocks = (stat.size+stat.blksize-1)/stat.blksize|0;
          }
          return {
            dev: stat.dev,
            ino: stat.ino,
            mode: stat.mode,
            nlink: stat.nlink,
            uid: stat.uid,
            gid: stat.gid,
            rdev: stat.rdev,
            size: stat.size,
            atime: stat.atime,
            mtime: stat.mtime,
            ctime: stat.ctime,
            blksize: stat.blksize,
            blocks: stat.blocks
          };
        },setattr:function (node, attr) {
          var path = NODEFS.realPath(node);
          try {
            if (attr.mode !== undefined) {
              fs.chmodSync(path, attr.mode);
              // update the common node structure mode as well
              node.mode = attr.mode;
            }
            if (attr.timestamp !== undefined) {
              var date = new Date(attr.timestamp);
              fs.utimesSync(path, date, date);
            }
            if (attr.size !== undefined) {
              fs.truncateSync(path, attr.size);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },lookup:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          var mode = NODEFS.getMode(path);
          return NODEFS.createNode(parent, name, mode);
        },mknod:function (parent, name, mode, dev) {
          var node = NODEFS.createNode(parent, name, mode, dev);
          // create the backing node for this in the fs root as well
          var path = NODEFS.realPath(node);
          try {
            if (FS.isDir(node.mode)) {
              fs.mkdirSync(path, node.mode);
            } else {
              fs.writeFileSync(path, '', { mode: node.mode });
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
          return node;
        },rename:function (oldNode, newDir, newName) {
          var oldPath = NODEFS.realPath(oldNode);
          var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
          try {
            fs.renameSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },unlink:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.unlinkSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },rmdir:function (parent, name) {
          var path = PATH.join2(NODEFS.realPath(parent), name);
          try {
            fs.rmdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readdir:function (node) {
          var path = NODEFS.realPath(node);
          try {
            return fs.readdirSync(path);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },symlink:function (parent, newName, oldPath) {
          var newPath = PATH.join2(NODEFS.realPath(parent), newName);
          try {
            fs.symlinkSync(oldPath, newPath);
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },readlink:function (node) {
          var path = NODEFS.realPath(node);
          try {
            path = fs.readlinkSync(path);
            path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
            return path;
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        }},stream_ops:{open:function (stream) {
          var path = NODEFS.realPath(stream.node);
          try {
            if (FS.isFile(stream.node.mode)) {
              stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags));
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },close:function (stream) {
          try {
            if (FS.isFile(stream.node.mode) && stream.nfd) {
              fs.closeSync(stream.nfd);
            }
          } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },read:function (stream, buffer, offset, length, position) {
          // Node.js < 6 compatibility: node errors on 0 length reads
          if (length === 0) return 0;
          try {
            return fs.readSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },write:function (stream, buffer, offset, length, position) {
          try {
            return fs.writeSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position);
          } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES[e.code]);
          }
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              try {
                var stat = fs.fstatSync(stream.nfd);
                position += stat.size;
              } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code]);
              }
            }
          }
  
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
  
          return position;
        }}};
  
  var WORKERFS={DIR_MODE:16895,FILE_MODE:33279,reader:null,mount:function (mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync();
        var root = WORKERFS.createNode(null, '/', WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
          // return the parent node, creating subdirs as necessary
          var parts = path.split('/');
          var parent = root;
          for (var i = 0; i < parts.length-1; i++) {
            var curr = parts.slice(0, i+1).join('/');
            // Issue 4254: Using curr as a node name will prevent the node
            // from being found in FS.nameTable when FS.open is called on
            // a path which holds a child of this node,
            // given that all FS functions assume node names
            // are just their corresponding parts within their given path,
            // rather than incremental aggregates which include their parent's
            // directories.
            if (!createdParents[curr]) {
              createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0);
            }
            parent = createdParents[curr];
          }
          return parent;
        }
        function base(path) {
          var parts = path.split('/');
          return parts[parts.length-1];
        }
        // We also accept FileList here, by using Array.prototype
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
          WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate);
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
          WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"]);
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
          pack['metadata'].files.forEach(function(file) {
            var name = file.filename.substr(1); // remove initial slash
            WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack['blob'].slice(file.start, file.end));
          });
        });
        return root;
      },createNode:function (parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
          node.size = contents.size;
          node.contents = contents;
        } else {
          node.size = 4096;
          node.contents = {};
        }
        if (parent) {
          parent.contents[name] = node;
        }
        return node;
      },node_ops:{getattr:function (node) {
          return {
            dev: 1,
            ino: undefined,
            mode: node.mode,
            nlink: 1,
            uid: 0,
            gid: 0,
            rdev: undefined,
            size: node.size,
            atime: new Date(node.timestamp),
            mtime: new Date(node.timestamp),
            ctime: new Date(node.timestamp),
            blksize: 4096,
            blocks: Math.ceil(node.size / 4096),
          };
        },setattr:function (node, attr) {
          if (attr.mode !== undefined) {
            node.mode = attr.mode;
          }
          if (attr.timestamp !== undefined) {
            node.timestamp = attr.timestamp;
          }
        },lookup:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        },mknod:function (parent, name, mode, dev) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rename:function (oldNode, newDir, newName) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },unlink:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },rmdir:function (parent, name) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readdir:function (node) {
          var entries = ['.', '..'];
          for (var key in node.contents) {
            if (!node.contents.hasOwnProperty(key)) {
              continue;
            }
            entries.push(key);
          }
          return entries;
        },symlink:function (parent, newName, oldPath) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        },readlink:function (node) {
          throw new FS.ErrnoError(ERRNO_CODES.EPERM);
        }},stream_ops:{read:function (stream, buffer, offset, length, position) {
          if (position >= stream.node.size) return 0;
          var chunk = stream.node.contents.slice(position, position + length);
          var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
          buffer.set(new Uint8Array(ab), offset);
          return chunk.size;
        },write:function (stream, buffer, offset, length, position) {
          throw new FS.ErrnoError(ERRNO_CODES.EIO);
        },llseek:function (stream, offset, whence) {
          var position = offset;
          if (whence === 1) {  // SEEK_CUR.
            position += stream.position;
          } else if (whence === 2) {  // SEEK_END.
            if (FS.isFile(stream.node.mode)) {
              position += stream.node.size;
            }
          }
          if (position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL);
          }
          return position;
        }}};
  
  var ERRNO_MESSAGES={0:"Success",1:"Not super-user",2:"No such file or directory",3:"No such process",4:"Interrupted system call",5:"I/O error",6:"No such device or address",7:"Arg list too long",8:"Exec format error",9:"Bad file number",10:"No children",11:"No more processes",12:"Not enough core",13:"Permission denied",14:"Bad address",15:"Block device required",16:"Mount device busy",17:"File exists",18:"Cross-device link",19:"No such device",20:"Not a directory",21:"Is a directory",22:"Invalid argument",23:"Too many open files in system",24:"Too many open files",25:"Not a typewriter",26:"Text file busy",27:"File too large",28:"No space left on device",29:"Illegal seek",30:"Read only file system",31:"Too many links",32:"Broken pipe",33:"Math arg out of domain of func",34:"Math result not representable",35:"File locking deadlock error",36:"File or path name too long",37:"No record locks available",38:"Function not implemented",39:"Directory not empty",40:"Too many symbolic links",42:"No message of desired type",43:"Identifier removed",44:"Channel number out of range",45:"Level 2 not synchronized",46:"Level 3 halted",47:"Level 3 reset",48:"Link number out of range",49:"Protocol driver not attached",50:"No CSI structure available",51:"Level 2 halted",52:"Invalid exchange",53:"Invalid request descriptor",54:"Exchange full",55:"No anode",56:"Invalid request code",57:"Invalid slot",59:"Bad font file fmt",60:"Device not a stream",61:"No data (for no delay io)",62:"Timer expired",63:"Out of streams resources",64:"Machine is not on the network",65:"Package not installed",66:"The object is remote",67:"The link has been severed",68:"Advertise error",69:"Srmount error",70:"Communication error on send",71:"Protocol error",72:"Multihop attempted",73:"Cross mount point (not really error)",74:"Trying to read unreadable message",75:"Value too large for defined data type",76:"Given log. name not unique",77:"f.d. invalid for this operation",78:"Remote address changed",79:"Can   access a needed shared lib",80:"Accessing a corrupted shared lib",81:".lib section in a.out corrupted",82:"Attempting to link in too many libs",83:"Attempting to exec a shared library",84:"Illegal byte sequence",86:"Streams pipe error",87:"Too many users",88:"Socket operation on non-socket",89:"Destination address required",90:"Message too long",91:"Protocol wrong type for socket",92:"Protocol not available",93:"Unknown protocol",94:"Socket type not supported",95:"Not supported",96:"Protocol family not supported",97:"Address family not supported by protocol family",98:"Address already in use",99:"Address not available",100:"Network interface is not configured",101:"Network is unreachable",102:"Connection reset by network",103:"Connection aborted",104:"Connection reset by peer",105:"No buffer space available",106:"Socket is already connected",107:"Socket is not connected",108:"Can't send after socket shutdown",109:"Too many references",110:"Connection timed out",111:"Connection refused",112:"Host is down",113:"Host is unreachable",114:"Socket already connected",115:"Connection already in progress",116:"Stale file handle",122:"Quota exceeded",123:"No medium (in tape drive)",125:"Operation canceled",130:"Previous owner died",131:"State not recoverable"};
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};
  
  var _stdin=52736;
  
  var _stdout=52752;
  
  var _stderr=52768;var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
        if (!(e instanceof FS.ErrnoError)) throw e + ' : ' + stackTrace();
        return ___setErrNo(e.errno);
      },lookupPath:function (path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
  
        if (!path) return { path: '', node: null };
  
        var defaults = {
          follow_mount: true,
          recurse_count: 0
        };
        for (var key in defaults) {
          if (opts[key] === undefined) {
            opts[key] = defaults[key];
          }
        }
  
        if (opts.recurse_count > 8) {  // max recursive lookup of 8
          throw new FS.ErrnoError(40);
        }
  
        // split the path
        var parts = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), false);
  
        // start at the root
        var current = FS.root;
        var current_path = '/';
  
        for (var i = 0; i < parts.length; i++) {
          var islast = (i === parts.length-1);
          if (islast && opts.parent) {
            // stop resolving
            break;
          }
  
          current = FS.lookupNode(current, parts[i]);
          current_path = PATH.join2(current_path, parts[i]);
  
          // jump to the mount's root node if this is a mountpoint
          if (FS.isMountpoint(current)) {
            if (!islast || (islast && opts.follow_mount)) {
              current = current.mounted.root;
            }
          }
  
          // by default, lookupPath will not follow a symlink if it is the final path component.
          // setting opts.follow = true will override this behavior.
          if (!islast || opts.follow) {
            var count = 0;
            while (FS.isLink(current.mode)) {
              var link = FS.readlink(current_path);
              current_path = PATH.resolve(PATH.dirname(current_path), link);
  
              var lookup = FS.lookupPath(current_path, { recurse_count: opts.recurse_count });
              current = lookup.node;
  
              if (count++ > 40) {  // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
                throw new FS.ErrnoError(40);
              }
            }
          }
        }
  
        return { path: current_path, node: current };
      },getPath:function (node) {
        var path;
        while (true) {
          if (FS.isRoot(node)) {
            var mount = node.mount.mountpoint;
            if (!path) return mount;
            return mount[mount.length-1] !== '/' ? mount + '/' + path : mount + path;
          }
          path = path ? node.name + '/' + path : node.name;
          node = node.parent;
        }
      },hashName:function (parentid, name) {
        var hash = 0;
  
  
        for (var i = 0; i < name.length; i++) {
          hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
        }
        return ((parentid + hash) >>> 0) % FS.nameTable.length;
      },hashAddNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node;
      },hashRemoveNode:function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
          FS.nameTable[hash] = node.name_next;
        } else {
          var current = FS.nameTable[hash];
          while (current) {
            if (current.name_next === node) {
              current.name_next = node.name_next;
              break;
            }
            current = current.name_next;
          }
        }
      },lookupNode:function (parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
          throw new FS.ErrnoError(err, parent);
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
          var nodeName = node.name;
          if (node.parent.id === parent.id && nodeName === name) {
            return node;
          }
        }
        // if we failed to find it in the cache, call into the VFS
        return FS.lookup(parent, name);
      },createNode:function (parent, name, mode, rdev) {
        if (!FS.FSNode) {
          FS.FSNode = function(parent, name, mode, rdev) {
            if (!parent) {
              parent = this;  // root node sets parent to itself
            }
            this.parent = parent;
            this.mount = parent.mount;
            this.mounted = null;
            this.id = FS.nextInode++;
            this.name = name;
            this.mode = mode;
            this.node_ops = {};
            this.stream_ops = {};
            this.rdev = rdev;
          };
  
          FS.FSNode.prototype = {};
  
          // compatibility
          var readMode = 292 | 73;
          var writeMode = 146;
  
          // NOTE we must use Object.defineProperties instead of individual calls to
          // Object.defineProperty in order to make closure compiler happy
          Object.defineProperties(FS.FSNode.prototype, {
            read: {
              get: function() { return (this.mode & readMode) === readMode; },
              set: function(val) { val ? this.mode |= readMode : this.mode &= ~readMode; }
            },
            write: {
              get: function() { return (this.mode & writeMode) === writeMode; },
              set: function(val) { val ? this.mode |= writeMode : this.mode &= ~writeMode; }
            },
            isFolder: {
              get: function() { return FS.isDir(this.mode); }
            },
            isDevice: {
              get: function() { return FS.isChrdev(this.mode); }
            }
          });
        }
  
        var node = new FS.FSNode(parent, name, mode, rdev);
  
        FS.hashAddNode(node);
  
        return node;
      },destroyNode:function (node) {
        FS.hashRemoveNode(node);
      },isRoot:function (node) {
        return node === node.parent;
      },isMountpoint:function (node) {
        return !!node.mounted;
      },isFile:function (mode) {
        return (mode & 61440) === 32768;
      },isDir:function (mode) {
        return (mode & 61440) === 16384;
      },isLink:function (mode) {
        return (mode & 61440) === 40960;
      },isChrdev:function (mode) {
        return (mode & 61440) === 8192;
      },isBlkdev:function (mode) {
        return (mode & 61440) === 24576;
      },isFIFO:function (mode) {
        return (mode & 61440) === 4096;
      },isSocket:function (mode) {
        return (mode & 49152) === 49152;
      },flagModes:{"r":0,"rs":1052672,"r+":2,"w":577,"wx":705,"xw":705,"w+":578,"wx+":706,"xw+":706,"a":1089,"ax":1217,"xa":1217,"a+":1090,"ax+":1218,"xa+":1218},modeStringToFlags:function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === 'undefined') {
          throw new Error('Unknown file open mode: ' + str);
        }
        return flags;
      },flagsToPermissionString:function (flag) {
        var perms = ['r', 'w', 'rw'][flag & 3];
        if ((flag & 512)) {
          perms += 'w';
        }
        return perms;
      },nodePermissions:function (node, perms) {
        if (FS.ignorePermissions) {
          return 0;
        }
        // return 0 if any user, group or owner bits are set.
        if (perms.indexOf('r') !== -1 && !(node.mode & 292)) {
          return 13;
        } else if (perms.indexOf('w') !== -1 && !(node.mode & 146)) {
          return 13;
        } else if (perms.indexOf('x') !== -1 && !(node.mode & 73)) {
          return 13;
        }
        return 0;
      },mayLookup:function (dir) {
        var err = FS.nodePermissions(dir, 'x');
        if (err) return err;
        if (!dir.node_ops.lookup) return 13;
        return 0;
      },mayCreate:function (dir, name) {
        try {
          var node = FS.lookupNode(dir, name);
          return 17;
        } catch (e) {
        }
        return FS.nodePermissions(dir, 'wx');
      },mayDelete:function (dir, name, isdir) {
        var node;
        try {
          node = FS.lookupNode(dir, name);
        } catch (e) {
          return e.errno;
        }
        var err = FS.nodePermissions(dir, 'wx');
        if (err) {
          return err;
        }
        if (isdir) {
          if (!FS.isDir(node.mode)) {
            return 20;
          }
          if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
            return 16;
          }
        } else {
          if (FS.isDir(node.mode)) {
            return 21;
          }
        }
        return 0;
      },mayOpen:function (node, flags) {
        if (!node) {
          return 2;
        }
        if (FS.isLink(node.mode)) {
          return 40;
        } else if (FS.isDir(node.mode)) {
          if (FS.flagsToPermissionString(flags) !== 'r' || // opening for write
              (flags & 512)) { // TODO: check for O_SEARCH? (== search for dir only)
            return 21;
          }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
      },MAX_OPEN_FDS:4096,nextfd:function (fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
          if (!FS.streams[fd]) {
            return fd;
          }
        }
        throw new FS.ErrnoError(24);
      },getStream:function (fd) {
        return FS.streams[fd];
      },createStream:function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
          FS.FSStream = function(){};
          FS.FSStream.prototype = {};
          // compatibility
          Object.defineProperties(FS.FSStream.prototype, {
            object: {
              get: function() { return this.node; },
              set: function(val) { this.node = val; }
            },
            isRead: {
              get: function() { return (this.flags & 2097155) !== 1; }
            },
            isWrite: {
              get: function() { return (this.flags & 2097155) !== 0; }
            },
            isAppend: {
              get: function() { return (this.flags & 1024); }
            }
          });
        }
        // clone it, so we can return an instance of FSStream
        var newStream = new FS.FSStream();
        for (var p in stream) {
          newStream[p] = stream[p];
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream;
      },closeStream:function (fd) {
        FS.streams[fd] = null;
      },chrdev_stream_ops:{open:function (stream) {
          var device = FS.getDevice(stream.node.rdev);
          // override node's stream ops with the device's
          stream.stream_ops = device.stream_ops;
          // forward the open call
          if (stream.stream_ops.open) {
            stream.stream_ops.open(stream);
          }
        },llseek:function () {
          throw new FS.ErrnoError(29);
        }},major:function (dev) {
        return ((dev) >> 8);
      },minor:function (dev) {
        return ((dev) & 0xff);
      },makedev:function (ma, mi) {
        return ((ma) << 8 | (mi));
      },registerDevice:function (dev, ops) {
        FS.devices[dev] = { stream_ops: ops };
      },getDevice:function (dev) {
        return FS.devices[dev];
      },getMounts:function (mount) {
        var mounts = [];
        var check = [mount];
  
        while (check.length) {
          var m = check.pop();
  
          mounts.push(m);
  
          check.push.apply(check, m.mounts);
        }
  
        return mounts;
      },syncfs:function (populate, callback) {
        if (typeof(populate) === 'function') {
          callback = populate;
          populate = false;
        }
  
        FS.syncFSRequests++;
  
        if (FS.syncFSRequests > 1) {
          console.log('warning: ' + FS.syncFSRequests + ' FS.syncfs operations in flight at once, probably just doing extra work');
        }
  
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
  
        function doCallback(err) {
          assert(FS.syncFSRequests > 0);
          FS.syncFSRequests--;
          return callback(err);
        }
  
        function done(err) {
          if (err) {
            if (!done.errored) {
              done.errored = true;
              return doCallback(err);
            }
            return;
          }
          if (++completed >= mounts.length) {
            doCallback(null);
          }
        };
  
        // sync all mounts
        mounts.forEach(function (mount) {
          if (!mount.type.syncfs) {
            return done(null);
          }
          mount.type.syncfs(mount, populate, done);
        });
      },mount:function (type, opts, mountpoint) {
        var root = mountpoint === '/';
        var pseudo = !mountpoint;
        var node;
  
        if (root && FS.root) {
          throw new FS.ErrnoError(16);
        } else if (!root && !pseudo) {
          var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
          mountpoint = lookup.path;  // use the absolute path
          node = lookup.node;
  
          if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(16);
          }
  
          if (!FS.isDir(node.mode)) {
            throw new FS.ErrnoError(20);
          }
        }
  
        var mount = {
          type: type,
          opts: opts,
          mountpoint: mountpoint,
          mounts: []
        };
  
        // create a root node for the fs
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
  
        if (root) {
          FS.root = mountRoot;
        } else if (node) {
          // set as a mountpoint
          node.mounted = mount;
  
          // add the new mount to the current mount's children
          if (node.mount) {
            node.mount.mounts.push(mount);
          }
        }
  
        return mountRoot;
      },unmount:function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, { follow_mount: false });
  
        if (!FS.isMountpoint(lookup.node)) {
          throw new FS.ErrnoError(22);
        }
  
        // destroy the nodes for this mount, and all its child mounts
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
  
        Object.keys(FS.nameTable).forEach(function (hash) {
          var current = FS.nameTable[hash];
  
          while (current) {
            var next = current.name_next;
  
            if (mounts.indexOf(current.mount) !== -1) {
              FS.destroyNode(current);
            }
  
            current = next;
          }
        });
  
        // no longer a mountpoint
        node.mounted = null;
  
        // remove this mount from the child mounts
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1);
      },lookup:function (parent, name) {
        return parent.node_ops.lookup(parent, name);
      },mknod:function (path, mode, dev) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === '.' || name === '..') {
          throw new FS.ErrnoError(22);
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.mknod) {
          throw new FS.ErrnoError(1);
        }
        return parent.node_ops.mknod(parent, name, mode, dev);
      },create:function (path, mode) {
        mode = mode !== undefined ? mode : 438 /* 0666 */;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0);
      },mkdir:function (path, mode) {
        mode = mode !== undefined ? mode : 511 /* 0777 */;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0);
      },mkdirTree:function (path, mode) {
        var dirs = path.split('/');
        var d = '';
        for (var i = 0; i < dirs.length; ++i) {
          if (!dirs[i]) continue;
          d += '/' + dirs[i];
          try {
            FS.mkdir(d, mode);
          } catch(e) {
            if (e.errno != 17) throw e;
          }
        }
      },mkdev:function (path, mode, dev) {
        if (typeof(dev) === 'undefined') {
          dev = mode;
          mode = 438 /* 0666 */;
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev);
      },symlink:function (oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
          throw new FS.ErrnoError(2);
        }
        var lookup = FS.lookupPath(newpath, { parent: true });
        var parent = lookup.node;
        if (!parent) {
          throw new FS.ErrnoError(2);
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.symlink) {
          throw new FS.ErrnoError(1);
        }
        return parent.node_ops.symlink(parent, newname, oldpath);
      },rename:function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        // parents must exist
        var lookup, old_dir, new_dir;
        try {
          lookup = FS.lookupPath(old_path, { parent: true });
          old_dir = lookup.node;
          lookup = FS.lookupPath(new_path, { parent: true });
          new_dir = lookup.node;
        } catch (e) {
          throw new FS.ErrnoError(16);
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(2);
        // need to be part of the same mount
        if (old_dir.mount !== new_dir.mount) {
          throw new FS.ErrnoError(18);
        }
        // source must exist
        var old_node = FS.lookupNode(old_dir, old_name);
        // old path should not be an ancestor of the new path
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(22);
        }
        // new path should not be an ancestor of the old path
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== '.') {
          throw new FS.ErrnoError(39);
        }
        // see if the new path already exists
        var new_node;
        try {
          new_node = FS.lookupNode(new_dir, new_name);
        } catch (e) {
          // not fatal
        }
        // early out if nothing needs to change
        if (old_node === new_node) {
          return;
        }
        // we'll need to delete the old entry
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        // need delete permissions if we'll be overwriting.
        // need create permissions if new doesn't already exist.
        err = new_node ?
          FS.mayDelete(new_dir, new_name, isdir) :
          FS.mayCreate(new_dir, new_name);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!old_dir.node_ops.rename) {
          throw new FS.ErrnoError(1);
        }
        if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
          throw new FS.ErrnoError(16);
        }
        // if we are going to change the parent, check write permissions
        if (new_dir !== old_dir) {
          err = FS.nodePermissions(old_dir, 'w');
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        try {
          if (FS.trackingDelegate['willMovePath']) {
            FS.trackingDelegate['willMovePath'](old_path, new_path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
        // remove the node from the lookup hash
        FS.hashRemoveNode(old_node);
        // do the underlying fs rename
        try {
          old_dir.node_ops.rename(old_node, new_dir, new_name);
        } catch (e) {
          throw e;
        } finally {
          // add the node back to the hash (in case node_ops.rename
          // changed its name)
          FS.hashAddNode(old_node);
        }
        try {
          if (FS.trackingDelegate['onMovePath']) FS.trackingDelegate['onMovePath'](old_path, new_path);
        } catch(e) {
          console.log("FS.trackingDelegate['onMovePath']('"+old_path+"', '"+new_path+"') threw an exception: " + e.message);
        }
      },rmdir:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.rmdir) {
          throw new FS.ErrnoError(1);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(16);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
          throw new FS.ErrnoError(20);
        }
        return node.node_ops.readdir(node);
      },unlink:function (path) {
        var lookup = FS.lookupPath(path, { parent: true });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
          // According to POSIX, we should map EISDIR to EPERM, but
          // we instead do what Linux does (and we must, as we use
          // the musl linux libc).
          throw new FS.ErrnoError(err);
        }
        if (!parent.node_ops.unlink) {
          throw new FS.ErrnoError(1);
        }
        if (FS.isMountpoint(node)) {
          throw new FS.ErrnoError(16);
        }
        try {
          if (FS.trackingDelegate['willDeletePath']) {
            FS.trackingDelegate['willDeletePath'](path);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['willDeletePath']('"+path+"') threw an exception: " + e.message);
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
          if (FS.trackingDelegate['onDeletePath']) FS.trackingDelegate['onDeletePath'](path);
        } catch(e) {
          console.log("FS.trackingDelegate['onDeletePath']('"+path+"') threw an exception: " + e.message);
        }
      },readlink:function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
          throw new FS.ErrnoError(2);
        }
        if (!link.node_ops.readlink) {
          throw new FS.ErrnoError(22);
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link));
      },stat:function (path, dontFollow) {
        var lookup = FS.lookupPath(path, { follow: !dontFollow });
        var node = lookup.node;
        if (!node) {
          throw new FS.ErrnoError(2);
        }
        if (!node.node_ops.getattr) {
          throw new FS.ErrnoError(1);
        }
        return node.node_ops.getattr(node);
      },lstat:function (path) {
        return FS.stat(path, true);
      },chmod:function (path, mode, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(1);
        }
        node.node_ops.setattr(node, {
          mode: (mode & 4095) | (node.mode & ~4095),
          timestamp: Date.now()
        });
      },lchmod:function (path, mode) {
        FS.chmod(path, mode, true);
      },fchmod:function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(9);
        }
        FS.chmod(stream.node, mode);
      },chown:function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: !dontFollow });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(1);
        }
        node.node_ops.setattr(node, {
          timestamp: Date.now()
          // we ignore the uid / gid for now
        });
      },lchown:function (path, uid, gid) {
        FS.chown(path, uid, gid, true);
      },fchown:function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(9);
        }
        FS.chown(stream.node, uid, gid);
      },truncate:function (path, len) {
        if (len < 0) {
          throw new FS.ErrnoError(22);
        }
        var node;
        if (typeof path === 'string') {
          var lookup = FS.lookupPath(path, { follow: true });
          node = lookup.node;
        } else {
          node = path;
        }
        if (!node.node_ops.setattr) {
          throw new FS.ErrnoError(1);
        }
        if (FS.isDir(node.mode)) {
          throw new FS.ErrnoError(21);
        }
        if (!FS.isFile(node.mode)) {
          throw new FS.ErrnoError(22);
        }
        var err = FS.nodePermissions(node, 'w');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        node.node_ops.setattr(node, {
          size: len,
          timestamp: Date.now()
        });
      },ftruncate:function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
          throw new FS.ErrnoError(9);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(22);
        }
        FS.truncate(stream.node, len);
      },utime:function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, { follow: true });
        var node = lookup.node;
        node.node_ops.setattr(node, {
          timestamp: Math.max(atime, mtime)
        });
      },open:function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
          throw new FS.ErrnoError(2);
        }
        flags = typeof flags === 'string' ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === 'undefined' ? 438 /* 0666 */ : mode;
        if ((flags & 64)) {
          mode = (mode & 4095) | 32768;
        } else {
          mode = 0;
        }
        var node;
        if (typeof path === 'object') {
          node = path;
        } else {
          path = PATH.normalize(path);
          try {
            var lookup = FS.lookupPath(path, {
              follow: !(flags & 131072)
            });
            node = lookup.node;
          } catch (e) {
            // ignore
          }
        }
        // perhaps we need to create the node
        var created = false;
        if ((flags & 64)) {
          if (node) {
            // if O_CREAT and O_EXCL are set, error out if the node already exists
            if ((flags & 128)) {
              throw new FS.ErrnoError(17);
            }
          } else {
            // node doesn't exist, try to create it
            node = FS.mknod(path, mode, 0);
            created = true;
          }
        }
        if (!node) {
          throw new FS.ErrnoError(2);
        }
        // can't truncate a device
        if (FS.isChrdev(node.mode)) {
          flags &= ~512;
        }
        // if asked only for a directory, then this must be one
        if ((flags & 65536) && !FS.isDir(node.mode)) {
          throw new FS.ErrnoError(20);
        }
        // check permissions, if this is not a file we just created now (it is ok to
        // create and write to a file with read-only permissions; it is read-only
        // for later use)
        if (!created) {
          var err = FS.mayOpen(node, flags);
          if (err) {
            throw new FS.ErrnoError(err);
          }
        }
        // do truncation if necessary
        if ((flags & 512)) {
          FS.truncate(node, 0);
        }
        // we've already handled these, don't pass down to the underlying vfs
        flags &= ~(128 | 512);
  
        // register the stream with the filesystem
        var stream = FS.createStream({
          node: node,
          path: FS.getPath(node),  // we want the absolute path to the node
          flags: flags,
          seekable: true,
          position: 0,
          stream_ops: node.stream_ops,
          // used by the file family libc calls (fopen, fwrite, ferror, etc.)
          ungotten: [],
          error: false
        }, fd_start, fd_end);
        // call the new stream's open function
        if (stream.stream_ops.open) {
          stream.stream_ops.open(stream);
        }
        if (Module['logReadFiles'] && !(flags & 1)) {
          if (!FS.readFiles) FS.readFiles = {};
          if (!(path in FS.readFiles)) {
            FS.readFiles[path] = 1;
            console.log("FS.trackingDelegate error on read file: " + path);
          }
        }
        try {
          if (FS.trackingDelegate['onOpenFile']) {
            var trackingFlags = 0;
            if ((flags & 2097155) !== 1) {
              trackingFlags |= FS.tracking.openFlags.READ;
            }
            if ((flags & 2097155) !== 0) {
              trackingFlags |= FS.tracking.openFlags.WRITE;
            }
            FS.trackingDelegate['onOpenFile'](path, trackingFlags);
          }
        } catch(e) {
          console.log("FS.trackingDelegate['onOpenFile']('"+path+"', flags) threw an exception: " + e.message);
        }
        return stream;
      },close:function (stream) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(9);
        }
        if (stream.getdents) stream.getdents = null; // free readdir state
        try {
          if (stream.stream_ops.close) {
            stream.stream_ops.close(stream);
          }
        } catch (e) {
          throw e;
        } finally {
          FS.closeStream(stream.fd);
        }
        stream.fd = null;
      },isClosed:function (stream) {
        return stream.fd === null;
      },llseek:function (stream, offset, whence) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(9);
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
          throw new FS.ErrnoError(29);
        }
        if (whence != 0 /* SEEK_SET */ && whence != 1 /* SEEK_CUR */ && whence != 2 /* SEEK_END */) {
          throw new FS.ErrnoError(22);
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position;
      },read:function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(22);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(9);
        }
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(9);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(21);
        }
        if (!stream.stream_ops.read) {
          throw new FS.ErrnoError(22);
        }
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(29);
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead;
      },write:function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
          throw new FS.ErrnoError(22);
        }
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(9);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(9);
        }
        if (FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(21);
        }
        if (!stream.stream_ops.write) {
          throw new FS.ErrnoError(22);
        }
        if (stream.flags & 1024) {
          // seek to the end before writing in append mode
          FS.llseek(stream, 0, 2);
        }
        var seeking = typeof position !== 'undefined';
        if (!seeking) {
          position = stream.position;
        } else if (!stream.seekable) {
          throw new FS.ErrnoError(29);
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
          if (stream.path && FS.trackingDelegate['onWriteToFile']) FS.trackingDelegate['onWriteToFile'](stream.path);
        } catch(e) {
          console.log("FS.trackingDelegate['onWriteToFile']('"+stream.path+"') threw an exception: " + e.message);
        }
        return bytesWritten;
      },allocate:function (stream, offset, length) {
        if (FS.isClosed(stream)) {
          throw new FS.ErrnoError(9);
        }
        if (offset < 0 || length <= 0) {
          throw new FS.ErrnoError(22);
        }
        if ((stream.flags & 2097155) === 0) {
          throw new FS.ErrnoError(9);
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
          throw new FS.ErrnoError(19);
        }
        if (!stream.stream_ops.allocate) {
          throw new FS.ErrnoError(95);
        }
        stream.stream_ops.allocate(stream, offset, length);
      },mmap:function (stream, buffer, offset, length, position, prot, flags) {
        // TODO if PROT is PROT_WRITE, make sure we have write access
        if ((stream.flags & 2097155) === 1) {
          throw new FS.ErrnoError(13);
        }
        if (!stream.stream_ops.mmap) {
          throw new FS.ErrnoError(19);
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags);
      },msync:function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
          return 0;
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
      },munmap:function (stream) {
        return 0;
      },ioctl:function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
          throw new FS.ErrnoError(25);
        }
        return stream.stream_ops.ioctl(stream, cmd, arg);
      },readFile:function (path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'r';
        opts.encoding = opts.encoding || 'binary';
        if (opts.encoding !== 'utf8' && opts.encoding !== 'binary') {
          throw new Error('Invalid encoding type "' + opts.encoding + '"');
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === 'utf8') {
          ret = UTF8ArrayToString(buf, 0);
        } else if (opts.encoding === 'binary') {
          ret = buf;
        }
        FS.close(stream);
        return ret;
      },writeFile:function (path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || 'w';
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === 'string') {
          var buf = new Uint8Array(lengthBytesUTF8(data)+1);
          var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
          FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn);
        } else if (ArrayBuffer.isView(data)) {
          FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
        } else {
          throw new Error('Unsupported data type');
        }
        FS.close(stream);
      },cwd:function () {
        return FS.currentPath;
      },chdir:function (path) {
        var lookup = FS.lookupPath(path, { follow: true });
        if (lookup.node === null) {
          throw new FS.ErrnoError(2);
        }
        if (!FS.isDir(lookup.node.mode)) {
          throw new FS.ErrnoError(20);
        }
        var err = FS.nodePermissions(lookup.node, 'x');
        if (err) {
          throw new FS.ErrnoError(err);
        }
        FS.currentPath = lookup.path;
      },createDefaultDirectories:function () {
        FS.mkdir('/tmp');
        FS.mkdir('/home');
        FS.mkdir('/home/web_user');
      },createDefaultDevices:function () {
        // create /dev
        FS.mkdir('/dev');
        // setup /dev/null
        FS.registerDevice(FS.makedev(1, 3), {
          read: function() { return 0; },
          write: function(stream, buffer, offset, length, pos) { return length; }
        });
        FS.mkdev('/dev/null', FS.makedev(1, 3));
        // setup /dev/tty and /dev/tty1
        // stderr needs to print output using Module['printErr']
        // so we register a second tty just for it.
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev('/dev/tty', FS.makedev(5, 0));
        FS.mkdev('/dev/tty1', FS.makedev(6, 0));
        // setup /dev/[u]random
        var random_device;
        if (typeof crypto === 'object' && typeof crypto['getRandomValues'] === 'function') {
          // for modern web browsers
          var randomBuffer = new Uint8Array(1);
          random_device = function() { crypto.getRandomValues(randomBuffer); return randomBuffer[0]; };
        } else if (ENVIRONMENT_IS_NODE) {
          // for nodejs with or without crypto support included
          try {
              var crypto_module = require('crypto');
              // nodejs has crypto support
              random_device = function() { return crypto_module['randomBytes'](1)[0]; };
          } catch (e) {
              // nodejs doesn't have crypto support so fallback to Math.random
              random_device = function() { return (Math.random()*256)|0; };
          }
        } else {
          // default for ES5 platforms
          random_device = function() { abort("random_device"); /*Math.random() is not safe for random number generation, so this fallback random_device implementation aborts... see emscripten-core/emscripten/pull/7096 */ };
        }
        FS.createDevice('/dev', 'random', random_device);
        FS.createDevice('/dev', 'urandom', random_device);
        // we're not going to emulate the actual shm device,
        // just create the tmp dirs that reside in it commonly
        FS.mkdir('/dev/shm');
        FS.mkdir('/dev/shm/tmp');
      },createSpecialDirectories:function () {
        // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the name of the stream for fd 6 (see test_unistd_ttyname)
        FS.mkdir('/proc');
        FS.mkdir('/proc/self');
        FS.mkdir('/proc/self/fd');
        FS.mount({
          mount: function() {
            var node = FS.createNode('/proc/self', 'fd', 16384 | 511 /* 0777 */, 73);
            node.node_ops = {
              lookup: function(parent, name) {
                var fd = +name;
                var stream = FS.getStream(fd);
                if (!stream) throw new FS.ErrnoError(9);
                var ret = {
                  parent: null,
                  mount: { mountpoint: 'fake' },
                  node_ops: { readlink: function() { return stream.path } }
                };
                ret.parent = ret; // make it look like a simple root node
                return ret;
              }
            };
            return node;
          }
        }, {}, '/proc/self/fd');
      },createStandardStreams:function () {
        // TODO deprecate the old functionality of a single
        // input / output callback and that utilizes FS.createDevice
        // and instead require a unique set of stream ops
  
        // by default, we symlink the standard streams to the
        // default tty devices. however, if the standard streams
        // have been overwritten we create a unique device for
        // them instead.
        if (Module['stdin']) {
          FS.createDevice('/dev', 'stdin', Module['stdin']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdin');
        }
        if (Module['stdout']) {
          FS.createDevice('/dev', 'stdout', null, Module['stdout']);
        } else {
          FS.symlink('/dev/tty', '/dev/stdout');
        }
        if (Module['stderr']) {
          FS.createDevice('/dev', 'stderr', null, Module['stderr']);
        } else {
          FS.symlink('/dev/tty1', '/dev/stderr');
        }
  
        // open default streams for the stdin, stdout and stderr devices
        var stdin = FS.open('/dev/stdin', 'r');
        assert(stdin.fd === 0, 'invalid handle for stdin (' + stdin.fd + ')');
  
        var stdout = FS.open('/dev/stdout', 'w');
        assert(stdout.fd === 1, 'invalid handle for stdout (' + stdout.fd + ')');
  
        var stderr = FS.open('/dev/stderr', 'w');
        assert(stderr.fd === 2, 'invalid handle for stderr (' + stderr.fd + ')');
      },ensureErrnoError:function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
          this.node = node;
          this.setErrno = function(errno) {
            this.errno = errno;
            for (var key in ERRNO_CODES) {
              if (ERRNO_CODES[key] === errno) {
                this.code = key;
                break;
              }
            }
          };
          this.setErrno(errno);
          this.message = ERRNO_MESSAGES[errno];
          // Node.js compatibility: assigning on this.stack fails on Node 4 (but fixed on Node 8)
          if (this.stack) Object.defineProperty(this, "stack", { value: (new Error).stack, writable: true });
          if (this.stack) this.stack = demangleAll(this.stack);
        };
        FS.ErrnoError.prototype = new Error();
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        // Some errors may happen quite a bit, to avoid overhead we reuse them (and suffer a lack of stack info)
        [2].forEach(function(code) {
          FS.genericErrors[code] = new FS.ErrnoError(code);
          FS.genericErrors[code].stack = '<generic error, no stack>';
        });
      },staticInit:function () {
        FS.ensureErrnoError();
  
        FS.nameTable = new Array(4096);
  
        FS.mount(MEMFS, {}, '/');
  
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
  
        FS.filesystems = {
          'MEMFS': MEMFS,
          'IDBFS': IDBFS,
          'NODEFS': NODEFS,
          'WORKERFS': WORKERFS,
        };
      },init:function (input, output, error) {
        assert(!FS.init.initialized, 'FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)');
        FS.init.initialized = true;
  
        FS.ensureErrnoError();
  
        // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
        Module['stdin'] = input || Module['stdin'];
        Module['stdout'] = output || Module['stdout'];
        Module['stderr'] = error || Module['stderr'];
  
        FS.createStandardStreams();
      },quit:function () {
        FS.init.initialized = false;
        // force-flush all streams, so we get musl std streams printed out
        var fflush = Module['_fflush'];
        if (fflush) fflush(0);
        // close all of our streams
        for (var i = 0; i < FS.streams.length; i++) {
          var stream = FS.streams[i];
          if (!stream) {
            continue;
          }
          FS.close(stream);
        }
      },getMode:function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode;
      },joinPath:function (parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == '/') path = path.substr(1);
        return path;
      },absolutePath:function (relative, base) {
        return PATH.resolve(base, relative);
      },standardizePath:function (path) {
        return PATH.normalize(path);
      },findObject:function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
          return ret.object;
        } else {
          ___setErrNo(ret.error);
          return null;
        }
      },analyzePath:function (path, dontResolveLastLink) {
        // operate from within the context of the symlink's target
        try {
          var lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          path = lookup.path;
        } catch (e) {
        }
        var ret = {
          isRoot: false, exists: false, error: 0, name: null, path: null, object: null,
          parentExists: false, parentPath: null, parentObject: null
        };
        try {
          var lookup = FS.lookupPath(path, { parent: true });
          ret.parentExists = true;
          ret.parentPath = lookup.path;
          ret.parentObject = lookup.node;
          ret.name = PATH.basename(path);
          lookup = FS.lookupPath(path, { follow: !dontResolveLastLink });
          ret.exists = true;
          ret.path = lookup.path;
          ret.object = lookup.node;
          ret.name = lookup.node.name;
          ret.isRoot = lookup.path === '/';
        } catch (e) {
          ret.error = e.errno;
        };
        return ret;
      },createFolder:function (parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode);
      },createPath:function (parent, path, canRead, canWrite) {
        parent = typeof parent === 'string' ? parent : FS.getPath(parent);
        var parts = path.split('/').reverse();
        while (parts.length) {
          var part = parts.pop();
          if (!part) continue;
          var current = PATH.join2(parent, part);
          try {
            FS.mkdir(current);
          } catch (e) {
            // ignore EEXIST
          }
          parent = current;
        }
        return current;
      },createFile:function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode);
      },createDataFile:function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
          if (typeof data === 'string') {
            var arr = new Array(data.length);
            for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
            data = arr;
          }
          // make sure we can write to the file
          FS.chmod(node, mode | 146);
          var stream = FS.open(node, 'w');
          FS.write(stream, data, 0, data.length, 0, canOwn);
          FS.close(stream);
          FS.chmod(node, mode);
        }
        return node;
      },createDevice:function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        // Create a fake device that a set of stream ops to emulate
        // the old behavior.
        FS.registerDevice(dev, {
          open: function(stream) {
            stream.seekable = false;
          },
          close: function(stream) {
            // flush any pending line data
            if (output && output.buffer && output.buffer.length) {
              output(10);
            }
          },
          read: function(stream, buffer, offset, length, pos /* ignored */) {
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
              var result;
              try {
                result = input();
              } catch (e) {
                throw new FS.ErrnoError(5);
              }
              if (result === undefined && bytesRead === 0) {
                throw new FS.ErrnoError(11);
              }
              if (result === null || result === undefined) break;
              bytesRead++;
              buffer[offset+i] = result;
            }
            if (bytesRead) {
              stream.node.timestamp = Date.now();
            }
            return bytesRead;
          },
          write: function(stream, buffer, offset, length, pos) {
            for (var i = 0; i < length; i++) {
              try {
                output(buffer[offset+i]);
              } catch (e) {
                throw new FS.ErrnoError(5);
              }
            }
            if (length) {
              stream.node.timestamp = Date.now();
            }
            return i;
          }
        });
        return FS.mkdev(path, mode, dev);
      },createLink:function (parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === 'string' ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path);
      },forceLoadFile:function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== 'undefined') {
          throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
        } else if (Module['read']) {
          // Command-line.
          try {
            // WARNING: Can't read binary files in V8's d8 or tracemonkey's js, as
            //          read() will try to parse UTF8.
            obj.contents = intArrayFromString(Module['read'](obj.url), true);
            obj.usedBytes = obj.contents.length;
          } catch (e) {
            success = false;
          }
        } else {
          throw new Error('Cannot load without read() or XMLHttpRequest.');
        }
        if (!success) ___setErrNo(5);
        return success;
      },createLazyFile:function (parent, name, url, canRead, canWrite) {
        // Lazy chunked Uint8Array (implements get and length from Uint8Array). Actual getting is abstracted away for eventual reuse.
        function LazyUint8Array() {
          this.lengthKnown = false;
          this.chunks = []; // Loaded chunks. Index is the chunk number
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
          if (idx > this.length-1 || idx < 0) {
            return undefined;
          }
          var chunkOffset = idx % this.chunkSize;
          var chunkNum = (idx / this.chunkSize)|0;
          return this.getter(chunkNum)[chunkOffset];
        }
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
          this.getter = getter;
        }
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
          // Find length
          var xhr = new XMLHttpRequest();
          xhr.open('HEAD', url, false);
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          var datalength = Number(xhr.getResponseHeader("Content-length"));
          var header;
          var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
          var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
  
          var chunkSize = 1024*1024; // Chunk size in bytes
  
          if (!hasByteServing) chunkSize = datalength;
  
          // Function to get a range from the remote URL.
          var doXHR = (function(from, to) {
            if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
            if (to > datalength-1) throw new Error("only " + datalength + " bytes available! programmer error!");
  
            // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
  
            // Some hints to the browser that we want binary data.
            if (typeof Uint8Array != 'undefined') xhr.responseType = 'arraybuffer';
            if (xhr.overrideMimeType) {
              xhr.overrideMimeType('text/plain; charset=x-user-defined');
            }
  
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            if (xhr.response !== undefined) {
              return new Uint8Array(xhr.response || []);
            } else {
              return intArrayFromString(xhr.responseText || '', true);
            }
          });
          var lazyArray = this;
          lazyArray.setDataGetter(function(chunkNum) {
            var start = chunkNum * chunkSize;
            var end = (chunkNum+1) * chunkSize - 1; // including this byte
            end = Math.min(end, datalength-1); // if datalength-1 is selected, this is the last block
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") {
              lazyArray.chunks[chunkNum] = doXHR(start, end);
            }
            if (typeof(lazyArray.chunks[chunkNum]) === "undefined") throw new Error("doXHR failed!");
            return lazyArray.chunks[chunkNum];
          });
  
          if (usesGzip || !datalength) {
            // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
            chunkSize = datalength = 1; // this will force getter(0)/doXHR do download the whole file
            datalength = this.getter(0).length;
            chunkSize = datalength;
            console.log("LazyFiles on gzip forces download of the whole file when length is accessed");
          }
  
          this._length = datalength;
          this._chunkSize = chunkSize;
          this.lengthKnown = true;
        }
        if (typeof XMLHttpRequest !== 'undefined') {
          if (!ENVIRONMENT_IS_WORKER) throw 'Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc';
          var lazyArray = new LazyUint8Array();
          Object.defineProperties(lazyArray, {
            length: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._length;
              }
            },
            chunkSize: {
              get: function() {
                if(!this.lengthKnown) {
                  this.cacheLength();
                }
                return this._chunkSize;
              }
            }
          });
  
          var properties = { isDevice: false, contents: lazyArray };
        } else {
          var properties = { isDevice: false, url: url };
        }
  
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        // This is a total hack, but I want to get this lazy file code out of the
        // core of MEMFS. If we want to keep this lazy file concept I feel it should
        // be its own thin LAZYFS proxying calls to MEMFS.
        if (properties.contents) {
          node.contents = properties.contents;
        } else if (properties.url) {
          node.contents = null;
          node.url = properties.url;
        }
        // Add a function that defers querying the file size until it is asked the first time.
        Object.defineProperties(node, {
          usedBytes: {
            get: function() { return this.contents.length; }
          }
        });
        // override each stream op with one that tries to force load the lazy file first
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
          var fn = node.stream_ops[key];
          stream_ops[key] = function forceLoadLazyFile() {
            if (!FS.forceLoadFile(node)) {
              throw new FS.ErrnoError(5);
            }
            return fn.apply(null, arguments);
          };
        });
        // use a custom read function
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
          if (!FS.forceLoadFile(node)) {
            throw new FS.ErrnoError(5);
          }
          var contents = stream.node.contents;
          if (position >= contents.length)
            return 0;
          var size = Math.min(contents.length - position, length);
          assert(size >= 0);
          if (contents.slice) { // normal array
            for (var i = 0; i < size; i++) {
              buffer[offset + i] = contents[position + i];
            }
          } else {
            for (var i = 0; i < size; i++) { // LazyUint8Array from sync binary XHR
              buffer[offset + i] = contents.get(position + i);
            }
          }
          return size;
        };
        node.stream_ops = stream_ops;
        return node;
      },createPreloadedFile:function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init(); // XXX perhaps this method should move onto Browser?
        // TODO we should allow people to just pass in a complete filename instead
        // of parent and name being that we just join them anyways
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency('cp ' + fullname); // might have several active requests for the same fullname
        function processData(byteArray) {
          function finish(byteArray) {
            if (preFinish) preFinish();
            if (!dontCreateFile) {
              FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
            }
            if (onload) onload();
            removeRunDependency(dep);
          }
          var handled = false;
          Module['preloadPlugins'].forEach(function(plugin) {
            if (handled) return;
            if (plugin['canHandle'](fullname)) {
              plugin['handle'](byteArray, fullname, finish, function() {
                if (onerror) onerror();
                removeRunDependency(dep);
              });
              handled = true;
            }
          });
          if (!handled) finish(byteArray);
        }
        addRunDependency(dep);
        if (typeof url == 'string') {
          Browser.asyncLoad(url, function(byteArray) {
            processData(byteArray);
          }, onerror);
        } else {
          processData(url);
        }
      },indexedDB:function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
      },DB_NAME:function () {
        return 'EM_FS_' + window.location.pathname;
      },DB_VERSION:20,DB_STORE_NAME:"FILE_DATA",saveFilesToDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
          console.log('creating db');
          var db = openRequest.result;
          db.createObjectStore(FS.DB_STORE_NAME);
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          var transaction = db.transaction([FS.DB_STORE_NAME], 'readwrite');
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var putRequest = files.put(FS.analyzePath(path).object.contents, path);
            putRequest.onsuccess = function putRequest_onsuccess() { ok++; if (ok + fail == total) finish() };
            putRequest.onerror = function putRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      },loadFilesFromDB:function (paths, onload, onerror) {
        onload = onload || function(){};
        onerror = onerror || function(){};
        var indexedDB = FS.indexedDB();
        try {
          var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION);
        } catch (e) {
          return onerror(e);
        }
        openRequest.onupgradeneeded = onerror; // no database to load from
        openRequest.onsuccess = function openRequest_onsuccess() {
          var db = openRequest.result;
          try {
            var transaction = db.transaction([FS.DB_STORE_NAME], 'readonly');
          } catch(e) {
            onerror(e);
            return;
          }
          var files = transaction.objectStore(FS.DB_STORE_NAME);
          var ok = 0, fail = 0, total = paths.length;
          function finish() {
            if (fail == 0) onload(); else onerror();
          }
          paths.forEach(function(path) {
            var getRequest = files.get(path);
            getRequest.onsuccess = function getRequest_onsuccess() {
              if (FS.analyzePath(path).exists) {
                FS.unlink(path);
              }
              FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
              ok++;
              if (ok + fail == total) finish();
            };
            getRequest.onerror = function getRequest_onerror() { fail++; if (ok + fail == total) finish() };
          });
          transaction.onerror = onerror;
        };
        openRequest.onerror = onerror;
      }};var SYSCALLS={DEFAULT_POLLMASK:5,mappings:{},umask:511,calculateAt:function (dirfd, path) {
        if (path[0] !== '/') {
          // relative path
          var dir;
          if (dirfd === -100) {
            dir = FS.cwd();
          } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
            dir = dirstream.path;
          }
          path = PATH.join2(dir, path);
        }
        return path;
      },doStat:function (func, path, buf) {
        try {
          var stat = func(path);
        } catch (e) {
          if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
            // an error occurred while trying to look up the path; we should just report ENOTDIR
            return -ERRNO_CODES.ENOTDIR;
          }
          throw e;
        }
        HEAP32[((buf)>>2)]=stat.dev;
        HEAP32[(((buf)+(4))>>2)]=0;
        HEAP32[(((buf)+(8))>>2)]=stat.ino;
        HEAP32[(((buf)+(12))>>2)]=stat.mode;
        HEAP32[(((buf)+(16))>>2)]=stat.nlink;
        HEAP32[(((buf)+(20))>>2)]=stat.uid;
        HEAP32[(((buf)+(24))>>2)]=stat.gid;
        HEAP32[(((buf)+(28))>>2)]=stat.rdev;
        HEAP32[(((buf)+(32))>>2)]=0;
        HEAP32[(((buf)+(36))>>2)]=stat.size;
        HEAP32[(((buf)+(40))>>2)]=4096;
        HEAP32[(((buf)+(44))>>2)]=stat.blocks;
        HEAP32[(((buf)+(48))>>2)]=(stat.atime.getTime() / 1000)|0;
        HEAP32[(((buf)+(52))>>2)]=0;
        HEAP32[(((buf)+(56))>>2)]=(stat.mtime.getTime() / 1000)|0;
        HEAP32[(((buf)+(60))>>2)]=0;
        HEAP32[(((buf)+(64))>>2)]=(stat.ctime.getTime() / 1000)|0;
        HEAP32[(((buf)+(68))>>2)]=0;
        HEAP32[(((buf)+(72))>>2)]=stat.ino;
        return 0;
      },doMsync:function (addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags);
      },doMkdir:function (path, mode) {
        // remove a trailing slash, if one - /a/b/ has basename of '', but
        // we want to create b in the context of this function
        path = PATH.normalize(path);
        if (path[path.length-1] === '/') path = path.substr(0, path.length-1);
        FS.mkdir(path, mode, 0);
        return 0;
      },doMknod:function (path, mode, dev) {
        // we don't want this in the JS API as it uses mknod to create all nodes.
        switch (mode & 61440) {
          case 32768:
          case 8192:
          case 24576:
          case 4096:
          case 49152:
            break;
          default: return -ERRNO_CODES.EINVAL;
        }
        FS.mknod(path, mode, dev);
        return 0;
      },doReadlink:function (path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
  
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf+len];
        stringToUTF8(ret, buf, bufsize+1);
        // readlink is one of the rare functions that write out a C string, but does never append a null to the output buffer(!)
        // stringToUTF8() always appends a null byte, so restore the character under the null byte after the write.
        HEAP8[buf+len] = endChar;
  
        return len;
      },doAccess:function (path, amode) {
        if (amode & ~7) {
          // need a valid mode
          return -ERRNO_CODES.EINVAL;
        }
        var node;
        var lookup = FS.lookupPath(path, { follow: true });
        node = lookup.node;
        var perms = '';
        if (amode & 4) perms += 'r';
        if (amode & 2) perms += 'w';
        if (amode & 1) perms += 'x';
        if (perms /* otherwise, they've just passed F_OK */ && FS.nodePermissions(node, perms)) {
          return -ERRNO_CODES.EACCES;
        }
        return 0;
      },doDup:function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd;
      },doReadv:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.read(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
          if (curr < len) break; // nothing more to read
        }
        return ret;
      },doWritev:function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
          var ptr = HEAP32[(((iov)+(i*8))>>2)];
          var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
          var curr = FS.write(stream, HEAP8,ptr, len, offset);
          if (curr < 0) return -1;
          ret += curr;
        }
        return ret;
      },varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = UTF8ToString(SYSCALLS.get());
        return ret;
      },getStreamFromFD:function () {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream;
      },getSocketFromFD:function () {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket;
      },getSocketAddress:function (allowNull) {
        var addrp = SYSCALLS.get(), addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall145(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // readv
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doReadv(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      var stream = SYSCALLS.getStreamFromFD(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      return SYSCALLS.doWritev(stream, iov, iovcnt);
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      var stream = SYSCALLS.getStreamFromFD(), op = SYSCALLS.get();
      switch (op) {
        case 21509:
        case 21505: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0; // no-op, not actually adjusting terminal settings
        }
        case 21519: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          var argp = SYSCALLS.get();
          HEAP32[((argp)>>2)]=0;
          return 0;
        }
        case 21520: {
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return -ERRNO_CODES.EINVAL; // not supported
        }
        case 21531: {
          var argp = SYSCALLS.get();
          return FS.ioctl(stream, op, argp);
        }
        case 21523: {
          // TODO: in theory we should write to the winsize struct that gets
          // passed in, but for now musl doesn't read anything on it
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        case 21524: {
          // TODO: technically, this ioctl call should change the window size.
          // but, since emscripten doesn't have any concept of a terminal window
          // yet, we'll just silently throw it away as we do TIOCGWINSZ
          if (!stream.tty) return -ERRNO_CODES.ENOTTY;
          return 0;
        }
        default: abort('bad ioctl syscall ' + op);
      }
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall91(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // munmap
      var addr = SYSCALLS.get(), len = SYSCALLS.get();
      // TODO: support unmmap'ing parts of allocations
      var info = SYSCALLS.mappings[addr];
      if (!info) return 0;
      if (len === info.len) {
        var stream = FS.getStream(info.fd);
        SYSCALLS.doMsync(addr, stream, len, info.flags)
        FS.munmap(stream);
        SYSCALLS.mappings[addr] = null;
        if (info.allocated) {
          _free(info.malloc);
        }
      }
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___unlock() {}

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }
  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }
  
  
  
  var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  
  function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
          return false;
      }
      if (!(other instanceof ClassHandle)) {
          return false;
      }
  
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
  
      while (leftClass.baseClass) {
          left = leftClass.upcast(left);
          leftClass = leftClass.baseClass;
      }
  
      while (rightClass.baseClass) {
          right = rightClass.upcast(right);
          rightClass = rightClass.baseClass;
      }
  
      return leftClass === rightClass && left === right;
    }
  
  
  function shallowCopyInternalPointer(o) {
      return {
          count: o.count,
          deleteScheduled: o.deleteScheduled,
          preservePointerOnDelete: o.preservePointerOnDelete,
          ptr: o.ptr,
          ptrType: o.ptrType,
          smartPtr: o.smartPtr,
          smartPtrType: o.smartPtrType,
      };
    }
  
  function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
    }function ClassHandle_clone() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.preservePointerOnDelete) {
          this.$$.count.value += 1;
          return this;
      } else {
          var clone = Object.create(Object.getPrototypeOf(this), {
              $$: {
                  value: shallowCopyInternalPointer(this.$$),
              }
          });
  
          clone.$$.count.value += 1;
          clone.$$.deleteScheduled = false;
          return clone;
      }
    }
  
  
  function runDestructor(handle) {
      var $$ = handle.$$;
      if ($$.smartPtr) {
          $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
          $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }function ClassHandle_delete() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
  
      this.$$.count.value -= 1;
      var toDelete = 0 === this.$$.count.value;
      if (toDelete) {
          runDestructor(this);
      }
      if (!this.$$.preservePointerOnDelete) {
          this.$$.smartPtr = undefined;
          this.$$.ptr = undefined;
      }
    }
  
  function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
  
  
  var delayFunction=undefined;
  
  var deletionQueue=[];
  
  function flushPendingDeletes() {
      while (deletionQueue.length) {
          var obj = deletionQueue.pop();
          obj.$$.deleteScheduled = false;
          obj['delete']();
      }
    }function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }function init_ClassHandle() {
      ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
      ClassHandle.prototype['clone'] = ClassHandle_clone;
      ClassHandle.prototype['delete'] = ClassHandle_delete;
      ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
      ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
    }function ClassHandle() {
    }
  
  var registeredPointers={};
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
  
  
  
  function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
          if (!ptrClass.upcast) {
              throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
          }
          ptr = ptrClass.upcast(ptr);
          ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
  
          if (this.isSmartPointer) {
              ptr = this.rawConstructor();
              if (destructors !== null) {
                  destructors.push(this.rawDestructor, ptr);
              }
              return ptr;
          } else {
              return 0;
          }
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  
      if (this.isSmartPointer) {
          // TODO: this is not strictly true
          // We could support BY_EMVAL conversions from raw pointers to smart pointers
          // because the smart pointer can hold a reference to the handle
          if (undefined === handle.$$.smartPtr) {
              throwBindingError('Passing raw pointer to smart pointer is illegal');
          }
  
          switch (this.sharingPolicy) {
              case 0: // NONE
                  // no upcasting
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
                  }
                  break;
  
              case 1: // INTRUSIVE
                  ptr = handle.$$.smartPtr;
                  break;
  
              case 2: // BY_EMVAL
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      var clonedHandle = handle['clone']();
                      ptr = this.rawShare(
                          ptr,
                          __emval_register(function() {
                              clonedHandle['delete']();
                          })
                      );
                      if (destructors !== null) {
                          destructors.push(this.rawDestructor, ptr);
                      }
                  }
                  break;
  
              default:
                  throwBindingError('Unsupporting sharing policy');
          }
      }
      return ptr;
    }
  
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + handle.$$.ptrType.name + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }
  
  function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
          ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
  
  function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
          this.rawDestructor(ptr);
      }
    }
  
  function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
          handle['delete']();
      }
    }
  
  
  function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
          return ptr;
      }
      if (undefined === desiredClass.baseClass) {
          return null; // no conversion
      }
  
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
          return null;
      }
      return desiredClass.downcast(rv);
    }
  
  
  
  
  function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
  
  function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
          if (registeredInstances.hasOwnProperty(k)) {
              rv.push(registeredInstances[k]);
          }
      }
      return rv;
    }
  
  function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
    }function init_embind() {
      Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
      Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
      Module['flushPendingDeletes'] = flushPendingDeletes;
      Module['setDelayFunction'] = setDelayFunction;
    }var registeredInstances={};
  
  function getBasestPointer(class_, ptr) {
      if (ptr === undefined) {
          throwBindingError('ptr should not be undefined');
      }
      while (class_.baseClass) {
          ptr = class_.upcast(ptr);
          class_ = class_.baseClass;
      }
      return ptr;
    }function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
  
  function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
          throwInternalError('makeClassHandle requires ptr and ptrType');
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
          throwInternalError('Both smartPtrType and smartPtr must be specified');
      }
      record.count = { value: 1 };
      return Object.create(prototype, {
          $$: {
              value: record,
          },
      });
    }function RegisteredPointer_fromWireType(ptr) {
      // ptr is a raw pointer (or a raw smartpointer)
  
      // rawPointer is a maybe-null raw pointer
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
          this.destructor(ptr);
          return null;
      }
  
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (undefined !== registeredInstance) {
          // JS object has been neutered, time to repopulate it
          if (0 === registeredInstance.$$.count.value) {
              registeredInstance.$$.ptr = rawPointer;
              registeredInstance.$$.smartPtr = ptr;
              return registeredInstance['clone']();
          } else {
              // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var rv = registeredInstance['clone']();
              this.destructor(ptr);
              return rv;
          }
      }
  
      function makeDefaultHandle() {
          if (this.isSmartPointer) {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this.pointeeType,
                  ptr: rawPointer,
                  smartPtrType: this,
                  smartPtr: ptr,
              });
          } else {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this,
                  ptr: ptr,
              });
          }
      }
  
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
          return makeDefaultHandle.call(this);
      }
  
      var toType;
      if (this.isConst) {
          toType = registeredPointerRecord.constPointerType;
      } else {
          toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
          rawPointer,
          this.registeredClass,
          toType.registeredClass);
      if (dp === null) {
          return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
              smartPtrType: this,
              smartPtr: ptr,
          });
      } else {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
          });
      }
    }function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype['argPackAdvance'] = 8;
      RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
      RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
    }function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
  
      // smart pointer properties
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
  
      // smart pointer properties
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
  
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
          if (isConst) {
              this['toWireType'] = constNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          } else {
              this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          }
      } else {
          this['toWireType'] = genericPointerToWireType;
          // Here we must leave this.destructorFunction undefined, since whether genericPointerToWireType returns
          // a pointer that needs to be freed up is runtime-dependent, and cannot be evaluated at registration time.
          // TODO: Create an alternative mechanism that allows removing the use of var destructors = []; array in
          //       craftInvokerFunction altogether.
      }
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }
  
  
  var UnboundTypeError=undefined;
  
  function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
          upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
          downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
  
      exposePublicSymbol(legalFunctionName, function() {
          // this code cannot run if baseClassRawType is zero
          throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
      });
  
      whenDependentTypesAreResolved(
          [rawType, rawPointerType, rawConstPointerType],
          baseClassRawType ? [baseClassRawType] : [],
          function(base) {
              base = base[0];
  
              var baseClass;
              var basePrototype;
              if (baseClassRawType) {
                  baseClass = base.registeredClass;
                  basePrototype = baseClass.instancePrototype;
              } else {
                  basePrototype = ClassHandle.prototype;
              }
  
              var constructor = createNamedFunction(legalFunctionName, function() {
                  if (Object.getPrototypeOf(this) !== instancePrototype) {
                      throw new BindingError("Use 'new' to construct " + name);
                  }
                  if (undefined === registeredClass.constructor_body) {
                      throw new BindingError(name + " has no accessible constructor");
                  }
                  var body = registeredClass.constructor_body[arguments.length];
                  if (undefined === body) {
                      throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
                  }
                  return body.apply(this, arguments);
              });
  
              var instancePrototype = Object.create(basePrototype, {
                  constructor: { value: constructor },
              });
  
              constructor.prototype = instancePrototype;
  
              var registeredClass = new RegisteredClass(
                  name,
                  constructor,
                  instancePrototype,
                  rawDestructor,
                  baseClass,
                  getActualType,
                  upcast,
                  downcast);
  
              var referenceConverter = new RegisteredPointer(
                  name,
                  registeredClass,
                  true,
                  false,
                  false);
  
              var pointerConverter = new RegisteredPointer(
                  name + '*',
                  registeredClass,
                  false,
                  false,
                  false);
  
              var constPointerConverter = new RegisteredPointer(
                  name + ' const*',
                  registeredClass,
                  false,
                  true,
                  false);
  
              registeredPointers[rawType] = {
                  pointerType: pointerConverter,
                  constPointerType: constPointerConverter
              };
  
              replacePublicSymbol(legalFunctionName, constructor);
  
              return [referenceConverter, pointerConverter, constPointerConverter];
          }
      );
    }

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }
  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      var returns = (argTypes[0].name !== "void");
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }
  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }function __embind_register_class_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      rawInvoker,
      fn
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + methodName;
  
          function unboundTypesHandler() {
              throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
          }
  
          var proto = classType.registeredClass.constructor;
          if (undefined === proto[methodName]) {
              // This is the first function to be registered with this name.
              unboundTypesHandler.argCount = argCount-1;
              proto[methodName] = unboundTypesHandler;
          } else {
              // There was an existing function with the same name registered. Set up a function overload routing table.
              ensureOverloadTable(proto, methodName, humanName);
              proto[methodName].overloadTable[argCount-1] = unboundTypesHandler;
          }
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              // Replace the initial unbound-types-handler stub with the proper function. If multiple overloads are registered,
              // the function handlers go into an overload table.
              var invokerArgsArray = [argTypes[0] /* return value */, null /* no class 'this'*/].concat(argTypes.slice(1) /* actual params */);
              var func = craftInvokerFunction(humanName, invokerArgsArray, null /* no class 'this'*/, rawInvoker, fn);
              if (undefined === proto[methodName].overloadTable) {
                  func.argCount = argCount-1;
                  proto[methodName] = func;
              } else {
                  proto[methodName].overloadTable[argCount-1] = func;
              }
              return [];
          });
          return [];
      });
    }

  function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = 'constructor ' + classType.name;
  
          if (undefined === classType.registeredClass.constructor_body) {
              classType.registeredClass.constructor_body = [];
          }
          if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
              throw new BindingError("Cannot register multiple constructors with identical number of parameters (" + (argCount-1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          }
          classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
              throwUnboundTypeError('Cannot construct ' + classType.name + ' due to unbound types', rawArgTypes);
          };
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                  if (arguments.length !== argCount - 1) {
                      throwBindingError(humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
                  }
                  var destructors = [];
                  var args = new Array(argCount);
                  args[0] = rawConstructor;
                  for (var i = 1; i < argCount; ++i) {
                      args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
                  }
  
                  var ptr = invoker.apply(null, args);
                  runDestructors(destructors);
  
                  return argTypes[0]['fromWireType'](ptr);
              };
              return [];
          });
          return [];
      });
    }

  function __embind_register_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr, // [ReturnType, ThisType, Args...]
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + methodName;
  
          if (isPureVirtual) {
              classType.registeredClass.pureVirtualFunctions.push(methodName);
          }
  
          function unboundTypesHandler() {
              throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
          }
  
          var proto = classType.registeredClass.instancePrototype;
          var method = proto[methodName];
          if (undefined === method || (undefined === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2)) {
              // This is the first overload to be registered, OR we are replacing a function in the base class with a function in the derived class.
              unboundTypesHandler.argCount = argCount - 2;
              unboundTypesHandler.className = classType.name;
              proto[methodName] = unboundTypesHandler;
          } else {
              // There was an existing function with the same name registered. Set up a function overload routing table.
              ensureOverloadTable(proto, methodName, humanName);
              proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
          }
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
  
              var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context);
  
              // Replace the initial unbound-handler-stub function with the appropriate member function, now that all types
              // are resolved. If multiple overloads are registered for this function, the function goes into an overload table.
              if (undefined === proto[methodName].overloadTable) {
                  // Set argCount in case an overload is registered later
                  memberFunction.argCount = argCount - 2;
                  proto[methodName] = memberFunction;
              } else {
                  proto[methodName].overloadTable[argCount - 2] = memberFunction;
              }
  
              return [];
          });
          return [];
      });
    }

  
  function validateThis(this_, classType, humanName) {
      if (!(this_ instanceof Object)) {
          throwBindingError(humanName + ' with invalid "this": ' + this_);
      }
      if (!(this_ instanceof classType.registeredClass.constructor)) {
          throwBindingError(humanName + ' incompatible with "this" of type ' + this_.constructor.name);
      }
      if (!this_.$$.ptr) {
          throwBindingError('cannot call emscripten binding method ' + humanName + ' on deleted object');
      }
  
      // todo: kill this
      return upcastPointer(
          this_.$$.ptr,
          this_.$$.ptrType.registeredClass,
          classType.registeredClass);
    }function __embind_register_class_property(
      classType,
      fieldName,
      getterReturnType,
      getterSignature,
      getter,
      getterContext,
      setterArgumentType,
      setterSignature,
      setter,
      setterContext
    ) {
      fieldName = readLatin1String(fieldName);
      getter = embind__requireFunction(getterSignature, getter);
  
      whenDependentTypesAreResolved([], [classType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + fieldName;
          var desc = {
              get: function() {
                  throwUnboundTypeError('Cannot access ' + humanName + ' due to unbound types', [getterReturnType, setterArgumentType]);
              },
              enumerable: true,
              configurable: true
          };
          if (setter) {
              desc.set = function() {
                  throwUnboundTypeError('Cannot access ' + humanName + ' due to unbound types', [getterReturnType, setterArgumentType]);
              };
          } else {
              desc.set = function(v) {
                  throwBindingError(humanName + ' is a read-only property');
              };
          }
  
          Object.defineProperty(classType.registeredClass.instancePrototype, fieldName, desc);
  
          whenDependentTypesAreResolved(
              [],
              (setter ? [getterReturnType, setterArgumentType] : [getterReturnType]),
          function(types) {
              var getterReturnType = types[0];
              var desc = {
                  get: function() {
                      var ptr = validateThis(this, classType, humanName + ' getter');
                      return getterReturnType['fromWireType'](getter(getterContext, ptr));
                  },
                  enumerable: true
              };
  
              if (setter) {
                  setter = embind__requireFunction(setterSignature, setter);
                  var setterArgumentType = types[1];
                  desc.set = function(v) {
                      var ptr = validateThis(this, classType, humanName + ' setter');
                      var destructors = [];
                      setter(setterContext, ptr, setterArgumentType['toWireType'](destructors, v));
                      runDestructors(destructors);
                  };
              }
  
              Object.defineProperty(classType.registeredClass.instancePrototype, fieldName, desc);
              return [];
          });
  
          return [];
      });
    }

  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }
  
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
  
      var fromWireType = function(value) {
          return value;
      };
  
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      var isUnsignedType = (name.indexOf('unsigned') != -1);
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return isUnsignedType ? (value >>> 0) : (value | 0);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }

  function __embind_register_smart_ptr(
      rawType,
      rawPointeeType,
      name,
      sharingPolicy,
      getPointeeSignature,
      rawGetPointee,
      constructorSignature,
      rawConstructor,
      shareSignature,
      rawShare,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      rawGetPointee = embind__requireFunction(getPointeeSignature, rawGetPointee);
      rawConstructor = embind__requireFunction(constructorSignature, rawConstructor);
      rawShare = embind__requireFunction(shareSignature, rawShare);
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
  
      whenDependentTypesAreResolved([rawType], [rawPointeeType], function(pointeeType) {
          pointeeType = pointeeType[0];
  
          var registeredPointer = new RegisteredPointer(
              name,
              pointeeType.registeredClass,
              false,
              false,
              // smart pointer properties
              true,
              pointeeType,
              sharingPolicy,
              rawGetPointee,
              rawConstructor,
              rawShare,
              rawDestructor);
          return [registeredPointer];
      });
    }

  function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      var stdStringIsUTF8
      //process only std::string bindings with UTF8 support, in contrast to e.g. std::basic_string<unsigned char>
      = (name === "std::string");
  
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
  
              var str;
              if(stdStringIsUTF8) {
                  //ensure null termination at one-past-end byte if not present yet
                  var endChar = HEAPU8[value + 4 + length];
                  var endCharSwap = 0;
                  if(endChar != 0)
                  {
                    endCharSwap = endChar;
                    HEAPU8[value + 4 + length] = 0;
                  }
  
                  var decodeStartPtr = value + 4;
                  //looping here to support possible embedded '0' bytes
                  for (var i = 0; i <= length; ++i) {
                    var currentBytePtr = value + 4 + i;
                    if(HEAPU8[currentBytePtr] == 0)
                    {
                      var stringSegment = UTF8ToString(decodeStartPtr);
                      if(str === undefined)
                        str = stringSegment;
                      else
                      {
                        str += String.fromCharCode(0);
                        str += stringSegment;
                      }
                      decodeStartPtr = currentBytePtr + 1;
                    }
                  }
  
                  if(endCharSwap != 0)
                    HEAPU8[value + 4 + length] = endCharSwap;
              } else {
                  var a = new Array(length);
                  for (var i = 0; i < length; ++i) {
                      a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
                  }
                  str = a.join('');
              }
  
              _free(value);
              
              return str;
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
              
              var getLength;
              var valueIsOfTypeString = (typeof value === 'string');
  
              if (!(valueIsOfTypeString || value instanceof Uint8Array || value instanceof Uint8ClampedArray || value instanceof Int8Array)) {
                  throwBindingError('Cannot pass non-string to std::string');
              }
              if (stdStringIsUTF8 && valueIsOfTypeString) {
                  getLength = function() {return lengthBytesUTF8(value);};
              } else {
                  getLength = function() {return value.length;};
              }
              
              // assumes 4-byte alignment
              var length = getLength();
              var ptr = _malloc(4 + length + 1);
              HEAPU32[ptr >> 2] = length;
  
              if (stdStringIsUTF8 && valueIsOfTypeString) {
                  stringToUTF8(value, ptr + 4, length + 1);
              } else {
                  if(valueIsOfTypeString) {
                      for (var i = 0; i < length; ++i) {
                          var charCode = value.charCodeAt(i);
                          if (charCode > 255) {
                              _free(ptr);
                              throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                          }
                          HEAPU8[ptr + 4 + i] = charCode;
                      }
                  } else {
                      for (var i = 0; i < length; ++i) {
                          HEAPU8[ptr + 4 + i] = value[i];
                      }
                  }
              }
  
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by emscripten_resize_heap().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

  
  
  function requireRegisteredType(rawType, humanName) {
      var impl = registeredTypes[rawType];
      if (undefined === impl) {
          throwBindingError(humanName + " has unknown type " + getTypeName(rawType));
      }
      return impl;
    }function __emval_lookupTypes(argCount, argTypes, argWireTypes) {
      var a = new Array(argCount);
      for (var i = 0; i < argCount; ++i) {
          a[i] = requireRegisteredType(
              HEAP32[(argTypes >> 2) + i],
              "parameter " + i);
      }
      return a;
    }
  
  function requireHandle(handle) {
      if (!handle) {
          throwBindingError('Cannot use deleted val. handle = ' + handle);
      }
      return emval_handle_array[handle].value;
    }function __emval_call(handle, argCount, argTypes, argv) {
      handle = requireHandle(handle);
      var types = __emval_lookupTypes(argCount, argTypes);
  
      var args = new Array(argCount);
      for (var i = 0; i < argCount; ++i) {
          var type = types[i];
          args[i] = type['readValueFromPointer'](argv);
          argv += type['argPackAdvance'];
      }
  
      var rv = handle.apply(undefined, args);
      return __emval_register(rv);
    }


  function __emval_incref(handle) {
      if (handle > 4) {
          emval_handle_array[handle].refcount += 1;
      }
    }

  function __emval_take_value(type, argv) {
      type = requireRegisteredType(type, '_emval_take_value');
      var v = type['readValueFromPointer'](argv);
      return __emval_register(v);
    }

  function _abort() {
      Module['abort']();
    }

  function _emscripten_get_heap_size() {
      return TOTAL_MEMORY;
    }

  
  function abortOnCannotGrowMemory(requestedSize) {
      abort('Cannot enlarge memory arrays to size ' + requestedSize + ' bytes. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
    }function _emscripten_resize_heap(requestedSize) {
      abortOnCannotGrowMemory(requestedSize);
    }

  
  var ENV={};function _getenv(name) {
      // char *getenv(const char *name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/getenv.html
      if (name === 0) return 0;
      name = UTF8ToString(name);
      if (!ENV.hasOwnProperty(name)) return 0;
  
      if (_getenv.ret) _free(_getenv.ret);
      _getenv.ret = allocateUTF8(ENV[name]);
      return _getenv.ret;
    }

   

  function _llvm_stackrestore(p) {
      var self = _llvm_stacksave;
      var ret = self.LLVM_SAVEDSTACKS[p];
      self.LLVM_SAVEDSTACKS.splice(p, 1);
      stackRestore(ret);
    }

  function _llvm_stacksave() {
      var self = _llvm_stacksave;
      if (!self.LLVM_SAVEDSTACKS) {
        self.LLVM_SAVEDSTACKS = [];
      }
      self.LLVM_SAVEDSTACKS.push(stackSave());
      return self.LLVM_SAVEDSTACKS.length-1;
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
    }
  
  var _Int8Array=undefined;
  
  var _Int32Array=undefined; 

   

   

   

  function _pthread_cond_wait() { return 0; }

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

   

   

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      dynCall_v(func);
      _pthread_once.seen[ptr] = 1;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

   

  
  
  function __isLeapYear(year) {
        return year%4 === 0 && (year%100 !== 0 || year%400 === 0);
    }
  
  function __arraySum(array, index) {
      var sum = 0;
      for (var i = 0; i <= index; sum += array[i++]);
      return sum;
    }
  
  
  var __MONTH_DAYS_LEAP=[31,29,31,30,31,30,31,31,30,31,30,31];
  
  var __MONTH_DAYS_REGULAR=[31,28,31,30,31,30,31,31,30,31,30,31];function __addDays(date, days) {
      var newDate = new Date(date.getTime());
      while(days > 0) {
        var leap = __isLeapYear(newDate.getFullYear());
        var currentMonth = newDate.getMonth();
        var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
  
        if (days > daysInCurrentMonth-newDate.getDate()) {
          // we spill over to next month
          days -= (daysInCurrentMonth-newDate.getDate()+1);
          newDate.setDate(1);
          if (currentMonth < 11) {
            newDate.setMonth(currentMonth+1)
          } else {
            newDate.setMonth(0);
            newDate.setFullYear(newDate.getFullYear()+1);
          }
        } else {
          // we stay in current month
          newDate.setDate(newDate.getDate()+days);
          return newDate;
        }
      }
  
      return newDate;
    }function _strftime(s, maxsize, format, tm) {
      // size_t strftime(char *restrict s, size_t maxsize, const char *restrict format, const struct tm *restrict timeptr);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/strftime.html
  
      var tm_zone = HEAP32[(((tm)+(40))>>2)];
  
      var date = {
        tm_sec: HEAP32[((tm)>>2)],
        tm_min: HEAP32[(((tm)+(4))>>2)],
        tm_hour: HEAP32[(((tm)+(8))>>2)],
        tm_mday: HEAP32[(((tm)+(12))>>2)],
        tm_mon: HEAP32[(((tm)+(16))>>2)],
        tm_year: HEAP32[(((tm)+(20))>>2)],
        tm_wday: HEAP32[(((tm)+(24))>>2)],
        tm_yday: HEAP32[(((tm)+(28))>>2)],
        tm_isdst: HEAP32[(((tm)+(32))>>2)],
        tm_gmtoff: HEAP32[(((tm)+(36))>>2)],
        tm_zone: tm_zone ? UTF8ToString(tm_zone) : ''
      };
  
      var pattern = UTF8ToString(format);
  
      // expand format
      var EXPANSION_RULES_1 = {
        '%c': '%a %b %d %H:%M:%S %Y',     // Replaced by the locale's appropriate date and time representation - e.g., Mon Aug  3 14:02:01 2013
        '%D': '%m/%d/%y',                 // Equivalent to %m / %d / %y
        '%F': '%Y-%m-%d',                 // Equivalent to %Y - %m - %d
        '%h': '%b',                       // Equivalent to %b
        '%r': '%I:%M:%S %p',              // Replaced by the time in a.m. and p.m. notation
        '%R': '%H:%M',                    // Replaced by the time in 24-hour notation
        '%T': '%H:%M:%S',                 // Replaced by the time
        '%x': '%m/%d/%y',                 // Replaced by the locale's appropriate date representation
        '%X': '%H:%M:%S'                  // Replaced by the locale's appropriate date representation
      };
      for (var rule in EXPANSION_RULES_1) {
        pattern = pattern.replace(new RegExp(rule, 'g'), EXPANSION_RULES_1[rule]);
      }
  
      var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
      function leadingSomething(value, digits, character) {
        var str = typeof value === 'number' ? value.toString() : (value || '');
        while (str.length < digits) {
          str = character[0]+str;
        }
        return str;
      };
  
      function leadingNulls(value, digits) {
        return leadingSomething(value, digits, '0');
      };
  
      function compareByDay(date1, date2) {
        function sgn(value) {
          return value < 0 ? -1 : (value > 0 ? 1 : 0);
        };
  
        var compare;
        if ((compare = sgn(date1.getFullYear()-date2.getFullYear())) === 0) {
          if ((compare = sgn(date1.getMonth()-date2.getMonth())) === 0) {
            compare = sgn(date1.getDate()-date2.getDate());
          }
        }
        return compare;
      };
  
      function getFirstWeekStartDate(janFourth) {
          switch (janFourth.getDay()) {
            case 0: // Sunday
              return new Date(janFourth.getFullYear()-1, 11, 29);
            case 1: // Monday
              return janFourth;
            case 2: // Tuesday
              return new Date(janFourth.getFullYear(), 0, 3);
            case 3: // Wednesday
              return new Date(janFourth.getFullYear(), 0, 2);
            case 4: // Thursday
              return new Date(janFourth.getFullYear(), 0, 1);
            case 5: // Friday
              return new Date(janFourth.getFullYear()-1, 11, 31);
            case 6: // Saturday
              return new Date(janFourth.getFullYear()-1, 11, 30);
          }
      };
  
      function getWeekBasedYear(date) {
          var thisDate = __addDays(new Date(date.tm_year+1900, 0, 1), date.tm_yday);
  
          var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
          var janFourthNextYear = new Date(thisDate.getFullYear()+1, 0, 4);
  
          var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
          var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
  
          if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
            // this date is after the start of the first week of this year
            if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
              return thisDate.getFullYear()+1;
            } else {
              return thisDate.getFullYear();
            }
          } else {
            return thisDate.getFullYear()-1;
          }
      };
  
      var EXPANSION_RULES_2 = {
        '%a': function(date) {
          return WEEKDAYS[date.tm_wday].substring(0,3);
        },
        '%A': function(date) {
          return WEEKDAYS[date.tm_wday];
        },
        '%b': function(date) {
          return MONTHS[date.tm_mon].substring(0,3);
        },
        '%B': function(date) {
          return MONTHS[date.tm_mon];
        },
        '%C': function(date) {
          var year = date.tm_year+1900;
          return leadingNulls((year/100)|0,2);
        },
        '%d': function(date) {
          return leadingNulls(date.tm_mday, 2);
        },
        '%e': function(date) {
          return leadingSomething(date.tm_mday, 2, ' ');
        },
        '%g': function(date) {
          // %g, %G, and %V give values according to the ISO 8601:2000 standard week-based year.
          // In this system, weeks begin on a Monday and week 1 of the year is the week that includes
          // January 4th, which is also the week that includes the first Thursday of the year, and
          // is also the first week that contains at least four days in the year.
          // If the first Monday of January is the 2nd, 3rd, or 4th, the preceding days are part of
          // the last week of the preceding year; thus, for Saturday 2nd January 1999,
          // %G is replaced by 1998 and %V is replaced by 53. If December 29th, 30th,
          // or 31st is a Monday, it and any following days are part of week 1 of the following year.
          // Thus, for Tuesday 30th December 1997, %G is replaced by 1998 and %V is replaced by 01.
  
          return getWeekBasedYear(date).toString().substring(2);
        },
        '%G': function(date) {
          return getWeekBasedYear(date);
        },
        '%H': function(date) {
          return leadingNulls(date.tm_hour, 2);
        },
        '%I': function(date) {
          var twelveHour = date.tm_hour;
          if (twelveHour == 0) twelveHour = 12;
          else if (twelveHour > 12) twelveHour -= 12;
          return leadingNulls(twelveHour, 2);
        },
        '%j': function(date) {
          // Day of the year (001-366)
          return leadingNulls(date.tm_mday+__arraySum(__isLeapYear(date.tm_year+1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, date.tm_mon-1), 3);
        },
        '%m': function(date) {
          return leadingNulls(date.tm_mon+1, 2);
        },
        '%M': function(date) {
          return leadingNulls(date.tm_min, 2);
        },
        '%n': function() {
          return '\n';
        },
        '%p': function(date) {
          if (date.tm_hour >= 0 && date.tm_hour < 12) {
            return 'AM';
          } else {
            return 'PM';
          }
        },
        '%S': function(date) {
          return leadingNulls(date.tm_sec, 2);
        },
        '%t': function() {
          return '\t';
        },
        '%u': function(date) {
          var day = new Date(date.tm_year+1900, date.tm_mon+1, date.tm_mday, 0, 0, 0, 0);
          return day.getDay() || 7;
        },
        '%U': function(date) {
          // Replaced by the week number of the year as a decimal number [00,53].
          // The first Sunday of January is the first day of week 1;
          // days in the new year before this are in week 0. [ tm_year, tm_wday, tm_yday]
          var janFirst = new Date(date.tm_year+1900, 0, 1);
          var firstSunday = janFirst.getDay() === 0 ? janFirst : __addDays(janFirst, 7-janFirst.getDay());
          var endDate = new Date(date.tm_year+1900, date.tm_mon, date.tm_mday);
  
          // is target date after the first Sunday?
          if (compareByDay(firstSunday, endDate) < 0) {
            // calculate difference in days between first Sunday and endDate
            var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth()-1)-31;
            var firstSundayUntilEndJanuary = 31-firstSunday.getDate();
            var days = firstSundayUntilEndJanuary+februaryFirstUntilEndMonth+endDate.getDate();
            return leadingNulls(Math.ceil(days/7), 2);
          }
  
          return compareByDay(firstSunday, janFirst) === 0 ? '01': '00';
        },
        '%V': function(date) {
          // Replaced by the week number of the year (Monday as the first day of the week)
          // as a decimal number [01,53]. If the week containing 1 January has four
          // or more days in the new year, then it is considered week 1.
          // Otherwise, it is the last week of the previous year, and the next week is week 1.
          // Both January 4th and the first Thursday of January are always in week 1. [ tm_year, tm_wday, tm_yday]
          var janFourthThisYear = new Date(date.tm_year+1900, 0, 4);
          var janFourthNextYear = new Date(date.tm_year+1901, 0, 4);
  
          var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
          var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
  
          var endDate = __addDays(new Date(date.tm_year+1900, 0, 1), date.tm_yday);
  
          if (compareByDay(endDate, firstWeekStartThisYear) < 0) {
            // if given date is before this years first week, then it belongs to the 53rd week of last year
            return '53';
          }
  
          if (compareByDay(firstWeekStartNextYear, endDate) <= 0) {
            // if given date is after next years first week, then it belongs to the 01th week of next year
            return '01';
          }
  
          // given date is in between CW 01..53 of this calendar year
          var daysDifference;
          if (firstWeekStartThisYear.getFullYear() < date.tm_year+1900) {
            // first CW of this year starts last year
            daysDifference = date.tm_yday+32-firstWeekStartThisYear.getDate()
          } else {
            // first CW of this year starts this year
            daysDifference = date.tm_yday+1-firstWeekStartThisYear.getDate();
          }
          return leadingNulls(Math.ceil(daysDifference/7), 2);
        },
        '%w': function(date) {
          var day = new Date(date.tm_year+1900, date.tm_mon+1, date.tm_mday, 0, 0, 0, 0);
          return day.getDay();
        },
        '%W': function(date) {
          // Replaced by the week number of the year as a decimal number [00,53].
          // The first Monday of January is the first day of week 1;
          // days in the new year before this are in week 0. [ tm_year, tm_wday, tm_yday]
          var janFirst = new Date(date.tm_year, 0, 1);
          var firstMonday = janFirst.getDay() === 1 ? janFirst : __addDays(janFirst, janFirst.getDay() === 0 ? 1 : 7-janFirst.getDay()+1);
          var endDate = new Date(date.tm_year+1900, date.tm_mon, date.tm_mday);
  
          // is target date after the first Monday?
          if (compareByDay(firstMonday, endDate) < 0) {
            var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth()-1)-31;
            var firstMondayUntilEndJanuary = 31-firstMonday.getDate();
            var days = firstMondayUntilEndJanuary+februaryFirstUntilEndMonth+endDate.getDate();
            return leadingNulls(Math.ceil(days/7), 2);
          }
          return compareByDay(firstMonday, janFirst) === 0 ? '01': '00';
        },
        '%y': function(date) {
          // Replaced by the last two digits of the year as a decimal number [00,99]. [ tm_year]
          return (date.tm_year+1900).toString().substring(2);
        },
        '%Y': function(date) {
          // Replaced by the year as a decimal number (for example, 1997). [ tm_year]
          return date.tm_year+1900;
        },
        '%z': function(date) {
          // Replaced by the offset from UTC in the ISO 8601:2000 standard format ( +hhmm or -hhmm ).
          // For example, "-0430" means 4 hours 30 minutes behind UTC (west of Greenwich).
          var off = date.tm_gmtoff;
          var ahead = off >= 0;
          off = Math.abs(off) / 60;
          // convert from minutes into hhmm format (which means 60 minutes = 100 units)
          off = (off / 60)*100 + (off % 60);
          return (ahead ? '+' : '-') + String("0000" + off).slice(-4);
        },
        '%Z': function(date) {
          return date.tm_zone;
        },
        '%%': function() {
          return '%';
        }
      };
      for (var rule in EXPANSION_RULES_2) {
        if (pattern.indexOf(rule) >= 0) {
          pattern = pattern.replace(new RegExp(rule, 'g'), EXPANSION_RULES_2[rule](date));
        }
      }
  
      var bytes = intArrayFromString(pattern, false);
      if (bytes.length > maxsize) {
        return 0;
      }
  
      writeArrayToMemory(bytes, s);
      return bytes.length-1;
    }function _strftime_l(s, maxsize, format, tm) {
      return _strftime(s, maxsize, format, tm); // no locale support yet
    }
FS.staticInit();__ATINIT__.unshift(function() { if (!Module["noFSInit"] && !FS.init.initialized) FS.init() });__ATMAIN__.push(function() { FS.ignorePermissions = false });__ATEXIT__.push(function() { FS.quit() });;
__ATINIT__.unshift(function() { TTY.init() });__ATEXIT__.push(function() { TTY.shutdown() });;
if (ENVIRONMENT_IS_NODE) { var fs = require("fs"); var NODEJS_PATH = require("path"); NODEFS.staticInit(); };
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
init_ClassHandle();
init_RegisteredPointer();
init_embind();;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
init_emval();;
var ASSERTIONS = true;

// Copyright 2017 The Emscripten Authors.  All rights reserved.
// Emscripten is available under two separate licenses, the MIT license and the
// University of Illinois/NCSA Open Source License.  Both these licenses can be
// found in the LICENSE file.

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}


// Copied from https://github.com/strophe/strophejs/blob/e06d027/src/polyfills.js#L149

// This code was written by Tyler Akins and has been placed in the
// public domain.  It would be nice if you left this header intact.
// Base64 code from Tyler Akins -- http://rumkin.com

/**
 * Decodes a base64 string.
 * @param {String} input The string to decode.
 */
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
  var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

  var output = '';
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  do {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));

    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;

    output = output + String.fromCharCode(chr1);

    if (enc3 !== 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output = output + String.fromCharCode(chr3);
    }
  } while (i < input.length);
  return output;
};

// Converts a string of base64 into a byte array.
// Throws error on invalid input.
function intArrayFromBase64(s) {
  if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
    var buf;
    try {
      buf = Buffer.from(s, 'base64');
    } catch (_) {
      buf = new Buffer(s, 'base64');
    }
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  try {
    var decoded = decodeBase64(s);
    var bytes = new Uint8Array(decoded.length);
    for (var i = 0 ; i < decoded.length ; ++i) {
      bytes[i] = decoded.charCodeAt(i);
    }
    return bytes;
  } catch (_) {
    throw new Error('Converting base64 string to bytes failed.');
  }
}

// If filename is a base64 data URI, parses and returns data (Buffer on node,
// Uint8Array otherwise). If filename is not a base64 data URI, returns undefined.
function tryParseAsDataURI(filename) {
  if (!isDataURI(filename)) {
    return;
  }

  return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}


// ASM_LIBRARY EXTERN PRIMITIVES: Int8Array,Int32Array


function nullFunc_dddd(x) { err("Invalid function pointer called with signature 'dddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_dddddd(x) { err("Invalid function pointer called with signature 'dddddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_di(x) { err("Invalid function pointer called with signature 'di'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_did(x) { err("Invalid function pointer called with signature 'did'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_didd(x) { err("Invalid function pointer called with signature 'didd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diddd(x) { err("Invalid function pointer called with signature 'diddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diddddd(x) { err("Invalid function pointer called with signature 'diddddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_didddddii(x) { err("Invalid function pointer called with signature 'didddddii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_didddii(x) { err("Invalid function pointer called with signature 'didddii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diddidd(x) { err("Invalid function pointer called with signature 'diddidd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_didi(x) { err("Invalid function pointer called with signature 'didi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_didid(x) { err("Invalid function pointer called with signature 'didid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_dididdd(x) { err("Invalid function pointer called with signature 'dididdd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_dididi(x) { err("Invalid function pointer called with signature 'dididi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_dii(x) { err("Invalid function pointer called with signature 'dii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diid(x) { err("Invalid function pointer called with signature 'diid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diidd(x) { err("Invalid function pointer called with signature 'diidd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diiddd(x) { err("Invalid function pointer called with signature 'diiddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diiddddd(x) { err("Invalid function pointer called with signature 'diiddddd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diidddddii(x) { err("Invalid function pointer called with signature 'diidddddii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diidddii(x) { err("Invalid function pointer called with signature 'diidddii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diiddidd(x) { err("Invalid function pointer called with signature 'diiddidd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diidi(x) { err("Invalid function pointer called with signature 'diidi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diidid(x) { err("Invalid function pointer called with signature 'diidid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diididdd(x) { err("Invalid function pointer called with signature 'diididdd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diididi(x) { err("Invalid function pointer called with signature 'diididi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diii(x) { err("Invalid function pointer called with signature 'diii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_diiii(x) { err("Invalid function pointer called with signature 'diiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_fiii(x) { err("Invalid function pointer called with signature 'fiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { err("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { err("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iid(x) { err("Invalid function pointer called with signature 'iid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { err("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiid(x) { err("Invalid function pointer called with signature 'iiid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { err("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiid(x) { err("Invalid function pointer called with signature 'iiiid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiif(x) { err("Invalid function pointer called with signature 'iiiif'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiii(x) { err("Invalid function pointer called with signature 'iiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiid(x) { err("Invalid function pointer called with signature 'iiiiid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiii(x) { err("Invalid function pointer called with signature 'iiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiid(x) { err("Invalid function pointer called with signature 'iiiiiid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiii(x) { err("Invalid function pointer called with signature 'iiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiiii(x) { err("Invalid function pointer called with signature 'iiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiiiii(x) { err("Invalid function pointer called with signature 'iiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiiiiiii(x) { err("Invalid function pointer called with signature 'iiiiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiiiiiiii(x) { err("Invalid function pointer called with signature 'iiiiiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiiiiiiiiii(x) { err("Invalid function pointer called with signature 'iiiiiiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiiiij(x) { err("Invalid function pointer called with signature 'iiiiij'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_jiiii(x) { err("Invalid function pointer called with signature 'jiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { err("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { err("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vid(x) { err("Invalid function pointer called with signature 'vid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vidd(x) { err("Invalid function pointer called with signature 'vidd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vidid(x) { err("Invalid function pointer called with signature 'vidid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vididd(x) { err("Invalid function pointer called with signature 'vididd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vididdd(x) { err("Invalid function pointer called with signature 'vididdd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { err("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viid(x) { err("Invalid function pointer called with signature 'viid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viidd(x) { err("Invalid function pointer called with signature 'viidd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viidid(x) { err("Invalid function pointer called with signature 'viidid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viididd(x) { err("Invalid function pointer called with signature 'viididd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viididdd(x) { err("Invalid function pointer called with signature 'viididdd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viif(x) { err("Invalid function pointer called with signature 'viif'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { err("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiid(x) { err("Invalid function pointer called with signature 'viiid'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiif(x) { err("Invalid function pointer called with signature 'viiif'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { err("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { err("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { err("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiii(x) { err("Invalid function pointer called with signature 'viiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiiiiii(x) { err("Invalid function pointer called with signature 'viiiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiiiiiiiiiii(x) { err("Invalid function pointer called with signature 'viiiiiiiiiiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viijii(x) { err("Invalid function pointer called with signature 'viijii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  err("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_diii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return dynCall_diii(index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_fiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return dynCall_fiii(index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_i(index) {
  var sp = stackSave();
  try {
    return dynCall_i(index);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_ii(index,a1) {
  var sp = stackSave();
  try {
    return dynCall_ii(index,a1);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  var sp = stackSave();
  try {
    return dynCall_iii(index,a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    return dynCall_iiii(index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiii(index,a1,a2,a3,a4) {
  var sp = stackSave();
  try {
    return dynCall_iiiii(index,a1,a2,a3,a4);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiii(index,a1,a2,a3,a4,a5,a6) {
  var sp = stackSave();
  try {
    return dynCall_iiiiiii(index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  var sp = stackSave();
  try {
    return dynCall_iiiiiiii(index,a1,a2,a3,a4,a5,a6,a7);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8) {
  var sp = stackSave();
  try {
    return dynCall_iiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10) {
  var sp = stackSave();
  try {
    return dynCall_iiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11) {
  var sp = stackSave();
  try {
    return dynCall_iiiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_iiiiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12) {
  var sp = stackSave();
  try {
    return dynCall_iiiiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_jiiii(index,a1,a2,a3,a4) {
  var sp = stackSave();
  try {
    return dynCall_jiiii(index,a1,a2,a3,a4);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_v(index) {
  var sp = stackSave();
  try {
    dynCall_v(index);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_vi(index,a1) {
  var sp = stackSave();
  try {
    dynCall_vi(index,a1);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  var sp = stackSave();
  try {
    dynCall_vii(index,a1,a2);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  var sp = stackSave();
  try {
    dynCall_viii(index,a1,a2,a3);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  var sp = stackSave();
  try {
    dynCall_viiii(index,a1,a2,a3,a4);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  var sp = stackSave();
  try {
    dynCall_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10) {
  var sp = stackSave();
  try {
    dynCall_viiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

function invoke_viiiiiiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15) {
  var sp = stackSave();
  try {
    dynCall_viiiiiiiiiiiiiii(index,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,a12,a13,a14,a15);
  } catch(e) {
    stackRestore(sp);
    if (e !== e+0 && e !== 'longjmp') throw e;
    _setThrew(1, 0);
  }
}

var asmGlobalArg = {}

var asmLibraryArg = { "abort": abort, "setTempRet0": setTempRet0, "getTempRet0": getTempRet0, "abortStackOverflow": abortStackOverflow, "nullFunc_dddd": nullFunc_dddd, "nullFunc_dddddd": nullFunc_dddddd, "nullFunc_di": nullFunc_di, "nullFunc_did": nullFunc_did, "nullFunc_didd": nullFunc_didd, "nullFunc_diddd": nullFunc_diddd, "nullFunc_diddddd": nullFunc_diddddd, "nullFunc_didddddii": nullFunc_didddddii, "nullFunc_didddii": nullFunc_didddii, "nullFunc_diddidd": nullFunc_diddidd, "nullFunc_didi": nullFunc_didi, "nullFunc_didid": nullFunc_didid, "nullFunc_dididdd": nullFunc_dididdd, "nullFunc_dididi": nullFunc_dididi, "nullFunc_dii": nullFunc_dii, "nullFunc_diid": nullFunc_diid, "nullFunc_diidd": nullFunc_diidd, "nullFunc_diiddd": nullFunc_diiddd, "nullFunc_diiddddd": nullFunc_diiddddd, "nullFunc_diidddddii": nullFunc_diidddddii, "nullFunc_diidddii": nullFunc_diidddii, "nullFunc_diiddidd": nullFunc_diiddidd, "nullFunc_diidi": nullFunc_diidi, "nullFunc_diidid": nullFunc_diidid, "nullFunc_diididdd": nullFunc_diididdd, "nullFunc_diididi": nullFunc_diididi, "nullFunc_diii": nullFunc_diii, "nullFunc_diiii": nullFunc_diiii, "nullFunc_fiii": nullFunc_fiii, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iid": nullFunc_iid, "nullFunc_iii": nullFunc_iii, "nullFunc_iiid": nullFunc_iiid, "nullFunc_iiii": nullFunc_iiii, "nullFunc_iiiid": nullFunc_iiiid, "nullFunc_iiiif": nullFunc_iiiif, "nullFunc_iiiii": nullFunc_iiiii, "nullFunc_iiiiid": nullFunc_iiiiid, "nullFunc_iiiiii": nullFunc_iiiiii, "nullFunc_iiiiiid": nullFunc_iiiiiid, "nullFunc_iiiiiii": nullFunc_iiiiiii, "nullFunc_iiiiiiii": nullFunc_iiiiiiii, "nullFunc_iiiiiiiii": nullFunc_iiiiiiiii, "nullFunc_iiiiiiiiiii": nullFunc_iiiiiiiiiii, "nullFunc_iiiiiiiiiiii": nullFunc_iiiiiiiiiiii, "nullFunc_iiiiiiiiiiiii": nullFunc_iiiiiiiiiiiii, "nullFunc_iiiiij": nullFunc_iiiiij, "nullFunc_jiiii": nullFunc_jiiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vid": nullFunc_vid, "nullFunc_vidd": nullFunc_vidd, "nullFunc_vidid": nullFunc_vidid, "nullFunc_vididd": nullFunc_vididd, "nullFunc_vididdd": nullFunc_vididdd, "nullFunc_vii": nullFunc_vii, "nullFunc_viid": nullFunc_viid, "nullFunc_viidd": nullFunc_viidd, "nullFunc_viidid": nullFunc_viidid, "nullFunc_viididd": nullFunc_viididd, "nullFunc_viididdd": nullFunc_viididdd, "nullFunc_viif": nullFunc_viif, "nullFunc_viii": nullFunc_viii, "nullFunc_viiid": nullFunc_viiid, "nullFunc_viiif": nullFunc_viiif, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "nullFunc_viiiiiii": nullFunc_viiiiiii, "nullFunc_viiiiiiiiii": nullFunc_viiiiiiiiii, "nullFunc_viiiiiiiiiiiiiii": nullFunc_viiiiiiiiiiiiiii, "nullFunc_viijii": nullFunc_viijii, "invoke_diii": invoke_diii, "invoke_fiii": invoke_fiii, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_iiiii": invoke_iiiii, "invoke_iiiiiii": invoke_iiiiiii, "invoke_iiiiiiii": invoke_iiiiiiii, "invoke_iiiiiiiii": invoke_iiiiiiiii, "invoke_iiiiiiiiiii": invoke_iiiiiiiiiii, "invoke_iiiiiiiiiiii": invoke_iiiiiiiiiiii, "invoke_iiiiiiiiiiiii": invoke_iiiiiiiiiiiii, "invoke_jiiii": invoke_jiiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiiiii": invoke_viiiiiii, "invoke_viiiiiiiiii": invoke_viiiiiiiiii, "invoke_viiiiiiiiiiiiiii": invoke_viiiiiiiiiiiiiii, "ClassHandle": ClassHandle, "ClassHandle_clone": ClassHandle_clone, "ClassHandle_delete": ClassHandle_delete, "ClassHandle_deleteLater": ClassHandle_deleteLater, "ClassHandle_isAliasOf": ClassHandle_isAliasOf, "ClassHandle_isDeleted": ClassHandle_isDeleted, "RegisteredClass": RegisteredClass, "RegisteredPointer": RegisteredPointer, "RegisteredPointer_deleteObject": RegisteredPointer_deleteObject, "RegisteredPointer_destructor": RegisteredPointer_destructor, "RegisteredPointer_fromWireType": RegisteredPointer_fromWireType, "RegisteredPointer_getPointee": RegisteredPointer_getPointee, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_allocate_exception": ___cxa_allocate_exception, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_end_catch": ___cxa_end_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "___cxa_free_exception": ___cxa_free_exception, "___cxa_rethrow": ___cxa_rethrow, "___cxa_throw": ___cxa_throw, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___map_file": ___map_file, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall145": ___syscall145, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___syscall91": ___syscall91, "___unlock": ___unlock, "__addDays": __addDays, "__arraySum": __arraySum, "__embind_register_bool": __embind_register_bool, "__embind_register_class": __embind_register_class, "__embind_register_class_class_function": __embind_register_class_class_function, "__embind_register_class_constructor": __embind_register_class_constructor, "__embind_register_class_function": __embind_register_class_function, "__embind_register_class_property": __embind_register_class_property, "__embind_register_emval": __embind_register_emval, "__embind_register_float": __embind_register_float, "__embind_register_integer": __embind_register_integer, "__embind_register_memory_view": __embind_register_memory_view, "__embind_register_smart_ptr": __embind_register_smart_ptr, "__embind_register_std_string": __embind_register_std_string, "__embind_register_std_wstring": __embind_register_std_wstring, "__embind_register_void": __embind_register_void, "__emval_call": __emval_call, "__emval_decref": __emval_decref, "__emval_incref": __emval_incref, "__emval_lookupTypes": __emval_lookupTypes, "__emval_register": __emval_register, "__emval_take_value": __emval_take_value, "__isLeapYear": __isLeapYear, "_abort": _abort, "_embind_repr": _embind_repr, "_emscripten_get_heap_size": _emscripten_get_heap_size, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_resize_heap": _emscripten_resize_heap, "_getenv": _getenv, "_llvm_stackrestore": _llvm_stackrestore, "_llvm_stacksave": _llvm_stacksave, "_pthread_cond_wait": _pthread_cond_wait, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "_strftime": _strftime, "_strftime_l": _strftime_l, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "constNoSmartPtrRawPointerToWireType": constNoSmartPtrRawPointerToWireType, "count_emval_handles": count_emval_handles, "craftInvokerFunction": craftInvokerFunction, "createNamedFunction": createNamedFunction, "downcastPointer": downcastPointer, "embind__requireFunction": embind__requireFunction, "embind_init_charCodes": embind_init_charCodes, "ensureOverloadTable": ensureOverloadTable, "exposePublicSymbol": exposePublicSymbol, "extendError": extendError, "floatReadValueFromPointer": floatReadValueFromPointer, "flushPendingDeletes": flushPendingDeletes, "genericPointerToWireType": genericPointerToWireType, "getBasestPointer": getBasestPointer, "getInheritedInstance": getInheritedInstance, "getInheritedInstanceCount": getInheritedInstanceCount, "getLiveInheritedInstances": getLiveInheritedInstances, "getShiftFromSize": getShiftFromSize, "getTypeName": getTypeName, "get_first_emval": get_first_emval, "heap32VectorToArray": heap32VectorToArray, "init_ClassHandle": init_ClassHandle, "init_RegisteredPointer": init_RegisteredPointer, "init_embind": init_embind, "init_emval": init_emval, "integerReadValueFromPointer": integerReadValueFromPointer, "makeClassHandle": makeClassHandle, "makeLegalFunctionName": makeLegalFunctionName, "new_": new_, "nonConstNoSmartPtrRawPointerToWireType": nonConstNoSmartPtrRawPointerToWireType, "readLatin1String": readLatin1String, "registerType": registerType, "replacePublicSymbol": replacePublicSymbol, "requireHandle": requireHandle, "requireRegisteredType": requireRegisteredType, "runDestructor": runDestructor, "runDestructors": runDestructors, "setDelayFunction": setDelayFunction, "shallowCopyInternalPointer": shallowCopyInternalPointer, "simpleReadValueFromPointer": simpleReadValueFromPointer, "throwBindingError": throwBindingError, "throwInstanceAlreadyDeleted": throwInstanceAlreadyDeleted, "throwInternalError": throwInternalError, "throwUnboundTypeError": throwUnboundTypeError, "upcastPointer": upcastPointer, "validateThis": validateThis, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "tempDoublePtr": tempDoublePtr, "DYNAMICTOP_PTR": DYNAMICTOP_PTR }
// EMSCRIPTEN_START_ASM
var asm =Module["asm"]// EMSCRIPTEN_END_ASM
(asmGlobalArg, asmLibraryArg, buffer);

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____getTypeName = asm["___getTypeName"]; asm["___getTypeName"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____getTypeName.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__memmove = asm["_memmove"]; asm["_memmove"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__memmove.apply(null, arguments);
};

var real__pthread_cond_broadcast = asm["_pthread_cond_broadcast"]; asm["_pthread_cond_broadcast"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_cond_broadcast.apply(null, arguments);
};

var real__pthread_mutex_lock = asm["_pthread_mutex_lock"]; asm["_pthread_mutex_lock"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_mutex_lock.apply(null, arguments);
};

var real__pthread_mutex_unlock = asm["_pthread_mutex_unlock"]; asm["_pthread_mutex_unlock"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__pthread_mutex_unlock.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real__setThrew = asm["_setThrew"]; asm["_setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__setThrew.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_globalCtors = asm["globalCtors"]; asm["globalCtors"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_globalCtors.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memmove = Module["_memmove"] = asm["_memmove"];
var _memset = Module["_memset"] = asm["_memset"];
var _pthread_cond_broadcast = Module["_pthread_cond_broadcast"] = asm["_pthread_cond_broadcast"];
var _pthread_mutex_lock = Module["_pthread_mutex_lock"] = asm["_pthread_mutex_lock"];
var _pthread_mutex_unlock = Module["_pthread_mutex_unlock"] = asm["_pthread_mutex_unlock"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var _setThrew = Module["_setThrew"] = asm["_setThrew"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var globalCtors = Module["globalCtors"] = asm["globalCtors"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_dddd = Module["dynCall_dddd"] = asm["dynCall_dddd"];
var dynCall_dddddd = Module["dynCall_dddddd"] = asm["dynCall_dddddd"];
var dynCall_di = Module["dynCall_di"] = asm["dynCall_di"];
var dynCall_did = Module["dynCall_did"] = asm["dynCall_did"];
var dynCall_didd = Module["dynCall_didd"] = asm["dynCall_didd"];
var dynCall_diddd = Module["dynCall_diddd"] = asm["dynCall_diddd"];
var dynCall_diddddd = Module["dynCall_diddddd"] = asm["dynCall_diddddd"];
var dynCall_didddddii = Module["dynCall_didddddii"] = asm["dynCall_didddddii"];
var dynCall_didddii = Module["dynCall_didddii"] = asm["dynCall_didddii"];
var dynCall_diddidd = Module["dynCall_diddidd"] = asm["dynCall_diddidd"];
var dynCall_didi = Module["dynCall_didi"] = asm["dynCall_didi"];
var dynCall_didid = Module["dynCall_didid"] = asm["dynCall_didid"];
var dynCall_dididdd = Module["dynCall_dididdd"] = asm["dynCall_dididdd"];
var dynCall_dididi = Module["dynCall_dididi"] = asm["dynCall_dididi"];
var dynCall_dii = Module["dynCall_dii"] = asm["dynCall_dii"];
var dynCall_diid = Module["dynCall_diid"] = asm["dynCall_diid"];
var dynCall_diidd = Module["dynCall_diidd"] = asm["dynCall_diidd"];
var dynCall_diiddd = Module["dynCall_diiddd"] = asm["dynCall_diiddd"];
var dynCall_diiddddd = Module["dynCall_diiddddd"] = asm["dynCall_diiddddd"];
var dynCall_diidddddii = Module["dynCall_diidddddii"] = asm["dynCall_diidddddii"];
var dynCall_diidddii = Module["dynCall_diidddii"] = asm["dynCall_diidddii"];
var dynCall_diiddidd = Module["dynCall_diiddidd"] = asm["dynCall_diiddidd"];
var dynCall_diidi = Module["dynCall_diidi"] = asm["dynCall_diidi"];
var dynCall_diidid = Module["dynCall_diidid"] = asm["dynCall_diidid"];
var dynCall_diididdd = Module["dynCall_diididdd"] = asm["dynCall_diididdd"];
var dynCall_diididi = Module["dynCall_diididi"] = asm["dynCall_diididi"];
var dynCall_diii = Module["dynCall_diii"] = asm["dynCall_diii"];
var dynCall_diiii = Module["dynCall_diiii"] = asm["dynCall_diiii"];
var dynCall_fiii = Module["dynCall_fiii"] = asm["dynCall_fiii"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iid = Module["dynCall_iid"] = asm["dynCall_iid"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiid = Module["dynCall_iiid"] = asm["dynCall_iiid"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_iiiid = Module["dynCall_iiiid"] = asm["dynCall_iiiid"];
var dynCall_iiiif = Module["dynCall_iiiif"] = asm["dynCall_iiiif"];
var dynCall_iiiii = Module["dynCall_iiiii"] = asm["dynCall_iiiii"];
var dynCall_iiiiid = Module["dynCall_iiiiid"] = asm["dynCall_iiiiid"];
var dynCall_iiiiii = Module["dynCall_iiiiii"] = asm["dynCall_iiiiii"];
var dynCall_iiiiiid = Module["dynCall_iiiiiid"] = asm["dynCall_iiiiiid"];
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = asm["dynCall_iiiiiii"];
var dynCall_iiiiiiii = Module["dynCall_iiiiiiii"] = asm["dynCall_iiiiiiii"];
var dynCall_iiiiiiiii = Module["dynCall_iiiiiiiii"] = asm["dynCall_iiiiiiiii"];
var dynCall_iiiiiiiiiii = Module["dynCall_iiiiiiiiiii"] = asm["dynCall_iiiiiiiiiii"];
var dynCall_iiiiiiiiiiii = Module["dynCall_iiiiiiiiiiii"] = asm["dynCall_iiiiiiiiiiii"];
var dynCall_iiiiiiiiiiiii = Module["dynCall_iiiiiiiiiiiii"] = asm["dynCall_iiiiiiiiiiiii"];
var dynCall_iiiiij = Module["dynCall_iiiiij"] = asm["dynCall_iiiiij"];
var dynCall_jiiii = Module["dynCall_jiiii"] = asm["dynCall_jiiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vid = Module["dynCall_vid"] = asm["dynCall_vid"];
var dynCall_vidd = Module["dynCall_vidd"] = asm["dynCall_vidd"];
var dynCall_vidid = Module["dynCall_vidid"] = asm["dynCall_vidid"];
var dynCall_vididd = Module["dynCall_vididd"] = asm["dynCall_vididd"];
var dynCall_vididdd = Module["dynCall_vididdd"] = asm["dynCall_vididdd"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viid = Module["dynCall_viid"] = asm["dynCall_viid"];
var dynCall_viidd = Module["dynCall_viidd"] = asm["dynCall_viidd"];
var dynCall_viidid = Module["dynCall_viidid"] = asm["dynCall_viidid"];
var dynCall_viididd = Module["dynCall_viididd"] = asm["dynCall_viididd"];
var dynCall_viididdd = Module["dynCall_viididdd"] = asm["dynCall_viididdd"];
var dynCall_viif = Module["dynCall_viif"] = asm["dynCall_viif"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_viiid = Module["dynCall_viiid"] = asm["dynCall_viiid"];
var dynCall_viiif = Module["dynCall_viiif"] = asm["dynCall_viiif"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
var dynCall_viiiiiiiiii = Module["dynCall_viiiiiiiiii"] = asm["dynCall_viiiiiiiiii"];
var dynCall_viiiiiiiiiiiiiii = Module["dynCall_viiiiiiiiiiiiiii"] = asm["dynCall_viiiiiiiiiiiiiii"];
var dynCall_viijii = Module["dynCall_viijii"] = asm["dynCall_viijii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["ENV"]) Module["ENV"] = function() { abort("'ENV' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackSave"]) Module["stackSave"] = function() { abort("'stackSave' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackRestore"]) Module["stackRestore"] = function() { abort("'stackRestore' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackAlloc"]) Module["stackAlloc"] = function() { abort("'stackAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["establishStackSpace"]) Module["establishStackSpace"] = function() { abort("'establishStackSpace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["print"]) Module["print"] = function() { abort("'print' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["printErr"]) Module["printErr"] = function() { abort("'printErr' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getTempRet0"]) Module["getTempRet0"] = function() { abort("'getTempRet0' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setTempRet0"]) Module["setTempRet0"] = function() { abort("'setTempRet0' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayFromBase64"]) Module["intArrayFromBase64"] = function() { abort("'intArrayFromBase64' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["tryParseAsDataURI"]) Module["tryParseAsDataURI"] = function() { abort("'tryParseAsDataURI' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });




/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}





/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = out;
  var printErr = err;
  var has = false;
  out = err = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = Module['_fflush'];
    if (flush) flush(0);
    // also flush in the JS FS layer
    var hasFS = true;
    if (hasFS) {
      ['stdout', 'stderr'].forEach(function(name) {
        var info = FS.analyzePath('/dev/' + name);
        if (!info) return;
        var stream = info.object;
        var rdev = stream.rdev;
        var tty = TTY.ttys[rdev];
        if (tty && tty.output && tty.output.length) {
          has = true;
        }
      });
    }
  } catch(e) {}
  out = print;
  err = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      err('exit(' + status + ') called, but EXIT_RUNTIME is not set, so halting execution but not exiting the runtime or preventing further async execution (build with EXIT_RUNTIME=1, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  Module['quit'](status, new ExitStatus(status));
}

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    out(what);
    err(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


  Module["noExitRuntime"] = true;

run();





// {{MODULE_ADDITIONS}}



/*
Copyright notice for the base64 to arraybuffer conversion algorithm.

Copyright (c) 2011, Daniel Guerrero
All rights reserved.
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL DANIEL GUERRERO BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* global Module */

"use strict";
var currentDate = "20 February 2019, 12:17am";
console.log("MaxiAudio: " + Date());

// ------------------------------------------------
// maxiArray - could extend Array object?
// cheaty array method to avoid mixing vector terminology with arrays
// but have to copy everything?!
// better to use GetArrayAsVectorDbl function ???
Module.maxiArray = function maxiArray() {
    this.length = 0;
    var vec = new Module.VectorDouble();

// this.update = function(){
//     var lengthsMatch = this.length !== this.vec.size();
//     if(!lengthsMatch){
//         if(this.length < this.vec.size()){
//             for(var i = this.length; i < this.vec.size(); i++){
//                 this[i] = this.vec.get(i);
//             }
//         } else{
//             for(var i = this.length; i < this.vec.size(); i++){
//                 delete this[i];
//             }
//         }

//         // reset length var
//         this.length = this.vec.size();
//     }
// };
};

Module.maxiArray.prototype.asVector = function (arrayIn) {
    return this.vec;
};

Module.maxiArray.prototype.asJsArray = function (arrayIn) {
    var arrayOut = [];

    for (var i = 0; i < this.length; i++) {
        array.push(this.vec.get(i)); //FIXME: mz I think this must be a bug? What is "array"? arrayOut maybe?
    }

    return arrayOut;
};

Module.maxiArray.prototype.set = function (arrayIn) {
    this.clear();
    this.vec = GetArrayAsVectorDbl(arrayIn); //FIXME: mz this is part of maxiTools
    this.length = this.vec.size();
    this.SetSqBrackets(true);
};

Module.maxiArray.prototype.push = function (num) {
    this.vec.push_back(num);
    this[this.length] = num;
    this.length++;
};

// set object properties to mimic array
// this doesn't seem particularly efficient or smart
Module.maxiArray.prototype.SetSqBrackets = function (useSq) {
    for (var i = 0; i < this.length; i++) {
        if (useSq) {
            this[i] = this.vec.get(i);
        } else {
            delete this[i];
        }
    }
};

Module.maxiArray.prototype.clear = function (useSq) {
    for (var i = 0; i < this.length; i++) {
        delete this[i];
    }
    Module.vectorTools.clearVectorDbl(this.vec); //FIXME: mz this is also part of maxiTools
    this.length = 0;
};


// tools
Module.maxiTools = function () {
};

// not sure this is good
// Module.maxiTools.arrayOfObj = function(obj, num){
//     var array = [];

//     for(var i = 0; i < num; i++){
//         array.push(new obj());
//     }
//     return array;
// };

Module.maxiTools.getArrayAsVectorDbl = function (arrayIn) {
    var vecOut = new Module.VectorDouble();
    for (var i = 0; i < arrayIn.length; i++) {
        vecOut.push_back(arrayIn[i]);
    }

    return vecOut;
};

Module.maxiTools.getBase64 = function (str) {
    //check if the string is a data URI
    if (str.indexOf(';base64,') !== -1) {
        //see where the actual data begins
        var dataStart = str.indexOf(';base64,') + 8;
        //check if the data is base64-encoded, if yes, return it
        // taken from
        // http://stackoverflow.com/a/8571649
        return str.slice(dataStart).match(/^([A-Za-z0-9+\/]{4})*([A-Za-z0-9+\/]{4}|[A-Za-z0-9+\/]{3}=|[A-Za-z0-9+\/]{2}==)$/) ? str.slice(dataStart) : false;
    }
    else return false;
};

Module.maxiTools._keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

Module.maxiTools.removePaddingFromBase64 = function (input) {
    var lkey = Module.maxiTools._keyStr.indexOf(input.charAt(input.length - 1));
    if (lkey === 64) {
        return input.substring(0, input.length - 1);
    }
    return input;
};


// ------------------------------------------------
Module.maxiAudio = function () {
    this.numChannels = 2;
    this.output = 0;

    this.context = null;
    this.source = null;
    this.analyser = null;
    this.jsProcessor = null;
    this.bufferSize = 1024;
    this.initDone = false;
};



Module.maxiAudio.play = function () {
};

// Module.maxiAudio.prototype.mzedTest = function () {
//     console.log("mzed loves you!");
// };

// don't really need setup??
Module.maxiAudio.setup = function () {
    console.log("non-overrided setup");
};

Module.maxiAudio.prototype.getNumChannels = function () {
    return this.numChannels;
};

// isArray should be second param really
// set num channels and set output as an array
// use this if you want to change number of channels
Module.maxiAudio.prototype.setNumChannels = function (isArray, numChannels_) {

    this.numChannels = numChannels_;
    this.outputIsArray(isArray, numChannels_);

    this.resetAudio();
};

Module.maxiAudio.prototype.setBufferSize = function (newBufferSize) {
    this.bufferSize = newBufferSize;
    this.resetAudio();
};

// use this if you want to keep num of outputs but change
// method e.g. array or not
Module.maxiAudio.prototype.outputIsArray = function (isArray) {
    if (isArray) {
        this.output = new Array(this.numChannels);

        for (var i = 0; i < this.numChannels; i++) {
            this.output[i] = 0;
        }
    } else {
        this.output = 0;
    }
};

Module.maxiAudio.prototype.init = function () {

    // Temporary patch until all browsers support unprefixed context.
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.context.createBufferSource();
    this.jsProcessor = this.context.createScriptProcessor(this.bufferSize, this.numChannels, this.numChannels);
    // var process = this.process;

    this.jsProcessor.onaudioprocess = function (event) {
        var numChannels = event.outputBuffer.numberOfChannels;
        var outputLength = event.outputBuffer.getChannelData(0).length;
        for (var i = 0; i < outputLength; ++i) {
            this.play();
            // if(this.play===undefined)
            //   break;
            // else
            //   this.play();
            var channel = 0;
            if (this.output instanceof Array) {
                for (channel = 0; channel < numChannels; channel++) {
                    event.outputBuffer.getChannelData(channel)[i] = this.output[channel];
                }
            }
            else {
                for (channel = 0; channel < numChannels; channel++) {
                    event.outputBuffer.getChannelData(channel)[i] = this.output;
                }
            }
        }
    }
        .bind(this)
    ;

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;

    // Connect the processing graph: source -> jsProcessor -> analyser -> destination
    this.source.connect(this.jsProcessor);
    this.jsProcessor.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    this.initDone = true;
};

Module.maxiAudio.prototype.resetAudio = function () {
    if (this.initDone) {
        this.source.disconnect();
        this.jsProcessor.disconnect();
        this.analyser.disconnect();
    }

    this.init();
};

// option to load sample if a different context is used
Module.maxiAudio.prototype.loadSample = function (url, samplePlayer, contextIn) {
    var data = [];
    var context;

    if (!contextIn) {
        context = this.context;
    } else {
        context = contextIn;
    }

    samplePlayer.clear();

    //check if url is actually a base64-encoded string
    var b64 = Module.maxiTools.getBase64(url);
    if (b64) {
        //convert to arraybuffer
        //modified version of this:
        // https://github.com/danguer/blog-examples/blob/master/js/base64-binary.js
        var ab_bytes = (b64.length / 4) * 3;
        var arrayBuffer = new ArrayBuffer(ab_bytes);

        b64 = Module.maxiTools.removePaddingFromBase64(Module.maxiTools.removePaddingFromBase64(b64));

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
            enc1 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));
            enc2 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));
            enc3 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));
            enc4 = Module.maxiTools._keyStr.indexOf(b64.charAt(j++));

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            uarray[i] = chr1;
            if (enc3 !== 64) uarray[i + 1] = chr2;
            if (enc4 !== 64) uarray[i + 2] = chr3;
        }

        context.decodeAudioData(
            arrayBuffer,
            function (buffer) {
                // source.buffer = buffer;
                // source.loop = true;
                // source.start(0);
                data = buffer.getChannelData(0);

                if (data) {
                    var myBufferData = new Module.VectorDouble();
                    // Module.vectorTools.clearVectorDbl(myBufferData);

                    for (var n = 0; n < data.length; n++) {
                        myBufferData.push_back(data[n]);
                    }

                    samplePlayer.setSample(myBufferData/*, context.sampleRate*/);
                }

            },

            function (buffer) {
                console.log("Error decoding source!");
            }
        );


    }
    else {
        // Load asynchronously
        var request = new XMLHttpRequest();
        request.addEventListener("load",
            function (evt) {
                console.log("The transfer is complete.");
            });
        request.open("GET", url, true);

        request.responseType = "arraybuffer";

        request.onload = function () {
            context.decodeAudioData(
                request.response,
                function (buffer) {
                    // source.buffer = buffer;
                    // source.loop = true;
                    // source.start(0);
                    data = buffer.getChannelData(0);

                    if (data) {
                        var myBufferData = new Module.VectorDouble();
                        // Module.vectorTools.clearVectorDbl(myBufferData);

                        for (var n = 0; n < data.length; n++) {
                            myBufferData.push_back(data[n]);
                        }

                        samplePlayer.setSample(myBufferData/*, context.sampleRate*/);
                    }

                },

                function (buffer) {
                    console.log("Error decoding source!");
                }
            );
        };

        request.send();
    }

};

export default Module;

