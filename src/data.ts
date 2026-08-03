/**
 * Raw builtin lookup maps.
 *
 *   import { EMOJI_TO_NAME, NAME_TO_EMOJI } from "emoji-resolve/data"
 */

export {
  EMOJI_TO_NAME,
  NAME_TO_EMOJI,
  // Back-compat aliases
  EMOJI_TO_NAME as EMOJI_TO_SLACK,
  NAME_TO_EMOJI as SLACK_TO_EMOJI,
} from "./registry.js"
