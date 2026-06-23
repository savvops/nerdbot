import assert from "node:assert/strict";
import {
  formatSearchResults,
  normalizeSearchSettings,
  parseSearxngResults,
  resolveSearchProviderOrder,
  type SearchSettings,
} from "../src/services/searchProviders";

const defaultSettings: SearchSettings = {
  provider: "jina",
  searxngUrl: "http://localhost:8080",
  fallbackProviders: ["searxng", "duckduckgo"],
  maxResults: 3,
  fetchTopPages: false,
  maxFetchedPages: 2,
};

assert.deepEqual(resolveSearchProviderOrder(defaultSettings), [
  "jina",
  "searxng",
  "duckduckgo",
]);

assert.deepEqual(
  resolveSearchProviderOrder({
    ...defaultSettings,
    provider: "searxng",
    fallbackProviders: ["jina", "duckduckgo", "jina"],
  }),
  ["searxng", "jina", "duckduckgo"],
);

const normalized = normalizeSearchSettings({
  provider: "searxng",
  searxngUrl: "http://localhost:8080/",
  fallbackProviders: ["jina"],
  maxResults: 0,
  fetchTopPages: true,
  maxFetchedPages: 99,
});
assert.equal(normalized.searxngUrl, "http://localhost:8080");
assert.equal(normalized.maxResults, 1);
assert.equal(normalized.maxFetchedPages, 10);

const parsed = parseSearxngResults({
  results: [
    { title: "One", url: "https://one.example", content: "First result" },
    { title: "No URL", content: "skip me" },
    { title: "Two", url: "https://two.example" },
  ],
});
assert.deepEqual(parsed, [
  {
    title: "One",
    url: "https://one.example",
    snippet: "First result",
    source: "searxng",
  },
  { title: "Two", url: "https://two.example", source: "searxng" },
]);

const formatted = formatSearchResults("test query", parsed);
assert.match(formatted, /Search results for: "test query"/);
assert.match(formatted, /Provider: searxng/);
assert.match(formatted, /\[1\] One/);
assert.match(formatted, /https:\/\/one\.example/);

console.log("search-router tests passed");
