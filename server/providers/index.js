"use strict";

const cursor = require("./cursor");
const codex = require("./codex");

const PROVIDERS = {
  cursor,
  codex,
};

function getProvider(cli = "cursor") {
  return PROVIDERS[cli] || PROVIDERS.cursor;
}

function listModelOptions(cli = "cursor") {
  return getProvider(cli).listModels();
}

function resolveBinary(cli = "cursor") {
  return getProvider(cli).resolveBinary();
}

function listProviders() {
  return Object.values(PROVIDERS).map((provider) => ({
    id: provider.id,
    label: provider.label,
    defaultModel: provider.defaultModel,
  }));
}

module.exports = {
  PROVIDERS,
  getProvider,
  listModelOptions,
  resolveBinary,
  listProviders,
};
