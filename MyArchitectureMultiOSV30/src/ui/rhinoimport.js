// Import of Rhino .3dm files: asks whether the model comes in as a 3D model
// (a piece of furniture, like OBJ or glTF — exports.importModel) or as a plan
// drawing (its top view on CAD layers, like DXF — exports.importDrawing).
// The reader itself (rhino3dm, WebAssembly) lives in src/io/rhino3dm.js.

import { t } from "./i18n.js";
import { h, modal, toast } from "./widgets.js";
import * as exports from "./exports.js";

export async function importRhinoFile(app, f) {
  const head = f.bytes && f.bytes.length > 23 ? String.fromCharCode(...f.bytes.subarray(0, 23)) : "";
  if (head !== "3D Geometry File Format") { toast(t("{name} is not a Rhino .3dm file.", { name: f.name }), "warn", 6000); return; }
  const body = h("div", { class: "rhino-choice" },
    h("p", {}, t("How should {name} come in?", { name: f.name })),
    h("ul", { class: "field-hint" },
      h("li", {}, t("3D model: surfaces, polysurfaces, meshes, SubDs and blocks become one piece of furniture, in the file's units, coloured by layer and material.")),
      h("li", {}, t("Plan drawing: the top view — curves, surface and mesh edges, points and texts — on one CAD layer per Rhino layer, to trace walls over."))));
  const choice = await modal({ icon: "import",
    title: t("Import Rhino 3DM"), width: 540, body,
    buttons: [{ label: t("Cancel"), value: null }, { label: t("Plan drawing"), value: "plan" }, { label: t("3D model"), value: "model", primary: true }],
  });
  if (choice === "model") await exports.importModel(app, f);
  else if (choice === "plan") await exports.importDrawing(app, f, "3dm");
}
