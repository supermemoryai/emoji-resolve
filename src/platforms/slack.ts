/**
 * Slack adapters.
 *
 * Reactions API wants the bare name (no colons).
 * Message text wants :shortcode:.
 *
 *   import { Slack } from "emoji-resolve/platforms/slack"
 *   Slack.reaction(match)   // "tada"
 *   Slack.shortcode(match)  // ":tada:"
 */

import type { Match, ResolveOptions } from "../schema.js"
import { defaultRegistry } from "../registry.js"

/** Bare name for `reactions.add` — no colons, no skin-tone suffix. */
export const reaction = (match: Match): string => match.name

/** Colon shortcode for message text. */
export const shortcode = (match: Match): string => match.shortcode

/**
 * Resolve free-form input to a Slack reaction name.
 * Falls back to "question" (or opts.fallback).
 */
export const reactionFrom = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string => {
  const hit = defaultRegistry.resolve(input, opts)
  return hit ? hit.name : (opts?.fallback ?? "question")
}

/**
 * Resolve free-form input to a Slack shortcode.
 * Falls back to ":question:" (or opts.fallback).
 */
export const shortcodeFrom = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string => {
  const hit = defaultRegistry.resolve(input, opts)
  return hit ? hit.shortcode : (opts?.fallback ?? ":question:")
}

export * as Slack from "./slack.js"
