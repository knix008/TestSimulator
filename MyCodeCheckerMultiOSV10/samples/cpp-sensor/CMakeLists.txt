cmake_minimum_required(VERSION 3.16)
project(cpp_sensor CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

add_executable(sensor_logger
  src/main.cpp
  src/device.cpp
  src/reading.cpp
  src/logger.cpp)
target_include_directories(sensor_logger PRIVATE include)
target_compile_definitions(sensor_logger PRIVATE SENSOR_VERSION=2)
