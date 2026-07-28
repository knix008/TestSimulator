"""
FloorPlanTo3D-API entrypoint for Docker (TensorFlow 1.15 / Keras 2.2).

Upstream: https://github.com/fadyazizz/FloorPlanTo3D-API

Critical fixes vs upstream:
  1) Call MaskRCNN.detect([uint8_rgb]) directly — do NOT pre-call mold_image().
     detect() already molds; double-molding misaligns ROIs (walls in wrong place).
  2) Apply EXIF orientation so Width/Height/rois match browser/client textures.
"""
import os
import sys

import numpy
import PIL
from PIL import ImageOps
import skimage.color
import tensorflow as tf
from flask import Flask, request, jsonify
from flask_cors import CORS
from mrcnn.config import Config
from mrcnn.model import MaskRCNN

ROOT_DIR = os.path.abspath('./')
sys.path.append(ROOT_DIR)

WEIGHTS_FOLDER = './weights'
WEIGHTS_FILE_NAME = 'maskrcnn_15_epochs.h5'

application = Flask(__name__)
CORS(application, resources={r'/*': {'origins': '*'}})

_model = None
_graph = None
cfg = None


class PredictionConfig(Config):
    NAME = 'floorPlan_cfg'
    NUM_CLASSES = 1 + 3
    GPU_COUNT = 1
    IMAGES_PER_GPU = 1


def load_model():
    global cfg, _model, _graph
    model_folder_path = os.path.join(os.path.abspath('./'), 'mrcnn')
    weights_path = os.path.join(WEIGHTS_FOLDER, WEIGHTS_FILE_NAME)
    cfg = PredictionConfig()
    print(cfg.IMAGE_RESIZE_MODE)
    print('==============before loading model=========')
    _model = MaskRCNN(mode='inference', model_dir=model_folder_path, config=cfg)
    print('=================after loading model==============')
    _model.load_weights(weights_path, by_name=True)
    _graph = tf.get_default_graph()
    print('==============model ready=========')


def myImageLoader(image_input):
    img = image_input
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    img = img.convert('RGB')
    image = numpy.asarray(img)
    if image.ndim != 3:
        image = skimage.color.gray2rgb(image)
    if image.shape[-1] == 4:
        image = image[..., :3]
    h, w = int(image.shape[0]), int(image.shape[1])
    return image, w, h


def getClassNames(class_ids):
    names = {1: 'wall', 2: 'window', 3: 'door'}
    result = []
    for classid in class_ids:
        result.append({'name': names.get(int(classid), 'wall')})
    return result


def normalizePoints(bbx, class_ids):
    result = []
    door_lengths = []
    for index, bb in enumerate(bbx):
        y1, x1, y2, x2 = float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])
        result.append([y1, x1, y2, x2])
        if int(class_ids[index]) == 3:
            door_lengths.append(max(abs(y2 - y1), abs(x2 - x1)))
    average_door = (sum(door_lengths) / len(door_lengths)) if door_lengths else 50.0
    return result, average_door


def turnSubArraysToJson(objects_arr):
    result = []
    for obj in objects_arr:
        result.append({
            'x1': obj[1],
            'y1': obj[0],
            'x2': obj[3],
            'y2': obj[2],
        })
    return result


@application.route('/', methods=['GET'])
def health():
    return jsonify({'ok': True, 'service': 'FloorPlanTo3D-API', 'modelLoaded': _model is not None})


@application.route('/', methods=['POST'])
def prediction():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'missing image field'}), 400
        imagefile = PIL.Image.open(request.files['image'].stream)
        image, w, h = myImageLoader(imagefile)
        print(h, w)

        global _model, _graph
        with _graph.as_default():
            # Important: pass raw RGB — detect() molds internally
            r = _model.detect([image], verbose=0)[0]

        bbx = r['rois'].tolist()
        temp, average_door = normalizePoints(bbx, r['class_ids'])
        temp = turnSubArraysToJson(temp)
        return jsonify({
            'points': temp,
            'classes': getClassNames(r['class_ids']),
            'Width': w,
            'Height': h,
            'averageDoor': average_door,
        })
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(exc)}), 500


if __name__ == '__main__':
    print('===========before running==========')
    load_model()
    application.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)
    print('===========after running==========')
