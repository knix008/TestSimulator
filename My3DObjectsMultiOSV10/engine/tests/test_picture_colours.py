"""my3dobjects.project_texture.picture_on_vertex_colours: the input picture
laid over a model's own vertex colours (TRELLIS), and the model turned to
face the picture, on scenes whose right answer is known."""

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def _missing():
    try:
        import torch  # noqa: F401
        import trimesh  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        return f"engine packages missing ({e})"
    return ""


GREEN, RED, GREY = np.array([40, 200, 60]) / 255, np.array([220, 40, 40]) / 255, np.array([0.5, 0.5, 0.5])
BLUE = np.array([40, 70, 220]) / 255


def halves_picture():
    """Left half green, right half red, on a transparent background."""
    from PIL import Image, ImageDraw

    pic = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(pic)
    d.pieslice((20, 20, 220, 220), 90, 270, fill=(40, 200, 60, 255))
    d.pieslice((20, 20, 220, 220), -90, 90, fill=(220, 40, 40, 255))
    return pic


def near(c, ref, tol=0.12):
    return np.abs(c - ref).max(-1) < tol


@unittest.skipIf(_missing(), _missing() or "")
class PictureOnVertexColoursTest(unittest.TestCase):
    def setUp(self):
        import trimesh

        from my3dobjects import project_texture as pt

        self.pt = pt
        self.sphere = trimesh.creation.icosphere(subdivisions=5)

    def run_on(self, verts, model_rgb, **kw):
        return self.pt.picture_on_vertex_colours(verts, self.sphere.faces, verts / np.linalg.norm(verts, axis=1, keepdims=True),
                                                 model_rgb, halves_picture(), **kw)

    def test_front_takes_the_picture(self):
        v = np.asarray(self.sphere.vertices)
        model = np.tile(GREY, (len(v), 1))
        out, turn, share = self.run_on(v, model)
        self.assertEqual(turn, 0)
        self.assertGreater(share, 0.2)
        x, z = v[:, 0], v[:, 2]
        front = z > 0.7
        self.assertGreater(near(out[front & (x < -0.15)], GREEN).mean(), 0.95)
        self.assertGreater(near(out[front & (x > 0.15)], RED).mean(), 0.95)

    def test_a_back_like_the_front_takes_the_picture_sharply(self):
        """The model's guess for the back is the picture's halves, blurred and
        dull: the back gets the picture's colours, not the dull ones."""
        v = np.asarray(self.sphere.vertices)
        x, z = v[:, 0], v[:, 2]
        t = np.clip(x * 3, -1, 1)[:, None] * 0.5 + 0.5          # a soft left → right ramp
        model = (GREEN * (1 - t) + RED * t) * 0.85               # duller than the picture
        out, _turn, _share = self.run_on(v, model)
        back = z < -0.7
        self.assertGreater(near(out[back & (x < -0.15)], GREEN).mean(), 0.9)
        self.assertGreater(near(out[back & (x > 0.15)], RED).mean(), 0.9)

    def test_a_back_unlike_the_front_keeps_the_model(self):
        """The model says the back is blue: the picture's colours stay off it."""
        v = np.asarray(self.sphere.vertices)
        z = v[:, 2]
        model = np.where((v[:, 0] < 0)[:, None], GREEN, RED)
        model[z < -0.05] = BLUE
        out, _turn, _share = self.run_on(v, model)
        back = z < -0.5
        self.assertGreater(near(out[back], BLUE, tol=0.15).mean(), 0.95)

    def test_unseen_colours_are_brought_to_the_picture_tone(self):
        """The model's colours are the picture's, only darker: the parts no
        view sees (here the rim, edge-on) come out at the picture's brightness."""
        v = np.asarray(self.sphere.vertices)
        x, z = v[:, 0], v[:, 2]
        model = np.where((x < 0)[:, None], GREEN, RED) * 0.6
        out, _turn, _share = self.run_on(v, model)
        rim = (np.abs(z) < 0.08) & (x < -0.5)
        self.assertGreater(rim.sum(), 10)
        self.assertGreater(near(out[rim], GREEN, tol=0.1).mean(), 0.9)

    def test_no_weight_leaks_onto_unseen_vertices(self):
        """Vertices neither view sees have no picture colour: nothing black."""
        v = np.asarray(self.sphere.vertices)
        model = np.tile(GREY, (len(v), 1))
        out, _turn, _share = self.run_on(v, model)
        self.assertGreater(out.max(1).min(), 0.15)

    def test_a_model_facing_sideways_is_turned_to_the_picture(self):
        """The model's own colours match the picture when the sphere is turned
        one quarter: that turn is found."""
        v = np.asarray(self.sphere.vertices)
        for k in (1, 2, 3):
            turned = v @ self.pt._quarter_turn(k).T
            model = np.tile(GREY, (len(v), 1))
            front = turned[:, 2] > 0.2
            model[front & (turned[:, 0] < 0)] = GREEN
            model[front & (turned[:, 0] >= 0)] = RED
            _out, turn, _share = self.run_on(v, model)
            self.assertEqual(turn, k)

    def test_turns_can_be_off(self):
        v = np.asarray(self.sphere.vertices)
        turned = v @ self.pt._quarter_turn(2).T
        model = np.where((turned[:, 0] < 0)[:, None], GREEN, RED)
        _out, turn, _share = self.run_on(v, model, turns=False)
        self.assertEqual(turn, 0)

    def test_quarter_turns(self):
        r = self.pt._quarter_turn(1)
        self.assertTrue(np.allclose(r @ r.T, np.eye(3)))
        self.assertTrue(np.allclose(np.linalg.det(r), 1))
        self.assertTrue(np.allclose(self.pt._quarter_turn(4), np.eye(3)))
        self.assertTrue(np.allclose(self.pt._quarter_turn(1) @ self.pt._quarter_turn(3), np.eye(3)))


if __name__ == "__main__":
    unittest.main()
