export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#e87722', light: '#f59340', dark: '#c45d12' }
      },
      backgroundImage: {
        'gradient-orange':   'linear-gradient(180deg, #c45d12 0%, #e87722 50%, #f59340 100%)',
        'gradient-orange-h': 'linear-gradient(135deg, #c45d12 0%, #e87722 100%)',
      }
    }
  },
  plugins: []
}
