"""마이크에서 명령 클립을 녹음해 data/audio에 저장한다."""

from __future__ import annotations

import argparse
import sys
import time

from kws.audio import COMMAND_SECONDS, TARGET_SAMPLE_RATE, level_message, peak_level, record_block, save_wav
from kws.project import SILENCE_LABEL, Project


def main() -> int:
    parser = argparse.ArgumentParser(description="한 명령의 녹음을 WAV로 저장합니다.")
    parser.add_argument("label", help="저장할 명령 이름. 무음이면 말하지 않습니다.")
    parser.add_argument("count", nargs="?", type=int, default=5, help="녹음 횟수. 기본 5, 최대 30.")
    parser.add_argument("--device", type=int, default=None, help="입력 장치 번호. 생략하면 기본 장치.")
    args = parser.parse_args()
    if not 1 <= args.count <= 30:
        print("녹음 횟수는 1에서 30 사이여야 합니다.", file=sys.stderr)
        return 1
    project = Project()
    if args.label not in project.labels():
        names = ", ".join(project.labels())
        print(f"없는 명령입니다. 사용할 수 있는 이름: {names}", file=sys.stderr)
        return 1
    prompt = "녹음 중. 말하지 마세요." if args.label == SILENCE_LABEL else "지금 말하세요."
    saved = 0
    try:
        for index in range(args.count):
            print(f"준비 ({index + 1}/{args.count}) {args.label}", flush=True)
            time.sleep(0.6)
            print(f"{prompt} ({index + 1}/{args.count})", flush=True)
            time.sleep(0.15)
            _beep()
            wav = record_block(COMMAND_SECONDS, args.device)
            path = project.new_wav_path(args.label)
            save_wav(path, wav, TARGET_SAMPLE_RATE)
            saved += 1
            print(f"저장: {path}  {level_message(peak_level(wav))}", flush=True)
    except Exception as exc:
        print(exc, file=sys.stderr)
        return 1
    print(f"{args.label} 녹음 {saved}개를 저장했습니다.")
    return 0


def _beep() -> None:
    try:
        import winsound

        winsound.Beep(880, 120)
    except Exception:
        pass


if __name__ == "__main__":
    raise SystemExit(main())