EMSCR=em++

SRC=../../src/maximilian.cpp
SRC_EM=../../src/maximilian.embind.cpp
# SRC_LIBS=../../../src/libs/*.cpp
SRC_LIBS=../../src/libs/maxiSynths.cpp

BUILD_DIR=build


OUTPUT=$(BUILD_DIR)/maximilian.wasmmodule.js

# POST_JS – external js handling web audio etc
POST_JS=maximilian.post.js


# CFLAGS=--bind -O1 -s DISABLE_EXCEPTION_CATCHING=0 \
# 						-s EXPORT_NAME="'Maximilian'" \
# 						-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
# 						-s MODULARIZE=1 --memory-init-file 0 --profiling \
# 						-s BINARYEN_ASYNC_COMPILATION=0 \
# 						-s ENVIRONMENT=web \

# -s ALLOW_MEMORY_GROWTH=1 \


CFLAGS=--bind -O1 \
 			-s DISABLE_EXCEPTION_CATCHING=0 \
			-s ASSERTIONS=1 \
			-s WASM=0 \
			-s BINARYEN_ASYNC_COMPILATION=0 \
			-s SINGLE_FILE=1
			# -s MODULARIZE_INSTANCE=1 \
			# -s EXPORT_NAME="'maximilian'"
			# -s --memory-init-file 0 --profiling -std=c++11 \


all: $(SOURCE_MAXI)
	@emcc $(CFLAGS) --post-js $(POST_JS) -o $(OUTPUT) $(SRC_EM) $(SRC) $(SRC_LIBS)

clean:
	@rm -f maximilian.wasmmodule.js
