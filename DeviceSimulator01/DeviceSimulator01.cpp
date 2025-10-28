// DeviceSimulator01.cpp : 이 파일에는 'main' 함수가 포함됩니다. 거기서 프로그램 실행이 시작되고 종료됩니다.
//

#include <iostream>
#include <fstream>
#include <sstream>
#include <openssl/ssl.h>
#include <openssl/err.h>
#include <openssl/x509.h>
#include <openssl/pem.h>
#include <openssl/rsa.h>
#include <openssl/evp.h>
#include <string>
#include <vector>
#ifdef _WIN32
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")
// OpenSSL 라이브러리 링크 추가
#pragma comment(lib, "libssl.lib")
#pragma comment(lib, "libcrypto.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "advapi32.lib")
#else
#include <netinet/in.h>
#include <unistd.h>
#endif

const int PORT = 4433; // 테스트용 포트
const std::string CERT_FILE = "cert.pem";
const std::string KEY_FILE = "key.pem";
const std::string SAVE_FILE = "uploaded_firmware.bin";

bool fileExists(const std::string& filename) {
    std::ifstream file(filename);
    return file.good();
}

bool generateSelfSignedCertificate() {
    // RSA 키 생성
    EVP_PKEY* pkey = EVP_PKEY_new();
    BIGNUM* bn = BN_new();
    EVP_PKEY_CTX* pkey_ctx = EVP_PKEY_CTX_new_id(EVP_PKEY_RSA, nullptr);
    if (!BN_set_word(bn, RSA_F4) ||
        !pkey_ctx ||
        EVP_PKEY_keygen_init(pkey_ctx) <= 0 ||
        EVP_PKEY_CTX_set_rsa_keygen_bits(pkey_ctx, 2048) <= 0 ||
        EVP_PKEY_keygen(pkey_ctx, &pkey) <= 0) {
        std::cerr << "RSA 키 생성 실패\n";
        BN_free(bn);
        EVP_PKEY_free(pkey);
        if (pkey_ctx) EVP_PKEY_CTX_free(pkey_ctx);
        return false;
    }
    EVP_PKEY_CTX_free(pkey_ctx);
    BN_free(bn);

    // X509 인증서 생성
    X509* x509 = X509_new();
    ASN1_INTEGER_set(X509_get_serialNumber(x509), 1);
    X509_gmtime_adj(X509_get_notBefore(x509), 0);
    X509_gmtime_adj(X509_get_notAfter(x509), 365L * 24L * 3600L); // 1년

    X509_set_pubkey(x509, pkey);

    X509_NAME* name = X509_get_subject_name(x509);
    X509_NAME_add_entry_by_txt(name, "C", MBSTRING_ASC, (unsigned char*)"KR", -1, -1, 0);
    X509_NAME_add_entry_by_txt(name, "ST", MBSTRING_ASC, (unsigned char*)"Seoul", -1, -1, 0);
    X509_NAME_add_entry_by_txt(name, "L", MBSTRING_ASC, (unsigned char*)"Seoul", -1, -1, 0);
    X509_NAME_add_entry_by_txt(name, "O", MBSTRING_ASC, (unsigned char*)"Device Simulator", -1, -1, 0);
    X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC, (unsigned char*)"localhost", -1, -1, 0);

    X509_set_issuer_name(x509, name);

    if (!X509_sign(x509, pkey, EVP_sha256())) {
        std::cerr << "인증서 서명 실패\n";
        X509_free(x509);
        EVP_PKEY_free(pkey);
        return false;
    }

    // 개인키 파일 저장
    FILE* keyFile = nullptr;
#ifdef _WIN32
    // fopen_s는 안전한 파일 열기 함수입니다.
    if (fopen_s(&keyFile, KEY_FILE.c_str(), "wb") != 0) {
        std::cerr << "개인키 파일 열기 실패\n";
        X509_free(x509);
        EVP_PKEY_free(pkey);
        return false;
    }
#else
    keyFile = fopen(KEY_FILE.c_str(), "wb");
