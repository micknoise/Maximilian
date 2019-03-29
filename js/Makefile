# change '../../em++' to path to em++ in emscripten folder
EMSCR=em++

# Maximilian

# POST_JS – external js handling web audio etc
POST_JS=./src/maximilian.post.js

#the .cpp file that is used
SRC=../src/maximilian.cpp
BUILD_DIR=build
TEST_DIR=test

# target .js file
OUTPUT_MAXI=$(BUILD_DIR)/maximilian.js

# General flags
# https://kripken.github.io/emscripten-site/docs/tools_reference/emcc.html
# -s DEMANGLE_SUPPORT=1

# ScriptProcessorNode – No WASM generation, outputs everything in one JS file
CFLAGS=-O3 -s WASM=0 \
						-s DISABLE_EXCEPTION_CATCHING=0 \
						-s ALLOW_MEMORY_GROWTH=1 \
						-s ASSERTIONS=1 \
						-s EXPORT_NAME="'Maximilian'" \
						-s MODULARIZE=1 --memory-init-file 0 --profiling

# ScriptProcessorNode – No WASM generation, outputs everything in one JS file
WASMCFLAGS=-O3 -s WASM=1 \
				-s DISABLE_EXCEPTION_CATCHING=0 \
				-s ALLOW_MEMORY_GROWTH=1 \
				-s ASSERTIONS=1 \
				-s EXPORT_NAME="'Maximilian'" \
				-s MODULARIZE=1 --memory-init-file 0 --profiling

# Audio Worklets Maximilian WASM module
AWWASMCFLAGS= --bind -O1 \
				-s WASM=1 \
				-s BINARYEN_ASYNC_COMPILATION=0 \
				-s SINGLE_FILE=1 \
				$(SOURCE_MAXI)  \
				-o $(BUILD_DIR)/maximilian.wasmmodule.js

all: full
# all: full copyfiles
	@echo "Build all"

full:
	@echo "Build without WASM"
	$(EMSCR) $(CFLAGS) --post-js $(POST_JS)
	# $(EMSCR) $(CFLAGS) --post-js $(POST_JS_webAudio_all) --bind -o $(OUTPUT_MAXI) $(SOURCE_MAXI) $(SOURCES_LIBS)

audioWorklets:
	@echo "Build for Web Audio Worklets (maximilian.wasmmodule.js)"
	$(EMSCR) $(WASMCFLAGS) --post-js $(POST_JS)
# without webAudio stuff
# basic:
# 	$(EMSCR) $(CFLAGS) --post-js $(POST_JS_extras) --bind -o $(OUTPUT_MAXI_noAudio) $(SOURCE_MAXI) $(SOURCES_LIBS)

# .PHONY: copyfiles
# copyfiles: full
# 	@echo "Copying files"
# 	cp -f $(BUILD_DIR)/maxiLib.js $(TEST_DIR)/maxiLib.js
# 	cp -f $(BUILD_DIR)/maxiLib.wasmmodule.js $(TEST_DIR)/maxiLib.wasmmodule.js
	# cp -f $(BUILD_DIR)/maxiLib.wasm $(TEST_DIR)/maxiLib.wasm

clean:
	@echo "Cleaning up"
	rm -f $(BUILD_DIR)/maximilian.* $(TEST_DIR)/maximilian.*
