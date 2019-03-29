# change '../../em++' to path to em++ in emscripten folder
EMSCR=em++

# ----------------------------------------
# Maximilian base stuff

# POST_JS is all the external js stuff that handles web audio etc

# POST_JS_webAudioWorklet_all=src/js/maxiAudio.js
POST_JS_webAudio_all=maxi_webAudio.js
# POST_JS_extras=src/js/maxi_extras.js

#the .cpp file that is used
SOURCE_MAXI=../src/maximilian.cpp

BUILD_DIR=build
TEST_DIR=test

# destination .js file
OUTPUT_MAXI=$(BUILD_DIR)/maxiLib.js
# OUTPUT_MAXI_noAudio=maxiLib/maxiLib_noWebAudio.js

# ----------------------------------------
# extra libs stuff

# SOURCE_maxiFFT=../src/libs/maxiFFT.cpp
# SOURCE_maxiMFCC=../src/libs/maxiMFCC.cpp
# SOURCE_maxiGrains=../src/libs/maxiGrains.cpp
# SOURCES_LIBS = $(SOURCE_maxiFFT) $(SOURCE_maxiMFCC) $(SOURCE_maxiGrains)
# ----------------------------------------
# General flags
# https://kripken.github.io/emscripten-site/docs/tools_reference/emcc.html
# -s DEMANGLE_SUPPORT=1
# CFLAGS=-O3 -s WASM=1 \
# 				-s DISABLE_EXCEPTION_CATCHING=0 \
# 				-s ALLOW_MEMORY_GROWTH=1 \
# 				-s ASSERTIONS=1 \
# 				-s EXPORT_NAME="'MaxiLib'" \
# 				-s MODULARIZE=1 --memory-init-file 0 --profiling

# Prevent WASM generation, outputs everything in one JS file
# CFLAGS=-O3 -s WASM=0 \
# 						-s DISABLE_EXCEPTION_CATCHING=0 \
# 						-s ALLOW_MEMORY_GROWTH=1 \
# 						-s ASSERTIONS=1 \
# 						-s EXPORT_NAME="'MaxiLib'" \
# 						-s MODULARIZE=1 --memory-init-file 0 --profiling



CFLAGS= --bind -O1 \
				-s WASM=1 \
				-s BINARYEN_ASYNC_COMPILATION=0 \
				-s SINGLE_FILE=1 \
				$(SOURCE_MAXI)  \
				-o $(BUILD_DIR)/maxiLib.wasmmodule.js

				# CFLAGS= --bind -O1 \
				# 				-s WASM=1 \
				# 				-s BINARYEN_ASYNC_COMPILATION=0 \
				# 				-s SINGLE_FILE=1 \
				# 				$(SOURCE_MAXI) $(SOURCES_LIBS) \
				# 				-o $(BUILD_DIR)/maxiLib.wasmmodule.js


all: full
# all: full copyfiles
	@echo "Building all"

# ----------------------------------------
# Final paths
full:
	@echo "Building with WASM"
	$(EMSCR) $(CFLAGS) --post-js $(POST_JS_webAudio_all)
	# $(EMSCR) $(CFLAGS) --post-js $(POST_JS_webAudio_all) --bind -o $(OUTPUT_MAXI) $(SOURCE_MAXI) $(SOURCES_LIBS)

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
	rm -f $(BUILD_DIR)/maxiLib.* $(TEST_DIR)/maxiLib.*
