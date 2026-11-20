# Offline verification of Maximilian DSP.
#
#   cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure
#
# Each test links the core library, renders one second offline, and asserts a
# property of the audio (peak, RMS, DC, spectral centroid). No audio device.

cmake_minimum_required(VERSION 3.15)
project(maximilian_verify CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

get_filename_component(MAXI_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
set(MAXI_SRC  "${MAXI_ROOT}/src")
set(MAXI_LIBS "${MAXI_ROOT}/src/libs")

enable_testing()

# Compile a case plus the harness plus the core, and register it with CTest.
function(add_maxi_case name)
    set(extra_sources ${ARGN})
    add_executable(${name}
        harness.cpp
        cases/${name}.cpp
        ${MAXI_SRC}/maximilian.cpp
        ${extra_sources}
    )
    target_include_directories(${name} PRIVATE
        ${MAXI_SRC}
        ${MAXI_LIBS}
        ${CMAKE_CURRENT_SOURCE_DIR}
    )
    if (NOT MSVC)
        target_compile_options(${name} PRIVATE -Wall)
    endif()
    add_test(NAME ${name}
             COMMAND ${name} --seconds 1.0 --rate 44100 --channels 2)
endfunction()

add_maxi_case(sine_440)
add_maxi_case(adsr_gate)
add_maxi_case(filtered_noise)
add_maxi_case(fft_pitch
    ${MAXI_LIBS}/maxiFFT.cpp
    ${MAXI_LIBS}/fft.cpp
)
