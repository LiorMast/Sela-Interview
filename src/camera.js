/**
 * Camera Utility
 * Handles HTML5 webcam streaming, frame capture, and permission handling.
 */
export class CameraManager {
  constructor(videoElementId) {
    this.videoElement = document.getElementById(videoElementId);
    this.stream = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  /**
   * Request webcam access and bind stream to video element
   * @returns {Promise<boolean>} Resolves to true if successful, false otherwise
   */
  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Webcam API is not supported in this browser.');
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user'
        },
        audio: false
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        // Wait for metadata to load before playing
        await new Promise((resolve) => {
          this.videoElement.onloadedmetadata = () => {
            this.videoElement.play();
            resolve();
          };
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error accessing webcam:', error);
      return false;
    }
  }

  /**
   * Stop the current camera stream to release webcam hardware
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Capture a square snapshot of the current frame and return it as a Base64 string
   * @param {number} size Output square dimensions (default 512x512)
   * @returns {string|null} Data URL of the captured JPEG image, or null if camera is not active
   */
  capture(size = 512) {
    if (!this.stream || !this.videoElement || this.videoElement.paused) {
      return null;
    }

    this.canvas.width = size;
    this.canvas.height = size;

    const videoWidth = this.videoElement.videoWidth;
    const videoHeight = this.videoElement.videoHeight;
    const minDim = Math.min(videoWidth, videoHeight);

    // Crop source video to a center square
    const sx = (videoWidth - minDim) / 2;
    const sy = (videoHeight - minDim) / 2;

    // Clear canvas
    this.ctx.clearRect(0, 0, size, size);

    // Apply mirror effect for natural-feeling selfie capture
    this.ctx.translate(size, 0);
    this.ctx.scale(-1, 1);

    // Draw the cropped frame onto the square canvas
    this.ctx.drawImage(
      this.videoElement,
      sx, sy, minDim, minDim, // source dimensions (center square)
      0, 0, size, size         // destination dimensions
    );

    // Reset translation/scale matrix
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Return JPEG Data URL (highly optimized compression)
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }
}
