self.onmessage = (event) => {
  try {
    const { buffer, width, height } = event.data;
    const data = new Uint8ClampedArray(buffer);
    const sample = (x, y) => {
      const index = (y * width + x) * 4;
      return [data[index], data[index + 1], data[index + 2]];
    };
    const corners = [
      sample(0, 0),
      sample(width - 1, 0),
      sample(0, height - 1),
      sample(width - 1, height - 1),
    ];
    const background = corners.reduce(
      (sum, color) => [
        sum[0] + color[0] / 4,
        sum[1] + color[1] / 4,
        sum[2] + color[2] / 4,
      ],
      [0, 0, 0],
    );

    const threshold = 38;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const delta =
          Math.abs(data[index] - background[0])
          + Math.abs(data[index + 1] - background[1])
          + Math.abs(data[index + 2] - background[2]);
        if (delta > threshold) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (minX >= maxX || minY >= maxY) {
      self.postMessage({ box: { x: 0, y: 0, width, height } });
      return;
    }

    const pad = Math.round(Math.min(width, height) * 0.015);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    self.postMessage({
      box: {
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      },
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Image trim worker failed.",
    });
  }
};
