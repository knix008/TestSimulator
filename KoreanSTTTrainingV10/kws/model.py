"""명령어 인식용 작은 합성곱 네트워크.

입력은 (배치, 1, 멜빈, 프레임) 로그멜이고 출력은 클래스 로짓이다.
네트워크는 두 가지이다. 저장된 결과의 meta.json `arch`로 어느 쪽인지 구분한다.

- dscnn_v2: depthwise separable CNN (기본)
- bcresnet1: BC-ResNet-1 (Kim et al., "Broadcasted Residual Learning for Efficient Keyword Spotting", 2021)
"""

from __future__ import annotations

import torch
from torch import nn

from kws.archs import (  # noqa: F401  다른 모듈이 kws.model에서 가져다 쓴다.
    ARCHS,
    BCRESNET1,
    DEFAULT_ARCH,
    DSCNN,
    ArchInfo,
    arch_title,
    check_arch,
    default_learning_rate,
)

ARCH_NAME = DSCNN
TIME_BINS = 4


# ---------------------------------------------------------------- DS-CNN v2


def _norm(channels: int) -> nn.GroupNorm:
    # 명령어 녹음은 배치가 작아 배치 정규화의 이동 평균이 불안정하다.
    groups = 8 if channels % 8 == 0 else 1
    return nn.GroupNorm(groups, channels)


