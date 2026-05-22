export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#e87722', light: '#f59340', dark: '#c45d12' }
      },
      backgroundImage: {
        'gradient-orange':   'linear-gradient(180deg, #2d1106 0%, #5a2209 55%, #8b3812 100%)',
        'gradient-orange-h': 'linear-gradient(135deg, #2d1106 0%, #5a2209 100%)',
      }
    }
  },
  plugins: []
}
