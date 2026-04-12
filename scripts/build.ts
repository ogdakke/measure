await Bun.$`rm -rf dist`;

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  plugins: [
    {
      name: "stub-react-devtools-core",
      setup(build) {
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: "react-devtools-core",
          namespace: "stub",
        }));

        build.onLoad({ filter: /^react-devtools-core$/, namespace: "stub" }, () => ({
          loader: "js",
          contents: `
            export default {
              initialize() {},
              connectToDevTools() {},
            };
          `,
        }));
      },
    },
  ],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
