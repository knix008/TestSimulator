"""명령어 인식용 작은 depthwise separable CNN.

입력은 (배치, 1, 멜빈, 프레임) 로그멜이고 출력은 클래스 로짓이다.
"""

from __future__ import annotations

import torch
from torch import nn

ARCH_NAME = "dscnn_v2"
TIME_BINS = 4


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


def build_model(n_classes: int) -> CommandNet:
    if n_classes < 2:
        raise ValueError("클래스는 명령과 무음을 포함해 2개 이상이어야 합니다.")
    return CommandNet(n_classes)


def parameter_count(model: nn.Module) -> int:
    return sum(parameter.numel() for parameter in model.parameters())
