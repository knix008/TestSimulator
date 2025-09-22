#pragma once

#include <stdint.h>
#include <vector>

float calc_simscore(const std::vector<float>& feat1, const std::vector<float>& feat2);
int64_t getCurrentTimeUs();
int64_t getCurrentTimeMs();
