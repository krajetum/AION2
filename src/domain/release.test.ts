import { test } from "node:test";
import assert from "node:assert/strict";
import { betaVersion } from "./release.ts";

test("beta version: next patch after the newest stable tag, numerically, betas ignored", () => {
  const tags = ["v0.3.9", "v0.3.108", "v0.3.110-41", "v0.2.200", "beta-channel", "v0.3.99\r"];
  assert.equal(betaVersion(tags, 42), "0.3.109-42");
  assert.equal(betaVersion(["v1.0.0", "v0.9.9"], 1), "1.0.1-1");
});

test("beta version: no stable tag or a run number the MSI refuses throws", () => {
  assert.throws(() => betaVersion(["v0.3.1-5"], 1));
  assert.throws(() => betaVersion(["v0.3.1"], 65536));
  assert.throws(() => betaVersion(["v0.3.1"], 0));
});
