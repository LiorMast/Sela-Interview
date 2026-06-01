/**
 * Avatar Generator Utility
 * Handles both procedural vector avatar rendering and Google Gemini API (Flash + Imagen 3) generation.
 */
export class AvatarGenerator {
  /**
   * Generates a local procedural cartoon avatar by analyzing skin and hair tones from the webcam capture.
   * @param {string|null} photoDataUrl Base64 photo Data URL (or null for default randomized avatar)
   * @returns {string} Base64 PNG Data URL of the circular emoji avatar
   */
  static generateProcedural(photoDataUrl) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Default aesthetic colors
    let skinColor = '#ffd0a1';
    let hairColor = '#3a2512';
    let eyeColor = '#1e293b';
    let isDarkBackground = false;

    // 1. Analyze dominant colors if photo is provided
    if (photoDataUrl) {
      try {
        const img = new Image();
        img.src = photoDataUrl;
        
        // Use synchronous analysis by creating a tiny 16x16 offscreen canvas to sample pixels
        const analysisCanvas = document.createElement('canvas');
        analysisCanvas.width = 16;
        analysisCanvas.height = 16;
        const actx = analysisCanvas.getContext('2d');
        
        // Draw the image synchronously (it is a Data URL, so it's already in memory)
        actx.drawImage(img, 0, 0, 16, 16);
        const imgData = actx.getImageData(0, 0, 16, 16).data;

        // Sample skin tone in the center-bottom region (y = 8..11, x = 6..10)
        let rSkin = 0, gSkin = 0, bSkin = 0, countSkin = 0;
        for (let y = 8; y <= 11; y++) {
          for (let x = 6; x <= 10; x++) {
            const idx = (y * 16 + x) * 4;
            rSkin += imgData[idx];
            gSkin += imgData[idx + 1];
            bSkin += imgData[idx + 2];
            countSkin++;
          }
        }
        
        // Sample hair/background in the top region (y = 1..3, x = 4..12)
        let rHair = 0, gHair = 0, bHair = 0, countHair = 0;
        for (let y = 1; y <= 3; y++) {
          for (let x = 4; x <= 12; x++) {
            const idx = (y * 16 + x) * 4;
            rHair += imgData[idx];
            gHair += imgData[idx + 1];
            bHair += imgData[idx + 2];
            countHair++;
          }
        }

        if (countSkin > 0) {
          const r = Math.round(rSkin / countSkin);
          const g = Math.round(gSkin / countSkin);
          const b = Math.round(bSkin / countSkin);
          // Standard validation to make sure skin tone is in a pleasant cartoon range
          // If too grey or dark, we warm it up
          if (r + g + b < 100) {
            skinColor = '#8d5524';
          } else {
            skinColor = `rgb(${r}, ${g}, ${b})`;
          }
        }

        if (countHair > 0) {
          const r = Math.round(rHair / countHair);
          const g = Math.round(gHair / countHair);
          const b = Math.round(bHair / countHair);
          hairColor = `rgb(${r}, ${g}, ${b})`;
          isDarkBackground = (r + g + b) < 200;
        }
      } catch (err) {
        console.warn('Procedural color extraction failed, using defaults.', err);
      }
    }

    // 2. Draw the Cute Circular Emoji
    ctx.clearRect(0, 0, 512, 512);

    // Make avatar circular with transparent background
    ctx.save();
    ctx.beginPath();
    ctx.arc(256, 256, 250, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Body/Background Circle (premium gradient)
    const bgGrad = ctx.createRadialGradient(256, 256, 50, 256, 256, 256);
    bgGrad.addColorStop(0, '#1e293b');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Grid details on avatar bg
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }

    // Neon Halo border around avatar background
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(256, 256, 246, 0, Math.PI * 2);
    ctx.stroke();

    // Face Circle
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 15;

