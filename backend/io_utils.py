"""
io.py
=====
Input / output helpers for the DICOM annotation-removal pipeline.

Responsibilities
----------------
* Read a DICOM file from disk and expose its pixel data as a NumPy array.
* Persist a cleaned pixel array back into a DICOM file, preserving all
  original metadata tags.
* Save a standard PNG preview of a processed image.

This module intentionally contains *no* image-processing logic; it only
moves data between the filesystem and in-memory representations.
"""

from __future__ import annotations

import os

import cv2
import numpy as np
import pydicom
from pydicom.dataset import FileDataset
from pydicom.uid import ExplicitVRLittleEndian

from constants import PHOTOMETRIC_INTERPRETATION


def read_dicom(file_path: str) -> tuple[FileDataset, np.ndarray]:
    """
    Read a DICOM file and return the dataset with its pixel array.

    Args:
        file_path: Absolute or relative path to the .dcm file.

    Returns:
        dicom_dataset: The full FileDataset object containing all DICOM tags and metadata.
        pixel_array: The image data as a NumPy array (H, W, 3) in RGB channel order, dtype uint8.
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"DICOM file not found: {file_path}")

    dicom_dataset: FileDataset = pydicom.dcmread(file_path)
    pixel_array: np.ndarray = dicom_dataset.pixel_array  # shape: (H, W, 3), RGB

    return dicom_dataset, pixel_array


def collect_files_from_directory(directory: str) -> list[str]:
    """
    Return a sorted list of all file paths inside the directory.

    Args:
        directory: Path to the folder to scan.

    Returns:
        List of absolute or relative file paths.
    """
    if not os.path.isdir(directory):
        raise NotADirectoryError(f"Input directory not found: {directory}")

    return sorted(
        os.path.join(directory, name)
        for name in os.listdir(directory)
        if os.path.isfile(os.path.join(directory, name))
    )


def save_dicom(
    dicom_dataset: FileDataset,
    cleaned_rgb: np.ndarray,
    output_path: str,
) -> None:
    """
    Embed cleaned RGB pixels into DICOM dataset and write to disk.

    Args:
        dicom_dataset: Original FileDataset object read from the source DICOM file.
        cleaned_rgb: Cleaned pixel array with dtype uint8 and shape (H, W, 3) in RGB channel order.
        output_path: Destination path for the .dcm file.
    """
    dicom_dataset.PixelData = cleaned_rgb.tobytes()
    dicom_dataset.Rows, dicom_dataset.Columns, _ = cleaned_rgb.shape
    dicom_dataset.PhotometricInterpretation = PHOTOMETRIC_INTERPRETATION
    dicom_dataset.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    dicom_dataset.save_as(output_path)


def save_image(image_bgr: np.ndarray, output_path: str) -> None:
    """
    Write image to disk as a PNG file.

    Args:
        image_bgr: Image in BGR channel order.
        output_path: Destination path for the .png file.
    """
    success = cv2.imwrite(output_path, image_bgr)
    if not success:
        raise RuntimeError(f"cv2.imwrite failed for path: {output_path}")