#endif
    if (!keyFile || !PEM_write_PrivateKey(keyFile, pkey, nullptr, nullptr, 0, nullptr, nullptr)) {
        std::cerr << "개인키 파일 저장 실패\n";
        if (keyFile) fclose(keyFile);
        X509_free(x509);
        EVP_PKEY_free(pkey);
        return false;
    }
    fclose(keyFile);

    // 인증서 파일 저장
#ifdef _WIN32
    FILE* certFile = nullptr;
    if (fopen_s(&certFile, CERT_FILE.c_str(), "wb") != 0) {
        std::cerr << "인증서 파일 열기 실패\n";
        X509_free(x509);
        EVP_PKEY_free(pkey);
        return false;
    }
#else
    FILE* certFile = fopen(CERT_FILE.c_str(), "wb");
#endif
    if (!certFile || !PEM_write_X509(certFile, x509)) {
        std::cerr << "인증서 파일 저장 실패\n";
        if (certFile) fclose(certFile);
        X509_free(x509);
        EVP_PKEY_free(pkey);
        return false;
    }
    fclose(certFile);

    std::cout << "자체 서명 인증서 생성 완료: " << CERT_FILE << ", " << KEY_FILE << "\n";

    X509_free(x509);
    EVP_PKEY_free(pkey);
    return true;
}

void handleClient(SSL* ssl)
{
    char buffer[8192] = {0};
    int bytes = SSL_read(ssl, buffer, sizeof(buffer) - 1);
    if (bytes <= 0) return;

    std::string request(buffer, bytes);
    // POST /api/v1.0/updatefirmware 요청 확인
    if (request.find("POST /api/v1.0/updatefirmware") != std::string::npos) {
        // Content-Length 추출
        size_t cl_pos = request.find("Content-Length:");
        size_t cl_end = request.find("\r\n", cl_pos);
        int content_length = 0;
        if (cl_pos != std::string::npos && cl_end != std::string::npos) {
            std::string cl_str = request.substr(cl_pos + 15, cl_end - (cl_pos + 15));
            content_length = std::stoi(cl_str);
        }

        // 바디 시작 위치
        size_t body_pos = request.find("\r\n\r\n");
        if (body_pos == std::string::npos) {
            std::string resp = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
            SSL_write(ssl, resp.c_str(), static_cast<int>(resp.size()));
            return;
        }
        body_pos += 4;

        std::vector<char> firmware;
        firmware.insert(firmware.end(), request.begin() + body_pos, request.end());

        // 추가 데이터 수신 (헤더 이후 남은 바디)
        int remain = content_length - static_cast<int>(bytes - body_pos);
        while (remain > 0) {
            int r = SSL_read(ssl, buffer, sizeof(buffer));
            if (r <= 0) break;
            firmware.insert(firmware.end(), buffer, buffer + r);
            remain -= r;
        }

        // 파일 저장
        std::ofstream out(SAVE_FILE, std::ios::binary);
        out.write(firmware.data(), firmware.size());
        out.close();

        std::string resp = "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
        SSL_write(ssl, resp.c_str(), static_cast<int>(resp.size()));
        std::cout << "펌웨어 업로드 완료 (" << firmware.size() << " bytes)\n";
    } else {
        std::string resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        SSL_write(ssl, resp.c_str(), static_cast<int>(resp.size()));
    }
}

