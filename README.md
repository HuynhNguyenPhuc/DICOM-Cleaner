# DICOM Cleaner

A Python script to automatically detect and remove yellow and green annotations (such as text, markers, and measurement lines) from medical DICOM images, particularly ultrasound scans. The tool saves the cleaned image as both a new DICOM file and a standard PNG image.

## Setup & Installation

1.  **Prerequisites**: Ensure you have Python 3.7 or newer installed.

2.  **Clone the repository or download the script**:
    ```bash
    git clone <your-repo-url>
    cd <your-repo-directory>
    ```

3.  **Create a virtual environment** (recommended):
    ```bash
    python -m venv venv
    source venv/bin/activate
    ```

4.  **Install the required packages** using the provided `requirements.txt` file:
    ```bash
    pip install -r requirements.txt
    ```

## Usage

The script is run from the command line and requires an input source (either a single file or a directory) and an output directory.

### Command-Line Arguments

-   `--input_path <path>`: Path to a single DICOM file.
-   `--input_dir <path>`: Path to a directory containing DICOM files.
-   `--output_dir <path>`: Path to the directory where cleaned files will be saved. The script will create this directory if it doesn't exist.
-   `--visualize`: (Optional) Add this flag to display a Matplotlib window showing the before-and-after results for each image.

> **Note**: You must provide either `--input_path` or `--input_dir`, but not both.

### Examples

#### 1. Processing a Single File

This command will process `ultrasound.dcm` and save `ultrasound.dcm` and `ultrasound.png` into the `cleaned_images` directory.

```bash
python main.py --input_path data/ultrasound.dcm --output_dir cleaned_images
```

#### 2. Processing a Single File with Visualization

This will do the same as above but also open a plot window showing the result.

```bash
python main.py --input_path data/ultrasound.dcm --output_dir cleaned_images --visualize
```

#### 3. Processing an Entire Directory

This command will find all files in the `raw_dicom_scans` directory, process each one, and save the corresponding cleaned files into the `processed_scans` directory.

```bash
python main.py --input_dir raw_dicom_scans --output_dir processed_scans
```