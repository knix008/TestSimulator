"""
FloorPlanTo3D-API entrypoint (modernized for TensorFlow 2.x / Flask 3).

Upstream: https://github.com/fadyazizz/FloorPlanTo3D-API

Accepts optional form field `params` (JSON) to tune detection:
  minConfidence, maxDetections, minBoxSidePx, doorFallbackRatio,
  includeWalls, includeWindows, includeDoors
"""
import json
import os

# TF 2.16+ ships Keras 3; Mask R-CNN TF2 fork needs the legacy Keras 2 API.
os.environ.setdefault('TF_USE_LEGACY_KERAS', '1')
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL', '2')

import sys

import numpy
import PIL
from PIL import Image, ImageOps
from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf

ROOT_DIR = os.path.abspath('./')
sys.path.insert(0, ROOT_DIR)

from mrcnn.config import Config
from mrcnn.model import MaskRCNN

WEIGHTS_FOLDER = './weights'
WEIGHTS_FILE_NAME = 'maskrcnn_15_epochs.h5'

application = Flask(__name__)
CORS(application, resources={r'/*': {'origins': '*'}})

_model = None
_graph = None
cfg = None

DEFAULT_PARAMS = {
    'minConfidence': 0.55,
    'maxDetections': 120,
    'minBoxSidePx': 10,
    'doorFallbackRatio': 0.045,
    'includeWalls': True,
    'includeWindows': True,
    'includeDoors': True,
}


class PredictionConfig(Config):
    NAME = 'floorPlan_cfg'
    # background + wall + window + door
    NUM_CLASSES = 1 + 3
    GPU_COUNT = 1
    IMAGES_PER_GPU = 1
    DETECTION_MIN_CONFIDENCE = 0.55
    DETECTION_MAX_INSTANCES = 120


def load_model():
    global cfg, _model, _graph
    model_folder_path = os.path.join(os.path.abspath('./'), 'mrcnn')
    weights_path = os.path.join(WEIGHTS_FOLDER, WEIGHTS_FILE_NAME)
    if not os.path.isfile(weights_path):
        raise FileNotFoundError(f'Missing weights file: {os.path.abspath(weights_path)}')

    cfg = PredictionConfig()
    print(cfg.IMAGE_RESIZE_MODE)
    print('==============before loading model=========')
    _model = MaskRCNN(mode='inference', model_dir=model_folder_path, config=cfg)
    print('=================after loading model==============')
    _model.load_weights(weights_path, by_name=True)
    _graph = tf.compat.v1.get_default_graph()
    print('=================weights loaded==============')


def parse_params():
    raw = request.form.get('params') or request.args.get('params') or ''
    data = {}
    if raw:
        try:
            data = json.loads(raw)
        except Exception:
            data = {}
    if not isinstance(data, dict):
        data = {}

    def num(key, default, lo, hi):
        try:
            v = float(data.get(key, default))
        except Exception:
            v = default
        return max(lo, min(hi, v))

    def boolean(key, default):
        if key not in data:
            return default
        return bool(data.get(key))

    return {
        'minConfidence': num('minConfidence', DEFAULT_PARAMS['minConfidence'], 0.05, 0.99),
        'maxDetections': int(num('maxDetections', DEFAULT_PARAMS['maxDetections'], 10, 500)),
        'minBoxSidePx': int(num('minBoxSidePx', DEFAULT_PARAMS['minBoxSidePx'], 2, 80)),
        'doorFallbackRatio': num('doorFallbackRatio', DEFAULT_PARAMS['doorFallbackRatio'], 0.015, 0.12),
        'includeWalls': boolean('includeWalls', True),
        'includeWindows': boolean('includeWindows', True),
        'includeDoors': boolean('includeDoors', True),
    }


def myImageLoader(image_input):
    """Load PIL image as uint8 RGB HxWx3; apply EXIF orientation."""
    img = image_input
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    img = img.convert('RGB')
    image = numpy.asarray(img)
    if image.ndim != 3:
        import skimage.color
        image = skimage.color.gray2rgb(image)
    if image.shape[-1] == 4:
        image = image[..., :3]
    if image.dtype != numpy.uint8:
        image = numpy.clip(image, 0, 255).astype(numpy.uint8)
    h, w = int(image.shape[0]), int(image.shape[1])
    return image, w, h


