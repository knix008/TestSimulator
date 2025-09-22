#pragma once

#include "face_detection.h"
#include "faiss_wrapper.h"
#include "feature_extraction.h"
#include "head_pose_estimation.h"
#include "face_anti_spoofing.h"
#include "opencv2/opencv.hpp"

class FaceRecognitionEngine {
    private:
        // =========================================
        // ResultCode Enum
        // =========================================
        /**
         * 얼굴 인식 결과 코드
         */
        typedef enum {
            SUCCESS = 0,                     // 얼굴 인식 성공
            INPUT_DATA_INVALID = 1,          // 입력 데이터 오류
            FACE_DETECTION_FAILED = 2,       // 얼굴 검출 실패 (모델 오류, 메모리 문제 등)
            NO_FACE_DETECTED = 3,            // 얼굴이 검출되지 않음
            FACE_SIZE_TOO_SMALL = 4,         // 얼굴 크기가 너무 작음
            FACE_ASPECT_RATIO_TOO_BIG = 5,   // 얼굴 종횡비가 너무 큼
            FACE_POSE_ESTIMATION_FAILED = 6, // 얼굴 각도 추정 실패
            FACE_POSE_TOO_BIG = 7,           // 얼굴 각도가 너무 큼
            FACE_ANTI_SPOOFING_DETECTED = 8, // 얼굴 위변조 탐지
            FEATURE_EXTRACTION_FAILED = 9,   // 얼굴 특징 추출 실패
            UNKNOWN_ERROR = 99               // 알 수 없는 기타 오류
        } ResultCode;

    public:
        // =========================================
        // RecognitionResult Struct
        // =========================================
        /**
         * 얼굴 인식 결과 구조체
         */
        struct RecognitionResult {
            int x = 0;                  // 얼굴 영역의 X 좌표
            int y = 0;                  // 얼굴 영역의 Y 좌표
            int w = 0;                  // 얼굴 영역의 너비
            int h = 0;                  // 얼굴 영역의 높이
            int id = -1;                // 식별된 ID
            int ve = -1;                // 동일인 여부 (0: 동일인, 1: 비동일인)
            float score = 0.f;          // 유사도 점수
            std::vector<float> feature; // 얼굴 특징값
            ResultCode rcode;           // 인식 결과 코드
        };

    private:
        // =========================================
        // Vars
        // =========================================
        bool is_initialized_;
        bool is_gallery_initialized_;

        float fcd_th_;
        float fas_th_;
        float identify_th_;
        float verify_th_;
        bool do_fas_;

        float max_face_aspect_ratio_;
        float max_degree_;
        int min_face_size_;
        
        FaceDetection fcd_;
        FaissWrapper faiss_wrapper_;
        FeatureExtraction ffe_;
        HeadPoseEstimation hpe_;
        FaceAntiSpoof fas_;
        FaceAntiSpoof fas_ir_;

        // =========================================
        // Functions
        // =========================================
        void AlignFace(const cv::Mat& s_mat, std::vector<float>& s_landmark, cv::Mat& d_mat);
        void BuildGallery();
        RecognitionResult ExtractFeature(unsigned char *buf, int width, int height);
        int SelectRepreFace(std::vector<cv::Rect>& boxes, int img_width, int img_height);

    public:        
        // =========================================
        // Constructor
        // =========================================
        FaceRecognitionEngine();
        ~FaceRecognitionEngine();

        // =========================================
        // Engine Initialization
        // =========================================
        /**
         * 얼굴 인식 엔진 초기화
         * @return 초기화 성공 여부
         */
        bool Initialize();

        // =========================================
        // Gallery Management
        // =========================================
        /**
         * 신원 보장 목록(gallery) 초기화
         * @param num_user 등록 인원 수
         * @param uids 인물 ID 배열
         * @param features 인물 특징값 배열
         * @return 초기화 성공 여부
         */
        bool InitGallery(unsigned int num_user, unsigned int* uids, float* features);

        /**
         * 신원 보장 목록 삭제
         */
        void DeleteGallery();

        /**
         * 인물 추가 또는 갱신
         * @param uid 인물 ID
         * @param buf RGB 이미지 버퍼
         * @param width 이미지 너비
         * @param height 이미지 높이
         * @return 추출된 얼굴 특징값 벡터 (성공 시 512차원 벡터, 실패 시 빈 벡터)
         */
        std::vector<float> AddPerson(unsigned int uid, unsigned char* buf, int width, int height);

        /**
         * 인물 삭제
         * @param uid 삭제할 인물 ID
         * @return 삭제 성공 여부
         */
        bool DeletePerson(unsigned int uid);

        /**
         * 등록된 gallery ID 목록 가져오기
         * @return 등록된 인물들의 ID 배열
         */
        std::vector<unsigned int> GetGalleryIDs();

        /**
         * 입력 이미지에서 인물 식별
         * @param buf RGB 이미지 버퍼
         * @param width 이미지 너비
         * @param height 이미지 높이
         * @return 얼굴 인식 결과
         */
        RecognitionResult Identify(unsigned char* buf, int width, int height);

        // =========================================
        // Verification
        // =========================================
        /**
         * 두 이미지의 동일인 여부 판단
         * @param real_buf 실시간 이미지 버퍼
         * @param real_width 실시간 이미지 너비
         * @param real_height 실시간 이미지 높이
         * @param id_buf 신분증 이미지 버퍼
         * @param id_width 신분증 이미지 너비
         * @param id_height 신분증 이미지 높이
         * @return 얼굴 분석 결과를 포함하는 구조체(read 기준)
         */
        RecognitionResult Verify(unsigned char* real_buf, int real_width, int real_height,
                                unsigned char* id_buf, int id_width, int id_height);

        // =========================================
        // Parameter Settings
        // =========================================
        void SetMaxFaceAspectRatio(float ratio); // 얼굴 최대 종횡비 설정
        float GetMaxFaceAspectRatio();           // 현재 설정된 최대 얼굴 종횡비 가져오기
        
        void SetMaxFaceDegree(float degree);     // 얼굴 최대 각도 설정
        float GetMaxFaceDegree();                // 현재 설정된 최대 얼굴 각도 가져오기

        void SetMinFaceSize(unsigned int size);  // 얼굴 최소 크기 설정
        unsigned int GetMinFaceSize();           // 현재 설정된 최소 얼굴 크기 가져오기

        void SetDetTh(float th);                 // 얼굴 검출 임계치 설정
        float GetDetTh();                        // 현재 설정된 얼굴 검출 임계치 가져오기

        void SetFASTh(float th);                 // 위변조 탐지 임계치 설정
        float GetFASTh();                        // 현재 위변조 탐지 임계치 가져오기

        void SetFaceRecogTh1N(float th);         // 1:N 식별 임계치 설정
        float GetFaceRecogTh1N();                // 현재 1:N 식별 임계치 가져오기

        void SetFaceRecogTh11(float th);         // 1:1 동일인 임계치 설정
        float GetFaceRecogTh11();                // 현재 1:1 동일인 임계치 가져오기

        void EnableFAS();                        // 위변조 탐지 기능 활성화
        void DisableFAS();                       // 위변조 탐지 기능 비활성화
};