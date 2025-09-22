#pragma once

#include <stdlib.h>
#include <string.h>
#include <vector>

#include "opencv2/opencv.hpp"
#include "rknn.h"
#include "Float16.h"
class FaceAntiSpoof {
     private:
         // 분석 모듈
 	    RKNN rknn_;

         // 변수들
         bool is_initialized_;
         bool useGray_;
         

         // 전후처리 함수들
         int PreProcess(cv::Mat& s_mat, cv::Mat& d_mat, bool useGray=false);

     public:
         // 생성자
         FaceAntiSpoof();
         ~FaceAntiSpoof();

         // 호출 함수
         int Inference(cv::Mat& s_mat, float& SCORE);
         bool Initialize(std::string& model_path, bool useGray=false);
 };