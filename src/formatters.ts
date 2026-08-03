/**
 * String / representation transforms.
 *
 *   import { textToShortcode, toUnicode, extractEmoji } from "emoji-resolve/formatters"
 */

export {
  extractEmoji,
  textToShortcode,
  toUnicode,
} from "./registry.js"

/** @deprecated Prefer textToShortcode */
export { textToShortcode as textToSlack } from "./registry.js"

/** @deprecated Prefer toUnicode */
export { toUnicode as toEmoji } from "./registry.js"
