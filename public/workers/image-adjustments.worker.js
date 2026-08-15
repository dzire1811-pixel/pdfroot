self.onmessage = (event) => {
  try {
    const { buffer, adjustments } = event.data;
    const pixels = new Uint8ClampedArray(buffer);
    const brightnessOffset = adjustments.brightness * 2.15;
    const contrastFactor = 1 + adjustments.contrast / 100;
    const saturationFactor = 1 + adjustments.saturation / 100;

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;

      let red = (pixels[index] - 128) * contrastFactor + 128 + brightnessOffset;
      let green = (pixels[index + 1] - 128) * contrastFactor + 128 + brightnessOffset;
      let blue = (pixels[index + 2] - 128) * contrastFactor + 128 + brightnessOffset;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      red = luminance + (red - luminance) * saturationFactor;
      green = luminance + (green - luminance) * saturationFactor;
      blue = luminance + (blue - luminance) * saturationFactor;

      const normalizedLuminance = Math.min(Math.max(luminance / 255, 0), 1);
      const shadowWeight = (1 - normalizedLuminance) ** 2;
      const highlightWeight = normalizedLuminance ** 2;
      const tonalOffset =
        adjustments.shadows * 1.05 * shadowWeight
        + adjustments.highlights * 1.05 * highlightWeight;

      pixels[index] = Math.min(Math.max(Math.round(red + tonalOffset), 0), 255);
      pixels[index + 1] = Math.min(Math.max(Math.round(green + tonalOffset), 0), 255);
      pixels[index + 2] = Math.min(Math.max(Math.round(blue + tonalOffset), 0), 255);
    }

    self.postMessage({ buffer: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Image adjustment worker failed.",
    });
  }
};
