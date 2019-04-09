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
    STACK_BASE = 51744,
    STACKTOP = STACK_BASE,
    STACK_MAX = 5294624,
    DYNAMIC_BASE = 5294624,
    DYNAMICTOP_PTR = 51488;

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




var wasmBinaryFile = 'data:application/octet-stream;base64,AGFzbQEAAAABugh6YAABf2ACf38AYAN/f38AYAF/AX9gA39/fwF/YAF/AGAEf39/fwF/YAJ/fAF8YAR/fHx8AXxgA398fAF8YAF/AXxgAn98AGADf39/AXxgA39/fABgBH98f3wBfGAFf3x/fH8BfGAEf3x/fABgBX98f3x8AGAGf3x/fHx8AGADf3x8AGAFfHx8fHwBfGADfHx8AXxgBn98fH98fAF8YAZ/fHx8fHwBfGAGf3x8fH9/AXxgCH98fHx8fH9/AXxgA398fwF8YAJ/fwF8YAZ/fH98fHwBfGACf3wBf2ACf38Bf2AFf39/f38Bf2AIf39/f39/f38Bf2AGf39/f39/AX9gAABgBH9/f38AYAZ/f39/f38AYAV/f39/fwBgA39/fAF8YAR/f3x8AXxgBX9/fHx8AXxgB39/fHx8fHwBfGAJf398fHx8fH9/AXxgB39/fHx8f38BfGAHf398fH98fAF8YAR/f3x/AXxgBX9/fH98AXxgB39/fH98fHwBfGAGf398f3x/AXxgBH9/f38BfGADf39/AX1gA39/fAF/YAR/f398AX9gBH9/f30Bf2AFf39/f3wBf2AGf39/f398AX9gB39/f39/f38Bf2AKf39/f39/f39/fwF/YAt/f39/f39/f39/fwF/YAx/f39/f39/f39/f38Bf2AFf39/f34Bf2AEf39/fwF+YAR/f3x8AGAFf398f3wAYAZ/f3x/fHwAYAd/f3x/fHx8AGADf399AGAEf39/fABgBH9/f30AYAd/f39/f39/AGAKf39/f39/f39/fwBgD39/f39/f39/f39/f39/fwBgBX9/fn9/AGAJf39/f39/f39/AX9gDX9/f39/f39/f39/f38Bf2AIf39/f39/f38AYAt/f39/f39/f39/fwBgEH9/f39/f39/f39/f39/f38AYA1/f39/f39/f39/f39/AGAMf39/f39/f39/f39/AGABfAF8YAF9AX1gAn99AGABfwF9YAN/f34AYAR/f39+AX5gBX9/f39/AXxgBn9/f39/fwF8YAJ/fwF+YAJ8fwF8YAJ8fAF8YAF8AX5gA35/fwF/YAJ+fwF/YAZ/fH9/f38Bf2ADf39/AX5gA3x8fwF8YAJ8fwF/YAJ/fwF9YAR/f398AXxgBX9/f3x8AXxgBn9/f3x8fAF8YAh/f398fHx8fAF8YAp/f398fHx8fH9/AXxgCH9/f3x8fH9/AXxgCH9/f3x8f3x8AXxgBX9/f3x/AXxgBn9/f3x/fAF8YAh/f398f3x8fAF8YAd/f398f3x/AXxgBH9/f38BfWAFf39/f30Bf2AHf39/f39/fAF/YAZ/f39/f34Bf2AFf39/f38BfmAFf39/fHwAYAZ/f398f3wAYAd/f398f3x8AGAIf39/fH98fHwAYAV/f39/fABgBX9/f399AGAGf39/fn9/AALcG5sBA2VudgtnZXRUZW1wUmV0MAAAA2VudhJhYm9ydFN0YWNrT3ZlcmZsb3cABQNlbnYNbnVsbEZ1bmNfZGRkZAAFA2Vudg9udWxsRnVuY19kZGRkZGQABQNlbnYLbnVsbEZ1bmNfZGkABQNlbnYMbnVsbEZ1bmNfZGlkAAUDZW52DW51bGxGdW5jX2RpZGQABQNlbnYObnVsbEZ1bmNfZGlkZGQABQNlbnYQbnVsbEZ1bmNfZGlkZGRkZAAFA2VudhJudWxsRnVuY19kaWRkZGRkaWkABQNlbnYQbnVsbEZ1bmNfZGlkZGRpaQAFA2VudhBudWxsRnVuY19kaWRkaWRkAAUDZW52DW51bGxGdW5jX2RpZGkABQNlbnYObnVsbEZ1bmNfZGlkaWQABQNlbnYQbnVsbEZ1bmNfZGlkaWRkZAAFA2Vudg9udWxsRnVuY19kaWRpZGkABQNlbnYMbnVsbEZ1bmNfZGlpAAUDZW52DW51bGxGdW5jX2RpaWQABQNlbnYObnVsbEZ1bmNfZGlpZGQABQNlbnYPbnVsbEZ1bmNfZGlpZGRkAAUDZW52EW51bGxGdW5jX2RpaWRkZGRkAAUDZW52E251bGxGdW5jX2RpaWRkZGRkaWkABQNlbnYRbnVsbEZ1bmNfZGlpZGRkaWkABQNlbnYRbnVsbEZ1bmNfZGlpZGRpZGQABQNlbnYObnVsbEZ1bmNfZGlpZGkABQNlbnYPbnVsbEZ1bmNfZGlpZGlkAAUDZW52EW51bGxGdW5jX2RpaWRpZGRkAAUDZW52EG51bGxGdW5jX2RpaWRpZGkABQNlbnYNbnVsbEZ1bmNfZGlpaQAFA2Vudg5udWxsRnVuY19kaWlpaQAFA2Vudg1udWxsRnVuY19maWlpAAUDZW52Cm51bGxGdW5jX2kABQNlbnYLbnVsbEZ1bmNfaWkABQNlbnYMbnVsbEZ1bmNfaWlkAAUDZW52DG51bGxGdW5jX2lpaQAFA2Vudg1udWxsRnVuY19paWlkAAUDZW52DW51bGxGdW5jX2lpaWkABQNlbnYObnVsbEZ1bmNfaWlpaWQABQNlbnYObnVsbEZ1bmNfaWlpaWYABQNlbnYObnVsbEZ1bmNfaWlpaWkABQNlbnYPbnVsbEZ1bmNfaWlpaWlkAAUDZW52D251bGxGdW5jX2lpaWlpaQAFA2VudhBudWxsRnVuY19paWlpaWlkAAUDZW52EG51bGxGdW5jX2lpaWlpaWkABQNlbnYRbnVsbEZ1bmNfaWlpaWlpaWkABQNlbnYSbnVsbEZ1bmNfaWlpaWlpaWlpAAUDZW52FG51bGxGdW5jX2lpaWlpaWlpaWlpAAUDZW52FW51bGxGdW5jX2lpaWlpaWlpaWlpaQAFA2VudhZudWxsRnVuY19paWlpaWlpaWlpaWlpAAUDZW52D251bGxGdW5jX2lpaWlpagAFA2Vudg5udWxsRnVuY19qaWlpaQAFA2VudgpudWxsRnVuY192AAUDZW52C251bGxGdW5jX3ZpAAUDZW52DG51bGxGdW5jX3ZpZAAFA2Vudg1udWxsRnVuY192aWRkAAUDZW52Dm51bGxGdW5jX3ZpZGlkAAUDZW52D251bGxGdW5jX3ZpZGlkZAAFA2VudhBudWxsRnVuY192aWRpZGRkAAUDZW52DG51bGxGdW5jX3ZpaQAFA2Vudg1udWxsRnVuY192aWlkAAUDZW52Dm51bGxGdW5jX3ZpaWRkAAUDZW52D251bGxGdW5jX3ZpaWRpZAAFA2VudhBudWxsRnVuY192aWlkaWRkAAUDZW52EW51bGxGdW5jX3ZpaWRpZGRkAAUDZW52DW51bGxGdW5jX3ZpaWYABQNlbnYNbnVsbEZ1bmNfdmlpaQAFA2Vudg5udWxsRnVuY192aWlpZAAFA2Vudg5udWxsRnVuY192aWlpZgAFA2Vudg5udWxsRnVuY192aWlpaQAFA2Vudg9udWxsRnVuY192aWlpaWkABQNlbnYQbnVsbEZ1bmNfdmlpaWlpaQAFA2VudhFudWxsRnVuY192aWlpaWlpaQAFA2VudhRudWxsRnVuY192aWlpaWlpaWlpaQAFA2VudhludWxsRnVuY192aWlpaWlpaWlpaWlpaWlpAAUDZW52D251bGxGdW5jX3ZpaWppaQAFA2VudgtpbnZva2VfZGlpaQAxA2VudgtpbnZva2VfZmlpaQAxA2VudghpbnZva2VfaQADA2VudglpbnZva2VfaWkAHgNlbnYKaW52b2tlX2lpaQAEA2VudgtpbnZva2VfaWlpaQAGA2VudgxpbnZva2VfaWlpaWkAHwNlbnYOaW52b2tlX2lpaWlpaWkAOANlbnYPaW52b2tlX2lpaWlpaWlpACADZW52EGludm9rZV9paWlpaWlpaWkASQNlbnYSaW52b2tlX2lpaWlpaWlpaWlpADoDZW52E2ludm9rZV9paWlpaWlpaWlpaWkAOwNlbnYUaW52b2tlX2lpaWlpaWlpaWlpaWkASgNlbnYIaW52b2tlX3YABQNlbnYJaW52b2tlX3ZpAAEDZW52Cmludm9rZV92aWkAAgNlbnYLaW52b2tlX3ZpaWkAIwNlbnYMaW52b2tlX3ZpaWlpACUDZW52D2ludm9rZV92aWlpaWlpaQBLA2VudhJpbnZva2VfdmlpaWlpaWlpaWkATANlbnYXaW52b2tlX3ZpaWlpaWlpaWlpaWlpaWkATQNlbnYZX19fY3hhX2FsbG9jYXRlX2V4Y2VwdGlvbgADA2VudhJfX19jeGFfYmVnaW5fY2F0Y2gAAwNlbnYQX19fY3hhX2VuZF9jYXRjaAAiA2VudhxfX19jeGFfZmluZF9tYXRjaGluZ19jYXRjaF8yAAADZW52HF9fX2N4YV9maW5kX21hdGNoaW5nX2NhdGNoXzMAAwNlbnYVX19fY3hhX2ZyZWVfZXhjZXB0aW9uAAUDZW52Dl9fX2N4YV9yZXRocm93ACIDZW52DF9fX2N4YV90aHJvdwACA2VudgdfX19sb2NrAAUDZW52C19fX21hcF9maWxlAB4DZW52El9fX3Jlc3VtZUV4Y2VwdGlvbgAFA2VudgtfX19zZXRFcnJObwAFA2Vudg1fX19zeXNjYWxsMTQwAB4DZW52DV9fX3N5c2NhbGwxNDUAHgNlbnYNX19fc3lzY2FsbDE0NgAeA2VudgxfX19zeXNjYWxsNTQAHgNlbnYLX19fc3lzY2FsbDYAHgNlbnYMX19fc3lzY2FsbDkxAB4DZW52CV9fX3VubG9jawAFA2VudhZfX2VtYmluZF9yZWdpc3Rlcl9ib29sACUDZW52F19fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzAE4DZW52Jl9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2NsYXNzX2Z1bmN0aW9uAEUDZW52I19fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2NvbnN0cnVjdG9yACQDZW52IF9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX2Z1bmN0aW9uAEsDZW52IF9fZW1iaW5kX3JlZ2lzdGVyX2NsYXNzX3Byb3BlcnR5AEYDZW52F19fZW1iaW5kX3JlZ2lzdGVyX2VtdmFsAAEDZW52F19fZW1iaW5kX3JlZ2lzdGVyX2Zsb2F0AAIDZW52GV9fZW1iaW5kX3JlZ2lzdGVyX2ludGVnZXIAJQNlbnYdX19lbWJpbmRfcmVnaXN0ZXJfbWVtb3J5X3ZpZXcAAgNlbnYbX19lbWJpbmRfcmVnaXN0ZXJfc21hcnRfcHRyAE8DZW52HF9fZW1iaW5kX3JlZ2lzdGVyX3N0ZF9zdHJpbmcAAQNlbnYdX19lbWJpbmRfcmVnaXN0ZXJfc3RkX3dzdHJpbmcAAgNlbnYWX19lbWJpbmRfcmVnaXN0ZXJfdm9pZAABA2VudgxfX2VtdmFsX2NhbGwABgNlbnYOX19lbXZhbF9kZWNyZWYABQNlbnYOX19lbXZhbF9pbmNyZWYABQNlbnYSX19lbXZhbF90YWtlX3ZhbHVlAB4DZW52Bl9hYm9ydAAiA2VudhlfZW1zY3JpcHRlbl9nZXRfaGVhcF9zaXplAAADZW52Fl9lbXNjcmlwdGVuX21lbWNweV9iaWcABANlbnYXX2Vtc2NyaXB0ZW5fcmVzaXplX2hlYXAAAwNlbnYHX2dldGVudgADA2VudhJfbGx2bV9zdGFja3Jlc3RvcmUABQNlbnYPX2xsdm1fc3RhY2tzYXZlAAADZW52El9wdGhyZWFkX2NvbmRfd2FpdAAeA2VudhRfcHRocmVhZF9nZXRzcGVjaWZpYwADA2VudhNfcHRocmVhZF9rZXlfY3JlYXRlAB4DZW52DV9wdGhyZWFkX29uY2UAHgNlbnYUX3B0aHJlYWRfc2V0c3BlY2lmaWMAHgNlbnYLX3N0cmZ0aW1lX2wAHwNlbnYXYWJvcnRPbkNhbm5vdEdyb3dNZW1vcnkAAwNl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BQAEAwEDBAQEAwgXGyYnKCkqKywtLi8wDGNkZWZnaGlqa2xtMVZuAx4zBDQGNm8fNyFwOCBJOjtKcXIFAQ0+P0BBAkNzdHV2RCN3eCUkRUtMTXkVFAoHCQgXGRgWGg4cDxsmJygpKissLS4vMAwxMgADHR4zBDQ1BjYfNyE4IDk6Ozw9IgULExAREgENPj9AQUICQ0QjJSRFRkdIMTY4H0N3RXIGKQd/ASMBC38BQQALfwFBAAt8ASMCC3wBIwMLfwFBoJQDC38BQaCUwwILB/MMXhBfX19jeGFfY2FuX2NhdGNoAIoOFl9fX2N4YV9pc19wb2ludGVyX3R5cGUAiw4RX19fZXJybm9fbG9jYXRpb24AhwkOX19fZ2V0VHlwZU5hbWUAggkHX2ZmbHVzaAChCQVfZnJlZQCBCg9fbGx2bV9ic3dhcF9pMzIAjQ4HX21hbGxvYwCACgdfbWVtY3B5AI4OCF9tZW1tb3ZlAI8OB19tZW1zZXQAkA4XX3B0aHJlYWRfY29uZF9icm9hZGNhc3QA6AMTX3B0aHJlYWRfbXV0ZXhfbG9jawDoAxVfcHRocmVhZF9tdXRleF91bmxvY2sA6AMFX3NicmsAkQ4JX3NldFRocmV3AIwODGR5bkNhbGxfZGRkZACSDg5keW5DYWxsX2RkZGRkZACTDgpkeW5DYWxsX2RpAJQOC2R5bkNhbGxfZGlkAJUODGR5bkNhbGxfZGlkZACWDg1keW5DYWxsX2RpZGRkAJcOD2R5bkNhbGxfZGlkZGRkZACYDhFkeW5DYWxsX2RpZGRkZGRpaQCZDg9keW5DYWxsX2RpZGRkaWkAmg4PZHluQ2FsbF9kaWRkaWRkAJsODGR5bkNhbGxfZGlkaQCcDg1keW5DYWxsX2RpZGlkAJ0OD2R5bkNhbGxfZGlkaWRkZACeDg5keW5DYWxsX2RpZGlkaQCfDgtkeW5DYWxsX2RpaQCgDgxkeW5DYWxsX2RpaWQAoQ4NZHluQ2FsbF9kaWlkZACiDg5keW5DYWxsX2RpaWRkZACjDhBkeW5DYWxsX2RpaWRkZGRkAKQOEmR5bkNhbGxfZGlpZGRkZGRpaQClDhBkeW5DYWxsX2RpaWRkZGlpAKYOEGR5bkNhbGxfZGlpZGRpZGQApw4NZHluQ2FsbF9kaWlkaQCoDg5keW5DYWxsX2RpaWRpZACpDhBkeW5DYWxsX2RpaWRpZGRkAKoOD2R5bkNhbGxfZGlpZGlkaQCrDgxkeW5DYWxsX2RpaWkArA4NZHluQ2FsbF9kaWlpaQCtDgxkeW5DYWxsX2ZpaWkApA8JZHluQ2FsbF9pAK8OCmR5bkNhbGxfaWkAsA4LZHluQ2FsbF9paWQAsQ4LZHluQ2FsbF9paWkAsg4MZHluQ2FsbF9paWlkALMODGR5bkNhbGxfaWlpaQC0Dg1keW5DYWxsX2lpaWlkALUODWR5bkNhbGxfaWlpaWYApQ8NZHluQ2FsbF9paWlpaQC3Dg5keW5DYWxsX2lpaWlpZAC4Dg5keW5DYWxsX2lpaWlpaQC5Dg9keW5DYWxsX2lpaWlpaWQAug4PZHluQ2FsbF9paWlpaWlpALsOEGR5bkNhbGxfaWlpaWlpaWkAvA4RZHluQ2FsbF9paWlpaWlpaWkAvQ4TZHluQ2FsbF9paWlpaWlpaWlpaQC+DhRkeW5DYWxsX2lpaWlpaWlpaWlpaQC/DhVkeW5DYWxsX2lpaWlpaWlpaWlpaWkAwA4OZHluQ2FsbF9paWlpaWoApg8NZHluQ2FsbF9qaWlpaQCnDwlkeW5DYWxsX3YAww4KZHluQ2FsbF92aQDEDgtkeW5DYWxsX3ZpZADFDgxkeW5DYWxsX3ZpZGQAxg4NZHluQ2FsbF92aWRpZADHDg5keW5DYWxsX3ZpZGlkZADIDg9keW5DYWxsX3ZpZGlkZGQAyQ4LZHluQ2FsbF92aWkAyg4MZHluQ2FsbF92aWlkAMsODWR5bkNhbGxfdmlpZGQAzA4OZHluQ2FsbF92aWlkaWQAzQ4PZHluQ2FsbF92aWlkaWRkAM4OEGR5bkNhbGxfdmlpZGlkZGQAzw4MZHluQ2FsbF92aWlmAKgPDGR5bkNhbGxfdmlpaQDRDg1keW5DYWxsX3ZpaWlkANIODWR5bkNhbGxfdmlpaWYAqQ8NZHluQ2FsbF92aWlpaQDUDg5keW5DYWxsX3ZpaWlpaQDVDg9keW5DYWxsX3ZpaWlpaWkA1g4QZHluQ2FsbF92aWlpaWlpaQDXDhNkeW5DYWxsX3ZpaWlpaWlpaWlpANgOGGR5bkNhbGxfdmlpaWlpaWlpaWlpaWlpaQDZDg5keW5DYWxsX3ZpaWppaQCqDxNlc3RhYmxpc2hTdGFja1NwYWNlAJkBC2dsb2JhbEN0b3JzAJUBCnN0YWNrQWxsb2MAlgEMc3RhY2tSZXN0b3JlAJgBCXN0YWNrU2F2ZQCXAQmMGwEAIwALxA3bDrwB3A65AboBuwHdDoYIqQGtAa8BswG0AbYB3g6HCIoIiwiPCJIIjAiJCIgIkAiqCL8B3g7eDt4O3g7fDo0IkQiYCJkIwAHBAcQB4A6OCJoImwicCOcF4A7gDuEO4wWpCMcB4g6vCOMOrgjkDqgI5Q6wCOYOlgjnDsIBwwHnDugOlwjpDoAEqQSpBMMFqQS0COkO6g7zA44G/AbrDvwD8wT/Bt0H6w7rDusO7A73A/AE7A7tDooGgQjtDu4OtAbvDrAG8A6GBvEOuQbyDssE8w6eB74H8w70Ds8E9Q6TCN0G8Qr0CvUO9Q71DvYOogT3DvYK+A6fA58DxwPHA8cDxwPHA8cDxwPHA8cDxwPHA8cDxwPHA8cD5gHmAeYB5gHlCrINtA22Dd4N+A74DvgO+A74DvkOgwnoA+gDjwqQCugD6AOXCpgKuAq4CsAKwQrFCsYK+AHCC8MLxAvFC8YLxwvIC/gB4wvkC+UL5gvnC+gL6QuJDIkM6AOJDIkM6APIAsgC6APIAsgC6APoA+gD8wGyDOgDtAzPDNAM1gzXDOgB6AHoAegD6APzAfMN9g32DfwNlgOgA6oDsgOiAaQBpgG9A/oBxQOHBPoBjwSrAbAE+gG4BNQE+gHcBPgE+gGABaAF+gGoBcgF+gHQBesF+gHzBZQG+gGcBr0Bwgb6AcoG4Qb6AekGggf6AYoHogf6AaoHwQf6AckH4Af6AegH2AHnAcoBmwKkAsgBywLUAsEC8QL6AsoBgALuA7wN7gPuA+4D7gPuA+4D7gPuA+4D7gPuA+4D7gPuA+gD6APoA/kO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+Q75DvkO+g7FAcYB+g77DtwDuA2ZBMIE5gSKBbIF2gX9BaYG1AbzBpQHtAfTB/IHkQqRCpkKmQq6Cr4KwgrHCsIMxAzGDN8M4QzjDLgDyAORBLgDugTeBIIFqgXSBfUFnga4A8wG6waMB6wHywfqB/cBsALdAoYD5QPiCvsO+w77DvsO+w77DvsO+w77DvwO/Af9DoQJhQmICYkJ0AmLCo4KkgqLCpYKmgq5Cr0KzgrTCqMMowzDDMUMyAzbDOAM4gzlDOEN/Q3+Df0BzwGzApMC4ALDAokDzwGlCZEMzw2ZDNoN/Q79Dv0O/Q79Dv0O/Q79Dv0O/Q79Dv0O/Q79Dv0O/Q79Dv0O/Q79Dv0O/Q79Dv4OuwL/DpIDgA/HDNwM3QzeDOQMjALpAoEB5gr+Cv4KgQuFC60LgA+BD6cLqAu2C7cLgQ+BD4EPgg/MCtEKogujC6ULqQuxC7ILtAu4C6gMqQyxDLMMyQzmDKgMrgyoDLkMgg+CD4IPgg+CD4IPgg+CD4IPgg+CD4MPmwyfDIMPhA/XCtgK2QraCtsK3ArdCt4K3wrgCuEKhwuIC4kLiguLC4wLjQuOC48LkAuRC7wLvQu+C78LwAvdC94L3wvgC+ELnAygDKMIuQuED4QPhA+ED4QPhA+ED4QPhA+ED4QPhA+ED4QPhA+ED4QPhA+ED4QPhA+ED4QPhA+ED4QPhA+FD4EMhQyODI8MlgyXDIYLoQuFD4UPhQ+FD4UPhQ+FD4YPwQviC6YMpwyvDLAMrQytDLcMuAyGD4YPhg+GD4YPhw/kCpILhw+ID5AMmAyID4kP8AqVC4kPig+kC6YLswu1C4oPig+KD4sP+wqDC4sPjA/dDWZiuw3LC8oLyQvtC+wL6wvsDO4M8gz0DPYM+Az6DIANgg2EDYYNiA2KDYwNjg2QDZINlA2WDZgNmg2cDZ4NoA2iDe0NjA+MD4wPjA+MD4wPjA+MD4wPjA+MD4wPjA+MD4wPjA+MD4wPjA+MD4wPjA+MD4wPjA+MD4wPjQ/ZA9oD2wPdA4kC8gOJAt0DlgSXBJgE3QPyA4kC3QO/BMAEwQTdA/IDiQLdA+ME5ATlBN0D8gOJAt0DhwWIBYkF3QPyA4kC3QOvBbAFsQXdA/IDiQLdA9cF2AXZBd0D8gOJAt0D+gX7BfwF3QPyA4kC3QOjBqQGpQbdA/IDiQLdA9EG0gbTBt0D8gOJAt0D8AbxBvIG3QPyA4kC3QORB5IHkwfdA/IDiQLdA7EHsgezB90D8gOJAt0D0AfRB9IH3QPyA4kC3QPvB/AH8QfdA/IDiQLdA4YKiAqJCooKlAqVCpwKnQqeCp8KoAqhCqIKowqkCqUKpgqnCqgKqQqqCqsKlQqKCpUKigrJCsoKywrJCtAKyQrWCskK1grJCtYKyQrWCskK1grJCtYK/wuADP8LgAzJCtYKyQrWCskK1grJCtYKyQrWCskK1grJCtYKyQrWCskK1grJCtYKiQLWCtYKtQy2DL0MvgzADMEMzQzODNQM1QzWCtYK1grWCtYKiQLgDYkCiQLgDYkC8g30DfUN+Q36DfUNiQL7DeAN4A3gDZcDoAGgAZcDlwPJA/ADlwOSBKAElwO7BMkElwPfBO0ElwODBZEFlwOrBbkFlwPTBeEFlwP2BYQGlwOfBq0GlwPNBtsGlwPsBvoGlwONB5sHlwOtB7sHlwPMB9oHlwPrB/kH2gGcAswC8gKCAbsFnQe9B+oK7AqJAogMgQruDY0PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND40PjQ+ND44PtwGqAa4BsAGyAbUBtwG4AasIrAitCLcBsQirCLMIsgiOD44Pjg+OD44Pjg+OD44Pjg+OD44Pjg+OD44Pjg+PD7EBkA+dCJEPngiSD58Ikw/VA9UDtwq8Cr8KxAqKDIoMigyLDIwMjAyKDIoMigyLDIwMjAyKDIoMigyNDIwMjAyKDIoMigyNDIwMjAzVA9UD0QzSDNMM2AzZDNoMowOnA6MBpQGnAawBvgHMAZACvwLsAtIBwA2WAsYC0gHMA80D1APeA+AD1gPNA9QD3gOaBNYDzQPUA94DwwTWA80D1APeA+cE1gPNA9QD3gOLBdYDzQPUA94DswXWA80D1APeA9sF1gPNA9QD3gP+BdYDzQPUA94DpwbWA80D1APeA9UG1gPNA9QD3gP0BtYDzQPUA94DlQfWA80D1APeA7UH1gPNA9QD3gPUB9YDzQPUA94D8wfWA4cKwQ3QDcoN2w3XDesM7QzvDPEM8wz1DPcM+Qz7DP0M/wyBDYMNhQ2HDYkNiw2NDY8NkQ2TDZUNlw2ZDZsNnQ2fDaENow2wDagNpQ2qDasNvg3fDZMPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+TD5MPkw+UD4QElAiqBKoEwAWqBJEGvQanApQPlA+UD5QPlA+UD5UPvAWWD5MFlw+XBZgPmwWZD/0Cmg+hAbkDuQO5A+wBzQHOAZECkgLXAsACwgLtAu4C1gGaAsoC1gHMDcQN0Q2UDJUMlQxnmg+aD5oPmg+aD5oPmw+mBKwCmw+cD4IDnQ+NCo0KzQrSCuQN7A2CDrUD8gHaAs4DlAS9BOEEhQWtBdUF+AWhBs8G7gaPB68HzgftB/IKnQ+dD50PnQ+dD54P4w3rDYEOnw+kDKUM4g3qDYAOnw+fD6APsAuuC7sLugugD6APoA+hD5MMmgydDKEMoQ+hD6EPog+eDKIMog+jD4wKjAqjDwq2yA6XDg4AELAKEIQIELUIENcBCycBAX8jCSEBIAAjCWokCSMJQQ9qQXBxJAkjCSMKTgRAIAAQAQsgAQsEACMJCwYA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B0EBdkkbIAgoAgAgCWtBAnUgAEEIahDRASACQQhqIgQoAgAiBSABKAIANgIAIAQgBUEEajYCAEEAJAVBMiAAIAIQWiMFIQBBACQFIABBAXEEQBBjIQAQABogAhDTASAAEGoFIAIQ0wEgBiQJCwupAQECfyAAQQA2AgwgACADNgIQIAEEQAJAIAFB/////wNNBEAgAUECdBC8DSEEDAELQQgQYCEDQQAkBUEzIANB19ECEFojBSEFQQAkBSAFQQFxBEAQYyEFEAAaIAMQZSAFEGoFIANB1PUBNgIAIANB2MkBQccBEGcLCwVBACEECyAAIAQ2AgAgACACQQJ0IARqIgI2AgggACACNgIEIAAgAUECdCAEajYCDAuoAQEFfyABQQRqIgQoAgBBACAAQQRqIgIoAgAgACgCACIGayIDQQJ1a0ECdGohBSAEIAU2AgAgA0EASgRAIAUgBiADEI4OGgsgACgCACEDIAAgBCgCADYCACAEIAM2AgAgAigCACEDIAIgAUEIaiICKAIANgIAIAIgAzYCACAAQQhqIgAoAgAhAiAAIAFBDGoiACgCADYCACAAIAI2AgAgASAEKAIANgIAC0UBA38gACgCBCICIABBCGoiAygCACIBRwRAIAMgAUF8aiACa0ECdkF/c0ECdCABajYCAAsgACgCACIARQRADwsgABC9DQsIAEH/////Awu6AgEIfyMJIQUjCUEgaiQJIwkjCk4EQEEgEAELIAUhAyAAKAIIIABBBGoiBigCACIEa0ECdSABTwRAIAEhACAGKAIAIgQhAwNAIAMgAigCADYCACADQQRqIQMgAEF/aiIADQALIAYgAUECdCAEajYCACAFJAkPCyABIAQgACgCAGtBAnVqIQQgABDUASIHIARJBEAgABDcDQsgAyAEIAAoAgggACgCACIIayIJQQF1IgogCiAESRsgByAJQQJ1IAdBAXZJGyAGKAIAIAhrQQJ1IABBCGoQ0QFBACQFQQ8gAyABIAIQWyMFIQFBACQFIAFBAXEEQBBjIQEQABogAxDTASABEGoLQQAkBUEyIAAgAxBaIwUhAEEAJAUgAEEBcQRAEGMhARAAGiADENMBIAEQagsgAxDTASAFJAkLQAEDfyABIQMgAEEIaiIEKAIAIgUhAANAIAAgAigCADYCACAAQQRqIQAgA0F/aiIDDQALIAQg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IAEhAAwBCwsLBSAAEJUJIABqIQALIAALqwEBAn8gAARAAn8gACgCTEF/TARAIAAQogkMAQsgABDoAUUhAiAAEKIJIQEgAgR/IAEFIAAQiQIgAQsLIQAFQZDYASgCAAR/QZDYASgCABChCQVBAAshABCeCSgCACIBBEADQCABKAJMQX9KBH8gARDoAQVBAAshAiABKAIUIAEoAhxLBEAgARCiCSAAciEACyACBEAgARCJAgsgASgCOCIBDQALCxCfCQsgAAukAQEHfwJ/AkAgAEEUaiICKAIAIABBHGoiAygCAE0NACAAKAIkIQEgAEEAQQAgAUE/cUHgA2oRBAAaIAIoAgANAEF/DAELIABBBGoiASgCACIEIABBCGoiBSgCACIGSQRAIAAoAighByAAIAQgBmtBASAHQT9xQeADahEEABoLIABBADYCECADQQA2AgAgAkEANgIAIAVBADYCACABQQA2AgBBAAsLMwEBfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMgAjYCACAAIAEgAxCkCSEAIAMkCSAAC70BAQF/IwkhAyMJQYABaiQJIwkjCk4EQEGAARABCyADQgA3AgAgA0IANwIIIANCADcCECADQgA3AhggA0IANwIgIANCADcCKCADQgA3AjAgA0IANwI4IANBQGtCADcCACADQgA3AkggA0IANwJQIANCADcCWCADQgA3AmAgA0IANwJoIANCADcCcCADQQA2AnggA0EkNgIgIAMgADYCLCADQX82AkwgAyAANgJUIAMgASACEKYJIQAgAyQJIAALCwAgACABIAIQuwkL0BYDHH8BfgF8IwkhFSMJQaACaiQJIwkjCk4EQEGgAhABCyAVQYgCaiEUIBUiDEGEAmohFyAMQZACaiEYIAAoAkxBf0oEfyAAEOgBBUEACyEaIAEsAAAiCARAAkAgAEEEaiEFIABB5ABqIQ0gAEHsAGohESAAQQhqIRIgDEEKaiEZIAxBIWohGyAMQS5qIRwgDEHeAGohHSAUQQRqIR5BACEDQQAhD0EAIQZBACEJAkACQAJAAkADQAJAIAhB/wFxEJMJBEADQCABQQFqIggtAAAQkwkEQCAIIQEMAQsLIABBABCnCQNAIAUoAgAiCCANKAIASQR/IAUgCEEBajYCACAILQAABSAAEKgJCxCTCQ0ACyANKAIABEAg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/wCDQoCAgICAgID4/wBWcg0BIAZCAYYiCSAFWARAIABEAAAAAAAAAACiIAAgBSAJURsPCyACBH4gBkL/////////B4NCgICAgICAgAiEBSAGQgyGIgVCf1UEQEEAIQIDQCACQX9qIQIgBUIBhiIFQn9VDQALBUEAIQILIAZBASACa62GCyIGIAQEfiAHQv////////8Hg0KAgICAgICACIQFIAdCDIYiBUJ/VQRAQQAhAwNAIANBf2ohAyAFQgGGIgVCf1UNAAsFQQAhAwsgB0EBIAMiBGuthgsiB30iBUJ/VSEDIAIgBEoEQAJAA0ACQCADBEAgBUIAUQ0BBSAGIQULIAVCAYYiBiAHfSIFQn9VIQMgAkF/aiICIARKDQEMAgsLIABEAAAAAAAAAACiDAILCyADBEAgAEQAAAAAAAAAAKIgBUIAUQ0BGgUgBiEFCyAFQoCAgICAgIAIVARAA0AgAkF/aiECIAVCAYYiBUKAgICAgICACFQNAAsLIAJBAEoEfiAFQoCAgICAgIB4fCACrUI0hoQFIAVBASACa62ICyAIhL8LDAELIAAgAaIiACAAowsLBQAgAL0LIgAgAL1C////////////AIMgAb1CgICAgICAgICAf4OEvwtZAQN/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgASECIAAQugkEf0F/BSAAKAIgIQMgACACQQEgA0E/cUHgA2oRBABBAUYEfyACLQAABUF/CwshACABJAkgAAuhAQEDfyAAQcoAaiICLAAAIQEgAiABIAFB/wFqcjoAACAAQRRqIgEoAgAgAEEcaiICKAIASwRAIAAoAiQhAyAAQQBBACADQT9xQeADahEEABoLIABBADYCECACQQA2AgAgAUEANgIAIAAoAgAiAUEEcQR/IAAgAUEgcjYCAEF/BSAAIAAoAiwgACgCMGoiAjYCCCAAIAI2AgQgAUEbdEEfdQsLXQEEfyAAQdQAaiIFKAIAIgNBACACQYACaiIGELwJIQQgASADIAQgA2sgBiAEGyIBIAIgASACSRsiAhCODhogACACIANqNgIEIAAgASADaiIANgIIIAUgADYCACACC/kBAQN/IAFB/wFxIQQCQAJAAkAgAkEARyIDIABBA3FBAEdxBEAgAUH/AXEhBQNAIAUgAC0AAEYNAiACQX9qIgJBAEciAyAAQQFq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C5EBAgF/An4CQAJAIAC9IgNCNIgiBKdB/w9xIgIEQCACQf8PRgRADAMFDAILAAsgASAARAAAAAAAAAAAYgR/IABEAAAAAAAA8EOiIAEQygkhACABKAIAQUBqBUEACzYCAAwBCyABIASnQf8PcUGCeGo2AgAgA0L/////////h4B/g0KAgICAgICA8D+EvyEACyAAC6MCACAABH8CfyABQYABSQRAIAAgAToAAEEBDAELEI4JKAK8ASgCAEUEQCABQYB/cUGAvwNGBEAgACABOgAAQQEMAgUQhwlB1AA2AgBBfwwCCwALIAFBgBBJBEAgACABQQZ2QcABcjoAACAAIAFBP3FBgAFyOgABQQIMAQsgAUGAQHFBgMADRiABQYCwA0lyBEAgACABQQx2QeABcjoAACAAIAFBBnZBP3FBgAFyOgABIAAgAUE/cUGAAXI6AAJBAwwBCyABQYCAfGpBgIDAAEkEfyAAIAFBEnZB8AFyOgAAIAAgAUEMdkE/cUGAAXI6AAEgACABQQZ2QT9xQYABcjoAAiAAIAFBP3FBgAFyOgADQQQFEIcJQdQANgIAQX8LCwVBAQsLeQECf0EAIQICQAJAA0AgAkGAmwFqLQAAIABHBEAgAkEBaiICQdcARw0BQdcAIQIMAgsLIAINAEHgmwEhAAwBC0HgmwEhAANAIAAhAwNAIANBAWohACADLAAABEAgACEDDAELCyACQX9qIgINAAsLIAAgASgCFBDNCQsJACAAIAEQmwkLNQEBfyMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQgAzYCACAAIAEgAiAEEM8JIQAgBCQJIAALjwMBBH8jCSEGIwlBgAFqJAkjCSMKTgRAQYABEAELIAZB/ABqIQUgBiIEQZzaASkCADcCACAEQaTaASkCADcCCCAEQazaASkCADcCECAEQbTaASkCADcCGCAEQbzaASkCADcCICAEQcTaASkCADcCKCAEQczaASkCADcCMCAEQdTaASkCADcCOCAEQUBrQdzaASkCADcCACAEQeTaASkCADcCSCAEQezaASkCADcCUCAEQfTaASkCADcCWCAEQfzaASkCADcCYCAEQYTbASkCADcCaCAEQYzbASkCADcCcCAEQZTbASgCADYCeAJAAkAgAUF/akH+////B00NACABBH8QhwlBywA2AgBBfwUgBSEAQQEhAQwBCyEADAELIARBfiAAayIFIAEgASAFSxsiBzYCMCAEQRRqIgEgADYCACAEIAA2AiwgBEEQaiIFIAAgB2oiADYCACAEIAA2AhwgBCACIAMQvQkhACAHBEAgASgCACIBIAEgBSgCAEZBH3RBH3VqQQA6AAALCyAGJAkgAAs7AQJ/IAIgACgCECAAQRRqIgAoAgAiBGsiAyADIAJLGyEDIAQgASADEI4OGiAAIAAoAgAgA2o2AgAgAgsiAQJ/IAAQlQlBAWoiARCACiICBH8gAiAAIAEQjg4FQQALCw8AIAAQ0wkEQCAAEIEKCwsXACAAQQBHIABB2PkCR3EgAEH41AFHcQsHACAAEIsJC/MBAQZ/IwkhBiMJQSBqJAkjCSMKTgRAQSAQAQsgBiEHIAIQ0wkEQEEAIQMDQCAAQQEgA3RxBEAgA0ECdCACaiADIAEQ1gk2AgALIANBAWoiA0EGRw0ACwUCQCACQQBHIQhBACEEQQAhAwNAIAQgCCAAQQEgA3RxIgVFcQR/IANBAnQgAmooAgAFIAMgAUGcigMgBRsQ1gkLIgVBAEdqIQQgA0ECdCAHaiAFNgIAIANBAWoiA0EGRw0ACwJAAkACQCAEQf////8HcQ4CAAECC0HY+QIhAgwCCyAHKAIAQdzUAUYEQEH41AEhAgsLCwsgBiQJIAILqgYBCn8jCSEJIwlBkAJqJAkjCSMKTgRAQZACEAELIAkiBUGAAmohBiABLAAARQRAAkBBvrsCEIkBIgEEQCABLAAADQELIABBDGxB8KkBahCJASIBBEAgASwAAA0BC0HFuwIQiQEiAQRAIAEsAAANAQtByrsCIQELC0EAIQIDfwJ/AkACQCABIAJqLAAADjAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABCyACDAELIAJBAWoiAkEPSQ0BQQ8LCyEEAkACQAJAIAEsAAAiAkEuRgRAQcq7AiEBBSABIARqLAAABEBByrsCIQEFIAJBwwBHDQILCyABLAABRQ0BCyABQcq7AhCSCUUNACABQdK7AhCSCUUNAEHE+gIoAgAiAgRAA0AgASACQQhqEJIJRQ0DIAIoAhgiAg0ACwtByPoCEGhBxPoCKAIAIgIEQAJAA0AgASACQQhqEJIJBEAgAigCGCICRQ0CDAELC0HI+gIQcgwDCwsCfwJAQfj5AigCAA0AQdi7AhCJASICRQ0AIAIsAABFDQBB/gEgBGshCiAEQQFqIQsDQAJAIAJBOhCgCSIHLAAAIgNBAEdBH3RBH3UgByACa2oiCCAKSQRAIAUgAiAIEI4OGiAFIAhqIgJBLzoAACACQQFqIAEgBBCODhogBSAIIAtqakEAOgAAIAUgBhBpIgMNASAHLAAAIQMLIAcgA0H/AXFBAEdqIgIsAAANAQwCCwtBHBCACiICBH8gAiADNgIAIAIgBigCADYCBCACQQhqIgMgASAEEI4OGiADIARqQQA6AAAgAkHE+gIoAgA2AhhBxPoCIAI2AgAgAgUgAyAGKAIAENcJGgwBCwwBC0EcEIAKIgIEfyACQdzUASgCADYCACACQeDUASgCADYCBCACQQhqIgMgASAEEI4OGiADIARqQQA6AAAgAkHE+gIoAgA2AhhBxPoCIAI2AgAgAgUgAgsLIQFByPoCEHIgAUHc1AEgACABchshAgwBCyAARQRAIAEsAAFBLkYEQEHc1AEhAgwCCwtBACECCyAJJAkgAgs7AQF/IwkhAiMJQRBqJAkjCSMKTgRAQRAQAQsgAiAANgIAIAIgATYCBEHbACACEHEQhgkhACACJAkgAAuTAQEEfyMJIQUjCUGAAWokCSMJIwpOBEBBgAEQAQsgBSIEQQA2AgAgBEEEaiIGIAA2AgAgBCAANgIsIARBCGoiB0F/IABB/////wdqIABBAEgbNgIAIARBfzYCTCAEQQAQpwkgBCACQQEgAxCtCSEDIAEEQCABIAAgBCgCbCAGKAIAaiAHKAIAa2o2AgALIAUkCSADCwQAIAMLQgEDfyACBEAgASEDIAAhAQNAIANBBGohBCABQQRqIQUgASADKAIANgIAIAJBf2oiAgRAIAQhAyAFIQEMAQsLCyAACwcAIAAQkAkLBABBfws0AQJ/EI4JQbwBaiICKAIAIQEgAARAIAJBmPoCIAAgAEF/Rhs2AgALQX8gASABQZj6AkYbC30BAn8CQAJAIAAoAkxBAEgNACAAEOgBRQ0AIABBBGoiASgCACICIAAoAghJBH8gASACQQFqNgIAIAItAAAFIAAQuQkLIQEgABCJAgwBCyAAQQRqIgEoAgAiAiAAKAIISQR/IAEgAkEBajYCACACLQAABSAAELkJCyEBCyABCw0AIAAgASACQn8Q2AkL7QoBEn8gASgCACEEAn8CQCADRQ0AIAMoAgAiBUUNACAABH8gA0EANgIAIAUhDiAAIQ8gAiEQIAQhCkEwBSAFIQkgBCEIIAIhDEEaCwwBCyAAQQBHIQMQjgkoArwBKAIABEAgAwRAIAAhEiACIREgBCENQSEMAgUgAiETIAQhFEEPDAILAAsgA0UEQCAEEJUJIQtBPwwBCyACBEACQCAAIQYgAiEFIAQhAwNAIAMsAAAiBwRAIANBAWohAyAGQQRqIQQgBiAHQf+/A3E2AgAgBUF/aiIFRQ0CIAQhBgwBCwsgBkEANgIAIAFBADYCACACIAVrIQtBPwwCCwUgBCEDCyABIAM2AgAgAiELQT8LIQMDQAJAAkACQAJAIANBD0YEQCATIQMgFCEEA0AgBCwAACIFQf8BcUF/akH/AEkEQCAEQQNxRQRAIAQoAgAiBkH/AXEhBSAGIAZB//37d2pyQYCBgoR4cUUEQANAIANBfGohAyAEQQRqIgQoAgAiBSAFQf/9+3dqckGAgYKEeHFFDQALIAVB/wFxIQULCwsgBUH/AXEiBUF/akH/AEkEQCADQX9qIQMgBEEBaiEEDAELCyAFQb5+aiIFQTJLBEAgBCEFIAAhBgwDBSAFQQJ0QaD1AGooAgAhCSAEQQFqIQggAyEMQRohAwwGCwAFIANBGkYEQCAILQAAQQN2IgNBcGogAyAJQRp1anJBB0sEQCAAIQMgCSEGIAghBSAMIQQMAwUgCEEBaiEDIAlBgICAEHEEfyADLAAAQcABcUGAAUcEQCAAIQMgCSEGIAghBSAMIQQMBQsgCEECaiEDIAlBgIAgcQR/IAMsAABBwAFxQYABRwRAIAAhAyAJIQYgCCEFIAwhBAwGCyAIQQNqBSADCwUgAwshFCAMQX9qIRNBDyEDDAcLAAUgA0EhRgRAIBEEQAJAIBIhBCARIQMgDSEFA0ACQAJAAkAgBS0AACIGQX9qIgdB/wBPDQAgBUEDcUUgA0EES3EEQAJ/AkADQCAFKAIAIgYgBkH//ft3anJBgIGChHhxDQEgBCAGQf8BcTYCACAEIAUtAAE2AgQgBCAFLQACNgIIIAVBBGohByAEQRBqIQYgBCAFLQADNgIMIANBfGoiA0EESwRAIAYhBCAHIQUMAQsLIAYhBCAHIgUsAAAMAQsgBkH/AXELQf8BcSIGQX9qIQcMAQsMAQsgB0H/AE8NAQsgBUEBaiEFIARBBGohByAEIAY2AgAgA0F/aiIDRQ0CIAchBAwBCwsgBkG+fmoiBkEySwRAIAQhBgwHCyAGQQJ0QaD1AGooAgAhDiAEIQ8gAyEQIAVBAWohCkEwIQMMCQsFIA0hBQsgASAFNgIAIAIhC0E/IQMMBwUgA0EwRgRAIAotAAAiBUEDdiIDQXBqIAMgDkEadWpyQQdLBEAgDyEDIA4hBiAKIQUgECEEDAUFAkAgCkEBaiEEIAVBgH9qIA5BBnRyIgNBAEgEQAJAIAQtAABBgH9qIgVBP00EQCAKQQJqIQQgBSADQQZ0ciIDQQBOBEAgBCENDAILIAQtAABBgH9qIgRBP00EQCAKQQNqIQ0gBCADQQZ0ciEDDAILCxCHCUHUADYCACAKQX9qIRUMAgsFIAQhDQsgDyADNgIAIA9BBGohEiAQQX9qIRFBISEDDAoLCwUgA0E/RgRAIAsPCwsLCwsMAwsgBUF/aiEFIAYNASADIQYgBCEDCyAFLAAABH8gBgUgBgRAIAZBADYCACABQQA2AgALIAIgA2shC0E/IQMMAwshAwsQhwlB1AA2AgAgAwR/IAUFQX8hC0E/IQMMAgshFQsgASAVNgIAQX8hC0E/IQMMAAALAAsLACAAIAEgAhDfCQsLACAAIAEgAhDjCQsWACAAIAEgAkKAgICAgICAgIB/ENgJCykBAX5BwPQCQcD0AikDAEKt/tXk1IX9qNgAfkIBfCIANwMAIABCIYinC5gBAQN8IAAgAKIiAyADIAOioiADRHzVz1o62eU9okTrnCuK5uVavqCiIAMgA0R9/rFX4x3HPqJE1WHBGaABKr+gokSm+BARERGBP6CgIQUgAyAAoiEEIAIEfCAAIARESVVVVVVVxT+iIAMgAUQAAAAAAADgP6IgBCAFoqGiIAGhoKEFIAQgAyAFokRJVVVVVVXFv6CiIACgCwuUAQEEfCAAIACiIgIgAqIhA0QAAAAAAADwPyACRAAAAAAAAOA/oiIEoSIFRAAAAAAAAPA/IAWhIAShIAIgAiACIAJEkBXLGaAB+j6iRHdRwRZswVa/oKJETFVVVVVVpT+goiADIAOiIAJExLG0vZ7uIT4gAkTUOIi+6fqoPaKhokStUpyAT36SvqCioKIgACABoqGgoAuOCQMHfwF+BHwjCSEHIwlBMGokCSMJIwpOBEBBMBABCyAHQRBqIQQgByEFIAC9IglCP4inIQYCfwJAIAlCIIinIgJB/////wdxIgNB+9S9gARJBH8gAkH//z9xQfvDJEYNASAGQQBHIQIgA0H9souABEkEfyACBH8gASAARAAAQFT7Ifk/oCIARDFjYhphtNA9oCIKOQMAIAEgACAKoUQxY2IaYbTQPaA5AwhBfwUgASAARAAAQFT7Ifm/oCIARDFjYhphtNC9oCIKOQMAIAEgACAKoUQxY2IaYbTQvaA5AwhBAQsFIAIEfyABIABEAABAVPshCUCgIgBEMWNiGmG04D2gIgo5AwAgASAAIAqhRDFjYhphtOA9oDkDCEF+BSABIABEAABAVPshCcCgIgBEMWNiGmG04L2gIgo5AwAgASAAIAqhRDFjYhphtOC9oDkDCEECCwsFAn8gA0G8jPGABEkEQCADQb3714AESQRAIANB/LLLgARGDQQgBgRAIAEgAEQAADB/fNkSQKAiAETKlJOnkQ7pPaAiCjkDACABIAAgCqFEypSTp5EO6T2gOQMIQX0MAwUgASAARAAAMH982RLAoCIARMqUk6eRDum9oCIKOQMAIAEgACAKoUTKlJOnkQ7pvaA5AwhBAwwDCwAFIANB+8PkgARGDQQgBgRAIAEgAEQAAEBU+yEZQKAiAEQxY2IaYbTwPaAiCjkDACABIAAgCqFEMWNiGmG08D2gOQMIQXwMAwUgASAARAAAQFT7IRnAoCIARDFjYhphtPC9oCIKOQMAIAEgACAKoUQxY2IaYbTwvaA5AwhBBAwDCwALAAsgA0H7w+SJBEkNAiADQf//v/8HSwRAIAEgACAAoSIAOQMIIAEgADkDAEEADAELIAlC/////////weDQoCAgICAgICwwQCEvyEAQQAhAgNAIAJBA3QgBGogAKq3Igo5AwAgACAKoUQAAAAAAABwQaIhACACQQFqIgJBAkcNAAsgBCAAOQMQIABEAAAAAAAAAABhBEBBASECA0AgAkF/aiEIIAJBA3QgBGorAwBEAAAAAAAAAABhBEAgCCECDAELCwVBAiECCyAEIAUgA0EUdkHqd2ogAkEBakEBEOgJIQIgBSsDACEAIAYEfyABIACaOQMAIAEgBSsDCJo5AwhBACACawUgASAAOQMAIAEgBSsDCDkDCCACCwsLDAELIABEg8jJbTBf5D+iRAAAAAAAADhDoEQAAAAAAAA4w6AiC6ohAiABIAAgC0QAAEBU+yH5P6KhIgogC0QxY2IaYbTQPaIiAKEiDDkDACADQRR2IgggDL1CNIinQf8PcWtBEEoEQCALRHNwAy6KGaM7oiAKIAogC0QAAGAaYbTQPaIiAKEiCqEgAKGhIQAgASAKIAChIgw5AwAgC0TBSSAlmoN7OaIgCiAKIAtEAAAALooZozuiIg2hIguhIA2hoSENIAggDL1CNIinQf8PcWtBMUoEQCABIAsgDaEiDDkDACANIQAgCyEKCwsgASAKIAyhIAChOQMIIAILIQEgByQJIAELlRECFn8DfCMJIQ8jCUGwBGokCSMJIwpOBEBBsAQQAQsgD0HgA2ohDCAPQcACaiEQIA9BoAFqIQkgDyEOIAJBfWpBGG0iBUEAIAVBAEobIhJBaGwiFiACQWhqaiELIARBAnRBwKoBaigCACINIANBf2oiB2pBAE4EQCADIA1qIQggEiAHayEFQQAhBgNAIAZBA3QgEGogBUEASAR8RAAAAAAAAAAABSAFQQJ0QdCqAWooAgC3CzkDACAFQQFqIQUgBkEBaiIGIAhHDQALCyADQQBKIQhBACEFA0AgCARAIAUgB2ohCkQAAAAAAAAAACEbQQAhBgNAIBsgBkEDdCAAaisDACAKIAZrQQN0IBBqKwMAoqAhGyAGQQFqIgYgA0cNAAsFRAAAAAAAAAAAIRsLIAVBA3QgDmogGzkDACAFQQFqIQYgBSANSARAIAYhBQwBCwsgC0EASiETQRggC2shFEEXIAtrIRcgC0UhGCADQQBKIRkgDSEFAkACQANAAkAgBUEDdCAOaisDACEbIAVBAEoiCgRAIAUhBkEAIQcDQCAHQQJ0IAxqIBsgG0QAAAAAAABwPqKqtyIbRAAAAAAAAHBBoqGqNgIAIAZBf2oiCEEDdCAOaisDACAboCEbIAdBAWohByAGQQFKBEAgCCEGDAELCwsgGyALELIJIhsgG0QAAAAAAADAP6KcRAAAAAAAACBAoqEiG6ohBiAbIAa3oSEbAkACQAJAIBMEfyAFQX9qQQJ0IAxqIggoAgAiESAUdSEHIAggESAHIBR0ayIINgIAIAggF3UhCCAGIAdqIQYMAQUgGAR/IAVBf2pBAnQgDGooAgBBF3UhCAwCBSAbRAAAAAAAAOA/ZgR/QQIhCAwEBUEACwsLIQgMAgsgCEEASg0ADAELIAZBAWohByAKBEBBACEGQQAhCgNAIApBAnQgDGoiGigCACERAkACQCAGBH9B////ByEVDAEFIBEEf0EBIQZBgICACCEVDAIFQQALCyEGDAELIBogFSARazYCAAsgCkEBaiIKIAVHDQALBUEAIQYLIBMEQAJAAkACQCALQQFrDgIAAQILIAVBf2pBAnQgDGoiCiAKKAIAQf///wNxNgIADAELIAVBf2pBAnQgDGoiCiAKKAIAQf///wFxNgIACwsgCEECRgR/RAAAAAAAAPA/IBuhIRsgBgR/QQIhCCAbRAAAAAAAAPA/IAsQsgmhIRsgBwVBAiEIIAcLBSAHCyEGCyAbRAAAAAAAAAAAYg0CIAUgDUoEQEEAIQogBSEHA0AgCiAHQX9qIgdBAnQgDGooAgByIQogByANSg0ACyAKDQELQQEhBgNAIAZBAWohByANIAZrQQJ0IAxqKAIARQRAIAchBgwBCwsgBSAGaiEHA0AgAyAFaiIIQQN0IBBqIAVBAWoiBiASakECdEHQqgFqKAIAtzkDACAZBEBEAAAAAAAAAAAhG0EAIQUDQCAbIAVBA3QgAGorAwAgCCAFa0EDdCAQaisDAKKgIRsgBUEBaiIFIANHDQALBUQAAAAAAAAAACEbCyAGQQN0IA5qIBs5AwAgBiAHSARAIAYhBQwBCwsgByEFDAELCyALIQADfyAAQWhqIQAgBUF/aiIFQQJ0IAxqKAIARQ0AIAAhAiAFCyEADAELIBtBACALaxCyCSIbRAAAAAAAAHBBZgR/IAVBAnQgDGogGyAbRAAAAAAAAHA+oqoiA7dEAAAAAAAAcEGioao2AgAgAiAWaiECIAVBAWoFIAshAiAbqiEDIAULIgBBAnQgDGogAzYCAAtEAAAAAAAA8D8gAhCyCSEbIABBf0oiBwRAIAAhAgNAIAJBA3QgDmogGyACQQJ0IAxqKAIAt6I5AwAgG0QAAAAAAABwPqIhGyACQX9qIQMgAkEASgRAIAMhAgwBCwsgBwRAIAAhAgNAIAAgAmshC0EAIQNEAAAAAAAAAAAhGwNAIBsgA0EDdEHgrAFqKwMAIAIgA2pBA3QgDmorAwCioCEbIANBAWohBSADIA1OIAMgC09yRQRAIAUhAwwBCwsgC0EDdCAJaiAbOQMAIAJBf2ohAyACQQBKBEAgAyECDAELCwsLAkACQAJAAkAgBA4EAAEBAgMLIAcEQEQAAAAAAAAAACEbA0AgGyAAQQN0IAlqKwMAoCEbIABBf2ohAiAAQQBKBEAgAiEADAELCwVEAAAAAAAAAAAhGwsgASAbmiAbIAgbOQMADAILIAcEQEQAAAAAAAAAACEbIAAhAgNAIBsgAkEDdCAJaisDAKAhGyACQX9qIQMgAkEASgRAIAMhAgwBCwsFRAAAAAAAAAAAIRsLIAEgGyAbmiAIRSIEGzkDACAJKwMAIBuhIRsgAEEBTgRAQQEhAgNAIBsgAkEDdCAJaisDAKAhGyACQQFqIQMgACACRwRAIAMhAgwBCwsLIAEgGyAbmiAEGzkDCAwBCyAAQQBKBEAgACICQQN0IAlqKwMAIRsDQCACQX9qIgNBA3QgCWoiBCsDACIdIBugIRwgAkEDdCAJaiAbIB0gHKGgOQMAIAQgHDkDACACQQFKBEAgAyECIBwhGwwBCwsgAEEBSiIEBEAgACICQQN0IAlqKwMAIRsDQCACQX9qIgNBA3QgCWoiBSsDACIdIBugIRwgAkEDdCAJaiAbIB0gHKGgOQMAIAUgHDkDACACQQJKBEAgAyECIBwhGwwBCwsgBARARAAAAAAAAAAAIRsDQCAbIABBA3QgCWorAwCgIRsgAEF/aiECIABBAkoEQCACIQAMAQsLBUQAAAAAAAAAACEbCwVEAAAAAAAAAAAhGwsFRAAAAAAAAAAAIRsLIAkrAwAhHCAIBEAgASAcmjkDACABIAkrAwiaOQMIIAEgG5o5AxAFIAEgHDkDACABIAkrAwg5AwggASAbOQMQCwsgDyQJIAZBB3ELuAMDA38BfgN8IAC9IgZCgICAgID/////AINCgICAgPCE5fI/ViIEBEBEGC1EVPsh6T8gACAAmiAGQj+IpyIDRSIFG6FEB1wUMyamgTwgASABmiAFG6GgIQBEAAAAAAAAAAAhAQVBACEDCyAAIACiIgggCKIhByAAIAAgCKIiCURjVVVVVVXVP6IgASAIIAEgCSAHIAcgByAHRKaSN6CIfhQ/IAdEc1Ng28t18z6ioaJEAWXy8thEQz+gokQoA1bJIm1tP6CiRDfWBoT0ZJY/oKJEev4QERERwT+gIAggByAHIAcgByAHRNR6v3RwKvs+okTpp/AyD7gSP6CiRGgQjRr3JjA/oKJEFYPg/sjbVz+gokSThG7p4yaCP6CiRP5Bsxu6oas/oKKgoqCioKAiCKAhASAEBEBBASACQQF0a7ciByAAIAggASABoiABIAego6GgRAAAAAAAAABAoqEiACAAmiADRRshAQUgAgRARAAAAAAAAPC/IAGjIgm9QoCAgIBwg78hByAJIAG9QoCAgIBwg78iASAHokQAAAAAAADwP6AgCCABIAChoSAHoqCiIAegIQELCyABC5sBAQN/IABBf0YEQEF/IQAFAkAgASgCTEF/SgR/IAEQ6AEFQQALIQMCQAJAIAFBBGoiBCgCACICDQAgARC6CRogBCgCACICDQAMAQsgAiABKAIsQXhqSwRAIAQgAkF/aiICNgIAIAIgADoAACABIAEoAgBBb3E2AgAgA0UNAiABEIkCDAILCyADBH8gARCJAkF/BUF/CyEACwsgAAtnAQJ/IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAyACKAIANgIAQQBBACABIAMQzwkiBEEASAR/QX8FIAAgBEEBaiIEEIAKIgA2AgAgAAR/IAAgBCABIAIQzwkFQX8LCyEAIAMkCSAAC90DAQR/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBiEHAkAgAARAIAJBA0sEQAJAIAIhBCABKAIAIQMDQAJAIAMoAgAiBUF/akH+AEsEfyAFRQ0BIAAgBUEAEMsJIgVBf0YEQEF/IQIMBwsgBCAFayEEIAAgBWoFIAAgBToAACAEQX9qIQQgASgCACEDIABBAWoLIQAgASADQQRqIgM2AgAgBEEDSw0BIAQhAwwCCwsgAEEAOgAAIAFBADYCACACIARrIQIMAwsFIAIhAwsgAwRAIAAhBCABKAIAIQACQANAAkAgACgCACIFQX9qQf4ASwR/IAVFDQEgByAFQQAQywkiBUF/RgRAQX8hAgwHCyADIAVJDQMgBCAAKAIAQQAQywkaIAQgBWohBCADIAVrBSAEIAU6AAAgBEEBaiEEIAEoAgAhACADQX9qCyEDIAEgAEEEaiIANgIAIAMNAQwFCwsgBEEAOgAAIAFBADYCACACIANrIQIMAwsgAiADayECCwUgASgCACIAKAIAIgEEQEEAIQIDQCABQf8ASwRAIAcgAUEAEMsJIgFBf0YEQEF/IQIMBQsFQQEhAQsgASACaiECIABBBGoiACgCACIBDQALBUEAIQILCwsgBiQJIAILwwEBBH8CQAJAIAEoAkxBAEgNACABEOgBRQ0AIABB/wFxIQMCfwJAIABB/wFxIgQgASwAS0YNACABQRRqIgUoAgAiAiABKAIQTw0AIAUgAkEBajYCACACIAM6AAAgBAwBCyABIAAQmAkLIQAgARCJAgwBCyAAQf8BcSEDIABB/wFxIgQgASwAS0cEQCABQRRqIgUoAgAiAiABKAIQSQRAIAUgAkEBajYCACACIAM6AAAgBCEADAILCyABIAAQmAkhAAsgAAuMAwEIfyMJIQkjCUGQCGokCSMJIwpOBEBBkAgQAQsgCUGACGoiByABKAIAIgU2AgAgA0GAAiAAQQBHIgsbIQYgACAJIgggCxshAyAGQQBHIAVBAEdxBEACQEEAIQADQAJAIAJBAnYiCiAGTyIMIAJBgwFLckUNAiACIAYgCiAMGyIFayECIAMgByAFIAQQ4AkiBUF/Rg0AIAZBACAFIAMgCEYiChtrIQYgAyAFQQJ0IANqIAobIQMgACAFaiEAIAcoAgAiBUEARyAGQQBHcQ0BDAILC0F/IQBBACEGIAcoAgAhBQsFQQAhAAsgBQRAIAZBAEcgAkEAR3EEQAJAA0AgAyAFIAIgBBCrCSIIQQJqQQNPBEAgByAIIAcoAgBqIgU2AgAgA0EEaiEDIABBAWohACAGQX9qIgZBAEcgAiAIayICQQBHcQ0BDAILCwJAAkACQCAIQX9rDgIAAQILIAghAAwCCyAHQQA2AgAMAQsgBEEANgIACwsLIAsEQCABIAcoAgA2AgALIAkkCSAACwwAIAAgAUEAEPAJtgv5AQIEfwF8IwkhBCMJQYABaiQJIwkjCk4EQEGAARABCyAEIgNCADcCACADQgA3AgggA0IANwIQIANCADcCGCADQgA3AiAgA0IANwIoIANCADcCMCADQgA3AjggA0FAa0IANwIAIANCADcCSCADQgA3AlAgA0IANwJYIANCADcCYCADQgA3AmggA0IANwJwIANBADYCeCADQQRqIgUgADYCACADQQhqIgZBfzYCACADIAA2AiwgA0F/NgJMIANBABCnCSADIAJBARCuCSEHIAMoAmwgBSgCACAGKAIAa2ohAiABBEAgASAAIAJqIAAgAhs2AgALIAQkCSAHCwsAIAAgAUEBEPAJCwsAIAAgAUECEPAJCwkAIAAgARDvCQsJACAAIAEQ8QkLCQAgACABEPIJCzABAn8gAgRAIAAhAwNAIANBBGohBCADIAE2AgAgAkF/aiICBEAgBCEDDAELCwsgAAtvAQN/IAAgAWtBAnUgAkkEQANAIAJBf2oiAkECdCAAaiACQQJ0IAFqKAIANgIAIAINAAsFIAIEQCAAIQMDQCABQQRqIQQgA0EEaiEFIAMgASgCADYCACACQX9qIgIEQCAEIQEgBSEDDAELCwsLIAALFABBACAAIAEgAkHQ+gIgAhsQqwkL7AIBBn8jCSEIIwlBkAJqJAkjCSMKTgRAQZACEAELIAhBgAJqIgYgASgCACIFNgIAIANBgAIgAEEARyIKGyEEIAAgCCIHIAobIQMgBEEARyAFQQBHcQRAAkBBACEAA0ACQCACIARPIgkgAkEgS3JFDQIgAiAEIAIgCRsiBWshAiADIAYgBUEAEOwJIgVBf0YNACAEQQAgBSADIAdGIgkbayEEIAMgAyAFaiAJGyEDIAAgBWohACAGKAIAIgVBAEcgBEEAR3ENAQwCCwtBfyEAQQAhBCAGKAIAIQULBUEAIQALIAUEQCAEQQBHIAJBAEdxBEACQANAIAMgBSgCAEEAEMsJIgdBAWpBAk8EQCAGIAYoAgBBBGoiBTYCACADIAdqIQMgACAHaiEAIAQgB2siBEEARyACQX9qIgJBAEdxDQEMAgsLIAcEQEF/IQAFIAZBADYCAAsLCwsgCgRAIAEgBigCADYCAAsgCCQJIAAL1gEBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIQEgAL1CIIinQf////8HcSIDQfzDpP8DSQR8IANBnsGa8gNJBHxEAAAAAAAA8D8FIABEAAAAAAAAAAAQ5gkLBQJ8IAAgAKEgA0H//7//B0sNABoCQAJAAkACQCAAIAEQ5wlBA3EOAwABAgMLIAErAwAgASsDCBDmCQwDCyABKwMAIAErAwhBARDlCZoMAgsgASsDACABKwMIEOYJmgwBCyABKwMAIAErAwhBARDlCQsLIQAgAiQJIAAL0AEBA38jCSECIwlBEGokCSMJIwpOBEBBEBABCyACIQEgAL1CIIinQf////8HcSIDQfzDpP8DSQRAIANBgIDA8gNPBEAgAEQAAAAAAAAAAEEAEOUJIQALBQJ8IAAgAKEgA0H//7//B0sNABoCQAJAAkACQCAAIAEQ5wlBA3EOAwABAgMLIAErAwAgASsDCEEBEOUJDAMLIAErAwAgASsDCBDmCQwCCyABKwMAIAErAwhBARDlCZoMAQsgASsDACABKwMIEOYJmgshAAsgAiQJIAALjQEBA38jCSEDIwlBEGokCSMJIwpOBEBBEBABCyADIQIgAL1CIIinQf////8HcSIBQfzDpP8DSQRAIAFBgICA8gNPBEAgAEQAAAAAAAAAAEEAEOkJIQALBSABQf//v/8HSwR8IAAgAKEFIAAgAhDnCSEBIAIrAwAgAisDCCABQQFxEOkJCyEACyADJAkgAAuKBAMCfwF+AnwgAL0iA0I/iKchAiADQiCIp0H/////B3EiAUH//7+gBEsEQCAARBgtRFT7Ifm/RBgtRFT7Ifk/IAIbIANC////////////AINCgICAgICAgPj/AFYbDwsgAUGAgPD+A0kEQCABQYCAgPIDSQR/IAAPBUF/CyEBBSAAmSEAIAFBgIDM/wNJBHwgAUGAgJj/A0kEfEEAIQEgAEQAAAAAAAAAQKJEAAAAAAAA8L+gIABEAAAAAAAAAECgowVBASEBIABEAAAAAAAA8L+gIABEAAAAAAAA8D+gowsFIAFBgICOgARJBHxBAiEBIABEAAAAAAAA+L+gIABEAAAAAAAA+D+iRAAAAAAAAPA/oKMFQQMhAUQAAAAAAADwvyAAowsLIQALIAAgAKIiBSAFoiEEIAUgBCAEIAQgBCAERBHaIuM6rZA/okTrDXYkS3upP6CiRFE90KBmDbE/oKJEbiBMxc1Ftz+gokT/gwCSJEnCP6CiRA1VVVVVVdU/oKIhBSAEIAQgBCAERJr93lIt3q2/IAREL2xqLES0oj+ioaJEbZp0r/Kws7+gokRxFiP+xnG8v6CiRMTrmJmZmcm/oKIhBCABQQBIBHwgACAAIAQgBaCioQUgAUEDdEGgrQFqKwMAIAAgBCAFoKIgAUEDdEHArQFqKwMAoSAAoaEiACAAmiACRRsLC58DAwJ/AX4FfCAAvSIDQiCIpyIBQYCAwABJIANCAFMiAnIEQAJAIANC////////////AINCAFEEQEQAAAAAAADwvyAAIACiow8LIAJFBEBBy3chAiAARAAAAAAAAFBDor0iA0IgiKchASADQv////8PgyEDDAELIAAgAKFEAAAAAAAAAACjDwsFIAFB//+//wdLBEAgAA8LIAFBgIDA/wNGIANC/////w+DIgNCAFFxBH9EAAAAAAAAAAAPBUGBeAshAgsgAyABQeK+JWoiAUH//z9xQZ7Bmv8Daq1CIIaEv0QAAAAAAADwv6AiBCAERAAAAAAAAOA/oqIhBSAEIAREAAAAAAAAAECgoyIGIAaiIgcgB6IhACACIAFBFHZqtyIIRAAA4P5CLuY/oiAEIAhEdjx5Ne856j2iIAYgBSAAIAAgAESfxnjQCZrDP6JEr3iOHcVxzD+gokQE+peZmZnZP6CiIAcgACAAIABERFI+3xLxwj+iRN4Dy5ZkRsc/oKJEWZMilCRJ0j+gokSTVVVVVVXlP6CioKCioCAFoaCgC8IQAwt/AX4IfCAAvSINQiCIpyEHIA2nIQggB0H/////B3EhAyABvSINQiCIpyIFQf////8HcSIEIA2nIgZyRQRARAAAAAAAAPA/DwsgCEUiCiAHQYCAwP8DRnEEQEQAAAAAAADwPw8LIANBgIDA/wdNBEAgA0GAgMD/B0YgCEEAR3EgBEGAgMD/B0tyRQRAIARBgIDA/wdGIgsgBkEAR3FFBEACQAJAAkAgB0EASCIJBH8gBEH///+ZBEsEf0ECIQIMAgUgBEH//7//A0sEfyAEQRR2IQIgBEH///+JBEsEQEECIAZBswggAmsiAnYiDEEBcWtBACAMIAJ0IAZGGyECDAQLIAYEf0EABUECIARBkwggAmsiAnYiBkEBcWtBACAEIAYgAnRGGyECDAULBUEAIQIMAwsLBUEAIQIMAQshAgwCCyAGRQ0ADAELIAsEQCADQYCAwIB8aiAIckUEQEQAAAAAAADwPw8LIAVBf0ohAiADQf//v/8DSwRAIAFEAAAAAAAAAAAgAhsPBUQAAAAAAAAAACABmiACGw8LAAsgBEGAgMD/A0YEQCAARAAAAAAAAPA/IACjIAVBf0obDwsgBUGAgICABEYEQCAAIACiDwsgBUGAgID/A0YgB0F/SnEEQCAAnw8LCyAAmSEOIAoEQCADRSADQYCAgIAEckGAgMD/B0ZyBEBEAAAAAAAA8D8gDqMgDiAFQQBIGyEAIAlFBEAgAA8LIAIgA0GAgMCAfGpyBEAgAJogACACQQFGGw8LIAAgAKEiACAAow8LCyAJBEACQAJAAkACQCACDgICAAELRAAAAAAAAPC/IRAMAgtEAAAAAAAA8D8hEAwBCyAAIAChIgAgAKMPCwVEAAAAAAAA8D8hEAsgBEGAgICPBEsEQAJAIARBgIDAnwRLBEAgA0GAgMD/A0kEQCMIRAAAAAAAAAAAIAVBAEgbDwUjCEQAAAAAAAAAACAFQQBKGw8LAAsgA0H//7//A0kEQCAQRJx1AIg85Dd+okScdQCIPOQ3fqIgEERZ8/jCH26lAaJEWfP4wh9upQGiIAVBAEgbDwsgA0GAgMD/A00EQCAORAAAAAAAAPC/oCIARAAAAGBHFfc/oiIPIABERN9d+AuuVD6iIAAgAKJEAAAAAAAA4D8gAERVVVVVVVXVPyAARAAAAAAAANA/oqGioaJE/oIrZUcV9z+ioSIAoL1CgICAgHCDvyIRIQ4gESAPoSEPDAELIBBEnHUAiDzkN36iRJx1AIg85Dd+oiAQRFnz+MIfbqUBokRZ8/jCH26lAaIgBUEAShsPCwUgDkQAAAAAAABAQ6IiAL1CIIinIAMgA0GAgMAASSICGyEEIAAgDiACGyEAIARBFHVBzHdBgXggAhtqIQMgBEH//z9xIgRBgIDA/wNyIQIgBEGPsQ5JBEBBACEEBSAEQfrsLkkiBSEEIAMgBUEBc0EBcWohAyACIAJBgIBAaiAFGyECCyAEQQN0QYCuAWorAwAiEyAAvUL/////D4MgAq1CIIaEvyIPIARBA3RB4K0BaisDACIRoSISRAAAAAAAAPA/IBEgD6CjIhSiIg69QoCAgIBwg78iACAAIACiIhVEAAAAAAAACECgIA4gAKAgFCASIAJBAXVBgICAgAJyQYCAIGogBEESdGqtQiCGvyISIACioSAPIBIgEaGhIACioaIiD6IgDiAOoiIAIACiIAAgACAAIAAgAETvTkVKKH7KP6JEZdvJk0qGzT+gokQBQR2pYHTRP6CiRE0mj1FVVdU/oKJE/6tv27Zt2z+gokQDMzMzMzPjP6CioCIRoL1CgICAgHCDvyIAoiISIA8gAKIgDiARIABEAAAAAAAACMCgIBWhoaKgIg6gvUKAgICAcIO/IgBEAAAA4AnH7j+iIg8gBEEDdEHwrQFqKwMAIA4gACASoaFE/QM63AnH7j+iIABE9QFbFOAvPj6ioaAiAKCgIAO3IhGgvUKAgICAcIO/IhIhDiASIBGhIBOhIA+hIQ8LIAAgD6EgAaIgASANQoCAgIBwg78iAKEgDqKgIQEgDiAAoiIAIAGgIg69Ig1CIIinIQIgDachAyACQf//v4QESgRAIAMgAkGAgMD7e2pyBEAgEEScdQCIPOQ3fqJEnHUAiDzkN36iDwsgAUT+gitlRxWXPKAgDiAAoWQEQCAQRJx1AIg85Dd+okScdQCIPOQ3fqIPCwUgAkGA+P//B3FB/5fDhARLBEAgAyACQYDovPsDanIEQCAQRFnz+MIfbqUBokRZ8/jCH26lAaIPCyABIA4gAKFlBEAgEERZ8/jCH26lAaJEWfP4wh9upQGiDwsLCyACQf////8HcSIDQYCAgP8DSwR/IAJBgIDAACADQRR2QYJ4anZqIgNBFHZB/w9xIQQgACADQYCAQCAEQYF4anVxrUIghr+hIg4hACABIA6gvSENQQAgA0H//z9xQYCAwAByQZMIIARrdiIDayADIAJBAEgbBUEACyECIBBEAAAAAAAA8D8gDUKAgICAcIO/Ig5EAAAAAEMu5j+iIg8gASAOIAChoUTvOfr+Qi7mP6IgDkQ5bKgMYVwgPqKhIg6gIgAgACAAIACiIgEgASABIAEgAUTQpL5yaTdmPqJE8WvSxUG9u76gokQs3iWvalYRP6CiRJO9vhZswWa/oKJEPlVVVVVVxT+goqEiAaIgAUQAAAAAAAAAwKCjIA4gACAPoaEiASAAIAGioKEgAKGhIgC9Ig1CIIinIAJBFHRqIgNBgIDAAEgEfCAAIAIQsgkFIA1C/////w+DIAOtQiCGhL8Log8LCwsgACABoAuaNwEMfyMJIQojCUEQaiQJIwkjCk4EQEEQEAELIAohCSAAQfUBSQR/QdT6AigCACIFQRAgAEELakF4cSAAQQtJGyICQQN2IgB2IgFBA3EEQCABQQFxQQFzIABqIgFBA3RB/PoCaiICQQhqIgQoAgAiA0EIaiIGKAIAIQAgACACRgRAQdT6AkEBIAF0QX9zIAVxNgIABSAAIAI2AgwgBCAANgIACyADIAFBA3QiAEEDcjYCBCAAIANqQQRqIgAgACgCAEEBcjYCACAKJAkgBg8LIAJB3PoCKAIAIgdLBH8gAQRAIAEgAHRBAiAAdCIAQQAgAGtycSIAQQAgAGtxQX9qIgBBDHZBEHEiASAAIAF2IgBBBXZBCHEiAXIgACABdiIAQQJ2QQRxIgFyIAAgAXYiAEEBdkECcSIBciAAIAF2IgBBAXZBAXEiAXIgACABdmoiA0EDdEH8+gJqIgRBCGoiBigCACIBQQhqIggoAgAhACAAIARGBEBB1PoCQQEgA3RBf3MgBXEiADYCAAUgACAENgIMIAYgADYCACAFIQALIAEgAkEDcjYCBCABIAJqIgQgA0EDdCIDIAJrIgVBAXI2AgQgASADaiAFNgIAIAcEQEHo+gIoAgAhAyAHQQN2IgJBA3RB/PoCaiEBQQEgAnQiAiAAcQR/IAFBCGoiAigCAAVB1PoCIAAgAnI2AgAgAUEIaiECIAELIQAgAiADNgIAIAAgAzYCDCADIAA2AgggAyABNgIMC0Hc+gIgBTYCAEHo+gIgBDYCACAKJAkgCA8LQdj6AigCACILBH9BACALayALcUF/aiIAQQx2QRBxIgEgACABdiIAQQV2QQhxIgFyIAAgAXYiAEECdkEEcSIBciAAIAF2IgBBAXZBAnEiAXIgACABdiIAQQF2QQFxIgFyIAAgAXZqQQJ0QYT9AmooAgAiAyEBIAMoAgRBeHEgAmshCANAAkAgASgCECIARQRAIAEoAhQiAEUNAQsgACIBIAMgASgCBEF4cSACayIAIAhJIgQbIQMgACAIIAQbIQgMAQsLIAIgA2oiDCADSwR/IAMoAhghCSADIAMoAgwiAEYEQAJAIANBFGoiASgCACIARQRAIANBEGoiASgCACIARQRAQQAhAAwCCwsDQAJAIABBFGoiBCgCACIGBH8gBCEBIAYFIABBEGoiBCgCACIGRQ0BIAQhASAGCyEADAELCyABQQA2AgALBSADKAIIIgEgADYCDCAAIAE2AggLIAkEQAJAIAMgAygCHCIBQQJ0QYT9AmoiBCgCAEYEQCAEIAA2AgAgAEUEQEHY+gJBASABdEF/cyALcTYCAAwCCwUgCUEQaiIBIAlBFGogAyABKAIARhsgADYCACAARQ0BCyAAIAk2AhggAygCECIBBEAgACABNgIQIAEgADYCGAsgAygCFCIBBEAgACABNgIUIAEgADYCGAsLCyAIQRBJBEAgAyACIAhqIgBBA3I2AgQgACADakEEaiIAIAAoAgBBAXI2AgAFIAMgAkEDcjYCBCAMIAhBAXI2AgQgCCAMaiAINgIAIAcEQEHo+gIoAgAhBCAHQQN2IgFBA3RB/PoCaiEAQQEgAXQiASAFcQR/IABBCGoiAigCAAVB1PoCIAEgBXI2AgAgAEEIaiECIAALIQEgAiAENgIAIAEgBDYCDCAEIAE2AgggBCAANgIMC0Hc+gIgCDYCAEHo+gIgDDYCAAsgCiQJIANBCGoPBSACCwUgAgsFIAILBSAAQb9/SwR/QX8FAn8gAEELaiIAQXhxIQFB2PoCKAIAIgUEf0EAIAFrIQMCQAJAIABBCHYiAAR/IAFB////B0sEf0EfBSAAIABBgP4/akEQdkEIcSICdCIEQYDgH2pBEHZBBHEhAEEOIAAgAnIgBCAAdCIAQYCAD2pBEHZBAnEiAnJrIAAgAnRBD3ZqIgBBAXQgASAAQQdqdkEBcXILBUEACyIHQQJ0QYT9AmooAgAiAAR/QQAhAiABQQBBGSAHQQF2ayAHQR9GG3QhBkEAIQQDfyAAKAIEQXhxIAFrIgggA0kEQCAIBH8gCCEDIAAFIAAhAkEAIQYMBAshAgsgBCAAKAIUIgQgBEUgBCAAQRBqIAZBH3ZBAnRqKAIAIgBGchshBCAGQQF0IQYgAA0AIAILBUEAIQRBAAshACAAIARyRQRAIAEgBUECIAd0IgBBACAAa3JxIgJFDQQaQQAhACACQQAgAmtxQX9qIgJBDHZBEHEiBCACIAR2IgJBBXZBCHEiBHIgAiAEdiICQQJ2QQRxIgRyIAIgBHYiAkEBdkECcSIEciACIAR2IgJBAXZBAXEiBHIgAiAEdmpBAnRBhP0CaigCACEECyAEBH8gACECIAMhBiAEIQAMAQUgAAshBAwBCyACIQMgBiECA38gACgCBEF4cSABayIGIAJJIQQgBiACIAQbIQIgACADIAQbIQMgACgCECIEBH8gBAUgACgCFAsiAA0AIAMhBCACCyEDCyAEBH8gA0Hc+gIoAgAgAWtJBH8gASAEaiIHIARLBH8gBCgCGCEJIAQgBCgCDCIARgRAAkAgBEEUaiICKAIAIgBFBEAgBEEQaiICKAIAIgBFBEBBACEADAILCwNAAkAgAEEUaiIGKAIAIggEfyAGIQIgCAUgAEEQaiIGKAIAIghFDQEgBiECIAgLIQAMAQsLIAJBADYCAAsFIAQoAggiAiAANgIMIAAgAjYCCAsgCQRAAkAgBCAEKAIcIgJBAnRBhP0CaiIGKAIARgRAIAYgADYCACAARQRAQdj6AiAFQQEgAnRBf3NxIgA2AgAMAgsFIAlBEGoiAiAJQRRqIAQgAigCAEYbIAA2AgAgAEUEQCAFIQAMAgsLIAAgCTYCGCAEKAIQIgIEQCAAIAI2AhAgAiAANgIYCyAEKAIUIgIEfyAAIAI2AhQgAiAANgIYIAUFIAULIQALBSAFIQALIANBEEkEQCAEIAEgA2oiAEEDcjYCBCAAIARqQQRqIgAgACgCAEEBcjYCAAUCQCAEIAFBA3I2AgQgByADQQFyNgIEIAMgB2ogAzYCACADQQN2IQEgA0GAAkkEQCABQQN0Qfz6AmohAEHU+gIoAgAiAkEBIAF0IgFxBH8gAEEIaiICKAIABUHU+gIgASACcjYCACAAQQhqIQIgAAshASACIAc2AgAgASAHNgIMIAcgATYCCCAHIAA2AgwMAQsgA0EIdiIBBH8gA0H///8HSwR/QR8FIAEgAUGA/j9qQRB2QQhxIgJ0IgVBgOAfakEQdkEEcSEBQQ4gASACciAFIAF0IgFBgIAPakEQdkECcSICcmsgASACdEEPdmoiAUEBdCADIAFBB2p2QQFxcgsFQQALIgFBAnRBhP0CaiECIAcgATYCHCAHQRBqIgVBADYCBCAFQQA2AgBBASABdCIFIABxRQRAQdj6AiAAIAVyNgIAIAIgBzYCACAHIAI2AhggByAHNgIMIAcgBzYCCAwBCyADIAIoAgAiACgCBEF4cUYEQCAAIQEFAkAgA0EAQRkgAUEBdmsgAUEfRht0IQIDQCAAQRBqIAJBH3ZBAnRqIgUoAgAiAQRAIAJBAXQhAiADIAEoAgRBeHFGDQIgASEADAELCyAFIAc2AgAgByAANgIYIAcgBzYCDCAHIAc2AggMAgsLIAFBCGoiACgCACICIAc2AgwgACAHNgIAIAcgAjYCCCAHIAE2AgwgB0EANgIYCwsgCiQJIARBCGoPBSABCwUgAQsFIAELBSABCwsLCyEAQdz6AigCACICIABPBEBB6PoCKAIAIQEgAiAAayIDQQ9LBEBB6PoCIAAgAWoiBTYCAEHc+gIgAzYCACAFIANBAXI2AgQgASACaiADNgIAIAEgAEEDcjYCBAVB3PoCQQA2AgBB6PoCQQA2AgAgASACQQNyNgIEIAEgAmpBBGoiACAAKAIAQQFyNgIACyAKJAkgAUEIag8LQeD6AigCACICIABLBEBB4PoCIAIgAGsiAjYCAEHs+gIgAEHs+gIoAgAiAWoiAzYCACADIAJBAXI2AgQgASAAQQNyNgIEIAokCSABQQhqDwsgAEEwaiEEIABBL2oiBkGs/gIoAgAEf0G0/gIoAgAFQbT+AkGAIDYCAEGw/gJBgCA2AgBBuP4CQX82AgBBvP4CQX82AgBBwP4CQQA2AgBBkP4CQQA2AgBBrP4CIAlBcHFB2KrVqgVzNgIAQYAgCyIBaiIIQQAgAWsiCXEiBSAATQRAIAokCUEADwtBjP4CKAIAIgEEQCAFQYT+AigCACIDaiIHIANNIAcgAUtyBEAgCiQJQQAPCwsCQAJAQZD+AigCAEEEcQRAQQAhAgUCQAJAAkBB7PoCKAIAIgFFDQBBlP4CIQMDQAJAIAMoAgAiByABTQRAIAcgAygCBGogAUsNAQsgAygCCCIDDQEMAgsLIAkgCCACa3EiAkH/////B0kEQCACEJEOIgEgAygCACADKAIEakYEQCABQX9HDQYFDAMLBUEAIQILDAILQQAQkQ4iAUF/RgR/QQAFQYT+AigCACIIIAUgAUGw/gIoAgAiAkF/aiIDakEAIAJrcSABa0EAIAEgA3EbaiICaiEDIAJB/////wdJIAIgAEtxBH9BjP4CKAIAIgkEQCADIAhNIAMgCUtyBEBBACECDAULCyABIAIQkQ4iA0YNBSADIQEMAgVBAAsLIQIMAQtBACACayEIIAFBf0cgAkH/////B0lxIAQgAktxRQRAIAFBf0YEQEEAIQIMAgUMBAsAC0G0/gIoAgAiAyAGIAJrakEAIANrcSIDQf////8HTw0CIAMQkQ5Bf0YEfyAIEJEOGkEABSACIANqIQIMAwshAgtBkP4CQZD+AigCAEEEcjYCAAsgBUH/////B0kEQCAFEJEOIQFBABCRDiIDIAFrIgQgAEEoakshBSAEIAIgBRshAiAFQQFzIAFBf0ZyIAFBf0cgA0F/R3EgASADSXFBAXNyRQ0BCwwBC0GE/gIgAkGE/gIoAgBqIgM2AgAgA0GI/gIoAgBLBEBBiP4CIAM2AgALQez6AigCACIFBEACQEGU/gIhAwJAAkADQCABIAMoAgAiBCADKAIEIgZqRg0BIAMoAggiAw0ACwwBCyADQQRqIQggAygCDEEIcUUEQCAEIAVNIAEgBUtxBEAgCCACIAZqNgIAIAVBACAFQQhqIgFrQQdxQQAgAUEHcRsiA2ohASACQeD6AigCAGoiBCADayECQez6AiABNgIAQeD6AiACNgIAIAEgAkEBcjYCBCAEIAVqQSg2AgRB8PoCQbz+AigCADYCAAwDCwsLIAFB5PoCKAIASQRAQeT6AiABNgIACyABIAJqIQRBlP4CIQMCQAJAA0AgBCADKAIARg0BIAMoAggiAw0ACwwBCyADKAIMQQhxRQRAIAMgATYCACADQQRqIgMgAiADKAIAajYCACAAIAFBACABQQhqIgFrQQdxQQAgAUEHcRtqIglqIQYgBEEAIARBCGoiAWtBB3FBACABQQdxG2oiAiAJayAAayEDIAkgAEEDcjYCBCACIAVGBEBB4PoCIANB4PoCKAIAaiIANgIAQez6AiAGNgIAIAYgAEEBcjYCBAUCQCACQej6AigCAEYEQEHc+gIgA0Hc+gIoAgBqIgA2AgBB6PoCIAY2AgAgBiAAQQFyNgIEIAAgBmogADYCAAwBCyACKAIEIgBBA3FBAUYEQCAAQXhxIQcgAEEDdiEFIABBgAJJBEAgAigCCCIAIAIoAgwiAUYEQEHU+gJB1PoCKAIAQQEgBXRBf3NxNgIABSAAIAE2AgwgASAANgIICwUCQCACKAIYIQggAiACKAIMIgBGBEACQCACQRBqIgFBBGoiBSgCACIABEAgBSEBBSABKAIAIgBFBEBBACEADAILCwNAAkAgAEEUaiIFKAIAIgQEfyAFIQEgBAUgAEEQaiIFKAIAIgRFDQEgBSEBIAQLIQAMAQsLIAFBADYCAAsFIAIoAggiASAANgIMIAAgATYCCAsgCEUNACACIAIoAhwiAUECdEGE/QJqIgUoAgBGBEACQCAFIAA2AgAgAA0AQdj6AkHY+gIoAgBBASABdEF/c3E2AgAMAgsFIAhBEGoiASAIQRRqIAIgASgCAEYbIAA2AgAgAEUNAQsgACAINgIYIAJBEGoiBSgCACIBBEAgACABNgIQIAEgADYCGAsgBSgCBCIBRQ0AIAAgATYCFCABIAA2AhgLCyACIAdqIQIgAyAHaiEDCyACQQRqIgAgACgCAEF+cTYCACAGIANBAXI2AgQgAyAGaiADNgIAIANBA3YhASADQYACSQRAIAFBA3RB/PoCaiEAQdT6AigCACICQQEgAXQiAXEEfyAAQQhqIgIoAgAFQdT6AiABIAJyNgIAIABBCGohAiAACyEBIAIgBjYCACABIAY2AgwgBiABNgIIIAYgADYCDAwBCyADQQh2IgAEfyADQf///wdLBH9BHwUgACAAQYD+P2pBEHZBCHEiAXQiAkGA4B9qQRB2QQRxIQBBDiAAIAFyIAIgAHQiAEGAgA9qQRB2QQJxIgFyayAAIAF0QQ92aiIAQQF0IAMgAEEHanZBAXFyCwVBAAsiAUECdEGE/QJqIQAgBiABNgIcIAZBEGoiAkEANgIEIAJBADYCAEHY+gIoAgAiAkEBIAF0IgVxRQRAQdj6AiACIAVyNgIAIAAgBjYCACAGIAA2AhggBiAGNgIMIAYgBjYCCAwBCyADIAAoAgAiACgCBEF4cUYEQCAAIQEFAkAgA0EAQRkgAUEBdmsgAUEfRht0IQIDQCAAQRBqIAJBH3ZBAnRqIgUoAgAiAQRAIAJBAXQhAiADIAEoAgRBeHFGDQIgASEADAELCyAFIAY2AgAgBiAANgIYIAYgBjYCDCAGIAY2AggMAgsLIAFBCGoiACgCACICIAY2AgwgACAGNgIAIAYgAjYCCCAGIAE2AgwgBkEANgIYCwsgCiQJIAlBCGoPCwtBlP4CIQMDQAJAIAMoAgAiBCAFTQRAIAQgAygCBGoiBiAFSw0BCyADKAIIIQMMAQsLIAZBUWoiBEEIaiEDIAUgBEEAIANrQQdxQQAgA0EHcRtqIgMgAyAFQRBqIglJGyIDQQhqIQRB7PoCIAFBACABQQhqIghrQQdxQQAgCEEHcRsiCGoiBzYCAEHg+gIgAkFYaiILIAhrIgg2AgAgByAIQQFyNgIEIAEgC2pBKDYCBEHw+gJBvP4CKAIANgIAIANBBGoiCEEbNgIAIARBlP4CKQIANwIAIARBnP4CKQIANwIIQZT+AiABNgIAQZj+AiACNgIAQaD+AkEANgIAQZz+AiAENgIAIANBGGohAQNAIAFBBGoiAkEHNgIAIAFBCGogBkkEQCACIQEMAQsLIAMgBUcEQCAIIAgoAgBBfnE2AgAgBSADIAVrIgRBAXI2AgQgAyAENgIAIARBA3YhAiAEQYACSQRAIAJBA3RB/PoCaiEBQdT6AigCACIDQQEgAnQiAnEEfyABQQhqIgMoAgAFQdT6AiACIANyNgIAIAFBCGohAyABCyECIAMgBTYCACACIAU2AgwgBSACNgIIIAUgATYCDAwCCyAEQQh2IgEEfyAEQf///wdLBH9BHwUgASABQYD+P2pBEHZBCHEiAnQiA0GA4B9qQRB2QQRxIQFBDiABIAJyIAMgAXQiAUGAgA9qQRB2QQJxIgJyayABIAJ0QQ92aiIBQQF0IAQgAUEHanZBAXFyCwVBAAsiAkECdEGE/QJqIQEgBSACNgIcIAVBADYCFCAJQQA2AgBB2PoCKAIAIgNBASACdCIGcUUEQEHY+gIgAyAGcjYCACABIAU2AgAgBSABNgIYIAUgBTYCDCAFIAU2AggMAgsgBCABKAIAIgEoAgRBeHFGBEAgASECBQJAIARBAEEZIAJBAXZrIAJBH0YbdCEDA0AgAUEQaiADQR92QQJ0aiIGKAIAIgIEQCADQQF0IQMgBCACKAIEQXhxRg0CIAIhAQwBCwsgBiAFNgIAIAUgATYCGCAFIAU2AgwgBSAFNgIIDAMLCyACQQhqIgEoAgAiAyAFNgIMIAEgBTYCACAFIAM2AgggBSACNgIMIAVBADYCGAsLBUHk+gIoAgAiA0UgASADSXIEQEHk+gIgATYCAAtBlP4CIAE2AgBBmP4CIAI2AgBBoP4CQQA2AgBB+PoCQaz+AigCADYCAEH0+gJBfzYCAEGI+wJB/PoCNgIAQYT7AkH8+gI2AgBBkPsCQYT7AjYCAEGM+wJBhPsCNgIAQZj7AkGM+wI2AgBBlPsCQYz7AjYCAEGg+wJBlPsCNgIAQZz7AkGU+wI2AgBBqPsCQZz7AjYCAEGk+wJBnPsCNgIAQbD7AkGk+wI2AgBBrPsCQaT7AjYCAEG4+wJBrPsCNgIAQbT7AkGs+wI2AgBBwPsCQbT7AjYCAEG8+wJBtPsCNgIAQcj7AkG8+wI2AgBBxPsCQbz7AjYCAEHQ+wJBxPsCNgIAQcz7AkHE+wI2AgBB2PsCQcz7AjYCAEHU+wJBzPsCNgIAQeD7AkHU+wI2AgBB3PsCQdT7AjYCAEHo+wJB3PsCNgIAQeT7AkHc+wI2AgBB8PsCQeT7AjYCAEHs+wJB5PsCNgIAQfj7AkHs+wI2AgBB9PsCQez7AjYCAEGA/AJB9PsCNgIAQfz7AkH0+wI2AgBBiPwCQfz7AjYCAEGE/AJB/PsCNgIAQZD8AkGE/AI2AgBBjPwCQYT8AjYCAEGY/AJBjPwCNgIAQZT8AkGM/AI2AgBBoPwCQZT8AjYCAEGc/AJBlPwCNgIAQaj8AkGc/AI2AgBBpPwCQZz8AjYCAEGw/AJBpPwCNgIAQaz8AkGk/AI2AgBBuPwCQaz8AjYCAEG0/AJBrPwCNgIAQcD8AkG0/AI2AgBBvPwCQbT8AjYCAEHI/AJBvPwCNgIAQcT8AkG8/AI2AgBB0PwCQcT8AjYCAEHM/AJBxPwCNgIAQdj8AkHM/AI2AgBB1PwCQcz8AjYCAEHg/AJB1PwCNgIAQdz8AkHU/AI2AgBB6PwCQdz8AjYCAEHk/AJB3PwCNgIAQfD8AkHk/AI2AgBB7PwCQeT8AjYCAEH4/AJB7PwCNgIAQfT8AkHs/AI2AgBBgP0CQfT8AjYCAEH8/AJB9PwCNgIAQez6AiABQQAgAUEIaiIDa0EHcUEAIANBB3EbIgNqIgU2AgBB4PoCIAJBWGoiAiADayIDNgIAIAUgA0EBcjYCBCABIAJqQSg2AgRB8PoCQbz+AigCADYCAAtB4PoCKAIAIgEgAEsEQEHg+gIgASAAayICNgIAQez6AiAAQez6AigCACIBaiIDNgIAIAMgAkEBcjYCBCABIABBA3I2AgQgCiQJIAFBCGoPCwsQhwlBDDYCACAKJAlBAAv4DQEIfyAARQRADwtB5PoCKAIAIQQgAEF4aiICIABBfGooAgAiA0F4cSIAaiEFIANBAXEEfyACBQJ/IAIoAgAhASADQQNxRQRADwsgACABaiEAIAIgAWsiAiAESQRADwsgAkHo+gIoAgBGBEAgAiAFQQRqIgEoAgAiA0EDcUEDRw0BGkHc+gIgADYCACABIANBfnE2AgAgAiAAQQFyNgIEIAAgAmogADYCAA8LIAFBA3YhBCABQYACSQRAIAIoAggiASACKAIMIgNGBEBB1PoCQdT6AigCAEEBIAR0QX9zcTYCACACDAIFIAEgAzYCDCADIAE2AgggAgwCCwALIAIoAhghByACIAIoAgwiAUYEQAJAIAJBEGoiA0EEaiIEKAIAIgEEQCAEIQMFIAMoAgAiAUUEQEEAIQEMAgsLA0ACQCABQRRqIgQoAgAiBgR/IAQhAyAGBSABQRBqIgQoAgAiBkUNASAEIQMgBgshAQwBCwsgA0EANgIACwUgAigCCCIDIAE2AgwgASADNgIICyAHBH8gAiACKAIcIgNBAnRBhP0CaiIEKAIARgRAIAQgATYCACABRQRAQdj6AkHY+gIoAgBBASADdEF/c3E2AgAgAgwDCwUgB0EQaiIDIAdBFGogAiADKAIARhsgATYCACACIAFFDQIaCyABIAc2AhggAkEQaiIEKAIAIgMEQCABIAM2AhAgAyABNgIYCyAEKAIEIgMEfyABIAM2AhQgAyABNgIYIAIFIAILBSACCwsLIgcgBU8EQA8LIAVBBGoiAygCACIBQQFxRQRADwsgAUECcQRAIAMgAUF+cTYCACACIABBAXI2AgQgACAHaiAANgIAIAAhAwUgBUHs+gIoAgBGBEBB4PoCIABB4PoCKAIAaiIANgIAQez6AiACNgIAIAIgAEEBcjYCBEHo+gIoAgAgAkcEQA8LQej6AkEANgIAQdz6AkEANgIADwtB6PoCKAIAIAVGBEBB3PoCIABB3PoCKAIAaiIANgIAQej6AiAHNgIAIAIgAEEBcjYCBCAAIAdqIAA2AgAPCyAAIAFBeHFqIQMgAUEDdiEEIAFBgAJJBEAgBSgCCCIAIAUoAgwiAUYEQEHU+gJB1PoCKAIAQQEgBHRBf3NxNgIABSAAIAE2AgwgASAANgIICwUCQCAFKAIYIQggBSgCDCIAIAVGBEACQCAFQRBqIgFBBGoiBCgCACIABEAgBCEBBSABKAIAIgBFBEBBACEADAILCwNAAkAgAEEUaiIEKAIAIgYEfyAEIQEgBgUgAEEQaiIEKAIAIgZFDQEgBCEBIAYLIQAMAQsLIAFBADYCAAsFIAUoAggiASAANgIMIAAgATYCCAsgCARAIAUoAhwiAUECdEGE/QJqIgQoAgAgBUYEQCAEIAA2AgAgAEUEQEHY+gJB2PoCKAIAQQEgAXRBf3NxNgIADAMLBSAIQRBqIgEgCEEUaiABKAIAIAVGGyAANgIAIABFDQILIAAgCDYCGCAFQRBqIgQoAgAiAQRAIAAgATYCECABIAA2AhgLIAQoAgQiAQRAIAAgATYCFCABIAA2AhgLCwsLIAIgA0EBcjYCBCADIAdqIAM2AgAgAkHo+gIoAgBGBEBB3PoCIAM2AgAPCwsgA0EDdiEBIANBgAJJBEAgAUEDdEH8+gJqIQBB1PoCKAIAIgNBASABdCIBcQR/IABBCGoiAygCAAVB1PoCIAEgA3I2AgAgAEEIaiEDIAALIQEgAyACNgIAIAEgAjYCDCACIAE2AgggAiAANgIMDwsgA0EIdiIABH8gA0H///8HSwR/QR8FIAAgAEGA/j9qQRB2QQhxIgF0IgRBgOAfakEQdkEEcSEAQQ4gACABciAEIAB0IgBBgIAPakEQdkECcSIBcmsgACABdEEPdmoiAEEBdCADIABBB2p2QQFxcgsFQQALIgFBAnRBhP0CaiEAIAIgATYCHCACQQA2AhQgAkEANgIQQdj6AigCACIEQQEgAXQiBnEEQAJAIAMgACgCACIAKAIEQXhxRgRAIAAhAQUCQCADQQBBGSABQQF2ayABQR9GG3QhBANAIABBEGogBEEfdkECdGoiBigCACIBBEAgBEEBdCEEIAMgASgCBEF4cUYNAiABIQAMAQsLIAYgAjYCACACIAA2AhggAiACNgIMIAIgAjYCCAwCCwsgAUEIaiIAKAIAIgMgAjYCDCAAIAI2AgAgAiADNgIIIAIgATYCDCACQQA2AhgLBUHY+gIgBCAGcjYCACAAIAI2AgAgAiAANgIYIAIgAjYCDCACIAI2AggLQfT6AkH0+gIoAgBBf2oiADYCACAABEAPC0Gc/gIhAANAIAAoAgAiAkEIaiEAIAINAAtB9PoCQX82AgALhgEBAn8gAEUEQCABEIAKDwsgAUG/f0sEQBCHCUEMNgIAQQAPCyAAQXhqQRAgAUELakF4cSABQQtJGxCDCiICBEAgAkEIag8LIAEQgAoiAkUEQEEADwsgAiAAIABBfGooAgAiA0F4cUEEQQggA0EDcRtrIgMgASADIAFJGxCODhogABCBCiACC8kHAQp/IAAgAEEEaiIHKAIAIgZBeHEiAmohBCAGQQNxRQRAIAFBgAJJBEBBAA8LIAIgAUEEak8EQCACIAFrQbT+AigCAEEBdE0EQCAADwsLQQAPCyACIAFPBEAgAiABayICQQ9NBEAgAA8LIAcgASAGQQFxckECcjYCACAAIAFqIgEgAkEDcjYCBCAEQQRqIgMgAygCAEEBcjYCACABIAIQhAogAA8LQez6AigCACAERgRAQeD6AigCACACaiIFIAFrIQIgACABaiEDIAUgAU0EQEEADwsgByABIAZBAXFyQQJyNgIAIAMgAkEBcjYCBEHs+gIgAzYCAEHg+gIgAjYCACAADwtB6PoCKAIAIARGBEAgAkHc+gIoAgBqIgMgAUkEQEEADwsgAyABayICQQ9LBEAgByABIAZBAXFyQQJyNgIAIAAgAWoiASACQQFyNgIEIAAgA2oiAyACNgIAIANBBGoiAyADKAIAQX5xNgIABSAHIAMgBkEBcXJBAnI2AgAgACADakEEaiIBIAEoAgBBAXI2AgBBACEBQQAhAgtB3PoCIAI2AgBB6PoCIAE2AgAgAA8LIAQoAgQiA0ECcQRAQQAPCyACIANBeHFqIgggAUkEQEEADwsgCCABayEKIANBA3YhBSADQYACSQRAIAQoAggiAiAEKAIMIgNGBEBB1PoCQdT6AigCAEEBIAV0QX9zcTYCAAUgAiADNgIMIAMgAjYCCAsFAkAgBCgCGCEJIAQgBCgCDCICRgRAAkAgBEEQaiIDQQRqIgUoAgAiAgRAIAUhAwUgAygCACICRQRAQQAhAgwCCwsDQAJAIAJBFGoiBSgCACILBH8gBSEDIAsFIAJBEGoiBSgCACILRQ0BIAUhAyALCyECDAELCyADQQA2AgALBSAEKAIIIgMgAjYCDCACIAM2AggLIAkEQCAEKAIcIgNBAnRBhP0CaiIFKAIAIARGBEAgBSACNgIAIAJFBEBB2PoCQdj6AigCAEEBIAN0QX9zcTYCAAwDCwUgCUEQaiIDIAlBFGogAygCACAERhsgAjYCACACRQ0CCyACIAk2AhggBEEQaiIFKAIAIgMEQCACIAM2AhAgAyACNgIYCyAFKAIEIgMEQCACIAM2AhQgAyACNgIYCwsLCyAKQRBJBH8gByAGQQFxIAhyQQJyNgIAIAAgCGpBBGoiASABKAIAQQFyNgIAIAAFIAcgASAGQQFxckECcjYCACAAIAFqIgEgCkEDcjYCBCAAIAhqQQRqIgIgAigCAEEBcjYCACABIAoQhAogAAsL6AwBBn8gACABaiEFIAAoAgQiA0EBcUUEQAJAIAAoAgAhAiADQQNxRQRADwsgASACaiEBIAAgAmsiAEHo+gIoAgBGBEAgBUEEaiICKAIAIgNBA3FBA0cNAUHc+gIgATYCACACIANBfnE2AgAgACABQQFyNgIEIAUgATYCAA8LIAJBA3YhBCACQYACSQRAIAAoAggiAiAAKAIMIgNGBEBB1PoCQdT6AigCAEEBIAR0QX9zcTYCAAwCBSACIAM2AgwgAyACNgIIDAILAAsgACgCGCEHIAAgACgCDCICRgRAAkAgAEEQaiIDQQRqIgQoAgAiAgRAIAQhAwUgAygCACICRQRAQQAhAgwCCwsDQAJAIAJBFGoiBCgCACIGBH8gBCEDIAYFIAJBEGoiBCgCACIGRQ0BIAQhAyAGCyECDAELCyADQQA2AgALBSAAKAIIIgMgAjYCDCACIAM2AggLIAcEQCAAIAAoAhwiA0ECdEGE/QJqIgQoAgBGBEAgBCACNgIAIAJFBEBB2PoCQdj6AigCAEEBIAN0QX9zcTYCAAwDCwUgB0EQaiIDIAdBFGogACADKAIARhsgAjYCACACRQ0CCyACIAc2AhggAEEQaiIEKAIAIgMEQCACIAM2AhAgAyACNgIYCyAEKAIEIgMEQCACIAM2AhQgAyACNgIYCwsLCyAFQQRqIgMoAgAiAkECcQRAIAMgAkF+cTYCACAAIAFBAXI2AgQgACABaiABNgIAIAEhAwUgBUHs+gIoAgBGBEBB4PoCIAFB4PoCKAIAaiIBNgIAQez6AiAANgIAIAAgAUEBcjYCBEHo+gIoAgAgAEcEQA8LQej6AkEANgIAQdz6AkEANgIADwsgBUHo+gIoAgBGBEBB3PoCIAFB3PoCKAIAaiIBNgIAQej6AiAANgIAIAAgAUEBcjYCBCAAIAFqIAE2AgAPCyABIAJBeHFqIQMgAkEDdiEEIAJBgAJJBEAgBSgCCCIBIAUoAgwiAkYEQEHU+gJB1PoCKAIAQQEgBHRBf3NxNgIABSABIAI2AgwgAiABNgIICwUCQCAFKAIYIQcgBSgCDCIBIAVGBEACQCAFQRBqIgJBBGoiBCgCACIBBEAgBCECBSACKAIAIgFFBEBBACEBDAILCwNAAkAgAUEUaiIEKAIAIgYEfyAEIQIgBgUgAUEQaiIEKAIAIgZFDQEgBCECIAYLIQEMAQsLIAJBADYCAAsFIAUoAggiAiABNgIMIAEgAjYCCAsgBwRAIAUoAhwiAkECdEGE/QJqIgQoAgAgBUYEQCAEIAE2AgAgAUUEQEHY+gJB2PoCKAIAQQEgAnRBf3NxNgIADAMLBSAHQRBqIgIgB0EUaiACKAIAIAVGGyABNgIAIAFFDQILIAEgBzYCGCAFQRBqIgQoAgAiAgRAIAEgAjYCECACIAE2AhgLIAQoAgQiAgRAIAEgAjYCFCACIAE2AhgLCwsLIAAgA0EBcjYCBCAAIANqIAM2AgAgAEHo+gIoAgBGBEBB3PoCIAM2AgAPCwsgA0EDdiECIANBgAJJBEAgAkEDdEH8+gJqIQFB1PoCKAIAIgNBASACdCICcQR/IAFBCGoiAygCAAVB1PoCIAIgA3I2AgAgAUEIaiEDIAELIQIgAyAANgIAIAIgADYCDCAAIAI2AgggACABNgIMDwsgA0EIdiIBBH8gA0H///8HSwR/QR8FIAEgAUGA/j9qQRB2QQhxIgJ0IgRBgOAfakEQdkEEcSEBQQ4gASACciAEIAF0IgFBgIAPakEQdkECcSICcmsgASACdEEPdmoiAUEBdCADIAFBB2p2QQFxcgsFQQALIgJBAnRBhP0CaiEBIAAgAjYCHCAAQQA2AhQgAEEANgIQQdj6AigCACIEQQEgAnQiBnFFBEBB2PoCIAQgBnI2AgAgASAANgIAIAAgATYCGCAAIAA2AgwgACAANgIIDwsgAyABKAIAIgEoAgRBeHFGBEAgASECBQJAIANBAEEZIAJBAXZrIAJBH0YbdCEEA0AgAUEQaiAEQR92QQJ0aiIGKAIAIgIEQCAEQQF0IQQgAyACKAIEQXhxRg0CIAIhAQwBCwsgBiAANgIAIAAgATYCGCAAIAA2AgwgACAANgIIDwsLIAJBCGoiASgCACIDIAA2AgwgASAANgIAIAAgAzYCCCAAIAI2AgwgAEEANgIYCwcAIAAQhgoLYQEBfyAAQaDbATYCAEEAJAVBgwEgAEEAEFojBSEBQQAkBSABQQFxBEBBABBkIQAQABogABDJAQUgAEEcahDjCiAAKAIgEIEKIAAoAiQQgQogACgCMBCBCiAAKAI8EIEKCwtWAQR/IABBIGohAyAAQSRqIQQgACgCKCECA0AgAgRAIAMoAgAgAkF/aiICQQJ0aigCACEFIAEgACAEKAIAIAJBAnRqKAIAIAVBH3FB2gxqEQIADAELCwsMACAAEIYKIAAQvQ0LEwAgAEGw2wE2AgAgAEEEahDjCgsMACAAEIkKIAAQvQ0LBAAgAAsQACAAQgA3AwAgAEJ/NwMICxAAIABCADcDACAAQn83AwgLqgEBBn8QoAgaIABBDGohBSAAQRBqIQZBACEEA0ACQCAEIAJODQAgBSgCACIDIAYoAgAiB0kEfyABIAMgAiAEayIIIAcgA2siAyAIIANIGyIDEJMKGiAFIAMgBSgCAGo2AgAgASADagUgACgCACgCKCEDIAAgA0H/AXFBmgFqEQMAIgNBf0YNASABIAMQpgg6AABBASEDIAFBAWoLIQEgAyAEaiEEDAELCyAECwUAEKAIC0YBAX8gACgCACgCJCEBIAAgAUH/AXFBmgFqEQMAEKAIRgR/EKAIBSAAQQxqIgEoAgAhACABIABBAWo2AgAgACwAABCmCAsLBQAQoAgLqQEBB38QoAghByAAQRhqIQUgAEEcaiEIQQAhBANAAkAgBCACTg0AIAUoAgAiBiAIKAIAIgNJBH8gBiABIAIgBGsiCSADIAZrIgMgCSADSBsiAxCTChogBSADIAUoAgBqNgIAIAMgBGohBCABIANqBSAAKAIAKAI0IQMgACABLAAAEKYIIANBP3FBngNqER4AIAdGDQEgBEEBaiEEIAFBAWoLIQEMAQsLIAQLEwAgAgRAIAAgASACEI4OGgsgAAsTACAAQfDbATYCACAAQQRqEOMKCwwAIAAQlAogABC9DQuzAQEGfxCgCBogAEEMaiEFIABBEGohBkEAIQQDQAJAIAQgAk4NACAFKAIAIgMgBigCACIHSQR/IAEgAyACIARrIgggByADa0ECdSIDIAggA0gbIgMQmwoaIAUgBSgCACADQQJ0ajYCACADQQJ0IAFqBSAAKAIAKAIoIQMgACADQf8BcUGaAWoRAwAiA0F/Rg0BIAEgAxDqATYCAEEBIQMgAUEEagshASADIARqIQQMAQsLIAQLBQAQoAgLRgEBfyAAKAIAKAIkIQEgACABQf8BcUGaAWoRAwAQoAhGBH8QoAgFIABBDGoiASgCACEAIAEgAEEEajYCACAAKAIAEOoBCwsFABCgCAuyAQEHfxCgCCEHIABBGGohBSAAQRxqIQhBACEEA0ACQCAEIAJODQAgBSgCACIGIAgoAgAiA0kEfyAGIAEgAiAEayIJIAMgBmtBAnUiAyAJIANIGyIDEJsKGiAFIAUoAgAgA0ECdGo2AgAgAyAEaiEEIANBAnQgAWoFIAAoAgAoAjQhAyAAIAEoAgAQ6gEgA0E/cUGeA2oRHgAgB0YNASAEQQFqIQQgAUEEagshAQwBCwsgBAsWACACBH8gACABIAIQ2gkaIAAFIAALCxMAIABB0NwBENUDIABBCGoQhQoLDAAgABCcCiAAEL0NCxMAIAAgACgCAEF0aigCAGoQnAoLEwAgACAAKAIAQXRqKAIAahCdCgsTACAAQYDdARDVAyAAQQhqEIUKCwwAIAAQoAogABC9DQsTACAAIAAoAgBBdGooAgBqEKAKCxMAIAAgACgCAEF0aigCAGoQoQoLEwAgAEGw3QEQ1QMgAEEEahCFCgsMACAAEKQKIAAQvQ0LEwAgACAAKAIAQXRqKAIAahCkCgsTACAAIAAoAgBBdGooAgBqEKUKCxMAIABB4N0BENUDIABBBGoQhQoLDAAgABCoCiAAEL0NCxMAIAAgACgCAEF0aigCAGoQqAoLEwAgACAAKAIAQXRqKAIAahCpCgtgAQF/IAAgATYCGCAAIAFFNgIQIABBADYCFCAAQYIgNgIEIABBADYCDCAAQQY2AgggAEEgaiICQgA3AgAgAkIANwIIIAJCADcCECACQgA3AhggAkIANwIgIABBHGoQtw0LDAAgACABQRxqELUNCy8BAX8gAEGw2wE2AgAgAEEEahC3DSAAQQhqIgFCADcCACABQgA3AgggAUIANwIQCy8BAX8gAEHw2wE2AgAgAEEEahC3DSAAQQhqIgFCADcCACABQgA3AgggAUIANwIQCwUAELEKCwcAQQAQsgoL3QUBAn9B7IMDQZDWASgCACIAQaSEAxCzCkHE/gJBtNwBNgIAQcz+AkHI3AE2AgBByP4CQQA2AgBBzP4CQeyDAxCsCkGU/wJBADYCAEGY/wIQoAg2AgBBrIQDIABB5IQDELQKQZz/AkHk3AE2AgBBpP8CQfjcATYCAEGg/wJBADYCAEGk/wJBrIQDEKwKQez/AkEANgIAQfD/AhCgCDYCAEHshANBkNcBKAIAIgBBnIUDELUKQfT/AkGU3QE2AgBB+P8CQajdATYCAEH4/wJB7IQDEKwKQcCAA0EANgIAQcSAAxCgCDYCAEGkhQMgAEHUhQMQtgpByIADQcTdATYCAEHMgANB2N0BNgIAQcyAA0GkhQMQrApBlIEDQQA2AgBBmIEDEKAINgIAQdyFA0GQ1QEoAgAiAEGMhgMQtQpBnIEDQZTdATYCAEGggQNBqN0BNgIAQaCBA0HchQMQrApB6IEDQQA2AgBB7IEDEKAINgIAQZyBAygCAEF0aigCAEG0gQNqKAIAIQFBxIIDQZTdATYCAEHIggNBqN0BNgIAQciCAyABEKwKQZCDA0EANgIAQZSDAxCgCDYCAEGUhgMgAEHEhgMQtgpB8IEDQcTdATYCAEH0gQNB2N0BNgIAQfSBA0GUhgMQrApBvIIDQQA2AgBBwIIDEKAINgIAQfCBAygCAEF0aigCAEGIggNqKAIAIQBBmIMDQcTdATYCAEGcgwNB2N0BNgIAQZyDAyAAEKwKQeSDA0EANgIAQeiDAxCgCDYCAEHE/gIoAgBBdGooAgBBjP8CakH0/wI2AgBBnP8CKAIAQXRqKAIAQeT/AmpByIADNgIAQZyBAygCAEF0aiIAKAIAQaCBA2oiASABKAIAQYDAAHI2AgBB8IEDKAIAQXRqIgEoAgBB9IEDaiICIAIoAgBBgMAAcjYCACAAKAIAQeSBA2pB9P8CNgIAIAEoAgBBuIIDakHIgAM2AgALlwEBAX8jCSEDIwlBEGokCSMJIwpOBEBBEBABCyAAEK4KIABBsN8BNgIAIAAgATYCICAAIAI2AiggABCgCDYCMCAAQQA6ADQgACgCACgCCCECIAMiASAAQQRqELUNQQAkBSACIAAgARBaIwUhAkEAJAUgAkEBcQRAEGMhAhAAGiABEOMKIAAQiQogAhBqBSABEOMKIAMkCQsLlwEBAX8jCSEDIwlBEGokCSMJIwpOBEBBEBABCyAAEK8KIABB8N4BNgIAIAAgATYCICAAIAI2AiggABCgCDYCMCAAQQA6ADQgACgCACgCCCECIAMiASAAQQRqELUNQQAkBSACIAAgARBaIwUhAkEAJAUgAkEBcQRAEGMhAhAAGiABEOMKIAAQlAogAhBqBSABEOMKIAMkCQsLqgEBA38jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAAEK4KIABBsN4BNgIAIAAgATYCICAEIgEgAEEEahC1DUEAJAVBNiABQYyJAxBPIQMjBSEFQQAkBSAFQQFxBEAQYyECEAAaIAEQ4wogABCJCiACEGoFIAEQ4wogACADNgIkIAAgAjYCKCADKAIAKAIcIQEgACADIAFB/wFxQZoBahEDAEEBcToALCAEJAkLC6oBAQN/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgABCvCiAAQfDdATYCACAAIAE2AiAgBCIBIABBBGoQtQ1BACQFQTYgAUGUiQMQTyEDIwUhBUEAJAUgBUEBcQRAEGMhAhAAGiABEOMKIAAQlAogAhBqBSABEOMKIAAgAzYCJCAAIAI2AiggAygCACgCHCEBIAAgAyABQf8BcUGaAWoRAwBBAXE6ACwgBCQJCwtPAQF/IAAoAgAoAhghAiAAIAJB/wFxQZoBahEDABogACABQZSJAxDiCiIBNgIkIAEoAgAoAhwhAiAAIAEgAkH/AXFBmgFqEQMAQQFxOgAsC88BAQl/IwkhASMJQRBqJAkjCSMKTgRAQRAQAQsgASEEIABBJGohBiAAQShqIQcgAUEIaiICQQhqIQggAiEJIABBIGohBQJAAkADQAJAIAYoAgAiAygCACgCFCEAIAMgBygCACACIAggBCAAQR9xQbwEahEfACEDIAQoAgAgCWsiACACQQEgACAFKAIAEJcJRwRAQX8hAAwBCwJAAkAgA0EBaw4CAQAEC0F/IQAMAQsMAQsLDAELIAUoAgAQoQlBAEdBH3RBH3UhAAsgASQJIAALZwECfyAALAAsBEAgAUEEIAIgACgCIBCXCSEDBQJAQQAhAwNAIAMgAk4NASAAKAIAKAI0IQQgACABKAIAEOoBIARBP3FBngNqER4AEKAIRwRAIANBAWohAyABQQRqIQEMAQsLCwsgAwvKAgEMfyMJIQMjCUEgaiQJIwkjCk4EQEEgEAELIANBEGohBCADQQhqIQIgA0EEaiEFIAMhBgJ/AkAgARCgCBCiCA0AAn8gAiABEOoBNgIAIAAsACwEQCACQQRBASAAKAIgEJcJQQFGDQIQoAgMAQsgBSAENgIAIAJBBGohCSAAQSRqIQogAEEoaiELIARBCGohDCAEIQ0gAEEgaiEIIAIhAAJAA0ACQCAKKAIAIgIoAgAoAgwhByACIAsoAgAgACAJIAYgBCAMIAUgB0EPcUGwBWoRIAAhAiAAIAYoAgBGDQIgAkEDRg0AIAJBAUYhByACQQJPDQIgBSgCACANayIAIARBASAAIAgoAgAQlwlHDQIgBigCACEAIAcNAQwECwsgAEEBQQEgCCgCABCXCUEBRw0ADAILEKAICwwBCyABELsKCyEAIAMkCSAACxYAIAAQoAgQoggEfxCgCEF/cwUgAAsLTwEBfyAAKAIAKAIYIQIgACACQf8BcUGaAWoRAwAaIAAgAUGMiQMQ4goiATYCJCABKAIAKAIcIQIgACABIAJB/wFxQZoBahEDAEEBcToALAtnAQJ/IAAsACwEQCABQQEgAiAAKAIgEJcJIQMFAkBBACEDA0AgAyACTg0BIAAoAgAoAjQhBCAAIAEsAAAQpgggBEE/cUGeA2oRHgAQoAhHBEAgA0EBaiEDIAFBAWohAQwBCwsLCyADC8oCAQx/IwkhAyMJQSBqJAkjCSMKTgRAQSAQAQsgA0EQaiEEIANBCGohAiADQQRqIQUgAyEGAn8CQCABEKAIEKIIDQACfyACIAEQpgg6AAAgACwALARAIAJBAUEBIAAoAiAQlwlBAUYNAhCgCAwBCyAFIAQ2AgAgAkEBaiEJIABBJGohCiAAQShqIQsgBEEIaiEMIAQhDSAAQSBqIQggAiEAAkADQAJAIAooAgAiAigCACgCDCEHIAIgCygCACAAIAkgBiAEIAwgBSAHQQ9xQbAFahEgACECIAAgBigCAEYNAiACQQNGDQAgAkEBRiEHIAJBAk8NAiAFKAIAIA1rIgAgBEEBIAAgCCgCABCXCUcNAiAGKAIAIQAgBw0BDAQLCyAAQQFBASAIKAIAEJcJQQFHDQAMAgsQoAgLDAELIAEQpwgLIQAgAyQJIAALdAEDfyAAQSRqIgIgAUGUiQMQ4goiATYCACABKAIAKAIYIQMgAEEsaiIEIAEgA0H/AXFBmgFqEQMANgIAIAIoAgAiASgCACgCHCECIAAgASACQf8BcUGaAWoRAwBBAXE6ADUgBCgCAEEISgRAQZu/AhCIDAsLCQAgAEEAEMMKCwkAIABBARDDCgvWAgEJfyMJIQQjCUEgaiQJIwkjCk4EQEEgEAELIARBEGohBSAEQQhqIQYgBEEEaiEHIAQhAiABEKAIEKIIIQggAEE0aiIJLAAAQQBHIQMgCARAIANFBEAgCSAAKAIwIgEQoAgQoghBAXNBAXE6AAALBQJAIAMEQCAHIABBMGoiAygCABDqATYCACAAKAIkIggoAgAoAgwhCgJ/AkACQAJAIAggACgCKCAHIAdBBGogAiAFIAVBCGogBiAKQQ9xQbAFahEgAEEBaw4DAgIAAQsgBSADKAIAOgAAIAYgBUEBajYCAAsgAEEgaiEAA0AgBigCACICIAVNBEBBASECQQAMAwsgBiACQX9qIgI2AgAgAiwAACAAKAIAEOoJQX9HDQALC0EAIQIQoAgLIQAgAkUEQCAAIQEMAgsFIABBMGohAwsgAyABNgIAIAlBAToAAAsLIAQkCSABC+EDAg1/AX4jCSEGIwlBIGokCSMJIwpOBEBBIBABCyAGQRBqIQQgBkEIaiEFIAZBBGohDCAGIQcgAEE0aiICLAAABEAgAEEwaiIHKAIAIQAgAQRAIAcQoAg2AgAgAkEAOgAACwUgACgCLCICQQEgAkEBShshAiAAQSBqIQhBACEDAkACQANAIAMgAk8NASAIKAIAEN4JIglBf0cEQCADIARqIAk6AAAgA0EBaiEDDAELCxCgCCEADAELAkACQCAALAA1BEAgBSAELAAANgIADAEFAkAgAEEoaiEDIABBJGohCSAFQQRqIQ0CQAJAAkADQAJAIAMoAgAiCikCACEPIAkoAgAiCygCACgCECEOAkAgCyAKIAQgAiAEaiIKIAwgBSANIAcgDkEPcUGwBWoRIABBAWsOAwAEAwELIAMoAgAgDzcCACACQQhGDQMgCCgCABDeCSILQX9GDQMgCiALOgAAIAJBAWohAgwBCwsMAgsgBSAELAAANgIADAELEKAIIQAMAQsMAgsLDAELIAEEQCAAIAUoAgAQ6gE2AjAFAkADQCACQQBMDQEgBCACQX9qIgJqLAAAEOoBIAgoAgAQ6glBf0cNAAsQoAghAAwCCwsgBSgCABDqASEACwsLIAYkCSAAC3QBA38gAEEkaiICIAFBjIkDEOIKIgE2AgAgASgCACgCGCEDIABBLGoiBCABIANB/wFxQZoBahEDADYCACACKAIAIgEoAgAoAhwhAiAAIAEgAkH/AXFBmgFqEQMAQQFxOgA1IAQoAgBBCEoEQEGbvwIQiAwLCwkAIABBABDICgsJACAAQQEQyAoL1gIBCX8jCSEEIwlBIGokCSMJIwpOBEBBIBABCyAEQRBqIQUgBEEEaiEGIARBCGohByAEIQIgARCgCBCiCCEIIABBNGoiCSwAAEEARyEDIAgEQCADRQRAIAkgACgCMCIBEKAIEKIIQQFzQQFxOgAACwUCQCADBEAgByAAQTBqIgMoAgAQpgg6AAAgACgCJCIIKAIAKAIMIQoCfwJAAkACQCAIIAAoAiggByAHQQFqIAIgBSAFQQhqIAYgCkEPcUGwBWoRIABBAWsOAwICAAELIAUgAygCADoAACAGIAVBAWo2AgALIABBIGohAANAIAYoAgAiAiAFTQRAQQEhAkEADAMLIAYgAkF/aiICNgIAIAIsAAAgACgCABDqCUF/Rw0ACwtBACECEKAICyEAIAJFBEAgACEBDAILBSAAQTBqIQMLIAMgATYCACAJQQE6AAALCyAEJAkgAQvhAwINfwF+IwkhBiMJQSBqJAkjCSMKTgRAQSAQAQsgBkEQaiEEIAZBCGohBSAGQQRqIQwgBiEHIABBNGoiAiwAAARAIABBMGoiBygCACEAIAEEQCAHEKAINgIAIAJBADoAAAsFIAAoAiwiAkEBIAJBAUobIQIgAEEgaiEIQQAhAwJAAkADQCADIAJPDQEgCCgCABDeCSIJQX9HBEAgAyAEaiAJOgAAIANBAWohAwwBCwsQoAghAAwBCwJAAkAgACwANQRAIAUgBCwAADoAAAwBBQJAIABBKGohAyAAQSRqIQkgBUEBaiENAkACQAJAA0ACQCADKAIAIgopAgAhDyAJKAIAIgsoAgAoAhAhDgJAIAsgCiAEIAIgBGoiCiAMIAUgDSAHIA5BD3FBsAVqESAAQQFrDgMABAMBCyADKAIAIA83AgAgAkEIRg0DIAgoAgAQ3gkiC0F/Rg0DIAogCzoAACACQQFqIQIMAQsLDAILIAUgBCwAADoAAAwBCxCgCCEADAELDAILCwwBCyABBEAgACAFLAAAEKYINgIwBQJAA0AgAkEATA0BIAQgAkF/aiICaiwAABCmCCAIKAIAEOoJQX9HDQALEKAIIQAMAgsLIAUsAAAQpgghAAsLCyAGJAkgAAsHACAAEIkCCwwAIAAQyQogABC9DQsiAQF/IAAEQCAAKAIAKAIEIQEgACABQf8DcUGYBmoRBQALC1cBAX8CfwJAA38CfyADIARGDQJBfyABIAJGDQAaQX8gASwAACIAIAMsAAAiBUgNABogBSAASAR/QQEFIANBAWohAyABQQFqIQEMAgsLCwwBCyABIAJHCwsZACAAQgA3AgAgAEEANgIIIAAgAiADEM8KCz8BAX9BACEAA0AgASACRwRAIAEsAAAgAEEEdGoiAEGAgICAf3EiAyADQRh2ciAAcyEAIAFBAWohAQwBCwsgAAuyAQEGfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAYhByACIAEiA2siBEFvSwRAIAAQwg0LIARBC0kEQCAAIAQ6AAsFIAAgBEEQakFwcSIIELwNIgU2AgAgACAIQYCAgIB4cjYCCCAAIAQ2AgQgBSEACyACIANrIQUgACEDA0AgASACRwRAIAMgARClCCABQQFqIQEgA0EBaiEDDAELCyAHQQA6AAAgACAFaiAHEKUIIAYkCQsMACAAEMkKIAAQvQ0LVwEBfwJ/AkADfwJ/IAMgBEYNAkF/IAEgAkYNABpBfyABKAIAIgAgAygCACIFSA0AGiAFIABIBH9BAQUgA0EEaiEDIAFBBGohAQwCCwsLDAELIAEgAkcLCxkAIABCADcCACAAQQA2AgggACACIAMQ1AoLQQEBf0EAIQADQCABIAJHBEAgASgCACAAQQR0aiIDQYCAgIB/cSEAIAMgACAAQRh2cnMhACABQQRqIQEMAQsLIAALhQIBBX8jCSEFIwlBEGokCSMJIwpOBEBBEBABCyAFIQYgAiABa0ECdSIDQe////8DSwRAIAAQwg0LIANBAkkEQCAAIAM6AAsgACEEBQJAIANBBGpBfHEiB0H/////A00EQCAAIAdBAnQQvA0iBDYCACAAIAdBgICAgHhyNgIIIAAgAzYCBAwBC0EIEGAhAEEAJAVBMyAAQdfRAhBaIwUhA0EAJAUgA0EBcQRAEGMhAxAAGiAAEGUgAxBqBSAAQdT1ATYCACAAQdjJAUHHARBnCwsLA0AgASACRwRAIAQgARDVCiABQQRqIQEgBEEEaiEEDAELCyAGQQA2AgAgBCAGENUKIAUkCQsMACAAIAEoAgA2AgALDAAgABCJAiAAEL0NC9MEAQh/IwkhCiMJQTBqJAkjCSMKTgRAQTAQAQsgCkEoaiEHIAoiBkEgaiEIIAZBJGohCyAGQRxqIQwgBkEYaiENIAMoAgRBAXEEQAJAIAcgAxCtCkEAJAVBNiAHQdyGAxBPIQgjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAcQ4woFAkAgBxDjCiAHIAMQrQpBACQFQTYgB0HshgMQTyEAIwUhA0EAJAUgA0EBcQRAEGMhABAAGiAHEOMKDAELIAcQ4wogACgCACgCGCEDQQAkBSADIAYgABBaIwUhA0EAJAUgA0EBcQRAEGMhABAAGgUCQCAAKAIAKAIcIQNBACQFIAMgBkEMaiAAEFojBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAYQxg0MAQsgDSACKAIANgIAQQAkBSAHIA0oAgA2AgBBByABIAcgBiAGQRhqIgAgCCAEQQEQUyECIwUhA0EAJAUgA0EBcQRAEGMhARAAGgNAIABBdGoiABDGDSAAIAZHDQALIAEhAAwBCyAFIAIgBkY6AAAgASgCACEJA0AgAEF0aiIAEMYNIAAgBkcNAAsMBAsLCwsgABBqCwUgCEF/NgIAIAAoAgAoAhAhCSALIAEoAgA2AgAgDCACKAIANgIAIAYgCygCADYCACAHIAwoAgA2AgAgASAAIAYgByADIAQgCCAJQT9xQeAEahEhADYCAAJAAkACQAJAIAgoAgAOAgABAgsgBUEAOgAADAILIAVBAToAAAwBCyAFQQE6AAAgBEEENgIACyABKAIAIQkLIAokCSAJC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQhAshACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEIILIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCACyEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQ/wohACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEP0KIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRD3CiEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQ9QohACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEPMKIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRDuCiEAIAYkCSAAC8QLARJ/IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcABaiESIAlBoAFqIRMgCUHQAWohCCAJQcwBaiEKIAkhDiAJQcgBaiEUIAlBxAFqIRUgCUHcAWoiC0IANwIAIAtBADYCCEEAIQADQCAAQQNHBEAgAEECdCALakEANgIAIABBAWohAAwBCwsgCCADEK0KQQAkBUE2IAhB3IYDEE8hACMFIQNBACQFAkACQCADQQFxDQAgACgCACgCICEDQQAkBSADIABBkK4BQaquASATEFEaIwUhAEEAJAUgAEEBcQ0AIAgQ4wogCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiIMLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAogCCgCACAIIAwsAABBAEgbIgA2AgAgFCAONgIAIBVBADYCACAIQQRqIRYgCEEIaiEXIAEoAgAiAyEPAn8CQAJAA0ACQCADBH8gAygCDCIGIAMoAhBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhB0EAJAUgB0EBcQ0CBSAGLAAAEKYIIQYLIAYQoAgQoggEfyABQQA2AgBBACEDQQAhD0EBBUEACwVBACEDQQAhD0EBCyENAkACQCACKAIAIgZFDQAgBigCDCIHIAYoAhBGBEAgBigCACgCJCEHQQAkBSAHIAYQTiEHIwUhEEEAJAUgEEEBcQ0DBSAHLAAAEKYIIQcLIAcQoAgQoggEQCACQQA2AgAMAQUgDUUNBgsMAQsgDQR/QQAhBgwFBUEACyEGCyAKKAIAIAAgFigCACAMLAAAIgdB/wFxIAdBAEgbIgdqRgRAQQAkBUETIAggB0EBdEEAEFsjBSEAQQAkBSAAQQFxDQMgDCwAAEEASAR/IBcoAgBB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgCiAHIAgoAgAgCCAMLAAAQQBIGyIAajYCAAsgA0EMaiINKAIAIgcgA0EQaiIQKAIARgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIRFBACQFIBFBAXENAQUgBywAABCmCCEHC0EAJAVBASAHQf8BcUEQIAAgCiAVQQAgCyAOIBQgExBVIQcjBSERQQAkBSARQQFxDQAgBw0DIA0oAgAiBiAQKAIARgRAIAMoAgAoAighBkEAJAUgBiADEE4aIwUhBkEAJAUgBkEBcQ0BBSANIAZBAWo2AgAgBiwAABCmCBoLDAELCxBjIQAQAAwCCxBjIQAQAAwBCyAKKAIAIABrIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXFFBEACQCAMLAAAIQAgCCgCACEOQQAkBUEWEE0hByMFIQpBACQFIApBAXFFBEBBACQFIBIgBTYCAEEJIA4gCCAAQQBIGyAHQa/AAiASEFEhACMFIQVBACQFIAVBAXFFBEAgAEEBRwRAIARBBDYCAAsgAwR/IAMoAgwiACADKAIQRgRAIA8oAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENBAUgACwAABCmCCEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAZFDQAgBigCDCIAIAYoAhBGBEAgBigCACgCJCEAQQAkBSAAIAYQTiEAIwUhBUEAJAUgBUEBcQ0GBSAALAAAEKYIIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gCxDGDSAJJAkgAA8LCwsLEGMhABAACxoLIAgQxg0MAQsQYyEAEAAaIAgQ4woLIAsQxg0gABBqQQALDwAgACgCACABEOcKEOgKCz4BAn8gACgCACIAQQRqIgIoAgAhASACIAFBf2o2AgAgAUUEQCAAKAIAKAIIIQEgACABQf8DcUGYBmoRBQALC6cDAQN/An8CQCACIAMoAgAiCkYiC0UNACAJLQAYIABB/wFxRiIMRQRAIAktABkgAEH/AXFHDQELIAMgAkEBajYCACACQStBLSAMGzoAACAEQQA2AgBBAAwBCyAAQf8BcSAFQf8BcUYgBigCBCAGLAALIgZB/wFxIAZBAEgbQQBHcQRAQQAgCCgCACIAIAdrQaABTg0BGiAEKAIAIQEgCCAAQQRqNgIAIAAgATYCACAEQQA2AgBBAAwBCyAJQRpqIQdBACEFA38CfyAFIAlqIQYgByAFQRpGDQAaIAVBAWohBSAGLQAAIABB/wFxRw0BIAYLCyAJayIAQRdKBH9BfwUCQAJAAkAgAUEIaw4JAAIAAgICAgIBAgtBfyAAIAFODQMaDAELIABBFk4EQEF/IAsNAxpBfyAKIAJrQQNODQMaQX8gCkF/aiwAAEEwRw0DGiAEQQA2AgAgAEGQrgFqLAAAIQAgAyAKQQFqNgIAIAogADoAAEEADAMLCyAAQZCuAWosAAAhACADIApBAWo2AgAgCiAAOgAAIAQgBCgCAEEBajYCAEEACwsLNABByPQCLAAARQRAQcj0AhCHDgRAQeSGA0H/////B0GywAJBABDVCTYCAAsLQeSGAygCAAtFAQF/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCADNgIAIAEQ3QkhASAAIAIgBBCkCSEAIAEEQCABEN0JGgsgBCQJIAALgwEBBH8jCSEBIwlBMGokCSMJIwpOBEBBMBABCyABQRhqIQQgAUEQaiICQYoCNgIAIAJBADYCBCABQSBqIgMgAikCADcCACABIgIgAyAAEOsKIAAoAgBBf0cEQCADIAI2AgAgBCADNgIAIAAgBEGLAhC6DQsgACgCBEF/aiEAIAEkCSAACzQBAX8gACABEOkKBEAgACgCCCABQQJ0aigCAA8FQQQQYCICEIYOIAJB6MkBQcwBEGcLQQALKQAgACgCDCAAKAIIIgBrQQJ1IAFLBH8gAUECdCAAaigCAEEARwVBAAsLIQEBf0HohgNB6IYDKAIAIgFBAWo2AgAgACABQQFqNgIECycBAX8gASgCACEDIAEoAgQhASAAIAI2AgAgACADNgIEIAAgATYCCAsNACAAKAIAKAIAEO0KC0EBAn8gACgCBCEBIAAoAgAgACgCCCICQQF1aiEAIAJBAXEEQCABIAAoAgBqKAIAIQELIAAgAUH/A3FBmAZqEQUAC/MKAhZ/AXwjCSEJIwlB8AFqJAkjCSMKTgRAQfABEAELIAlByAFqIQwgCSEQIAlBxAFqIQ0gCUHAAWohESAJQeUBaiESIAlB5AFqIRUgCUHYAWoiCiADIAlBoAFqIhYgCUHnAWoiFyAJQeYBaiIYEO8KIAlBzAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgEkEBOgAAIBVBxQA6AAAgCEEEaiEZIAhBCGohGiABKAIAIgMhEwJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCmCCEHCyAHEKAIEKIIBH8gAUEANgIAQQAhA0EAIRNBAQVBAAsFQQAhA0EAIRNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRRBACQFIBRBAXENAwUgBiwAABCmCCEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBkoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAaKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiFCgCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQpgghBgsgFywAACEPIBgsAAAhG0EAJAVBASAGQf8BcSASIBUgACAMIA8gGyAKIBAgDSARIBYQVyEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgFCgCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQFqNgIAIAcsAAAQpggaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBtFIBIsAABFckUEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQMgACAGIAQQSyEcIwUhAEEAJAUgAEEBcUUEQAJAIAUgHDkDACANKAIAIQBBACQFQRogCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEygCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEKYIIQALIAAQoAgQoggEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQpgghAAsgABCgCBCiCARAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBDGDSAKEMYNIAkkCSAADwsLCxBjIQAQABoLCyAIEMYNIAoQxg0gABBqQQALvgIBA38jCSEHIwlBEGokCSMJIwpOBEBBEBABCyAHIgYgARCtCkEAJAVBNiAGQdyGAxBPIQEjBSEFQQAkBQJAAkAgBUEBcQ0AIAEoAgAoAiAhBUEAJAUgBSABQZCuAUGwrgEgAhBRGiMFIQFBACQFIAFBAXENAEEAJAVBNiAGQeyGAxBPIQEjBSECQQAkBSACQQFxRQRAIAEoAgAoAgwhAkEAJAUgAiABEE4hAiMFIQVBACQFIAVBAXFFBEAgAyACOgAAIAEoAgAoAhAhAkEAJAUgAiABEE4hAiMFIQNBACQFIANBAXFFBEAgBCACOgAAIAEoAgAoAhQhAkEAJAUgAiAAIAEQWiMFIQBBACQFIABBAXFFBEAgBhDjCiAHJAkPCwsLCxBjIQAQABoMAQsQYyEAEAAaCyAGEOMKIAAQagvXBAEBfyAAQf8BcSAFQf8BcUYEfyABLAAABH8gAUEAOgAAIAQgBCgCACIAQQFqNgIAIABBLjoAACAHKAIEIAcsAAsiAEH/AXEgAEEASBsEfyAJKAIAIgAgCGtBoAFIBH8gCigCACEBIAkgAEEEajYCACAAIAE2AgBBAAVBAAsFQQALBUF/CwUCfyAAQf8BcSAGQf8BcUYEQCAHKAIEIAcsAAsiBUH/AXEgBUEASBsEQEF/IAEsAABFDQIaQQAgCSgCACIAIAhrQaABTg0CGiAKKAIAIQEgCSAAQQRqNgIAIAAgATYCACAKQQA2AgBBAAwCCwsgC0EgaiEMQQAhBQN/An8gBSALaiEGIAwgBUEgRg0AGiAFQQFqIQUgBi0AACAAQf8BcUcNASAGCwsgC2siBUEfSgR/QX8FIAVBkK4BaiwAACEAAkACQAJAIAVBFmsOBAEBAAACCyAEKAIAIgEgA0cEQEF/IAFBf2osAABB3wBxIAIsAABB/wBxRw0EGgsgBCABQQFqNgIAIAEgADoAAEEADAMLIAJB0AA6AAAgBCAEKAIAIgFBAWo2AgAgASAAOgAAQQAMAgsgAEHfAHEiAyACLAAARgRAIAIgA0GAAXI6AAAgASwAAARAIAFBADoAACAHKAIEIAcsAAsiAUH/AXEgAUEASBsEQCAJKAIAIgEgCGtBoAFIBEAgCigCACECIAkgAUEEajYCACABIAI2AgALCwsLIAQgBCgCACIBQQFqNgIAIAEgADoAAEEAIAVBFUoNARogCiAKKAIAQQFqNgIAQQALCwsLoQECA38BfCMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCAAIAFGBEAgAkEENgIARAAAAAAAAAAAIQYFEIcJKAIAIQUQhwlBADYCACAAIAQQ5QoQ9QkhBhCHCSgCACIARQRAEIcJIAU2AgALAkACQCABIAQoAgBGBEAgAEEiRg0BBUQAAAAAAAAAACEGDAELDAELIAJBBDYCAAsLIAMkCSAGC6ACAQV/IABBBGoiBigCACIHIABBC2oiCCwAACIEQf8BcSIFIARBAEgbBEACQCABIAJHBEAgAiEEIAEhBQNAIAUgBEF8aiIESQRAIAUoAgAhByAFIAQoAgA2AgAgBCAHNgIAIAVBBGohBQwBCwsgCCwAACIEQf8BcSEFIAYoAgAhBwsgAkF8aiEGIAAoAgAgACAEQRh0QRh1QQBIIgIbIgAgByAFIAIbaiEFAkACQANAAkAgACwAACICQQBKIAJB/wBHcSEEIAEgBk8NACAEBEAgASgCACACRw0DCyABQQRqIQEgAEEBaiAAIAUgAGtBAUobIQAMAQsLDAELIANBBDYCAAwBCyAEBEAgBigCAEF/aiACTwRAIANBBDYCAAsLCwsL8woCFn8BfCMJIQkjCUHwAWokCSMJIwpOBEBB8AEQAQsgCUHIAWohDCAJIRAgCUHEAWohDSAJQcABaiERIAlB5QFqIRIgCUHkAWohFSAJQdgBaiIKIAMgCUGgAWoiFiAJQecBaiIXIAlB5gFqIhgQ7wogCUHMAWoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACASQQE6AAAgFUHFADoAACAIQQRqIRkgCEEIaiEaIAEoAgAiAyETAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHLAAAEKYIIQcLIAcQoAgQoggEfyABQQA2AgBBACEDQQAhE0EBBUEACwVBACEDQQAhE0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhFEEAJAUgFEEBcQ0DBSAGLAAAEKYIIQYLIAYQoAgQoggEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgGSgCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUETIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBooAgBB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiIUKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBiwAABCmCCEGCyAXLAAAIQ8gGCwAACEbQQAkBUEBIAZB/wFxIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBAWo2AgAgBywAABCmCBoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBBCAAIAYgBBBLIRwjBSEAQQAkBSAAQQFxRQRAAkAgBSAcOQMAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCATKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAsAAAQpgghAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACwAABCmCCEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAuhAQIDfwF8IwkhAyMJQRBqJAkjCSMKTgRAQRAQAQsgAyEEIAAgAUYEQCACQQQ2AgBEAAAAAAAAAAAhBgUQhwkoAgAhBRCHCUEANgIAIAAgBBDlChD0CSEGEIcJKAIAIgBFBEAQhwkgBTYCAAsCQAJAIAEgBCgCAEYEQCAAQSJGDQEFRAAAAAAAAAAAIQYMAQsMAQsgAkEENgIACwsgAyQJIAYL9AoCFn8BfSMJIQkjCUHwAWokCSMJIwpOBEBB8AEQAQsgCUHIAWohDCAJIRAgCUHEAWohDSAJQcABaiERIAlB5QFqIRIgCUHkAWohFSAJQdgBaiIKIAMgCUGgAWoiFiAJQecBaiIXIAlB5gFqIhgQ7wogCUHMAWoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACASQQE6AAAgFUHFADoAACAIQQRqIRkgCEEIaiEaIAEoAgAiAyETAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHLAAAEKYIIQcLIAcQoAgQoggEfyABQQA2AgBBACEDQQAhE0EBBUEACwVBACEDQQAhE0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhFEEAJAUgFEEBcQ0DBSAGLAAAEKYIIQYLIAYQoAgQoggEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgGSgCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUETIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBooAgBB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiIUKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBiwAABCmCCEGCyAXLAAAIQ8gGCwAACEbQQAkBUEBIAZB/wFxIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBAWo2AgAgBywAABCmCBoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBASAAIAYgBBBMtiEcIwUhAEEAJAUgAEEBcUUEQAJAIAUgHDgCACANKAIAIQBBACQFQRogCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEygCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEKYIIQALIAAQoAgQoggEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQpgghAAsgABCgCBCiCARAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBDGDSAKEMYNIAkkCSAADwsLCxBjIQAQABoLCyAIEMYNIAoQxg0gABBqQQALmQECA38BfSMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIAMhBCAAIAFGBEAgAkEENgIAQwAAAAAhBgUQhwkoAgAhBRCHCUEANgIAIAAgBBDlChDzCSEGEIcJKAIAIgBFBEAQhwkgBTYCAAsCQAJAIAEgBCgCAEYEQCAAQSJGDQEFQwAAAAAhBgwBCwwBCyACQQQ2AgALCyADJAkgBgvJCgITfwF+IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxD4CiEUIAAgAyAJQaABahD5CiEVIAlB1AFqIgogAyAJQeABaiIWEPoKIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCmCCEHCyAHEKAIEKIIBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCmCCEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQpgghBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEKYIGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEBIAAgBiAEIBQQqw8hGSMFIQBBACQFIABBAXFFBEACQCAFIBk3AwAgDSgCACEAQQAkBUEaIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACwAABCmCCEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAALAAAEKYIIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gChDGDSAJJAkgAA8LCwsQYyEAEAAaCwsgCBDGDSAKEMYNIAAQakEAC2wAAn8CQAJAAkACQCAAKAIEQcoAcQ5BAgMDAwMDAwMBAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwADC0EIDAMLQRAMAgtBAAwBC0EKCwsLACAAIAEgAhD8Cgu0AQEEfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUiBCABEK0KQQAkBUE2IARB7IYDEE8hASMFIQNBACQFIANBAXFFBEAgASgCACgCECEDQQAkBSADIAEQTiEDIwUhBkEAJAUgBkEBcUUEQCACIAM6AAAgASgCACgCFCECQQAkBSACIAAgARBaIwUhAEEAJAUgAEEBcUUEQCAEEOMKIAUkCQ8LCwsQYyEAEAAaIAQQ4wogABBqC7cBAgN/AX4jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAEIQUgACABRgRAIAJBBDYCAEIAIQcFAkAgACwAAEEtRgRAIAJBBDYCAEIAIQcMAQsQhwkoAgAhBhCHCUEANgIAIAAgBSADEOUKEOEJIQcQhwkoAgAiAEUEQBCHCSAGNgIACwJAAkAgASAFKAIARgRAIABBIkYEQEJ/IQcMAgsFQgAhBwwBCwwBCyACQQQ2AgALCwsgBCQJIAcLBgBBkK4BC8YKARN/IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxD4CiEUIAAgAyAJQaABahD5CiEVIAlB1AFqIgogAyAJQeABaiIWEPoKIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCmCCEHCyAHEKAIEKIIBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCmCCEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQpgghBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEKYIGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEKIAAgBiAEIBQQUSEAIwUhBkEAJAUgBkEBcUUEQAJAIAUgADYCACANKAIAIQBBACQFQRogCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEigCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEKYIIQALIAAQoAgQoggEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQpgghAAsgABCgCBCiCARAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBDGDSAKEMYNIAkkCSAADwsLCxBjIQAQABoLCyAIEMYNIAoQxg0gABBqQQALugECA38BfiMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSAAIAFGBH8gAkEENgIAQQAFAn8gACwAAEEtRgRAIAJBBDYCAEEADAELEIcJKAIAIQYQhwlBADYCACAAIAUgAxDlChDhCSEHEIcJKAIAIgBFBEAQhwkgBjYCAAsgASAFKAIARgR/IABBIkYgB0L/////D1ZyBH8gAkEENgIAQX8FIAenCwUgAkEENgIAQQALCwshACAEJAkgAAvGCgETfyMJIQkjCUHwAWokCSMJIwpOBEBB8AEQAQsgCUHEAWohDCAJIRAgCUHAAWohDSAJQbwBaiERIAMQ+AohFCAAIAMgCUGgAWoQ+QohFSAJQdQBaiIKIAMgCUHgAWoiFhD6CiAJQcgBaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIAhBBGohFyAIQQhqIRggASgCACIDIRICQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcsAAAQpgghBwsgBxCgCBCiCAR/IAFBADYCAEEAIRJBACEDQQEFQQALBUEAIRJBACEDQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSETQQAkBSATQQFxDQMFIAYsAAAQpgghBgsgBhCgCBCiCARAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAXKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRMgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGCgCAEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhMoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGLAAAEKYIIQYLIBYsAAAhD0EAJAVBASAGQf8BcSAUIAAgDCARIA8gCiAQIA0gFRBVIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByATKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBAWo2AgAgBywAABCmCBoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIGwRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBCyAAIAYgBCAUEFEhACMFIQZBACQFIAZBAXFFBEACQCAFIAA2AgAgDSgCACEAQQAkBUEaIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACwAABCmCCEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAALAAAEKYIIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gChDGDSAJJAkgAA8LCwsQYyEAEAAaCwsgCBDGDSAKEMYNIAAQakEAC8YKARN/IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxD4CiEUIAAgAyAJQaABahD5CiEVIAlB1AFqIgogAyAJQeABaiIWEPoKIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCmCCEHCyAHEKAIEKIIBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCmCCEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQpgghBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEKYIGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEMIAAgBiAEIBQQUSEAIwUhBkEAJAUgBkEBcUUEQAJAIAUgADsBACANKAIAIQBBACQFQRogCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEigCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAALAAAEKYIIQALIAAQoAgQoggEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAsAAAQpgghAAsgABCgCBCiCARAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBDGDSAKEMYNIAkkCSAADwsLCxBjIQAQABoLCyAIEMYNIAoQxg0gABBqQQALvQECA38BfiMJIQQjCUEQaiQJIwkjCk4EQEEQEAELIAQhBSAAIAFGBH8gAkEENgIAQQAFAn8gACwAAEEtRgRAIAJBBDYCAEEADAELEIcJKAIAIQYQhwlBADYCACAAIAUgAxDlChDhCSEHEIcJKAIAIgBFBEAQhwkgBjYCAAsgASAFKAIARgR/IABBIkYgB0L//wNWcgR/IAJBBDYCAEF/BSAHp0H//wNxCwUgAkEENgIAQQALCwshACAEJAkgAAvJCgITfwF+IwkhCSMJQfABaiQJIwkjCk4EQEHwARABCyAJQcQBaiEMIAkhECAJQcABaiENIAlBvAFqIREgAxD4CiEUIAAgAyAJQaABahD5CiEVIAlB1AFqIgogAyAJQeABaiIWEPoKIAlByAFqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBywAABCmCCEHCyAHEKAIEKIIBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBiwAABCmCCEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYsAAAQpgghBgsgFiwAACEPQQAkBUEBIAZB/wFxIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EBajYCACAHLAAAEKYIGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUECIAAgBiAEIBQQqw8hGSMFIQBBACQFIABBAXFFBEACQCAFIBk3AwAgDSgCACEAQQAkBUEaIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACwAABCmCCEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAALAAAEKYIIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gChDGDSAJJAkgAA8LCwsQYyEAEAAaCwsgCBDGDSAKEMYNIAAQakEAC7EBAgN/AX4jCSEEIwlBEGokCSMJIwpOBEBBEBABCyAEIQUgACABRgRAIAJBBDYCAEIAIQcFEIcJKAIAIQYQhwlBADYCACAAIAUgAxDlChDiCSEHEIcJKAIAIgBFBEAQhwkgBjYCAAsgASAFKAIARgRAIABBIkYEQCACQQQ2AgBC////////////AEKAgICAgICAgIB/IAdCAFUbIQcLBSACQQQ2AgBCACEHCwsgBCQJIAcLxgoBE38jCSEJIwlB8AFqJAkjCSMKTgRAQfABEAELIAlBxAFqIQwgCSEQIAlBwAFqIQ0gCUG8AWohESADEPgKIRQgACADIAlBoAFqEPkKIRUgCUHUAWoiCiADIAlB4AFqIhYQ+gogCUHIAWoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACAIQQRqIRcgCEEIaiEYIAEoAgAiAyESAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHLAAAEKYIIQcLIAcQoAgQoggEfyABQQA2AgBBACESQQAhA0EBBUEACwVBACESQQAhA0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhE0EAJAUgE0EBcQ0DBSAGLAAAEKYIIQYLIAYQoAgQoggEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgFygCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUETIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBgoAgBB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiITKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBiwAABCmCCEGCyAWLAAAIQ9BACQFQQEgBkH/AXEgFCAAIAwgESAPIAogECANIBUQVSEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgEygCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQFqNgIAIAcsAAAQpggaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBsEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQ0gACAGIAQgFBBRIQAjBSEGQQAkBSAGQQFxRQRAAkAgBSAANgIAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAsAAAQpgghAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACwAABCmCCEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAvfAQIDfwF+IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCEFIAAgAUYEfyACQQQ2AgBBAAUQhwkoAgAhBhCHCUEANgIAIAAgBSADEOUKEOIJIQcQhwkoAgAiAEUEQBCHCSAGNgIACyABIAUoAgBGBH8CfyAAQSJGBEAgAkEENgIAQf////8HIAdCAFUNARoFAkAgB0KAgICAeFMEQCACQQQ2AgAMAQsgB6cgB0L/////B1cNAhogAkEENgIAQf////8HDAILC0GAgICAeAsFIAJBBDYCAEEACwshACAEJAkgAAv9CgEOfyMJIRMjCUHwAGokCSMJIwpOBEBB8AAQAQsgEyEMAkACQCADIAJrQQxtIghB5ABLBEAgCBCACiIMBEAgDCEODAIFQQAkBUEEEFhBACQFEGMhABAAGgsFQQAhDgwBCwwBCyACIQcgDCEJQQAhCwNAIAMgB0cEQCAHLAALIgpBAEgEfyAHKAIEBSAKQf8BcQsEQCAJQQE6AAAFIAlBAjoAACALQQFqIQsgCEF/aiEICyAHQQxqIQcgCUEBaiEJDAELC0EAIRAgCyEJIAghCwJAAkACQAJAAkADQAJAIAAoAgAiCAR/IAgoAgwiByAIKAIQRgRAIAgoAgAoAiQhB0EAJAUgByAIEE4hCCMFIQdBACQFIAdBAXENBAUgBywAABCmCCEICyAIEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshCiABKAIAIggEfyAIKAIMIgcgCCgCEEYEQCAIKAIAKAIkIQdBACQFIAcgCBBOIQcjBSENQQAkBSANQQFxDQQFIAcsAAAQpgghBwsgBxCgCBCiCAR/IAFBADYCAEEAIQhBAQVBAAsFQQAhCEEBCyENIAAoAgAhByAKIA1zIAtBAEdxRQ0AIAcoAgwiCCAHKAIQRgRAIAcoAgAoAiQhCEEAJAUgCCAHEE4hCCMFIQdBACQFIAdBAXENBAUgCCwAABCmCCEICyAIQf8BcSENIAZFBEAgBCgCACgCDCEIQQAkBSAIIAQgDRBPIQ0jBSEIQQAkBSAIQQFxDQQLIBBBAWohESACIQpBACEHIAwhDyAJIQgDQCADIApHBEAgDywAAEEBRgRAAkAgCkELaiIULAAAQQBIBH8gCigCAAUgCgsgEGosAAAhCSAGRQRAIAQoAgAoAgwhEkEAJAUgEiAEIAkQTyEJIwUhEkEAJAUgEkEBcQ0JCyANQf8BcSAJQf8BcUcEQCAPQQA6AAAgC0F/aiELDAELIBQsAAAiB0EASAR/IAooAgQFIAdB/wFxCyARRgR/IA9BAjoAACAIQQFqIQggC0F/aiELQQEFQQELIQcLCyAKQQxqIQogD0EBaiEPDAELCyAHBEACQCAAKAIAIgdBDGoiCigCACIJIAcoAhBGBEAgBygCACgCKCEJQQAkBSAJIAcQThojBSEHQQAkBSAHQQFxDQgFIAogCUEBajYCACAJLAAAEKYIGgsgCCALakEBSwRAIAIhByAMIQkDQCADIAdGDQIgCSwAAEECRgRAIAcsAAsiCkEASAR/IAcoAgQFIApB/wFxCyARRwRAIAlBADoAACAIQX9qIQgLCyAHQQxqIQcgCUEBaiEJDAAACwALCwsgESEQIAghCQwBCwsCQAJAIAcEQAJAIAcoAgwiBCAHKAIQRgRAIAcoAgAoAiQhBEEAJAUgBCAHEE4hBCMFIQZBACQFIAZBAXENAQUgBCwAABCmCCEECyAEEKAIEKIIBEAgAEEANgIAQQEhBAwDBSAAKAIARSEEDAMLAAsFQQEhBAwBCwwBCwJAAkACQCAIRQ0AIAgoAgwiACAIKAIQRgRAIAgoAgAoAiQhAEEAJAUgACAIEE4hACMFIQZBACQFIAZBAXENBAUgACwAABCmCCEACyAAEKAIEKIIBEAgAUEANgIADAEFIARFDQILDAILIAQNAAwBCyAFIAUoAgBBAnI2AgALAkACQANAIAIgA0YNASAMLAAAQQJHBEAgAkEMaiECIAxBAWohDAwBCwsMAQsgBSAFKAIAQQRyNgIAIAMhAgsgDgRAIA4QgQoLIBMkCSACDwsQYyEAEAAaDAQLEGMhABAAGgwDCxBjIQAQABoMAgsQYyEAEAAaDAELEGMhABAAGgsgDgRAIA4QgQoLCyAAEGpBAAvTBAEIfyMJIQojCUEwaiQJIwkjCk4EQEEwEAELIApBKGohByAKIgZBIGohCCAGQSRqIQsgBkEcaiEMIAZBGGohDSADKAIEQQFxBEACQCAHIAMQrQpBACQFQTYgB0H8hgMQTyEIIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAHEOMKBQJAIAcQ4wogByADEK0KQQAkBUE2IAdBhIcDEE8hACMFIQNBACQFIANBAXEEQBBjIQAQABogBxDjCgwBCyAHEOMKIAAoAgAoAhghA0EAJAUgAyAGIAAQWiMFIQNBACQFIANBAXEEQBBjIQAQABoFAkAgACgCACgCHCEDQQAkBSADIAZBDGogABBaIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAGEMYNDAELIA0gAigCADYCAEEAJAUgByANKAIANgIAQQggASAHIAYgBkEYaiIAIAggBEEBEFMhAiMFIQNBACQFIANBAXEEQBBjIQEQABoDQCAAQXRqIgAQxg0gACAGRw0ACyABIQAMAQsgBSACIAZGOgAAIAEoAgAhCQNAIABBdGoiABDGDSAAIAZHDQALDAQLCwsLIAAQagsFIAhBfzYCACAAKAIAKAIQIQkgCyABKAIANgIAIAwgAigCADYCACAGIAsoAgA2AgAgByAMKAIANgIAIAEgACAGIAcgAyAEIAggCUE/cUHgBGoRIQA2AgACQAJAAkACQCAIKAIADgIAAQILIAVBADoAAAwCCyAFQQE6AAAMAQsgBUEBOgAAIARBBDYCAAsgASgCACEJCyAKJAkgCQtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEKALIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCfCyEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQngshACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEJ0LIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCcCyEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQmAshACAGJAkgAAtpAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFEJcLIQAgBiQJIAALaQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIAZBBGoiByABKAIANgIAIAYgAigCADYCACAGQQhqIgEgBygCADYCACAGQQxqIgIgBigCADYCACAAIAEgAiADIAQgBRCWCyEAIAYkCSAAC2kBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAUQkwshACAGJAkgAAvACwESfyMJIQkjCUGwAmokCSMJIwpOBEBBsAIQAQsgCUGIAmohEiAJQaABaiETIAlBmAJqIQggCUGUAmohCiAJIQ4gCUGQAmohFCAJQYwCaiEVIAlBpAJqIgtCADcCACALQQA2AghBACEAA0AgAEEDRwRAIABBAnQgC2pBADYCACAAQQFqIQAMAQsLIAggAxCtCkEAJAVBNiAIQfyGAxBPIQAjBSEDQQAkBQJAAkAgA0EBcQ0AIAAoAgAoAjAhA0EAJAUgAyAAQZCuAUGqrgEgExBRGiMFIQBBACQFIABBAXENACAIEOMKIAhCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiDCwAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAKIAgoAgAgCCAMLAAAQQBIGyIANgIAIBQgDjYCACAVQQA2AgAgCEEEaiEWIAhBCGohFyABKAIAIgMhDwJ/AkACQANAAkAgAwR/IAMoAgwiBiADKAIQRgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQdBACQFIAdBAXENAgUgBigCABDqASEGCyAGEKAIEKIIBH8gAUEANgIAQQAhA0EAIQ9BAQVBAAsFQQAhA0EAIQ9BAQshDQJAAkAgAigCACIGRQ0AIAYoAgwiByAGKAIQRgRAIAYoAgAoAiQhB0EAJAUgByAGEE4hByMFIRBBACQFIBBBAXENAwUgBygCABDqASEHCyAHEKAIEKIIBEAgAkEANgIADAEFIA1FDQYLDAELIA0Ef0EAIQYMBQVBAAshBgsgCigCACAAIBYoAgAgDCwAACIHQf8BcSAHQQBIGyIHakYEQEEAJAVBEyAIIAdBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAwsAABBAEgEfyAXKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAogByAIKAIAIAggDCwAAEEASBsiAGo2AgALIANBDGoiDSgCACIHIANBEGoiECgCAEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSERQQAkBSARQQFxDQEFIAcoAgAQ6gEhBwtBACQFQQIgB0EQIAAgCiAVQQAgCyAOIBQgExBVIQcjBSERQQAkBSARQQFxDQAgBw0DIA0oAgAiBiAQKAIARgRAIAMoAgAoAighBkEAJAUgBiADEE4aIwUhBkEAJAUgBkEBcQ0BBSANIAZBBGo2AgAgBigCABDqARoLDAELCxBjIQAQAAwCCxBjIQAQAAwBCyAKKAIAIABrIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXFFBEACQCAMLAAAIQAgCCgCACEOQQAkBUEWEE0hByMFIQpBACQFIApBAXFFBEBBACQFIBIgBTYCAEEJIA4gCCAAQQBIGyAHQa/AAiASEFEhACMFIQVBACQFIAVBAXFFBEAgAEEBRwRAIARBBDYCAAsgAwR/IAMoAgwiACADKAIQRgRAIA8oAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENBAUgACgCABDqASEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAZFDQAgBigCDCIAIAYoAhBGBEAgBigCACgCJCEAQQAkBSAAIAYQTiEAIwUhBUEAJAUgBUEBcQ0GBSAAKAIAEOoBIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gCxDGDSAJJAkgAA8LCwsLEGMhABAACxoLIAgQxg0MAQsQYyEAEAAaIAgQ4woLIAsQxg0gABBqQQALoAMBA38CfwJAIAIgAygCACIKRiILRQ0AIAAgCSgCYEYiDEUEQCAJKAJkIABHDQELIAMgAkEBajYCACACQStBLSAMGzoAACAEQQA2AgBBAAwBCyAAIAVGIAYoAgQgBiwACyIGQf8BcSAGQQBIG0EAR3EEQEEAIAgoAgAiACAHa0GgAU4NARogBCgCACEBIAggAEEEajYCACAAIAE2AgAgBEEANgIAQQAMAQsgCUHoAGohB0EAIQUDfwJ/IAVBAnQgCWohBiAHIAVBGkYNABogBUEBaiEFIAYoAgAgAEcNASAGCwsgCWsiBUECdSEAIAVB3ABKBH9BfwUCQAJAAkAgAUEIaw4JAAIAAgICAgIBAgtBfyAAIAFODQMaDAELIAVB2ABOBEBBfyALDQMaQX8gCiACa0EDTg0DGkF/IApBf2osAABBMEcNAxogBEEANgIAIABBkK4BaiwAACEAIAMgCkEBajYCACAKIAA6AABBAAwDCwsgAEGQrgFqLAAAIQAgAyAKQQFqNgIAIAogADoAACAEIAQoAgBBAWo2AgBBAAsLC+8KAhZ/AXwjCSEJIwlB0AJqJAkjCSMKTgRAQdACEAELIAlBqAJqIQwgCSEQIAlBpAJqIQ0gCUGgAmohESAJQc0CaiESIAlBzAJqIRUgCUG4AmoiCiADIAlBoAFqIhYgCUHIAmoiFyAJQcQCaiIYEJQLIAlBrAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgEkEBOgAAIBVBxQA6AAAgCEEEaiEZIAhBCGohGiABKAIAIgMhEwJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABDqASEHCyAHEKAIEKIIBH8gAUEANgIAQQAhA0EAIRNBAQVBAAsFQQAhA0EAIRNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRRBACQFIBRBAXENAwUgBigCABDqASEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBkoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAaKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiFCgCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQ6gEhBgsgFygCACEPIBgoAgAhG0EAJAVBAiAGIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABDqARoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBAyAAIAYgBBBLIRwjBSEAQQAkBSAAQQFxRQRAAkAgBSAcOQMAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCATKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQ6gEhAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAu+AgEDfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAciBiABEK0KQQAkBUE2IAZB/IYDEE8hASMFIQVBACQFAkACQCAFQQFxDQAgASgCACgCMCEFQQAkBSAFIAFBkK4BQbCuASACEFEaIwUhAUEAJAUgAUEBcQ0AQQAkBUE2IAZBhIcDEE8hASMFIQJBACQFIAJBAXFFBEAgASgCACgCDCECQQAkBSACIAEQTiECIwUhBUEAJAUgBUEBcUUEQCADIAI2AgAgASgCACgCECECQQAkBSACIAEQTiECIwUhA0EAJAUgA0EBcUUEQCAEIAI2AgAgASgCACgCFCECQQAkBSACIAAgARBaIwUhAEEAJAUgAEEBcUUEQCAGEOMKIAckCQ8LCwsLEGMhABAAGgwBCxBjIQAQABoLIAYQ4wogABBqC8QEAQF/IAAgBUYEfyABLAAABH8gAUEAOgAAIAQgBCgCACIAQQFqNgIAIABBLjoAACAHKAIEIAcsAAsiAEH/AXEgAEEASBsEfyAJKAIAIgAgCGtBoAFIBH8gCigCACEBIAkgAEEEajYCACAAIAE2AgBBAAVBAAsFQQALBUF/CwUCfyAAIAZGBEAgBygCBCAHLAALIgVB/wFxIAVBAEgbBEBBfyABLAAARQ0CGkEAIAkoAgAiACAIa0GgAU4NAhogCigCACEBIAkgAEEEajYCACAAIAE2AgAgCkEANgIAQQAMAgsLIAtBgAFqIQxBACEFA38CfyAFQQJ0IAtqIQYgDCAFQSBGDQAaIAVBAWohBSAGKAIAIABHDQEgBgsLIAtrIgBB/ABKBH9BfwUgAEECdUGQrgFqLAAAIQUCQAJAAkACQCAAQah/aiIGQQJ2IAZBHnRyDgQBAQAAAgsgBCgCACIAIANHBEBBfyAAQX9qLAAAQd8AcSACLAAAQf8AcUcNBRoLIAQgAEEBajYCACAAIAU6AABBAAwECyACQdAAOgAADAELIAVB3wBxIgMgAiwAAEYEQCACIANBgAFyOgAAIAEsAAAEQCABQQA6AAAgBygCBCAHLAALIgFB/wFxIAFBAEgbBEAgCSgCACIBIAhrQaABSARAIAooAgAhAiAJIAFBBGo2AgAgASACNgIACwsLCwsgBCAEKAIAIgFBAWo2AgAgASAFOgAAIABB1ABKBH9BAAUgCiAKKAIAQQFqNgIAQQALCwsLC+8KAhZ/AXwjCSEJIwlB0AJqJAkjCSMKTgRAQdACEAELIAlBqAJqIQwgCSEQIAlBpAJqIQ0gCUGgAmohESAJQc0CaiESIAlBzAJqIRUgCUG4AmoiCiADIAlBoAFqIhYgCUHIAmoiFyAJQcQCaiIYEJQLIAlBrAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgEkEBOgAAIBVBxQA6AAAgCEEEaiEZIAhBCGohGiABKAIAIgMhEwJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABDqASEHCyAHEKAIEKIIBH8gAUEANgIAQQAhA0EAIRNBAQVBAAsFQQAhA0EAIRNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRRBACQFIBRBAXENAwUgBigCABDqASEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBkoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAaKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiFCgCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQ6gEhBgsgFygCACEPIBgoAgAhG0EAJAVBAiAGIBIgFSAAIAwgDyAbIAogECANIBEgFhBXIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByAUKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABDqARoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIG0UgEiwAAEVyRQRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBBCAAIAYgBBBLIRwjBSEAQQAkBSAAQQFxRQRAAkAgBSAcOQMAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCATKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQ6gEhAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAvwCgIWfwF9IwkhCSMJQdACaiQJIwkjCk4EQEHQAhABCyAJQagCaiEMIAkhECAJQaQCaiENIAlBoAJqIREgCUHNAmohEiAJQcwCaiEVIAlBuAJqIgogAyAJQaABaiIWIAlByAJqIhcgCUHEAmoiGBCUCyAJQawCaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIBJBAToAACAVQcUAOgAAIAhBBGohGSAIQQhqIRogASgCACIDIRMCQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcoAgAQ6gEhBwsgBxCgCBCiCAR/IAFBADYCAEEAIQNBACETQQEFQQALBUEAIQNBACETQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSEUQQAkBSAUQQFxDQMFIAYoAgAQ6gEhBgsgBhCgCBCiCARAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAZKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRMgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGigCAEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhQoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGKAIAEOoBIQYLIBcoAgAhDyAYKAIAIRtBACQFQQIgBiASIBUgACAMIA8gGyAKIBAgDSARIBYQVyEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgFCgCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQRqNgIAIAcoAgAQ6gEaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBtFIBIsAABFckUEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQEgACAGIAQQTLYhHCMFIQBBACQFIABBAXFFBEACQCAFIBw4AgAgDSgCACEAQQAkBUEaIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBMoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACgCABDqASEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAAKAIAEOoBIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gChDGDSAJJAkgAA8LCwsQYyEAEAAaCwsgCBDGDSAKEMYNIAAQakEAC8UKAhN/AX4jCSEJIwlBsAJqJAkjCSMKTgRAQbACEAELIAlBkAJqIQwgCSEQIAlBjAJqIQ0gCUGIAmohESADEPgKIRQgACADIAlBoAFqEJkLIRUgCUGgAmoiCiADIAlBrAJqIhYQmgsgCUGUAmoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACAIQQRqIRcgCEEIaiEYIAEoAgAiAyESAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHKAIAEOoBIQcLIAcQoAgQoggEfyABQQA2AgBBACESQQAhA0EBBUEACwVBACESQQAhA0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhE0EAJAUgE0EBcQ0DBSAGKAIAEOoBIQYLIAYQoAgQoggEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgFygCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUETIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBgoAgBB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiITKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBigCABDqASEGCyAWKAIAIQ9BACQFQQIgBiAUIAAgDCARIA8gCiAQIA0gFRBVIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByATKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABDqARoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIGwRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBASAAIAYgBCAUEKsPIRkjBSEAQQAkBSAAQQFxRQRAAkAgBSAZNwMAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQ6gEhAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAsLACAAIAEgAhCbCwu0AQEEfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUiBCABEK0KQQAkBUE2IARBhIcDEE8hASMFIQNBACQFIANBAXFFBEAgASgCACgCECEDQQAkBSADIAEQTiEDIwUhBkEAJAUgBkEBcUUEQCACIAM2AgAgASgCACgCFCECQQAkBSACIAAgARBaIwUhAEEAJAUgAEEBcUUEQCAEEOMKIAUkCQ8LCwsQYyEAEAAaIAQQ4wogABBqC5MBAQJ/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCIAIAEQrQpBACQFQTYgAEH8hgMQTyEBIwUhA0EAJAUgA0EBcUUEQCABKAIAKAIwIQNBACQFIAMgAUGQrgFBqq4BIAIQURojBSEBQQAkBSABQQFxRQRAIAAQ4wogBCQJIAIPCwsQYyEBEAAaIAAQ4wogARBqQQALwgoBE38jCSEJIwlBsAJqJAkjCSMKTgRAQbACEAELIAlBkAJqIQwgCSEQIAlBjAJqIQ0gCUGIAmohESADEPgKIRQgACADIAlBoAFqEJkLIRUgCUGgAmoiCiADIAlBrAJqIhYQmgsgCUGUAmoiCEIANwIAIAhBADYCCEEAIQADQCAAQQNHBEAgAEECdCAIakEANgIAIABBAWohAAwBCwsgCEELaiILLAAAQQBIBH8gCCgCCEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXEEQBBjIQAQABoFIAwgCCgCACAIIAssAABBAEgbIgA2AgAgDSAQNgIAIBFBADYCACAIQQRqIRcgCEEIaiEYIAEoAgAiAyESAkACQAJAA0ACQCADBH8gAygCDCIHIAMoAhBGBEAgAygCACgCJCEHQQAkBSAHIAMQTiEHIwUhBkEAJAUgBkEBcQ0CBSAHKAIAEOoBIQcLIAcQoAgQoggEfyABQQA2AgBBACESQQAhA0EBBUEACwVBACESQQAhA0EBCyEOAkACQCACKAIAIgdFDQAgBygCDCIGIAcoAhBGBEAgBygCACgCJCEGQQAkBSAGIAcQTiEGIwUhE0EAJAUgE0EBcQ0DBSAGKAIAEOoBIQYLIAYQoAgQoggEQCACQQA2AgAMAQUgDkUNBgsMAQsgDgR/QQAhBwwFBUEACyEHCyAMKAIAIAAgFygCACALLAAAIgZB/wFxIAZBAEgbIgZqRgRAQQAkBUETIAggBkEBdEEAEFsjBSEAQQAkBSAAQQFxDQMgCywAAEEASAR/IBgoAgBB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxDQMgDCAGIAgoAgAgCCALLAAAQQBIGyIAajYCAAsgA0EMaiIOKAIAIgYgA0EQaiITKAIARgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hBiMFIQ9BACQFIA9BAXENAQUgBigCABDqASEGCyAWKAIAIQ9BACQFQQIgBiAUIAAgDCARIA8gCiAQIA0gFRBVIQYjBSEPQQAkBSAPQQFxDQAgBg0DIA4oAgAiByATKAIARgRAIAMoAgAoAighB0EAJAUgByADEE4aIwUhB0EAJAUgB0EBcQ0BBSAOIAdBBGo2AgAgBygCABDqARoLDAELCxBjIQAQABoMAgsQYyEAEAAaDAELIAooAgQgCiwACyIGQf8BcSAGQQBIGwRAIA0oAgAiBiAQa0GgAUgEQCARKAIAIQsgDSAGQQRqNgIAIAYgCzYCAAsLIAwoAgAhBkEAJAVBCiAAIAYgBCAUEFEhACMFIQZBACQFIAZBAXFFBEACQCAFIAA2AgAgDSgCACEAQQAkBUEaIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACgCABDqASEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAAKAIAEOoBIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gChDGDSAJJAkgAA8LCwsQYyEAEAAaCwsgCBDGDSAKEMYNIAAQakEAC8IKARN/IwkhCSMJQbACaiQJIwkjCk4EQEGwAhABCyAJQZACaiEMIAkhECAJQYwCaiENIAlBiAJqIREgAxD4CiEUIAAgAyAJQaABahCZCyEVIAlBoAJqIgogAyAJQawCaiIWEJoLIAlBlAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABDqASEHCyAHEKAIEKIIBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBigCABDqASEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQ6gEhBgsgFigCACEPQQAkBUECIAYgFCAAIAwgESAPIAogECANIBUQVSEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgEygCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQRqNgIAIAcoAgAQ6gEaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBsEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQsgACAGIAQgFBBRIQAjBSEGQQAkBSAGQQFxRQRAAkAgBSAANgIAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQ6gEhAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAvCCgETfyMJIQkjCUGwAmokCSMJIwpOBEBBsAIQAQsgCUGQAmohDCAJIRAgCUGMAmohDSAJQYgCaiERIAMQ+AohFCAAIAMgCUGgAWoQmQshFSAJQaACaiIKIAMgCUGsAmoiFhCaCyAJQZQCaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIAhBBGohFyAIQQhqIRggASgCACIDIRICQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcoAgAQ6gEhBwsgBxCgCBCiCAR/IAFBADYCAEEAIRJBACEDQQEFQQALBUEAIRJBACEDQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSETQQAkBSATQQFxDQMFIAYoAgAQ6gEhBgsgBhCgCBCiCARAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAXKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRMgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGCgCAEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhMoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGKAIAEOoBIQYLIBYoAgAhD0EAJAVBAiAGIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EEajYCACAHKAIAEOoBGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUEMIAAgBiAEIBQQUSEAIwUhBkEAJAUgBkEBcUUEQAJAIAUgADsBACANKAIAIQBBACQFQRogCiAQIAAgBBBcIwUhAEEAJAUgAEEBcUUEQCADBH8gAygCDCIAIAMoAhBGBEAgEigCACgCJCEAQQAkBSAAIAMQTiEAIwUhA0EAJAUgA0EBcQ0DBSAAKAIAEOoBIQALIAAQoAgQoggEfyABQQA2AgBBAQVBAAsFQQELIQMCQAJAAkAgB0UNACAHKAIMIgAgBygCEEYEQCAHKAIAKAIkIQBBACQFIAAgBxBOIQAjBSEFQQAkBSAFQQFxDQUFIAAoAgAQ6gEhAAsgABCgCBCiCARAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBCAEKAIAQQJyNgIACyABKAIAIQAgCBDGDSAKEMYNIAkkCSAADwsLCxBjIQAQABoLCyAIEMYNIAoQxg0gABBqQQALxQoCE38BfiMJIQkjCUGwAmokCSMJIwpOBEBBsAIQAQsgCUGQAmohDCAJIRAgCUGMAmohDSAJQYgCaiERIAMQ+AohFCAAIAMgCUGgAWoQmQshFSAJQaACaiIKIAMgCUGsAmoiFhCaCyAJQZQCaiIIQgA3AgAgCEEANgIIQQAhAANAIABBA0cEQCAAQQJ0IAhqQQA2AgAgAEEBaiEADAELCyAIQQtqIgssAABBAEgEfyAIKAIIQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgDCAIKAIAIAggCywAAEEASBsiADYCACANIBA2AgAgEUEANgIAIAhBBGohFyAIQQhqIRggASgCACIDIRICQAJAAkADQAJAIAMEfyADKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQcjBSEGQQAkBSAGQQFxDQIFIAcoAgAQ6gEhBwsgBxCgCBCiCAR/IAFBADYCAEEAIRJBACEDQQEFQQALBUEAIRJBACEDQQELIQ4CQAJAIAIoAgAiB0UNACAHKAIMIgYgBygCEEYEQCAHKAIAKAIkIQZBACQFIAYgBxBOIQYjBSETQQAkBSATQQFxDQMFIAYoAgAQ6gEhBgsgBhCgCBCiCARAIAJBADYCAAwBBSAORQ0GCwwBCyAOBH9BACEHDAUFQQALIQcLIAwoAgAgACAXKAIAIAssAAAiBkH/AXEgBkEASBsiBmpGBEBBACQFQRMgCCAGQQF0QQAQWyMFIQBBACQFIABBAXENAyALLAAAQQBIBH8gGCgCAEH/////B3FBf2oFQQoLIQBBACQFQRMgCCAAQQAQWyMFIQBBACQFIABBAXENAyAMIAYgCCgCACAIIAssAABBAEgbIgBqNgIACyADQQxqIg4oAgAiBiADQRBqIhMoAgBGBEAgAygCACgCJCEGQQAkBSAGIAMQTiEGIwUhD0EAJAUgD0EBcQ0BBSAGKAIAEOoBIQYLIBYoAgAhD0EAJAVBAiAGIBQgACAMIBEgDyAKIBAgDSAVEFUhBiMFIQ9BACQFIA9BAXENACAGDQMgDigCACIHIBMoAgBGBEAgAygCACgCKCEHQQAkBSAHIAMQThojBSEHQQAkBSAHQQFxDQEFIA4gB0EEajYCACAHKAIAEOoBGgsMAQsLEGMhABAAGgwCCxBjIQAQABoMAQsgCigCBCAKLAALIgZB/wFxIAZBAEgbBEAgDSgCACIGIBBrQaABSARAIBEoAgAhCyANIAZBBGo2AgAgBiALNgIACwsgDCgCACEGQQAkBUECIAAgBiAEIBQQqw8hGSMFIQBBACQFIABBAXFFBEACQCAFIBk3AwAgDSgCACEAQQAkBUEaIAogECAAIAQQXCMFIQBBACQFIABBAXFFBEAgAwR/IAMoAgwiACADKAIQRgRAIBIoAgAoAiQhAEEAJAUgACADEE4hACMFIQNBACQFIANBAXENAwUgACgCABDqASEACyAAEKAIEKIIBH8gAUEANgIAQQEFQQALBUEBCyEDAkACQAJAIAdFDQAgBygCDCIAIAcoAhBGBEAgBygCACgCJCEAQQAkBSAAIAcQTiEAIwUhBUEAJAUgBUEBcQ0FBSAAKAIAEOoBIQALIAAQoAgQoggEQCACQQA2AgAMAQUgA0UNAgsMAgsgAw0ADAELIAQgBCgCAEECcjYCAAsgASgCACEAIAgQxg0gChDGDSAJJAkgAA8LCwsQYyEAEAAaCwsgCBDGDSAKEMYNIAAQakEAC8IKARN/IwkhCSMJQbACaiQJIwkjCk4EQEGwAhABCyAJQZACaiEMIAkhECAJQYwCaiENIAlBiAJqIREgAxD4CiEUIAAgAyAJQaABahCZCyEVIAlBoAJqIgogAyAJQawCaiIWEJoLIAlBlAJqIghCADcCACAIQQA2AghBACEAA0AgAEEDRwRAIABBAnQgCGpBADYCACAAQQFqIQAMAQsLIAhBC2oiCywAAEEASAR/IAgoAghB/////wdxQX9qBUEKCyEAQQAkBUETIAggAEEAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaBSAMIAgoAgAgCCALLAAAQQBIGyIANgIAIA0gEDYCACARQQA2AgAgCEEEaiEXIAhBCGohGCABKAIAIgMhEgJAAkACQANAAkAgAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hByMFIQZBACQFIAZBAXENAgUgBygCABDqASEHCyAHEKAIEKIIBH8gAUEANgIAQQAhEkEAIQNBAQVBAAsFQQAhEkEAIQNBAQshDgJAAkAgAigCACIHRQ0AIAcoAgwiBiAHKAIQRgRAIAcoAgAoAiQhBkEAJAUgBiAHEE4hBiMFIRNBACQFIBNBAXENAwUgBigCABDqASEGCyAGEKAIEKIIBEAgAkEANgIADAEFIA5FDQYLDAELIA4Ef0EAIQcMBQVBAAshBwsgDCgCACAAIBcoAgAgCywAACIGQf8BcSAGQQBIGyIGakYEQEEAJAVBEyAIIAZBAXRBABBbIwUhAEEAJAUgAEEBcQ0DIAssAABBAEgEfyAYKAIAQf////8HcUF/agVBCgshAEEAJAVBEyAIIABBABBbIwUhAEEAJAUgAEEBcQ0DIAwgBiAIKAIAIAggCywAAEEASBsiAGo2AgALIANBDGoiDigCACIGIANBEGoiEygCAEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQYjBSEPQQAkBSAPQQFxDQEFIAYoAgAQ6gEhBgsgFigCACEPQQAkBUECIAYgFCAAIAwgESAPIAogECANIBUQVSEGIwUhD0EAJAUgD0EBcQ0AIAYNAyAOKAIAIgcgEygCAEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQdBACQFIAdBAXENAQUgDiAHQQRqNgIAIAcoAgAQ6gEaCwwBCwsQYyEAEAAaDAILEGMhABAAGgwBCyAKKAIEIAosAAsiBkH/AXEgBkEASBsEQCANKAIAIgYgEGtBoAFIBEAgESgCACELIA0gBkEEajYCACAGIAs2AgALCyAMKAIAIQZBACQFQQ0gACAGIAQgFBBRIQAjBSEGQQAkBSAGQQFxRQRAAkAgBSAANgIAIA0oAgAhAEEAJAVBGiAKIBAgACAEEFwjBSEAQQAkBSAAQQFxRQRAIAMEfyADKAIMIgAgAygCEEYEQCASKAIAKAIkIQBBACQFIAAgAxBOIQAjBSEDQQAkBSADQQFxDQMFIAAoAgAQ6gEhAAsgABCgCBCiCAR/IAFBADYCAEEBBUEACwVBAQshAwJAAkACQCAHRQ0AIAcoAgwiACAHKAIQRgRAIAcoAgAoAiQhAEEAJAUgACAHEE4hACMFIQVBACQFIAVBAXENBQUgACgCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAEIAQoAgBBAnI2AgALIAEoAgAhACAIEMYNIAoQxg0gCSQJIAAPCwsLEGMhABAAGgsLIAgQxg0gChDGDSAAEGpBAAv0CgEOfyMJIRMjCUHwAGokCSMJIwpOBEBB8AAQAQsgEyEMAkACQCADIAJrQQxtIghB5ABLBEAgCBCACiIMBEAgDCEODAIFQQAkBUEEEFhBACQFEGMhABAAGgsFQQAhDgwBCwwBCyACIQcgDCEJQQAhCwNAIAMgB0cEQCAHLAALIgpBAEgEfyAHKAIEBSAKQf8BcQsEQCAJQQE6AAAFIAlBAjoAACALQQFqIQsgCEF/aiEICyAHQQxqIQcgCUEBaiEJDAELC0EAIRAgCyEJIAghCwJAAkACQAJAAkADQAJAIAAoAgAiCAR/IAgoAgwiByAIKAIQRgRAIAgoAgAoAiQhB0EAJAUgByAIEE4hCCMFIQdBACQFIAdBAXENBAUgBygCABDqASEICyAIEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshCiABKAIAIggEfyAIKAIMIgcgCCgCEEYEQCAIKAIAKAIkIQdBACQFIAcgCBBOIQcjBSENQQAkBSANQQFxDQQFIAcoAgAQ6gEhBwsgBxCgCBCiCAR/IAFBADYCAEEAIQhBAQVBAAsFQQAhCEEBCyENIAAoAgAhByAKIA1zIAtBAEdxRQ0AIAcoAgwiCCAHKAIQRgRAIAcoAgAoAiQhCEEAJAUgCCAHEE4hCCMFIQdBACQFIAdBAXENBAUgCCgCABDqASEICyAGBEAgCCENBSAEKAIAKAIcIQdBACQFIAcgBCAIEE8hDSMFIQhBACQFIAhBAXENBAsgEEEBaiERIAIhCkEAIQcgDCEPIAkhCANAIAMgCkcEQCAPLAAAQQFGBEACQCAKQQtqIhQsAABBAEgEfyAKKAIABSAKCyAQQQJ0aigCACEJIAZFBEAgBCgCACgCHCESQQAkBSASIAQgCRBPIQkjBSESQQAkBSASQQFxDQkLIAkgDUcEQCAPQQA6AAAgC0F/aiELDAELIBQsAAAiB0EASAR/IAooAgQFIAdB/wFxCyARRgR/IA9BAjoAACAIQQFqIQggC0F/aiELQQEFQQELIQcLCyAKQQxqIQogD0EBaiEPDAELCyAHBEACQCAAKAIAIgdBDGoiCigCACIJIAcoAhBGBEAgBygCACgCKCEJQQAkBSAJIAcQThojBSEHQQAkBSAHQQFxDQgFIAogCUEEajYCACAJKAIAEOoBGgsgCCALakEBSwRAIAIhByAMIQkDQCADIAdGDQIgCSwAAEECRgRAIAcsAAsiCkEASAR/IAcoAgQFIApB/wFxCyARRwRAIAlBADoAACAIQX9qIQgLCyAHQQxqIQcgCUEBaiEJDAAACwALCwsgESEQIAghCQwBCwsCQAJAIAcEQAJAIAcoAgwiBCAHKAIQRgRAIAcoAgAoAiQhBEEAJAUgBCAHEE4hBCMFIQZBACQFIAZBAXENAQUgBCgCABDqASEECyAEEKAIEKIIBEAgAEEANgIAQQEhBAwDBSAAKAIARSEEDAMLAAsFQQEhBAwBCwwBCwJAAkACQCAIRQ0AIAgoAgwiACAIKAIQRgRAIAgoAgAoAiQhAEEAJAUgACAIEE4hACMFIQZBACQFIAZBAXENBAUgACgCABDqASEACyAAEKAIEKIIBEAgAUEANgIADAEFIARFDQILDAILIAQNAAwBCyAFIAUoAgBBAnI2AgALAkACQANAIAIgA0YNASAMLAAAQQJHBEAgAkEMaiECIAxBAWohDAwBCwsMAQsgBSAFKAIAQQRyNgIAIAMhAgsgDgRAIA4QgQoLIBMkCSACDwsQYyEAEAAaDAQLEGMhABAAGgwDCxBjIQAQABoMAgsQYyEAEAAaDAELEGMhABAAGgsgDgRAIA4QgQoLCyAAEGpBAAvtAwEGfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAhBBGohBSAIIQYgAigCBEEBcQRAAkAgBSACEK0KQQAkBUE2IAVB7IYDEE8hACMFIQJBACQFIAJBAXEEQBBjIQAQABogBRDjCgUgBRDjCiAAKAIAIQIgBARAIAIoAhghAiAFIAAgAkH/AXFBwApqEQEABSACKAIcIQIgBSAAIAJB/wFxQcAKahEBAAsgBUEEaiEGIAUoAgAiAiAFIAVBC2oiCSwAACIAQQBIGyEDAkADQCACIAUgAEEYdEEYdUEASCICGyAGKAIAIABB/wFxIAIbaiADRwRAIAMsAAAhAiABKAIAIgAEQCAAQRhqIgooAgAiBCAAKAIcRgRAIAAoAgAoAjQhBCACEKYIIQJBACQFIAQgACACEE8hACMFIQJBACQFIAJBAXENBAUgCiAEQQFqNgIAIAQgAjoAACACEKYIIQALIAAQoAgQoggEQCABQQA2AgALCyADQQFqIQMgCSwAACEAIAUoAgAhAgwBCwsgASgCACEHIAUQxg0MAgsQYyEAEAAaIAUQxg0LIAAQagsFIAAoAgAoAhghByAGIAEoAgA2AgAgBSAGKAIANgIAIAAgBSACIAMgBEEBcSAHQR9xQbwEahEfACEHCyAIJAkgBwv8AgEKfyMJIQkjCUEgaiQJIwkjCk4EQEEgEAELIAkiAEEMaiEKIABBBGohCyAAQQhqIQwgAEEQaiIGQYzCAigAADYAACAGQZDCAi4AADsABCAGQQFqQZLCAkEBIAJBBGoiBSgCABCvCyAFKAIAQQl2QQFxIg1BDWohBRCLASEOIwkhCCMJIAUiB0EPakFwcWokCSMJIwpOBEAgB0EPakFwcRABCxDlCiEHIAAgBDYCACAIIAggBSAHIAYgABCqCyAIaiIFIAIQqwshByMJIQQjCSANQQF0QRhyQX9qIgZBD2pBcHFqJAkjCSMKTgRAIAZBD2pBcHEQAQsgACACEK0KQQAkBUEBIAggByAFIAQgCiALIAAQXSMFIQVBACQFIAVBAXEEQBBjIQEQABogABDjCiABEGoFIAAQ4wogDCABKAIANgIAIAooAgAhASALKAIAIQUgACAMKAIANgIAIAAgBCABIAUgAiADEKMIIQAgDhCKASAJJAkgAA8LQQAL7QIBCn8jCSEAIwlBIGokCSMJIwpOBEBBIBABCyAAQQhqIQUgAEEYaiELIABBEGohDCAAQRRqIQ0gACIGQiU3AwAgAEEBakGJwgJBASACQQRqIgcoAgAQrwsgBygCAEEJdkEBcSIKQRdqIQcQiwEhDiMJIQkjCSAHIghBD2pBcHFqJAkjCSMKTgRAIAhBD2pBcHEQAQsQ5QohCCAFIAQ3AwAgCSAJIAcgCCAGIAUQqgsgCWoiBiACEKsLIQgjCSEHIwkgCkEBdEEsckF/aiIKQQ9qQXBxaiQJIwkjCk4EQCAKQQ9qQXBxEAELIAUgAhCtCkEAJAVBASAJIAggBiAHIAsgDCAFEF0jBSEGQQAkBSAGQQFxBEAQYyEAEAAaIAUQ4wogABBqBSAFEOMKIA0gASgCADYCACALKAIAIQEgDCgCACEGIAUgDSgCADYCACAFIAcgASAGIAIgAxCjCCEBIA4QigEgACQJIAEPC0EAC/kCAQp/IwkhCSMJQSBqJAkjCSMKTgRAQSAQAQsgCSIAQQxqIQogAEEEaiELIABBCGohDCAAQRBqIgZBjMICKAAANgAAIAZBkMICLgAAOwAEIAZBAWpBksICQQAgAkEEaiIFKAIAEK8LIAUoAgBBCXZBAXEiDUEMciEFEIsBIQ4jCSEIIwkgBSIHQQ9qQXBxaiQJIwkjCk4EQCAHQQ9qQXBxEAELEOUKIQcgACAENgIAIAggCCAFIAcgBiAAEKoLIAhqIgUgAhCrCyEHIwkhBCMJIA1BAXRBFXIiBkEPakFwcWokCSMJIwpOBEAgBkEPakFwcRABCyAAIAIQrQpBACQFQQEgCCAHIAUgBCAKIAsgABBdIwUhBUEAJAUgBUEBcQRAEGMhARAAGiAAEOMKIAEQagUgABDjCiAMIAEoAgA2AgAgCigCACEBIAsoAgAhBSAAIAwoAgA2AgAgACAEIAEgBSACIAMQowghACAOEIoBIAkkCSAADwtBAAvtAgEKfyMJIQAjCUEgaiQJIwkjCk4EQEEgEAELIABBCGohBSAAQRhqIQsgAEEQaiEMIABBFGohDSAAIgZCJTcDACAAQQFqQYnCAkEAIAJBBGoiBygCABCvCyAHKAIAQQl2QQFxQRZyIgpBAWohBxCLASEOIwkhCSMJIAciCEEPakFwcWokCSMJIwpOBEAgCEEPakFwcRABCxDlCiEIIAUgBDcDACAJIAkgByAIIAYgBRCqCyAJaiIGIAIQqwshCCMJIQcjCSAKQQF0QX9qIgpBD2pBcHFqJAkjCSMKTgRAIApBD2pBcHEQAQsgBSACEK0KQQAkBUEBIAkgCCAGIAcgCyAMIAUQXSMFIQZBACQFIAZBAXEEQBBjIQAQABogBRDjCiAAEGoFIAUQ4wogDSABKAIANgIAIAsoAgAhASAMKAIAIQYgBSANKAIANgIAIAUgByABIAYgAiADEKMIIQEgDhCKASAAJAkgAQ8LQQAL0wUBDn8jCSEGIwlBsAFqJAkjCSMKTgRAQbABEAELIAZBqAFqIQkgBkGQAWohDCAGQYABaiEPIAZB+ABqIQogBkHoAGohByAGIQ0gBkGgAWohECAGQZwBaiERIAZBmAFqIRIgBkHgAGoiC0IlNwMAIAtBAWpBnIoDIAIoAgQQrAshBSAGQaQBaiIOIAZBQGsiCDYCABDlCiEAAkACQCAFBH8gByACKAIINgIAIAcgBDkDCCAIQR4gACALIAcQqgsFIAogBDkDACAIQR4gACALIAoQqgsLIgBBHUoEQAJAAkAgBQRAQQAkBUEWEE0hBSMFIQBBACQFIABBAXFFBEAgAigCCCEAQQAkBSAPIAA2AgAgDyAEOQMIQQ4gDiAFIAsgDxBRIQAjBSEFQQAkBSAFQQFxRQ0CCwVBACQFQRYQTSEFIwUhAEEAJAUgAEEBcUUEQEEAJAUgDCAEOQMAQQ4gDiAFIAsgDBBRIQAjBSEFQQAkBSAFQQFxRQ0CCwsMAQsgDigCACIFBEAgBSEHDAMFQQAkBUEEEFhBACQFCwsQYyEAEAAaBUEAIQUgDigCACEHDAELDAELIAcgACAHaiIMIAIQqwshCgJAAkAgByAIRgRAQQAhCAwBBSAAQQF0EIAKIg0EQCANIQgMAgVBACQFQQQQWEEAJAUQYyEAEAAaCwsMAQsgCSACEK0KQQAkBUECIAcgCiAMIA0gECARIAkQXSMFIQBBACQFIABBAXEEQBBjIQAQABogCRDjCgUCQCAJEOMKIBIgASgCADYCACAQKAIAIQogESgCACEAQQAkBSAJIBIoAgA2AgBBIyAJIA0gCiAAIAIgAxBSIQIjBSEAQQAkBSAAQQFxBEAQYyEAEAAaDAELIAEgAjYCACAIBEAgCBCBCgsgBQRAIAUQgQoLIAYkCSACDwsLIAgEQCAIEIEKCwsgBQRAIAUQgQoLCyAAEGpBAAvTBQEOfyMJIQYjCUGwAWokCSMJIwpOBEBBsAEQAQsgBkGoAWohCSAGQZABaiEMIAZBgAFqIQ8gBkH4AGohCiAGQegAaiEHIAYhDSAGQaABaiEQIAZBnAFqIREgBkGYAWohEiAGQeAAaiILQiU3AwAgC0EBakGHwgIgAigCBBCsCyEFIAZBpAFqIg4gBkFAayIINgIAEOUKIQACQAJAIAUEfyAHIAIoAgg2AgAgByAEOQMIIAhBHiAAIAsgBxCqCwUgCiAEOQMAIAhBHiAAIAsgChCqCwsiAEEdSgRAAkACQCAFBEBBACQFQRYQTSEFIwUhAEEAJAUgAEEBcUUEQCACKAIIIQBBACQFIA8gADYCACAPIAQ5AwhBDiAOIAUgCyAPEFEhACMFIQVBACQFIAVBAXFFDQILBUEAJAVBFhBNIQUjBSEAQQAkBSAAQQFxRQRAQQAkBSAMIAQ5AwBBDiAOIAUgCyAMEFEhACMFIQVBACQFIAVBAXFFDQILCwwBCyAOKAIAIgUEQCAFIQcMAwVBACQFQQQQWEEAJAULCxBjIQAQABoFQQAhBSAOKAIAIQcMAQsMAQsgByAAIAdqIgwgAhCrCyEKAkACQCAHIAhGBEBBACEIDAEFIABBAXQQgAoiDQRAIA0hCAwCBUEAJAVBBBBYQQAkBRBjIQAQABoLCwwBCyAJIAIQrQpBACQFQQIgByAKIAwgDSAQIBEgCRBdIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAJEOMKBQJAIAkQ4wogEiABKAIANgIAIBAoAgAhCiARKAIAIQBBACQFIAkgEigCADYCAEEjIAkgDSAKIAAgAiADEFIhAiMFIQBBACQFIABBAXEEQBBjIQAQABoMAQsgASACNgIAIAgEQCAIEIEKCyAFBEAgBRCBCgsgBiQJIAIPCwsgCARAIAgQgQoLCyAFBEAgBRCBCgsLIAAQakEAC5oCAQh/IwkhACMJQeAAaiQJIwkjCk4EQEHgABABCyAAIQcgAEHMAGohCiAAQdAAaiIGQYHCAigAADYAACAGQYXCAi4AADsABBDlCiEIIABByABqIgUgBDYCACAAQTBqIgRBFCAIIAYgBRCqCyIMIARqIQYgBCAGIAIQqwshCCAFIAIQrQpBACQFQTYgBUHchgMQTyELIwUhCUEAJAUgCUEBcQRAEGMhABAAGiAFEOMKIAAQagUgBRDjCiALKAIAKAIgIQkgCyAEIAYgByAJQQ9xQaQEahEGABogCiABKAIANgIAIAUgCigCADYCACAFIAcgByAMaiIBIAggBGsgB2ogBiAIRhsgASACIAMQowghASAAJAkgAQ8LQQALRwEBfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUgBDYCACACEN0JIQIgACABIAMgBRDPCSEAIAIEQCACEN0JGgsgBSQJIAALoAEAAkACQAJAIAIoAgRBsAFxQRh0QRh1QRBrDhEAAgICAgICAgICAgICAgICAQILAkACQCAALAAAIgJBK2sOAwABAAELIABBAWohAAwCCyACQTBGIAEgAGtBAUpxRQ0BAkAgACwAAUHYAGsOIQACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAAILIABBAmohAAwBCyABIQALIAAL4QEBBH8gAkGAEHEEQCAAQSs6AAAgAEEBaiEACyACQYAIcQRAIABBIzoAACAAQQFqIQALIAJBgIABcSEDIAJBhAJxIgRBhAJGIgUEf0EABSAAQS46AAAgAEEqOgABIABBAmohAEEBCyECA0AgASwAACIGBEAgACAGOgAAIAFBAWohASAAQQFqIQAMAQsLIAACfwJAAkAgBEEEayIBBEAgAUH8AUYEQAwCBQwDCwALIANBCXZB5gBzDAILIANBCXZB5QBzDAELIANBCXYhASABQeEAcyABQecAcyAFGws6AAAgAgtFAQF/IwkhBCMJQRBqJAkjCSMKTgRAQRAQAQsgBCADNgIAIAEQ3QkhASAAIAIgBBDrCSEAIAEEQCABEN0JGgsgBCQJIAAL6goBDn8jCSEQIwlBEGokCSMJIwpOBEBBEBABCyAGQdyGAxDiCiEKIAZB7IYDEOIKIg4oAgAoAhQhBiAQIg0gDiAGQf8BcUHACmoRAQAgBSADNgIAAkACfwJAAkAgACwAACIIQStrDgMAAQABCyAKKAIAKAIcIQZBACQFIAYgCiAIEE8hCCMFIQZBACQFIAZBAXEEQBBjIQAQABoMAwUgBSAFKAIAIgZBAWo2AgAgBiAIOgAAIABBAWoMAgsACyAACyEIAkACQAJAIAIiEiAIa0EBTA0AIAgsAABBMEcNAAJAIAhBAWoiCSwAAEHYAGsOIQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAELIAooAgAoAhwhBkEAJAUgBiAKQTAQTyEHIwUhBkEAJAUgBkEBcUUEQCAFIAUoAgAiBkEBajYCACAGIAc6AAAgCEECaiEIIAksAAAhByAKKAIAKAIcIQZBACQFIAYgCiAHEE8hByMFIQZBACQFIAZBAXFFBEAgBSAFKAIAIgZBAWo2AgAgBiAHOgAAIAghBgNAAkAgBiACTw0FIAYsAAAhC0EAJAVBFhBNIQkjBSEHQQAkBSAHQQFxDQAgCyAJENsJRQ0FIAZBAWohBgwBCwsQYyEAEAAaDAULCwwCCyAIIQYDQAJAIAYgAk8NAiAGLAAAIQtBACQFQRYQTSEJIwUhB0EAJAUgB0EBcQ0AIAsgCRDUCUUNAiAGQQFqIQYMAQsLEGMhABAAGgwCCyANQQRqIhMoAgAgDUELaiIRLAAAIgdB/wFxIAdBAEgbBH8gBiAIRwRAAkAgBiEHIAghCQNAIAkgB0F/aiIHTw0BIAksAAAhCyAJIAcsAAA6AAAgByALOgAAIAlBAWohCQwAAAsACwsgDigCACgCECEHQQAkBSAHIA4QTiEUIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwDCyAIIQtBACEHQQAhCQJAAkADQCALIAZJBEAgByANKAIAIA0gESwAAEEASBtqLAAAIgxBAEogCSAMRnEEQCAFIAUoAgAiCUEBajYCACAJIBQ6AAAgByAHIBMoAgAgESwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEJCyALLAAAIQ8gCigCACgCHCEMQQAkBSAMIAogDxBPIQ8jBSEMQQAkBSAMQQFxDQIgBSAFKAIAIgxBAWo2AgAgDCAPOgAAIAtBAWohCyAJQQFqIQkMAQsLDAELEGMhABAAGgwDCyADIAggAGtqIgcgBSgCACIIRgR/IAoFA38gByAIQX9qIghJBH8gBywAACEJIAcgCCwAADoAACAIIAk6AAAgB0EBaiEHDAEFIAoLCwsFIAUoAgAhCSAKKAIAKAIgIQdBACQFIAcgCiAIIAYgCRBRGiMFIQdBACQFIAdBAXENASAFIAUoAgAgBiAIa2o2AgAgCgshCAJAAkACQANAIAYgAkkEQCAGLAAAIglBLkYNAyAIKAIAKAIcIQdBACQFIAcgCiAJEE8hCSMFIQdBACQFIAdBAXENAiAFIAUoAgAiB0EBajYCACAHIAk6AAAgBkEBaiEGDAELCwwCCxBjIQAQABoMAwsgDigCACgCDCEIQQAkBSAIIA4QTiEHIwUhCEEAJAUgCEEBcQ0BIAUgBSgCACIIQQFqNgIAIAggBzoAACAGQQFqIQYLIAUoAgAhByAKKAIAKAIgIQhBACQFIAggCiAGIAIgBxBRGiMFIQhBACQFIAhBAXFFBEAgBSAFKAIAIBIgBmtqIgU2AgAgBCAFIAMgASAAa2ogASACRhs2AgAgDRDGDSAQJAkPCwsQYyEAEAAaCyANEMYNIAAQagvIAQEBfyADQYAQcQRAIABBKzoAACAAQQFqIQALIANBgARxBEAgAEEjOgAAIABBAWohAAsDQCABLAAAIgQEQCAAIAQ6AAAgAUEBaiEBIABBAWohAAwBCwsgAAJ/AkACQAJAIANBygBxQQhrDjkBAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgACC0HvAAwCCyADQQl2QSBxQfgAcwwBC0HkAEH1ACACGws6AAAL0gcBC38jCSEPIwlBEGokCSMJIwpOBEBBEBABCyAGQdyGAxDiCiEJIAZB7IYDEOIKIgooAgAoAhQhBiAPIgwgCiAGQf8BcUHACmoRAQACQCAMQQRqIhEoAgAgDEELaiIQLAAAIgZB/wFxIAZBAEgbBEACQCAFIAM2AgACQCACAn8CQAJAIAAsAAAiBkEraw4DAAEAAQsgCSgCACgCHCEHQQAkBSAHIAkgBhBPIQYjBSEHQQAkBSAHQQFxRQRAIAUgBSgCACIHQQFqNgIAIAcgBjoAACAAQQFqDAILDAILIAALIgZrQQFKBEAgBiwAAEEwRgRAAkACQCAGQQFqIgcsAABB2ABrDiEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABCyAJKAIAKAIcIQhBACQFIAggCUEwEE8hCCMFIQtBACQFIAtBAXENAyAFIAUoAgAiC0EBajYCACALIAg6AAAgBywAACEHIAkoAgAoAhwhCEEAJAUgCCAJIAcQTyEHIwUhCEEAJAUgCEEBcQ0DIAUgBSgCACIIQQFqNgIAIAggBzoAACAGQQJqIQYLCwsgAiAGRwRAAkAgAiEHIAYhCANAIAggB0F/aiIHTw0BIAgsAAAhCyAIIAcsAAA6AAAgByALOgAAIAhBAWohCAwAAAsACwsgCigCACgCECEHQQAkBSAHIAoQTiELIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwECyAGIQhBACEHQQAhCgJAAkADQCAIIAJJBEAgByAMKAIAIAwgECwAAEEASBtqLAAAIg1BAEcgCiANRnEEQCAFIAUoAgAiCkEBajYCACAKIAs6AAAgByAHIBEoAgAgECwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEKCyAILAAAIQ0gCSgCACgCHCEOQQAkBSAOIAkgDRBPIQ0jBSEOQQAkBSAOQQFxDQIgBSAFKAIAIg5BAWo2AgAgDiANOgAAIAhBAWohCCAKQQFqIQoMAQsLDAELEGMhABAAGgwECyADIAYgAGtqIgcgBSgCACIGRgRAIAchBQwCCwNAIAcgBkF/aiIGSQRAIAcsAAAhCCAHIAYsAAA6AAAgBiAIOgAAIAdBAWohBwwBCwsgBSgCACEFDAELEGMhABAAGgwCCwUgCSgCACgCICEGQQAkBSAGIAkgACACIAMQURojBSEGQQAkBSAGQQFxBEAQYyEAEAAaDAIFIAUgAyACIABraiIFNgIACwsgBCAFIAMgASAAa2ogASACRhs2AgAgDBDGDSAPJAkPCyAMEMYNIAAQagvwAwEGfyMJIQgjCUEQaiQJIwkjCk4EQEEQEAELIAhBBGohBSAIIQYgAigCBEEBcQRAAkAgBSACEK0KQQAkBUE2IAVBhIcDEE8hACMFIQJBACQFIAJBAXEEQBBjIQAQABogBRDjCgUgBRDjCiAAKAIAIQIgBARAIAIoAhghAiAFIAAgAkH/AXFBwApqEQEABSACKAIcIQIgBSAAIAJB/wFxQcAKahEBAAsgBUEEaiEGIAUoAgAiAiAFIAVBC2oiCSwAACIAQQBIGyEDAkADQCAGKAIAIABB/wFxIABBGHRBGHVBAEgiABtBAnQgAiAFIAAbaiADRwRAIAMoAgAhAiABKAIAIgAEQCAAQRhqIgooAgAiBCAAKAIcRgRAIAAoAgAoAjQhBCACEOoBIQJBACQFIAQgACACEE8hACMFIQJBACQFIAJBAXENBAUgCiAEQQRqNgIAIAQgAjYCACACEOoBIQALIAAQoAgQoggEQCABQQA2AgALCyADQQRqIQMgCSwAACEAIAUoAgAhAgwBCwsgASgCACEHIAUQxg0MAgsQYyEAEAAaIAUQxg0LIAAQagsFIAAoAgAoAhghByAGIAEoAgA2AgAgBSAGKAIANgIAIAAgBSACIAMgBEEBcSAHQR9xQbwEahEfACEHCyAIJAkgBwv/AgEKfyMJIQkjCUEgaiQJIwkjCk4EQEEgEAELIAkiAEEMaiEKIABBBGohCyAAQQhqIQwgAEEQaiIGQYzCAigAADYAACAGQZDCAi4AADsABCAGQQFqQZLCAkEBIAJBBGoiBSgCABCvCyAFKAIAQQl2QQFxIg1BDWohBRCLASEOIwkhCCMJIAUiB0EPakFwcWokCSMJIwpOBEAgB0EPakFwcRABCxDlCiEHIAAgBDYCACAIIAggBSAHIAYgABCqCyAIaiIFIAIQqwshByMJIQQjCSANQQF0QRhyQX9qQQJ0IgZBD2pBcHFqJAkjCSMKTgRAIAZBD2pBcHEQAQsgACACEK0KQQAkBUEDIAggByAFIAQgCiALIAAQXSMFIQVBACQFIAVBAXEEQBBjIQEQABogABDjCiABEGoFIAAQ4wogDCABKAIANgIAIAooAgAhASALKAIAIQUgACAMKAIANgIAIAAgBCABIAUgAiADELkLIQAgDhCKASAJJAkgAA8LQQAL8AIBCn8jCSEAIwlBIGokCSMJIwpOBEBBIBABCyAAQQhqIQUgAEEYaiELIABBEGohDCAAQRRqIQ0gACIGQiU3AwAgAEEBakGJwgJBASACQQRqIgcoAgAQrwsgBygCAEEJdkEBcSIKQRdqIQcQiwEhDiMJIQkjCSAHIghBD2pBcHFqJAkjCSMKTgRAIAhBD2pBcHEQAQsQ5QohCCAFIAQ3AwAgCSAJIAcgCCAGIAUQqgsgCWoiBiACEKsLIQgjCSEHIwkgCkEBdEEsckF/akECdCIKQQ9qQXBxaiQJIwkjCk4EQCAKQQ9qQXBxEAELIAUgAhCtCkEAJAVBAyAJIAggBiAHIAsgDCAFEF0jBSEGQQAkBSAGQQFxBEAQYyEAEAAaIAUQ4wogABBqBSAFEOMKIA0gASgCADYCACALKAIAIQEgDCgCACEGIAUgDSgCADYCACAFIAcgASAGIAIgAxC5CyEBIA4QigEgACQJIAEPC0EAC/wCAQp/IwkhCSMJQSBqJAkjCSMKTgRAQSAQAQsgCSIAQQxqIQogAEEEaiELIABBCGohDCAAQRBqIgZBjMICKAAANgAAIAZBkMICLgAAOwAEIAZBAWpBksICQQAgAkEEaiIFKAIAEK8LIAUoAgBBCXZBAXEiDUEMciEFEIsBIQ4jCSEIIwkgBSIHQQ9qQXBxaiQJIwkjCk4EQCAHQQ9qQXBxEAELEOUKIQcgACAENgIAIAggCCAFIAcgBiAAEKoLIAhqIgUgAhCrCyEHIwkhBCMJIA1BAXRBFXJBAnQiBkEPakFwcWokCSMJIwpOBEAgBkEPakFwcRABCyAAIAIQrQpBACQFQQMgCCAHIAUgBCAKIAsgABBdIwUhBUEAJAUgBUEBcQRAEGMhARAAGiAAEOMKIAEQagUgABDjCiAMIAEoAgA2AgAgCigCACEBIAsoAgAhBSAAIAwoAgA2AgAgACAEIAEgBSACIAMQuQshACAOEIoBIAkkCSAADwtBAAvwAgEKfyMJIQAjCUEgaiQJIwkjCk4EQEEgEAELIABBCGohBSAAQRhqIQsgAEEQaiEMIABBFGohDSAAIgZCJTcDACAAQQFqQYnCAkEAIAJBBGoiBygCABCvCyAHKAIAQQl2QQFxQRZyIgpBAWohBxCLASEOIwkhCSMJIAciCEEPakFwcWokCSMJIwpOBEAgCEEPakFwcRABCxDlCiEIIAUgBDcDACAJIAkgByAIIAYgBRCqCyAJaiIGIAIQqwshCCMJIQcjCSAKQQF0QX9qQQJ0IgpBD2pBcHFqJAkjCSMKTgRAIApBD2pBcHEQAQsgBSACEK0KQQAkBUEDIAkgCCAGIAcgCyAMIAUQXSMFIQZBACQFIAZBAXEEQBBjIQAQABogBRDjCiAAEGoFIAUQ4wogDSABKAIANgIAIAsoAgAhASAMKAIAIQYgBSANKAIANgIAIAUgByABIAYgAiADELkLIQEgDhCKASAAJAkgAQ8LQQAL1AUBDn8jCSEGIwlB4AJqJAkjCSMKTgRAQeACEAELIAZB2AJqIQkgBkHAAmohDCAGQbACaiEPIAZBqAJqIQogBkGYAmohByAGIQ0gBkHQAmohECAGQcwCaiERIAZByAJqIRIgBkGQAmoiC0IlNwMAIAtBAWpBnIoDIAIoAgQQrAshBSAGQdQCaiIOIAZB8AFqIgg2AgAQ5QohAAJAAkAgBQR/IAcgAigCCDYCACAHIAQ5AwggCEEeIAAgCyAHEKoLBSAKIAQ5AwAgCEEeIAAgCyAKEKoLCyIAQR1KBEACQAJAIAUEQEEAJAVBFhBNIQUjBSEAQQAkBSAAQQFxRQRAIAIoAgghAEEAJAUgDyAANgIAIA8gBDkDCEEOIA4gBSALIA8QUSEAIwUhBUEAJAUgBUEBcUUNAgsFQQAkBUEWEE0hBSMFIQBBACQFIABBAXFFBEBBACQFIAwgBDkDAEEOIA4gBSALIAwQUSEAIwUhBUEAJAUgBUEBcUUNAgsLDAELIA4oAgAiBQRAIAUhBwwDBUEAJAVBBBBYQQAkBQsLEGMhABAAGgVBACEFIA4oAgAhBwwBCwwBCyAHIAAgB2oiDCACEKsLIQoCQAJAIAcgCEYEQEEAIQgMAQUgAEEDdBCACiINBEAgDSEIDAIFQQAkBUEEEFhBACQFEGMhABAAGgsLDAELIAkgAhCtCkEAJAVBBCAHIAogDCANIBAgESAJEF0jBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAkQ4woFAkAgCRDjCiASIAEoAgA2AgAgECgCACEKIBEoAgAhAEEAJAUgCSASKAIANgIAQSQgCSANIAogACACIAMQUiECIwUhAEEAJAUgAEEBcQRAEGMhABAAGgwBCyABIAI2AgAgCARAIAgQgQoLIAUEQCAFEIEKCyAGJAkgAg8LCyAIBEAgCBCBCgsLIAUEQCAFEIEKCwsgABBqQQAL1AUBDn8jCSEGIwlB4AJqJAkjCSMKTgRAQeACEAELIAZB2AJqIQkgBkHAAmohDCAGQbACaiEPIAZBqAJqIQogBkGYAmohByAGIQ0gBkHQAmohECAGQcwCaiERIAZByAJqIRIgBkGQAmoiC0IlNwMAIAtBAWpBh8ICIAIoAgQQrAshBSAGQdQCaiIOIAZB8AFqIgg2AgAQ5QohAAJAAkAgBQR/IAcgAigCCDYCACAHIAQ5AwggCEEeIAAgCyAHEKoLBSAKIAQ5AwAgCEEeIAAgCyAKEKoLCyIAQR1KBEACQAJAIAUEQEEAJAVBFhBNIQUjBSEAQQAkBSAAQQFxRQRAIAIoAgghAEEAJAUgDyAANgIAIA8gBDkDCEEOIA4gBSALIA8QUSEAIwUhBUEAJAUgBUEBcUUNAgsFQQAkBUEWEE0hBSMFIQBBACQFIABBAXFFBEBBACQFIAwgBDkDAEEOIA4gBSALIAwQUSEAIwUhBUEAJAUgBUEBcUUNAgsLDAELIA4oAgAiBQRAIAUhBwwDBUEAJAVBBBBYQQAkBQsLEGMhABAAGgVBACEFIA4oAgAhBwwBCwwBCyAHIAAgB2oiDCACEKsLIQoCQAJAIAcgCEYEQEEAIQgMAQUgAEEDdBCACiINBEAgDSEIDAIFQQAkBUEEEFhBACQFEGMhABAAGgsLDAELIAkgAhCtCkEAJAVBBCAHIAogDCANIBAgESAJEF0jBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAkQ4woFAkAgCRDjCiASIAEoAgA2AgAgECgCACEKIBEoAgAhAEEAJAUgCSASKAIANgIAQSQgCSANIAogACACIAMQUiECIwUhAEEAJAUgAEEBcQRAEGMhABAAGgwBCyABIAI2AgAgCARAIAgQgQoLIAUEQCAFEIEKCyAGJAkgAg8LCyAIBEAgCBCBCgsLIAUEQCAFEIEKCwsgABBqQQALoQIBCH8jCSEAIwlB0AFqJAkjCSMKTgRAQdABEAELIAAhByAAQbwBaiEKIABBwAFqIgZBgcICKAAANgAAIAZBhcICLgAAOwAEEOUKIQggAEG4AWoiBSAENgIAIABBoAFqIgRBFCAIIAYgBRCqCyIMIARqIQYgBCAGIAIQqwshCCAFIAIQrQpBACQFQTYgBUH8hgMQTyELIwUhCUEAJAUgCUEBcQRAEGMhABAAGiAFEOMKIAAQagUgBRDjCiALKAIAKAIwIQkgCyAEIAYgByAJQQ9xQaQEahEGABogCiABKAIANgIAIAUgCigCADYCACAFIAcgDEECdCAHaiIBIAggBGtBAnQgB2ogBiAIRhsgASACIAMQuQshASAAJAkgAQ8LQQAL8gIBB38jCSEKIwlBEGokCSMJIwpOBEBBEBABCyAKIQcgACgCACIGBEACQCAEQQxqIgwoAgAiBCADIAFrQQJ1IghrQQAgBCAIShshCCACIgQgAWsiCUECdSELIAlBAEoEQCAGKAIAKAIwIQkgBiABIAsgCUE/cUHgA2oRBAAgC0cEQCAAQQA2AgBBACEGDAILCyAIQQBKBEAgB0IANwIAIAdBADYCCCAHIAggBRDSDSAHKAIAIAcgBywAC0EASBshASAGKAIAKAIwIQVBACQFIAUgBiABIAgQUCEBIwUhBUEAJAUgBUEBcQRAEGMhBRAAGiAHEMYNIAUQagsgASAIRgRAIAcQxg0FIABBADYCACAHEMYNQQAhBgwCCwsgAyAEayIDQQJ1IQEgA0EASgRAIAYoAgAoAjAhAyAGIAIgASADQT9xQeADahEEACABRwRAIABBADYCAEEAIQYMAgsLIAxBADYCAAsFQQAhBgsgCiQJIAYLgwsBDn8jCSEQIwlBEGokCSMJIwpOBEBBEBABCyAGQfyGAxDiCiELIAZBhIcDEOIKIg0oAgAoAhQhBiAQIgwgDSAGQf8BcUHACmoRAQAgBSADNgIAAkACfwJAAkAgACwAACIGQStrDgMAAQABCyALKAIAKAIsIQhBACQFIAggCyAGEE8hBiMFIQhBACQFIAhBAXEEQBBjIQAQABoMAwUgBSAFKAIAIghBBGo2AgAgCCAGNgIAIABBAWoMAgsACyAACyEGAkACQAJAIAIiEiAGa0EBTA0AIAYsAABBMEcNAAJAIAZBAWoiCCwAAEHYAGsOIQABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAELIAsoAgAoAiwhB0EAJAUgByALQTAQTyEHIwUhCUEAJAUgCUEBcUUEQCAFIAUoAgAiCUEEajYCACAJIAc2AgAgBkECaiEGIAgsAAAhCCALKAIAKAIsIQdBACQFIAcgCyAIEE8hCCMFIQdBACQFIAdBAXFFBEAgBSAFKAIAIgdBBGo2AgAgByAINgIAIAYhCANAAkAgCCACTw0FIAgsAAAhB0EAJAVBFhBNIQkjBSEKQQAkBSAKQQFxDQAgByAJENsJRQ0FIAhBAWohCAwBCwsQYyEAEAAaDAULCwwCCyAGIQgDQAJAIAggAk8NAiAILAAAIQdBACQFQRYQTSEJIwUhCkEAJAUgCkEBcQ0AIAcgCRDUCUUNAiAIQQFqIQgMAQsLEGMhABAAGgwCCyAMQQRqIhMoAgAgDEELaiIRLAAAIgdB/wFxIAdBAEgbBEAgBiAIRwRAAkAgCCEHIAYhCQNAIAkgB0F/aiIHTw0BIAksAAAhCiAJIAcsAAA6AAAgByAKOgAAIAlBAWohCQwAAAsACwsgDSgCACgCECEHQQAkBSAHIA0QTiEUIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwDCyAGIQlBACEHQQAhCgJAAkADQCAJIAhJBEAgByAMKAIAIAwgESwAAEEASBtqLAAAIg5BAEogCiAORnEEQCAFIAUoAgAiCkEEajYCACAKIBQ2AgAgByAHIBMoAgAgESwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEKCyAJLAAAIQ4gCygCACgCLCEPQQAkBSAPIAsgDhBPIQ4jBSEPQQAkBSAPQQFxDQIgBSAFKAIAIg9BBGo2AgAgDyAONgIAIAlBAWohCSAKQQFqIQoMAQsLDAELEGMhABAAGgwDCyAGIABrQQJ0IANqIgkgBSgCACIKRgR/IAshByAJBSAKIQYDfyAJIAZBfGoiBkkEfyAJKAIAIQcgCSAGKAIANgIAIAYgBzYCACAJQQRqIQkMAQUgCyEHIAoLCwshBgUgBSgCACEHIAsoAgAoAjAhCUEAJAUgCSALIAYgCCAHEFEaIwUhB0EAJAUgB0EBcQ0BIAUgBSgCACAIIAZrQQJ0aiIGNgIAIAshBwsCQAJAAkADQCAIIAJJBEAgCCwAACIGQS5GDQMgBygCACgCLCEJQQAkBSAJIAsgBhBPIQkjBSEGQQAkBSAGQQFxDQIgBSAFKAIAIgpBBGoiBjYCACAKIAk2AgAgCEEBaiEIDAELCwwCCxBjIQAQABoMAwsgDSgCACgCDCEGQQAkBSAGIA0QTiEHIwUhBkEAJAUgBkEBcQ0BIAUgBSgCACIJQQRqIgY2AgAgCSAHNgIAIAhBAWohCAsgCygCACgCMCEHQQAkBSAHIAsgCCACIAYQURojBSEGQQAkBSAGQQFxRQRAIAUgBSgCACASIAhrQQJ0aiIFNgIAIAQgBSABIABrQQJ0IANqIAEgAkYbNgIAIAwQxg0gECQJDwsLEGMhABAAGgsgDBDGDSAAEGoL2wcBC38jCSEPIwlBEGokCSMJIwpOBEBBEBABCyAGQfyGAxDiCiEJIAZBhIcDEOIKIgooAgAoAhQhBiAPIgwgCiAGQf8BcUHACmoRAQACQCAMQQRqIhEoAgAgDEELaiIQLAAAIgZB/wFxIAZBAEgbBEACQCAFIAM2AgACQCACAn8CQAJAIAAsAAAiBkEraw4DAAEAAQsgCSgCACgCLCEHQQAkBSAHIAkgBhBPIQYjBSEHQQAkBSAHQQFxRQRAIAUgBSgCACIHQQRqNgIAIAcgBjYCACAAQQFqDAILDAILIAALIgZrQQFKBEAgBiwAAEEwRgRAAkACQCAGQQFqIgcsAABB2ABrDiEAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQABCyAJKAIAKAIsIQhBACQFIAggCUEwEE8hCCMFIQtBACQFIAtBAXENAyAFIAUoAgAiC0EEajYCACALIAg2AgAgBywAACEHIAkoAgAoAiwhCEEAJAUgCCAJIAcQTyEHIwUhCEEAJAUgCEEBcQ0DIAUgBSgCACIIQQRqNgIAIAggBzYCACAGQQJqIQYLCwsgAiAGRwRAAkAgAiEHIAYhCANAIAggB0F/aiIHTw0BIAgsAAAhCyAIIAcsAAA6AAAgByALOgAAIAhBAWohCAwAAAsACwsgCigCACgCECEHQQAkBSAHIAoQTiELIwUhB0EAJAUgB0EBcQRAEGMhABAAGgwECyAGIQhBACEHQQAhCgJAAkADQCAIIAJJBEAgByAMKAIAIAwgECwAAEEASBtqLAAAIg1BAEcgCiANRnEEQCAFIAUoAgAiCkEEajYCACAKIAs2AgAgByAHIBEoAgAgECwAACIHQf8BcSAHQQBIG0F/aklqIQdBACEKCyAILAAAIQ0gCSgCACgCLCEOQQAkBSAOIAkgDRBPIQ0jBSEOQQAkBSAOQQFxDQIgBSAFKAIAIg5BBGo2AgAgDiANNgIAIAhBAWohCCAKQQFqIQoMAQsLDAELEGMhABAAGgwECyAGIABrQQJ0IANqIgcgBSgCACIGRgRAIAchBQwCCwNAIAcgBkF8aiIGSQRAIAcoAgAhCCAHIAYoAgA2AgAgBiAINgIAIAdBBGohBwwBCwsgBSgCACEFDAELEGMhABAAGgwCCwUgCSgCACgCMCEGQQAkBSAGIAkgACACIAMQURojBSEGQQAkBSAGQQFxBEAQYyEAEAAaDAIFIAUgAiAAa0ECdCADaiIFNgIACwsgBCAFIAEgAGtBAnQgA2ogASACRhs2AgAgDBDGDSAPJAkPCyAMEMYNIAAQagtxAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBkEEaiIHIAEoAgA2AgAgBiACKAIANgIAIAZBCGoiASAHKAIANgIAIAZBDGoiAiAGKAIANgIAIAAgASACIAMgBCAFQZnGAkGhxgIQzgshACAGJAkgAAu0AQEEfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIABBCGoiBigCACgCFCEIIAYgCEH/AXFBmgFqEQMAIQYgB0EEaiIIIAEoAgA2AgAgByACKAIANgIAIAYoAgAgBiAGLAALIgFBAEgiAhsiCSAGKAIEIAFB/wFxIAIbaiEBIAdBCGoiAiAIKAIANgIAIAdBDGoiBiAHKAIANgIAIAAgAiAGIAMgBCAFIAkgARDOCyEAIAckCSAAC5cBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByEIIAdBBGoiBiADEK0KQQAkBUE2IAZB3IYDEE8hAyMFIQlBACQFIAlBAXEEQBBjIQAQABogBhDjCiAAEGoFIAYQ4wogCCACKAIANgIAIAYgCCgCADYCACAAIAVBGGogASAGIAQgAxDMCyABKAIAIQAgByQJIAAPC0EAC5cBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByEIIAdBBGoiBiADEK0KQQAkBUE2IAZB3IYDEE8hAyMFIQlBACQFIAlBAXEEQBBjIQAQABogBhDjCiAAEGoFIAYQ4wogCCACKAIANgIAIAYgCCgCADYCACAAIAVBEGogASAGIAQgAxDNCyABKAIAIQAgByQJIAAPC0EAC5cBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByEIIAdBBGoiBiADEK0KQQAkBUE2IAZB3IYDEE8hAyMFIQlBACQFIAlBAXEEQBBjIQAQABogBhDjCiAAEGoFIAYQ4wogCCACKAIANgIAIAYgCCgCADYCACAAIAVBFGogASAGIAQgAxDZCyABKAIAIQAgByQJIAAPC0EAC6QOASN/IwkhByMJQZABaiQJIwkjCk4EQEGQARABCyAHQfAAaiEKIAdB/ABqIQ0gB0H4AGohDiAHQfQAaiEPIAdB7ABqIRAgB0HoAGohESAHQeQAaiESIAdB4ABqIRMgB0HcAGohFCAHQdgAaiEVIAdB1ABqIRYgB0HQAGohFyAHQcwAaiEYIAdByABqIRkgB0HEAGohGiAHQUBrIRsgB0E8aiEcIAdBOGohHSAHQTRqIR4gB0EwaiEfIAdBLGohICAHQShqISEgB0EkaiEiIAdBIGohIyAHQRxqISQgB0EYaiElIAdBFGohJiAHQRBqIScgB0EMaiEoIAdBCGohKSAHQQRqISogByELIARBADYCACAHQYABaiIIIAMQrQpBACQFQTYgCEHchgMQTyEJIwUhDEEAJAUgDEEBcQRAEGMhDBAAGiAIEOMKIAwQagsgCBDjCgJ/AkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgBkEYdEEYdUElaw5VFhcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFwABFwQXBRcGBxcXFwoXFxcXDg8QFxcXExUXFxcXFxcXAAECAwMXFwEXCBcXCQsXDBcNFwsXFxESFBcLIA0gAigCADYCACAIIA0oAgA2AgAgACAFQRhqIAEgCCAEIAkQzAsMFwsgDiACKAIANgIAIAggDigCADYCACAAIAVBEGogASAIIAQgCRDNCwwWCyAAQQhqIgYoAgAoAgwhCyAGIAtB/wFxQZoBahEDACEGIA8gASgCADYCACAQIAIoAgA2AgAgBigCACAGIAYsAAsiAkEASCILGyIJIAYoAgQgAkH/AXEgCxtqIQIgCiAPKAIANgIAIAggECgCADYCACABIAAgCiAIIAMgBCAFIAkgAhDOCzYCAAwVCyARIAIoAgA2AgAgCCARKAIANgIAIAAgBUEMaiABIAggBCAJEM8LDBQLIBIgASgCADYCACATIAIoAgA2AgAgCiASKAIANgIAIAggEygCADYCACABIAAgCiAIIAMgBCAFQfHFAkH5xQIQzgs2AgAMEwsgFCABKAIANgIAIBUgAigCADYCACAKIBQoAgA2AgAgCCAVKAIANgIAIAEgACAKIAggAyAEIAVB+cUCQYHGAhDOCzYCAAwSCyAWIAIoAgA2AgAgCCAWKAIANgIAIAAgBUEIaiABIAggBCAJENALDBELIBcgAigCADYCACAIIBcoAgA2AgAgACAFQQhqIAEgCCAEIAkQ0QsMEAsgGCACKAIANgIAIAggGCgCADYCACAAIAVBHGogASAIIAQgCRDSCwwPCyAZIAIoAgA2AgAgCCAZKAIANgIAIAAgBUEQaiABIAggBCAJENMLDA4LIBogAigCADYCACAIIBooAgA2AgAgACAFQQRqIAEgCCAEIAkQ1AsMDQsgGyACKAIANgIAIAggGygCADYCACAAIAEgCCAEIAkQ1QsMDAsgHCACKAIANgIAIAggHCgCADYCACAAIAVBCGogASAIIAQgCRDWCwwLCyAdIAEoAgA2AgAgHiACKAIANgIAIAogHSgCADYCACAIIB4oAgA2AgAgASAAIAogCCADIAQgBUGBxgJBjMYCEM4LNgIADAoLIB8gASgCADYCACAgIAIoAgA2AgAgCiAfKAIANgIAIAggICgCADYCACABIAAgCiAIIAMgBCAFQYzGAkGRxgIQzgs2AgAMCQsgISACKAIANgIAIAggISgCADYCACAAIAUgASAIIAQgCRDXCwwICyAiIAEoAgA2AgAgIyACKAIANgIAIAogIigCADYCACAIICMoAgA2AgAgASAAIAogCCADIAQgBUGRxgJBmcYCEM4LNgIADAcLICQgAigCADYCACAIICQoAgA2AgAgACAFQRhqIAEgCCAEIAkQ2AsMBgsgACgCACgCFCEGICUgASgCADYCACAmIAIoAgA2AgAgCiAlKAIANgIAIAggJigCADYCACAAIAogCCADIAQgBSAGQT9xQeAEahEhAAwGCyAAQQhqIgYoAgAoAhghCyAGIAtB/wFxQZoBahEDACEGICcgASgCADYCACAoIAIoAgA2AgAgBigCACAGIAYsAAsiAkEASCILGyIJIAYoAgQgAkH/AXEgCxtqIQIgCiAnKAIANgIAIAggKCgCADYCACABIAAgCiAIIAMgBCAFIAkgAhDOCzYCAAwECyApIAIoAgA2AgAgCCApKAIANgIAIAAgBUEUaiABIAggBCAJENkLDAMLICogAigCADYCACAIICooAgA2AgAgACAFQRRqIAEgCCAEIAkQ2gsMAgsgCyACKAIANgIAIAggCygCADYCACAAIAEgCCAEIAkQ2wsMAQsgBCAEKAIAQQRyNgIACyABKAIACyEAIAckCSAAC00AQZD1AiwAAEUEQEGQ9QIQhw4EQEEAJAVBBRBYIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAAEGoFQdyHA0Gg7QI2AgALCwtB3IcDKAIAC00AQYD1AiwAAEUEQEGA9QIQhw4EQEEAJAVBBhBYIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAAEGoFQdiHA0GA6wI2AgALCwtB2IcDKAIAC00AQfD0AiwAAEUEQEHw9AIQhw4EQEEAJAVBBxBYIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAAEGoFQdSHA0Hg6AI2AgALCwtB1IcDKAIAC2MAQej0AiwAAEUEQEHo9AIQhw4EQEHIhwNCADcCAEHQhwNBADYCAEH/wwIQoQghAEEAJAVBFEHIhwNB/8MCIAAQWyMFIQBBACQFIABBAXEEQBBjIQAQABogABBqCwsLQciHAwtjAEHg9AIsAABFBEBB4PQCEIcOBEBBvIcDQgA3AgBBxIcDQQA2AgBB88MCEKEIIQBBACQFQRRBvIcDQfPDAiAAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAAQagsLC0G8hwMLYwBB2PQCLAAARQRAQdj0AhCHDgRAQbCHA0IANwIAQbiHA0EANgIAQerDAhChCCEAQQAkBUEUQbCHA0HqwwIgABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAAEGoLCwtBsIcDC2MAQdD0AiwAAEUEQEHQ9AIQhw4EQEGkhwNCADcCAEGshwNBADYCAEHhwwIQoQghAEEAJAVBFEGkhwNB4cMCIAAQWyMFIQBBACQFIABBAXEEQBBjIQAQABogABBqCwsLQaSHAwt7AQJ/Qfj0AiwAAEUEQEH49AIQhw4EQEHg6AIhAANAIABCADcCACAAQQA2AghBACEBA0AgAUEDRwRAIAFBAnQgAGpBADYCACABQQFqIQEMAQsLIABBDGoiAEGA6wJHDQALCwtB4OgCQZTEAhDLDRpB7OgCQZfEAhDLDRoLgwMBAn9BiPUCLAAARQRAQYj1AhCHDgRAQYDrAiEAA0AgAEIANwIAIABBADYCCEEAIQEDQCABQQNHBEAgAUECdCAAakEANgIAIAFBAWohAQwBCwsgAEEMaiIAQaDtAkcNAAsLC0GA6wJBmsQCEMsNGkGM6wJBosQCEMsNGkGY6wJBq8QCEMsNGkGk6wJBscQCEMsNGkGw6wJBt8QCEMsNGkG86wJBu8QCEMsNGkHI6wJBwMQCEMsNGkHU6wJBxcQCEMsNGkHg6wJBzMQCEMsNGkHs6wJB1sQCEMsNGkH46wJB3sQCEMsNGkGE7AJB58QCEMsNGkGQ7AJB8MQCEMsNGkGc7AJB9MQCEMsNGkGo7AJB+MQCEMsNGkG07AJB/MQCEMsNGkHA7AJBt8QCEMsNGkHM7AJBgMUCEMsNGkHY7AJBhMUCEMsNGkHk7AJBiMUCEMsNGkHw7AJBjMUCEMsNGkH87AJBkMUCEMsNGkGI7QJBlMUCEMsNGkGU7QJBmMUCEMsNGguLAgECf0GY9QIsAABFBEBBmPUCEIcOBEBBoO0CIQADQCAAQgA3AgAgAEEANgIIQQAhAQNAIAFBA0cEQCABQQJ0IABqQQA2AgAgAUEBaiEBDAELCyAAQQxqIgBByO4CRw0ACwsLQaDtAkGcxQIQyw0aQaztAkGjxQIQyw0aQbjtAkGqxQIQyw0aQcTtAkGyxQIQyw0aQdDtAkG8xQIQyw0aQdztAkHFxQIQyw0aQejtAkHMxQIQyw0aQfTtAkHVxQIQyw0aQYDuAkHZxQIQyw0aQYzuAkHdxQIQyw0aQZjuAkHhxQIQyw0aQaTuAkHlxQIQyw0aQbDuAkHpxQIQyw0aQbzuAkHtxQIQyw0aC4YBAQJ/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgAEEIaiIAKAIAKAIAIQcgACAHQf8BcUGaAWoRAwAhACAGIAMoAgA2AgAgBkEEaiIDIAYoAgA2AgAgAiADIAAgAEGoAWogBSAEQQAQhgsgAGsiAEGoAUgEQCABIABBDG1BB282AgALIAYkCQuGAQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIABBCGoiACgCACgCBCEHIAAgB0H/AXFBmgFqEQMAIQAgBiADKAIANgIAIAZBBGoiAyAGKAIANgIAIAIgAyAAIABBoAJqIAUgBEEAEIYLIABrIgBBoAJIBEAgASAAQQxtQQxvNgIACyAGJAkLgAwBDX8jCSEOIwlBEGokCSMJIwpOBEBBEBABCyAOQQhqIREgDkEEaiESIA4hEyAOQQxqIg8gAxCtCkEAJAVBNiAPQdyGAxBPIQ0jBSEKQQAkBSAKQQFxBEAQYyEKEAAaIA8Q4wogChBqCyAPEOMKIARBADYCACANQQhqIRRBACEKAkACQANAAkAgASgCACEIIApFIAYgB0dxRQ0AIAghCiAIBH8gCCgCDCIJIAgoAhBGBH8gCCgCACgCJCEJIAggCUH/AXFBmgFqEQMABSAJLAAAEKYICxCgCBCiCAR/IAFBADYCAEEAIQhBACEKQQEFQQALBUEAIQhBAQshDCACKAIAIgshCQJAAkAgC0UNACALKAIMIhAgCygCEEYEfyALKAIAKAIkIRAgCyAQQf8BcUGaAWoRAwAFIBAsAAAQpggLEKAIEKIIBEAgAkEANgIAQQAhCQwBBSAMRQ0FCwwBCyAMDQNBACELCyANKAIAKAIkIQwgDSAGLAAAQQAgDEE/cUHgA2oRBABB/wFxQSVGBEAgByAGQQFqIgxGDQMgDSgCACgCJCELAkACQAJAIA0gDCwAAEEAIAtBP3FB4ANqEQQAIgtBGHRBGHVBMGsOFgABAQEBAQEBAQEBAQEBAQEBAQEBAQABCyAHIAZBAmoiBkYNBSANKAIAKAIkIRAgCyEIIA0gBiwAAEEAIBBBP3FB4ANqEQQAIQsgDCEGDAELQQAhCAsgACgCACgCJCEMIBIgCjYCACATIAk2AgAgESASKAIANgIAIA8gEygCADYCACABIAAgESAPIAMgBCAFIAsgCCAMQQ9xQbAFahEgADYCACAGQQJqIQYFAkAgBiwAACIKQX9KBEAgCkEBdCAUKAIAIgpqLgEAQYDAAHEEQANAAkAgByAGQQFqIgZGBEAgByEGDAELIAYsAAAiCUF/TA0AIAlBAXQgCmouAQBBgMAAcQ0BCwsgCyEKA0AgCAR/IAgoAgwiCSAIKAIQRgR/IAgoAgAoAiQhCSAIIAlB/wFxQZoBahEDAAUgCSwAABCmCAsQoAgQoggEfyABQQA2AgBBACEIQQEFQQALBUEAIQhBAQshCQJAAkAgCkUNACAKKAIMIgsgCigCEEYEfyAKKAIAKAIkIQsgCiALQf8BcUGaAWoRAwAFIAssAAAQpggLEKAIEKIIBEAgAkEANgIADAEFIAlFDQYLDAELIAkNBEEAIQoLIAhBDGoiCygCACIJIAhBEGoiDCgCAEYEfyAIKAIAKAIkIQkgCCAJQf8BcUGaAWoRAwAFIAksAAAQpggLIglB/wFxQRh0QRh1QX9MDQMgFCgCACAJQRh0QRh1QQF0ai4BAEGAwABxRQ0DIAsoAgAiCSAMKAIARgRAIAgoAgAoAighCSAIIAlB/wFxQZoBahEDABoFIAsgCUEBajYCACAJLAAAEKYIGgsMAAALAAsLIAhBDGoiCigCACIJIAhBEGoiCygCAEYEfyAIKAIAKAIkIQkgCCAJQf8BcUGaAWoRAwAFIAksAAAQpggLIQkgDSgCACgCDCEMIA0gCUH/AXEgDEE/cUGeA2oRHgAhCSANKAIAKAIMIQwgCUH/AXEgDSAGLAAAIAxBP3FBngNqER4AQf8BcUcEQCAEQQQ2AgAMAQsgCigCACIJIAsoAgBGBEAgCCgCACgCKCEKIAggCkH/AXFBmgFqEQMAGgUgCiAJQQFqNgIAIAksAAAQpggaCyAGQQFqIQYLCyAEKAIAIQoMAQsLDAELIARBBDYCAAsgCAR/IAgoAgwiACAIKAIQRgR/IAgoAgAoAiQhACAIIABB/wFxQZoBahEDAAUgACwAABCmCAsQoAgQoggEfyABQQA2AgBBACEIQQEFQQALBUEAIQhBAQshAAJAAkACQCACKAIAIgFFDQAgASgCDCIDIAEoAhBGBH8gASgCACgCJCEDIAEgA0H/AXFBmgFqEQMABSADLAAAEKYICxCgCBCiCARAIAJBADYCAAwBBSAARQ0CCwwCCyAADQAMAQsgBCAEKAIAQQJyNgIACyAOJAkgCAtuACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ3AshAiAEKAIAIgNBBHFFIAJBf2pBH0lxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtrACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ3AshAiAEKAIAIgNBBHFFIAJBGEhxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtuACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ3AshAiAEKAIAIgNBBHFFIAJBf2pBDElxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtsACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQMQ3AshAiAEKAIAIgNBBHFFIAJB7gJIcQRAIAEgAjYCAAUgBCADQQRyNgIACyAAJAkLbgAjCSEAIwlBEGokCSMJIwpOBEBBEBABCyAAIAMoAgA2AgAgAEEEaiIDIAAoAgA2AgAgAiADIAQgBUECENwLIQIgBCgCACIDQQRxRSACQQ1IcQRAIAEgAkF/ajYCAAUgBCADQQRyNgIACyAAJAkLawAjCSEAIwlBEGokCSMJIwpOBEBBEBABCyAAIAMoAgA2AgAgAEEEaiIDIAAoAgA2AgAgAiADIAQgBUECENwLIQIgBCgCACIDQQRxRSACQTxIcQRAIAEgAjYCAAUgBCADQQRyNgIACyAAJAkLzAQBAn8gBEEIaiEGA0ACQCABKAIAIgAEfyAAKAIMIgQgACgCEEYEfyAAKAIAKAIkIQQgACAEQf8BcUGaAWoRAwAFIAQsAAAQpggLEKAIEKIIBH8gAUEANgIAQQEFIAEoAgBFCwVBAQshBAJAAkAgAigCACIARQ0AIAAoAgwiBSAAKAIQRgR/IAAoAgAoAiQhBSAAIAVB/wFxQZoBahEDAAUgBSwAABCmCAsQoAgQoggEQCACQQA2AgAMAQUgBEUNAwsMAQsgBAR/QQAhAAwCBUEACyEACyABKAIAIgQoAgwiBSAEKAIQRgR/IAQoAgAoAiQhBSAEIAVB/wFxQZoBahEDAAUgBSwAABCmCAsiBEH/AXFBGHRBGHVBf0wNACAGKAIAIARBGHRBGHVBAXRqLgEAQYDAAHFFDQAgASgCACIAQQxqIgUoAgAiBCAAKAIQRgRAIAAoAgAoAighBCAAIARB/wFxQZoBahEDABoFIAUgBEEBajYCACAELAAAEKYIGgsMAQsLIAEoAgAiBAR/IAQoAgwiBSAEKAIQRgR/IAQoAgAoAiQhBSAEIAVB/wFxQZoBahEDAAUgBSwAABCmCAsQoAgQoggEfyABQQA2AgBBAQUgASgCAEULBUEBCyEBAkACQAJAIABFDQAgACgCDCIEIAAoAhBGBH8gACgCACgCJCEEIAAgBEH/AXFBmgFqEQMABSAELAAAEKYICxCgCBCiCARAIAJBADYCAAwBBSABRQ0CCwwCCyABDQAMAQsgAyADKAIAQQJyNgIACwvzAQEFfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAdBBGohCCAHIQkgAEEIaiIAKAIAKAIIIQYgACAGQf8BcUGaAWoRAwAiACwACyIGQQBIBH8gACgCBAUgBkH/AXELIQZBACAALAAXIgpBAEgEfyAAKAIQBSAKQf8BcQtrIAZGBEAgBCAEKAIAQQRyNgIABQJAIAkgAygCADYCACAIIAkoAgA2AgAgAiAIIAAgAEEYaiAFIARBABCGCyAAayICRSABKAIAIgBBDEZxBEAgAUEANgIADAELIAJBDEYgAEEMSHEEQCABIABBDGo2AgALCwsgByQJC2sAIwkhACMJQRBqJAkjCSMKTgRAQRAQAQsgACADKAIANgIAIABBBGoiAyAAKAIANgIAIAIgAyAEIAVBAhDcCyECIAQoAgAiA0EEcUUgAkE9SHEEQCABIAI2AgAFIAQgA0EEcjYCAAsgACQJC2sAIwkhACMJQRBqJAkjCSMKTgRAQRAQAQsgACADKAIANgIAIABBBGoiAyAAKAIANgIAIAIgAyAEIAVBARDcCyECIAQoAgAiA0EEcUUgAkEHSHEEQCABIAI2AgAFIAQgA0EEcjYCAAsgACQJC3sBAX8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGIAMoAgA2AgAgBkEEaiIAIAYoAgA2AgAgAiAAIAQgBUEEENwLIQAgBCgCAEEEcUUEQCABIABBxQBIBH8gAEHQD2oFIABB7A5qIAAgAEHkAEgbC0GUcWo2AgALIAYkCQtcACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQQQ3AshAiAEKAIAQQRxRQRAIAEgAkGUcWo2AgALIAAkCQvWBAECfyABKAIAIgAEfyAAKAIMIgUgACgCEEYEfyAAKAIAKAIkIQUgACAFQf8BcUGaAWoRAwAFIAUsAAAQpggLEKAIEKIIBH8gAUEANgIAQQEFIAEoAgBFCwVBAQshBQJAAkACQCACKAIAIgAEQCAAKAIMIgYgACgCEEYEfyAAKAIAKAIkIQYgACAGQf8BcUGaAWoRAwAFIAYsAAAQpggLEKAIEKIIBEAgAkEANgIABSAFBEAMBAUMAwsACwsgBUUEQEEAIQAMAgsLIAMgAygCAEEGcjYCAAwBCyABKAIAIgUoAgwiBiAFKAIQRgR/IAUoAgAoAiQhBiAFIAZB/wFxQZoBahEDAAUgBiwAABCmCAshBSAEKAIAKAIkIQYgBCAFQf8BcUEAIAZBP3FB4ANqEQQAQf8BcUElRwRAIAMgAygCAEEEcjYCAAwBCyABKAIAIgRBDGoiBigCACIFIAQoAhBGBEAgBCgCACgCKCEFIAQgBUH/AXFBmgFqEQMAGgUgBiAFQQFqNgIAIAUsAAAQpggaCyABKAIAIgQEfyAEKAIMIgUgBCgCEEYEfyAEKAIAKAIkIQUgBCAFQf8BcUGaAWoRAwAFIAUsAAAQpggLEKAIEKIIBH8gAUEANgIAQQEFIAEoAgBFCwVBAQshAQJAAkAgAEUNACAAKAIMIgQgACgCEEYEfyAAKAIAKAIkIQQgACAEQf8BcUGaAWoRAwAFIAQsAAAQpggLEKAIEKIIBEAgAkEANgIADAEFIAENAwsMAQsgAUUNAQsgAyADKAIAQQJyNgIACwvHCAEIfyAAKAIAIgUEfyAFKAIMIgcgBSgCEEYEfyAFKAIAKAIkIQcgBSAHQf8BcUGaAWoRAwAFIAcsAAAQpggLEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBgJAAkACQCABKAIAIgcEQCAHKAIMIgUgBygCEEYEfyAHKAIAKAIkIQUgByAFQf8BcUGaAWoRAwAFIAUsAAAQpggLEKAIEKIIBEAgAUEANgIABSAGBEAMBAUMAwsACwsgBkUEQEEAIQcMAgsLIAIgAigCAEEGcjYCAEEAIQQMAQsgACgCACIGKAIMIgUgBigCEEYEfyAGKAIAKAIkIQUgBiAFQf8BcUGaAWoRAwAFIAUsAAAQpggLIgVB/wFxIgZBGHRBGHVBf0oEQCADQQhqIgwoAgAgBUEYdEEYdUEBdGouAQBBgBBxBEAgAygCACgCJCEFIAMgBkEAIAVBP3FB4ANqEQQAQRh0QRh1IQUgACgCACILQQxqIgYoAgAiCCALKAIQRgRAIAsoAgAoAighBiALIAZB/wFxQZoBahEDABoFIAYgCEEBajYCACAILAAAEKYIGgsgBCEIIAchBgNAAkAgBUFQaiEEIAhBf2ohCyAAKAIAIgkEfyAJKAIMIgUgCSgCEEYEfyAJKAIAKAIkIQUgCSAFQf8BcUGaAWoRAwAFIAUsAAAQpggLEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshCSAGBH8gBigCDCIFIAYoAhBGBH8gBigCACgCJCEFIAYgBUH/AXFBmgFqEQMABSAFLAAAEKYICxCgCBCiCAR/IAFBADYCAEEAIQdBACEGQQEFQQALBUEAIQZBAQshBSAAKAIAIQogBSAJcyAIQQFKcUUNACAKKAIMIgUgCigCEEYEfyAKKAIAKAIkIQUgCiAFQf8BcUGaAWoRAwAFIAUsAAAQpggLIgVB/wFxIghBGHRBGHVBf0wNBCAMKAIAIAVBGHRBGHVBAXRqLgEAQYAQcUUNBCADKAIAKAIkIQUgBEEKbCADIAhBACAFQT9xQeADahEEAEEYdEEYdWohBSAAKAIAIglBDGoiBCgCACIIIAkoAhBGBEAgCSgCACgCKCEEIAkgBEH/AXFBmgFqEQMAGgUgBCAIQQFqNgIAIAgsAAAQpggaCyALIQgMAQsLIAoEfyAKKAIMIgMgCigCEEYEfyAKKAIAKAIkIQMgCiADQf8BcUGaAWoRAwAFIAMsAAAQpggLEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshAwJAAkAgB0UNACAHKAIMIgAgBygCEEYEfyAHKAIAKAIkIQAgByAAQf8BcUGaAWoRAwAFIAAsAAAQpggLEKAIEKIIBEAgAUEANgIADAEFIAMNBQsMAQsgA0UNAwsgAiACKAIAQQJyNgIADAILCyACIAIoAgBBBHI2AgBBACEECyAEC3EBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAGQQRqIgcgASgCADYCACAGIAIoAgA2AgAgBkEIaiIBIAcoAgA2AgAgBkEMaiICIAYoAgA2AgAgACABIAIgAyAEIAVB8K8BQZCwARDwCyEAIAYkCSAAC7kBAQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgAEEIaiIGKAIAKAIUIQggBiAIQf8BcUGaAWoRAwAhBiAHQQRqIgggASgCADYCACAHIAIoAgA2AgAgBigCACAGIAYsAAsiAkEASCIJGyEBIAYoAgQgAkH/AXEgCRtBAnQgAWohAiAHQQhqIgYgCCgCADYCACAHQQxqIgggBygCADYCACAAIAYgCCADIAQgBSABIAIQ8AshACAHJAkgAAuXAQEEfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAchCCAHQQRqIgYgAxCtCkEAJAVBNiAGQfyGAxBPIQMjBSEJQQAkBSAJQQFxBEAQYyEAEAAaIAYQ4wogABBqBSAGEOMKIAggAigCADYCACAGIAgoAgA2AgAgACAFQRhqIAEgBiAEIAMQ7gsgASgCACEAIAckCSAADwtBAAuXAQEEfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAchCCAHQQRqIgYgAxCtCkEAJAVBNiAGQfyGAxBPIQMjBSEJQQAkBSAJQQFxBEAQYyEAEAAaIAYQ4wogABBqBSAGEOMKIAggAigCADYCACAGIAgoAgA2AgAgACAFQRBqIAEgBiAEIAMQ7wsgASgCACEAIAckCSAADwtBAAuXAQEEfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAchCCAHQQRqIgYgAxCtCkEAJAVBNiAGQfyGAxBPIQMjBSEJQQAkBSAJQQFxBEAQYyEAEAAaIAYQ4wogABBqBSAGEOMKIAggAigCADYCACAGIAgoAgA2AgAgACAFQRRqIAEgBiAEIAMQ+wsgASgCACEAIAckCSAADwtBAAuuDgEjfyMJIQcjCUGQAWokCSMJIwpOBEBBkAEQAQsgB0HwAGohCiAHQfwAaiENIAdB+ABqIQ4gB0H0AGohDyAHQewAaiEQIAdB6ABqIREgB0HkAGohEiAHQeAAaiETIAdB3ABqIRQgB0HYAGohFSAHQdQAaiEWIAdB0ABqIRcgB0HMAGohGCAHQcgAaiEZIAdBxABqIRogB0FAayEbIAdBPGohHCAHQThqIR0gB0E0aiEeIAdBMGohHyAHQSxqISAgB0EoaiEhIAdBJGohIiAHQSBqISMgB0EcaiEkIAdBGGohJSAHQRRqISYgB0EQaiEnIAdBDGohKCAHQQhqISkgB0EEaiEqIAchCyAEQQA2AgAgB0GAAWoiCCADEK0KQQAkBUE2IAhB/IYDEE8hCSMFIQxBACQFIAxBAXEEQBBjIQwQABogCBDjCiAMEGoLIAgQ4woCfwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAIAZBGHRBGHVBJWsOVRYXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcAARcEFwUXBgcXFxcKFxcXFw4PEBcXFxMVFxcXFxcXFwABAgMDFxcBFwgXFwkLFwwXDRcLFxcREhQXCyANIAIoAgA2AgAgCCANKAIANgIAIAAgBUEYaiABIAggBCAJEO4LDBcLIA4gAigCADYCACAIIA4oAgA2AgAgACAFQRBqIAEgCCAEIAkQ7wsMFgsgAEEIaiIGKAIAKAIMIQsgBiALQf8BcUGaAWoRAwAhBiAPIAEoAgA2AgAgECACKAIANgIAIAYoAgAgBiAGLAALIgtBAEgiCRshAiAGKAIEIAtB/wFxIAkbQQJ0IAJqIQYgCiAPKAIANgIAIAggECgCADYCACABIAAgCiAIIAMgBCAFIAIgBhDwCzYCAAwVCyARIAIoAgA2AgAgCCARKAIANgIAIAAgBUEMaiABIAggBCAJEPELDBQLIBIgASgCADYCACATIAIoAgA2AgAgCiASKAIANgIAIAggEygCADYCACABIAAgCiAIIAMgBCAFQcCuAUHgrgEQ8As2AgAMEwsgFCABKAIANgIAIBUgAigCADYCACAKIBQoAgA2AgAgCCAVKAIANgIAIAEgACAKIAggAyAEIAVB4K4BQYCvARDwCzYCAAwSCyAWIAIoAgA2AgAgCCAWKAIANgIAIAAgBUEIaiABIAggBCAJEPILDBELIBcgAigCADYCACAIIBcoAgA2AgAgACAFQQhqIAEgCCAEIAkQ8wsMEAsgGCACKAIANgIAIAggGCgCADYCACAAIAVBHGogASAIIAQgCRD0CwwPCyAZIAIoAgA2AgAgCCAZKAIANgIAIAAgBUEQaiABIAggBCAJEPULDA4LIBogAigCADYCACAIIBooAgA2AgAgACAFQQRqIAEgCCAEIAkQ9gsMDQsgGyACKAIANgIAIAggGygCADYCACAAIAEgCCAEIAkQ9wsMDAsgHCACKAIANgIAIAggHCgCADYCACAAIAVBCGogASAIIAQgCRD4CwwLCyAdIAEoAgA2AgAgHiACKAIANgIAIAogHSgCADYCACAIIB4oAgA2AgAgASAAIAogCCADIAQgBUGArwFBrK8BEPALNgIADAoLIB8gASgCADYCACAgIAIoAgA2AgAgCiAfKAIANgIAIAggICgCADYCACABIAAgCiAIIAMgBCAFQbCvAUHErwEQ8As2AgAMCQsgISACKAIANgIAIAggISgCADYCACAAIAUgASAIIAQgCRD5CwwICyAiIAEoAgA2AgAgIyACKAIANgIAIAogIigCADYCACAIICMoAgA2AgAgASAAIAogCCADIAQgBUHQrwFB8K8BEPALNgIADAcLICQgAigCADYCACAIICQoAgA2AgAgACAFQRhqIAEgCCAEIAkQ+gsMBgsgACgCACgCFCEGICUgASgCADYCACAmIAIoAgA2AgAgCiAlKAIANgIAIAggJigCADYCACAAIAogCCADIAQgBSAGQT9xQeAEahEhAAwGCyAAQQhqIgYoAgAoAhghCyAGIAtB/wFxQZoBahEDACEGICcgASgCADYCACAoIAIoAgA2AgAgBigCACAGIAYsAAsiC0EASCIJGyECIAYoAgQgC0H/AXEgCRtBAnQgAmohBiAKICcoAgA2AgAgCCAoKAIANgIAIAEgACAKIAggAyAEIAUgAiAGEPALNgIADAQLICkgAigCADYCACAIICkoAgA2AgAgACAFQRRqIAEgCCAEIAkQ+wsMAwsgKiACKAIANgIAIAggKigCADYCACAAIAVBFGogASAIIAQgCRD8CwwCCyALIAIoAgA2AgAgCCALKAIANgIAIAAgASAIIAQgCRD9CwwBCyAEIAQoAgBBBHI2AgALIAEoAgALIQAgByQJIAALTQBB4PUCLAAARQRAQeD1AhCHDgRAQQAkBUEIEFgjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAAQagVBoIgDQZDzAjYCAAsLC0GgiAMoAgALTQBB0PUCLAAARQRAQdD1AhCHDgRAQQAkBUEJEFgjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAAQagVBnIgDQfDwAjYCAAsLC0GciAMoAgALTQBBwPUCLAAARQRAQcD1AhCHDgRAQQAkBUEKEFgjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAAQagVBmIgDQdDuAjYCAAsLC0GYiAMoAgALYwBBuPUCLAAARQRAQbj1AhCHDgRAQYyIA0IANwIAQZSIA0EANgIAQbDkARDqCyEAQQAkBUEVQYyIA0Gw5AEgABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAAEGoLCwtBjIgDC2MAQbD1AiwAAEUEQEGw9QIQhw4EQEGAiANCADcCAEGIiANBADYCAEGA5AEQ6gshAEEAJAVBFUGAiANBgOQBIAAQWyMFIQBBACQFIABBAXEEQBBjIQAQABogABBqCwsLQYCIAwtjAEGo9QIsAABFBEBBqPUCEIcOBEBB9IcDQgA3AgBB/IcDQQA2AgBB3OMBEOoLIQBBACQFQRVB9IcDQdzjASAAEFsjBSEAQQAkBSAAQQFxBEAQYyEAEAAaIAAQagsLC0H0hwMLYwBBoPUCLAAARQRAQaD1AhCHDgRAQeiHA0IANwIAQfCHA0EANgIAQbjjARDqCyEAQQAkBUEVQeiHA0G44wEgABBbIwUhAEEAJAUgAEEBcQRAEGMhABAAGiAAEGoLCwtB6IcDCwcAIAAQjAkLewECf0HI9QIsAABFBEBByPUCEIcOBEBB0O4CIQADQCAAQgA3AgAgAEEANgIIQQAhAQNAIAFBA0cEQCABQQJ0IABqQQA2AgAgAUEBaiEBDAELCyAAQQxqIgBB8PACRw0ACwsLQdDuAkGE5QEQ2A0aQdzuAkGQ5QEQ2A0aC4MDAQJ/Qdj1AiwAAEUEQEHY9QIQhw4EQEHw8AIhAANAIABCADcCACAAQQA2AghBACEBA0AgAUEDRwRAIAFBAnQgAGpBADYCACABQQFqIQEMAQsLIABBDGoiAEGQ8wJHDQALCwtB8PACQZzlARDYDRpB/PACQbzlARDYDRpBiPECQeDlARDYDRpBlPECQfjlARDYDRpBoPECQZDmARDYDRpBrPECQaDmARDYDRpBuPECQbTmARDYDRpBxPECQcjmARDYDRpB0PECQeTmARDYDRpB3PECQYznARDYDRpB6PECQaznARDYDRpB9PECQdDnARDYDRpBgPICQfTnARDYDRpBjPICQYToARDYDRpBmPICQZToARDYDRpBpPICQaToARDYDRpBsPICQZDmARDYDRpBvPICQbToARDYDRpByPICQcToARDYDRpB1PICQdToARDYDRpB4PICQeToARDYDRpB7PICQfToARDYDRpB+PICQYTpARDYDRpBhPMCQZTpARDYDRoLiwIBAn9B6PUCLAAARQRAQej1AhCHDgRAQZDzAiEAA0AgAEIANwIAIABBADYCCEEAIQEDQCABQQNHBEAgAUECdCAAakEANgIAIAFBAWohAQwBCwsgAEEMaiIAQbj0AkcNAAsLC0GQ8wJBpOkBENgNGkGc8wJBwOkBENgNGkGo8wJB3OkBENgNGkG08wJB/OkBENgNGkHA8wJBpOoBENgNGkHM8wJByOoBENgNGkHY8wJB5OoBENgNGkHk8wJBiOsBENgNGkHw8wJBmOsBENgNGkH88wJBqOsBENgNGkGI9AJBuOsBENgNGkGU9AJByOsBENgNGkGg9AJB2OsBENgNGkGs9AJB6OsBENgNGguGAQECfyMJIQYjCUEQaiQJIwkjCk4EQEEQEAELIABBCGoiACgCACgCACEHIAAgB0H/AXFBmgFqEQMAIQAgBiADKAIANgIAIAZBBGoiAyAGKAIANgIAIAIgAyAAIABBqAFqIAUgBEEAEKELIABrIgBBqAFIBEAgASAAQQxtQQdvNgIACyAGJAkLhgEBAn8jCSEGIwlBEGokCSMJIwpOBEBBEBABCyAAQQhqIgAoAgAoAgQhByAAIAdB/wFxQZoBahEDACEAIAYgAygCADYCACAGQQRqIgMgBigCADYCACACIAMgACAAQaACaiAFIARBABChCyAAayIAQaACSARAIAEgAEEMbUEMbzYCAAsgBiQJC+oLAQx/IwkhDyMJQRBqJAkjCSMKTgRAQRAQAQsgD0EIaiERIA9BBGohEiAPIRMgD0EMaiIQIAMQrQpBACQFQTYgEEH8hgMQTyEMIwUhC0EAJAUgC0EBcQRAEGMhCxAAGiAQEOMKIAsQagsgEBDjCiAEQQA2AgBBACELAkACQANAAkAgASgCACEIIAtFIAYgB0dxRQ0AIAghCyAIBH8gCCgCDCIJIAgoAhBGBH8gCCgCACgCJCEJIAggCUH/AXFBmgFqEQMABSAJKAIAEOoBCxCgCBCiCAR/IAFBADYCAEEAIQhBACELQQEFQQALBUEAIQhBAQshDSACKAIAIgohCQJAAkAgCkUNACAKKAIMIg4gCigCEEYEfyAKKAIAKAIkIQ4gCiAOQf8BcUGaAWoRAwAFIA4oAgAQ6gELEKAIEKIIBEAgAkEANgIAQQAhCQwBBSANRQ0FCwwBCyANDQNBACEKCyAMKAIAKAI0IQ0gDCAGKAIAQQAgDUE/cUHgA2oRBABB/wFxQSVGBEAgByAGQQRqIg1GDQMgDCgCACgCNCEKAkACQAJAIAwgDSgCAEEAIApBP3FB4ANqEQQAIgpBGHRBGHVBMGsOFgABAQEBAQEBAQEBAQEBAQEBAQEBAQABCyAHIAZBCGoiBkYNBSAMKAIAKAI0IQ4gCiEIIAwgBigCAEEAIA5BP3FB4ANqEQQAIQogDSEGDAELQQAhCAsgACgCACgCJCENIBIgCzYCACATIAk2AgAgESASKAIANgIAIBAgEygCADYCACABIAAgESAQIAMgBCAFIAogCCANQQ9xQbAFahEgADYCACAGQQhqIQYFAkAgDCgCACgCDCELIAxBgMAAIAYoAgAgC0E/cUHgA2oRBABFBEAgCEEMaiILKAIAIgkgCEEQaiIKKAIARgR/IAgoAgAoAiQhCSAIIAlB/wFxQZoBahEDAAUgCSgCABDqAQshCSAMKAIAKAIcIQ0gDCAJIA1BP3FBngNqER4AIQkgDCgCACgCHCENIAwgBigCACANQT9xQZ4DahEeACAJRwRAIARBBDYCAAwCCyALKAIAIgkgCigCAEYEQCAIKAIAKAIoIQsgCCALQf8BcUGaAWoRAwAaBSALIAlBBGo2AgAgCSgCABDqARoLIAZBBGohBgwBCwNAAkAgByAGQQRqIgZGBEAgByEGDAELIAwoAgAoAgwhCyAMQYDAACAGKAIAIAtBP3FB4ANqEQQADQELCyAKIQsDQCAIBH8gCCgCDCIJIAgoAhBGBH8gCCgCACgCJCEJIAggCUH/AXFBmgFqEQMABSAJKAIAEOoBCxCgCBCiCAR/IAFBADYCAEEAIQhBAQVBAAsFQQAhCEEBCyEJAkACQCALRQ0AIAsoAgwiCiALKAIQRgR/IAsoAgAoAiQhCiALIApB/wFxQZoBahEDAAUgCigCABDqAQsQoAgQoggEQCACQQA2AgAMAQUgCUUNBAsMAQsgCQ0CQQAhCwsgCEEMaiIJKAIAIgogCEEQaiINKAIARgR/IAgoAgAoAiQhCiAIIApB/wFxQZoBahEDAAUgCigCABDqAQshCiAMKAIAKAIMIQ4gDEGAwAAgCiAOQT9xQeADahEEAEUNASAJKAIAIgogDSgCAEYEQCAIKAIAKAIoIQkgCCAJQf8BcUGaAWoRAwAaBSAJIApBBGo2AgAgCigCABDqARoLDAAACwALCyAEKAIAIQsMAQsLDAELIARBBDYCAAsgCAR/IAgoAgwiACAIKAIQRgR/IAgoAgAoAiQhACAIIABB/wFxQZoBahEDAAUgACgCABDqAQsQoAgQoggEfyABQQA2AgBBACEIQQEFQQALBUEAIQhBAQshAAJAAkACQCACKAIAIgFFDQAgASgCDCIDIAEoAhBGBH8gASgCACgCJCEDIAEgA0H/AXFBmgFqEQMABSADKAIAEOoBCxCgCBCiCARAIAJBADYCAAwBBSAARQ0CCwwCCyAADQAMAQsgBCAEKAIAQQJyNgIACyAPJAkgCAtuACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ/gshAiAEKAIAIgNBBHFFIAJBf2pBH0lxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtrACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ/gshAiAEKAIAIgNBBHFFIAJBGEhxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtuACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ/gshAiAEKAIAIgNBBHFFIAJBf2pBDElxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtsACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQMQ/gshAiAEKAIAIgNBBHFFIAJB7gJIcQRAIAEgAjYCAAUgBCADQQRyNgIACyAAJAkLbgAjCSEAIwlBEGokCSMJIwpOBEBBEBABCyAAIAMoAgA2AgAgAEEEaiIDIAAoAgA2AgAgAiADIAQgBUECEP4LIQIgBCgCACIDQQRxRSACQQ1IcQRAIAEgAkF/ajYCAAUgBCADQQRyNgIACyAAJAkLawAjCSEAIwlBEGokCSMJIwpOBEBBEBABCyAAIAMoAgA2AgAgAEEEaiIDIAAoAgA2AgAgAiADIAQgBUECEP4LIQIgBCgCACIDQQRxRSACQTxIcQRAIAEgAjYCAAUgBCADQQRyNgIACyAAJAkLuwQBAn8DQAJAIAEoAgAiAAR/IAAoAgwiBSAAKAIQRgR/IAAoAgAoAiQhBSAAIAVB/wFxQZoBahEDAAUgBSgCABDqAQsQoAgQoggEfyABQQA2AgBBAQUgASgCAEULBUEBCyEFAkACQCACKAIAIgBFDQAgACgCDCIGIAAoAhBGBH8gACgCACgCJCEGIAAgBkH/AXFBmgFqEQMABSAGKAIAEOoBCxCgCBCiCARAIAJBADYCAAwBBSAFRQ0DCwwBCyAFBH9BACEADAIFQQALIQALIAEoAgAiBSgCDCIGIAUoAhBGBH8gBSgCACgCJCEGIAUgBkH/AXFBmgFqEQMABSAGKAIAEOoBCyEFIAQoAgAoAgwhBiAEQYDAACAFIAZBP3FB4ANqEQQARQ0AIAEoAgAiAEEMaiIGKAIAIgUgACgCEEYEQCAAKAIAKAIoIQUgACAFQf8BcUGaAWoRAwAaBSAGIAVBBGo2AgAgBSgCABDqARoLDAELCyABKAIAIgQEfyAEKAIMIgUgBCgCEEYEfyAEKAIAKAIkIQUgBCAFQf8BcUGaAWoRAwAFIAUoAgAQ6gELEKAIEKIIBH8gAUEANgIAQQEFIAEoAgBFCwVBAQshAQJAAkACQCAARQ0AIAAoAgwiBCAAKAIQRgR/IAAoAgAoAiQhBCAAIARB/wFxQZoBahEDAAUgBCgCABDqAQsQoAgQoggEQCACQQA2AgAMAQUgAUUNAgsMAgsgAQ0ADAELIAMgAygCAEECcjYCAAsL8wEBBX8jCSEHIwlBEGokCSMJIwpOBEBBEBABCyAHQQRqIQggByEJIABBCGoiACgCACgCCCEGIAAgBkH/AXFBmgFqEQMAIgAsAAsiBkEASAR/IAAoAgQFIAZB/wFxCyEGQQAgACwAFyIKQQBIBH8gACgCEAUgCkH/AXELayAGRgRAIAQgBCgCAEEEcjYCAAUCQCAJIAMoAgA2AgAgCCAJKAIANgIAIAIgCCAAIABBGGogBSAEQQAQoQsgAGsiAkUgASgCACIAQQxGcQRAIAFBADYCAAwBCyACQQxGIABBDEhxBEAgASAAQQxqNgIACwsLIAckCQtrACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQIQ/gshAiAEKAIAIgNBBHFFIAJBPUhxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQtrACMJIQAjCUEQaiQJIwkjCk4EQEEQEAELIAAgAygCADYCACAAQQRqIgMgACgCADYCACACIAMgBCAFQQEQ/gshAiAEKAIAIgNBBHFFIAJBB0hxBEAgASACNgIABSAEIANBBHI2AgALIAAkCQt7AQF/IwkhBiMJQRBqJAkjCSMKTgRAQRAQAQsgBiADKAIANgIAIAZBBGoiACAGKAIANgIAIAIgACAEIAVBBBD+CyEAIAQoAgBBBHFFBEAgASAAQcUASAR/IABB0A9qBSAAQewOaiAAIABB5ABIGwtBlHFqNgIACyAGJAkLXAAjCSEAIwlBEGokCSMJIwpOBEBBEBABCyAAIAMoAgA2AgAgAEEEaiIDIAAoAgA2AgAgAiADIAQgBUEEEP4LIQIgBCgCAEEEcUUEQCABIAJBlHFqNgIACyAAJAkL0gQBAn8gASgCACIABH8gACgCDCIFIAAoAhBGBH8gACgCACgCJCEFIAAgBUH/AXFBmgFqEQMABSAFKAIAEOoBCxCgCBCiCAR/IAFBADYCAEEBBSABKAIARQsFQQELIQUCQAJAAkAgAigCACIABEAgACgCDCIGIAAoAhBGBH8gACgCACgCJCEGIAAgBkH/AXFBmgFqEQMABSAGKAIAEOoBCxCgCBCiCARAIAJBADYCAAUgBQRADAQFDAMLAAsLIAVFBEBBACEADAILCyADIAMoAgBBBnI2AgAMAQsgASgCACIFKAIMIgYgBSgCEEYEfyAFKAIAKAIkIQYgBSAGQf8BcUGaAWoRAwAFIAYoAgAQ6gELIQUgBCgCACgCNCEGIAQgBUEAIAZBP3FB4ANqEQQAQf8BcUElRwRAIAMgAygCAEEEcjYCAAwBCyABKAIAIgRBDGoiBigCACIFIAQoAhBGBEAgBCgCACgCKCEFIAQgBUH/AXFBmgFqEQMAGgUgBiAFQQRqNgIAIAUoAgAQ6gEaCyABKAIAIgQEfyAEKAIMIgUgBCgCEEYEfyAEKAIAKAIkIQUgBCAFQf8BcUGaAWoRAwAFIAUoAgAQ6gELEKAIEKIIBH8gAUEANgIAQQEFIAEoAgBFCwVBAQshAQJAAkAgAEUNACAAKAIMIgQgACgCEEYEfyAAKAIAKAIkIQQgACAEQf8BcUGaAWoRAwAFIAQoAgAQ6gELEKAIEKIIBEAgAkEANgIADAEFIAENAwsMAQsgAUUNAQsgAyADKAIAQQJyNgIACwuqCAEHfyAAKAIAIggEfyAIKAIMIgYgCCgCEEYEfyAIKAIAKAIkIQYgCCAGQf8BcUGaAWoRAwAFIAYoAgAQ6gELEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBQJAAkACQCABKAIAIggEQCAIKAIMIgYgCCgCEEYEfyAIKAIAKAIkIQYgCCAGQf8BcUGaAWoRAwAFIAYoAgAQ6gELEKAIEKIIBEAgAUEANgIABSAFBEAMBAUMAwsACwsgBUUEQEEAIQgMAgsLIAIgAigCAEEGcjYCAEEAIQYMAQsgACgCACIFKAIMIgYgBSgCEEYEfyAFKAIAKAIkIQYgBSAGQf8BcUGaAWoRAwAFIAYoAgAQ6gELIQUgAygCACgCDCEGIANBgBAgBSAGQT9xQeADahEEAEUEQCACIAIoAgBBBHI2AgBBACEGDAELIAMoAgAoAjQhBiADIAVBACAGQT9xQeADahEEAEEYdEEYdSEGIAAoAgAiB0EMaiIFKAIAIgsgBygCEEYEQCAHKAIAKAIoIQUgByAFQf8BcUGaAWoRAwAaBSAFIAtBBGo2AgAgCygCABDqARoLIAQhBSAIIQQDQAJAIAZBUGohBiAFQX9qIQsgACgCACIJBH8gCSgCDCIHIAkoAhBGBH8gCSgCACgCJCEHIAkgB0H/AXFBmgFqEQMABSAHKAIAEOoBCxCgCBCiCAR/IABBADYCAEEBBSAAKAIARQsFQQELIQkgCAR/IAgoAgwiByAIKAIQRgR/IAgoAgAoAiQhByAIIAdB/wFxQZoBahEDAAUgBygCABDqAQsQoAgQoggEfyABQQA2AgBBACEEQQAhCEEBBUEACwVBACEIQQELIQcgACgCACEKIAcgCXMgBUEBSnFFDQAgCigCDCIFIAooAhBGBH8gCigCACgCJCEFIAogBUH/AXFBmgFqEQMABSAFKAIAEOoBCyEHIAMoAgAoAgwhBSADQYAQIAcgBUE/cUHgA2oRBABFDQIgAygCACgCNCEFIAZBCmwgAyAHQQAgBUE/cUHgA2oRBABBGHRBGHVqIQYgACgCACIJQQxqIgUoAgAiByAJKAIQRgRAIAkoAgAoAighBSAJIAVB/wFxQZoBahEDABoFIAUgB0EEajYCACAHKAIAEOoBGgsgCyEFDAELCyAKBH8gCigCDCIDIAooAhBGBH8gCigCACgCJCEDIAogA0H/AXFBmgFqEQMABSADKAIAEOoBCxCgCBCiCAR/IABBADYCAEEBBSAAKAIARQsFQQELIQMCQAJAIARFDQAgBCgCDCIAIAQoAhBGBH8gBCgCACgCJCEAIAQgAEH/AXFBmgFqEQMABSAAKAIAEOoBCxCgCBCiCARAIAFBADYCAAwBBSADDQMLDAELIANFDQELIAIgAigCAEECcjYCAAsgBgsPACAAQQhqEIQMIAAQiQILFAAgAEEIahCEDCAAEIkCIAAQvQ0LzwEAIwkhAiMJQfAAaiQJIwkjCk4EQEHwABABCyACQeQAaiIDIAJB5ABqNgIAIABBCGogAiADIAQgBSAGEIIMIAMoAgAhBSACIQMgASgCACEAA0AgAyAFRwRAIAMsAAAhASAABH9BACAAIABBGGoiBigCACIEIAAoAhxGBH8gACgCACgCNCEEIAAgARCmCCAEQT9xQZ4DahEeAAUgBiAEQQFqNgIAIAQgAToAACABEKYICxCgCBCiCBsFQQALIQAgA0EBaiEDDAELCyACJAkgAAt+AQR/IwkhByMJQRBqJAkjCSMKTgRAQRAQAQsgByIGQSU6AAAgBkEBaiIIIAQ6AAAgBkECaiIJIAU6AAAgBkEAOgADIAVB/wFxBEAgCCAFOgAAIAkgBDoAAAsgAiABIAEgAigCABCDDCAGIAMgACgCABCRASABajYCACAHJAkLBwAgASAAawtDAQN/IAAoAgAhAkEAJAVBFhBNIQMjBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgAiADRwRAIAAoAgAQ0gkLC88BACMJIQIjCUGgA2okCSMJIwpOBEBBoAMQAQsgAkGQA2oiAyACQZADajYCACAAQQhqIAIgAyAEIAUgBhCGDCADKAIAIQUgAiEDIAEoAgAhAANAIAMgBUcEQCADKAIAIQEgAAR/QQAgACAAQRhqIgYoAgAiBCAAKAIcRgR/IAAoAgAoAjQhBCAAIAEQ6gEgBEE/cUGeA2oRHgAFIAYgBEEEajYCACAEIAE2AgAgARDqAQsQoAgQoggbBUEACyEAIANBBGohAwwBCwsgAiQJIAALpgEBAn8jCSEGIwlBgAFqJAkjCSMKTgRAQYABEAELIAZB9ABqIgcgBkHkAGo2AgAgACAGIAcgAyAEIAUQggwgBkHoAGoiA0IANwMAIAZB8ABqIgQgBjYCACABIAIoAgAQhwwhBSAAKAIAEN0JIQAgASAEIAUgAxDgCSEDIAAEQCAAEN0JGgsgA0F/RgRAQdzIAhCIDAUgAiADQQJ0IAFqNgIAIAYkCQsLCgAgASAAa0ECdQtCAQF/QQgQYCEBQQAkBUGEASABIAAQWiMFIQBBACQFIABBAXEEQBBjIQAQABogARBlIAAQagUgAUHIyQFByQEQZwsLBQBB/wALNwEBfyAAQgA3AgAgAEEANgIIQQAhAgNAIAJBA0cEQCACQQJ0IABqQQA2AgAgAkEBaiECDAELCwsZACAAQgA3AgAgAEEANgIIIABBAUEtEMUNCwwAIABBgoaAIDYAAAsZACAAQgA3AgAgAEEANgIIIABBAUEtENINC/8HAQx/IwkhByMJQYACaiQJIwkjCk4EQEGAAhABCyAHQfABaiELIAdB2AFqIRAgB0HkAWohDiAHQfoBaiEJIAdB3AFqIQogByERIAdB6AFqIgggB0HwAGoiADYCACAIQYwCNgIEIABB5ABqIQwgB0HgAWoiDSAEEK0KQQAkBUE2IA1B3IYDEE8hACMFIQ9BACQFIA9BAXEEQBBjIQAQABoFIAlBADoAACAKIAIoAgA2AgAgBCgCBCEEQQAkBSALIAooAgA2AgBBASABIAsgAyANIAQgBSAJIAAgCCAOIAwQViEDIwUhBEEAJAUCQAJAIARBAXENAAJAIAMEQAJAIAAoAgAoAiAhA0EAJAUgAyAAQbvKAkHFygIgCxBRGiMFIQBBACQFIABBAXEEQBBjIQAQABoFAkACQCAOKAIAIgogCCgCACIEayIAQeIASgRAIABBAmoQgAoiACEDIAANAUEAJAVBBBBYQQAkBQUgESEAQQAhAwwBCwwBCyAJLAAABEAgAEEtOgAAIABBAWohAAsgC0EKaiEMIAshDyAAIQkDQCAEIApJBEAgBCwAACEKIAshAANAAkAgACAMRgRAIAwhAAwBCyAALAAAIApHBEAgAEEBaiEADAILCwsgCSAAIA9rQbvKAmosAAA6AAAgBEEBaiEEIAlBAWohCSAOKAIAIQoMAQsLIAlBADoAACAQIAY2AgAgEUHGygIgEBCjCUEBRwRAQQAkBUGNAkHKygIQWUEAJAUMAQsgAwRAIAMQgQoLDAILEGMhABAAGiADBEAgAxCBCgsLDAILCyABKAIAIgAEfyAAKAIMIgMgACgCEEYEQCAAKAIAKAIkIQNBACQFIAMgABBOIQAjBSEDQQAkBSADQQFxDQMFIAMsAAAQpgghAAsgABCgCBCiCAR/IAFBADYCAEEBBSABKAIARQsFQQELIQMCQAJAAkAgAigCACIARQ0AIAAoAgwiBCAAKAIQRgRAIAAoAgAoAiQhBEEAJAUgBCAAEE4hACMFIQRBACQFIARBAXENBQUgBCwAABCmCCEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAFIAUoAgBBAnI2AgALIAEoAgAhASANEOMKIAgoAgAhACAIQQA2AgAgAARAIAgoAgQhAkEAJAUgAiAAEFkjBSEAQQAkBSAAQQFxBEBBABBkIQAQABogABDJAQsLIAckCSABDwsMAQsQYyEAEAAaCwsgDRDjCiAIKAIAIQEgCEEANgIAIAEEQCAIKAIEIQJBACQFIAIgARBZIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQyQEFIAAhEgsFIAAhEgsgEhBqQQALrQcBC38jCSEIIwlBgAFqJAkjCSMKTgRAQYABEAELIAhB+ABqIQcgCEHsAGohDiAIQfwAaiELIAhB6ABqIQwgCEHwAGoiCSAINgIAIAlBjAI2AgQgCEHkAGohECAIQeQAaiINIAQQrQpBACQFQTYgDUHchgMQTyEKIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgC0EAOgAAIAwgAigCACIANgIAIAQoAgQhESAAIQRBACQFIAcgDCgCADYCAEEBIAEgByADIA0gESAFIAsgCiAJIA4gEBBWIQMjBSEMQQAkBQJAAkAgDEEBcQ0AAkAgAwRAIAZBC2oiAywAAEEASARAIAYoAgAhAyAHQQA6AAAgAyAHEKUIIAZBADYCBAUgB0EAOgAAIAYgBxClCCADQQA6AAALIAssAAAEQCAKKAIAKAIcIQNBACQFIAMgCkEtEE8hAyMFIQdBACQFIAdBAXENA0EAJAVBhQEgBiADEFojBSEDQQAkBSADQQFxDQMLIAooAgAoAhwhA0EAJAUgAyAKQTAQTyEHIwUhA0EAJAUgA0EBcQRAEGMhABAAGgwCCyAOKAIAIgpBf2ohCyAJKAIAIQMDQAJAIAMgC08NACADLQAAIAdB/wFxRw0AIANBAWohAwwBCwtBACQFQSUgBiADIAoQUBojBSEDQQAkBSADQQFxBEAQYyEAEAAaDAILCyABKAIAIgMEfyADKAIMIgYgAygCEEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQMjBSEGQQAkBSAGQQFxDQMFIAYsAAAQpgghAwsgAxCgCBCiCAR/IAFBADYCAEEBBSABKAIARQsFQQELIQMCQAJAAkAgAEUNACAEKAIMIgYgBCgCEEYEQCAAKAIAKAIkIQBBACQFIAAgBBBOIQAjBSEEQQAkBSAEQQFxDQUFIAYsAAAQpgghAAsgABCgCBCiCARAIAJBADYCAAwBBSADRQ0CCwwCCyADDQAMAQsgBSAFKAIAQQJyNgIACyABKAIAIQEgDRDjCiAJKAIAIQAgCUEANgIAIAAEQCAJKAIEIQJBACQFIAIgABBZIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELCyAIJAkgAQ8LDAELEGMhABAAGgsLIA0Q4wogCSgCACEBIAlBADYCACABBEAgCSgCBCECQQAkBSACIAEQWSMFIQFBACQFIAFBAXEEQEEAEGQhABAAGiAAEMkBBSAAIQ8LBSAAIQ8LIA8QakEAC780ASV/IwkhDCMJQYAEaiQJIwkjCk4EQEGABBABCyAMQfADaiEdIAxB7QNqIScgDEHsA2ohKCAMQbwDaiENIAxBsANqIQ4gDEGkA2ohDyAMQZgDaiEQIAxBlANqIRkgDEGQA2ohIiAMQegDaiIeIAo2AgAgDEHgA2oiESAMNgIAIBFBjAI2AgQgDEHYA2oiFSAMNgIAIAxB1ANqIh8gDEGQA2o2AgAgDEHIA2oiF0IANwIAIBdBADYCCEEAIQoDQCAKQQNHBEAgCkECdCAXakEANgIAIApBAWohCgwBCwsgDUIANwIAIA1BADYCCEEAIQoDQCAKQQNHBEAgCkECdCANakEANgIAIApBAWohCgwBCwsgDkIANwIAIA5BADYCCEEAIQoDQCAKQQNHBEAgCkECdCAOakEANgIAIApBAWohCgwBCwsgD0IANwIAIA9BADYCCEEAIQoDQCAKQQNHBEAgCkECdCAPakEANgIAIApBAWohCgwBCwsgEEIANwIAIBBBADYCCEEAIQoDQCAKQQNHBEAgCkECdCAQakEANgIAIApBAWohCgwBCwtBACQFQQEgAiADIB0gJyAoIBcgDSAOIA8gGRBeIwUhAkEAJAUgAkEBcQRAEGMhEhAAGgUCQCAJIAgoAgA2AgAgB0EIaiEaIA5BC2ohGyAOQQRqISMgD0ELaiEcIA9BBGohJCAXQQtqISogF0EEaiErIARBgARxQQBHISkgDUELaiEgIB1BA2ohLCANQQRqISUgEEELaiEtIBBBBGohLkEAIQJBACEUA0ACQCAUQQRPBEBBhQIhAwwBCyAAKAIAIgMEfyADKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBJCEDDAMLBSAELAAAEKYIIQMLIAMQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEEAkACQCABKAIAIgpFDQAgCigCDCIDIAooAhBGBEAgCigCACgCJCEDQQAkBSADIAoQTiEDIwUhB0EAJAUgB0EBcQRAQSQhAwwECwUgAywAABCmCCEDCyADEKAIEKIIBEAgAUEANgIADAEFIARFBEBBhQIhAwwECwsMAQsgBAR/QYUCIQMMAgVBAAshCgsCQAJAAkACQAJAAkACQCAUIB1qLAAADgUBAAMCBAYLIBRBA0cEQCAAKAIAIgMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEkIQMMCQsFIAQsAAAQpgghAwsgA0H/AXFBGHRBGHVBf0wEQEEyIQMMCAsgGigCACADQRh0QRh1QQF0ai4BAEGAwABxRQRAQTIhAwwICyAAKAIAIgNBDGoiBygCACIEIAMoAhBGBEAgAygCACgCKCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSQhAwwJCwUgByAEQQFqNgIAIAQsAAAQpgghAwtBACQFQYUBIBAgA0H/AXEQWiMFIQNBACQFIANBAXFFDQVBJCEDDAcLDAULIBRBA0cNAwwECyAjKAIAIBssAAAiA0H/AXEgA0EASBsiA0EAICQoAgAgHCwAACIEQf8BcSAEQQBIGyIKa0cEQCADRQRAIAAoAgAiAygCDCIEIAMoAhBGBEAgAygCACgCJCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSQhAwwICwUgBCwAABCmCCEDCyAPKAIAIA8gHCwAAEEASBstAAAgA0H/AXFHDQUgACgCACIDQQxqIgcoAgAiBCADKAIQRgRAIAMoAgAoAighBEEAJAUgBCADEE4aIwUhA0EAJAUgA0EBcQRAQSQhAwwICwUgByAEQQFqNgIAIAQsAAAQpggaCyAGQQE6AAAgDyACICQoAgAgHCwAACICQf8BcSACQQBIG0EBSxshAgwFCyAAKAIAIgMoAgwiBCADKAIQRiEHIApFBEAgBwRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEkIQMMCAsFIAQsAAAQpgghAwsgDigCACAOIBssAABBAEgbLQAAIANB/wFxRwRAIAZBAToAAAwGCyAAKAIAIgNBDGoiBygCACIEIAMoAhBGBEAgAygCACgCKCEEQQAkBSAEIAMQThojBSEDQQAkBSADQQFxBEBBJCEDDAgLBSAHIARBAWo2AgAgBCwAABCmCBoLIA4gAiAjKAIAIBssAAAiAkH/AXEgAkEASBtBAUsbIQIMBQsgBwRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEkIQMMBwsFIAQsAAAQpgghAwsgACgCACIEQQxqIgsoAgAiByAEKAIQRiEKIA4oAgAgDiAbLAAAQQBIGy0AACADQf8BcUYEQCAKBEAgBCgCACgCKCEDQQAkBSADIAQQThojBSEDQQAkBSADQQFxBEBBJCEDDAgLBSALIAdBAWo2AgAgBywAABCmCBoLIA4gAiAjKAIAIBssAAAiAkH/AXEgAkEASBtBAUsbIQIMBQsgCgRAIAQoAgAoAiQhA0EAJAUgAyAEEE4hAyMFIQRBACQFIARBAXEEQEEkIQMMBwsFIAcsAAAQpgghAwsgDygCACAPIBwsAABBAEgbLQAAIANB/wFxRwRAQfEAIQMMBgsgACgCACIDQQxqIgcoAgAiBCADKAIQRgRAIAMoAgAoAighBEEAJAUgBCADEE4aIwUhA0EAJAUgA0EBcQRAQSQhAwwHCwUgByAEQQFqNgIAIAQsAAAQpggaCyAGQQE6AAAgDyACICQoAgAgHCwAACICQf8BcSACQQBIG0EBSxshAgsMAwsCQAJAIBRBAkkgAnIEQCANKAIAIgcgDSAgLAAAIgNBAEgiCxsiFiEEIBQNAQUgFEECRiAsLAAAQQBHcSApckUEQEEAIQIMBgsgDSgCACIHIA0gICwAACIDQQBIIgsbIhYhBAwBCwwBCyAdIBRBf2pqLQAAQQJIBEAgJSgCACADQf8BcSALGyAWaiEhIAQhCwNAAkAgISALIhNGDQAgEywAACIYQX9MDQAgGigCACAYQQF0ai4BAEGAwABxRQ0AIBNBAWohCwwBCwsgLSwAACIYQQBIIRMgCyAEayIhIC4oAgAiJiAYQf8BcSIYIBMbTQRAICYgECgCAGoiJiAQIBhqIhggExshLyAmICFrIBggIWsgExshEwNAIBMgL0YEQCALIQQMBAsgEywAACAWLAAARgRAIBZBAWohFiATQQFqIRMMAQsLCwsLA0ACQCAEIAcgDSADQRh0QRh1QQBIIgcbICUoAgAgA0H/AXEgBxtqRg0AIAAoAgAiAwR/IAMoAgwiByADKAIQRgRAIAMoAgAoAiQhB0EAJAUgByADEE4hAyMFIQdBACQFIAdBAXEEQEGaASEDDAgLBSAHLAAAEKYIIQMLIAMQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEHAkACQCAKRQ0AIAooAgwiAyAKKAIQRgRAIAooAgAoAiQhA0EAJAUgAyAKEE4hAyMFIQtBACQFIAtBAXEEQEGaASEDDAkLBSADLAAAEKYIIQMLIAMQoAgQoggEQCABQQA2AgAMAQUgB0UNAwsMAQsgBw0BQQAhCgsgACgCACIDKAIMIgcgAygCEEYEQCADKAIAKAIkIQdBACQFIAcgAxBOIQMjBSEHQQAkBSAHQQFxBEBBmgEhAwwHCwUgBywAABCmCCEDCyAELQAAIANB/wFxRw0AIAAoAgAiA0EMaiILKAIAIgcgAygCEEYEQCADKAIAKAIoIQdBACQFIAcgAxBOGiMFIQNBACQFIANBAXEEQEGbASEDDAcLBSALIAdBAWo2AgAgBywAABCmCBoLIARBAWohBCAgLAAAIQMgDSgCACEHDAELCyApBEAgBCANKAIAIA0gICwAACIDQQBIIgQbICUoAgAgA0H/AXEgBBtqRwRAQZ4BIQMMBQsLDAILQQAhBCAKIQMDQAJAIAAoAgAiBwR/IAcoAgwiCyAHKAIQRgRAIAcoAgAoAiQhC0EAJAUgCyAHEE4hByMFIQtBACQFIAtBAXEEQEG3ASEDDAcLBSALLAAAEKYIIQcLIAcQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyELAkACQCAKRQ0AIAooAgwiByAKKAIQRgRAIAooAgAoAiQhB0EAJAUgByAKEE4hByMFIRZBACQFIBZBAXEEQEG3ASEDDAgLBSAHLAAAEKYIIQcLIAcQoAgQoggEQCABQQA2AgBBACEDDAEFIAtFDQMLDAELIAsNAUEAIQoLIAAoAgAiBygCDCILIAcoAhBGBEAgBygCACgCJCELQQAkBSALIAcQTiEHIwUhC0EAJAUgC0EBcQRAQboBIQMMBgsFIAssAAAQpgghBwsCfwJAIAdB/wFxIgtBGHRBGHVBf0wNACAaKAIAIAdBGHRBGHVBAXRqLgEAQYAQcUUNACAJKAIAIgcgHigCAEYEQEEAJAVBFiAIIAkgHhBbIwUhB0EAJAUgB0EBcQRAQboBIQMMCAsgCSgCACEHCyAJIAdBAWo2AgAgByALOgAAIARBAWoMAQsgKygCACAqLAAAIgdB/wFxIAdBAEgbQQBHIARBAEdxICgtAAAgC0H/AXFGcUUNASAVKAIAIgcgHygCAEYEQEEAJAVBFyARIBUgHxBbIwUhB0EAJAUgB0EBcQRAQboBIQMMBwsgFSgCACEHCyAVIAdBBGo2AgAgByAENgIAQQALIQQgACgCACIHQQxqIhYoAgAiCyAHKAIQRgRAIAcoAgAoAighC0EAJAUgCyAHEE4aIwUhB0EAJAUgB0EBcQRAQbcBIQMMBgsFIBYgC0EBajYCACALLAAAEKYIGgsMAQsLIBUoAgAiByARKAIARyAEQQBHcQRAIAcgHygCAEYEQEEAJAVBFyARIBUgHxBbIwUhB0EAJAUgB0EBcQRAQbgBIQMMBQsgFSgCACEHCyAVIAdBBGo2AgAgByAENgIACyAZKAIAQQBKBEACQCAAKAIAIgQEfyAEKAIMIgcgBCgCEEYEQCAEKAIAKAIkIQdBACQFIAcgBBBOIQQjBSEHQQAkBSAHQQFxBEBBuAEhAwwHCwUgBywAABCmCCEECyAEEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBwJAAkAgA0UNACADKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQQjBSEKQQAkBSAKQQFxBEBBuAEhAwwICwUgBCwAABCmCCEECyAEEKAIEKIIBEAgAUEANgIADAEFIAdFBEBB3gEhAwwICwsMAQsgBwR/Qd4BIQMMBgVBAAshAwsgACgCACIEKAIMIgcgBCgCEEYEQCAEKAIAKAIkIQdBACQFIAcgBBBOIQQjBSEHQQAkBSAHQQFxBEBBuAEhAwwGCwUgBywAABCmCCEECyAnLQAAIARB/wFxRwRAQd4BIQMMBQsgACgCACIEQQxqIgooAgAiByAEKAIQRgRAIAQoAgAoAighB0EAJAUgByAEEE4aIwUhBEEAJAUgBEEBcQRAQbgBIQMMBgsFIAogB0EBajYCACAHLAAAEKYIGgsDQCAZKAIAQQBMDQEgACgCACIEBH8gBCgCDCIHIAQoAhBGBEAgBCgCACgCJCEHQQAkBSAHIAQQTiEEIwUhB0EAJAUgB0EBcQRAQbYBIQMMCAsFIAcsAAAQpgghBAsgBBCgCBCiCAR/IABBADYCAEEBBSAAKAIARQsFQQELIQcCQAJAIANFDQAgAygCDCIEIAMoAhBGBEAgAygCACgCJCEEQQAkBSAEIAMQTiEEIwUhCkEAJAUgCkEBcQRAQbYBIQMMCQsFIAQsAAAQpgghBAsgBBCgCBCiCARAIAFBADYCAAwBBSAHRQRAQfgBIQMMCQsLDAELIAcEf0H4ASEDDAcFQQALIQMLIAAoAgAiBCgCDCIHIAQoAhBGBEAgBCgCACgCJCEHQQAkBSAHIAQQTiEEIwUhB0EAJAUgB0EBcQRAQbYBIQMMBwsFIAcsAAAQpgghBAsgBEH/AXFBGHRBGHVBf0wEQEH4ASEDDAYLIBooAgAgBEEYdEEYdUEBdGouAQBBgBBxRQRAQfgBIQMMBgsgCSgCACAeKAIARgRAQQAkBUEWIAggCSAeEFsjBSEEQQAkBSAEQQFxBEBBtgEhAwwHCwsgACgCACIEKAIMIgcgBCgCEEYEQCAEKAIAKAIkIQdBACQFIAcgBBBOIQQjBSEHQQAkBSAHQQFxBEBBtgEhAwwHCwUgBywAABCmCCEECyAJIAkoAgAiB0EBajYCACAHIAQ6AAAgGSAZKAIAQX9qNgIAIAAoAgAiBEEMaiIKKAIAIgcgBCgCEEYEQCAEKAIAKAIoIQdBACQFIAcgBBBOGiMFIQRBACQFIARBAXEEQEG2ASEDDAcLBSAKIAdBAWo2AgAgBywAABCmCBoLDAAACwALCyAJKAIAIAgoAgBGBEBBgwIhAwwDCwwBCwNAIAAoAgAiAwR/IAMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEjIQMMBQsFIAQsAAAQpgghAwsgAxCgCBCiCAR/IABBADYCAEEBBSAAKAIARQsFQQELIQQCQAJAIApFDQAgCigCDCIDIAooAhBGBEAgCigCACgCJCEDQQAkBSADIAoQTiEDIwUhB0EAJAUgB0EBcQRAQSMhAwwGCwUgAywAABCmCCEDCyADEKAIEKIIBEAgAUEANgIADAEFIARFDQQLDAELIAQNAkEAIQoLIAAoAgAiAygCDCIEIAMoAhBGBEAgAygCACgCJCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSMhAwwECwUgBCwAABCmCCEDCyADQf8BcUEYdEEYdUF/TA0BIBooAgAgA0EYdEEYdUEBdGouAQBBgMAAcUUNASAAKAIAIgNBDGoiBygCACIEIAMoAhBGBEAgAygCACgCKCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSMhAwwECwUgByAEQQFqNgIAIAQsAAAQpgghAwtBACQFQYUBIBAgA0H/AXEQWiMFIQNBACQFIANBAXFFDQALQSMhAwwBCyAUQQFqIRQMAQsLAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCADQSNrDuMBAAEQEBAQEBAQEBAQEBAQAhAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQAxAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAEBRAQBhAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQBwgJEAoQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEAsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQDBAQEBAQEBAQEBANEA4QCxBjIRIQABoMEAsQYyESEAAaDA8LIAUgBSgCAEEEcjYCAEEAIQAMDAsgBSAFKAIAQQRyNgIAQQAhAAwLCxBjIRIQABoMDAsQYyESEAAaDAsLIAUgBSgCAEEEcjYCAEEAIQAMCAsQYyESEAAaDAkLEGMhEhAAGgwICxBjIRIQABoMBwsQYyESEAAaDAYLIAUgBSgCAEEEcjYCAEEAIQAMAwsgBSAFKAIAQQRyNgIAQQAhAAwCCyAFIAUoAgBBBHI2AgBBACEADAELIAIEQAJAIAJBC2ohByACQQRqIQhBASEEAkADQAJAIAQgBywAACIDQQBIBH8gCCgCAAUgA0H/AXELTw0DIAAoAgAiAwR/IAMoAgwiBiADKAIQRgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hAyMFIQZBACQFIAZBAXENBAUgBiwAABCmCCEDCyADEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBgJAAkAgASgCACIDRQ0AIAMoAgwiCSADKAIQRgRAIAMoAgAoAiQhCUEAJAUgCSADEE4hAyMFIQlBACQFIAlBAXENBQUgCSwAABCmCCEDCyADEKAIEKIIBEAgAUEANgIADAEFIAZFDQMLDAELIAYNAQsgACgCACIDKAIMIgYgAygCEEYEQCADKAIAKAIkIQZBACQFIAYgAxBOIQMjBSEGQQAkBSAGQQFxDQMFIAYsAAAQpgghAwsgBywAAEEASAR/IAIoAgAFIAILIARqLQAAIANB/wFxRw0AIAAoAgAiA0EMaiIJKAIAIgYgAygCEEYEQCADKAIAKAIoIQZBACQFIAYgAxBOGiMFIQNBACQFIANBAXENAwUgCSAGQQFqNgIAIAYsAAAQpggaCyAEQQFqIQQMAQsLIAUgBSgCAEEEcjYCAEEAIQAMAwsQYyESEAAaDAQLCyARKAIAIgAgFSgCACIBRgRAQQEhAAEFICJBADYCAEEAJAVBGiAXIAAgASAiEFwjBSEAQQAkBSAAQQFxBEAQYyESEAAaDAQLICIoAgAEQCAFIAUoAgBBBHI2AgBBACEAAQVBASEAAQsLCyAQEMYNIA8Qxg0gDhDGDSANEMYNIBcQxg0gESgCACEBIBFBADYCACABBEAgESgCBCECQQAkBSACIAEQWSMFIQFBACQFIAFBAXEEQEEAEGQhARAAGiABEMkBCwsgDCQJIAAPCwsLIBAQxg0gDxDGDSAOEMYNIA0Qxg0gFxDGDSARKAIAIQAgEUEANgIAIAAEQCARKAIEIQFBACQFIAEgABBZIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELCyASEGpBAAumAwEKfyMJIQsjCUEQaiQJIwkjCk4EQEEQEAELIAEhByALIQQgAEELaiIJLAAAIgVBAEgiAwR/IAAoAghB/////wdxQX9qIQggACgCBAVBCiEIIAVB/wFxCyEGIAIgB2siCgRAAkAgASADBH8gACgCBCEFIAAoAgAFIAVB/wFxIQUgAAsiAyADIAVqEJIMBEAgBEIANwIAIARBADYCCCAEIAEgAhDPCiAEKAIAIAQgBCwACyIDQQBIIgUbIQwgBCgCBCADQf8BcSAFGyEDQQAkBUEmIAAgDCADEFAaIwUhA0EAJAUgA0EBcQRAEGMhAxAAGiAEEMYNIAMQagUgBBDGDQwCCwsgCCAGayAKSQRAIAAgCCAGIApqIAhrIAYgBkEAQQAQzg0LIAIgBiAHa2ohCCAGIAksAABBAEgEfyAAKAIABSAACyIDaiEHA0AgASACRwRAIAcgARClCCAHQQFqIQcgAUEBaiEBDAELCyAEQQA6AAAgAyAIaiAEEKUIIAYgCmohASAJLAAAQQBIBEAgACABNgIEBSAJIAE6AAALCwsgCyQJIAALDQAgACACSSABIABNcQvrDgEDfyMJIQwjCUEQaiQJIwkjCk4EQEEQEAELIAxBDGohCyAMIQogCSAABH8gAUHEiAMQ4goiASgCACgCLCEAIAsgASAAQf8BcUHACmoRAQAgAiALKAIANgAAIAEoAgAoAiAhACAKIAEgAEH/AXFBwApqEQEAIAhBC2oiACwAAEEASARAIAgoAgAhACALQQA6AAAgACALEKUIIAhBADYCBAUgC0EAOgAAIAggCxClCCAAQQA6AAALQQAkBUGGASAIQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAIIAopAgA3AgAgCCAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAhwhACAKIAEgAEH/AXFBwApqEQEAIAdBC2oiACwAAEEASARAIAcoAgAhACALQQA6AAAgACALEKUIIAdBADYCBAUgC0EAOgAAIAcgCxClCCAAQQA6AAALQQAkBUGGASAHQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAHIAopAgA3AgAgByAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAgwhACADIAEgAEH/AXFBmgFqEQMAOgAAIAEoAgAoAhAhACAEIAEgAEH/AXFBmgFqEQMAOgAAIAEoAgAoAhQhACAKIAEgAEH/AXFBwApqEQEAIAVBC2oiACwAAEEASARAIAUoAgAhACALQQA6AAAgACALEKUIIAVBADYCBAUgC0EAOgAAIAUgCxClCCAAQQA6AAALQQAkBUGGASAFQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAFIAopAgA3AgAgBSAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAhghACAKIAEgAEH/AXFBwApqEQEAIAZBC2oiACwAAEEASARAIAYoAgAhACALQQA6AAAgACALEKUIIAZBADYCBAUgC0EAOgAAIAYgCxClCCAAQQA6AAALQQAkBUGGASAGQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAGIAopAgA3AgAgBiAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAiQhACABIABB/wFxQZoBahEDAAUgAUG8iAMQ4goiASgCACgCLCEAIAsgASAAQf8BcUHACmoRAQAgAiALKAIANgAAIAEoAgAoAiAhACAKIAEgAEH/AXFBwApqEQEAIAhBC2oiACwAAEEASARAIAgoAgAhACALQQA6AAAgACALEKUIIAhBADYCBAUgC0EAOgAAIAggCxClCCAAQQA6AAALQQAkBUGGASAIQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAIIAopAgA3AgAgCCAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAhwhACAKIAEgAEH/AXFBwApqEQEAIAdBC2oiACwAAEEASARAIAcoAgAhACALQQA6AAAgACALEKUIIAdBADYCBAUgC0EAOgAAIAcgCxClCCAAQQA6AAALQQAkBUGGASAHQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAHIAopAgA3AgAgByAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAgwhACADIAEgAEH/AXFBmgFqEQMAOgAAIAEoAgAoAhAhACAEIAEgAEH/AXFBmgFqEQMAOgAAIAEoAgAoAhQhACAKIAEgAEH/AXFBwApqEQEAIAVBC2oiACwAAEEASARAIAUoAgAhACALQQA6AAAgACALEKUIIAVBADYCBAUgC0EAOgAAIAUgCxClCCAAQQA6AAALQQAkBUGGASAFQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAFIAopAgA3AgAgBSAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAhghACAKIAEgAEH/AXFBwApqEQEAIAZBC2oiACwAAEEASARAIAYoAgAhACALQQA6AAAgACALEKUIIAZBADYCBAUgC0EAOgAAIAYgCxClCCAAQQA6AAALQQAkBUGGASAGQQAQWiMFIQBBACQFIABBAXEEQEEAEGQhABAAGiAAEMkBCyAGIAopAgA3AgAgBiAKKAIINgIIQQAhAANAIABBA0cEQCAAQQJ0IApqQQA2AgAgAEEBaiEADAELCyAKEMYNIAEoAgAoAiQhACABIABB/wFxQZoBahEDAAs2AgAgDCQJC9kBAQZ/IAIoAgAgACgCACIFIgZrIgRBAXQiA0EBIAMbQX8gBEH/////B0kbIQggASgCACAGayEGIAVBACAAQQRqIgUoAgBBjAJHIgQbIAgQggoiA0UEQBC7DQsgBARAIAAgAzYCACADIQcFIAAoAgAhBCAAIAM2AgAgBARAIAUoAgAhA0EAJAUgAyAEEFkjBSEDQQAkBSADQQFxBEBBABBkIQMQABogAxDJAQUgACgCACEHCwUgAyEHCwsgBUGOAjYCACABIAYgB2o2AgAgAiAIIAAoAgBqNgIAC+UBAQZ/IAIoAgAgACgCACIFIgZrIgRBAXQiA0EEIAMbQX8gBEH/////B0kbIQggASgCACAGa0ECdSEGIAVBACAAQQRqIgUoAgBBjAJHIgQbIAgQggoiA0UEQBC7DQsgBARAIAAgAzYCACADIQcFIAAoAgAhBCAAIAM2AgAgBARAIAUoAgAhA0EAJAUgAyAEEFkjBSEDQQAkBSADQQFxBEBBABBkIQMQABogAxDJAQUgACgCACEHCwUgAyEHCwsgBUGOAjYCACABIAZBAnQgB2o2AgAgAiAAKAIAIAhBAnZBAnRqNgIAC4UIAQx/IwkhByMJQdAEaiQJIwkjCk4EQEHQBBABCyAHQYAEaiELIAdBqARqIRAgB0G0BGohDiAHQcAEaiEJIAdBrARqIQogByERIAdBuARqIgggB0HwAGoiADYCACAIQYwCNgIEIABBkANqIQwgB0GwBGoiDSAEEK0KQQAkBUE2IA1B/IYDEE8hACMFIQ9BACQFIA9BAXEEQBBjIQAQABoFIAlBADoAACAKIAIoAgA2AgAgBCgCBCEEQQAkBSALIAooAgA2AgBBAiABIAsgAyANIAQgBSAJIAAgCCAOIAwQViEDIwUhBEEAJAUCQAJAIARBAXENAAJAIAMEQAJAIAAoAgAoAjAhA0EAJAUgAyAAQbnLAkHDywIgCxBRGiMFIQBBACQFIABBAXEEQBBjIQAQABoFAkACQCAOKAIAIgogCCgCACIEayIAQYgDSgRAIABBAnZBAmoQgAoiACEDIAANAUEAJAVBBBBYQQAkBQUgESEAQQAhAwwBCwwBCyAJLAAABEAgAEEtOgAAIABBAWohAAsgC0EoaiEMIAshDyAAIQkDQCAEIApJBEAgBCgCACEKIAshAANAAkAgACAMRgRAIAwhAAwBCyAAKAIAIApHBEAgAEEEaiEADAILCwsgCSAAIA9rQQJ1QbnLAmosAAA6AAAgBEEEaiEEIAlBAWohCSAOKAIAIQoMAQsLIAlBADoAACAQIAY2AgAgEUHGygIgEBCjCUEBRwRAQQAkBUGNAkHKygIQWUEAJAUMAQsgAwRAIAMQgQoLDAILEGMhABAAGiADBEAgAxCBCgsLDAILCyABKAIAIgAEfyAAKAIMIgMgACgCEEYEQCAAKAIAKAIkIQNBACQFIAMgABBOIQAjBSEDQQAkBSADQQFxDQMFIAMoAgAQ6gEhAAsgABCgCBCiCAR/IAFBADYCAEEBBSABKAIARQsFQQELIQMCQAJAAkAgAigCACIARQ0AIAAoAgwiBCAAKAIQRgRAIAAoAgAoAiQhBEEAJAUgBCAAEE4hACMFIQRBACQFIARBAXENBQUgBCgCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAFIAUoAgBBAnI2AgALIAEoAgAhASANEOMKIAgoAgAhACAIQQA2AgAgAARAIAgoAgQhAkEAJAUgAiAAEFkjBSEAQQAkBSAAQQFxBEBBABBkIQAQABogABDJAQsLIAckCSABDwsMAQsQYyEAEAAaCwsgDRDjCiAIKAIAIQEgCEEANgIAIAEEQCAIKAIEIQJBACQFIAIgARBZIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQyQEFIAAhEgsFIAAhEgsgEhBqQQALqQcBC38jCSEIIwlBsANqJAkjCSMKTgRAQbADEAELIAhBqANqIQcgCEGYA2ohDiAIQawDaiELIAhBlANqIQwgCEGgA2oiCSAINgIAIAlBjAI2AgQgCEGQA2ohECAIQZADaiINIAQQrQpBACQFQTYgDUH8hgMQTyEKIwUhAEEAJAUgAEEBcQRAEGMhABAAGgUgC0EAOgAAIAwgAigCACIANgIAIAQoAgQhESAAIQRBACQFIAcgDCgCADYCAEECIAEgByADIA0gESAFIAsgCiAJIA4gEBBWIQMjBSEMQQAkBQJAAkAgDEEBcQ0AAkAgAwRAIAZBC2oiAywAAEEASARAIAYoAgAhAyAHQQA2AgAgAyAHENUKIAZBADYCBAUgB0EANgIAIAYgBxDVCiADQQA6AAALIAssAAAEQCAKKAIAKAIsIQNBACQFIAMgCkEtEE8hAyMFIQdBACQFIAdBAXENA0EAJAVBhwEgBiADEFojBSEDQQAkBSADQQFxDQMLIAooAgAoAiwhA0EAJAUgAyAKQTAQTyEHIwUhA0EAJAUgA0EBcQRAEGMhABAAGgwCCyAOKAIAIgpBfGohCyAJKAIAIQMDQAJAIAMgC08NACADKAIAIAdHDQAgA0EEaiEDDAELC0EAJAVBJyAGIAMgChBQGiMFIQNBACQFIANBAXEEQBBjIQAQABoMAgsLIAEoAgAiAwR/IAMoAgwiBiADKAIQRgRAIAMoAgAoAiQhBkEAJAUgBiADEE4hAyMFIQZBACQFIAZBAXENAwUgBigCABDqASEDCyADEKAIEKIIBH8gAUEANgIAQQEFIAEoAgBFCwVBAQshAwJAAkACQCAARQ0AIAQoAgwiBiAEKAIQRgRAIAAoAgAoAiQhAEEAJAUgACAEEE4hACMFIQRBACQFIARBAXENBQUgBigCABDqASEACyAAEKAIEKIIBEAgAkEANgIADAEFIANFDQILDAILIAMNAAwBCyAFIAUoAgBBAnI2AgALIAEoAgAhASANEOMKIAkoAgAhACAJQQA2AgAgAARAIAkoAgQhAkEAJAUgAiAAEFkjBSEAQQAkBSAAQQFxBEBBABBkIQAQABogABDJAQsLIAgkCSABDwsMAQsQYyEAEAAaCwsgDRDjCiAJKAIAIQEgCUEANgIAIAEEQCAJKAIEIQJBACQFIAIgARBZIwUhAUEAJAUgAUEBcQRAQQAQZCEAEAAaIAAQyQEFIAAhDwsFIAAhDwsgDxBqQQALnDUBJX8jCSEOIwlBgARqJAkjCSMKTgRAQYAEEAELIA5B9ANqIR4gDkHYA2ohJiAOQdQDaiEnIA5BvANqIQ0gDkGwA2ohDyAOQaQDaiEQIA5BmANqIRIgDkGUA2ohGiAOQZADaiEhIA5B8ANqIh8gCjYCACAOQegDaiITIA42AgAgE0GMAjYCBCAOQeADaiIVIA42AgAgDkHcA2oiICAOQZADajYCACAOQcgDaiIXQgA3AgAgF0EANgIIQQAhCgNAIApBA0cEQCAKQQJ0IBdqQQA2AgAgCkEBaiEKDAELCyANQgA3AgAgDUEANgIIQQAhCgNAIApBA0cEQCAKQQJ0IA1qQQA2AgAgCkEBaiEKDAELCyAPQgA3AgAgD0EANgIIQQAhCgNAIApBA0cEQCAKQQJ0IA9qQQA2AgAgCkEBaiEKDAELCyAQQgA3AgAgEEEANgIIQQAhCgNAIApBA0cEQCAKQQJ0IBBqQQA2AgAgCkEBaiEKDAELCyASQgA3AgAgEkEANgIIQQAhCgNAIApBA0cEQCAKQQJ0IBJqQQA2AgAgCkEBaiEKDAELC0EAJAVBAiACIAMgHiAmICcgFyANIA8gECAaEF4jBSECQQAkBSACQQFxBEAQYyEREAAaBQJAIAkgCCgCADYCACAPQQtqIRsgD0EEaiEiIBBBC2ohHCAQQQRqISMgF0ELaiEpIBdBBGohKiAEQYAEcUEARyEoIA1BC2ohGSAeQQNqISsgDUEEaiEkIBJBC2ohLCASQQRqIS1BACECQQAhFANAAkAgFEEETwRAQYcCIQMMAQsgACgCACIDBH8gAygCDCIEIAMoAhBGBEAgAygCACgCJCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSQhAwwDCwUgBCgCABDqASEDCyADEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBAJAAkAgASgCACIMRQ0AIAwoAgwiAyAMKAIQRgRAIAwoAgAoAiQhA0EAJAUgAyAMEE4hAyMFIQpBACQFIApBAXEEQEEkIQMMBAsFIAMoAgAQ6gEhAwsgAxCgCBCiCARAIAFBADYCAAwBBSAERQRAQYcCIQMMBAsLDAELIAQEf0GHAiEDDAIFQQALIQwLAkACQAJAAkACQAJAAkAgFCAeaiwAAA4FAQADAgQGCyAUQQNHBEAgACgCACIDKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBJCEDDAkLBSAEKAIAEOoBIQMLIAcoAgAoAgwhBEEAJAUgBCAHQYDAACADEFAhAyMFIQRBACQFIARBAXEEQEEkIQMMCAsgA0UEQEEyIQMMCAsgACgCACIDQQxqIgooAgAiBCADKAIQRgRAIAMoAgAoAighBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEkIQMMCQsFIAogBEEEajYCACAEKAIAEOoBIQMLQQAkBUGHASASIAMQWiMFIQNBACQFIANBAXFFDQVBJCEDDAcLDAULIBRBA0cNAwwECyAiKAIAIBssAAAiA0H/AXEgA0EASBsiA0EAICMoAgAgHCwAACIEQf8BcSAEQQBIGyIMa0cEQCADRQRAIAAoAgAiAygCDCIEIAMoAhBGBEAgAygCACgCJCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSQhAwwICwUgBCgCABDqASEDCyAQKAIAIBAgHCwAAEEASBsoAgAgA0cNBSAAKAIAIgNBDGoiCigCACIEIAMoAhBGBEAgAygCACgCKCEEQQAkBSAEIAMQThojBSEDQQAkBSADQQFxBEBBJCEDDAgLBSAKIARBBGo2AgAgBCgCABDqARoLIAZBAToAACAQIAIgIygCACAcLAAAIgJB/wFxIAJBAEgbQQFLGyECDAULIAAoAgAiAygCDCIEIAMoAhBGIQogDEUEQCAKBEAgAygCACgCJCEEQQAkBSAEIAMQTiEDIwUhBEEAJAUgBEEBcQRAQSQhAwwICwUgBCgCABDqASEDCyAPKAIAIA8gGywAAEEASBsoAgAgA0cEQCAGQQE6AAAMBgsgACgCACIDQQxqIgooAgAiBCADKAIQRgRAIAMoAgAoAighBEEAJAUgBCADEE4aIwUhA0EAJAUgA0EBcQRAQSQhAwwICwUgCiAEQQRqNgIAIAQoAgAQ6gEaCyAPIAIgIigCACAbLAAAIgJB/wFxIAJBAEgbQQFLGyECDAULIAoEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBJCEDDAcLBSAEKAIAEOoBIQMLIAAoAgAiBEEMaiILKAIAIgogBCgCEEYhDCADIA8oAgAgDyAbLAAAQQBIGygCAEYEQCAMBEAgBCgCACgCKCEDQQAkBSADIAQQThojBSEDQQAkBSADQQFxBEBBJCEDDAgLBSALIApBBGo2AgAgCigCABDqARoLIA8gAiAiKAIAIBssAAAiAkH/AXEgAkEASBtBAUsbIQIMBQsgDARAIAQoAgAoAiQhA0EAJAUgAyAEEE4hAyMFIQRBACQFIARBAXEEQEEkIQMMBwsFIAooAgAQ6gEhAwsgECgCACAQIBwsAABBAEgbKAIAIANHBEBB8QAhAwwGCyAAKAIAIgNBDGoiCigCACIEIAMoAhBGBEAgAygCACgCKCEEQQAkBSAEIAMQThojBSEDQQAkBSADQQFxBEBBJCEDDAcLBSAKIARBBGo2AgAgBCgCABDqARoLIAZBAToAACAQIAIgIygCACAcLAAAIgJB/wFxIAJBAEgbQQFLGyECCwwDCwJAAkAgFEECSSACcgRAIA0oAgAiBCANIBksAAAiCkEASBshAyAUDQEFIBRBAkYgKywAAEEAR3EgKHJFBEBBACECDAYLIA0oAgAiBCANIBksAAAiCkEASBshAwwBCwwBCyAeIBRBf2pqLQAAQQJIBEACQAJAA0AgJCgCACAKQf8BcSAKQRh0QRh1QQBIIgsbQQJ0IAQgDSALG2ogAyILRwRAIAsoAgAhBCAHKAIAKAIMIQpBACQFIAogB0GAwAAgBBBQIQQjBSEKQQAkBSAKQQFxBEBB/QAhAwwKCyAERQ0CIAtBBGohAyAZLAAAIQogDSgCACEEDAELCwwBCyAZLAAAIQogDSgCACEECyAsLAAAIh1BAEghGCADIAQgDSAKQRh0QRh1QQBIGyIWIgtrQQJ1Ii4gLSgCACIlIB1B/wFxIh0gGBtLBH8gCwUgEigCACAlQQJ0aiIlIB1BAnQgEmoiHSAYGyEvQQAgLmtBAnQgJSAdIBgbaiEYA38gGCAvRg0DIBgoAgAgFigCAEYEfyAWQQRqIRYgGEEEaiEYDAEFIAsLCwshAwsLA0ACQCADICQoAgAgCkH/AXEgCkEYdEEYdUEASCIKG0ECdCAEIA0gChtqRg0AIAAoAgAiBAR/IAQoAgwiCiAEKAIQRgRAIAQoAgAoAiQhCkEAJAUgCiAEEE4hBCMFIQpBACQFIApBAXEEQEGcASEDDAgLBSAKKAIAEOoBIQQLIAQQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEKAkACQCAMRQ0AIAwoAgwiBCAMKAIQRgRAIAwoAgAoAiQhBEEAJAUgBCAMEE4hBCMFIQtBACQFIAtBAXEEQEGcASEDDAkLBSAEKAIAEOoBIQQLIAQQoAgQoggEQCABQQA2AgAMAQUgCkUNAwsMAQsgCg0BQQAhDAsgACgCACIEKAIMIgogBCgCEEYEQCAEKAIAKAIkIQpBACQFIAogBBBOIQQjBSEKQQAkBSAKQQFxBEBBnAEhAwwHCwUgCigCABDqASEECyADKAIAIARHDQAgACgCACIEQQxqIgsoAgAiCiAEKAIQRgRAIAQoAgAoAighCkEAJAUgCiAEEE4aIwUhBEEAJAUgBEEBcQRAQZ0BIQMMBwsFIAsgCkEEajYCACAKKAIAEOoBGgsgA0EEaiEDIBksAAAhCiANKAIAIQQMAQsLICgEQCAZLAAAIgpBAEghBCAkKAIAIApB/wFxIAQbQQJ0IA0oAgAgDSAEG2ogA0cEQEGgASEDDAULCwwCC0EAIQQgDCEDA0ACQCAAKAIAIgoEfyAKKAIMIgsgCigCEEYEQCAKKAIAKAIkIQtBACQFIAsgChBOIQojBSELQQAkBSALQQFxBEBBuQEhAwwHCwUgCygCABDqASEKCyAKEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshCwJAAkAgDEUNACAMKAIMIgogDCgCEEYEQCAMKAIAKAIkIQpBACQFIAogDBBOIQojBSEWQQAkBSAWQQFxBEBBuQEhAwwICwUgCigCABDqASEKCyAKEKAIEKIIBEAgAUEANgIAQQAhAwwBBSALRQ0DCwwBCyALDQFBACEMCyAAKAIAIgooAgwiCyAKKAIQRgRAIAooAgAoAiQhC0EAJAUgCyAKEE4hCiMFIQtBACQFIAtBAXEEQEG8ASEDDAYLBSALKAIAEOoBIQoLIAcoAgAoAgwhC0EAJAUgCyAHQYAQIAoQUCELIwUhFkEAJAUgFkEBcQRAQbwBIQMMBQsgCwR/IAkoAgAiCyAfKAIARgRAQQAkBUEYIAggCSAfEFsjBSELQQAkBSALQQFxBEBBvAEhAwwHCyAJKAIAIQsLIAkgC0EEajYCACALIAo2AgAgBEEBagUgCiAnKAIARiAqKAIAICksAAAiCkH/AXEgCkEASBtBAEcgBEEAR3FxRQ0BIBUoAgAiCiAgKAIARgRAQQAkBUEXIBMgFSAgEFsjBSEKQQAkBSAKQQFxBEBBvAEhAwwHCyAVKAIAIQoLIBUgCkEEajYCACAKIAQ2AgBBAAshBCAAKAIAIgpBDGoiFigCACILIAooAhBGBEAgCigCACgCKCELQQAkBSALIAoQThojBSEKQQAkBSAKQQFxBEBBuQEhAwwGCwUgFiALQQRqNgIAIAsoAgAQ6gEaCwwBCwsgFSgCACIKIBMoAgBHIARBAEdxBEAgCiAgKAIARgRAQQAkBUEXIBMgFSAgEFsjBSEKQQAkBSAKQQFxBEBBugEhAwwFCyAVKAIAIQoLIBUgCkEEajYCACAKIAQ2AgALIBooAgBBAEoEQAJAIAAoAgAiBAR/IAQoAgwiCiAEKAIQRgRAIAQoAgAoAiQhCkEAJAUgCiAEEE4hBCMFIQpBACQFIApBAXEEQEG6ASEDDAcLBSAKKAIAEOoBIQQLIAQQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEKAkACQCADRQ0AIAMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hBCMFIQxBACQFIAxBAXEEQEG6ASEDDAgLBSAEKAIAEOoBIQQLIAQQoAgQoggEQCABQQA2AgAMAQUgCkUEQEHgASEDDAgLCwwBCyAKBH9B4AEhAwwGBUEACyEDCyAAKAIAIgQoAgwiCiAEKAIQRgRAIAQoAgAoAiQhCkEAJAUgCiAEEE4hBCMFIQpBACQFIApBAXEEQEG6ASEDDAYLBSAKKAIAEOoBIQQLICYoAgAgBEcEQEHgASEDDAULIAAoAgAiBEEMaiIMKAIAIgogBCgCEEYEQCAEKAIAKAIoIQpBACQFIAogBBBOGiMFIQRBACQFIARBAXEEQEG6ASEDDAYLBSAMIApBBGo2AgAgCigCABDqARoLA0AgGigCAEEATA0BIAAoAgAiBAR/IAQoAgwiCiAEKAIQRgRAIAQoAgAoAiQhCkEAJAUgCiAEEE4hBCMFIQpBACQFIApBAXEEQEG4ASEDDAgLBSAKKAIAEOoBIQQLIAQQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEKAkACQCADRQ0AIAMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hBCMFIQxBACQFIAxBAXEEQEG4ASEDDAkLBSAEKAIAEOoBIQQLIAQQoAgQoggEQCABQQA2AgAMAQUgCkUEQEH6ASEDDAkLCwwBCyAKBH9B+gEhAwwHBUEACyEDCyAAKAIAIgQoAgwiCiAEKAIQRgRAIAQoAgAoAiQhCkEAJAUgCiAEEE4hBCMFIQpBACQFIApBAXEEQEG4ASEDDAcLBSAKKAIAEOoBIQQLIAcoAgAoAgwhCkEAJAUgCiAHQYAQIAQQUCEEIwUhCkEAJAUgCkEBcQRAQbgBIQMMBgsgBEUEQEH6ASEDDAYLIAkoAgAgHygCAEYEQEEAJAVBGCAIIAkgHxBbIwUhBEEAJAUgBEEBcQRAQbgBIQMMBwsLIAAoAgAiBCgCDCIKIAQoAhBGBEAgBCgCACgCJCEKQQAkBSAKIAQQTiEEIwUhCkEAJAUgCkEBcQRAQbgBIQMMBwsFIAooAgAQ6gEhBAsgCSAJKAIAIgpBBGo2AgAgCiAENgIAIBogGigCAEF/ajYCACAAKAIAIgRBDGoiDCgCACIKIAQoAhBGBEAgBCgCACgCKCEKQQAkBSAKIAQQThojBSEEQQAkBSAEQQFxBEBBuAEhAwwHCwUgDCAKQQRqNgIAIAooAgAQ6gEaCwwAAAsACwsgCSgCACAIKAIARgRAQYUCIQMMAwsMAQsDQCAAKAIAIgMEfyADKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBIyEDDAULBSAEKAIAEOoBIQMLIAMQoAgQoggEfyAAQQA2AgBBAQUgACgCAEULBUEBCyEEAkACQCAMRQ0AIAwoAgwiAyAMKAIQRgRAIAwoAgAoAiQhA0EAJAUgAyAMEE4hAyMFIQpBACQFIApBAXEEQEEjIQMMBgsFIAMoAgAQ6gEhAwsgAxCgCBCiCARAIAFBADYCAAwBBSAERQ0ECwwBCyAEDQJBACEMCyAAKAIAIgMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXEEQEEjIQMMBAsFIAQoAgAQ6gEhAwsgBygCACgCDCEEQQAkBSAEIAdBgMAAIAMQUCEDIwUhBEEAJAUgBEEBcQRAQSMhAwwDCyADRQ0BIAAoAgAiA0EMaiIKKAIAIgQgAygCEEYEQCADKAIAKAIoIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxBEBBIyEDDAQLBSAKIARBBGo2AgAgBCgCABDqASEDC0EAJAVBhwEgEiADEFojBSEDQQAkBSADQQFxRQ0AC0EjIQMMAQsgFEEBaiEUDAELCwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCADQSNrDuUBAAERERERERERERERERERAhERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERAxERERERERERERERBBEREREREREREREREREREREREREREREREREREREREQUGEREHEREREREREREREREREREREREREREREREICQoRCxERERERERERERERERERERERERERERERERERERERERERERERDBERERERERERERERERERERERERERERERERENEREREREREREREQ4RDxELEGMhERAAGgwRCxBjIREQABoMEAsgBSAFKAIAQQRyNgIAQQAhAAwNCyAFIAUoAgBBBHI2AgBBACEADAwLEGMhERAAGgwNCxBjIREQABoMDAsQYyEREAAaDAsLIAUgBSgCAEEEcjYCAEEAIQAMCAsQYyEREAAaDAkLEGMhERAAGgwICxBjIREQABoMBwsQYyEREAAaDAYLIAUgBSgCAEEEcjYCAEEAIQAMAwsgBSAFKAIAQQRyNgIAQQAhAAwCCyAFIAUoAgBBBHI2AgBBACEADAELIAIEQAJAIAJBC2ohByACQQRqIQhBASEGAkADQAJAIAYgBywAACIDQQBIBH8gCCgCAAUgA0H/AXELTw0DIAAoAgAiAwR/IAMoAgwiBCADKAIQRgRAIAMoAgAoAiQhBEEAJAUgBCADEE4hAyMFIQRBACQFIARBAXENBAUgBCgCABDqASEDCyADEKAIEKIIBH8gAEEANgIAQQEFIAAoAgBFCwVBAQshBAJAAkAgASgCACIDRQ0AIAMoAgwiCSADKAIQRgRAIAMoAgAoAiQhCUEAJAUgCSADEE4hAyMFIQlBACQFIAlBAXENBQUgCSgCABDqASEDCyADEKAIEKIIBEAgAUEANgIADAEFIARFDQMLDAELIAQNAQsgACgCACIDKAIMIgQgAygCEEYEQCADKAIAKAIkIQRBACQFIAQgAxBOIQMjBSEEQQAkBSAEQQFxDQMFIAQoAgAQ6gEhAwsgBywAAEEASAR/IAIoAgAFIAILIAZBAnRqKAIAIANHDQAgACgCACIDQQxqIgkoAgAiBCADKAIQRgRAIAMoAgAoAighBEEAJAUgBCADEE4aIwUhA0EAJAUgA0EBcQ0DBSAJIARBBGo2AgAgBCgCABDqARoLIAZBAWohBgwBCwsgBSAFKAIAQQRyNgIAQQAhAAwDCxBjIREQABoMBAsLIBMoAgAiACAVKAIAIgFGBEBBASEAAQUgIUEANgIAQQAkBUEaIBcgACABICEQXCMFIQBBACQFIABBAXEEQBBjIREQABoMBAsgISgCAARAIAUgBSgCAEEEcjYCAEEAIQABBUEBIQABCwsLIBIQxg0gEBDGDSAPEMYNIA0Qxg0gFxDGDSATKAIAIQEgE0EANgIAIAEEQCATKAIEIQJBACQFIAIgARBZIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELCyAOJAkgAA8LCwsgEhDGDSAQEMYNIA8Qxg0gDRDGDSAXEMYNIBMoAgAhACATQQA2AgAgAARAIBMoAgQhAUEAJAUgASAAEFkjBSEAQQAkBSAAQQFxBEBBABBkIQAQABogABDJAQsLIBEQakEAC6UDAQl/IwkhCyMJQRBqJAkjCSMKTgRAQRAQAQsgCyEEIABBCGoiA0EDaiIILAAAIgVBAEgiCQR/IAMoAgBB/////wdxQX9qIQcgACgCBAVBASEHIAVB/wFxCyEGIAIgAWsiA0ECdSEKIAMEQAJAIAEgCQR/IAAoAgQhBSAAKAIABSAFQf8BcSEFIAALIgMgBUECdCADahCSDARAIARCADcCACAEQQA2AgggBCABIAIQ1AogBCgCACAEIAQsAAsiA0EASCIFGyEJIAQoAgQgA0H/AXEgBRshA0EAJAVBKCAAIAkgAxBQGiMFIQNBACQFIANBAXEEQBBjIQMQABogBBDGDSADEGoFIAQQxg0MAgsLIAcgBmsgCkkEQCAAIAcgBiAKaiAHayAGIAZBAEEAENkNCyAILAAAQQBIBH8gACgCAAUgAAsgBkECdGohAwNAIAEgAkcEQCADIAEQ1QogA0EEaiEDIAFBBGohAQwBCwsgBEEANgIAIAMgBBDVCiAGIApqIQEgCCwAAEEASARAIAAgATYCBAUgCCABOgAACwsLIAskCSAAC+sOAQN/IwkhDCMJQRBqJAkjCSMKTgRAQRAQAQsgDEEMaiELIAwhCiAJIAAEfyABQdSIAxDiCiIBKAIAKAIsIQAgCyABIABB/wFxQcAKahEBACACIAsoAgA2AAAgASgCACgCICEAIAogASAAQf8BcUHACmoRAQAgCEELaiIALAAAQQBIBEAgCCgCACEAIAtBADYCACAAIAsQ1QogCEEANgIEBSALQQA2AgAgCCALENUKIABBADoAAAtBACQFQYgBIAhBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAggCikCADcCACAIIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCHCEAIAogASAAQf8BcUHACmoRAQAgB0ELaiIALAAAQQBIBEAgBygCACEAIAtBADYCACAAIAsQ1QogB0EANgIEBSALQQA2AgAgByALENUKIABBADoAAAtBACQFQYgBIAdBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAcgCikCADcCACAHIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCDCEAIAMgASAAQf8BcUGaAWoRAwA2AgAgASgCACgCECEAIAQgASAAQf8BcUGaAWoRAwA2AgAgASgCACgCFCEAIAogASAAQf8BcUHACmoRAQAgBUELaiIALAAAQQBIBEAgBSgCACEAIAtBADoAACAAIAsQpQggBUEANgIEBSALQQA6AAAgBSALEKUIIABBADoAAAtBACQFQYYBIAVBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAUgCikCADcCACAFIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCGCEAIAogASAAQf8BcUHACmoRAQAgBkELaiIALAAAQQBIBEAgBigCACEAIAtBADYCACAAIAsQ1QogBkEANgIEBSALQQA2AgAgBiALENUKIABBADoAAAtBACQFQYgBIAZBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAYgCikCADcCACAGIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCJCEAIAEgAEH/AXFBmgFqEQMABSABQcyIAxDiCiIBKAIAKAIsIQAgCyABIABB/wFxQcAKahEBACACIAsoAgA2AAAgASgCACgCICEAIAogASAAQf8BcUHACmoRAQAgCEELaiIALAAAQQBIBEAgCCgCACEAIAtBADYCACAAIAsQ1QogCEEANgIEBSALQQA2AgAgCCALENUKIABBADoAAAtBACQFQYgBIAhBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAggCikCADcCACAIIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCHCEAIAogASAAQf8BcUHACmoRAQAgB0ELaiIALAAAQQBIBEAgBygCACEAIAtBADYCACAAIAsQ1QogB0EANgIEBSALQQA2AgAgByALENUKIABBADoAAAtBACQFQYgBIAdBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAcgCikCADcCACAHIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCDCEAIAMgASAAQf8BcUGaAWoRAwA2AgAgASgCACgCECEAIAQgASAAQf8BcUGaAWoRAwA2AgAgASgCACgCFCEAIAogASAAQf8BcUHACmoRAQAgBUELaiIALAAAQQBIBEAgBSgCACEAIAtBADoAACAAIAsQpQggBUEANgIEBSALQQA6AAAgBSALEKUIIABBADoAAAtBACQFQYYBIAVBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAUgCikCADcCACAFIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCGCEAIAogASAAQf8BcUHACmoRAQAgBkELaiIALAAAQQBIBEAgBigCACEAIAtBADYCACAAIAsQ1QogBkEANgIEBSALQQA2AgAgBiALENUKIABBADoAAAtBACQFQYgBIAZBABBaIwUhAEEAJAUgAEEBcQRAQQAQZCEAEAAaIAAQyQELIAYgCikCADcCACAGIAooAgg2AghBACEAA0AgAEEDRwRAIABBAnQgCmpBADYCACAAQQFqIQAMAQsLIAoQxg0gASgCACgCJCEAIAEgAEH/AXFBmgFqEQMACzYCACAMJAkLkAkBFX8jCSEHIwlBoANqJAkjCSMKTgRAQaADEAELIAdByAJqIQAgB0HwAGohDSAHQYwDaiEQIAdBmANqIRcgB0GVA2ohEiAHQZQDaiETIAdBgANqIQ4gB0H0AmohCSAHQegCaiEKIAdB5AJqIQ8gByEUIAdB4AJqIRggB0HcAmohGSAHQdgCaiEaIAdBkANqIgYgB0HgAWoiCDYCACAHQdACaiIVIAU5AwACQAJAIAhB5ABBo8wCIBUQzgkiCEHjAEsEQEEAJAVBFhBNIQgjBSENQQAkBSANQQFxBH9BACEAQQAFAn9BACQFIAAgBTkDAEEOIAYgCEGjzAIgABBRIQgjBSEAQQAkBSAAQQFxBH9BACEAQQAFIAYoAgAiAEUEQEEAJAVBBBBYQQAkBUEAIQBBAAwCCyAIEIAKIg0hESANDQRBACQFQQQQWEEAJAUgEQsLCyEBEGMhAhAAGgVBACERQQAhAAwBCwwBCyAQIAMQrQpBACQFQTYgEEHchgMQTyEWIwUhC0EAJAUCQAJAIAtBAXENACAGKAIAIQsgFigCACgCICEMQQAkBSAMIBYgCyAIIAtqIA0QURojBSELQQAkBSALQQFxDQAgCAR/IAYoAgAsAABBLUYFQQALIQsgDkIANwIAIA5BADYCCEEAIQYDQCAGQQNHBEAgBkECdCAOakEANgIAIAZBAWohBgwBCwsgCUIANwIAIAlBADYCCEEAIQYDQCAGQQNHBEAgBkECdCAJakEANgIAIAZBAWohBgwBCwsgCkIANwIAIApBADYCCEEAIQYDQCAGQQNHBEAgBkECdCAKakEANgIAIAZBAWohBgwBCwtBACQFQQMgAiALIBAgFyASIBMgDiAJIAogDxBeIwUhAkEAJAUgAkEBcQR/EGMhARAABQJ/AkAgCCAPKAIAIgZKBH8gBkEBaiAIIAZrQQF0aiEPIAooAgQgCiwACyIMQf8BcSAMQQBIGyEMIAkoAgQgCSwACyICQf8BcSACQQBIGwUgBkECaiEPIAooAgQgCiwACyIMQf8BcSAMQQBIGyEMIAkoAgQgCSwACyICQf8BcSACQQBIGwsgDCAPamoiAkHkAEsEfyACEIAKIhQhAiAUDQFBACQFQQQQWEEAJAUQYyEBEAAFQQAhAgwBCwwBCyADKAIEIQ8gEiwAACESIBMsAAAhE0EAJAVBASAUIBggGSAPIA0gCCANaiAWIAsgFyASIBMgDiAJIAogBhBfIwUhCEEAJAUgCEEBcUUEQCAaIAEoAgA2AgAgGCgCACEBIBkoAgAhCEEAJAUgFSAaKAIANgIAQSMgFSAUIAEgCCADIAQQUiEBIwUhA0EAJAUgA0EBcUUEQCACBEAgAhCBCgsgChDGDSAJEMYNIA4Qxg0gEBDjCiARBEAgERCBCgsgAARAIAAQgQoLIAckCSABDwsLEGMhARAACyEDIAIEQCACEIEKCyADCxogChDGDSAJEMYNIA4Qxg0MAQsQYyEBEAAaCyAQEOMKIAEhAiARIQELIAEEQCABEIEKCyAABEAgABCBCgsgAhBqQQALygcBE38jCSEHIwlBsAFqJAkjCSMKTgRAQbABEAELIAdBnAFqIRQgB0GkAWohFSAHQaEBaiEOIAdBoAFqIQ8gB0GMAWohDCAHQYABaiEIIAdB9ABqIQkgB0HwAGohDSAHIQAgB0HsAGohFiAHQegAaiEXIAdB5ABqIRggB0GYAWoiECADEK0KQQAkBUE2IBBB3IYDEE8hEyMFIQZBACQFIAZBAXEEQBBjIQAQABoFAkAgBUELaiIRLAAAIgpBAEghBiAFQQRqIhIoAgAgCkH/AXEgBhsEfyAFKAIAIAUgBhssAAAhBiATKAIAKAIcIQpBACQFIAogE0EtEE8hCiMFIQtBACQFIAtBAXEEfxBjIQAQABoMAgUgCkEYdEEYdSAGRgsFQQALIQogDEIANwIAIAxBADYCCEEAIQYDQCAGQQNHBEAgBkECdCAMakEANgIAIAZBAWohBgwBCwsgCEIANwIAIAhBADYCCEEAIQYDQCAGQQNHBEAgBkECdCAIakEANgIAIAZBAWohBgwBCwsgCUIANwIAIAlBADYCCEEAIQYDQCAGQQNHBEAgBkECdCAJakEANgIAIAZBAWohBgwBCwtBACQFQQMgAiAKIBAgFSAOIA8gDCAIIAkgDRBeIwUhAkEAJAUgAkEBcQRAEGMhABAAGgUgESwAACICQQBIIRECfwJAIBIoAgAgAkH/AXEgERsiEiANKAIAIgZKBH8gBkEBaiASIAZrQQF0aiENIAkoAgQgCSwACyILQf8BcSALQQBIGyELIAgoAgQgCCwACyICQf8BcSACQQBIGwUgBkECaiENIAkoAgQgCSwACyILQf8BcSALQQBIGyELIAgoAgQgCCwACyICQf8BcSACQQBIGwsgCyANamoiAkHkAEsEfyACEIAKIgIhACACDQFBACQFQQQQWEEAJAUQYyEBEAAFIAAhAkEAIQAMAQsMAQsgAygCBCENIAUoAgAgBSARGyEFIA4sAAAhDiAPLAAAIQ9BACQFQQEgAiAWIBcgDSAFIAUgEmogEyAKIBUgDiAPIAwgCCAJIAYQXyMFIQVBACQFIAVBAXFFBEAgGCABKAIANgIAIBYoAgAhASAXKAIAIQVBACQFIBQgGCgCADYCAEEjIBQgAiABIAUgAyAEEFIhASMFIQJBACQFIAJBAXFFBEAgAARAIAAQgQoLIAkQxg0gCBDGDSAMEMYNIBAQ4wogByQJIAEPCwsQYyEBEAALGiAABEAgABCBCgsgASEACyAJEMYNIAgQxg0gDBDGDQsLIBAQ4wogABBqQQAL0Q8BA38jCSEMIwlBEGokCSMJIwpOBEBBEBABCyAMQQxqIQogDCELIAkgAAR/IAJBxIgDEOIKIQAgAQR/IAAoAgAoAiwhASAKIAAgAUH/AXFBwApqEQEAIAMgCigCADYAACAAKAIAKAIgIQEgCyAAIAFB/wFxQcAKahEBACAIQQtqIgEsAABBAEgEQCAIKAIAIQEgCkEAOgAAIAEgChClCCAIQQA2AgQFIApBADoAACAIIAoQpQggAUEAOgAAC0EAJAVBhgEgCEEAEFojBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgCCALKQIANwIAIAggCygCCDYCCEEAIQEDQCABQQNHBEAgAUECdCALakEANgIAIAFBAWohAQwBCwsgCxDGDSAABSAAKAIAKAIoIQEgCiAAIAFB/wFxQcAKahEBACADIAooAgA2AAAgACgCACgCHCEBIAsgACABQf8BcUHACmoRAQAgCEELaiIBLAAAQQBIBEAgCCgCACEBIApBADoAACABIAoQpQggCEEANgIEBSAKQQA6AAAgCCAKEKUIIAFBADoAAAtBACQFQYYBIAhBABBaIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELIAggCykCADcCACAIIAsoAgg2AghBACEBA0AgAUEDRwRAIAFBAnQgC2pBADYCACABQQFqIQEMAQsLIAsQxg0gAAshASAAKAIAKAIMIQIgBCAAIAJB/wFxQZoBahEDADoAACAAKAIAKAIQIQIgBSAAIAJB/wFxQZoBahEDADoAACABKAIAKAIUIQIgCyAAIAJB/wFxQcAKahEBACAGQQtqIgIsAABBAEgEQCAGKAIAIQIgCkEAOgAAIAIgChClCCAGQQA2AgQFIApBADoAACAGIAoQpQggAkEAOgAAC0EAJAVBhgEgBkEAEFojBSECQQAkBSACQQFxBEBBABBkIQIQABogAhDJAQsgBiALKQIANwIAIAYgCygCCDYCCEEAIQIDQCACQQNHBEAgAkECdCALakEANgIAIAJBAWohAgwBCwsgCxDGDSABKAIAKAIYIQEgCyAAIAFB/wFxQcAKahEBACAHQQtqIgEsAABBAEgEQCAHKAIAIQEgCkEAOgAAIAEgChClCCAHQQA2AgQFIApBADoAACAHIAoQpQggAUEAOgAAC0EAJAVBhgEgB0EAEFojBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgByALKQIANwIAIAcgCygCCDYCCEEAIQEDQCABQQNHBEAgAUECdCALakEANgIAIAFBAWohAQwBCwsgCxDGDSAAKAIAKAIkIQEgACABQf8BcUGaAWoRAwAFIAJBvIgDEOIKIQAgAQR/IAAoAgAoAiwhASAKIAAgAUH/AXFBwApqEQEAIAMgCigCADYAACAAKAIAKAIgIQEgCyAAIAFB/wFxQcAKahEBACAIQQtqIgEsAABBAEgEQCAIKAIAIQEgCkEAOgAAIAEgChClCCAIQQA2AgQFIApBADoAACAIIAoQpQggAUEAOgAAC0EAJAVBhgEgCEEAEFojBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgCCALKQIANwIAIAggCygCCDYCCEEAIQEDQCABQQNHBEAgAUECdCALakEANgIAIAFBAWohAQwBCwsgCxDGDSAABSAAKAIAKAIoIQEgCiAAIAFB/wFxQcAKahEBACADIAooAgA2AAAgACgCACgCHCEBIAsgACABQf8BcUHACmoRAQAgCEELaiIBLAAAQQBIBEAgCCgCACEBIApBADoAACABIAoQpQggCEEANgIEBSAKQQA6AAAgCCAKEKUIIAFBADoAAAtBACQFQYYBIAhBABBaIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELIAggCykCADcCACAIIAsoAgg2AghBACEBA0AgAUEDRwRAIAFBAnQgC2pBADYCACABQQFqIQEMAQsLIAsQxg0gAAshASAAKAIAKAIMIQIgBCAAIAJB/wFxQZoBahEDADoAACAAKAIAKAIQIQIgBSAAIAJB/wFxQZoBahEDADoAACABKAIAKAIUIQIgCyAAIAJB/wFxQcAKahEBACAGQQtqIgIsAABBAEgEQCAGKAIAIQIgCkEAOgAAIAIgChClCCAGQQA2AgQFIApBADoAACAGIAoQpQggAkEAOgAAC0EAJAVBhgEgBkEAEFojBSECQQAkBSACQQFxBEBBABBkIQIQABogAhDJAQsgBiALKQIANwIAIAYgCygCCDYCCEEAIQIDQCACQQNHBEAgAkECdCALakEANgIAIAJBAWohAgwBCwsgCxDGDSABKAIAKAIYIQEgCyAAIAFB/wFxQcAKahEBACAHQQtqIgEsAABBAEgEQCAHKAIAIQEgCkEAOgAAIAEgChClCCAHQQA2AgQFIApBADoAACAHIAoQpQggAUEAOgAAC0EAJAVBhgEgB0EAEFojBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgByALKQIANwIAIAcgCygCCDYCCEEAIQEDQCABQQNHBEAgAUECdCALakEANgIAIAFBAWohAQwBCwsgCxDGDSAAKAIAKAIkIQEgACABQf8BcUGaAWoRAwALNgIAIAwkCQv6CAERfyACIAA2AgAgDUELaiEXIA1BBGohGCAMQQtqIRsgDEEEaiEcIANBgARxRSEdIAZBCGohHiAOQQBKIR8gC0ELaiEZIAtBBGohGkEAIRUDQCAVQQRHBEACQAJAAkACQAJAAkAgCCAVaiwAAA4FAAEDAgQFCyABIAIoAgA2AgAMBAsgASACKAIANgIAIAYoAgAoAhwhDyAGQSAgD0E/cUGeA2oRHgAhECACIAIoAgAiD0EBajYCACAPIBA6AAAMAwsgFywAACIPQQBIIRAgGCgCACAPQf8BcSAQGwRAIA0oAgAgDSAQGywAACEQIAIgAigCACIPQQFqNgIAIA8gEDoAAAsMAgsgGywAACIPQQBIIRAgHSAcKAIAIA9B/wFxIBAbIg9FckUEQCAPIAwoAgAgDCAQGyIPaiEQIAIoAgAhEQNAIA8gEEcEQCARIA8sAAA6AAAgEUEBaiERIA9BAWohDwwBCwsgAiARNgIACwwBCyACKAIAIRIgBEEBaiAEIAcbIhMhBANAAkAgBCAFTw0AIAQsAAAiD0F/TA0AIB4oAgAgD0EBdGouAQBBgBBxRQ0AIARBAWohBAwBCwsgHwRAIA4hDwNAIA9BAEoiECAEIBNLcQRAIARBf2oiBCwAACERIAIgAigCACIQQQFqNgIAIBAgEToAACAPQX9qIQ8MAQsLIBAEfyAGKAIAKAIcIRAgBkEwIBBBP3FBngNqER4ABUEACyERA0AgAiACKAIAIhBBAWo2AgAgD0EASgRAIBAgEToAACAPQX9qIQ8MAQsLIBAgCToAAAsgBCATRgRAIAYoAgAoAhwhBCAGQTAgBEE/cUGeA2oRHgAhDyACIAIoAgAiBEEBajYCACAEIA86AAAFAkAgGSwAACIPQQBIIRAgGigCACAPQf8BcSAQGwR/IAsoAgAgCyAQGywAAAVBfwshD0EAIRFBACEUIAQhEANAIBAgE0YNASAPIBRGBEAgAiACKAIAIgRBAWo2AgAgBCAKOgAAIBksAAAiD0EASCEWIBFBAWoiBCAaKAIAIA9B/wFxIBYbSQR/QX8gBCALKAIAIAsgFhtqLAAAIg8gD0H/AEYbIQ9BAAUgFCEPQQALIRQFIBEhBAsgEEF/aiIQLAAAIRYgAiACKAIAIhFBAWo2AgAgESAWOgAAIAQhESAUQQFqIRQMAAALAAsLIAIoAgAiBCASRgR/IBMFA0AgEiAEQX9qIgRJBEAgEiwAACEPIBIgBCwAADoAACAEIA86AAAgEkEBaiESDAEFIBMhBAwDCwAACwALIQQLIBVBAWohFQwBCwsgFywAACIEQQBIIQYgGCgCACAEQf8BcSAGGyIFQQFLBEAgDSgCACANIAYbIgQgBWohBSACKAIAIQYDQCAFIARBAWoiBEcEQCAGIAQsAAA6AAAgBkEBaiEGDAELCyACIAY2AgALAkACQAJAIANBsAFxQRh0QRh1QRBrDhECAQEBAQEBAQEBAQEBAQEBAAELIAEgAigCADYCAAwBCyABIAA2AgALC5kJARV/IwkhByMJQeAHaiQJIwkjCk4EQEHgBxABCyAHQYgHaiEAIAdBkANqIQ0gB0HUB2ohECAHQdwHaiEXIAdB0AdqIRIgB0HMB2ohEyAHQcAHaiEOIAdBtAdqIQkgB0GoB2ohCiAHQaQHaiEPIAchFCAHQaAHaiEYIAdBnAdqIRkgB0GYB2ohGiAHQdgHaiIGIAdBoAZqIgg2AgAgB0GQB2oiFSAFOQMAAkACQCAIQeQAQaPMAiAVEM4JIghB4wBLBEBBACQFQRYQTSEIIwUhDUEAJAUgDUEBcQR/QQAhAEEABQJ/QQAkBSAAIAU5AwBBDiAGIAhBo8wCIAAQUSEIIwUhAEEAJAUgAEEBcQR/QQAhAEEABSAGKAIAIgBFBEBBACQFQQQQWEEAJAVBACEAQQAMAgsgCEECdBCACiINIREgDQ0EQQAkBUEEEFhBACQFIBELCwshARBjIQIQABoFQQAhEUEAIQAMAQsMAQsgECADEK0KQQAkBUE2IBBB/IYDEE8hFiMFIQtBACQFAkACQCALQQFxDQAgBigCACELIBYoAgAoAjAhDEEAJAUgDCAWIAsgCCALaiANEFEaIwUhC0EAJAUgC0EBcQ0AIAgEfyAGKAIALAAAQS1GBUEACyELIA5CADcCACAOQQA2AghBACEGA0AgBkEDRwRAIAZBAnQgDmpBADYCACAGQQFqIQYMAQsLIAlCADcCACAJQQA2AghBACEGA0AgBkEDRwRAIAZBAnQgCWpBADYCACAGQQFqIQYMAQsLIApCADcCACAKQQA2AghBACEGA0AgBkEDRwRAIAZBAnQgCmpBADYCACAGQQFqIQYMAQsLQQAkBUEEIAIgCyAQIBcgEiATIA4gCSAKIA8QXiMFIQJBACQFIAJBAXEEfxBjIQEQAAUCfwJAIAggDygCACIGSgR/IAZBAWogCCAGa0EBdGohDyAKKAIEIAosAAsiDEH/AXEgDEEASBshDCAJKAIEIAksAAsiAkH/AXEgAkEASBsFIAZBAmohDyAKKAIEIAosAAsiDEH/AXEgDEEASBshDCAJKAIEIAksAAsiAkH/AXEgAkEASBsLIAwgD2pqIgJB5ABLBH8gAkECdBCACiIUIQIgFA0BQQAkBUEEEFhBACQFEGMhARAABUEAIQIMAQsMAQsgAygCBCEPIBIoAgAhEiATKAIAIRNBACQFQQIgFCAYIBkgDyANIAhBAnQgDWogFiALIBcgEiATIA4gCSAKIAYQXyMFIQhBACQFIAhBAXFFBEAgGiABKAIANgIAIBgoAgAhASAZKAIAIQhBACQFIBUgGigCADYCAEEkIBUgFCABIAggAyAEEFIhASMFIQNBACQFIANBAXFFBEAgAgRAIAIQgQoLIAoQxg0gCRDGDSAOEMYNIBAQ4wogEQRAIBEQgQoLIAAEQCAAEIEKCyAHJAkgAQ8LCxBjIQEQAAshAyACBEAgAhCBCgsgAwsaIAoQxg0gCRDGDSAOEMYNDAELEGMhARAAGgsgEBDjCiABIQIgESEBCyABBEAgARCBCgsgAARAIAAQgQoLIAIQakEAC8oHARN/IwkhByMJQeADaiQJIwkjCk4EQEHgAxABCyAHQdADaiEUIAdB1ANqIRUgB0HIA2ohDiAHQcQDaiEPIAdBuANqIQwgB0GsA2ohCCAHQaADaiEJIAdBnANqIQ0gByEAIAdBmANqIRYgB0GUA2ohFyAHQZADaiEYIAdBzANqIhAgAxCtCkEAJAVBNiAQQfyGAxBPIRMjBSEGQQAkBSAGQQFxBEAQYyEAEAAaBQJAIAVBC2oiESwAACIKQQBIIQYgBUEEaiISKAIAIApB/wFxIAYbBH8gBSgCACAFIAYbKAIAIQYgEygCACgCLCEKQQAkBSAKIBNBLRBPIQojBSELQQAkBSALQQFxBH8QYyEAEAAaDAIFIAYgCkYLBUEACyEKIAxCADcCACAMQQA2AghBACEGA0AgBkEDRwRAIAZBAnQgDGpBADYCACAGQQFqIQYMAQsLIAhCADcCACAIQQA2AghBACEGA0AgBkEDRwRAIAZBAnQgCGpBADYCACAGQQFqIQYMAQsLIAlCADcCACAJQQA2AghBACEGA0AgBkEDRwRAIAZBAnQgCWpBADYCACAGQQFqIQYMAQsLQQAkBUEEIAIgCiAQIBUgDiAPIAwgCCAJIA0QXiMFIQJBACQFIAJBAXEEQBBjIQAQABoFIBEsAAAiAkEASCERAn8CQCASKAIAIAJB/wFxIBEbIhIgDSgCACIGSgR/IAZBAWogEiAGa0EBdGohDSAJKAIEIAksAAsiC0H/AXEgC0EASBshCyAIKAIEIAgsAAsiAkH/AXEgAkEASBsFIAZBAmohDSAJKAIEIAksAAsiC0H/AXEgC0EASBshCyAIKAIEIAgsAAsiAkH/AXEgAkEASBsLIAsgDWpqIgJB5ABLBH8gAkECdBCACiICIQAgAg0BQQAkBUEEEFhBACQFEGMhARAABSAAIQJBACEADAELDAELIAMoAgQhDSAFKAIAIAUgERshBSAOKAIAIQ4gDygCACEPQQAkBUECIAIgFiAXIA0gBSASQQJ0IAVqIBMgCiAVIA4gDyAMIAggCSAGEF8jBSEFQQAkBSAFQQFxRQRAIBggASgCADYCACAWKAIAIQEgFygCACEFQQAkBSAUIBgoAgA2AgBBJCAUIAIgASAFIAMgBBBSIQEjBSECQQAkBSACQQFxRQRAIAAEQCAAEIEKCyAJEMYNIAgQxg0gDBDGDSAQEOMKIAckCSABDwsLEGMhARAACxogAARAIAAQgQoLIAEhAAsgCRDGDSAIEMYNIAwQxg0LCyAQEOMKIAAQakEAC8UPAQN/IwkhDCMJQRBqJAkjCSMKTgRAQRAQAQsgDEEMaiEKIAwhCyAJIAAEfyACQdSIAxDiCiEAIAEEQCAAKAIAKAIsIQEgCiAAIAFB/wFxQcAKahEBACADIAooAgA2AAAgACgCACgCICEBIAsgACABQf8BcUHACmoRAQAgCEELaiIBLAAAQQBIBEAgCCgCACEBIApBADYCACABIAoQ1QogCEEANgIEBSAKQQA2AgAgCCAKENUKIAFBADoAAAtBACQFQYgBIAhBABBaIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELIAggCykCADcCACAIIAsoAgg2AghBACEBA0AgAUEDRwRAIAFBAnQgC2pBADYCACABQQFqIQEMAQsLIAsQxg0FIAAoAgAoAighASAKIAAgAUH/AXFBwApqEQEAIAMgCigCADYAACAAKAIAKAIcIQEgCyAAIAFB/wFxQcAKahEBACAIQQtqIgEsAABBAEgEQCAIKAIAIQEgCkEANgIAIAEgChDVCiAIQQA2AgQFIApBADYCACAIIAoQ1QogAUEAOgAAC0EAJAVBiAEgCEEAEFojBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgCCALKQIANwIAIAggCygCCDYCCEEAIQEDQCABQQNHBEAgAUECdCALakEANgIAIAFBAWohAQwBCwsgCxDGDQsgACgCACgCDCEBIAQgACABQf8BcUGaAWoRAwA2AgAgACgCACgCECEBIAUgACABQf8BcUGaAWoRAwA2AgAgACgCACgCFCEBIAsgACABQf8BcUHACmoRAQAgBkELaiIBLAAAQQBIBEAgBigCACEBIApBADoAACABIAoQpQggBkEANgIEBSAKQQA6AAAgBiAKEKUIIAFBADoAAAtBACQFQYYBIAZBABBaIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELIAYgCykCADcCACAGIAsoAgg2AghBACEBA0AgAUEDRwRAIAFBAnQgC2pBADYCACABQQFqIQEMAQsLIAsQxg0gACgCACgCGCEBIAsgACABQf8BcUHACmoRAQAgB0ELaiIBLAAAQQBIBEAgBygCACEBIApBADYCACABIAoQ1QogB0EANgIEBSAKQQA2AgAgByAKENUKIAFBADoAAAtBACQFQYgBIAdBABBaIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELIAcgCykCADcCACAHIAsoAgg2AghBACEBA0AgAUEDRwRAIAFBAnQgC2pBADYCACABQQFqIQEMAQsLIAsQxg0gACgCACgCJCEBIAAgAUH/AXFBmgFqEQMABSACQcyIAxDiCiEAIAEEQCAAKAIAKAIsIQEgCiAAIAFB/wFxQcAKahEBACADIAooAgA2AAAgACgCACgCICEBIAsgACABQf8BcUHACmoRAQAgCEELaiIBLAAAQQBIBEAgCCgCACEBIApBADYCACABIAoQ1QogCEEANgIEBSAKQQA2AgAgCCAKENUKIAFBADoAAAtBACQFQYgBIAhBABBaIwUhAUEAJAUgAUEBcQRAQQAQZCEBEAAaIAEQyQELIAggCykCADcCACAIIAsoAgg2AghBACEBA0AgAUEDRwRAIAFBAnQgC2pBADYCACABQQFqIQEMAQsLIAsQxg0FIAAoAgAoAighASAKIAAgAUH/AXFBwApqEQEAIAMgCigCADYAACAAKAIAKAIcIQEgCyAAIAFB/wFxQcAKahEBACAIQQtqIgEsAABBAEgEQCAIKAIAIQEgCkEANgIAIAEgChDVCiAIQQA2AgQFIApBADYCACAIIAoQ1QogAUEAOgAAC0EAJAVBiAEgCEEAEFojBSEBQQAkBSABQQFxBEBBABBkIQEQABogARDJAQsgCCALKQIANwIAIAggCygCCDYCCEEAIQEDQCABQQNHBEAgAUECdCALakEANgIAIAFBAWohAQwBCwsgCxDGDQsgACgCACgCDCEBIAQgACABQf8BcUGaAWoRAwA2AgAgACgCACgCECEB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ygwhACABLAAAQQJ0IABqKAIAQf8BcSEACyABIAA6AAAgAUEBaiEBDAELCyACCwQAIAELKQADQCABIAJHBEAgAyABLAAAOgAAIANBAWohAyABQQFqIQEMAQsLIAILEgAgASACIAFBGHRBGHVBf0obCzMAA0AgASACRwRAIAQgASwAACIAIAMgAEF/Shs6AAAgBEEBaiEEIAFBAWohAQwBCwsgAgsIABCKCSgCAAsIABCUCSgCAAsIABCRCSgCAAsYACAAQZjxATYCACAAQQxqEMYNIAAQiQILDAAgABDNDCAAEL0NCwcAIAAsAAgLBwAgACwACQsMACAAIAFBDGoQww0LIAAgAEIANwIAIABBADYCCCAAQeTQAkHk0AIQoQgQxA0LIAAgAEIANwIAIABBADYCCCAAQd7QAkHe0AIQoQgQxA0LGAAgAEHA8QE2AgAgAEEQahDGDSAAEIkCCwwAIAAQ1AwgABC9DQsHACAAKAIICwcAIAAoAgwLDAAgACABQRBqEMMNCyAAIABCADcCACAAQQA2AgggAEH48QFB+PEBEOoLENENCyAAIABCADcCACAAQQA2AgggAEHg8QFB4PEBEOoLENENCyUAIAJBgAFJBH8gARDMDCACQQF0ai4BAHFB//8DcUEARwVBAAsLRgADQCABIAJHBEAgAyABKAIAQYABSQR/EMwMIQAgASgCAEEBdCAAai8BAAVBAAs7AQAgA0ECaiEDIAFBBGohAQwBCwsgAgtKAANAAkAgAiADRgRAIAMhAgwBCyACKAIAQYABSQRAEMwMIQAgASACKAIAQQF0IABqLgEAcUH//wNxDQELIAJBBGohAgwBCwsgAgtKAANAAkAgAiADRgRAIAMhAgwBCyACKAIAQYABTw0AEMwMIQAgASACKAIAQQF0IABqLgEAcUH//wNxBEAgAkEEaiECDAILCwsgAgsaACABQYABSQR/EMsMIAFBAnRqKAIABSABCwtCAANAIAEgAkcEQCABKAIAIgBBgAFJBEAQywwhACABKAIAQQJ0IABqKAIAIQALIAEgADYCACABQQRqIQEMAQsLIAILGgAgAUGAAUkEfxDKDCABQQJ0aigCAAUgAQsLQgADQCABIAJHBEAgASgCACIAQYABSQRAEMoMIQAgASgCAEECdCAAaigCACEACyABIAA2AgAgAUEEaiEBDAEL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ADoAACACIAMQpQggACABNgIEBSADQQA6AAAgACABaiADEKUIIAYgAToAAAsLIAUkCQvdAQEGfyMJIQcjCUEQaiQJIwkjCk4EQEEQEAELIAchCCABBEAgAEELaiIGLAAAIgRBAEgEfyAAKAIIQf////8HcUF/aiEFIAAoAgQFQQohBSAEQf8BcQshAyAFIANrIAFJBEAgACAFIAEgA2ogBWsgAyADQQBBABDODSAGLAAAIQQLIAMgBEEYdEEYdUEASAR/IAAoAgAFIAALIgRqIAEgAhCkCBogASADaiEBIAYsAABBAEgEQCAAIAE2AgQFIAYgAToAAAsgCEEAOgAAIAEgBGogCBClCAsgByQJIAALtwEBAn9BbyABayACSQRAIAAQwg0LIAAsAAtBAEgEfyAAKAIABSAACyEIIAFB5////wdJBH9BCyABQQF0IgcgASACaiICIAIgB0kbIgJBEGpBcHEgAkELSRsFQW8LIgIQvA0hByAEBEAgByAIIAQQkwoaCyADIAVrIARrIgMEQCAGIAQgB2pqIAUgBCAIamogAxCTChoLIAFBCkcEQCAIEL0NCyAAIAc2AgAgACACQYCAgIB4cjYCCAvQAQEGfyMJIQUjCUEQaiQJIwkjCk4EQEEQEAELIAUhBiAAQQtqIgcsAAAiA0EASCIIBH8gACgCBCEDIAAoAghB/////wdxQX9qBSADQf8BcSEDQQoLIgQgA2sgAkkEQCAAIAQgAiADaiAEayADIANBACACIAEQyQ0FIAIEQCADIAgEfyAAKAIABSAACyIEaiABIAIQkwoaIAIgA2ohASAHLAAAQQBIBEAgACABNgIEBSAHIAE6AAALIAZBADoAACABIARqIAYQpQgLCyAFJAkgAAvSAQEGfyMJIQMjCUEQaiQJIwkjCk4EQEEQEAELIANBAWohBCADIgYgAToAACAAQQtqIgUsAAAiAUEASCIHBH8gACgCBCECIAAoAghB/////wdxQX9qBSABQf8BcSECQQoLIQECQAJAIAEgAkYEQCAAIAFBASABIAFBAEEAEM4NIAUsAABBAEgNAQUgBw0BCyAFIAJBAWo6AAAMAQsgACgCACEBIAAgAkEBajYCBCABIQALIAAgAmoiACAGEKUIIARBADoAACAAQQFqIAQQpQggAyQJC+sBAQR/IwkhBSMJQRBqJAkjCSMK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CyACCxAAIAEgAiADIABBAXERFQALFwAgASACIAMgBCAFIABBA3FBAmoRFAALDwAgASAAQQdxQQZqEQoACxEAIAEgAiAAQQ9xQQ5qEQcACxMAIAEgAiADIABBB3FBHmoRCQALFQAgASACIAMgBCAAQQdxQSZqEQgACxkAIAEgAiADIAQgBSAGIABBA3FBLmoRFwALHQAgASACIAMgBCAFIAYgByAIIABBAXFBMmoRGQALGQAgASACIAMgBCAFIAYgAEEBcUE0ahEYAAsZACABIAIgAyAEIAUgBiAAQQFxQTZqERYACxMAIAEgAiADIABBAXFBOGoRGgALFQAgASACIAMgBCAAQQFxQTpqEQ4ACxkAIAEgAiADIAQgBSAGIABBA3FBPGoRHAALFwAgASACIAMgBCAFIABBAXFBQGsRDwALEgAgASACIABBB3FBwgBqERsACxQAIAEgAiADIABBA3FBygBqESYACxYAIAEgAiADIAQgAEEHcUHOAGoRJwALGAAgASACIAMgBCAFIABBA3FB1gBqESgACxwAIAEgAiADIAQgBSAGIAcgAEEDcUHaAGoRKQALIAAgASACIAMgBCAFIAYgByAIIAkgAEEBcUHeAGoRKgALHAAgASACIAMgBCAFIAYgByAAQQFxQeAAahErAAscACABIAIgAyAEIAUgBiAHIABBAXFB4gBqESwACxYAIAEgAiADIAQgAEEBcUHkAGoRLQALGAAgASACIAMgBCAFIABBAXFB5gBqES4ACxwAIAEgAiADIAQgBSAGIAcgAEEDcUHoAGoRLwALGgAgASACIAMgBCAFIAYgAEEBcUHsAGoRMAALFAAgASACIAMgAEEHcUHuAGoRDAALFgAgASACIAMgBCAAQQFxQfYAahExAAsUACABIAIgAyAAQQFxQfgAahEyAAsOACAAQR9xQfoAahEAAAsRACABIABB/wFxQZoBahEDAAsSACABIAIgAEEDcUGaA2oRHQALEgAgASACIABBP3FBngNqER4ACxQAIAEgAiADIABBAXFB3gNqETMACxQAIAEgAiADIABBP3FB4ANqEQQACxYAIAEgAiADIAQgAEEBcUGgBGoRNAALFgAgASACIAMgBCAAQQFxQaIEahE1AAsWACABIAIgAyAEIABBD3FBpARqEQYACxgAIAEgAiADIAQgBSAAQQdxQbQEahE2AAsYACABIAIgAyAEIAUgAEEfcUG8BGoRHwALGgAgASACIAMgBCAFIAYgAEEDcUHcBGoRNwALGgAgASACIAMgBCAFIAYgAEE/cUHgBGoRIQALHAAgASACIAMgBCAFIAYgByAAQQ9xQaAFahE4AAseACABIAIgAyAEIAUgBiAHIAggAEEPcUGwBWoRIAALIgAgASACIAMgBCAFIAYgByAIIAkgCiAAQQNxQcAFahE5AAskACABIAIgAyAEIAUgBiAHIAggCSAKIAsgAEEDcUHEBWoROgALJgAgASACIAMgBCAFIAYgByAIIAkgCiALIAwgAEEDcUHIBWoROwALGAAgASACIAMgBCAFIABBB3FBzAVqETwACxYAIAEgAiADIAQgAEEDcUHUBWoRPQALDgAgAEE/cUHYBWoRIgALEQAgASAAQf8DcUGYBmoRBQALEgAgASACIABBH3FBmApqEQsACxQAIAEgAiADIABBAXFBuApqERMACxYAIAEgAiADIAQgAEEBcUG6CmoREAALGAAgASACIAMgBCAFIABBAXFBvApqEREACxoAIAEgAiADIAQgBSAGIABBAXFBvgpqERIACxMAIAEgAiAAQf8BcUHACmoRAQALFAAgASACIAMgAEEPcUHADGoRDQALFgAgASACIAMgBCAAQQFxQdAMahE+AAsYACABIAIgAyAEIAUgAEEBcUHSDGoRPwALGgAgASACIAMgBCAFIAYgAEEBcUHUDGoRQAALHAAgASACIAMgBCAFIAYgByAAQQFxQdYMahFBAAsUACABIAIgAyAAQQFxQdgMahFCAAsUACABIAIgAyAAQR9xQdoMahECAAsWACABIAIgAyAEIABBA3FB+gxqEUMACxYAIAEgAiADIAQgAEEBcUH+DGoRRAALFgAgASACIAMgBCAAQR9xQYANahEjAAsYACABIAIgAyAEIAUgAEEDcUGgDWoRJQALGgAgASACIAMgBCAFIAYgAEEHcUGkDWoRJAALHAAgASACIAMgBCAFIAYgByAAQQdxQawNahFFAAsiACABIAIgAyAEIAUgBiAHIAggCSAKIABBB3FBtA1qEUYACywAIAEgAiADIAQgBSAGIAcgCCAJIAogCyAMIA0gDiAPIABBA3FBvA1qEUcACxgAIAEgAiADIAQgBSAAQQNxQcANahFIAAsPAEEAEAJE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AABOAAAATwAAAFAAAABRAAAAUgAAAFMAAABUAAAAVQAAAFYAAABXAAAAWAAAAFkAAABaAAAAWwAAAFwAAABdAAAAXgAAAF8AAABgAAAAQQAAAEIAAABDAAAARAAAAEUAAABGAAAARwAAAEgAAABJAAAASgAAAEsAAABMAAAATQAAAE4AAABPAAAAUAAAAFEAAABSAAAAUwAAAFQAAABVAAAAVgAAAFcAAABYAAAAWQAAAFoAAAB7AAAAfAAAAH0AAAB+AAAAfwBB8JQBC6ECCgAAAGQAAADoAwAAECcAAKCGAQBAQg8AgJaYAADh9QX/////////////////////////////////////////////////////////////////AAECAwQFBgcICf////////8KCwwNDg8QERITFBUWFxgZGhscHR4fICEiI////////woLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIj/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////wBBoJcBCxgRAAoAERERAAAAAAUAAAAAAAAJAAAAAAsAQcCXAQshEQAPChEREQMKBwABEwkLCwAACQYLAAALAAYRAAAAERERAEHxlwELAQsAQfqXAQsYEQAKChEREQAKAAACAAkLAAAACQALAAALAEGrmAELAQwAQbeYAQsVDAAAAAAMAAAAAAkMAAAAAAAMAAAMAEHlmAELAQ4AQfGYAQsVDQAAAAQNAAAAAAkOAAAAAAAOAAAOAEGfmQELARAAQauZAQseDwAAAAAPAAAAAAkQAAAAAAAQAAAQAAASAAAAEhISAEHimQELDhIAAAASEhIAAAAAAAAJAEGTmgELAQsAQZ+aAQsVCgAAAAAKAAAAAAkLAAAAAAALAAALAEHNmgELAQwAQdmaAQt+DAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAwMTIzNDU2Nzg5QUJDREVGVCEiGQ0BAgMRSxwMEAQLHRIeJ2hub3BxYiAFBg8TFBUaCBYHKCQXGAkKDhsfJSODgn0mKis8PT4/Q0dKTVhZWltcXV5fYGFjZGVmZ2lqa2xyc3R5ent8AEHgmwEL1w5JbGxlZ2FsIGJ5dGUgc2VxdWVuY2UARG9tYWluIGVycm9yAFJlc3VsdCBub3QgcmVwcmVzZW50YWJsZQBOb3QgYSB0dHkAUGVybWlzc2lvbiBkZW5pZWQAT3BlcmF0aW9uIG5vdCBwZXJtaXR0ZWQATm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeQBObyBzdWNoIHByb2Nlc3MARmlsZSBleGlzdHMAVmFsdWUgdG9vIGxhcmdlIGZvciBkYXRhIHR5cGUATm8gc3BhY2UgbGVmdCBvbiBkZXZpY2UAT3V0IG9mIG1lbW9yeQBSZXNvdXJjZSBidXN5AEludGVycnVwdGVkIHN5c3RlbSBjYWxsAFJlc291cmNlIHRlbXBvcmFyaWx5IHVuYXZhaWxhYmxlAEludmFsaWQgc2VlawBDcm9zcy1kZXZpY2UgbGluawBSZWFkLW9ubHkgZmlsZSBzeXN0ZW0ARGlyZWN0b3J5IG5vdCBlbXB0eQBDb25uZWN0aW9uIHJlc2V0IGJ5IHBlZXIAT3BlcmF0aW9uIHRpbWVkIG91dABDb25uZWN0aW9uIHJlZnVzZWQASG9zdCBpcyBkb3duAEhvc3QgaXMgdW5yZWFjaGFibGUAQWRkcmVzcyBpbiB1c2UAQnJva2VuIHBpcGUASS9PIGVycm9yAE5vIHN1Y2ggZGV2aWNlIG9yIGFkZHJlc3MAQmxvY2sgZGV2aWNlIHJlcXVpcmVkAE5vIHN1Y2ggZGV2aWNlAE5vdCBhIGRpcmVjdG9yeQBJcyBhIGRpcmVjdG9yeQBUZXh0IGZpbGUgYnVzeQBFeGVjIGZvcm1hdCBlcnJvcgBJbnZhbGlkIGFyZ3VtZW50AEFyZ3VtZW50IGxpc3QgdG9vIGxvbmcAU3ltYm9saWMgbGluayBsb29wAEZpbGVuYW1lIHRvbyBsb25nAFRvbyBtYW55IG9wZW4gZmlsZXMgaW4gc3lzdGVtAE5vIGZpbGUgZGVzY3JpcHRvcnMgYXZhaWxhYmxlAEJhZCBmaWxlIGRlc2NyaXB0b3IATm8gY2hpbGQgcHJvY2VzcwBCYWQgYWRkcmVzcwBGaWxlIHRvbyBsYXJnZQBUb28gbWFueSBsaW5rcwBObyBsb2NrcyBhdmFpbGFibGUAUmVzb3VyY2UgZGVhZGxvY2sgd291bGQgb2NjdXIAU3RhdGUgbm90IHJlY292ZXJhYmxlAFByZXZpb3VzIG93bmVyIGRpZWQAT3BlcmF0aW9uIGNhbmNlbGVkAEZ1bmN0aW9uIG5vdCBpbXBsZW1lbnRlZABObyBtZXNzYWdlIG9mIGRlc2lyZWQgdHlwZQBJZGVudGlmaWVyIHJlbW92ZWQARGV2aWNlIG5vdCBhIHN0cmVhbQBObyBkYXRhIGF2YWlsYWJsZQBEZXZpY2UgdGltZW91dABPdXQgb2Ygc3RyZWFtcyByZXNvdXJjZXMATGluayBoYXMgYmVlbiBzZXZlcmVkAFByb3RvY29sIGVycm9yAEJhZCBtZXNzYWdlAEZpbGUgZGVzY3JpcHRvciBpbiBiYWQgc3RhdGUATm90IGEgc29ja2V0AERlc3RpbmF0aW9uIGFkZHJlc3MgcmVxdWlyZWQATWVzc2FnZSB0b28gbGFyZ2UAUHJvdG9jb2wgd3JvbmcgdHlwZSBmb3Igc29ja2V0AFByb3RvY29sIG5vdCBhdmFpbGFibGUAUHJvdG9jb2wgbm90IHN1cHBvcnRlZABTb2NrZXQgdHlwZSBub3Qgc3VwcG9ydGVkAE5vdCBzdXBwb3J0ZWQAUHJvdG9jb2wgZmFtaWx5IG5vdCBzdXBwb3J0ZWQAQWRkcmVzcyBmYW1pbHkgbm90IHN1cHBvcnRlZCBieSBwcm90b2NvbABBZGRyZXNzIG5vdCBhdmFpbGFibGUATmV0d29yayBpcyBkb3duAE5ldHdvcmsgdW5yZWFjaGFibGUAQ29ubmVjdGlvbiByZXNldCBieSBuZXR3b3JrAENvbm5lY3Rpb24gYWJvcnRlZABObyBidWZmZXIgc3BhY2UgYXZhaWxhYmxlAFNvY2tldCBpcyBjb25uZWN0ZWQAU29ja2V0IG5vdCBjb25uZWN0ZWQAQ2Fubm90IHNlbmQgYWZ0ZXIgc29ja2V0IHNodXRkb3duAE9wZXJhdGlvbiBhbHJlYWR5IGluIHByb2dyZXNzAE9wZXJhdGlvbiBpbiBwcm9ncmVzcwBTdGFsZSBmaWxlIGhhbmRsZQBSZW1vdGUgSS9PIGVycm9yAFF1b3RhIGV4Y2VlZGVkAE5vIG1lZGl1bSBmb3VuZABXcm9uZyBtZWRpdW0gdHlwZQBObyBlcnJvciBpbmZvcm1hdGlvbgAAAAAAAExDX0NUWVBFAAAAAExDX05VTUVSSUMAAExDX1RJTUUAAAAAAExDX0NPTExBVEUAAExDX01PTkVUQVJZAExDX01FU1NBR0VTAEHAqgELlwIDAAAABAAAAAQAAAAGAAAAg/miAERObgD8KRUA0VcnAN009QBi28AAPJmVAEGQQwBjUf4Au96rALdhxQA6biQA0k1CAEkG4AAJ6i4AHJLRAOsd/gApsRwA6D6nAPU1ggBEuy4AnOmEALQmcABBfl8A1pE5AFODOQCc9DkAi1+EACj5vQD4HzsA3v+XAA+YBQARL+8AClqLAG0fbQDPfjYACcsnAEZPtwCeZj8ALepfALondQDl68cAPXvxAPc5BwCSUooA+2vqAB+xXwAIXY0AMANWAHv8RgDwq2sAILzPADb0mgDjqR0AXmGRAAgb5gCFmWUAoBRfAI1AaACA2P8AJ3NNAAYGMQDKVhUAyahzAHviYABrjMAAQeOsAQuNAUD7Ifk/AAAAAC1EdD4AAACAmEb4PAAAAGBRzHg7AAAAgIMb8DkAAABAICV6OAAAAIAiguM2AAAAAB3zaTVPu2EFZ6zdPxgtRFT7Iek/m/aB0gtz7z8YLURU+yH5P+JlLyJ/K3o8B1wUMyamgTy9y/B6iAdwPAdcFDMmppE8AAAAAAAA8D8AAAAAAAD4PwBB+K0BCwgG0M9D6/1MPgBBi64BCyVAA7jiPzAxMjM0NTY3ODlhYmNkZWZBQkNERUZ4WCstcFBpSW5OAEHArgELgQElAAAAbQAAAC8AAAAlAAAAZAAAAC8AAAAlAAAAeQAAACUAAABZAAAALQAAACUAAABtAAAALQAAACUAAABkAAAAJQAAAEkAAAA6AAAAJQAAAE0AAAA6AAAAJQAAAFMAAAAgAAAAJQAAAHAAAAAAAAAAJQAAAEgAAAA6AAAAJQAAAE0AQdCvAQubJSUAAABIAAAAOgAAACUAAABNAAAAOgAAACUAAABTAAAAJQAAAEgAAAA6AAAAJQAAAE0AAAA6AAAAJQAAAFMAAABIegAAB4AAADR7AADbfwAAAAAAAAEAAAAQWAAAAAAAADR7AAC3fwAAAAAAAAEAAAAYWAAAAAAAABh7AAAsgAAAAAAAADBYAAAYewAAUYAAAAEAAAAwWAAASHoAAI6AAAA0ewAA0IAAAAAAAAABAAAAEFgAAAAAAAA0ewAArIAAAAAAAAABAAAAcFgAAAAAAAAYewAA/IAAAAAAAACIWAAAGHsAACGBAAABAAAAiFgAADR7AAB8gQAAAAAAAAEAAAAQWAAAAAAAADR7AABYgQAAAAAAAAEAAADAWAAAAAAAABh7AACogQAAAAAAANhYAAAYewAAzYEAAAEAAADYWAAANHsAABeCAAAAAAAAAQAAABBYAAAAAAAANHsAAPOBAAAAAAAAAQAAABBZAAAAAAAAGHsAAEOCAAAAAAAAKFkAABh7AABoggAAAQAAAChZAABIegAAn4IAABh7AACtggAAAAAAAGBZAAAYewAAvIIAAAEAAABgWQAASHoAANCCAAAYewAA34IAAAAAAACIWQAAGHsAAO+CAAABAAAAiFkAAEh6AAAAgwAAGHsAAAmDAAAAAAAAsFkAABh7AAATgwAAAQAAALBZAABwegAAHoMAAFBkAAAAAAAASHoAAOuDAABwegAADIQAAFBkAAAAAAAASHoAAF6EAAAYewAAbYQAAAAAAAAAWgAAGHsAAH2EAAABAAAAAFoAAHB6AACOhAAAUGQAAAAAAABIegAAZ4UAAHB6AACMhQAAUGQAAAAAAABIegAA1IUAABh7AADkhQAAAAAAAFBaAAAYewAA9YUAAAEAAABQWgAAcHoAAAeGAABQZAAAAAAAAEh6AADihgAAcHoAAAiHAABQZAAAAAAAAEh6AABahwAAGHsAAGeHAAAAAAAAoFoAABh7AAB1hwAAAQAAAKBaAABwegAAhIcAAFBkAAAAAAAASHoAAFmIAABwegAAfIgAAFBkAAAAAAAASHoAALyIAAAYewAAxYgAAAAAAADwWgAAGHsAAM+IAAABAAAA8FoAAHB6AADaiAAAUGQAAAAAAABIegAAp4kAAHB6AADGiQAAUGQAAAAAAABIegAAGooAABh7AAAqigAAAAAAAEBbAAAYewAAO4oAAAEAAABAWwAAcHoAAE2KAABQZAAAAAAAAEh6AAAoiwAAcHoAAE6LAABQZAAAAAAAAEh6AACXiwAAGHsAAKCLAAAAAAAAkFsAABh7AACqiwAAAQAAAJBbAABwegAAtYsAAFBkAAAAAAAASHoAAIKMAABwegAAoYwAAFBkAAAAAAAASHoAAOuMAAAYewAA9IwAAAAAAADgWwAAGHsAAP6MAAABAAAA4FsAAHB6AAAJjQAAUGQAAAAAAABIegAA1o0AAHB6AAD1jQAAUGQAAAAAAABIegAAQ44AABh7AABMjgAAAAAAADBcAAAYewAAVo4AAAEAAAAwXAAAcHoAAGGOAABQZAAAAAAAAEh6AAAujwAAcHoAAE2PAABQZAAAAAAAAEh6AACjjwAAGHsAAKyPAAAAAAAAgFwAABh7AAC2jwAAAQAAAIBcAABwegAAwY8AAFBkAAAAAAAASHoAAI6QAABwegAArZAAAFBkAAAAAAAASHoAAO6QAAAYewAA/5AAAAAAAADQXAAAGHsAABGRAAABAAAA0FwAAHB6AAAkkQAAUGQAAAAAAABIegAAAZIAAHB6AAAokgAAUGQAAAAAAABIegAAbJIAABh7AAB6kgAAAAAAACBdAAAYewAAiZIAAAEAAAAgXQAAcHoAAJmSAABQZAAAAAAAAEh6AABwkwAAcHoAAJSTAABQZAAAAAAAAEh6AADekwAAGHsAAOuTAAAAAAAAcF0AABh7AAD5kwAAAQAAAHBdAABwegAACJQAAFBkAAAAAAAASHoAAN2UAABwegAAAJUAAFBkAAAAAAAASHoAAECVAAAYewAAUJUAAAAAAADAXQAAGHsAAGGVAAABAAAAwF0AAHB6AABzlQAAUGQAAAAAAABIegAATpYAAHB6AAB0lgAAUGQAAAAAAABIegAAt5YAABh7AADAlgAAAAAAABBeAAAYewAAypYAAAEAAAAQXgAAcHoAANWWAABQZAAAAAAAAEh6AACilwAAcHoAAMGXAABQZAAAAAAAAEh6AAAYmgAASHoAAFeaAABIegAAlZoAAEh6AADbmgAASHoAABibAABIegAAN5sAAEh6AABWmwAASHoAAHWbAABIegAAlJsAAEh6AACzmwAASHoAANKbAABIegAAD5wAADR7AAAunAAAAAAAAAEAAADYXgAAAAAAAEh6AABtnAAANHsAAJOcAAAAAAAAAQAAANheAAAAAAAANHsAANKcAAAAAAAAAQAAANheAAAAAAAAcHoAAPedAAAgXwAAAAAAAEh6AADlnQAAcHoAACGeAAAgXwAAAAAAAEh6AABLngAASHoAAHyeAAA0ewAArZ4AAAAAAAABAAAAEF8AAAP0//80ewAA3J4AAAAAAAABAAAAKF8AAAP0//80ewAAC58AAAAAAAABAAAAEF8AAAP0//80ewAAOp8AAAAAAAABAAAAKF8AAAP0//9wegAAaZ8AAEBfAAAAAAAAcHoAAIKfAAA4XwAAAAAAAHB6AADBnwAAQF8AAAAAAABwegAA2Z8AADhfAAAAAAAAcHoAAPGfAAD4XwAAAAAAAHB6AAAFoAAASGQAAAAAAABwegAAG6AAAPhfAAAAAAAANHsAADSgAAAAAAAAAgAAAPhfAAACAAAAOGAAAAAAAAA0ewAAeKAAAAAAAAABAAAAUGAAAAAAAABIegAAjqAAADR7AACnoAAAAAAAAAIAAAD4XwAAAgAAAHhgAAAAAAAANHsAAOugAAAAAAAAAQAAAFBgAAAAAAAANHsAABShAAAAAAAAAgAAAPhfAAACAAAAsGAAAAAAAAA0ewAAWKEAAAAAAAABAAAAyGAAAAAAAABIegAAbqEAADR7AACHoQAAAAAAAAIAAAD4XwAAAgAAAPBgAAAAAAAANHsAAMuhAAAAAAAAAQAAAMhgAAAAAAAANHsAACGjAAAAAAAAAwAAAPhfAAACAAAAMGEAAAIAAAA4YQAAAAgAAEh6AACIowAASHoAAGajAAA0ewAAm6MAAAAAAAADAAAA+F8AAAIAAAAwYQAAAgAAAGhhAAAACAAASHoAAOCjAAA0ewAAAqQAAAAAAAACAAAA+F8AAAIAAACQYQAAAAgAAEh6AABHpAAANHsAAHGkAAAAAAAAAgAAAPhfAAACAAAAkGEAAAAIAAA0ewAAtqQAAAAAAAACAAAA+F8AAAIAAADYYQAAAgAAAEh6AADSpAAANHsAAOekAAAAAAAAAgAAAPhfAAACAAAA2GEAAAIAAAA0ewAAA6UAAAAAAAACAAAA+F8AAAIAAADYYQAAAgAAADR7AAAfpQAAAAAAAAIAAAD4XwAAAgAAANhhAAACAAAANHsAAFqlAAAAAAAAAgAAAPhfAAACAAAAYGIAAAAAAABIegAAoKUAADR7AADEpQAAAAAAAAIAAAD4XwAAAgAAAIhiAAAAAAAASHoAAAqmAAA0ewAAKaYAAAAAAAACAAAA+F8AAAIAAACwYgAAAAAAAEh6AABvpgAANHsAAIimAAAAAAAAAgAAAPhfAAACAAAA2GIAAAAAAABIegAAzqYAADR7AADnpgAAAAAAAAIAAAD4XwAAAgAAAABjAAACAAAASHoAAPymAAA0ewAAk6cAAAAAAAACAAAA+F8AAAIAAAAAYwAAAgAAAHB6AAAUpwAAOGMAAAAAAAA0ewAAN6cAAAAAAAACAAAA+F8AAAIAAABYYwAAAgAAAEh6AABapwAAcHoAAHGnAAA4YwAAAAAAADR7AACopwAAAAAAAAIAAAD4XwAAAgAAAFhjAAACAAAANHsAAMqnAAAAAAAAAgAAAPhfAAACAAAAWGMAAAIAAAA0ewAA7KcAAAAAAAACAAAA+F8AAAIAAABYYwAAAgAAAHB6AAAPqAAA+F8AAAAAAAA0ewAAJagAAAAAAAACAAAA+F8AAAIAAAAAZAAAAgAAAEh6AAA3qAAANHsAAEyoAAAAAAAAAgAAAPhfAAACAAAAAGQAAAIAAABwegAAaagAAPhfAAAAAAAAcHoAAH6oAAD4XwAAAAAAAEh6AACTqAAANHsAAKyoAAAAAAAAAQAAAEhkAAAAAAAASHoAALOpAABwegAAE6oAAIBkAAAAAAAAcHoAAMCpAACQZAAAAAAAAEh6AADhqQAAcHoAAO6pAABwZAAAAAAAAHB6AAA2qwAAaGQAAAAAAABwegAAQ6sAAGhkAAAAAAAAcHoAAFOrAABoZAAAAAAAAHB6AABlqwAAuGQAAAAAAABwegAAhKsAAGhkAAAAAAAAcHoAALSrAACAZAAAAAAAAHB6AACQqwAA+GQAAAAAAABwegAA1qsAAIBkAAAAAAAA/HoAAP6rAAD8egAAAKwAAPx6AAADrAAA/HoAAAWsAAD8egAAB6wAAPx6AAAJrAAA/HoAAAusAAD8egAADawAAPx6AAAPrAAA/HoAABGsAAD8egAAEqEAAPx6AAATrAAA/HoAABWsAAD8egAAF6wAAHB6AAAZrAAAcGQAAAAAAABIWAAAKGUAAEhYAABoZQAAgGUAAFhYAABoWAAAMFgAAIBlAACgWAAAKGUAAKBYAACQZQAAgGUAALBYAABoWAAAiFgAAIBlAADwWAAAKGUAAPBYAABAZQAAgGUAAABZAABoWAAA2FgAAIBlAABAWQAAKGUAAEBZAACIZQAAgGUAAFBZAABoWAAAKFkAAIBlAABoWQAAKGUAAIhYAAAoZQAAKFkAAJBZAAAAAAAA2FkAAAEAAAACAAAAAwAAAAEAAAAEAAAA6FkAAAAAAADwWQAABQAAAAYAAAAHAAAAAgAAAAgAAACQZQAAuFkAAJBlAACQZQAAuFkAAChlAAC4WQAAkGUAAAAAAAAoWgAACQAAAAoAAAALAAAAAwAAAAwAAAA4WgAAAAAAAEBaAAAFAAAADQAAAA4AAAACAAAADwAAAAAAAAB4WgAAEAAAABEAAAASAAAABAAAABMAAACIWgAAAAAAAJBaAAAFAAAAFAAAABUAAAACAAAAFgAAAAAAAADIWgAAFwAAABgAAAAZAAAABQAAABoAAADYWgAAAAAAAOBaAAAFAAAAGwAAABwAAAACAAAAHQAAAAAAAAAYWwAAHgAAAB8AAAAgAAAABgAAACEAAAAoWwAAAAAAADBbAAAFAAAAIgAAACMAAAACAAAAJAAAAAAAAABoWwAAJQAAACYAAAAnAAAABwAAACgAAAB4WwAAAAAAAIBbAAAFAAAAKQAAACoAAAACAAAAKwAAAChlAABIWwAAkGUAAJBlAABYWwAAAAAAALhbAAAsAAAALQAAAC4AAAAIAAAALwAAAMhbAAAAAAAA0FsAAAUAAAAwAAAAMQAAAAIAAAAyAAAAAAAAAAhcAAAzAAAANAAAADUAAAAJAAAANgAAABhcAAAAAAAAIFwAAAUAAAA3AAAAOAAAAAIAAAA5AAAAkGUAAOhbAACQZQAAKGUAAOhbAACQZQAAAAAAAFhcAAA6AAAAOwAAADwAAAAKAAAAPQAAAGhcAAAAAAAAcFwAAAUAAAA+AAAAPwAAAAIAAABAAAAAKGUAADhcAACQZQAAAAAAAKhcAABBAAAAQgAAAEMAAAALAAAARAAAALhcAAAAAAAAwFwAAAUAAABFAAAARgAAAAIAAABHAAAAkGUAAIhcAABoZQAAAAAAAPhcAABIAAAASQAAAEoAAAAMAAAASwAAAAhdAAAAAAAAEF0AAAUAAABMAAAATQAAAAIAAABOAAAAkGUAANhcAACQZQAAAAAAAEhdAABPAAAAUAAAAFEAAAANAAAAUgAAAFhdAAAAAAAAYF0AAAUAAABTAAAAVAAAAAIAAABVAAAAAAAAAJhdAABWAAAAVwAAAFgAAAAOAAAAWQAAAKhdAAAAAAAAsF0AAAUAAABaAAAAWwAAAAIAAABcAAAAAAAAAOhdAABdAAAAXgAAAF8AAAAPAAAAYAAAAPhdAAAAAAAAAF4AAAUAAABhAAAAYgAAAAIAAABjAAAAAAAAADheAABkAAAAZQAAAGYAAAAQAAAAZwAAAEheAAAAAAAAUF4AAAUAAABoAAAAaQAAAAIAAABqAAAAEF4AABheAACQZQAARKwAAAIAAAAABAAAgDoAABQAAABDLlVURi04AEH41AELAlxqAEGQ1QELBZRqAAAFAEGg1QELAQEAQbjVAQsKAQAAAAIAAAAcxQBB0NUBCwECAEHf1QELBf//////AEGQ1gELBRRrAAAJAEGg1gELAQEAQbTWAQsSAwAAAAAAAAACAAAASKwAAAAEAEHg1gELBP////8AQZDXAQsFlGsAAAUAQaDXAQsBAQBBuNcBCw4EAAAAAgAAAFiwAAAABABB0NcBCwEBAEHf1wELBQr/////AEGQ2AELBpRrAABwPQBB1NkBCwIYvQBBjNoBCxBwQgAAcEYAAF9wiQD/CS8PAEHA2gELAQUAQefaAQsF//////8AQZzbAQvVECBfAABrAAAAbAAAAAAAAAA4XwAAbQAAAG4AAAABAAAABgAAAAEAAAABAAAAAgAAAAMAAAAHAAAABAAAAAUAAAARAAAACAAAABIAAAAAAAAAQF8AAG8AAABwAAAAAgAAAAkAAAACAAAAAgAAAAYAAAAHAAAACgAAAAgAAAAJAAAAEwAAAAsAAAAUAAAACAAAAAAAAABIXwAAcQAAAHIAAAD4////+P///0hfAABzAAAAdAAAADRuAABIbgAACAAAAAAAAABgXwAAdQAAAHYAAAD4////+P///2BfAAB3AAAAeAAAAGRuAAB4bgAABAAAAAAAAAB4XwAAeQAAAHoAAAD8/////P///3hfAAB7AAAAfAAAAJRuAACobgAABAAAAAAAAACQXwAAfQAAAH4AAAD8/////P///5BfAAB/AAAAgAAAAMRuAADYbgAAAAAAAKhfAABvAAAAgQAAAAMAAAAJAAAAAgAAAAIAAAAKAAAABwAAAAoAAAAIAAAACQAAABMAAAAMAAAAFQAAAAAAAAC4XwAAbQAAAIIAAAAEAAAABgAAAAEAAAABAAAACwAAAAMAAAAHAAAABAAAAAUAAAARAAAADQAAABYAAAAAAAAAyF8AAG8AAACDAAAABQAAAAkAAAACAAAAAgAAAAYAAAAHAAAACgAAAAwAAAANAAAAFwAAAAsAAAAUAAAAAAAAANhfAABtAAAAhAAAAAYAAAAGAAAAAQAAAAEAAAACAAAAAwAAAAcAAAAOAAAADwAAABgAAAAIAAAAEgAAAAAAAADoXwAAhQAAAIYAAACHAAAAAQAAAAMAAAAOAAAAAAAAAAhgAACIAAAAiQAAAIcAAAACAAAABAAAAA8AAAAAAAAAGGAAAIoAAACLAAAAhwAAAAEAAAACAAAAAwAAAAQAAAAFAAAABgAAAAcAAAAIAAAACQAAAAoAAAALAAAAAAAAAFhgAACMAAAAjQAAAIcAAAAMAAAADQAAAA4AAAAPAAAAEAAAABEAAAASAAAAEwAAABQAAAAVAAAAFgAAAAAAAACQYAAAjgAAAI8AAACHAAAAAwAAAAQAAAABAAAABQAAAAIAAAABAAAAAgAAAAYAAAAAAAAA0GAAAJAAAACRAAAAhwAAAAcAAAAIAAAAAwAAAAkAAAAEAAAAAwAAAAQAAAAKAAAAAAAAAAhhAACSAAAAkwAAAIcAAAAQAAAAFwAAABgAAAAZAAAAGgAAABsAAAABAAAA+P///whhAAARAAAAEgAAABMAAAAUAAAAFQAAABYAAAAXAAAAAAAAAEBhAACUAAAAlQAAAIcAAAAYAAAAHAAAAB0AAAAeAAAAHwAAACAAAAACAAAA+P///0BhAAAZAAAAGgAAABsAAAAcAAAAHQAAAB4AAAAfAAAAJQAAAEgAAAA6AAAAJQAAAE0AAAA6AAAAJQAAAFMAAAAAAAAAJQAAAG0AAAAvAAAAJQAAAGQAAAAvAAAAJQAAAHkAAAAAAAAAJQAAAEkAAAA6AAAAJQAAAE0AAAA6AAAAJQAAAFMAAAAgAAAAJQAAAHAAAAAAAAAAJQAAAGEAAAAgAAAAJQAAAGIAAAAgAAAAJQAAAGQAAAAgAAAAJQAAAEgAAAA6AAAAJQAAAE0AAAA6AAAAJQAAAFMAAAAgAAAAJQAAAFkAAAAAAAAAQQAAAE0AAAAAAAAAUAAAAE0AAAAAAAAASgAAAGEAAABuAAAAdQAAAGEAAAByAAAAeQAAAAAAAABGAAAAZQAAAGIAAAByAAAAdQAAAGEAAAByAAAAeQAAAAAAAABNAAAAYQAAAHIAAABjAAAAaAAAAAAAAABBAAAAcAAAAHIAAABpAAAAbAAAAAAAAABNAAAAYQAAAHkAAAAAAAAASgAAAHUAAABuAAAAZQAAAAAAAABKAAAAdQAAAGwAAAB5AAAAAAAAAEEAAAB1AAAAZwAAAHUAAABzAAAAdAAAAAAAAABTAAAAZQAAAHAAAAB0AAAAZQAAAG0AAABiAAAAZQAAAHIAAAAAAAAATwAAAGMAAAB0AAAAbwAAAGIAAABlAAAAcgAAAAAAAABOAAAAbwAAAHYAAABlAAAAbQAAAGIAAABlAAAAcgAAAAAAAABEAAAAZQAAAGMAAABlAAAAbQAAAGIAAABlAAAAcgAAAAAAAABKAAAAYQAAAG4AAAAAAAAARgAAAGUAAABiAAAAAAAAAE0AAABhAAAAcgAAAAAAAABBAAAAcAAAAHIAAAAAAAAASgAAAHUAAABuAAAAAAAAAEoAAAB1AAAAbAAAAAAAAABBAAAAdQAAAGcAAAAAAAAAUwAAAGUAAABwAAAAAAAAAE8AAABjAAAAdAAAAAAAAABOAAAAbwAAAHYAAAAAAAAARAAAAGUAAABjAAAAAAAAAFMAAAB1AAAAbgAAAGQAAABhAAAAeQAAAAAAAABNAAAAbwAAAG4AAABkAAAAYQAAAHkAAAAAAAAAVAAAAHUAAABlAAAAcwAAAGQAAABhAAAAeQAAAAAAAABXAAAAZQAAAGQAAABuAAAAZQAAAHMAAABkAAAAYQAAAHkAAAAAAAAAVAAAAGgAAAB1AAAAcgAAAHMAAABkAAAAYQAAAHkAAAAAAAAARgAAAHIAAABpAAAAZAAAAGEAAAB5AAAAAAAAAFMAAABhAAAAdAAAAHUAAAByAAAAZAAAAGEAAAB5AAAAAAAAAFMAAAB1AAAAbgAAAAAAAABNAAAAbwAAAG4AAAAAAAAAVAAAAHUAAABlAAAAAAAAAFcAAABlAAAAZAAAAAAAAABUAAAAaAAAAHUAAAAAAAAARgAAAHIAAABpAAAAAAAAAFMAAABhAAAAdABB/OsBC5kBcGEAAJYAAACXAAAAhwAAAAEAAAAAAAAAmGEAAJgAAACZAAAAhwAAAAIAAAAAAAAAuGEAAJoAAACbAAAAhwAAACAAAAAhAAAABwAAAAgAAAAJAAAACgAAACIAAAALAAAADAAAAAAAAADgYQAAnAAAAJ0AAACHAAAAIwAAACQAAAANAAAADgAAAA8AAAAQAAAAJQAAABEAAAASAEGd7QEL6ARiAACeAAAAnwAAAIcAAAAmAAAAJwAAABMAAAAUAAAAFQAAABYAAAAoAAAAFwAAABgAAAAAAAAAIGIAAKAAAAChAAAAhwAAACkAAAAqAAAAGQAAABoAAAAbAAAAHAAAACsAAAAdAAAAHgAAAAAAAABAYgAAogAAAKMAAACHAAAAAwAAAAQAAAAAAAAAaGIAAKQAAAClAAAAhwAAAAUAAAAGAAAAAAAAAJBiAACmAAAApwAAAIcAAAABAAAAIQAAAAAAAAC4YgAAqAAAAKkAAACHAAAAAgAAACIAAAAAAAAA4GIAAKoAAACrAAAAhwAAABAAAAABAAAAHwAAAAAAAAAIYwAArAAAAK0AAACHAAAAEQAAAAIAAAAgAAAAAAAAAGBjAACuAAAArwAAAIcAAAADAAAABAAAAAsAAAAsAAAALQAAAAwAAAAuAAAAAAAAAChjAACuAAAAsAAAAIcAAAADAAAABAAAAAsAAAAsAAAALQAAAAwAAAAuAAAAAAAAAJBjAACxAAAAsgAAAIcAAAAFAAAABgAAAA0AAAAvAAAAMAAAAA4AAAAxAAAAAAAAANBjAACzAAAAtAAAAIcAAAAAAAAA4GMAALUAAAC2AAAAhwAAABkAAAASAAAAGgAAABMAAAAbAAAAAQAAABQAAAAPAAAAAAAAAChkAAC3AAAAuAAAAIcAAAAyAAAAMwAAACEAAAAiAAAAIwAAAAAAAAA4ZAAAuQAAALoAAACHAAAANAAAADUAAAAkAAAAJQAAACYAAABmAAAAYQAAAGwAAABzAAAAZQAAAAAAAAB0AAAAcgAAAHUAAABlAEGQ8gELrmb4XwAArgAAALsAAACHAAAAAAAAAAhkAACuAAAAvAAAAIcAAAAVAAAAAgAAAAMAAAAEAAAAHAAAABYAAAAdAAAAFwAAAB4AAAAFAAAAGAAAABAAAAAAAAAAcGMAAK4AAAC9AAAAhwAAAAcAAAAIAAAAEQAAADYAAAA3AAAAEgAAADgAAAAAAAAAsGMAAK4AAAC+AAAAhwAAAAkAAAAKAAAAEwAAADkAAAA6AAAAFAAAADsAAAAAAAAAOGMAAK4AAAC/AAAAhwAAAAMAAAAEAAAACwAAACwAAAAtAAAADAAAAC4AAAAAAAAAOGEAABEAAAASAAAAEwAAABQAAAAVAAAAFgAAABcAAAAAAAAAaGEAABkAAAAaAAAAGwAAABwAAAAdAAAAHgAAAB8AAAABAAAAAAAAAHBkAADAAAAAwQAAAMIAAADDAAAAGQAAAAMAAAABAAAABQAAAAAAAACYZAAAwAAAAMQAAADCAAAAwwAAABkAAAAEAAAAAgAAAAYAAAAAAAAAqGQAAMUAAADGAAAAPAAAAAAAAAC4ZAAAxwAAAMgAAAA9AAAAAAAAAMhkAADJAAAAygAAAD4AAAAAAAAA2GQAAMcAAADLAAAAPQAAAAAAAADoZAAAzAAAAM0AAAA/AAAAAAAAABhlAADAAAAAzgAAAMIAAADDAAAAGgAAAAAAAAAIZQAAwAAAAM8AAADCAAAAwwAAABsAAAAAAAAAmGUAAMAAAADQAAAAwgAAAMMAAAAZAAAABQAAAAMAAAAHAAAAVmVjdG9ySW50AFZlY3RvckRvdWJsZQBWZWN0b3JDaGFyAFZlY3RvckZsb2F0AHZlY3RvclRvb2xzAGNsZWFyVmVjdG9yRGJsAGNsZWFyVmVjdG9yRmxvYXQAbWF4aVNldHRpbmdzAHNldHVwAHNhbXBsZVJhdGUAY2hhbm5lbHMAYnVmZmVyU2l6ZQBtYXhpT3NjAHNoYXJlZF9wdHI8bWF4aU9zYz4Ac2luZXdhdmUAY29zd2F2ZQBwaGFzb3IAc2F3AHRyaWFuZ2xlAHNxdWFyZQBwdWxzZQBub2lzZQBzaW5lYnVmAHNpbmVidWY0AHNhd24AcmVjdABwaGFzZVJlc2V0AG1heGlFbnZlbG9wZQBzaGFyZWRfcHRyPG1heGlFbnZlbG9wZT4AbGluZQB0cmlnZ2VyAGFtcGxpdHVkZQB2YWxpbmRleABtYXhpRGVsYXlsaW5lAHNoYXJlZF9wdHI8bWF4aURlbGF5bGluZT4AZGwAbWF4aUZpbHRlcgBzaGFyZWRfcHRyPG1heGlGaWx0ZXI+AGxvcmVzAGhpcmVzAGJhbmRwYXNzAGxvcGFzcwBoaXBhc3MAY3V0b2ZmAHJlc29uYW5jZQBtYXhpTWl4AHNoYXJlZF9wdHI8bWF4aU1peD4Ac3RlcmVvAHF1YWQAYW1iaXNvbmljAG1heGlMYWdFeHAAc2hhcmVkX3B0cjxtYXhpTGFnRXhwPGRvdWJsZT4+AGluaXQAYWRkU2FtcGxlAHZhbHVlAGFscGhhAGFscGhhUmVjaXByb2NhbAB2YWwAbWF4aU1hcABzaGFyZWRfcHRyPG1heGlNYXA+AGxpbmxpbgBsaW5leHAAZXhwbGluAGNsYW1wAG1heGlEeW4Ac2hhcmVkX3B0cjxtYXhpRHluPgBnYXRlAGNvbXByZXNzb3IAY29tcHJlc3MAc2V0QXR0YWNrAHNldFJlbGVhc2UAc2V0VGhyZXNob2xkAHNldFJhdGlvAG1heGlFbnYAc2hhcmVkX3B0cjxtYXhpRW52PgBhcgBhZHNyAHNldERlY2F5AHNldFN1c3RhaW4AY29udmVydABzaGFyZWRfcHRyPGNvbnZlcnQ+AG10b2YAbWF4aURpc3RvcnRpb24Ac2hhcmVkX3B0cjxtYXhpRGlzdG9ydGlvbj4AZmFzdEF0YW4AYXRhbkRpc3QAZmFzdEF0YW5EaXN0AG1heGlGbGFuZ2VyAHNoYXJlZF9wdHI8bWF4aUZsYW5nZXI+AGZsYW5nZQBtYXhpQ2hvcnVzAHNoYXJlZF9wdHI8bWF4aUNob3J1cz4AY2hvcnVzAG1heGlEQ0Jsb2NrZXIAc2hhcmVkX3B0cjxtYXhpRENCbG9ja2VyPgBwbGF5AG1heGlTVkYAc2hhcmVkX3B0cjxtYXhpU1ZGPgBzZXRDdXRvZmYAc2V0UmVzb25hbmNlAHB1c2hfYmFjawByZXNpemUAc2l6ZQBnZXQAc2V0AE5TdDNfXzI2dmVjdG9ySWlOU185YWxsb2NhdG9ySWlFRUVFAE5TdDNfXzIxM19fdmVjdG9yX2Jhc2VJaU5TXzlhbGxvY2F0b3JJaUVFRUUATlN0M19fMjIwX192ZWN0b3JfYmFzZV9jb21tb25JTGIxRUVFAFBOU3QzX18yNnZlY3RvcklpTlNfOWFsbG9jYXRvcklpRUVFRQBQS05TdDNfXzI2dmVjdG9ySWlOU185YWxsb2NhdG9ySWlFRUVFAGlpAHYAdmkAdmlpaQB2aWlpaQBpaWkATjEwZW1zY3JpcHRlbjN2YWxFAGlpaWkAaWlpaWkATlN0M19fMjZ2ZWN0b3JJZE5TXzlhbGxvY2F0b3JJZEVFRUUATlN0M19fMjEzX192ZWN0b3JfYmFzZUlkTlNfOWFsbG9jYXRvcklkRUVFRQBQTlN0M19fMjZ2ZWN0b3JJZE5TXzlhbGxvY2F0b3JJZEVFRUUAUEtOU3QzX18yNnZlY3RvcklkTlNfOWFsbG9jYXRvcklkRUVFRQB2aWlkAHZpaWlkAGlpaWlkAE5TdDNfXzI2dmVjdG9ySWNOU185YWxsb2NhdG9ySWNFRUVFAE5TdDNfXzIxM19fdmVjdG9yX2Jhc2VJY05TXzlhbGxvY2F0b3JJY0VFRUUAUE5TdDNfXzI2dmVjdG9ySWNOU185YWxsb2NhdG9ySWNFRUVFAFBLTlN0M19fMjZ2ZWN0b3JJY05TXzlhbGxvY2F0b3JJY0VFRUUATlN0M19fMjZ2ZWN0b3JJZk5TXzlhbGxvY2F0b3JJZkVFRUUATlN0M19fMjEzX192ZWN0b3JfYmFzZUlmTlNfOWFsbG9jYXRvcklmRUVFRQBQTlN0M19fMjZ2ZWN0b3JJZk5TXzlhbGxvY2F0b3JJZkVFRUUAUEtOU3QzX18yNnZlY3RvcklmTlNfOWFsbG9jYXRvcklmRUVFRQB2aWlmAHZpaWlmAGlpaWlmADExdmVjdG9yVG9vbHMAUDExdmVjdG9yVG9vbHMAUEsxMXZlY3RvclRvb2xzAHZpaQAxMm1heGlTZXR0aW5ncwBQMTJtYXhpU2V0dGluZ3MAUEsxMm1heGlTZXR0aW5ncwA3bWF4aU9zYwBQN21heGlPc2MAUEs3bWF4aU9zYwBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQN21heGlPc2NOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySTdtYXhpT3NjRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aU9zY0VFAGkATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJN21heGlPc2NOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpZABkaWlkZGQAZGlpZGQAZGlpADEybWF4aUVudmVsb3BlAFAxMm1heGlFbnZlbG9wZQBQSzEybWF4aUVudmVsb3BlAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVAxMm1heGlFbnZlbG9wZU4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTJtYXhpRW52ZWxvcGVFRUUxMXZhbF9kZWxldGVyRQBOU3QzX18yMTBzaGFyZWRfcHRySTEybWF4aUVudmVsb3BlRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJMTJtYXhpRW52ZWxvcGVOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpaWkAMTNtYXhpRGVsYXlsaW5lAFAxM21heGlEZWxheWxpbmUAUEsxM21heGlEZWxheWxpbmUATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEzbWF4aURlbGF5bGluZU4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTNtYXhpRGVsYXlsaW5lRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxM21heGlEZWxheWxpbmVFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxM21heGlEZWxheWxpbmVOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpZGlkAGRpaWRpZGkAMTBtYXhpRmlsdGVyAFAxMG1heGlGaWx0ZXIAUEsxMG1heGlGaWx0ZXIATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEwbWF4aUZpbHRlck4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTBtYXhpRmlsdGVyRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxMG1heGlGaWx0ZXJFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxMG1heGlGaWx0ZXJOU185YWxsb2NhdG9ySVMxX0VFRUUAN21heGlNaXgAUDdtYXhpTWl4AFBLN21heGlNaXgATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdtYXhpTWl4TjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aU1peEVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN21heGlNaXhFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3bWF4aU1peE5TXzlhbGxvY2F0b3JJUzFfRUVFRQB2aWlkaWQAdmlpZGlkZAB2aWlkaWRkZAAxMG1heGlMYWdFeHBJZEUAUDEwbWF4aUxhZ0V4cElkRQBQSzEwbWF4aUxhZ0V4cElkRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQMTBtYXhpTGFnRXhwSWRFTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMl9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzJfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckkxMG1heGlMYWdFeHBJZEVFRUUxMXZhbF9kZWxldGVyRQBOU3QzX18yMTBzaGFyZWRfcHRySTEwbWF4aUxhZ0V4cElkRUVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTEwbWF4aUxhZ0V4cElkRU5TXzlhbGxvY2F0b3JJUzJfRUVFRQB2aWlkZAA3bWF4aU1hcABQN21heGlNYXAAUEs3bWF4aU1hcABOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQN21heGlNYXBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySTdtYXhpTWFwRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aU1hcEVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTdtYXhpTWFwTlNfOWFsbG9jYXRvcklTMV9FRUVFAGRpZGRkZGQAZGlkZGQAN21heGlEeW4AUDdtYXhpRHluAFBLN21heGlEeW4ATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdtYXhpRHluTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aUR5bkVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN21heGlEeW5FRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3bWF4aUR5bk5TXzlhbGxvY2F0b3JJUzFfRUVFRQBkaWlkZGlkZABkaWlkZGRkZAA3bWF4aUVudgBQN21heGlFbnYAUEs3bWF4aUVudgBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQN21heGlFbnZOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlNfMTBzaGFyZWRfcHRySVMxX0VFRTExdmFsX2RlbGV0ZXJFTlNfOWFsbG9jYXRvcklTMV9FRUVFAE4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU3QzX18yMTBzaGFyZWRfcHRySTdtYXhpRW52RUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aUVudkVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTdtYXhpRW52TlNfOWFsbG9jYXRvcklTMV9FRUVFAGRpaWRkZGlpAGRpaWRkZGRkaWkAZGlpZGkAN2NvbnZlcnQAUDdjb252ZXJ0AFBLN2NvbnZlcnQATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdjb252ZXJ0TjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3Y29udmVydEVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN2NvbnZlcnRFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3Y29udmVydE5TXzlhbGxvY2F0b3JJUzFfRUVFRQBkaWlpADE0bWF4aURpc3RvcnRpb24AUDE0bWF4aURpc3RvcnRpb24AUEsxNG1heGlEaXN0b3J0aW9uAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9wb2ludGVySVAxNG1heGlEaXN0b3J0aW9uTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckkxNG1heGlEaXN0b3J0aW9uRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxNG1heGlEaXN0b3J0aW9uRUUATlN0M19fMjIwX19zaGFyZWRfcHRyX2VtcGxhY2VJMTRtYXhpRGlzdG9ydGlvbk5TXzlhbGxvY2F0b3JJUzFfRUVFRQAxMW1heGlGbGFuZ2VyAFAxMW1heGlGbGFuZ2VyAFBLMTFtYXhpRmxhbmdlcgBOU3QzX18yMjBfX3NoYXJlZF9wdHJfcG9pbnRlcklQMTFtYXhpRmxhbmdlck4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTFtYXhpRmxhbmdlckVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJMTFtYXhpRmxhbmdlckVFAE5TdDNfXzIyMF9fc2hhcmVkX3B0cl9lbXBsYWNlSTExbWF4aUZsYW5nZXJOU185YWxsb2NhdG9ySVMxX0VFRUUAZGlpZGlkZGQAMTBtYXhpQ2hvcnVzAFAxMG1heGlDaG9ydXMAUEsxMG1heGlDaG9ydXMATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEwbWF4aUNob3J1c04xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTBtYXhpQ2hvcnVzRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxMG1heGlDaG9ydXNFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxMG1heGlDaG9ydXNOU185YWxsb2NhdG9ySVMxX0VFRUUAMTNtYXhpRENCbG9ja2VyAFAxM21heGlEQ0Jsb2NrZXIAUEsxM21heGlEQ0Jsb2NrZXIATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDEzbWF4aURDQmxvY2tlck4xMGVtc2NyaXB0ZW4xNXNtYXJ0X3B0cl90cmFpdElOU18xMHNoYXJlZF9wdHJJUzFfRUVFMTF2YWxfZGVsZXRlckVOU185YWxsb2NhdG9ySVMxX0VFRUUATjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TdDNfXzIxMHNoYXJlZF9wdHJJMTNtYXhpRENCbG9ja2VyRUVFMTF2YWxfZGVsZXRlckUATlN0M19fMjEwc2hhcmVkX3B0ckkxM21heGlEQ0Jsb2NrZXJFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUkxM21heGlEQ0Jsb2NrZXJOU185YWxsb2NhdG9ySVMxX0VFRUUAN21heGlTVkYAUDdtYXhpU1ZGAFBLN21heGlTVkYATlN0M19fMjIwX19zaGFyZWRfcHRyX3BvaW50ZXJJUDdtYXhpU1ZGTjEwZW1zY3JpcHRlbjE1c21hcnRfcHRyX3RyYWl0SU5TXzEwc2hhcmVkX3B0cklTMV9FRUUxMXZhbF9kZWxldGVyRU5TXzlhbGxvY2F0b3JJUzFfRUVFRQBOMTBlbXNjcmlwdGVuMTVzbWFydF9wdHJfdHJhaXRJTlN0M19fMjEwc2hhcmVkX3B0ckk3bWF4aVNWRkVFRTExdmFsX2RlbGV0ZXJFAE5TdDNfXzIxMHNoYXJlZF9wdHJJN21heGlTVkZFRQBOU3QzX18yMjBfX3NoYXJlZF9wdHJfZW1wbGFjZUk3bWF4aVNWRk5TXzlhbGxvY2F0b3JJUzFfRUVFRQBpaWlkAHZvaWQAYm9vbABzdGQ6OnN0cmluZwBzdGQ6OmJhc2ljX3N0cmluZzx1bnNpZ25lZCBjaGFyPgBzdGQ6OndzdHJpbmcAZW1zY3JpcHRlbjo6dmFsAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1bnNpZ25lZCBjaGFyPgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxzaG9ydD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgc2hvcnQ+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8dW5zaWduZWQgaW50PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQ4X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PGludDE2X3Q+AGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVpbnQxNl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxpbnQzMl90PgBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzx1aW50MzJfdD4AZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8bG9uZyBkb3VibGU+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWVFRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxkb3VibGU+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWRFRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxmbG9hdD4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJZkVFAGVtc2NyaXB0ZW46Om1lbW9yeV92aWV3PHVuc2lnbmVkIGxvbmc+AE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SW1FRQBlbXNjcmlwdGVuOjptZW1vcnlfdmlldzxsb25nPgBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lsRUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJakVFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWlFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0l0RUUATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJc0VFAE4xMGVtc2NyaXB0ZW4xMW1lbW9yeV92aWV3SWhFRQBOMTBlbXNjcmlwdGVuMTFtZW1vcnlfdmlld0lhRUUAZW1zY3JpcHRlbjo6bWVtb3J5X3ZpZXc8Y2hhcj4ATjEwZW1zY3JpcHRlbjExbWVtb3J5X3ZpZXdJY0VFAE5TdDNfXzIxMmJhc2ljX3N0cmluZ0l3TlNfMTFjaGFyX3RyYWl0c0l3RUVOU185YWxsb2NhdG9ySXdFRUVFAE5TdDNfXzIyMV9fYmFzaWNfc3RyaW5nX2NvbW1vbklMYjFFRUUATlN0M19fMjEyYmFzaWNfc3RyaW5nSWhOU18xMWNoYXJfdHJhaXRzSWhFRU5TXzlhbGxvY2F0b3JJaEVFRUUATlN0M19fMjEyYmFzaWNfc3RyaW5nSWNOU18xMWNoYXJfdHJhaXRzSWNFRU5TXzlhbGxvY2F0b3JJY0VFRUUAZG91YmxlAGZsb2F0AHVuc2lnbmVkIGxvbmcAbG9uZwB1bnNpZ25lZCBpbnQAaW50AHVuc2lnbmVkIHNob3J0AHNob3J0AHVuc2lnbmVkIGNoYXIAc2lnbmVkIGNoYXIAY2hhcgBpbmZpbml0eQAAAQIEBwMGBQAtKyAgIDBYMHgAKG51bGwpAC0wWCswWCAwWC0weCsweCAweABpbmYASU5GAG5hbgBOQU4ALgBMQ19BTEwATEFORwBDLlVURi04AFBPU0lYAE1VU0xfTE9DUEFUSABOU3QzX18yOGlvc19iYXNlRQBOU3QzX18yOWJhc2ljX2lvc0ljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRQBOU3QzX18yOWJhc2ljX2lvc0l3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRQBOU3QzX18yMTViYXNpY19zdHJlYW1idWZJY05TXzExY2hhcl90cmFpdHNJY0VFRUUATlN0M19fMjE1YmFzaWNfc3RyZWFtYnVmSXdOU18xMWNoYXJfdHJhaXRzSXdFRUVFAE5TdDNfXzIxM2Jhc2ljX2lzdHJlYW1JY05TXzExY2hhcl90cmFpdHNJY0VFRUUATlN0M19fMjEzYmFzaWNfaXN0cmVhbUl3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRQBOU3QzX18yMTNiYXNpY19vc3RyZWFtSWNOU18xMWNoYXJfdHJhaXRzSWNFRUVFAE5TdDNfXzIxM2Jhc2ljX29zdHJlYW1Jd05TXzExY2hhcl90cmFpdHNJd0VFRUUATlN0M19fMjExX19zdGRvdXRidWZJd0VFAE5TdDNfXzIxMV9fc3Rkb3V0YnVmSWNFRQB1bnN1cHBvcnRlZCBsb2NhbGUgZm9yIHN0YW5kYXJkIGlucHV0AE5TdDNfXzIxMF9fc3RkaW5idWZJd0VFAE5TdDNfXzIxMF9fc3RkaW5idWZJY0VFAE5TdDNfXzI3Y29sbGF0ZUljRUUATlN0M19fMjZsb2NhbGU1ZmFjZXRFAE5TdDNfXzI3Y29sbGF0ZUl3RUUAJXAAQwBOU3QzX18yN251bV9nZXRJY05TXzE5aXN0cmVhbWJ1Zl9pdGVyYXRvckljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRUVFAE5TdDNfXzI5X19udW1fZ2V0SWNFRQBOU3QzX18yMTRfX251bV9nZXRfYmFzZUUATlN0M19fMjdudW1fZ2V0SXdOU18xOWlzdHJlYW1idWZfaXRlcmF0b3JJd05TXzExY2hhcl90cmFpdHNJd0VFRUVFRQBOU3QzX18yOV9fbnVtX2dldEl3RUUAJXAAAAAATABsbAAlAAAAAABsAE5TdDNfXzI3bnVtX3B1dEljTlNfMTlvc3RyZWFtYnVmX2l0ZXJhdG9ySWNOU18xMWNoYXJfdHJhaXRzSWNFRUVFRUUATlN0M19fMjlfX251bV9wdXRJY0VFAE5TdDNfXzIxNF9fbnVtX3B1dF9iYXNlRQBOU3QzX18yN251bV9wdXRJd05TXzE5b3N0cmVhbWJ1Zl9pdGVyYXRvckl3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRUVFAE5TdDNfXzI5X19udW1fcHV0SXdFRQAlSDolTTolUwAlbS8lZC8leQAlSTolTTolUyAlcAAlYSAlYiAlZCAlSDolTTolUyAlWQBBTQBQTQBKYW51YXJ5AEZlYnJ1YXJ5AE1hcmNoAEFwcmlsAE1heQBKdW5lAEp1bHkAQXVndXN0AFNlcHRlbWJlcgBPY3RvYmVyAE5vdmVtYmVyAERlY2VtYmVyAEphbgBGZWIATWFyAEFwcgBKdW4ASnVsAEF1ZwBTZXAAT2N0AE5vdgBEZWMAU3VuZGF5AE1vbmRheQBUdWVzZGF5AFdlZG5lc2RheQBUaHVyc2RheQBGcmlkYXkAU2F0dXJkYXkAU3VuAE1vbgBUdWUAV2VkAFRodQBGcmkAU2F0ACVtLyVkLyV5JVktJW0tJWQlSTolTTolUyAlcCVIOiVNJUg6JU06JVMlSDolTTolU05TdDNfXzI4dGltZV9nZXRJY05TXzE5aXN0cmVhbWJ1Zl9pdGVyYXRvckljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRUVFAE5TdDNfXzIyMF9fdGltZV9nZXRfY19zdG9yYWdlSWNFRQBOU3QzX18yOXRpbWVfYmFzZUUATlN0M19fMjh0aW1lX2dldEl3TlNfMTlpc3RyZWFtYnVmX2l0ZXJhdG9ySXdOU18xMWNoYXJfdHJhaXRzSXdFRUVFRUUATlN0M19fMjIwX190aW1lX2dldF9jX3N0b3JhZ2VJd0VFAE5TdDNfXzI4dGltZV9wdXRJY05TXzE5b3N0cmVhbWJ1Zl9pdGVyYXRvckljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRUVFAE5TdDNfXzIxMF9fdGltZV9wdXRFAGxvY2FsZSBub3Qgc3VwcG9ydGVkAE5TdDNfXzI4dGltZV9wdXRJd05TXzE5b3N0cmVhbWJ1Zl9pdGVyYXRvckl3TlNfMTFjaGFyX3RyYWl0c0l3RUVFRUVFAE5TdDNfXzIxMG1vbmV5cHVuY3RJY0xiMEVFRQBOU3QzX18yMTBtb25leV9iYXNlRQBOU3QzX18yMTBtb25leXB1bmN0SWNMYjFFRUUATlN0M19fMjEwbW9uZXlwdW5jdEl3TGIwRUVFAE5TdDNfXzIxMG1vbmV5cHVuY3RJd0xiMUVFRQAwMTIzNDU2Nzg5ACVMZgBtb25leV9nZXQgZXJyb3IATlN0M19fMjltb25leV9nZXRJY05TXzE5aXN0cmVhbWJ1Zl9pdGVyYXRvckljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRUVFAE5TdDNfXzIxMV9fbW9uZXlfZ2V0SWNFRQAwMTIzNDU2Nzg5AE5TdDNfXzI5bW9uZXlfZ2V0SXdOU18xOWlzdHJlYW1idWZfaXRlcmF0b3JJd05TXzExY2hhcl90cmFpdHNJd0VFRUVFRQBOU3QzX18yMTFfX21vbmV5X2dldEl3RUUAJS4wTGYATlN0M19fMjltb25leV9wdXRJY05TXzE5b3N0cmVhbWJ1Zl9pdGVyYXRvckljTlNfMTFjaGFyX3RyYWl0c0ljRUVFRUVFAE5TdDNfXzIxMV9fbW9uZXlfcHV0SWNFRQBOU3QzX18yOW1vbmV5X3B1dEl3TlNfMTlvc3RyZWFtYnVmX2l0ZXJhdG9ySXdOU18xMWNoYXJfdHJhaXRzSXdFRUVFRUUATlN0M19fMjExX19tb25leV9wdXRJd0VFAE5TdDNfXzI4bWVzc2FnZXNJY0VFAE5TdDNfXzIxM21lc3NhZ2VzX2Jhc2VFAE5TdDNfXzIxN19fd2lkZW5fZnJvbV91dGY4SUxtMzJFRUUATlN0M19fMjdjb2RlY3Z0SURpYzExX19tYnN0YXRlX3RFRQBOU3QzX18yMTJjb2RlY3Z0X2Jhc2VFAE5TdDNfXzIxNl9fbmFycm93X3RvX3V0ZjhJTG0zMkVFRQBOU3QzX18yOG1lc3NhZ2VzSXdFRQBOU3QzX18yN2NvZGVjdnRJY2MxMV9fbWJzdGF0ZV90RUUATlN0M19fMjdjb2RlY3Z0SXdjMTFfX21ic3RhdGVfdEVFAE5TdDNfXzI3Y29kZWN2dElEc2MxMV9fbWJzdGF0ZV90RUUATlN0M19fMjZsb2NhbGU1X19pbXBFAE5TdDNfXzI1Y3R5cGVJY0VFAE5TdDNfXzIxMGN0eXBlX2Jhc2VFAE5TdDNfXzI1Y3R5cGVJd0VFAGZhbHNlAHRydWUATlN0M19fMjhudW1wdW5jdEljRUUATlN0M19fMjhudW1wdW5jdEl3RUUATlN0M19fMjE0X19zaGFyZWRfY291bnRFAE5TdDNfXzIxOV9fc2hhcmVkX3dlYWtfY291bnRFAGJhc2ljX3N0cmluZwBhbGxvY2F0b3I8VD46OmFsbG9jYXRlKHNpemVfdCBuKSAnbicgZXhjZWVkcyBtYXhpbXVtIHN1cHBvcnRlZCBzaXplAHZlY3RvcgB0ZXJtaW5hdGluZyB3aXRoICVzIGV4Y2VwdGlvbiBvZiB0eXBlICVzOiAlcwB0ZXJtaW5hdGluZyB3aXRoICVzIGV4Y2VwdGlvbiBvZiB0eXBlICVzAHRlcm1pbmF0aW5nIHdpdGggJXMgZm9yZWlnbiBleGNlcHRpb24AdGVybWluYXRpbmcAdW5jYXVnaHQAU3Q5ZXhjZXB0aW9uAE4xMF9fY3h4YWJpdjExNl9fc2hpbV90eXBlX2luZm9FAFN0OXR5cGVfaW5mbwBOMTBfX2N4eGFiaXYxMjBfX3NpX2NsYXNzX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19jbGFzc190eXBlX2luZm9FAHB0aHJlYWRfb25jZSBmYWlsdXJlIGluIF9fY3hhX2dldF9nbG9iYWxzX2Zhc3QoKQBjYW5ub3QgY3JlYXRlIHB0aHJlYWQga2V5IGZvciBfX2N4YV9nZXRfZ2xvYmFscygpAGNhbm5vdCB6ZXJvIG91dCB0aHJlYWQgdmFsdWUgZm9yIF9fY3hhX2dldF9nbG9iYWxzKCkAdGVybWluYXRlX2hhbmRsZXIgdW5leHBlY3RlZGx5IHJldHVybmVkAHRlcm1pbmF0ZV9oYW5kbGVyIHVuZXhwZWN0ZWRseSB0aHJldyBhbiBleGNlcHRpb24Ac3RkOjpiYWRfYWxsb2MAU3Q5YmFkX2FsbG9jAFN0MTFsb2dpY19lcnJvcgBTdDEzcnVudGltZV9lcnJvcgBTdDEybGVuZ3RoX2Vycm9yAHN0ZDo6YmFkX2Nhc3QAU3Q4YmFkX2Nhc3QATjEwX19jeHhhYml2MTE5X19wb2ludGVyX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19wYmFzZV90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjEyM19fZnVuZGFtZW50YWxfdHlwZV9pbmZvRQB2AERuAGIAYwBoAGEAcwB0AGkAagBtAGYAZABOMTBfX2N4eGFiaXYxMjFfX3ZtaV9jbGFzc190eXBlX2luZm9F';
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
    'initial': 1732,
    'maximum': 1732,
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





// STATICTOP = STATIC_BASE + 50720;
/* global initializers */  __ATINIT__.push({ func: function() { globalCtors() } });








/* no memory initializer */
var tempDoublePtr = 51728
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
  
  var _stdin=51504;
  
  var _stdout=51520;
  
  var _stderr=51536;var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,trackingDelegate:{},tracking:{openFlags:{READ:1,WRITE:2}},ErrnoError:null,genericErrors:{},filesystems:null,syncFSRequests:0,handleFSError:function (e) {
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

