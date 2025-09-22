#include <dirent.h>
#include <fstream>
#include <iostream>
#include <stdio.h>
#include <sys/stat.h>
#include <unistd.h>
#include <vector>

#include "opencv2/opencv.hpp"
#include "vaengine/configs.h"
#include "vaengine/utils.h"
#include "vaengine/vaengine.h"

static inline std::string basename_wo_ext(const std::string& path) {
    size_t s_pos = path.find_last_of('/');
    size_t e_pos = path.find_last_of('.');
    if (s_pos == std::string::npos) s_pos = 0; else s_pos += 1;
    if (e_pos == std::string::npos || e_pos <= s_pos) e_pos = path.size();
    return path.substr(s_pos, e_pos - s_pos);
}

static inline std::string toLower(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c){ return std::tolower(c); });
    return s;
}

static inline bool hasValidExtension(const std::string& filename, const char* ext) {
    size_t dot = filename.find_last_of('.');
    if (dot == std::string::npos) return false;

    std::string fileExt = filename.substr(dot);
	fileExt = toLower(fileExt);

    std::string targetExt = ext;
	targetExt = toLower(targetExt);

    return fileExt == targetExt;
}

static inline std::vector<std::string> getGalleryFiles(const std::string& path, const char* ext) {
    std::vector<std::string> files;

    DIR* dir = opendir(path.c_str());
    if (!dir) {
        std::cerr << "디렉토리를 열 수 없습니다: " << path << std::endl;
        return files;
    }

    struct dirent* entry;
    while ((entry = readdir(dir)) != nullptr) {
        std::string filename = entry->d_name;
        std::string fullPath = path + "/" + filename;

        struct stat sb;
        if (stat(fullPath.c_str(), &sb) == 0 && S_ISREG(sb.st_mode)) {
            if (hasValidExtension(filename, ext)) {
                files.push_back(fullPath);
            }
        }
    }

    closedir(dir);

    std::sort(files.begin(), files.end());
    return files;
}

static inline std::string jpg_to_bin(std::string p) {
    size_t dot = p.find_last_of('.');
    if (dot == std::string::npos) return p;
    std::string base = p.substr(0, dot);
    std::string ext  = toLower(p.substr(dot + 1));
    if (ext == "jpg" || ext == "jpeg") return base + ".bin";
    else return p;
}

static inline std::vector<float> read_feature_data(const char* path) {
    std::ifstream inFile(path, std::ios::binary);
    std::vector<float> result;

    if (!inFile.is_open()) return result;

    inFile.seekg(0, std::ios::end);
    long long fileSize = inFile.tellg();
    inFile.seekg(0, std::ios::beg);

    long long numFloats = fileSize / sizeof(float);

    if (fileSize != static_cast<long long>(numFloats * sizeof(float))) {
        std::cerr << "[ERROR] Invalid feature file size: " << fileSize << " bytes in " << path << std::endl;
        return result;
    }

    result.resize(numFloats);
    inFile.read(reinterpret_cast<char*>(result.data()), numFloats * sizeof(float));
    inFile.close();
    return result;
}

static inline void write_feature_data(const char* path, std::vector<float>& feature) {
    std::ofstream outFile(path, std::ios::binary);
    if (outFile.is_open()) {
        // Write the entire array's content as a block of raw bytes
        outFile.write(reinterpret_cast<const char*>(feature.data()), feature.size() * sizeof(float));
        outFile.close();
        // std::cout << "Feature written to feature.bin (binary format)." << std::endl;
    } else {
        std::cerr << "Error opening file!" << std::endl;
    }
}

