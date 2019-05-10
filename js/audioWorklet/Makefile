EMSCR=em++

SRC=../../src/maximilian.cpp
SRC_EM=../../src/maximilian.embind.cpp
# SRC_LIBS=../../../src/libs/*.cpp
SRC_LIBS=../../src/libs/maxiSynths.cpp

BUILD_DIR=build
MKDIR_P = mkdir -p

# POST_JS – external js handling web audio etc
POST_JS=maximilian.post.js

OUTPUT=$(BUILD_DIR)/maximilian.wasmmodule.js


CFLAGS=--bind -O1 \
 			-s DISABLE_EXCEPTION_CATCHING=0 \
			-s ASSERTIONS=1 \
			-s WASM=0 \
			-s BINARYEN_ASYNC_COMPILATION=0 \
			-s SINGLE_FILE=1
			# -s MODULARIZE_INSTANCE=1 \
			# -s EXPORT_NAME="'maximilian'"
			# -s --memory-init-file 0 --profiling -std=c++11 \
			# -s ALLOW_MEMORY_GROWTH=1 \


RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
CYAN=\033[0;36m

all: full

.PHONY: directory
directory: ${BUILD_DIR}
	@echo "Copying files"

${BUILD_DIR}:
	${MKDIR_P} ${BUILD_DIR}

full: directory
	@echo "${YELLOW}\r\nBUILD for Web Audio Worklets – maximilian.wasmmodule.js \r\n"
	@emcc $(CFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC_EM) $(SRC) $(SRC_LIBS)

clean:
	@echo "Cleaning up"
	rm -f $(BUILD_DIR)/maximilian.*
