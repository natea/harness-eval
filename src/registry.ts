import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { type CandidateEntry, type HarnessId, Registry } from "./types";

export class RegistryError extends Error {}

/**
 * Load and validate the candidate registry. Fails fast (throws) on any schema
 * violation — missing pinned version, malformed entry, etc. — so no sandbox is
 * ever provisioned against an invalid registry.
 */
export function loadRegistry(path: string): Registry {
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new RegistryError(`failed to read registry at ${path}: ${err}`);
  }
  const result = Registry.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new RegistryError(`invalid registry ${path}:\n${issues}`);
  }
  const ids = new Set<string>();
  for (const c of result.data.candidates) {
    if (ids.has(c.id)) throw new RegistryError(`duplicate candidate id: ${c.id}`);
    ids.add(c.id);
  }
  return result.data;
}

/**
 * Resolve the candidates requested by a run against a specific harness.
 * A candidate without a section for the requested harness fails the run at
 * load time, naming candidate and harness (per candidate-registry spec).
 */
export function resolveCandidates(
  registry: Registry,
  requested: string[],
  harness: HarnessId,
): CandidateEntry[] {
  const byId = new Map(registry.candidates.map((c) => [c.id, c]));
  return requested.map((id) => {
    const entry = byId.get(id);
    if (!entry) {
      throw new RegistryError(
        `unknown candidate '${id}' (registry has: ${[...byId.keys()].join(", ")})`,
      );
    }
    if (!entry.harnesses[harness]) {
      throw new RegistryError(`candidate '${id}' has no '${harness}' harness section`);
    }
    return entry;
  });
}

/** Render a candidate's session script, substituting the shared base prompt. */
export function renderSessionScript(registry: Registry, candidate: CandidateEntry, harness: HarnessId) {
  const setup = candidate.harnesses[harness];
  if (!setup) throw new RegistryError(`candidate '${candidate.id}' has no '${harness}' section`);
  return setup.session.map((step) => ({
    ...step,
    prompt: step.prompt.replaceAll("{{BASE_PROMPT}}", registry.basePrompt),
  }));
}
