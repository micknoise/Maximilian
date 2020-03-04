cmake_minimum_required (VERSION 3.15)

project (maximilian)

set(CMAKE_CXX_STANDARD 17)

include_directories(../../../../src)
include_directories(../../../../src/libs)

add_executable(maximilian ffttest.cpp ../../player.cpp ../../RtAudio.cpp ../../../../src/maximilian.cpp ../../../../src/libs/maxiFFT.cpp ../../../../src/libs/fft.cpp)
target_compile_options(maximilian PUBLIC -Wall)
target_link_libraries(maximilian PUBLIC -lpthread)

if (LINUX)
  MESSAGE(STATUS "Linux build")
  target_link_libraries(maximilian PUBLIC -lasound)
  add_definitions(-D__LINUX_ALSA__)
endif()
