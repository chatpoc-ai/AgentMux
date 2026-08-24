"use strict";

const cursor = require("./cursor");
const codex = require("./codex");
const claude = require("./claude");

const PROVIDERS = {
  cursor,
  codex,
  claude,
};

const DEFAULT_PROVIDER = "cursor";

/**
 * Coerce anything (stale settings.json, query string, WS payload) to a
 * provider id we actually have a module for.
 *
 * @param {unknown} cli
 * @returns {string}
 */
function normalizeCli(cli) {
  const value = String(cli || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROVIDERS, value) ? value : DEFAULT_PROVIDER;
}

function getProvider(cli) {
  return PROVIDERS[normalizeCli(cli)];
}

function listModelOptions(cli) {
  return getProvider(cli).listModels();
}

function resolveBinary(cli) {
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
  DEFAULT_PROVIDER,
  normalizeCli,
  getProvider,
  listModelOptions,
  resolveBinary,
  listProviders,
};
