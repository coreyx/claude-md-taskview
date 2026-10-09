// Vite's `?raw` suffix imports a file's text; core has no Node types to read it with.
declare module '*?raw' {
  const text: string;
  export default text;
}
