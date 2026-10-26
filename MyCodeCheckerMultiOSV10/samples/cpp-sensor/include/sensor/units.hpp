// Units and conversions. Includes reading.hpp back for the helper below,
// which makes an include cycle (arch:cycle) on purpose.
#pragma once

#include <string>

namespace sensor {

enum Unit { Celsius, Fahrenheit, Volt, Ampere };

inline double toCelsius(double f) { return (f - 32) * 5 / 9; }

std::string unitName(Unit u);

}  // namespace sensor

#include "sensor/reading.hpp"
