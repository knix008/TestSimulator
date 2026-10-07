// core/include/kstt/audio_source.h
//
// 오디오 입력 추상화. 코어는 이 인터페이스만 알고, 마이크/파일/테스트용 가짜
// 입력의 구현은 전부 밖(platform/, 테스트)에 있다.
//
// 모델: 당기기(pull). 엔진 워커 스레드가 read() 를 반복 호출하고, read() 는
// 데이터가 준비될 때까지 블로킹할 수 있다. 블로킹 중인 read() 는 cancel() 로
// 깨워야 한다.
#pragma once

#include <cstdint>
#include <string>

namespace kstt {

class AudioSource {
public:
    virtual ~AudioSource() = default;

    // sampleRate(Hz), 모노, 16비트 정수로 내보낼 준비를 한다.
    // 실패 시 false 를 돌려주고 err 에 사유를 채운다.
    virtual bool open(int sampleRate, std::string* err) = 0;

    virtual void close() = 0;

    // 최대 maxSamples 개의 모노 16비트 표본을 dst 에 채운다.
    //   > 0 : 채운 표본 수
    //     0 : 스트림 끝 (파일 소스의 EOF, 또는 cancel() 로 중단)
    //   < 0 : 오류
    virtual int read(int16_t* dst, int maxSamples) = 0;

    // 블로킹 중인 read() 를 깨워 0 을 돌려주게 한다. 다른 스레드에서 호출된다.
    virtual void cancel() {}

    // 사용자에게 보여줄 입력 이름 ("마이크 (Realtek)", "sample.wav" 등)
    virtual std::string name() const = 0;

    // 실시간 입력인가? 파일은 false. 엔진이 진행률/레벨 처리를 달리한다.
    virtual bool isLive() const = 0;
};

}  // namespace kstt
