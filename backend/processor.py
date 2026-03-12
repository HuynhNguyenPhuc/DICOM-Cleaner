"""
processor.py
============
Core image-processing logic for the DICOM annotation-removal pipeline.

Algorithm overview
------------------
1. **Colour-space conversion** – the input BGR image is converted to HSV
   (Hue, Saturation, Value).  HSV separates chromatic information (hue) from
   brightness, making colour-based segmentation more robust to lighting
   variation than working directly in BGR/RGB.

2. **Colour masking** – two binary masks are produced using
   :func:`cv2.inRange`: one for yellow pixels and one for green pixels.  The
   HSV thresholds are defined in :mod:`src.constants`.  The masks are then
   combined with a bitwise OR so that any annotated pixel is captured.

3. **Mask refinement** – the raw colour mask may contain isolated noise
   pixels and small gaps inside annotation regions.  A two-step morphological
   pass addresses this:

   * *Closing* (dilation followed by erosion) – bridges small gaps within
     solid annotation areas, producing a more complete mask.
   * *Dilation* – grows the mask outward by a few pixels to catch
     anti-aliased or faded annotation edges that fall just outside the strict
     colour range.

4. **Inpainting** – :func:`cv2.inpaint` with the TELEA algorithm fills every
   masked pixel by propagating colour and texture information radially inward
   from the surrounding unmasked region.  The result is a visually seamless
   reconstruction of the underlying anatomy.

This module is a pure image-processing library: it accepts and returns NumPy
arrays and has no knowledge of DICOM files or the filesystem.
"""

from __future__ import annotations

import cv2
import numpy as np

from constants import (
    CLOSING_ITERATIONS,
    CLOSING_KERNEL_SIZE,
    DILATION_ITERATIONS,
    DILATION_KERNEL_SIZE,
    INPAINT_RADIUS,
    LOWER_GREEN,
    LOWER_YELLOW,
    UPPER_GREEN,
    UPPER_YELLOW,
)


def build_annotation_mask(
    image_bgr: np.ndarray,
    lower_yellow: np.ndarray | None = None,
    upper_yellow: np.ndarray | None = None,
    lower_green: np.ndarray | None = None,
    upper_green: np.ndarray | None = None,
    closing_iterations: int | None = None,
    dilation_iterations: int | None = None,
) -> np.ndarray:
    """
    Construct a binary mask covering yellow and green annotation pixels.

    Mask is refined with morphological closing and dilation to fully cover
    solid annotation regions and their faded edges.

    Args:
        image_bgr: Source image in BGR channel order, dtype uint8.
        lower_yellow, upper_yellow: HSV bounds for yellow.
        lower_green, upper_green: HSV bounds for green.
        closing_iterations: Closing iterations.
        dilation_iterations: Dilation iterations.

    Returns:
        Single-channel uint8 binary mask with 255 for annotated pixels and 0 for background.
    """
    # Override defaults if any optional params are provided; otherwise use constants.
    _lower_yellow = LOWER_YELLOW if lower_yellow is None else lower_yellow
    _upper_yellow = UPPER_YELLOW if upper_yellow is None else upper_yellow
    _lower_green  = LOWER_GREEN  if lower_green  is None else lower_green
    _upper_green  = UPPER_GREEN  if upper_green  is None else upper_green
    _closing_iter = CLOSING_ITERATIONS  if closing_iterations  is None else closing_iterations
    _dilation_iter = DILATION_ITERATIONS if dilation_iterations is None else dilation_iterations

    # --- Step 1: convert to HSV --- #
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

    # --- Step 2: colour masking --- #
    yellow_mask = cv2.inRange(hsv, _lower_yellow, _upper_yellow)
    green_mask  = cv2.inRange(hsv, _lower_green,  _upper_green)
    raw_mask = cv2.bitwise_or(yellow_mask, green_mask)

    # --- Step 3: morphological refinement --- #
    closing_kernel = np.ones(CLOSING_KERNEL_SIZE, dtype=np.uint8)
    refined_mask = cv2.morphologyEx(
        raw_mask,
        cv2.MORPH_CLOSE,
        closing_kernel,
        iterations=_closing_iter,
    )

    dilation_kernel = np.ones(DILATION_KERNEL_SIZE, dtype=np.uint8)
    final_mask = cv2.dilate(
        refined_mask,
        dilation_kernel,
        iterations=_dilation_iter,
    )

    return final_mask


def remove_annotations(
    image_bgr: np.ndarray,
    mask: np.ndarray,
    inpaint_radius: int | None = None,
) -> np.ndarray:
    """
    Reconstruct masked pixels using the TELEA inpainting algorithm.

    Args:
        image_bgr: Source image in BGR channel order, dtype uint8.
        mask: Binary mask from build_annotation_mask. Pixels at 255 are reconstructed.
        inpaint_radius: Override for src.constants.INPAINT_RADIUS. Defaults when None.

    Returns:
        Cleaned BGR image with same shape and dtype as input.
    """
    radius = INPAINT_RADIUS if inpaint_radius is None else inpaint_radius
    return cv2.inpaint(image_bgr, mask, radius, cv2.INPAINT_TELEA)


def process_pixel_array(
    pixel_array_rgb: np.ndarray,
    lower_yellow: np.ndarray | None = None,
    upper_yellow: np.ndarray | None = None,
    lower_green: np.ndarray | None = None,
    upper_green: np.ndarray | None = None,
    closing_iterations: int | None = None,
    dilation_iterations: int | None = None,
    inpaint_radius: int | None = None,
) -> dict[str, np.ndarray]:
    """
    Run the full annotation-removal pipeline on RGB pixel array.

    Primary entry point for callers with decoded pixel arrays (e.g. from DICOM).
    Returns dict with intermediate artifacts for reporting/visualization.
    All thresholds and radius params are optional; defaults from src.constants.

    Args:
        pixel_array_rgb: Raw pixel array, RGB order, dtype uint8, shape (H, W, 3).
        lower_yellow, upper_yellow: Optional HSV threshold overrides for yellow.
        lower_green, upper_green: Optional HSV threshold overrides for green.
        closing_iterations: Optional override for morphological closing iterations.
        dilation_iterations: Optional override for dilation iterations.
        inpaint_radius: Optional override for TELEA inpaint neighbourhood radius.

    Returns:
        Dictionary with keys: "original_bgr", "mask", "cleaned_bgr", "cleaned_rgb".
    """
    original_bgr = cv2.cvtColor(pixel_array_rgb, cv2.COLOR_RGB2BGR)
    mask = build_annotation_mask(
        original_bgr,
        lower_yellow=lower_yellow,
        upper_yellow=upper_yellow,
        lower_green=lower_green,
        upper_green=upper_green,
        closing_iterations=closing_iterations,
        dilation_iterations=dilation_iterations,
    )
    cleaned_bgr = remove_annotations(original_bgr, mask, inpaint_radius=inpaint_radius)
    cleaned_rgb = cv2.cvtColor(cleaned_bgr, cv2.COLOR_BGR2RGB)

    return {
        "original_bgr": original_bgr,
        "mask": mask,
        "cleaned_bgr": cleaned_bgr,
        "cleaned_rgb": cleaned_rgb,
    }
