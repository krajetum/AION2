// The beta channel's version, computed by the release workflow (.github/workflows/release.yml) on a push to `beta`.
// Next patch after the newest stable tag + "-<run number>": a semver pre-release, so above the last stable and below
// the next one, never committed or tagged on main. Numeric only: the MSI installer takes no letters in a pre-release
// and none above 65535.

/** `tags` = `git tag -l` lines, `run` = the workflow's run number: ["v0.3.108", "v0.3.107"], 42 → "0.3.109-42". */
export function betaVersion(tags: string[], run: number): string {
  if (!Number.isInteger(run) || run < 1 || run > 65535) throw new Error(`Run number ${run} out of the MSI's 1-65535`);
  const last = tags
    .map((t) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(t.trim())?.slice(1).map(Number))
    .filter((v): v is number[] => !!v)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
    .pop();
  if (!last) throw new Error("No stable version tag");
  return `${last[0]}.${last[1]}.${last[2] + 1}-${run}`;
}
