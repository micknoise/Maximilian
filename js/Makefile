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
OUTPUT=$(BUILD_DIR)/maximilian.js

OUTPUT_AW=$(BUILD_DIR)/maximilian.wasmmodule.js
# General flags
# https://kripken.github.io/emscripten-site/docs/tools_reference/emcc.html
# -s DEMANGLE_SUPPORT=1

# -s ALLOW_MEMORY_GROWTH=1 \

# ScriptProcessorNode – No WASM generation, outputs everything in one JS file
CFLAGS=-O3 -s WASM=0 \
						-s DISABLE_EXCEPTION_CATCHING=0 \
						-s ASSERTIONS=1 \
						-s EXPORT_NAME="'maximilian'" \
						-s MODULARIZE=1 --memory-init-file 0 --profiling -std=c++11

# ScriptProcessorNode – with WASM generation, outputs JS file + WASM module
WASMCFLAGS=-O3 -s \
				-s WASM=1 \
				-s DISABLE_EXCEPTION_CATCHING=0 \
				-s ALLOW_MEMORY_GROWTH=1 \
				-s ASSERTIONS=1 \
				-s EXPORT_NAME="'maximilian'" \
				-s MODULARIZE=1 --memory-init-file 0 --profiling -std=c++11

# Audio Worklets Maximilian WASM module
AWWASMCFLAGS= --bind -O1 \
				-s WASM=1 \
				-s BINARYEN_ASYNC_COMPILATION=0 \
				-s ALLOW_MEMORY_GROWTH=1 \
				-s SINGLE_FILE=1 \
				-s EXPORT_NAME="'maximilian'" \

# -std=c++11

RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
CYAN=\033[0;36m


all: full wasm aw
# all: full
	@echo "${RED}\r\nBUILD ALL"

full:
	@echo "${RED}\r\nBUILD WITHOUT WASM – maximilian.js \r\n${GREEN}"
	$(EMSCR) $(CFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC)
	# $(EMSCR) $(CFLAGS) --post-js $(POST_JS_webAudio_all) --bind -o $(OUTPUT_MAXI) $(SOURCE_MAXI) $(SOURCES_LIBS)

wasm:
	@echo "${RED}\r\nBUILD WITH WASM – maximilian.wasm.js + maximilian.wasm \r\n${CYAN}"
	$(EMSCR) $(WASMCFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC)

aw:
	@echo "${RED}\r\nBUILD FOR WORKLETS – maximilian.wasmmodule.js \r\n${YELLOW}"
	$(EMSCR) $(AWWASMCFLAGS) --post-js $(POST_JS) -o $(OUTPUT_AW) $(SRC)


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
