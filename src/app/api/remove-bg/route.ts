/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/api/remove-bg/route.ts
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
    responseLimit: false, // Remove response size limit
  },
};

export async function POST(request: NextRequest) {
  try {
    // Process form data
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const quality = Number(formData.get("quality")) || 90;

    if (!imageFile) {
      return NextResponse.json(
        { message: "No image file provided" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();

    // Remove background specifically for bottle/product
    const noBackgroundBuffer = await removeBottleBackground(imageBuffer);

    // Optimize the image for size
    const optimizedBuffer = await optimizeProductImage(
      noBackgroundBuffer,
      quality
    );

    // Return as downloadable file
    return new NextResponse(optimizedBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="optimized-bottle.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error processing image:", error);
    return NextResponse.json(
      { message: "Failed to process image" },
      { status: 500 }
    );
  }
}

/**
 * Removes background specifically optimized for bottle/product images
 */
async function removeBottleBackground(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Check if REMOVE_BG_API_KEY is set
    const apiKey = process.env.REMOVE_BG_API_KEY;

    if (apiKey) {
      try {
        // Professional approach: Use RemoveBg API which works well for product photos
        const formData = new FormData();
        const blob = new Blob([imageBuffer]);
        formData.append("image_file", blob);
        formData.append("size", "auto");
        formData.append("format", "png");
        // Add specific parameters for product photos
        formData.append("add_shadow", "false");
        formData.append("type", "product"); // Specific parameter for product photos

        const response = await fetch("https://api.remove.bg/v1.0/removebg", {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey,
          },
          body: formData,
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (error) {
        console.warn(
          "Error using RemoveBg API, falling back to local processing:",
          error
        );
      }
    }

    // Step 1: Extract metadata
    const metadata = await sharp(imageBuffer).metadata();
    const { width = 800, height = 600 } = metadata;

    // Step 2: Convert to grayscale for processing
    const grayscaleBuffer = await sharp(imageBuffer).grayscale().toBuffer();

    // Step 3: Detect object edges
    const edgesBuffer = await sharp(grayscaleBuffer)
      .linear(1.5, -0.1) // Increase contrast
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
        scale: 1,
        offset: 128,
      })
      .toBuffer();

    // Step 4: Threshold to create a mask
    const thresholdBuffer = await sharp(edgesBuffer).threshold(128).toBuffer();

    // Step 5: Use color extraction to identify bottle area
    // Create orangish-yellow color mask to identify the bottle
    const { data, info } = await sharp(imageBuffer)
      .toColorspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width: imgWidth, height: imgHeight, channels } = info;
    const rawData = Buffer.alloc(imgWidth * imgHeight);

    // Extract pixels similar to orange juice color
    for (let i = 0; i < imgWidth * imgHeight; i++) {
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];

      // Detect orange/yellow colors (typical for juice)
      // High red and green (making yellow) and lower blue
      if (r > 150 && g > 100 && b < 100 && r > b * 1.5) {
        rawData[i] = 255; // White in the mask
      } else {
        rawData[i] = 0; // Black in the mask
      }
    }

    const colorMaskBuffer = await sharp(rawData, {
      raw: { width: imgWidth, height: imgHeight, channels: 1 },
    }).toBuffer();

    // Step 6: Combine edge detection and color detection
    const combinedMaskBuffer = await sharp(thresholdBuffer)
      .boolean(colorMaskBuffer, "or")
      .convolve({
        width: 3,
        height: 3,
        kernel: [
          1, 1, 1,
          1, 1, 1,
          1, 1, 1,
        ],
      }) // Expand the mask slightly to ensure full coverage
      .blur(2) // Smooth the edges
      .threshold(128) // Make binary again
      .toBuffer();

    // Step 7: Apply the mask to create transparent background
    const withTransparency = await sharp(imageBuffer)
      .ensureAlpha()
      .joinChannel(combinedMaskBuffer)
      .toBuffer();

    // Step 8: Optimize the final output - important for size reduction
    return await sharp(withTransparency)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: true, // Use palette-based PNG for smaller size
        quality: 90,
        effort: 10, // Maximum compression effort
        colors: 256, // Limit colors for smaller size
      })
      .toBuffer();
  } catch (error) {
    console.error("Error in bottle background removal:", error);

    // Simplest fallback approach if all else fails
    return await sharp(imageBuffer)
      .ensureAlpha()
      .extractChannel(3) // Extract alpha channel
      .linear(1.5, -0.1) // Increase contrast for better thresholding
      .threshold(240) // Simple threshold
      .joinChannel(imageBuffer) // Join with original
      .png()
      .toBuffer();
  }
}

/**
 * Optimizes product images for size while maintaining quality
 */
async function optimizeProductImage(
  buffer: Buffer,
  quality: number = 90
): Promise<Buffer> {
  try {
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const hasAlpha = metadata.hasAlpha || false;

    if (hasAlpha) {
      // Convert PNG with transparency to optimized PNG
      return await sharp(buffer)
        .resize({
          width: 1000, // Limit max dimension
          height: 1000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: true,
          quality: 90,
          effort: 10,
          colors: 256,
        })
        .toBuffer();
    } else {
      // For non-transparent images, WebP provides better compression
      return await sharp(buffer)
        .resize({
          width: 1000,
          height: 1000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality,
          alphaQuality: 100,
          lossless: quality > 95,
          nearLossless: quality > 90,
          smartSubsample: true,
          effort: 6,
        })
        .toBuffer();
    }
  } catch (error) {
    console.error("Error optimizing product image:", error);
    return buffer; // Return original if optimization fails
  }
}
