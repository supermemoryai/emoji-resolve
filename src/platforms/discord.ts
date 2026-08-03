/**
 * Discord adapters.
 *
 * Standard emoji reactions want the **unicode character**.
 * Custom emoji reactions want `name:id` (or `a:name:id` when animated).
 * Message content can use unicode or `<:name:id>` / `<a:name:id>`.
 *
 *   import { Discord } from "emoji-resolve/platforms/discord"
 *   Discord.reaction(match)  // "🎉" or "partyparrot:123"
 *   Discord.message(match)   // "🎉" or "<:partyparrot:123>"
 */

import type { Match, ResolveOptions } from "../schema.js"
import { defaultRegistry } from "../registry.js"

/**
 * Value for Discord's reaction endpoint / library helpers.
 * - Builtin: unicode emoji
 * - Custom with id: `name:id`
 * - Custom without id: falls back to name (may not work for reactions)
 */
export const reaction = (match: Match): string => {
  if (match.custom && match.id) {
    return `${match.name}:${match.id}`
  }
  if (match.emoji) return match.emoji
  return match.name
}

/**
 * Inline message form.
 * - Builtin: unicode
 * - Custom with id: `<:name:id>` or `<a:name:id>`
 * - Otherwise: shortcode as last resort
 */
export const message = (match: Match): string => {
  if (match.custom && match.id) {
    return match.animated
      ? `<a:${match.name}:${match.id}>`
      : `<:${match.name}:${match.id}>`
  }
  if (match.emoji) return match.emoji
  return match.shortcode
}

/** Resolve free-form input → Discord reaction token. */
export const reactionFrom = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string => {
  const hit = defaultRegistry.resolve(input, opts)
  if (!hit) return opts?.fallback ?? "❓"
  return reaction(hit)
}

/** Resolve free-form input → Discord message fragment. */
export const messageFrom = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string => {
  const hit = defaultRegistry.resolve(input, opts)
  if (!hit) return opts?.fallback ?? "❓"
  return message(hit)
}

export * as Discord from "./discord.js"
