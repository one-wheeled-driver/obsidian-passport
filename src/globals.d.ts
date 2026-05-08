// Tell TS that esbuild's text loader makes `*.csl` imports return strings.
declare module "*.csl" {
  const content: string;
  export default content;
}
