from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import numpy as np
import cv2
import base64
import os
from io import BytesIO

# Import from local modules (which were previously in src)
from constants import INPAINT_RADIUS
from io_utils import read_dicom, save_dicom, save_image
from processor import build_annotation_mask, process_pixel_array

app = FastAPI(title="DICOM Processor API", description="API for Clinical DICOM Annotation Removal")

# Configure CORS so the React frontend can call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_SENSITIVITY_PRESETS = {
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

def _resolve_params(sensitivity: int, quality: str):
    sv_min, y_lo, y_hi, g_lo, g_hi = _SENSITIVITY_PRESETS[int(sensitivity)]
    radius = _QUALITY_PRESETS[quality]
    return dict(
        lower_yellow=np.array([y_lo, sv_min, sv_min], dtype=np.uint8),
        upper_yellow=np.array([y_hi, 255,    255],    dtype=np.uint8),
        lower_green =np.array([g_lo, sv_min, sv_min], dtype=np.uint8),
        upper_green =np.array([g_hi, 255,    255],    dtype=np.uint8),
        inpaint_radius=radius,
    )

def _encode_image_base64(img: np.ndarray, is_bgr=True) -> str:
    if is_bgr:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    # Encode as PNG
    _, buffer = cv2.imencode('.png', cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    b64_str = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/png;base64,{b64_str}"

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/preview")
async def preview_annotations(
    file: UploadFile = File(...),
    sensitivity: int = Form(3),
    quality: str = Form("Balanced")
):
    try:
        content = await file.read()
        os.makedirs('temp', exist_ok=True)
        tmp_path = os.path.join('temp', file.filename)
        with open(tmp_path, "wb") as f:
            f.write(content)

        _, pixel_array = read_dicom(tmp_path)
        params = _resolve_params(sensitivity, quality)
        
        orig_bgr = cv2.cvtColor(pixel_array, cv2.COLOR_RGB2BGR)
        mask = build_annotation_mask(
            orig_bgr,
            lower_yellow=params["lower_yellow"],
            upper_yellow=params["upper_yellow"],
            lower_green=params["lower_green"],
            upper_green=params["upper_green"],
        )

        overlay = cv2.cvtColor(orig_bgr, cv2.COLOR_BGR2RGB).copy()
        overlay[mask == 255] = [220, 50, 50]
        
        n = int(np.count_nonzero(mask))
        status = (
            f"<div class='status-detected'>🔴 <strong>{n:,} pixel(s) detected.</strong> "
            f"Review the highlighted areas. Click <strong>✨ Remove & Save</strong> to proceed.</div>"
        )
        
        return {
            "orig_url": _encode_image_base64(orig_bgr, is_bgr=True),
            "overlay_url": _encode_image_base64(overlay, is_bgr=False),
            "status": status,
            "filename": file.filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/clean")
async def clean_dicom(
    file: UploadFile = File(...),
    sensitivity: int = Form(3),
    quality: str = Form("Balanced")
):
    try:
        content = await file.read()
        os.makedirs('temp', exist_ok=True)
        tmp_path = os.path.join('temp', file.filename)
        with open(tmp_path, "wb") as f:
            f.write(content)

        dicom_dataset, pixel_array = read_dicom(tmp_path)
        params = _resolve_params(sensitivity, quality)
        artifacts = process_pixel_array(pixel_array, **params)
        
        n = int(np.count_nonzero(artifacts["mask"]))
        status = (
            f"<div class='status-done'>✅ <strong>Done.</strong> {n:,} pixel(s) removed. "
            f"Review the result below. <em>Always verify against original.</em></div>"
        )
        
        return {
            "orig_url": _encode_image_base64(artifacts["original_bgr"], is_bgr=True),
            "cleaned_url": _encode_image_base64(artifacts["cleaned_bgr"], is_bgr=True),
            "status": status,
            "filename": file.filename
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.remove(tmp_path)


@app.post("/api/batch")
async def batch_clean(
    files: list[UploadFile] = File(...),
    sensitivity: int = Form(3),
    quality: str = Form("Balanced")
):
    results = []
    params = _resolve_params(sensitivity, quality)
    
    for file in files:
        try:
            content = await file.read()
            os.makedirs('temp', exist_ok=True)
            tmp_path = os.path.join('temp', file.filename)
            with open(tmp_path, "wb") as f:
                f.write(content)

            _, pixel_array = read_dicom(tmp_path)
            artifacts = process_pixel_array(pixel_array, **params)
            
            n = int(np.count_nonzero(artifacts["mask"]))
            results.append({
                "filename": file.filename,
                "status": "done",
                "pixelsRemoved": n
            })
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "error",
                "errorMsg": str(e)
            })
        finally:
            if 'tmp_path' in locals() and os.path.exists(tmp_path):
                os.remove(tmp_path)
                
    return {"results": results}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
