import unittest

import torch

from kws.archs import ARCHS, BCRESNET1, DEFAULT_ARCH, DSCNN, arch_title, default_learning_rate, default_out_name
from kws.model import ARCH_NAME, TIME_BINS, BCResNet, CommandNet, SubSpectralNorm, build_model, parameter_count


class ModelTest(unittest.TestCase):
    def test_parameter_counts_documented_in_architecture(self):
        self.assertEqual(ARCH_NAME, "dscnn_v2")
        self.assertEqual(parameter_count(build_model(5)), 17637)
        self.assertEqual(parameter_count(build_model(11)), 18027)

    def test_keeps_four_time_bins_before_the_classifier(self):
        model = build_model(5)
        self.assertEqual(model.temporal.kernel_size, (1, TIME_BINS))
        self.assertEqual(model.temporal.groups, model.temporal.in_channels)

    def test_forward_shape(self):
        model = build_model(5).eval()
        with torch.no_grad():
            out = model(torch.zeros(2, 1, 40, 98))
        self.assertEqual(tuple(out.shape), (2, 5))

    def test_single_example_batch_works_in_training_mode(self):
        model = build_model(5).train()
        out = model(torch.randn(1, 1, 40, 98))
        out.sum().backward()
        self.assertEqual(tuple(out.shape), (1, 5))

    def test_needs_two_classes(self):
        with self.assertRaises(ValueError):
            build_model(1)


class BCResNetTest(unittest.TestCase):
    def test_default_stays_dscnn(self):
        self.assertEqual(DEFAULT_ARCH, DSCNN)
        self.assertIsInstance(build_model(5), CommandNet)
        self.assertIsInstance(build_model(5, BCRESNET1), BCResNet)

    def test_parameter_counts(self):
        self.assertEqual(parameter_count(build_model(5, BCRESNET1)), 9001)
        self.assertEqual(parameter_count(build_model(11, BCRESNET1)), 9199)
        # 논문의 BC-ResNet-1(Google Speech Commands 12클래스)은 9.2K 파라미터이다.
        self.assertEqual(parameter_count(build_model(12, BCRESNET1)), 9232)

    def test_bc_resnet_1_channels_and_blocks(self):
        model = build_model(5, BCRESNET1)
        self.assertEqual(model.channels, [16, 8, 12, 16, 20, 32])
        self.assertEqual(len(model.blocks), sum(BCResNet.REPEATS))
        self.assertEqual(sum(isinstance(module, SubSpectralNorm) for module in model.modules()), 12)

    def test_frequency_shrinks_to_five_sub_bands_before_classifier(self):
        model = build_model(5, BCRESNET1).eval()
        shapes = []
        model.blocks.register_forward_hook(lambda _module, _inputs, output: shapes.append(tuple(output.shape)))
        with torch.no_grad():
            model(torch.zeros(1, 1, 40, 98))
        self.assertEqual(shapes, [(1, 20, 5, 98)])

    def test_time_dilation_grows_by_stage(self):
        model = build_model(5, BCRESNET1)
        dilations = [block.f1[0].dilation[1] for block in model.blocks]
        self.assertEqual(dilations, [1, 1, 2, 2, 4, 4, 4, 4, 8, 8, 8, 8])

    def test_forward_and_single_example_training(self):
        model = build_model(5, BCRESNET1).train()
        out = model(torch.randn(1, 1, 40, 98))
        out.sum().backward()
        self.assertEqual(tuple(out.shape), (1, 5))
        model.eval()
        with torch.no_grad():
            self.assertEqual(tuple(model(torch.zeros(3, 1, 40, 98)).shape), (3, 5))

    def test_unknown_arch(self):
        with self.assertRaisesRegex(ValueError, "지원하지 않는 모델 구조"):
            build_model(5, "resnet50")


class ArchRegistryTest(unittest.TestCase):
    def test_parameter_formula_matches_networks(self):
        # 화면은 PyTorch를 불러오지 않고 이 식으로 파라미터 수를 보여 준다.
        for arch, info in ARCHS.items():
            for n_classes in range(2, 12):
                with self.subTest(arch=arch, n_classes=n_classes):
                    self.assertEqual(info.parameter_count(n_classes), parameter_count(build_model(n_classes, arch)))

    def test_defaults_per_arch(self):
        self.assertEqual(default_learning_rate(DSCNN), 2e-3)
        self.assertEqual(default_learning_rate(DSCNN, finetune=True), 5e-4)
        self.assertEqual(default_learning_rate(BCRESNET1), 1e-2)
        self.assertEqual(default_learning_rate(BCRESNET1, finetune=True), 2.5e-3)
        self.assertEqual(default_out_name(DSCNN), "latest")
        self.assertEqual(default_out_name(DSCNN, finetune=True), "speaker")
        self.assertEqual(default_out_name(BCRESNET1), "bcresnet1")
        self.assertEqual(default_out_name(BCRESNET1, finetune=True), "bcresnet1_speaker")
        self.assertEqual(arch_title(BCRESNET1), "BC-ResNet-1")
        self.assertEqual(arch_title("other"), "other")

    def test_registry_does_not_import_torch(self):
        import subprocess
        import sys

        from kws.paths import SOURCE_ROOT

        code = "import sys, kws.archs, kws.project, gui.app; print('torch' in sys.modules)"
        completed = subprocess.run([sys.executable, "-c", code], cwd=SOURCE_ROOT, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "False")


if __name__ == "__main__":
    unittest.main()
