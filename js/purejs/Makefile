CLANGBIN=/opt/cheerp/bin/clang++

SRC=../../src/maximilian.cpp
HEADERS=../../src
SRC_CHEERP=./maxi-purejs.cpp

COMMON_DIR=common
BUILD_DIR=build
MKDIR_P = mkdir -p


OUTPUT=$(BUILD_DIR)/maximilian.transpile.js


CFLAGS= -DCHEERP \
-cheerp-pretty-code \
-cheerp-no-math-imul \
-cheerp-no-math-fround \
-cheerp-force-typed-arrays \
-O3

#-cheerp-no-native-math \ --is this faster??? possibly browser dependent...


RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
CYAN=\033[0;36m
RESET=\x1b[0m

# --post-js $(POST_JS)

all: full

.PHONY: directory
directory: ${BUILD_DIR}
	@echo "Copying files"

${BUILD_DIR}:
	${MKDIR_P} ${BUILD_DIR}

full: directory
	@echo "${YELLOW}\r\nTranspiling to pure JS – maximilian.transpile.js \r\n ${RESET}"
	$(CLANGBIN) $(CFLAGS) -target cheerp -I$(HEADERS) -o $(OUTPUT) $(SRC_CHEERP) $(SRC)
	cat module-bindings.js >> build/maximilian.transpile.js

clean:
	@echo "Cleaning up"
	rm -f $(BUILD_DIR)/maximilian.*
