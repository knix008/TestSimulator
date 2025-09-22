#pragma once

#include <stdlib.h>
#include <string.h>
#include <vector>

#include "configs.h"
#include "opencv2/opencv.hpp"
#include "rknn.h"

class FaceDetection {
    private:
        // 분석 모듈
	    RKNN rknn_;

        // 변수들
        bool is_initialized_;
        float det_th_;
        float nms_th_;
        int max_obbs_;
        int num_anchors_;
        FVector3D anchors_;
        FVector3D nor_anchors_;
        IVector2D output_layer_sizes_;
        std::vector<int> output_layer_strides_;
        std::vector<float> variances_;
        std::vector<int> offset_;
        float scale_;

        // 전후처리 함수들
        void PerformNMS(std::vector<cv::Rect>& s_bboxes, FVector2D& s_landmarks, std::vector<float>& s_confs, int n_obbs,
                        std::vector<cv::Rect>& d_bboxes, FVector2D& d_landmarks);
        int PostProcess(float* s_bboxes, float* s_landmarks, float* s_confs,
                        std::vector<cv::Rect>& d_bboxes, FVector2D& d_landmarks);
        int PreProcess(cv::Mat& s_mat, cv::Mat& d_mat);
        template <typename T> inline std::vector<size_t> SortIndexes (const std::vector<T> &v);

    public:
        // 생성자
        FaceDetection();
        ~FaceDetection();

        // 호출 함수
        int Inference(cv::Mat& s_mat, std::vector<cv::Rect>& d_boxes, FVector2D& d_landmarks);
        bool Initialize(std::string& model_path);
};