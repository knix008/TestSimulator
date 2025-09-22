#pragma once
// Mock RKNN API header for compilation
#include <stdint.h>
#include <stdbool.h>

typedef void* rknn_context;
typedef int rknn_tensor_type;

typedef struct {
    int index; int size; int type; int fmt; int pass_through;
    int n_dims; int dims[4]; int size_with_stride; int stride[4];
    void* buf;
} rknn_input;

typedef struct {
    int index; int size; int type; int fmt; int n_dims;
    int dims[4]; int size_with_stride; int stride[4];
    void* buf; bool want_float;
} rknn_output;

typedef struct {
    int index; int n_dims; int dims[4]; int size;
    int size_with_stride; int stride[4]; int type; int fmt;
    int qnt_type; int zp; float scale; int pass_through;
} rknn_tensor_attr;

typedef enum {
    RKNN_QUERY_IN_OUT_NUM = 0, RKNN_QUERY_INPUT_ATTR = 1,
    RKNN_QUERY_OUTPUT_ATTR = 2, RKNN_QUERY_PERF_DETAIL = 3,
    RKNN_QUERY_PERF_RUN = 4, RKNN_QUERY_SDK_VERSION = 5,
    RKNN_QUERY_MEM_SIZE = 6, RKNN_QUERY_CUSTOM_STRING = 7,
    RKNN_QUERY_NATIVE_INPUT_ATTR = 8, RKNN_QUERY_NATIVE_OUTPUT_ATTR = 9,
    RKNN_QUERY_DEVICE_MEM_SIZE = 10, RKNN_QUERY_DEVICE_MEM_USED = 11,
    RKNN_QUERY_MAX = 12
} rknn_query_cmd;

typedef enum {
    RKNN_TENSOR_FLOAT32 = 0, RKNN_TENSOR_FLOAT16 = 1,
    RKNN_TENSOR_INT8 = 2, RKNN_TENSOR_UINT8 = 3,
    RKNN_TENSOR_INT16 = 4, RKNN_TENSOR_UINT16 = 5,
    RKNN_TENSOR_INT32 = 6, RKNN_TENSOR_UINT32 = 7,
    RKNN_TENSOR_INT64 = 8, RKNN_TENSOR_UINT64 = 9,
    RKNN_TENSOR_BOOL = 10, RKNN_TENSOR_TYPE_MAX = 11
} _rknn_tensor_type;

typedef enum {
    RKNN_TENSOR_NCHW = 0, RKNN_TENSOR_NHWC = 1, RKNN_TENSOR_FORMAT_MAX = 2
} rknn_tensor_format;

typedef enum {
    RKNN_QUANTIZE_NONE = 0, RKNN_QUANTIZE_AFFINE_ASYMMETRIC = 1,
    RKNN_QUANTIZE_AFFINE_SYMMETRIC = 2, RKNN_QUANTIZE_DYNAMIC_FIXED_POINT = 3,
    RKNN_QUANTIZE_MAX = 4
} rknn_quantization_type;

typedef rknn_query_cmd _rknn_query_cmd;

#ifdef __cplusplus
extern "C" {
#endif
int rknn_init(rknn_context* context, void* model, uint32_t size, uint32_t flag);
int rknn_destroy(rknn_context context);
int rknn_query(rknn_context context, rknn_query_cmd cmd, void* info, uint32_t size);
int rknn_inputs_set(rknn_context context, uint32_t n_inputs, rknn_input inputs[]);
int rknn_run(rknn_context context, void* extend);
int rknn_outputs_get(rknn_context context, uint32_t n_outputs, rknn_output outputs[], void* extend);
int rknn_outputs_release(rknn_context context, uint32_t n_outputs, rknn_output outputs[]);
#ifdef __cplusplus
}
#endif