    const faceGrad = ctx.createRadialGradient(256, 200, 20, 256, 256, 180);
    faceGrad.addColorStop(0, '#ffffff'); // high specular highlight
    faceGrad.addColorStop(0.15, skinColor);
    // Darken skin color slightly for shadow edge
    faceGrad.addColorStop(1, AvatarGenerator.darkenColor(skinColor, 0.25));

    ctx.fillStyle = faceGrad;
    ctx.beginPath();
    ctx.arc(256, 256, 170, 0, Math.PI * 2);
    ctx.fill();

    // Remove shadow for details
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Rosy Cheeks (Blush)
    ctx.fillStyle = 'rgba(255, 99, 132, 0.45)';
    ctx.beginPath();
    ctx.arc(160, 280, 24, 0, Math.PI * 2); // left cheek
    ctx.arc(352, 280, 24, 0, Math.PI * 2); // right cheek
    ctx.fill();

    // Anime Cartoon Eyes
    const eyeY = 230;
    const drawEye = (x) => {
      // Sclera / Base Eye structure (deep dark)
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(x, eyeY, 26, 0, Math.PI * 2);
      ctx.fill();

      // Colored Iris ring (cyan gradient)
      const irisGrad = ctx.createRadialGradient(x, eyeY, 5, x, eyeY, 26);
      irisGrad.addColorStop(0, '#00f2fe');
      irisGrad.addColorStop(1, '#9b51e0');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.arc(x, eyeY, 18, 0, Math.PI * 2);
      ctx.fill();

      // Dark pupil
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.arc(x, eyeY, 10, 0, Math.PI * 2);
      ctx.fill();

      // Cute Highlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - 8, eyeY - 8, 7, 0, Math.PI * 2); // main highlight
      ctx.arc(x + 6, eyeY + 6, 3, 5, Math.PI * 2);  // sub-highlight
      ctx.fill();
    };

    drawEye(170); // left eye
    drawEye(342); // right eye

