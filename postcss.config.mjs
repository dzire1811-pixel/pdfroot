const config = {
  plugins: {
    tailwindcss: {},
    "postcss-preset-env": {
      stage: 3,
      preserve: true,
      features: {
        "color-mix": { preserve: true },
        "color-functional-notation": { preserve: true },
        "lab-function": { preserve: true },
        "nesting-rules": true,
        "oklab-function": { preserve: true },
      },
      autoprefixer: {
        flexbox: "no-2009",
      },
    },
  },
};

export default config;
