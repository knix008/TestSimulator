import os
import zipfile
import pandas as pd
from kaggle.api.kaggle_api_extended import KaggleApi

def download_kaggle_dataset(dataset, download_path):
    api = KaggleApi()
    api.authenticate()
    api.dataset_download_files(dataset, path=download_path, unzip=True)

def main():
    kaggle_dataset = 'trainingdatapro/computed-tomography-ct-of-the-brain'
    download_path = './data'
    os.makedirs(download_path, exist_ok=True)
    download_kaggle_dataset(kaggle_dataset, download_path)
    print('Kaggle dataset downloaded and extracted.')

if __name__ == '__main__':
    main()
