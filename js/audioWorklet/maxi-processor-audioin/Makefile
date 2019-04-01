EMSCR=em++

SOURCE_MAXI=../../src/cpp/maxi_emscr_new.cpp
SOURCE_maxiFFT=../../src/cpp/libs/maxiFFT.cpp
SOURCE_maxiMFCC=../../src/cpp/libs/maxiMFCC.cpp
SOURCE_maxiGrains=../../src/cpp/libs/maxiGrains.cpp
SOURCES_LIBS = $(SOURCE_maxiFFT) $(SOURCE_maxiMFCC) $(SOURCE_maxiGrains)

OUTPUT_MAXI=maxi-audio.wasmmodule.js

POST_JS=maxi-audio.js

# CFLAGS=--bind -O1 -s DISABLE_EXCEPTION_CATCHING=0 \
# 						-s ALLOW_MEMORY_GROWTH=1 \
# 						-s ASSERTIONS=1 \
# 						-s EXPORT_NAME="'MaxiLib'" \
# 						-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
# 						-s MODULARIZE=1 --memory-init-file 0 --profiling \
# 						-s BINARYEN_ASYNC_COMPILATION=0 \
# 						-s SINGLE_FILE=1

CFLAGS=--bind -O1 \
 						-s DISABLE_EXCEPTION_CATCHING=0 \
						-s ASSERTIONS=1 \
						-s WASM=0 \
						-s BINARYEN_ASYNC_COMPILATION=0 \
						-s SINGLE_FILE=1

build: $(SOURCE_MAXI)
	@emcc $(CFLAGS) --post-js $(POST_JS) -o $(OUTPUT_MAXI) $(SOURCE_MAXI) $(SOURCES_LIBS)

clean:
	@rm -f maxi-audio.wasmmodule.js
