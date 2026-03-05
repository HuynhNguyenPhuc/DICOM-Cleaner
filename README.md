# DICOM Cleaner

A Python tool to automatically detect and remove yellow and green annotations (such as text, markers, and measurement lines) from medical DICOM images, particularly ultrasound scans. For each processed file it produces a cleaned DICOM file that preserves all original metadata alongside a PNG preview image.

## Project Structure

```
dicom-processor/
├── app.py               # CLI entry point – run this file
├── requirements.txt     # Python dependencies
├── assets/              # Sample / input DICOM files
├── results/             # Default output directory
├── docs/
│   └── ALGORITHM.md     # Glossary and algorithm description
└── src/
   ├── constants.py     # HSV colour ranges, morphological & inpainting params
   ├── io.py            # DICOM / image reading and writing helpers
   └── processor.py     # Core image-processing pipeline
```

### Module responsibilities

| Module | Responsibility |
|---|---|
| `app.py` | Gradio web UI, per-file orchestration, human-in-the-loop workflow |
| `src/constants.py` | All hard-coded configuration values and colour thresholds |
| `src/io.py` | Reading DICOM files, collecting input paths, saving DICOM / PNG output |
| `src/processor.py` | HSV masking, morphological refinement, TELEA inpainting |

## Setup & Installation

1. **Prerequisites**: Python 3.10 or newer.

2. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

3. **Create a virtual environment** (recommended):
   ```bash
   python -m venv .venv
   # Windows
   .venv\Scripts\activate
   # macOS / Linux
   source .venv/bin/activate
   ```

4. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Application

```bash
python app.py
```

Then open **http://127.0.0.1:7860** in your browser.

Note:
- Section divider comments and visual separators were removed from the source
   code to improve readability.
- Project docstrings were standardised to use the `Args:` / `Returns:` style.

### Single File workflow (human-in-the-loop)

1. **Upload** a `.dcm` file in the *Single File* tab.
2. Click **👁️ Preview Mask** — the annotation mask is shown instantly (no inpainting). Check whether yellow/green regions are fully captured.
3. If needed, expand **⚙️ Threshold Settings** and adjust the hue sliders, then preview again.
4. Click **✨ Clean Image** — the full pipeline runs and the before/after comparison appears.
5. Download the cleaned **DICOM** and/or **PNG** files.

### Batch processing

1. Switch to the *Batch* tab.
2. Upload multiple `.dcm` files.
3. Click **⚡ Process All** — each file is processed with default thresholds.
4. Review the results table (filename / status / annotation pixel count).
5. Download individual cleaned files from the list that appears.

> **Tip:** Use the *Single File* tab to verify the default thresholds work for your dataset before running a large batch.