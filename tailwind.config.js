/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './main.jsx', './app.jsx'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
};
