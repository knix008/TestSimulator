#pragma once
#include <vector>
#include "rknn_api.h"
#include "Float16.h"
 
class RKNN {
    private:
        // 변수들
        rknn_context context_;
        std::vector<rknn_input> inputs_;
        std::vector<rknn_output> outputs_;

        // 모델 관련 함수
        void DestroyModel();
        void DumpTensorAttr(rknn_tensor_attr* attr);
        int  GetModelAttrs(std::vector<rknn_tensor_attr>& attrs, int num_layers, _rknn_query_cmd query_cmd);
        int  GetModelInputOutputInfo();

        // 메모리 관련 함수
        int AllocateInputMemory(bool needConversion, rknn_tensor_type dtype = RKNN_TENSOR_UINT8);
        int AllocateOutputMemory();
        void DestroyInputMemory();
        void DestroyOutputMemory();
        
    public:
        // 변수들
        uint32_t num_inputs_;
        uint32_t num_outputs_;
        int input_height_;
        int input_width_;
        int input_channel_;
        std::vector<rknn_tensor_attr> input_attrs_;
        std::vector<rknn_tensor_attr> output_attrs_;
        
        // 생성자
        RKNN();
        ~RKNN();

        // 모델 관련 함수
        int InitModel(char* model_path);

        // 추론 관련 함수
        void* GetOutputData(int index);
        int Inference();
        void SetInputData(int index, void* input_data);
};