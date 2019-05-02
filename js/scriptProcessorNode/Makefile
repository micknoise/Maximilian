# change '../../em++' to path to em++ in emscripten folder
EMSCR=em++

# Maximilian
SRC=../../src/maximilian.cpp
SRC_EM=../../src/maximilian.embind.cpp
# SRC_LIBS=../../../src/libs/*.cpp
SRC_LIBS=../../src/libs/maxiSynths.cpp

# POST_JS – external js handling web audio etc
POST_JS=./maximilian.post.js

BUILD_DIR=build

# target .js file
OUTPUT=$(BUILD_DIR)/maximilian.js

OUTPUT_AW=$(BUILD_DIR)/maximilian.wasmmodule.js
# General flags
# https://kripken.github.io/emscripten-site/docs/tools_reference/emcc.html
# -s DEMANGLE_SUPPORT=1

# -s ALLOW_MEMORY_GROWTH=1 \

# ScriptProcessorNode – No WASM generation, outputs everything in one JS file
CFLAGS=--bind -O1 \
				-s WASM=0 \
				-s DISABLE_EXCEPTION_CATCHING=0 \
				-s ASSERTIONS=1 \
				-s SINGLE_FILE=1 \
				-s --memory-init-file 0 --profiling -std=c++11 \
				-s MODULARIZE=1 \
				-s EXPORT_NAME="'maximilian'" \


# ScriptProcessorNode – with WASM generation, outputs JS file + WASM module
WASMCFLAGS=--bind -O3 \
				-s WASM=1 \
				-s DISABLE_EXCEPTION_CATCHING=0 \
				-s ALLOW_MEMORY_GROWTH=1 \
				-s ASSERTIONS=1 \
				-s --memory-init-file 0 --profiling -std=c++11 \
				# -s EXPORT_NAME="'maximilian'" \
				-s MODULARIZE=1


MKDIR_P = mkdir -p

RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
CYAN=\033[0;36m

all: full
	# @emcc $(CFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC_EM) $(SRC) $(SRC_LIBS)

.PHONY: directory
directory: $(BUILD_DIR)
	@echo "Copying files"

$(BUILD_DIR):
	$(MKDIR_P) $(BUILD_DIR)

full: directory
	@echo "${RED}\r\nBUILD WITHOUT WASM – maximilian.js \r\n${GREEN}"
	$(EMSCR) $(CFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC) $(SRC_EM) $(SRC_LIBS)

wasm: directory
	@echo "${RED}\r\nBUILD WITH WASM – maximilian.wasm + maximilian.js \r\n${CYAN}"
	$(EMSCR) $(WASMCFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC)

# clean:
# 	@rm -f maximilian.wasmmodule.js


# all: full
# 	# all: full
# 	@echo "${RED}\r\nBUILD ALL"

clean:
	@echo "Cleaning up"
	rm -f $(BUILD_DIR)/maximilian.*



# without webAudio stuff
# basic:
# 	$(EMSCR) $(CFLAGS) --post-js $(POST_JS_extras) --bind -o $(OUTPUT_MAXI_noAudio) $(SOURCE_MAXI) $(SOURCES_LIBS)

# .PHONY: copyfiles
# copyfiles: full
# 	@echo "Copying files"
# 	cp -f $(BUILD_DIR)/maxiLib.js $(TEST_DIR)/maxiLib.js
# 	cp -f $(BUILD_DIR)/maxiLib.wasmmodule.js $(TEST_DIR)/maxiLib.wasmmodule.js
# cp -f $(BUILD_DIR)/maxiLib.wasm $(TEST_DIR)/maxiLib.wasm
