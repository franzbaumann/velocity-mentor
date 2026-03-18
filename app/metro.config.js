// Expo / Metro config for monorepo imports (e.g. repo-root `shared/`).
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("metro-cache");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// 1) Allow importing from the monorepo root (e.g. `../shared`).
config.watchFolders = [workspaceRoot];

// 2) Resolve deps from both app + workspace node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3) Speed/stability: keep Metro cache in app/.metro-cache.
config.cacheStores = [
  new FileStore({ root: path.join(projectRoot, ".metro-cache") }),
];

module.exports = config;

