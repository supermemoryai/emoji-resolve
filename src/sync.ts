/**
 * Public converters over the default registry.
 *
 *   import { resolve, toShortcode, toName } from "emoji-resolve"
 */

import { defaultRegistry } from "./registry.js"
import type { Match, ResolveOptions } from "./schema.js"

export const resolve = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): Match | null => defaultRegistry.resolve(input, opts)

export const toShortcode = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string => {
  const hit = defaultRegistry.resolve(input, opts)
  return hit ? hit.shortcode : (opts?.fallback ?? ":question:")
}

export const toName = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string => {
  const hit = defaultRegistry.resolve(input, opts)
  return hit ? hit.name : (opts?.fallback ?? "question")
}

export const suggest = (
  input: string,
  n?: number,
  opts?: ResolveOptions,
): Array<Match> => defaultRegistry.suggest(input, n, opts)

export const registerCustom = (input: unknown): number =>
  defaultRegistry.setCustom(input)

export const listCustom = (): Array<string> => defaultRegistry.listCustom()

/** @deprecated Prefer toShortcode */
export const toSlack = toShortcode

/** @deprecated Prefer toName */
export const reactionName = toName
