#pragma once

#include <stdlib.h>
#include <string.h>
#include <vector>

#include "opencv2/opencv.hpp"
#include "rknn.h"

class FeatureExtraction {
    private:
        // 분석 모듈
	    RKNN rknn_;

        // 변수들
        bool is_initialized_;
        float recog_th_;

        // 전후처리 함수들
        int PreProcess(cv::Mat& s_mat, cv::Mat& d_mat);
        int PostProcess(std::vector<float>& feature);

    public:
        // 생성자
        FeatureExtraction();
        ~FeatureExtraction();

        // 호출 함수
        int Inference(cv::Mat& s_mat, std::vector<float>& d_feature);
        bool Initialize(std::string& model_path);
};