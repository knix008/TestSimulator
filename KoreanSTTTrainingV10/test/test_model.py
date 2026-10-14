import unittest

import torch

from kws.model import ARCH_NAME, TIME_BINS, build_model, parameter_count


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


if __name__ == "__main__":
    unittest.main()
