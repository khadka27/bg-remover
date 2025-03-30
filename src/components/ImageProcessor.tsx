/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Check,
  AlertTriangle,
  Loader2,
  Download,
  Upload,
  Trash2,
  Sparkles,
  Sliders,
  ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDropzone } from "react-dropzone";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function ImageProcessor() {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageDetails, setImageDetails] = useState<{
    name: string;
    size: number;
    width?: number;
    height?: number;
  } | null>(null);

  const [qualityLevel, setQualityLevel] = useState(90);
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [compressedSize, setCompressedSize] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("original");
  const [isMobile, setIsMobile] = useState(false);

  const downloadRef = useRef<HTMLAnchorElement>(null);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Auto-switch to processed tab when processing completes
  useEffect(() => {
    if (processedImage && !isProcessing) {
      setActiveTab("processed");
    }
  }, [processedImage, isProcessing]);

  const resetState = () => {
    setOriginalImage(null);
    setProcessedImage(null);
    setCompressedImage(null);
    setCompressedSize(null);
    setError(null);
    setImageDetails(null);
    setActiveTab("original");
  };

  const processImage = useCallback(
    async (file: File) => {
      try {
        setIsUploading(true);
        setError(null);

        // Get original image dimensions
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = objectUrl;
        });

        // Store original image details
        setImageDetails({
          name: file.name,
          size: file.size,
          width: img.width,
          height: img.height,
        });

        setOriginalImage(objectUrl);

        setIsUploading(false);
        setIsProcessing(true);

        // Create form data for the API
        const formData = new FormData();
        formData.append("image", file);
        formData.append("quality", qualityLevel.toString());

        // Call the API to remove background
        const response = await fetch("/api/remove-bg", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: "Unknown error" }));
          throw new Error(
            errorData.message || `Failed to process image: ${response.status}`
          );
        }

        // Get processed image as blob
        const blob = await response.blob();
        const processedUrl = URL.createObjectURL(blob);

        setProcessedImage(processedUrl);
        setCompressedImage(processedUrl);
        setCompressedSize(blob.size);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to process image"
        );
        console.error(err);
      } finally {
        setIsProcessing(false);
      }
    },
    [qualityLevel]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: useCallback(
        (acceptedFiles: File[]) => {
          setError(null);
          resetState();

          if (acceptedFiles.length === 0) return;

          const file = acceptedFiles[0];

          // Check file type
          if (!file.type.startsWith("image/")) {
            setError("Please upload an image file");
            return;
          }

          // Check file size
          if (file.size > MAX_FILE_SIZE) {
            setError(
              `File too large. Maximum size is ${
                MAX_FILE_SIZE / (1024 * 1024)
              }MB`
            );
            return;
          }

          processImage(file);
        },
        [processImage]
      ),
      accept: {
        "image/*": [
          ".jpeg",
          ".jpg",
          ".png",
          ".gif",
          ".webp",
          ".avif",
          ".tiff",
          ".bmp",
          ".heic",
        ],
      },
      maxSize: MAX_FILE_SIZE,
      multiple: false,
    });

  // Preserve transparency for PNG images
  const compressImage = useCallback(
    async (quality: number) => {
      if (!processedImage) return;

      try {
        const img = new Image();

        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = processedImage;
        });

        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) return;

        // Clear canvas with transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw image preserving transparency
        ctx.drawImage(img, 0, 0);

        // Check if the image has transparency
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hasTransparency = hasTransparentPixels(imageData);

        let dataUrl;
        let mimeType;

        if (hasTransparency) {
          // Use PNG for transparent images
          dataUrl = canvas.toDataURL("image/png");
          mimeType = "image/png";
        } else {
          // Use WebP for better compression on non-transparent images
          dataUrl = canvas.toDataURL("image/webp", quality / 100);
          mimeType = "image/webp";
        }

        // Estimate size from base64 string
        const base64 = dataUrl.split(",")[1];
        const size = Math.ceil((base64.length * 3) / 4);

        setCompressedImage(dataUrl);
        setCompressedSize(size);
      } catch (error) {
        console.error("Error compressing image:", error);
      }
    },
    [processedImage]
  );

  // Helper function to check if image has transparent pixels
  const hasTransparentPixels = (imageData: ImageData): boolean => {
    const data = imageData.data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) {
        return true;
      }
    }
    return false;
  };

  const handleQualityChange = useCallback(
    (value: number[]) => {
      const quality = value[0];
      setQualityLevel(quality);
      compressImage(quality);
    },
    [compressImage]
  );

  const handleDownload = useCallback(() => {
    if (!compressedImage || !imageDetails) return;

    // Create download link
    const link = downloadRef.current;
    if (!link) return;

    // Determine if image has transparency by checking the data URL
    const isTransparent = compressedImage.startsWith("data:image/png");
    const extension = isTransparent ? "png" : "webp";

    // Set download attributes
    link.href = compressedImage;
    link.download = `bg-removed-${
      imageDetails.name.split(".")[0]
    }-q${qualityLevel}.${extension}`;
    link.click();
  }, [compressedImage, imageDetails, qualityLevel]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!originalImage ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            key="upload"
          >
            <div
              {...getRootProps()}
              className={`
                p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all
                flex flex-col items-center justify-center min-h-[280px]
                ${
                  isDragActive && !isDragReject
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                    : "border-slate-300 dark:border-slate-700"
                }
                ${
                  isDragReject
                    ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                    : ""
                }
                hover:border-blue-400 dark:hover:border-blue-600
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-full blur-xl opacity-70"></div>
                  <div className="relative bg-white dark:bg-slate-800 rounded-full p-4 shadow-md">
                    <Upload className="w-10 h-10 text-blue-500" />
                  </div>
                </div>
                <h3 className="text-xl font-medium mt-2">
                  {isDragActive
                    ? isDragReject
                      ? "This file is not supported"
                      : "Drop to upload..."
                    : "Upload your image"}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                  Drag & drop an image here, or click to select one from your
                  device
                </p>
                <div className="flex flex-wrap justify-center gap-1 mt-2">
                  {["JPG", "PNG", "WebP", "AVIF"].map((format) => (
                    <Badge key={format} variant="secondary" className="text-xs">
                      {format}
                    </Badge>
                  ))}
                  <Badge variant="secondary" className="text-xs">
                    Max 20MB
                  </Badge>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            key="results"
            className="space-y-6"
          >
            <div className="flex justify-between items-center">
              <div className="space-y-1">
                <h2 className="text-xl font-bold">Image Processing</h2>
                {imageDetails && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {imageDetails.name.length > 25
                      ? imageDetails.name.substring(0, 22) + "..."
                      : imageDetails.name}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={resetState}
                className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 dark:text-red-400"
              >
                <Trash2 size={16} className="mr-1" />
                <span className="hidden sm:inline">Start Over</span>
              </Button>
            </div>

            {/* Status indicators */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1">
                <Check size={14} className="text-green-600" />
                <span>Uploaded</span>
              </Badge>

              {isProcessing ? (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300"
                >
                  <Loader2
                    size={14}
                    className="animate-spin text-blue-600 dark:text-blue-400"
                  />
                  <span>Processing...</span>
                </Badge>
              ) : processedImage ? (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300"
                >
                  <Sparkles
                    size={14}
                    className="text-green-600 dark:text-green-400"
                  />
                  <span>Background Removed</span>
                </Badge>
              ) : null}
            </div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
                    <AlertTriangle size={20} />
                    <span>{error}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Image details - mobile view */}
            {isMobile && imageDetails && (
              <Card className="overflow-hidden bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1">
                      <ImageIcon size={14} className="text-slate-400" />
                      <span className="text-slate-600 dark:text-slate-300">
                        {imageDetails.width} × {imageDetails.height}px
                      </span>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-slate-600 dark:text-slate-300">
                        {(imageDetails.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Image comparison - Mobile uses tabs, desktop uses side-by-side */}
            {isMobile ? (
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <TabsList className="grid grid-cols-2 mb-4">
                  <TabsTrigger value="original">Original</TabsTrigger>
                  <TabsTrigger value="processed">Processed</TabsTrigger>
                </TabsList>

                <TabsContent value="original" className="mt-0">
                  <div className="relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 aspect-square">
                    {isUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2
                          size={32}
                          className="animate-spin text-slate-400"
                        />
                      </div>
                    ) : originalImage ? (
                      <img
                        src={originalImage || "/placeholder.svg"}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="processed" className="mt-0">
                  <div className="relative rounded-lg overflow-hidden bg-grid aspect-square">
                    {isProcessing ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <Loader2
                          size={32}
                          className="animate-spin text-blue-500 mb-2"
                        />
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Removing background...
                        </p>
                      </div>
                    ) : compressedImage ? (
                      <>
                        <img
                          src={compressedImage || "/placeholder.svg"}
                          alt="Processed"
                          className="w-full h-full object-contain"
                        />
                        {compressedSize && (
                          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                            {(compressedSize / 1024 / 1024).toFixed(2)} MB
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-2 flex items-center">
                    <ImageIcon size={18} className="mr-2 text-slate-500" />
                    Original
                  </h3>
                  <div className="relative rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 aspect-square">
                    {isUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2
                          size={32}
                          className="animate-spin text-slate-400"
                        />
                      </div>
                    ) : originalImage ? (
                      <img
                        src={originalImage || "/placeholder.svg"}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    ) : null}

                    {/* Image details overlay - desktop */}
                    {imageDetails && !isUploading && (
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded flex items-center gap-1">
                        <span>
                          {imageDetails.width} × {imageDetails.height}px
                        </span>
                        <span className="mx-1">•</span>
                        <span>
                          {(imageDetails.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2 flex items-center">
                    <Sparkles size={18} className="mr-2 text-blue-500" />
                    Background Removed
                  </h3>
                  <div className="relative rounded-lg overflow-hidden bg-grid aspect-square">
                    {isProcessing ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <Loader2
                          size={32}
                          className="animate-spin text-blue-500 mb-2"
                        />
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Removing background...
                        </p>
                      </div>
                    ) : compressedImage ? (
                      <>
                        <img
                          src={compressedImage || "/placeholder.svg"}
                          alt="Processed"
                          className="w-full h-full object-contain"
                        />
                        {compressedSize && (
                          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                            {(compressedSize / 1024 / 1024).toFixed(2)} MB
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {/* Quality settings and download - only show when processing is complete */}
            {processedImage && !isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-6"
              >
                <Card className="overflow-hidden border-slate-200 dark:border-slate-700">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Sliders size={18} className="text-slate-500" />
                      <h3 className="text-lg font-medium">Image Quality</h3>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Slider
                          defaultValue={[qualityLevel]}
                          max={100}
                          min={10}
                          step={1}
                          onValueChange={handleQualityChange}
                          className="w-full"
                        />
                      </div>
                      <div className="w-12 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded font-medium">
                        {qualityLevel}%
                      </div>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      Higher quality = larger file size
                    </p>
                  </CardContent>
                </Card>

                <Button
                  onClick={handleDownload}
                  className="w-full py-6 text-lg"
                  size="lg"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download Image
                </Button>

                {/* Hidden download link */}
                <a ref={downloadRef} className="hidden"></a>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .bg-grid {
          background-color: #f8f8f8;
          background-image: linear-gradient(45deg, #eaeaea 25%, transparent 25%),
            linear-gradient(-45deg, #eaeaea 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #eaeaea 75%),
            linear-gradient(-45deg, transparent 75%, #eaeaea 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        }

        @media (prefers-color-scheme: dark) {
          .bg-grid {
            background-color: #1e1e1e;
            background-image: linear-gradient(
                45deg,
                #2a2a2a 25%,
                transparent 25%
              ),
              linear-gradient(-45deg, #2a2a2a 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #2a2a2a 75%),
              linear-gradient(-45deg, transparent 75%, #2a2a2a 75%);
          }
        }
      `}</style>
    </div>
  );
}
