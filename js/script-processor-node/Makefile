# change '../../em++' to path to em++ in emscripten folder
# EMSCR=EMCC_DEBUG=1 em++
EMSCR=em++

# Maximilian
SRC=../../src/maximilian.cpp
SRC_EM=../../src/maximilian.embind.cpp
# SRC_LIBS=../../src/libs/*.cpp
SRC_LIBS=../../src/libs/maxiSynths.cpp ../../src/libs/maxiGrains.cpp ../../src/libs/maxiFFT.cpp ../../src/libs/fft.cpp ../../src/libs/maxiMFCC.cpp ../../src/libs/maxiReverb.cpp
C_SRC_LIBS=../../src/libs/stb_vorbis.c

# POST_JS – external js handling web audio etc
POST_JS=./maximilian.post.js
MAXITRANSPILE=../purejs/build/maximilian.transpile.js

BUILD_DIR=build
MKDIR_P = mkdir -p

# target .js file
OUTPUT=$(BUILD_DIR)/maximilian.js

OUTPUT_AW=$(BUILD_DIR)/maximilian.wasmmodule.js
# General flags
# https://kripken.github.io/emscripten-site/docs/tools_reference/emcc.html
# -s DEMANGLE_SUPPORT=1

# -s ALLOW_MEMORY_GROWTH=1 \

# ScriptProcessorNode – No WASM generation, invokes SPN macro in embindings for smart pointer ctor, outputs everything in one JS file
CFLAGS=--bind -O1 \
				-s WASM=0 \
				-s WASM_ASYNC_COMPILATION=1 \
				-s DISABLE_EXCEPTION_CATCHING=0 \
				-s ASSERTIONS=1 \
				-s SINGLE_FILE=1 \
				-s --memory-init-file 0 \
				-std=c++11 -DSPN -DVORBIS \
				-s EXPORT_NAME="'maximilian'" \
				-s TOTAL_MEMORY=67108864 \
				-s MODULARIZE=1 \




# ScriptProcessorNode – with WASM generation, invokes SPN macro in embindings for smart pointer ctor, outputs JS file + WASM module
WASMCFLAGS=--bind -O3 \
				-s WASM=1 \
				-s DISABLE_EXCEPTION_CATCHING=0 \
				-s ALLOW_MEMORY_GROWTH=1 \
				-s ASSERTIONS=1 \
				-s --memory-init-file 0 \
				-std=c++11 \
				-DSPN -DVORBIS \
				-s TOTAL_MEMORY=67108864 
#				-s EXPORT_NAME="'maximilian'" \
				-s MODULARIZE=1


RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
CYAN=\033[0;36m
RESET=\x1b[0m


all: asm.js

.PHONY: directory
directory: $(BUILD_DIR)
	@echo "Copying files"

$(BUILD_DIR):
	$(MKDIR_P) $(BUILD_DIR)

asm.js: directory
	@echo "${RED}\r\nBuild asm.js – maximilian.js \r\n ${RESET}"
	$(EMSCR) $(CFLAGS)  --post-js $(POST_JS)  --post-js $(MAXITRANSPILE) -o $(OUTPUT) $(SRC) $(SRC_EM) $(SRC_LIBS) $(C_SRC_LIBS)

wasm: directory
	@echo "${RED}\r\nBuild Wasm – maximilian.wasm + maximilian.js \r\n ${RESET}"
	$(EMSCR) $(WASMCFLAGS) --post-js $(POST_JS) --post-js $(MAXITRANSPILE) -o $(OUTPUT) $(SRC) $(SRC_LIBS) $(C_SRC_LIBS)

clean:
	@echo "Cleaning up"
	rm -f $(BUILD_DIR)/maximilian.*
