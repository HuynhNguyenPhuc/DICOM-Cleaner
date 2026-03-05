"""
app.py
======
Gradio web application for the DICOM annotation-removal tool.

Designed for clinical users (radiologists, sonographers).
All technical configuration is hidden behind two plain-language controls:

  - Detection Sensitivity: how aggressively yellow/green annotation pixels
    are identified.  "Balanced" is correct for the vast majority of scans.
  - Reconstruction Quality: how carefully the removed areas are filled in.
    "Precise" gives the best result; "Fast" is useful for quick previews.

Run
---
    python app.py
    # then open http://127.0.0.1:7860 in your browser
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import cv2
import gradio as gr
import numpy as np

from src.constants import INPAINT_RADIUS
from src.io import read_dicom, save_dicom, save_image
from src.processor import build_annotation_mask, process_pixel_array


_SENSITIVITY_PRESETS = {
    # level: (sv_min, y_hue_lo, y_hue_hi, g_hue_lo, g_hue_hi)
    1: (80,  22, 43,  42, 83),   # Conservative
    2: (60,  21, 44,  41, 84),   # Mild
    3: (40,  20, 45,  40, 85),   # Balanced (default)
    4: (20,  18, 47,  38, 87),   # Thorough
    5: (10,  15, 50,  35, 90),   # Aggressive
}

_QUALITY_PRESETS = {
    "Fast":     3,
    "Balanced": INPAINT_RADIUS,
    "Precise":  8,
}

_DEFAULT_SENSITIVITY = 3
_DEFAULT_QUALITY     = "Balanced"


def _resolve_params(sensitivity: int, quality: str):
    """Return the processor keyword-argument dict for the given presets."""
    sv_min, y_lo, y_hi, g_lo, g_hi = _SENSITIVITY_PRESETS[int(sensitivity)]
    radius = _QUALITY_PRESETS[quality]
    return dict(
        lower_yellow=np.array([y_lo, sv_min, sv_min], dtype=np.uint8),
        upper_yellow=np.array([y_hi, 255,    255],    dtype=np.uint8),
        lower_green =np.array([g_lo, sv_min, sv_min], dtype=np.uint8),
        upper_green =np.array([g_hi, 255,    255],    dtype=np.uint8),
        inpaint_radius=radius,
    )


def _get_path(upload) -> str | None:
    """Safely extract the filesystem path from whatever Gradio passes."""
    if upload is None:
        return None
    if isinstance(upload, str):
        return upload
    if isinstance(upload, dict):
        return upload.get("path") or upload.get("name")
    return getattr(upload, "name", getattr(upload, "path", str(upload)))


def _bgr_to_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def _gray_to_rgb(mask: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(mask, cv2.COLOR_GRAY2RGB)


def cb_detect(upload, sensitivity, quality):
    """Highlight annotation regions without modifying the image."""
    path = _get_path(upload)
    if path is None:
        return None, None, None, "Please upload a DICOM file first.", None, None

    try:
        _, pixel_array = read_dicom(path)
    except Exception as exc:
        return None, None, None, f"Could not open file: {exc}", None, None

    params   = _resolve_params(sensitivity, quality)
    orig_bgr = cv2.cvtColor(pixel_array, cv2.COLOR_RGB2BGR)
    mask     = build_annotation_mask(
        orig_bgr,
        lower_yellow=params["lower_yellow"],
        upper_yellow=params["upper_yellow"],
        lower_green =params["lower_green"],
        upper_green =params["upper_green"],
    )

    overlay = _bgr_to_rgb(orig_bgr).copy()
    overlay[mask == 255] = [220, 50, 50]

    n      = int(np.count_nonzero(mask))
    status = (
        f"**{n:,} annotation pixel(s) detected.** "
        f"If the highlighted areas look correct, click **Remove Annotations**. "
        f"Otherwise, adjust the Detection Sensitivity and try again."
    )

    return _bgr_to_rgb(orig_bgr), _gray_to_rgb(mask), overlay, status, None, None


def cb_clean(upload, sensitivity, quality):
    """Run the full annotation-removal pipeline and produce downloadable files."""
    path = _get_path(upload)
    if path is None:
        return None, None, None, "Please upload a DICOM file first.", None, None

    try:
        dicom_dataset, pixel_array = read_dicom(path)
    except Exception as exc:
        return None, None, None, f"Could not open file: {exc}", None, None

    params = _resolve_params(sensitivity, quality)

    try:
        artifacts = process_pixel_array(pixel_array, **params)
    except Exception as exc:
        return None, None, None, f"Processing failed: {exc}", None, None

    stem    = Path(path).stem
    tmp_dir = tempfile.mkdtemp(prefix="dicom_cleaner_")
    dcm_out = os.path.join(tmp_dir, f"{stem}_cleaned.dcm")
    png_out = os.path.join(tmp_dir, f"{stem}_cleaned.png")

    try:
        save_dicom(dicom_dataset, artifacts["cleaned_rgb"], dcm_out)
        save_image(artifacts["cleaned_bgr"], png_out)
    except Exception as exc:
        return None, None, None, f"Could not save files: {exc}", None, None

    n      = int(np.count_nonzero(artifacts["mask"]))
    status = (
        f"**Done.** {n:,} annotation pixel(s) removed. "
        f"Download the cleaned files using the buttons below."
    )

    return (
        _bgr_to_rgb(artifacts["original_bgr"]),
        _gray_to_rgb(artifacts["mask"]),
        _bgr_to_rgb(artifacts["cleaned_bgr"]),
        status,
        dcm_out,
        png_out,
    )


def cb_reset():
    return (
        None,
        None, None, None, "",
        None, None,
        _DEFAULT_SENSITIVITY,
        _DEFAULT_QUALITY,
    )


def cb_batch(uploads, sensitivity, quality):
    if not uploads:
        return [], []

    params  = _resolve_params(sensitivity, quality)
    tmp_dir = tempfile.mkdtemp(prefix="dicom_batch_")
    rows: list[list[str]] = []
    out_paths: list[str]  = []

    for upload in uploads:
        file_path = _get_path(upload)
        name      = os.path.basename(file_path or "")
        stem      = Path(file_path).stem if file_path else "file"

        try:
            dicom_dataset, pixel_array = read_dicom(file_path)
            artifacts = process_pixel_array(pixel_array, **params)

            dcm_out = os.path.join(tmp_dir, f"{stem}_cleaned.dcm")
            png_out = os.path.join(tmp_dir, f"{stem}_cleaned.png")
            save_dicom(dicom_dataset, artifacts["cleaned_rgb"], dcm_out)
            save_image(artifacts["cleaned_bgr"], png_out)

            n = int(np.count_nonzero(artifacts["mask"]))
            rows.append([name, "Done", f"{n:,}"])
            out_paths.extend([dcm_out, png_out])

        except Exception as exc:
            rows.append([name, f"Error: {exc}", "-"])

    return rows, out_paths


_THEME = gr.themes.Soft(primary_hue="blue", secondary_hue="slate")

_CSS = """
.step-box {
    background: #f0f7ff;
    border-left: 4px solid #2563eb;
    padding: 10px 14px;
    border-radius: 4px;
    margin-bottom: 6px;
}
.notice-box {
    background: #f0fdf4;
    border-left: 4px solid #16a34a;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 0.9rem;
}
.warn-box {
    background: #fff7ed;
    border-left: 4px solid #ea580c;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 0.9rem;
}
"""

with gr.Blocks(title="Ultrasound Annotation Remover", css=_CSS) as demo:

    gr.Markdown(
        "# Ultrasound Image Annotation Remover\n"
        "This tool removes **on-screen measurements, text labels, and markers** "
        "burned into ultrasound DICOM images. "
        "The cleaned image can be used for second-opinion review, AI analysis, or "
        "clean archiving. **Your original file is never modified.**"
    )

    with gr.Tabs():

        # ── Single Image tab ─────────────────────────────────────────────────
        with gr.TabItem("Single Image"):

            with gr.Row(equal_height=False):

                # Left column: workflow steps
                with gr.Column(scale=1, min_width=300):

                    gr.Markdown(
                        "<div class='step-box'>"
                        "<strong>Step 1 &mdash; Upload the scan</strong><br>"
                        "Select the DICOM file (.dcm) you want to clean."
                        "</div>"
                    )
                    upload = gr.File(
                        label="DICOM file (.dcm)",
                        file_types=[".dcm"],
                        file_count="single",
                    )

                    gr.Markdown(
                        "<div class='step-box' style='margin-top:12px'>"
                        "<strong>Step 2 &mdash; Adjust if needed</strong><br>"
                        "The default settings work for most scans. "
                        "Only change these if the result is not satisfactory."
                        "</div>"
                    )

                    sensitivity = gr.Slider(
                        minimum=1, maximum=5,
                        value=_DEFAULT_SENSITIVITY,
                        step=1,
                        label="Annotation Detection Sensitivity",
                        info=(
                            "How many annotation pixels to detect. "
                            "Increase if some labels remain after cleaning; "
                            "decrease if normal tissue is inadvertently removed."
                        ),
                    )
                    gr.Markdown(
                        "<div style='display:flex;justify-content:space-between;"
                        "font-size:0.78rem;color:#555;margin-top:-10px;margin-bottom:8px'>"
                        "<span>Conservative<br><small>(miss faint marks)</small></span>"
                        "<span style='text-align:center'>Balanced<br><small>(recommended)</small></span>"
                        "<span style='text-align:right'>Aggressive<br><small>(remove more)</small></span>"
                        "</div>"
                    )

                    quality = gr.Radio(
                        choices=list(_QUALITY_PRESETS.keys()),
                        value=_DEFAULT_QUALITY,
                        label="Fill-in Quality",
                        info=(
                            "How carefully the removed areas are reconstructed from surrounding tissue. "
                            "Use 'Balanced' for routine work and 'Precise' for final output."
                        ),
                    )

                    gr.Markdown(
                        "<div class='step-box' style='margin-top:12px'>"
                        "<strong>Step 3 &mdash; Preview, then clean</strong><br>"
                        "Click <em>Preview Detected Areas</em> first to verify what will be removed, "
                        "then click <em>Clean Image</em> to produce the final result."
                        "</div>"
                    )

                    with gr.Row():
                        btn_detect = gr.Button(
                            "Preview Detected Areas",
                            variant="secondary",
                            size="lg",
                        )
                        btn_clean = gr.Button(
                            "Clean Image",
                            variant="primary",
                            size="lg",
                        )
                    btn_reset = gr.Button("Start Over", variant="stop", size="sm")

                    gr.Markdown(
                        "<div class='notice-box'>"
                        "The original DICOM file is not modified. "
                        "Cleaned files are only available for download after clicking <em>Clean Image</em>."
                        "</div>"
                    )

                # Right column: image panels + downloads
                with gr.Column(scale=2):

                    status_md = gr.Markdown(
                        "**Waiting for input.** "
                        "Upload a DICOM file and click **Preview Detected Areas** to begin."
                    )

                    with gr.Row():
                        img_orig = gr.Image(
                            label="Original Scan",
                        )
                        img_mask = gr.Image(
                            label="Areas Detected for Removal",
                        )
                        img_result = gr.Image(
                            label="Cleaned Scan",
                        )

                    gr.Markdown("##### Download cleaned files")
                    gr.Markdown(
                        "<small>Available after clicking <strong>Clean Image</strong>.</small>"
                    )
                    with gr.Row():
                        dl_dcm = gr.File(label="Cleaned DICOM (.dcm)")
                        dl_png = gr.File(label="Preview Image (.png)")

            # Wiring
            _ctrl_inputs   = [upload, sensitivity, quality]
            _image_outputs = [img_orig, img_mask, img_result, status_md, dl_dcm, dl_png]

            btn_detect.click(fn=cb_detect, inputs=_ctrl_inputs, outputs=_image_outputs)
            btn_clean.click( fn=cb_clean,  inputs=_ctrl_inputs, outputs=_image_outputs)
            btn_reset.click(
                fn=cb_reset,
                inputs=[],
                outputs=[upload] + _image_outputs + [sensitivity, quality],
            )

        # ── Batch Processing tab ─────────────────────────────────────────────
        with gr.TabItem("Batch Processing"):

            gr.Markdown(
                "## Process Multiple Scans at Once\n"
                "Upload all DICOM files you want to clean. "
                "The same settings will be applied to every file. "
                "All cleaned files can be downloaded together when processing is complete."
            )

            with gr.Row():
                with gr.Column(scale=1, min_width=300):

                    gr.Markdown("#### Settings")

                    batch_upload = gr.File(
                        label="DICOM Files (.dcm)  —  select one or more",
                        file_types=[".dcm"],
                        file_count="multiple",
                    )

                    batch_sensitivity = gr.Slider(
                        minimum=1, maximum=5,
                        value=_DEFAULT_SENSITIVITY,
                        step=1,
                        label="Annotation Detection Sensitivity",
                    )
                    gr.Markdown(
                        "<div style='display:flex;justify-content:space-between;"
                        "font-size:0.78rem;color:#555;margin-top:-10px;margin-bottom:8px'>"
                        "<span>Conservative</span>"
                        "<span>Balanced</span>"
                        "<span>Aggressive</span>"
                        "</div>"
                    )

                    batch_quality = gr.Radio(
                        choices=list(_QUALITY_PRESETS.keys()),
                        value=_DEFAULT_QUALITY,
                        label="Fill-in Quality",
                    )

                    btn_batch = gr.Button(
                        "Clean All Files",
                        variant="primary",
                        size="lg",
                    )

                    gr.Markdown(
                        "<div class='notice-box'>"
                        "Original files are never modified. "
                        "Cleaned copies are generated separately and available for download below."
                        "</div>"
                    )

                with gr.Column(scale=2):
                    gr.Markdown("#### Processing Summary")
                    batch_table = gr.Dataframe(
                        headers=["File", "Status", "Pixels Removed"],
                        datatype=["str", "str", "str"],
                        label="Results",
                        wrap=True,
                    )
                    gr.Markdown("#### Download Results")
                    batch_dl = gr.File(
                        label="Cleaned Files (DICOM + PNG for each scan)",
                        file_count="multiple",
                    )

            btn_batch.click(
                fn=cb_batch,
                inputs=[batch_upload, batch_sensitivity, batch_quality],
                outputs=[batch_table, batch_dl],
            )


if __name__ == "__main__":
    demo.launch(theme=_THEME)