class DepthwiseSeparableConv(nn.Module):
    def __init__(self, in_channels: int, out_channels: int, stride: tuple[int, int]) -> None:
        super().__init__()
        self.depthwise = nn.Conv2d(
            in_channels,
            in_channels,
            kernel_size=3,
            stride=stride,
            padding=1,
            groups=in_channels,
            bias=False,
        )
        self.bn_depth = _norm(in_channels)
        self.pointwise = nn.Conv2d(in_channels, out_channels, kernel_size=1, bias=False)
        self.bn_point = _norm(out_channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = torch.relu(self.bn_depth(self.depthwise(x)))
        x = torch.relu(self.bn_point(self.pointwise(x)))
        return x


class CommandNet(nn.Module):
    arch = DSCNN

    def __init__(self, n_classes: int) -> None:
        super().__init__()
        channels = 32
        self.stem = nn.Sequential(
            nn.Conv2d(1, channels, kernel_size=3, padding=1, bias=False),
            _norm(channels),
            nn.ReLU(),
        )
        specs = (
            (32, (1, 1)),
            (32, (2, 2)),
            (32, (1, 1)),
            (64, (2, 2)),
            (64, (1, 1)),
            (64, (1, 1)),
        )
        blocks: list[nn.Module] = []
        in_channels = channels
        for out_channels, stride in specs:
            blocks.append(DepthwiseSeparableConv(in_channels, out_channels, stride))
            in_channels = out_channels
        self.blocks = nn.Sequential(*blocks)
        # 주파수는 모두 모으고 시간은 4칸만 남긴다. 출근과 퇴근처럼 앞 음절만 다른 명령을 평균으로 섞지 않기 위해서다.
        self.temporal = nn.Conv2d(in_channels, in_channels, kernel_size=(1, TIME_BINS), groups=in_channels, bias=False)
        self.dropout = nn.Dropout(p=0.15)
        self.fc = nn.Linear(in_channels, n_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.blocks(x)
        x = _time_bins(x, TIME_BINS)
        x = self.temporal(x)
        x = torch.flatten(x, 1)
        x = self.dropout(x)
        return self.fc(x)


def _time_bins(x: torch.Tensor, bins: int) -> torch.Tensor:
    """주파수는 평균내고, 시간은 bins칸으로 고르게 나눈다.

    ONNX는 입력 길이의 약수가 아닌 adaptive pool 크기를 내보내지 못한다.
    길이를 bins의 배수로 채운 뒤 고정 커널로 평균내어 같은 결과를 항상 보낸다.
    """
    x = x.mean(dim=2, keepdim=True)
    length = int(x.shape[-1])
    padded = bins * ((length + bins - 1) // bins)
    if padded != length:
        x = torch.nn.functional.pad(x, (0, padded - length))
    width = padded // bins
    return torch.nn.functional.avg_pool2d(x, kernel_size=(1, width), stride=(1, width))


# ---------------------------------------------------------------- BC-ResNet-1

SUB_BANDS = 5


class SubSpectralNorm(nn.Module):
    """주파수를 sub_bands 구간으로 나눠 구간마다 따로 배치 정규화한다."""

    def __init__(self, channels: int, sub_bands: int = SUB_BANDS) -> None:
        super().__init__()
        self.sub_bands = sub_bands
        self.bn = nn.BatchNorm2d(channels * sub_bands)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch, channels, freq, time = x.shape
        x = x.reshape(batch, channels * self.sub_bands, freq // self.sub_bands, time)
        x = self.bn(x)
        return x.reshape(batch, channels, freq, time)


class BCResBlock(nn.Module):
    """주파수 depthwise(2D) → 주파수 평균 → 시간 depthwise(1D) → 2D 결과에 방송해 더한다."""

    def __init__(self, in_channels: int, out_channels: int, stage: int, freq_stride: int, dilation: int) -> None:
        super().__init__()
        self.transition = in_channels != out_channels
        layers: list[nn.Module] = []
        if self.transition:
            layers += [nn.Conv2d(in_channels, out_channels, 1, bias=False), nn.BatchNorm2d(out_channels), nn.ReLU()]
        layers += [
            nn.Conv2d(
                out_channels,
                out_channels,
                kernel_size=(3, 1),
                stride=(freq_stride, 1),
                padding=(1, 0),
                groups=out_channels,
                bias=False,
            ),
            SubSpectralNorm(out_channels),
        ]
        self.f2 = nn.Sequential(*layers)
        self.f1 = nn.Sequential(
            nn.Conv2d(
                out_channels,
                out_channels,
                kernel_size=(1, 3),
                padding=(0, dilation),
                dilation=(1, dilation),
                groups=out_channels,
                bias=False,
            ),
            nn.BatchNorm2d(out_channels),
            nn.SiLU(),
            nn.Conv2d(out_channels, out_channels, 1, bias=False),
            nn.Dropout2d(0.1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        shortcut = x
        x = self.f2(x)
        aux = x
        x = self.f1(x.mean(dim=2, keepdim=True))
        x = x + aux
        if not self.transition:
            x = x + shortcut
        return torch.relu(x)


class BCResNet(nn.Module):
    """BC-ResNet. base_channels 8이 BC-ResNet-1이다.

    40멜 입력은 머리에서 20, 2단계에서 10, 3단계에서 5 주파수가 되고, 분류기의 5×5 depthwise가 1로 모은다.
    """

    arch = BCRESNET1
    REPEATS = (2, 2, 4, 4)
    STRIDE_STAGES = (1, 2)

    def __init__(self, n_classes: int, base_channels: int = 8) -> None:
        super().__init__()
        b = base_channels
        channels = [b * 2, b, int(b * 1.5), b * 2, int(b * 2.5), b * 4]
        self.channels = channels
        self.head = nn.Sequential(
            nn.Conv2d(1, channels[0], 5, stride=(2, 1), padding=2, bias=False),
            nn.BatchNorm2d(channels[0]),
            nn.ReLU(),
        )
        blocks: list[nn.Module] = []
        in_channels = channels[0]
        for stage, repeat in enumerate(self.REPEATS):
            out_channels = channels[stage + 1]
            dilation = 2**stage if stage >= 1 else 1
            for index in range(repeat):
                stride = 2 if stage in self.STRIDE_STAGES and index == 0 else 1
                blocks.append(BCResBlock(in_channels, out_channels, stage, stride, dilation))
                in_channels = out_channels
        self.blocks = nn.Sequential(*blocks)
        self.classifier = nn.Sequential(
            nn.Conv2d(in_channels, in_channels, (5, 5), padding=(0, 2), groups=in_channels, bias=False),
            nn.Conv2d(in_channels, channels[-1], 1, bias=False),
            nn.BatchNorm2d(channels[-1]),
            nn.ReLU(),
        )
        self.fc = nn.Conv2d(channels[-1], n_classes, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.head(x)
        x = self.blocks(x)
        x = self.classifier(x)
        x = x.mean(dim=(2, 3), keepdim=True)
        return torch.flatten(self.fc(x), 1)


# ---------------------------------------------------------------- 공통


def build_model(n_classes: int, arch: str = DEFAULT_ARCH) -> nn.Module:
    if n_classes < 2:
        raise ValueError("클래스는 명령과 무음을 포함해 2개 이상이어야 합니다.")
    arch = check_arch(arch)
    if arch == BCRESNET1:
        return BCResNet(n_classes, base_channels=8)
    return CommandNet(n_classes)


def parameter_count(model: nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters())
