/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: "#121212",
        foreground: "#ffffff",
        primary: {
          DEFAULT: "rgb(147, 51, 234)",
          foreground: "#ffffff",
        },
        secondary: {
          DEFAULT: "#1E1E1E",
          foreground: "#ffffff",
        },
        destructive: {
          DEFAULT: "#991b1b",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#1E1E1E",
          foreground: "#a1a1a1",
        },
        accent: {
          DEFAULT: "rgb(147, 51, 234)",
          foreground: "#ffffff",
        },
        popover: {
          DEFAULT: "#121212",
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "#1E1E1E",
          foreground: "#ffffff",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
}

