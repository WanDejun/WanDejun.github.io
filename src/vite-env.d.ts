/// <reference types="vite/client" />

declare module '*.toml?raw' {
  const source: string;
  export default source;
}
