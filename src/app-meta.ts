import packageJson from "../package.json";

export const APP_VERSION =
  typeof packageJson.version === "string" ? packageJson.version : "0.1.0";
