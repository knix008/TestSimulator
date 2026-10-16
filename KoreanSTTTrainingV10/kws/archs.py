"""모델 구조 목록. PyTorch 없이 읽을 수 있어 설정, 화면, 명령줄에서 같이 쓴다.

실제 네트워크는 kws/model.py에 있다.
"""

from __future__ import annotations

from dataclasses import dataclass

DSCNN = "dscnn_v2"
BCRESNET1 = "bcresnet1"
DEFAULT_ARCH = DSCNN


@dataclass(frozen=True)
class ArchInfo:
    name: str
    title: str
    summary: str
    learning_rate: float
    finetune_lr: float
    # 학습 가능 파라미터 = base_params + (feature_dim + 1) × 클래스 수. 마지막 분류 층만 클래스 수를 따른다.
    base_params: int
    feature_dim: int
    scratch_name: str
    finetune_name: str

    def parameter_count(self, n_classes: int) -> int:
        return self.base_params + (self.feature_dim + 1) * n_classes


ARCHS: dict[str, ArchInfo] = {
    DSCNN: ArchInfo(
        name=DSCNN,
        title="DS-CNN v2",
        summary="depthwise separable 6블록과 GroupNorm. 시간 4칸을 남겨 앞 음절만 다른 명령을 구분합니다. 작은 배치에도 안정적입니다.",
        learning_rate=2e-3,
        finetune_lr=5e-4,
        base_params=17312,
        feature_dim=64,
        scratch_name="latest",
        finetune_name="speaker",
    ),
    BCRESNET1: ArchInfo(
        name=BCRESNET1,
        title="BC-ResNet-1",
        summary="주파수 2D 합성곱과 시간 1D 합성곱을 나누고, 1D 결과를 주파수 방향으로 방송해 더합니다. 파라미터가 DS-CNN의 절반입니다.",
        # 좁고 깊어서 같은 에폭 안에 수렴하려면 DS-CNN보다 큰 학습률이 필요하다.
        learning_rate=1e-2,
        finetune_lr=2.5e-3,
        base_params=8836,
        feature_dim=32,
        scratch_name="bcresnet1",
        finetune_name="bcresnet1_speaker",
    ),
}

DEFAULT_OUT_NAMES = {name for info in ARCHS.values() for name in (info.scratch_name, info.finetune_name)}


def arch_info(arch: str | None) -> ArchInfo:
    return ARCHS.get(str(arch), ARCHS[DEFAULT_ARCH])


def arch_title(arch: str | None) -> str:
    info = ARCHS.get(str(arch))
    return info.title if info is not None else str(arch or "알 수 없음")


def default_learning_rate(arch: str | None, finetune: bool = False) -> float:
    info = arch_info(arch)
    return info.finetune_lr if finetune else info.learning_rate


def default_out_name(arch: str | None, finetune: bool = False) -> str:
    info = arch_info(arch)
    return info.finetune_name if finetune else info.scratch_name


def check_arch(arch: str | None) -> str:
    if arch not in ARCHS:
        raise ValueError(f"지원하지 않는 모델 구조입니다: {arch}. 사용할 수 있는 구조: {', '.join(ARCHS)}")
    return str(arch)
