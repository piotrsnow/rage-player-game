/** @type {import('tailwindcss').Config} */
import preset from '../shared/ui-theme/tailwind.preset.js';

export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
};
