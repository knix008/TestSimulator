"""my3dobjects.project_texture: colours laid onto a bare shape from its
picture, checked on scenes whose right colours are known."""

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def _missing():
    try:
        import torch  # noqa: F401
        import trimesh  # noqa: F401
        import xatlas  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError as e:
        return f"engine packages missing ({e})"
    return ""


GREEN, RED, BLUE, YELLOW = (40, 200, 60), (220, 40, 40), (40, 70, 220), (240, 220, 30)


def colour_at_vertices(mesh):
    """The texture's colour under each vertex (0..255)."""
    img = np.asarray(mesh.visual.material.baseColorTexture.convert("RGB"), dtype=np.float64)
    size = img.shape[0]
    uv = np.asarray(mesh.visual.uv)
    col = np.clip((uv[:, 0] * size).astype(int), 0, size - 1)
    row = np.clip(((1 - uv[:, 1]) * size).astype(int), 0, size - 1)
    return img[row, col]


def colour_at_face_centres(mesh):
    """The texture's colour at each triangle's centre, and those centres —
    away from edges, where a sample straddles two colours of the picture."""
    img = np.asarray(mesh.visual.material.baseColorTexture.convert("RGB"), dtype=np.float64)
    size = img.shape[0]
    uv = np.asarray(mesh.visual.uv)[mesh.faces].mean(1)
    col = np.clip((uv[:, 0] * size).astype(int), 0, size - 1)
    row = np.clip(((1 - uv[:, 1]) * size).astype(int), 0, size - 1)
    return img[row, col], mesh.triangles_center


def near(c, ref, tol=60):
    return np.linalg.norm(c - np.asarray(ref, dtype=np.float64), axis=-1) < tol


@unittest.skipIf(_missing(), _missing() or "")
class ProjectTextureTest(unittest.TestCase):
    def setUp(self):
        from my3dobjects.project_texture import project_texture

        self.project = project_texture

    def test_front_and_back_take_the_picture_colours(self):
        import trimesh
        from PIL import Image, ImageDraw

        sphere = trimesh.creation.icosphere(subdivisions=4)
        pic = Image.new("RGBA", (240, 240), (0, 0, 0, 0))
        d = ImageDraw.Draw(pic)
        d.pieslice((20, 20, 220, 220), 90, 270, fill=GREEN + (255,))    # left half
        d.pieslice((20, 20, 220, 220), -90, 90, fill=RED + (255,))      # right half
        out = self.project(sphere, pic, size=512)

        c = colour_at_vertices(out)
        x, z = out.vertices[:, 0], out.vertices[:, 2]
        left, right = x < -0.2, x > 0.2
        for side, ref in ((left, GREEN), (right, RED)):
            for face in (z > 0.3, z < -0.3):                   # front and back
                sel = side & face
                self.assertGreater(sel.sum(), 20)
                self.assertGreater(near(c[sel], ref).mean(), 0.95, f"{ref}: {near(c[sel], ref).mean():.2f}")

    def test_what_is_hidden_takes_its_neighbours_colour_not_the_occluder(self):
        import trimesh
        from PIL import Image, ImageDraw

        sphere = trimesh.creation.icosphere(subdivisions=4)
        box = trimesh.creation.box(extents=(0.4, 0.4, 0.4)).subdivide().subdivide()
        box.apply_translation((0, 0, 1.6))
        scene = trimesh.util.concatenate([sphere, box])
        # The picture: the sphere blue, the box in front of it yellow. The
        # silhouette's box is the sphere's (x, y in −1 … 1 → 0 … 200 px).
        pic = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        d = ImageDraw.Draw(pic)
        d.ellipse((0, 0, 199, 199), fill=BLUE + (255,))
        d.rectangle((80, 80, 119, 119), fill=YELLOW + (255,))
        out = self.project(scene, pic, size=1024)

        c, v = colour_at_face_centres(out)
        box_front = (v[:, 2] > 1.79)        # the face toward the viewer, not its edge-on sides
        hidden = (np.abs(v[:, 0]) < 0.12) & (np.abs(v[:, 1]) < 0.12) & (v[:, 2] > 0.9) & (v[:, 2] < 1.05)
        self.assertGreater(box_front.sum(), 3)
        self.assertGreater(hidden.sum(), 3)
        self.assertTrue(near(c[box_front], YELLOW).all())
        self.assertFalse(near(c[hidden], YELLOW).any(), "the occluder's colour leaked onto what it hides")
        self.assertTrue(near(c[hidden], BLUE, tol=90).all())

    def test_texture_reaches_past_the_islands(self):
        import trimesh
        from PIL import Image

        sphere = trimesh.creation.icosphere(subdivisions=3)
        pic = Image.new("RGBA", (100, 100), RED + (255,))
        out = self.project(sphere, pic, size=256)
        img = np.asarray(out.visual.material.baseColorTexture)
        # Black only far from any island: most texels carry colour.
        self.assertGreater((img.sum(-1) > 0).mean(), 0.6)
        self.assertEqual(out.visual.uv.shape, (len(out.vertices), 2))

    def test_a_picture_without_opaque_pixels_is_refused(self):
        import trimesh
        from PIL import Image

        with self.assertRaises(ValueError):
            self.project(trimesh.creation.box(), Image.new("RGBA", (20, 20), (0, 0, 0, 0)))


if __name__ == "__main__":
    unittest.main()
