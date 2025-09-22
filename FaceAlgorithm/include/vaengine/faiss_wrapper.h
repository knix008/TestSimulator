#pragma once

#include <faiss/IndexIDMap.h>
#include <map>
#include <opencv2/opencv.hpp>
#include <tuple>
#include <vector>

#include "configs.h"

class FaissWrapper {
    private:
        struct TOP_K_INFO {
            int32_t idx;
            unsigned int user_id;
            float score;
        };

        faiss::IndexIDMap* index_;
        std::map<unsigned int, FVector2D> gallery_info_;

    public:
        FaissWrapper();
        ~FaissWrapper();

        int AddGalleryInfo(float* feature, unsigned int uid);
        void Build();
        int RemoveGalleryUser(unsigned int userID);
        void RemoveGallery();
        int SetGalleryInfo(float* features, unsigned int* uids, unsigned int num_user);
        std::vector<unsigned int> GetGalleryIDs();

        std::tuple<unsigned int, float> Search(const float* feature);
        std::vector<TOP_K_INFO> Search(const float* feature, int k);
};