    // Cute Winking Eyebrows
    ctx.strokeStyle = AvatarGenerator.darkenColor(skinColor, 0.5);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    
    // Left eyebrow
    ctx.beginPath();
    ctx.arc(170, 195, 30, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Right eyebrow
    ctx.beginPath();
    ctx.arc(342, 195, 30, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Smiling Mouth
    ctx.strokeStyle = '#2d1502';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    
    // Smooth mouth curve
    ctx.beginPath();
    ctx.arc(256, 290, 36, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Little cute pink tongue
    ctx.fillStyle = '#ff6b81';
    ctx.beginPath();
    ctx.arc(256, 318, 12, 0, Math.PI * 2);
    ctx.fill();

    // Add randomized adorable glasses (50% chance)
    const seed = Math.random();
    if (seed > 0.5) {
      ctx.strokeStyle = '#ff007f'; // neon magenta glasses
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      
      // Left frame
      ctx.beginPath();
      ctx.arc(170, 230, 38, 0, Math.PI * 2);
      ctx.stroke();

      // Right frame
      ctx.beginPath();
      ctx.arc(342, 230, 38, 0, Math.PI * 2);
      ctx.stroke();

      // Bridge connection
      ctx.beginPath();
      ctx.moveTo(208, 230);
      ctx.lineTo(304, 230);
      ctx.stroke();
    }

    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  /**
   * Helper to darken a color for gradient shading
   */
  static darkenColor(colorStr, percent) {
    let r = 200, g = 150, b = 100;
    
    if (colorStr.startsWith('rgb')) {
      const match = colorStr.match(/\d+/g);
      if (match) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
      }
    } else if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) {
        hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      }
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    r = Math.max(0, Math.round(r * (1 - percent)));
    g = Math.max(0, Math.round(g * (1 - percent)));
    b = Math.max(0, Math.round(b * (1 - percent)));

    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Generates a stunning custom emoji avatar utilizing Google's Gemini Flash and Imagen 3 API in AI Studio.
   * Runs in a two-stage asynchronous pipeline.
   * @param {string} base64Photo Base64 JPEG data URL of webcam capture
   * @param {string} apiKey Google AI Studio API Key
   * @param {function} onProgress Callback function printing status logs
   * @returns {Promise<string>} Base64 generated image url, or falls back to procedural on error
   */
  static async generateWithGemini(base64Photo, apiKey, onProgress) {
    if (!apiKey) {
      onProgress('Error: No API key found. Falling back to Procedural Avatar...');
      await AvatarGenerator.sleep(1500);
      return AvatarGenerator.generateProcedural(base64Photo);
    }

    try {
      // Strip base64 header if present
      const cleanBase64 = base64Photo.replace(/^data:image\/\w+;base64,/, '');

      // Stage 1: Call Gemini 2.5 Flash to describe the face image
      onProgress('Initializing Gemini Flash Face Analyzer...');
      await AvatarGenerator.sleep(600);
      onProgress('Sending selfie data to Google Nano Banana...');

      const flashUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const flashPayload = {
        contents: [
          {
            parts: [
              {
                text: "Analyze this photo of a face. Generate a short, highly descriptive prompt (under 60 words) to create a cute, circular 3D emoji avatar matching this person's look for a game. Describe: skin tone, hair style/color, facial features, emotion/smile, and any accessories like glasses. The output MUST start with 'A cute circular 3D emoji of...' and be in cartoon / claymation style on a flat white background. Output ONLY the raw prompt text, no headers, no markdown, no quotes."
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: cleanBase64
                }
              }
            ]
          }
        ]
      };

      const flashResponse = await fetch(flashUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(flashPayload)
      });

      if (!flashResponse.ok) {
        const errText = await flashResponse.text();
        throw new Error(`Gemini Flash analysis failed: ${flashResponse.statusText} - ${errText}`);
      }

      const flashData = await flashResponse.json();
      let generatedPrompt = '';
      
      if (flashData.candidates && flashData.candidates[0].content.parts[0].text) {
        generatedPrompt = flashData.candidates[0].content.parts[0].text.trim();
      } else {
        throw new Error('Unexpected Gemini response structure.');
      }

      onProgress('Analyzing facial metrics... Complete!');
      onProgress(`Extracted Prompt: "${generatedPrompt}"`);
      await AvatarGenerator.sleep(800);

      // Stage 2: Call Imagen 3 via Predict endpoint to generate the emoji
      onProgress('Requesting Imagen 3 generator...');
      await AvatarGenerator.sleep(600);
      onProgress('Synthesizing high-res 3D Emoji Avatar...');

      const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
      const imagenPayload = {
        instances: [
          {
            prompt: generatedPrompt
          }
        ],
        parameters: {
          sampleCount: 1,
          aspectRatio: "1:1"
        }
      };

      const imagenResponse = await fetch(imagenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(imagenPayload)
      });

      if (!imagenResponse.ok) {
        const errText = await imagenResponse.text();
        throw new Error(`Imagen 3 generation failed: ${imagenResponse.statusText} - ${errText}`);
      }

      const imagenData = await imagenResponse.json();
      
      if (imagenData.predictions && imagenData.predictions[0] && imagenData.predictions[0].bytesBase64Encoded) {
        const imageBytes = imagenData.predictions[0].bytesBase64Encoded;
        onProgress('AI Avatar generation successfully completed!');
        await AvatarGenerator.sleep(500);
        return `data:image/jpeg;base64,${imageBytes}`;
      } else {
        throw new Error('Unexpected Imagen response structure.');
      }

    } catch (error) {
      console.error('Gemini API Avatar Pipeline failed:', error);
      onProgress(`API Pipeline Failed: ${error.message}`);
      onProgress('Falling back to local high-fidelity Procedural Avatar...');
      await AvatarGenerator.sleep(2000);
      return AvatarGenerator.generateProcedural(base64Photo);
    }
  }

  // Promise utility helper for smooth visual animations
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
