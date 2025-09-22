#pragma once

#include <stdlib.h>
#include <string.h>

#include "opencv2/opencv.hpp"
#include "rknn.h"

class HeadPoseEstimation {
    private:
        // 분석 모듈
	    RKNN rknn_;

        // 변수들
        bool is_initialized_;

        // 전후처리 함수들
        std::array<float, 3> PostProcess(const float* R_flat);
        int PreProcess(cv::Mat& s_mat, cv::Mat& d_mat);

    public:
        // 생성자
        HeadPoseEstimation();
        ~HeadPoseEstimation();

        // 호출 함수
        int Inference(cv::Mat& s_mat, std::array<float, 3>& d_angles);
        bool Initialize(std::string& model_path);
};