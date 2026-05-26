declare module '*.svg' {
  const content: React.FunctionComponent<React.SVGAttributes<SVGElement>>;
  export default content;
}

// Vite exposes import.meta.env — declare the shape used in this project.
interface ImportMeta {
  readonly env: Record<string, string | undefined>;
}
