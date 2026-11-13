"""Quality settings fitted to the subject of the picture, without a model."""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from PIL import Image, ImageDraw  # noqa: E402

from my3dobjects import models  # noqa: E402
from my3dobjects.quality import fit_quality, subject_profile  # noqa: E402


def _solid(size, color=(180, 140, 90, 255)):
    return Image.new("RGBA", (size, size), color)


def _busy(size=1200):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pen = ImageDraw.Draw(img)
    for i in range(0, size, 12):
        pen.rectangle([i, 0, i + 6, size], fill=(20 + (i * 3) % 200, 40, 180, 255))
        pen.rectangle([0, i, size, i + 6], fill=(220, 30 + (i * 5) % 180, 40, 255))
    return img


class SubjectProfileTest(unittest.TestCase):
    def test_a_small_plain_subject_is_coarse(self):
        p = subject_profile(_solid(200))
        self.assertEqual(p["tier"], "coarse")
        self.assertEqual(p["span"], 200)

    def test_a_large_plain_subject_stays_ordinary(self):
        p = subject_profile(_solid(1024))
        self.assertEqual(p["tier"], "medium")
        self.assertLess(p["detail"], 0.10)

    def test_a_large_patterned_subject_is_detailed(self):
        p = subject_profile(_busy(1200))
        self.assertEqual(p["tier"], "fine")
        self.assertGreaterEqual(p["detail"], 0.10)

    def test_no_subject_stays_ordinary(self):
        p = subject_profile(Image.new("RGBA", (64, 64), (0, 0, 0, 0)))
        self.assertEqual(p["tier"], "medium")
        self.assertEqual(p["span"], 0)


class FitQualityTest(unittest.TestCase):
    def _fit(self, model_id, image, device="cuda", raw=None):
        spec = models.get(model_id)
        options = models.normalize_options(spec, raw or {}, device)
        return fit_quality(spec, image, options, raw or {}, device)

    def test_a_detailed_subject_raises_texture_resolution_on_a_gpu(self):
        options, profile = self._fit("sf3d", _busy())
        self.assertEqual(profile["tier"], "fine")
        self.assertEqual(options["textureResolution"], 2048)

    def test_the_same_subject_stays_within_what_a_cpu_can_bake(self):
        options, _profile = self._fit("sf3d", _busy(), "cpu")
        self.assertEqual(options["textureResolution"], 1024)

    def test_a_small_subject_uses_the_lighter_texture(self):
        options, profile = self._fit("sf3d", _solid(200))
        self.assertEqual(profile["tier"], "coarse")
        self.assertEqual(options["textureResolution"], 512)

    def test_a_chosen_resolution_is_kept(self):
        options, _profile = self._fit("sf3d", _busy(), raw={"textureResolution": "512"})
        self.assertEqual(options["textureResolution"], 512)

    def test_fitting_can_be_turned_off(self):
        options, profile = self._fit("sf3d", _busy(), raw={"fitQuality": False})
        self.assertIsNone(profile)
        self.assertEqual(options["textureResolution"], 1024)

    def test_trellis_detail_steps_follow_a_busy_subject(self):
        options, _profile = self._fit("trellis", _busy())
        self.assertEqual(options["slatSteps"], 24)
        self.assertEqual(options["ssSteps"], 18)
        self.assertEqual(options["slatGuidance"], 4.0)
        self.assertEqual(options["textureSize"], 2048)
        # The structure guidance and the seed stay at the demo values.
        self.assertEqual(options["ssGuidance"], 7.5)
        self.assertEqual(options["seed"], 0)

    def test_a_chosen_trellis_step_count_is_kept(self):
        options, _profile = self._fit("trellis", _busy(), raw={"slatSteps": 12})
        self.assertEqual(options["slatSteps"], 12)
        self.assertEqual(options["ssSteps"], 18)

    def test_triposr_mesh_resolution_follows_the_subject(self):
        fine, _ = self._fit("triposr", _busy())
        coarse, _ = self._fit("triposr", _solid(200))
        self.assertEqual(fine["mcResolution"], 320)
        self.assertEqual(coarse["mcResolution"], 192)

    def test_hunyuan_shape_and_texture_follow_the_subject(self):
        fine, _ = self._fit("hunyuan3d-2.1", _busy())
        self.assertEqual(fine["octreeResolution"], 384)
        self.assertEqual(fine["faceLimit"], 80000)
        self.assertEqual(fine["steps"], 40)
        self.assertEqual(fine["textureSize"], 2048)
        turbo, _ = self._fit("hunyuan3d-2.0-turbo", _busy())
        self.assertEqual(turbo["steps"], 5)
        self.assertEqual(turbo["octreeResolution"], 384)

    def test_an_ordinary_subject_keeps_the_recommended_texture(self):
        options, profile = self._fit("sf3d", _solid(1024))
        self.assertEqual(profile["tier"], "medium")
        self.assertEqual(options["textureResolution"], 1024)
        self.assertEqual(profile["changed"], [])
