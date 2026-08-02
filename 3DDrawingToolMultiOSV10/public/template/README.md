# Templates

Starter `.3ddraw` project files for **3D Drawing Tool**.

## Files

| File | Description |
|------|-------------|
| `empty.3ddraw` | Blank scene |
| `primitives-showcase.3ddraw` | All basic primitives |
| `product-studio.3ddraw` | Soft product lighting setup |
| `isometric-composition.3ddraw` | Isometric-style layout |
| `metal-materials.3ddraw` | Metalness / roughness samples |
| `warm-night.3ddraw` | Warm point-light mood |
| `wireframe-draft.3ddraw` | Wireframe sketch |
| `architectural-blocks.3ddraw` | Simple building masses |
| `index.json` | Catalog used by the app UI |

## Usage in the app

1. Run the app (`npm start`)
2. Open **Templates** from the toolbar or left panel
3. Choose a template to load

Templates are also available as files under this folder for manual open/import.

## Format

Same JSON schema as saved projects (`.3ddraw`):

- `objects[]` — scene objects
- `lights` — ambient / directional / point
- `viewport` — grid, axes, background
