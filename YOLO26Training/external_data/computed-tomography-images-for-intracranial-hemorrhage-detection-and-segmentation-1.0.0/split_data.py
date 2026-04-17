# This code loads the grayscale images of the brain-window
# for each subject in Patient_CT folder.
# The code resizes the images and saves them to one folder (tarin\image).
# Their segmentation is saved to another folder (train\label).

import os
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm
from scipy.misc import imread, imresize, imsave

numSubj = 82
new_size = (512, 512)
currentDir = Path(os.getcwd())
datasetDir = str(Path(currentDir, 'Patients_CT'))

# Reading labels
hemorrhage_diagnosis_df = pd.read_csv(
    Path(currentDir, 'hemorrhage_diagnosis.csv')
)
hemorrhage_diagnosis_array = hemorrhage_diagnosis_df._get_values

# reading images
AllCTscans = np.zeros([hemorrhage_diagnosis_array.shape[0],
                       new_size[0], new_size[1]], dtype=np.uint8)
Allsegment = np.zeros([hemorrhage_diagnosis_array.shape[0],
                       new_size[0], new_size[1]], dtype=np.uint8)

train_path = Path('train')
image_path = train_path / 'image'
label_path = train_path / 'label'
if not train_path.exists():
    train_path.mkdir()
    image_path.mkdir()
    label_path.mkdir()

counterI = 0
for sNo in tqdm(range(0+49, numSubj+49)):
    datasetDirSubj = Path(datasetDir, "{0:0=3d}".format(sNo))

    idx = hemorrhage_diagnosis_array[:, 0] == sNo
    sliceNos = hemorrhage_diagnosis_array[idx, 1]
    NoHemorrhage = hemorrhage_diagnosis_array[idx, 7]
    for sliceI in range(0, sliceNos.size):
        img_path = Path(datasetDirSubj, 'brain',
                        str(sliceNos[sliceI]) + '.jpg')
        img = imread(img_path)
        x = imresize(img, new_size)
        AllCTscans[counterI] = x
        imsave(image_path / (str(counterI) + '.png'), x)

        # Saving the segmentation for a given slice
        segment_path = Path(datasetDirSubj, 'brain', str(
            sliceNos[sliceI]) + '_HGE_Seg.jpg')
        if os.path.exists(str(segment_path)):
            img = imread(segment_path)
            x = imresize(img, new_size)
            # Because of the resize the image has some values that are not 0
            # or 255, so make them 0 or 255
            x = np.where(x > 128, 255, 0)
            imsave(label_path / (str(counterI) + '.png'), x)
        else:
            x = np.zeros([new_size[0], new_size[1]], dtype=np.uint8)
            imsave(label_path / (str(counterI) + '.png'), x)
        Allsegment[counterI] = x

        counterI = counterI+1
