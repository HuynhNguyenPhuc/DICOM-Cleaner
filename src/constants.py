"""
constants.py
============
Centralised configuration for the DICOM annotation-removal pipeline.

All hard-coded values that influence the algorithm's behaviour live here.
Keeping them in one place makes tuning easy and prevents magic numbers from
spreading across the codebase.
"""

import numpy as np

# ---------------------------------------------------------------------------
# HSV colour ranges
# ---------------------------------------------------------------------------
# OpenCV represents Hue on [0, 179], Saturation and Value on [0, 255].
# The ranges below isolate the yellow and green annotation colours that are
# commonly overlaid on ultrasound DICOM images.

#: Lower bound of the yellow HSV range.
LOWER_YELLOW: np.ndarray = np.array([20, 40, 40])

#: Upper bound of the yellow HSV range.
UPPER_YELLOW: np.ndarray = np.array([45, 255, 255])

#: Lower bound of the green HSV range.
LOWER_GREEN: np.ndarray = np.array([40, 40, 40])

#: Upper bound of the green HSV range.
UPPER_GREEN: np.ndarray = np.array([85, 255, 255])

# ---------------------------------------------------------------------------
# Morphological operation parameters
# ---------------------------------------------------------------------------
# A two-step refinement is applied to the raw colour mask:
#   1. Morphological closing  – fills small gaps inside annotation regions.
#   2. Dilation               – slightly expands the mask to capture
#                               anti-aliased or faded annotation edges.

#: Kernel size (height, width) used for the closing operation.
CLOSING_KERNEL_SIZE: tuple[int, int] = (3, 3)

#: Number of closing iterations.
CLOSING_ITERATIONS: int = 2

#: Kernel size (height, width) used for mask dilation.
DILATION_KERNEL_SIZE: tuple[int, int] = (3, 3)

#: Number of dilation iterations.
DILATION_ITERATIONS: int = 1

# ---------------------------------------------------------------------------
# Inpainting parameters
# ---------------------------------------------------------------------------
# OpenCV's Navier-Stokes / TELEA inpainting fills masked pixels by
# propagating colour and texture information from surrounding pixels.

#: Radius (in pixels) of the neighbourhood used when inpainting each pixel.
INPAINT_RADIUS: int = 5

# ---------------------------------------------------------------------------
# DICOM output parameters
# ---------------------------------------------------------------------------
#: Photometric interpretation tag value for the output DICOM file.
PHOTOMETRIC_INTERPRETATION: str = "RGB"