int main()
{
#ifdef _WIN32
    WSADATA wsaData;
    WSAStartup(MAKEWORD(2,2), &wsaData);
#endif
    SSL_library_init();
    SSL_load_error_strings();
    OpenSSL_add_all_algorithms();

    // 인증서 파일 존재 확인 및 생성
    if (!fileExists(CERT_FILE) || !fileExists(KEY_FILE)) {
        std::cout << "인증서 파일이 없습니다. 자체 서명 인증서를 생성합니다...\n";
        if (!generateSelfSignedCertificate()) {
            std::cerr << "오류: 자체 서명 인증서 생성에 실패했습니다.\n";
            std::cerr << "수동으로 인증서를 생성하려면 다음 명령어를 사용하세요:\n";
            std::cerr << "openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes\n";
            std::cout << "아무 키나 눌러 종료하세요...";
            std::cin.get();
#ifdef _WIN32
            WSACleanup();
#endif
            return 1;
        }
    }

    const SSL_METHOD* method = TLS_server_method();
    SSL_CTX* ctx = SSL_CTX_new(method);

    SSL_CTX_set_min_proto_version(ctx, TLS1_3_VERSION);
    SSL_CTX_set_max_proto_version(ctx, TLS1_3_VERSION);

    if (SSL_CTX_use_certificate_file(ctx, CERT_FILE.c_str(), SSL_FILETYPE_PEM) <= 0 ||
        SSL_CTX_use_PrivateKey_file(ctx, KEY_FILE.c_str(), SSL_FILETYPE_PEM) <= 0) {
        std::cerr << "오류: 인증서 또는 키 로드 실패\n";
        ERR_print_errors_fp(stderr);
        SSL_CTX_free(ctx);
        std::cout << "아무 키나 눌러 종료하세요...";
        std::cin.get();
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }

    SOCKET server_fd =
#ifdef _WIN32
        socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
#else
        socket(AF_INET, SOCK_STREAM, 0);
#endif
    sockaddr_in addr;
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(PORT);

    if (
#ifdef _WIN32
        bind(server_fd, (SOCKADDR*)&addr, sizeof(addr))
#else
        bind(server_fd, (struct sockaddr*)&addr, sizeof(addr))
#endif
        < 0) {
        std::cerr << "바인드 실패\n";
        SSL_CTX_free(ctx);
#ifdef _WIN32
        WSACleanup();
#endif
        return 1;
    }
    listen(server_fd, 1);

    std::cout << "Device Simulator 서버가 시작되었습니다. 포트: " << PORT << "\n";
    std::cout << "TLS 1.3을 사용하여 /api/v1.0/updatefirmware 엔드포인트를 제공합니다.\n";

    while (true) {
        SOCKET client_fd =
#ifdef _WIN32
            accept(server_fd, nullptr, nullptr);
#else
            accept(server_fd, nullptr, nullptr);
#endif
        if (client_fd == INVALID_SOCKET) continue;

        SSL* ssl = SSL_new(ctx);
        SSL_set_fd(ssl, static_cast<int>(client_fd));

        if (SSL_accept(ssl) <= 0) {
            SSL_free(ssl);
#ifdef _WIN32
            closesocket(client_fd);
#else
            close(client_fd);
#endif
            continue;
        }

        handleClient(ssl);

        SSL_shutdown(ssl);
        SSL_free(ssl);
#ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif
    }

#ifdef _WIN32
    closesocket(server_fd);
    WSACleanup();
#else
    close(server_fd);
#endif
    SSL_CTX_free(ctx);
    return 0;
}

// 프로그램 실행: <Ctrl+F5> 또는 [디버그] > [디버깅하지 않고 시작] 메뉴
// 프로그램 디버그: <F5> 키 또는 [디버그] > [디버깅 시작] 메뉴

// 시작을 위한 팁: 
//   1. [솔루션 탐색기] 창을 사용하여 파일을 추가/관리합니다.
//   2. [팀 탐색기] 창을 사용하여 소스 제어에 연결합니다.
//   3. [출력] 창을 사용하여 빌드 출력 및 기타 메시지를 확인합니다.
//   4. [오류 목록] 창을 사용하여 오류를 봅니다.
//   5. [프로젝트] > [새 항목 추가]로 이동하여 새 코드 파일을 만들거나, [프로젝트] > [기존 항목 추가]로 이동하여 기존 코드 파일을 프로젝트에 추가합니다.
//   6. 나중에 이 프로젝트를 다시 열려면 [파일] > [열기] > [프로젝트]로 이동하고 .sln 파일을 선택합니다.
