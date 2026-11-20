#!/usr/bin/env bash
# Build and run every verification case.
#
#   ./run.sh            run all cases
#   ./run.sh sine_440   run one
#
# No audio device, no audio dependencies: the harness links the core library only,
# and the FFT case adds maxiFFT.cpp + fft.cpp.

set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SRC="$ROOT/src"
LIBS="$ROOT/src/libs"
BUILD="$HERE/build"
CXX="${CXX:-g++}"
CXXFLAGS="${CXXFLAGS:--std=c++17 -O2 -Wall}"
ONLY="${1:-}"

mkdir -p "$BUILD"

failed=0
ran=0

run_case() {
    local name="$1"
    local extra="$2"
    if [ -n "$ONLY" ] && [ "$ONLY" != "$name" ]; then
        return 0
    fi

    local exe="$BUILD/$name"
    if ! $CXX $CXXFLAGS -I "$SRC" -I "$LIBS" -I "$HERE" \
        -o "$exe" \
        "$HERE/harness.cpp" "$HERE/cases/$name.cpp" \
        "$SRC/maximilian.cpp" $extra 2>"$BUILD/$name.err"; then
        echo "BUILD FAILED  $name"
        sed 's/^/    /' "$BUILD/$name.err" | head -20
        failed=$((failed + 1))
        return 0
    fi

    ran=$((ran + 1))
    printf '%-16s' "$name"
    if "$exe" --seconds 1.0 --rate 44100 --channels 2 >"$BUILD/$name.out" 2>&1; then
        grep -m1 '^frames=' "$BUILD/$name.out" | sed 's/^/  /'
        echo "                PASS"
    else
        grep -m1 '^frames=' "$BUILD/$name.out" | sed 's/^/  /'
        grep -E '^  BAD|^check:|^expected|^frames analysed' "$BUILD/$name.out" | sed 's/^/  /'
        echo "                FAIL"
        failed=$((failed + 1))
    fi
}

run_case sine_440       ""
run_case adsr_gate      ""
run_case filtered_noise ""
run_case fft_pitch      "$LIBS/maxiFFT.cpp $LIBS/fft.cpp"

echo
if [ "$failed" -eq 0 ]; then
    echo "all $ran cases passed"
    exit 0
fi
echo "$failed case(s) failed (build output in $BUILD)"
exit 1
