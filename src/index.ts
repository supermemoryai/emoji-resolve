/**
 * emoji-resolve — platform-agnostic emoji → shortcode resolver.
 *
 *   import { toShortcode, toName, resolve } from "emoji-resolve"
 *   import { textToShortcode } from "emoji-resolve/formatters"
 *   import { Slack } from "emoji-resolve/platforms/slack"
 *   import { Discord } from "emoji-resolve/platforms/discord"
 */

export {
  resolve,
  toShortcode,
  toName,
  suggest,
  registerCustom,
  listCustom,
  // back-compat
  toSlack,
  reactionName,
} from "./sync.js"

export type { Match, ResolveOptions, CustomEmojiEntry } from "./schema.js"