def getClassNames(class_ids):
    names = {1: 'wall', 2: 'window', 3: 'door'}
    result = []
    for classid in class_ids:
        cid = int(classid)
        result.append({'name': names.get(cid, 'wall')})
    return result


def filter_detections(rois, class_ids, scores, params):
    """Filter by confidence, size, class include flags, and max count."""
    keep_rois = []
    keep_ids = []
    keep_scores = []
    min_conf = float(params['minConfidence'])
    min_side = float(params['minBoxSidePx'])
    allowed = set()
    if params['includeWalls']:
        allowed.add(1)
    if params['includeWindows']:
        allowed.add(2)
    if params['includeDoors']:
        allowed.add(3)

    order = list(range(len(class_ids)))
    try:
        order.sort(key=lambda i: float(scores[i]), reverse=True)
    except Exception:
        pass

    for i in order:
        cid = int(class_ids[i])
        if cid not in allowed:
            continue
        score = float(scores[i]) if scores is not None else 1.0
        if score < min_conf:
            continue
        bb = rois[i]
        y1, x1, y2, x2 = float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])
        if max(abs(y2 - y1), abs(x2 - x1)) < min_side:
            continue
        keep_rois.append([y1, x1, y2, x2])
        keep_ids.append(cid)
        keep_scores.append(score)
        if len(keep_rois) >= int(params['maxDetections']):
            break
    return keep_rois, keep_ids, keep_scores


def normalizePoints(bbx, class_ids):
    result = []
    door_lengths = []
    for index, bb in enumerate(bbx):
        y1, x1, y2, x2 = float(bb[0]), float(bb[1]), float(bb[2]), float(bb[3])
        result.append([y1, x1, y2, x2])
        if int(class_ids[index]) == 3:
            door_lengths.append(max(abs(y2 - y1), abs(x2 - x1)))
    if door_lengths:
        average_door = float(sum(door_lengths) / len(door_lengths))
    else:
        average_door = 0.0
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


def fallbackAverageDoor(width, height, average_door, ratio=0.045):
    if average_door and average_door > 0:
        return float(average_door)
    span = max(1, min(int(width), int(height)))
    return float(max(24, span * float(ratio)))


@application.route('/', methods=['GET'])
def health():
    return jsonify({
        'ok': True,
        'service': 'FloorPlanTo3D-API',
        'modelLoaded': _model is not None,
        'defaultParams': DEFAULT_PARAMS,
    })


@application.route('/', methods=['POST'])
def prediction():
    global cfg, _model, _graph
    if _model is None:
        return jsonify({'error': 'Model not loaded'}), 503

    params = parse_params()
    imagefile = PIL.Image.open(request.files['image'].stream)
    image, w, h = myImageLoader(imagefile)
    print(h, w, params)

    # Tune inference thresholds for this request (model graph already built).
    _model.config.DETECTION_MIN_CONFIDENCE = float(params['minConfidence'])
    _model.config.DETECTION_MAX_INSTANCES = int(params['maxDetections'])

    with _graph.as_default():
        r = _model.detect([image], verbose=0)[0]

    rois = r['rois']
    class_ids = r['class_ids']
    scores = r.get('scores')
    rois, class_ids, scores = filter_detections(rois, class_ids, scores, params)

    temp, average_door = normalizePoints(rois, class_ids)
    temp = turnSubArraysToJson(temp)
    average_door = fallbackAverageDoor(w, h, average_door, params['doorFallbackRatio'])

    data = {
        'points': temp,
        'classes': getClassNames(class_ids),
        'scores': scores,
        'Width': w,
        'Height': h,
        'averageDoor': average_door,
        'params': params,
    }
    return jsonify(data)


if __name__ == '__main__':
    print('===========before loading model==========')
    load_model()
    print('===========before running==========')
    application.run(host='127.0.0.1', port=5000, debug=False, threaded=False)
    print('===========after running==========')
