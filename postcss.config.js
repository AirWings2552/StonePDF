// 根目录 postcss.config.js
export default {
  plugins: {
    "@tailwindcss/postcss": {},   // ← 用这个，而不是 tailwindcss
    autoprefixer: {},
  },
}
