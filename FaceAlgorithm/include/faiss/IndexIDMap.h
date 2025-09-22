#pragma once
// Mock FAISS IndexIDMap header for compilation
#include <vector>
#include <map>

namespace faiss {
    class Index {
    public:
        virtual ~Index() = default;
        virtual void add(int64_t n, const float* x) = 0;
        virtual void search(int64_t n, const float* x, int64_t k, float* distances, int64_t* labels) const = 0;
    };

    class IndexIDMap : public Index {
    public:
        Index* index;
        std::vector<int64_t> id_map;
        
        IndexIDMap(Index* index) : index(index) {}
        virtual ~IndexIDMap() = default;
        
        void add(int64_t n, const float* x) override {
            if (index) index->add(n, x);
        }
        
        void search(int64_t n, const float* x, int64_t k, float* distances, int64_t* labels) const override {
            if (index) index->search(n, x, k, distances, labels);
        }
    };
}
