// platform/include/kstt/platform/audio_input.h
//
// OS별 마이크 입력을 하나의 팩토리로 감싼다. CLI·GUI 프런트엔드는 이 함수 두 개만
// 쓰므로, 플랫폼이 바뀌어도 프런트엔드 코드는 그대로다.
//
//   Windows : waveIn  (winmm)
//   Linux   : ALSA    (libasound)
//   macOS   : CoreAudio AudioQueue (AudioToolbox)
#pragma once

#include <memory>
#include <string>
#include <vector>

#include "kstt/audio_source.h"
#include "kstt/types.h"

namespace kstt::platform {

// 사용 가능한 입력 장치 목록. 첫 항목은 항상 시스템 기본(id = -1).
std::vector<AudioDevice> inputDevices();

// 마이크 입력 소스를 만든다. deviceId = -1 이면 시스템 기본 장치.
// 실제 장치 열기는 AudioSource::open() 에서 일어난다.
std::shared_ptr<AudioSource> createMicrophone(int deviceId = -1);

// 화면에 표시할 백엔드 이름 ("waveIn", "ALSA", "CoreAudio")
const char* backendName();

}  // namespace kstt::platform
