import pydicom
import cv2
import numpy as np
import matplotlib.pyplot as plt
import os
import argparse
from pydicom.uid import ExplicitVRLittleEndian


# Define color ranges for yellow
LOWER_YELLOW = np.array([20, 40, 40])
UPPER_YELLOW = np.array([45, 255, 255])

# Define color ranges for green
LOWER_GREEN = np.array([40, 40, 40])
UPPER_GREEN = np.array([85, 255, 255])

def process_dicom_image(
    input_path: str, 
    dicom_output_path: str, 
    image_output_path: str, 
    visualize: bool = True
):
    """
    Read a DICOM file, remove yellow annotations, and save the cleaned result.
    """
    print(f"Processing DICOM file: {input_path}")

    # --- Read a DICOM file --- #
    try:
        dicom_dataset = pydicom.dcmread(input_path)
    except Exception as e:
        print(f"Warning: Could not read {os.path.basename(input_path)} as a DICOM file. Skipping. Details: {e}")
        return

    pixel_array = dicom_dataset.pixel_array
    image_bgr = cv2.cvtColor(pixel_array, cv2.COLOR_RGB2BGR)

    # Convert to HSV color space
    hsv_image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)
    
    # Create a mask for yellow regions
    yellow_mask = cv2.inRange(hsv_image, LOWER_YELLOW, UPPER_YELLOW)

    # Create a mask for green regions
    green_mask = cv2.inRange(hsv_image, LOWER_GREEN, UPPER_GREEN)

    # Combine the two masks
    combined_mask = cv2.bitwise_or(yellow_mask, green_mask)

    # Refine the combined mask using a two-step morphological process
    closing_kernel = np.ones((3, 3), np.uint8)
    mask_after_closing = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, closing_kernel, iterations=2)
    
    dilation_kernel = np.ones((3, 3), np.uint8)
    final_mask = cv2.dilate(mask_after_closing, dilation_kernel, iterations=1)

    # Apply inpainting to remove the masked regions
    cleaned_image_bgr = cv2.inpaint(image_bgr, final_mask, 5, cv2.INPAINT_TELEA)

    # --- Prepare data for new DICOM file --- #
    cleaned_image_rgb = cv2.cvtColor(cleaned_image_bgr, cv2.COLOR_BGR2RGB)
    dicom_dataset.PixelData = cleaned_image_rgb.tobytes()
    dicom_dataset.Rows, dicom_dataset.Columns, _ = cleaned_image_rgb.shape
    dicom_dataset.PhotometricInterpretation = "RGB"
    dicom_dataset.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    
    # --- Save the output files --- #
    try:
        dicom_dataset.save_as(dicom_output_path)
        print(f"✅ Saved cleaned DICOM to: {dicom_output_path}")
        
        cv2.imwrite(image_output_path, cleaned_image_bgr)
        print(f"✅ Saved cleaned PNG to: {image_output_path}")

    except Exception as e:
        print(f"Error: Could not save output files. Details: {e}")
        return

    # --- Visualize the results --- #
    if visualize:
        plt.style.use('dark_background')
        fig, axes = plt.subplots(1, 3, figsize=(18, 6))
        
        axes[0].imshow(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
        axes[0].set_title('Original Image')
        axes[0].axis('off')

        axes[1].imshow(final_mask, cmap='gray')
        axes[1].set_title('Final Mask')
        axes[1].axis('off')

        axes[2].imshow(cleaned_image_rgb)
        axes[2].set_title('Cleaned Image')
        axes[2].axis('off')
        
        plt.suptitle(f'Processing Result for: {os.path.basename(input_path)}', fontsize=16)
        plt.tight_layout()
        plt.show()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean yellow annotations from DICOM images.")
    
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        '--input_path', 
        type=str, 
        help="Path to a single input DICOM file."
    )
    input_group.add_argument(
        '--input_dir', 
        type=str, 
        help="Path to a directory containing DICOM files."
    )
    
    parser.add_argument(
        '--output_dir', 
        type=str, 
        required=True, 
        help="Path to the output directory where cleaned files will be saved."
    )

    parser.add_argument(
        '--visualize', 
        action='store_true', 
        dest='visualize',
        help="Visualize the processing results for each DICOM file."
    )

    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    input_file_paths = []
    if args.input_path:
        if os.path.isfile(args.input_path):
            input_file_paths.append(args.input_path)
        else:
            print(f"Error: Input file not found at '{args.input_path}'")
    elif args.input_dir:
        if os.path.isdir(args.input_dir):
            for filename in os.listdir(args.input_dir):
                input_file_paths.append(os.path.join(args.input_dir, filename))
        else:
            print(f"Error: Input directory not found at '{args.input_dir}'")

    for file_path in input_file_paths:
        print("-" * 60)
        base_filename = os.path.splitext(os.path.basename(file_path))[0]
        
        dicom_out = os.path.join(args.output_dir, f"{base_filename}.dcm")
        image_out = os.path.join(args.output_dir, f"{base_filename}.png")
        
        process_dicom_image(file_path, dicom_out, image_out, args.visualize)