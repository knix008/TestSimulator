#pragma once

#include <string>
#include <vector>

#define VAENGINE_VERSION_MAJOR 0
#define VAENGINE_VERSION_MINOR 0
#define VAENGINE_VERSION_PATCH 1

#define FFV_SIZE 512

#define DEVELOP_MODE 0

typedef std::vector<std::vector<int>>   IVector2D;
typedef std::vector<std::vector<float>> FVector2D;
typedef std::vector<FVector2D>          FVector3D;

static std::string DNN_MODEL_DIR = "/userdata/models";