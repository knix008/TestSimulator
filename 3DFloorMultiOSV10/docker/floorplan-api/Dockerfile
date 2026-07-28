# FloorPlanTo3D-API (Mask R-CNN) — TensorFlow 1.15 CPU
# Build context: FloorPlanTo3D-API source tree (sibling or cloned).
# Weights are mounted at runtime into /app/weights.
FROM tensorflow/tensorflow:1.15.0-py3

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Old base image ships a broken-modern pip combo; pin a Py3.6-compatible pip.
RUN python -m pip install --upgrade "pip==20.3.4" "setuptools==44.1.1" "wheel==0.37.1"

RUN pip install --no-cache-dir \
    "Flask==1.1.4" \
    "Flask-Cors==3.0.10" \
    "Werkzeug==1.0.1" \
    "itsdangerous==1.1.0" \
    "click==7.1.2" \
    "Jinja2==2.11.3" \
    "MarkupSafe==1.1.1" \
    "Pillow==8.2.0" \
    "scikit-image==0.17.2" \
    "scipy==1.5.4" \
    "h5py==2.10.0" \
    "Keras==2.2.4" \
    "matplotlib==3.3.4" \
    "opencv-python-headless==4.5.1.48" \
    "imageio==2.9.0" \
    "imgaug==0.4.0" \
    "IPython==7.16.1" \
    "Cython==0.29.23"

COPY mrcnn ./mrcnn
# Prefer patched application.py (no double mold_image; EXIF). Build helper
# copies docker/floorplan-api/application.py into the context before `docker build`.
COPY application.py ./
RUN mkdir -p ./weights

ENV TF_CPP_MIN_LOG_LEVEL=2
EXPOSE 5000

CMD ["python", "application.py"]
