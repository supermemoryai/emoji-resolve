/**
 * Platform-neutral match for one emoji-ish input.
 * Canonical `name` values follow the common shortcode set used by Slack/GitHub
 * (e.g. "+1", "tada", "joy"). Platforms format this further.
 */
export interface Match {
  /** Canonical shortcode name, e.g. "joy" or "+1". */
  name: string
  /** Colon shortcode, e.g. ":joy:" or ":+1::skin-tone-4:". */
  shortcode: string
  /** Unicode character when known; null for workspace-only custom emoji. */
  emoji: string | null
  /** Confidence in [0, 1]. */
  score: number
  /** Skin-tone modifier when present, e.g. "skin-tone-4". */
  tone?: string
  /** True when the hit came from workspace custom emoji. */
  custom?: boolean
  /** Custom image URL when available. */
  url?: string | null
  /** Discord custom emoji snowflake when registered with an id. */
  id?: string | null
  /** Discord animated flag for custom emoji. */
  animated?: boolean
}

/** One workspace custom emoji entry (Slack- or Discord-shaped). */
export interface CustomEmojiEntry {
  name: string
  url?: string | null
  /** Discord snowflake id for custom emoji reactions. */
  id?: string | null
  animated?: boolean
  /** Slack-style alias target, e.g. "partyparrot". */
  aliasOf?: string | null
}

export interface ResolveOptions {
  /**
   * Workspace custom emoji for this call only.
   * Accepts:
   * - string[] of names
   * - { name: url | "alias:other" } map (Slack emoji.list)
   * - { ok, emoji } Slack API response
   * - { name, url?, id?, animated? }[] (Discord-friendly)
   */
  customEmoji?: unknown
  /** Confidence floor; below this resolve returns null (default 0.5). */
  minScore?: number
  /** Used by toShortcode / toName / platform *From helpers when nothing matches. */
  fallback?: string
}