int main(int argc, char** argv) {
	if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <query_file1> <query_file2> ..." << std::endl;
		return -1;
	}

	// Vars
	std::string gallery_path = "/userdata/vaengine/samples/gallery";
    std::vector<std::string> query_paths(argv + 1, argv + argc);
	
	// Initialize Engine
	FaceRecognitionEngine engine;
	int ret = engine.Initialize();
	if (!ret) return -1;

	// 기등록 유저 정보 확보
	std::vector<std::string> bin_files = getGalleryFiles(gallery_path, ".bin");
	unsigned int num_user = bin_files.size();
	std::vector<float> features;
	std::vector<unsigned int> uids;
	for (unsigned int i = 0; i < num_user; ++i) {
		std::string& feature_file = bin_files[i];
		std::vector<float> feature = read_feature_data(feature_file.c_str());
		if (feature.empty()) {
			std::string name = basename_wo_ext(feature_file);
			printf("[ERROR] Failed to load feature for user '%s' (ID: %d) from file: %s\n", name.c_str(), i, feature_file.c_str());
			continue;
		}
		features.insert(features.end(), feature.begin(), feature.end());
		uids.emplace_back(i);
	}
	num_user = uids.size(); // update

	// Initialize Gallery
	if (num_user > 0) {
		engine.InitGallery(num_user, uids.data(), features.data());
		for (unsigned int idx : uids) {
			std::string name = basename_wo_ext(bin_files[idx]);
			printf("-- ID: %-4d  |  %-10s\n", idx, name.c_str());
		}
	}

	// 메모리 즉시 반환
  	std::vector<std::string>().swap(bin_files);
  	std::vector<float>().swap(features);
  	std::vector<unsigned int>().swap(uids);

	// 유저 정보 추가 등록
	std::vector<std::string> jpg_files = getGalleryFiles(gallery_path, ".jpg");
	for (unsigned int i = 0; i < jpg_files.size(); ++i) {
		// 파일 이름 설정
		std::string& jpg_file = jpg_files[i];
		std::string bin_file = jpg_to_bin(jpg_file);		
		std::string name = basename_wo_ext(jpg_file);

		size_t dot = jpg_file.find_last_of('.');
    	std::string fileExt = jpg_file.substr(dot);

		// bin 파일이 이미 있으면 건너뛰기
		if (access(bin_file.c_str(), F_OK) == 0) continue;

		// Read file
		cv::Mat image = imread(jpg_file, cv::IMREAD_COLOR);
		if (!image.data) {
			printf("cv::imread %s fail!\n", jpg_file.c_str());
			return -1;
		}

		// Enroll & Write DB
		std::vector<float> feature = engine.AddPerson(num_user, image.data, image.cols, image.rows);
		write_feature_data(bin_file.data(), feature);
		
		// Show
		printf("-- ID: %-4d  |  %-10s\n", num_user, name.c_str());

		++num_user;
	}
	printf("\n");
	printf("-- Total number of registered user: %d\n\n", num_user);

	// Identify
	printf("[Identify] Start..\n");
	for (int i = 0; i < 1; ++i) { // 반복 테스트
		for (auto& query_path : query_paths) {
			// 이미지 로딩
			cv::Mat query_image = imread(query_path, cv::IMREAD_COLOR);
			if (!query_image.data) {
				printf("cv::imread %s fail!\n", query_path.c_str());
				return -1;
			}

			// 인식
			FaceRecognitionEngine::RecognitionResult result = engine.Identify(query_image.data, query_image.cols, query_image.rows);

			// 결과 확인
			printf("-- [Query] %-50s  |  ID: %-2d  |  Score: %.4f  |  Result Code: %d\n", query_path.c_str(), result.id, result.score, result.rcode);
		}
		printf("\n");
	}

	// Verify
	printf("[Verify] Start..\n");
	for (int i = 0; i < 1; ++i) { // 반복 테스트
		for (auto& query_path : query_paths) {
			// 쿼리 이미지 로딩
			cv::Mat query_image = imread(query_path, cv::IMREAD_COLOR);
			if (!query_image.data) {
				printf("cv::imread %s fail!\n", query_path.c_str());
				return -1;
			}
			printf("-- [Query] %s\n", query_path.c_str());

			// 갤러리 이미지별 반복 분석
			std::vector<std::pair<std::string, FaceRecognitionEngine::RecognitionResult>> results;
			results.reserve(num_user);
			for (auto& jpg_file : jpg_files) {
				// 갤러리 이미지 로딩
				cv::Mat gallery_image = imread(jpg_file, cv::IMREAD_COLOR);
				if (!gallery_image.data) {
					printf("cv::imread %s fail!\n", jpg_file.c_str());
					return -1;
				}

				// 인식
				FaceRecognitionEngine::RecognitionResult result = engine.Verify( \
					query_image.data, query_image.cols, query_image.rows, \
					gallery_image.data, gallery_image.cols, gallery_image.rows
				);
      			results.emplace_back(jpg_file, result);
			}

			// score 내림차순 정렬
			std::sort(results.begin(), results.end(), [](const auto& a, const auto& b) { return a.second.score > b.second.score; });

			// 결과 확인
			size_t topk = std::min<size_t>(3, results.size());
			for (size_t k = 0; k < topk; ++k) {
				const auto& [file, res] = results[k];
				const char* verif = (res.ve == 0) ? "Same" : "Diff";
				printf("   TOP-%zu | [Identity] %-50s | Verify: %-4s | Score: %.4f | Result Code: %d\n", k + 1, file.c_str(), verif, res.score, res.rcode);
			}
			printf("\n");
		}
		printf("\n");
	}

	return 0;
}