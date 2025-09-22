#pragma once

#include "opencv2/opencv.hpp"

// https://github.com/deepinsight/insightface/blob/d9c952ba2cec34aeb310a16ea81c9efb28da14f4/recognition/_tools_/cpp_align/face_align.h
cv::Mat SimilarityTransform(cv::Mat& src, cv::Mat& dst);
