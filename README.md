# emoji-resolve

[![npm](https://img.shields.io/npm/v/emoji-resolve.svg)](https://www.npmjs.com/package/emoji-resolve)
[![CI](https://github.com/supermemoryai/emoji-resolve/actions/workflows/ci.yml/badge.svg)](https://github.com/supermemoryai/emoji-resolve/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/emoji-resolve.svg)](./LICENSE)

**Platform-agnostic emoji → shortcode resolver.**

Built for the case where an LLM hands you *something* emoji-ish and you need a real reaction out the other side. Works with **Slack**, **Discord**, and anything that speaks shortcodes or unicode.

```bash
npm install emoji-resolve
```

```ts
import {
  resolve,
  toShortcode,
  toName,
  registerCustom,
} from "emoji-resolve"
import { Slack } from "emoji-resolve/platforms/slack"
import { Discord } from "emoji-resolve/platforms/discord"

// Workspace custom emoji (once at bot startup)
registerCustom({
  shipit: "https://emoji.slack-edge.com/T…/shipit.png",
  partyparrot: "https://emoji.slack-edge.com/T…/partyparrot.gif",
  meow: "alias:partyparrot",
})

// Or from Slack's API:
// registerCustom(await client.emoji.list())

toShortcode("😂")           // ":joy:"
toShortcode("laugh")        // ":joy:"
toShortcode("thums up")     // ":+1:"      typo-tolerant
toShortcode("ship it")      // ":shipit:"  workspace custom
toName("🎉")                // "tada"

const hit = resolve("party parrot")!
// { name: "partyparrot", shortcode: ":partyparrot:", custom: true, … }

Slack.reaction(hit)         // "partyparrot"  → reactions.add
Discord.reaction(hit)       // "partyparrot"  (add id for name:id — see below)
```

Zero runtime dependencies. Plain TypeScript functions — no framework required.

---

## Install

```bash
npm install emoji-resolve
# or
pnpm add emoji-resolve
# or
yarn add emoji-resolve
```

Published on [npm](https://www.npmjs.com/package/emoji-resolve) · source on [GitHub](https://github.com/supermemoryai/emoji-resolve)

---

## Quick example (with custom emoji)

A typical Slack bot startup + reaction flow:

```ts
import { WebClient } from "@slack/web-api"
import { toName, registerCustom, resolve } from "emoji-resolve"
import { Slack } from "emoji-resolve/platforms/slack"

const client = new WebClient(process.env.SLACK_BOT_TOKEN)

// 1. Load workspace emoji once
const { emoji } = await client.emoji.list()
registerCustom(emoji)

// 2. LLM (or user) said something emoji-ish
const input = "ship it" // or "🎉", "thums up", "party parrot", …

// 3. React
const name = toName(input) // "shipit" | "tada" | "+1" | …
await client.reactions.add({
  channel,
  timestamp: messageTs,
  name, // bare name — what reactions.add wants
})

// Full match when you need score / shortcode / custom url:
const hit = resolve(input)
if (hit) {
  console.log(hit.shortcode, hit.score, hit.custom, hit.url)
  // or: Slack.reaction(hit) / Slack.shortcode(hit)
}
```

Discord custom emoji need a snowflake `id`:

```ts
import { registerCustom, resolve } from "emoji-resolve"
import { Discord } from "emoji-resolve/platforms/discord"

registerCustom([
  { name: "partyparrot", id: "123456789012345678", animated: true },
  { name: "shipit", id: "987654321098765432" },
])

const hit = resolve("party parrot")!
Discord.reaction(hit)  // "partyparrot:123456789012345678"
Discord.message(hit)   // "<a:partyparrot:123456789012345678>"
```

---

## Why

Chatbots and agents get emoji input in every shape:

| Input | Example |
|-------|---------|
| Raw unicode | `🎉` `👍🏽` |
| Shortcode | `:tada:` `tada` |
| Loose word | `laugh`, `party` |
| Typo | `thums up` |
| CLDR description | `party popper`, `face with tears of joy` |
| Workspace custom | `shipit`, `partyparrot` |

One library turns all of that into something platforms accept.

---

## Package surface

| Entry | Purpose |
|-------|---------|
| `emoji-resolve` | Converters: `resolve`, `toShortcode`, `toName`, `suggest`, `registerCustom`, `listCustom` |
| `emoji-resolve/formatters` | String transforms: `textToShortcode`, `toUnicode`, `extractEmoji` |
| `emoji-resolve/platforms/slack` | Slack reaction + shortcode helpers |
| `emoji-resolve/platforms/discord` | Discord reaction + message helpers |
| `emoji-resolve/data` | Raw builtin maps |

Default is **converters**. Formatters and platforms are opt-in.

---

## Converters

```ts
import {
  resolve,
  toShortcode,
  toName,
  suggest,
  registerCustom,
  listCustom,
} from "emoji-resolve"

toShortcode("😂")                              // ":joy:"
toShortcode("xqzztplorb")                      // ":question:"
toShortcode("xqzztplorb", { fallback: ":wave:" })

toName("🎉")                                   // "tada"
toName("xqzztplorb")                           // "question"

resolve("thums up")                            // Match | null
suggest("party", 3)                            // Match[]
```

| Function | Returns | Notes |
|----------|---------|-------|
| `resolve(input, opts?)` | `Match \| null` | Full match, or `null` if nothing is confident |
| `toShortcode(input, opts?)` | `string` | Always a shortcode; default fallback `":question:"` |
| `toName(input, opts?)` | `string` | Bare name (no colons); default fallback `"question"` |
| `suggest(input, n?, opts?)` | `Match[]` | Top-N candidates |
| `registerCustom(emoji)` | `number` | Install workspace emoji; `null` to clear |
| `listCustom()` | `string[]` | Currently installed custom names |

Back-compat aliases: `toSlack` → `toShortcode`, `reactionName` → `toName`.

### Match shape

```ts
type Match = {
  name: string           // "tada", "+1"
  shortcode: string      // ":tada:", ":+1::skin-tone-4:"
  emoji: string | null   // "🎉" (null for workspace-only custom)
  score: number          // 0–1
  tone?: string          // "skin-tone-4" when present
  custom?: boolean
  url?: string | null
  id?: string | null     // Discord snowflake when registered
  animated?: boolean
}
```

Canonical names follow the common Slack/GitHub shortcode set (`+1`, `tada`, `joy`, …).

### Options

```ts
type ResolveOptions = {
  customEmoji?: unknown  // workspace emoji for this call only
  minScore?: number      // default 0.5
  fallback?: string      // for toShortcode / toName / platform *From helpers
}
```

---

## Platforms

### Slack

```ts
import { Slack } from "emoji-resolve/platforms/slack"

const hit = resolve("🎉")!

Slack.reaction(hit)    // "tada"     → reactions.add
Slack.shortcode(hit)   // ":tada:"   → message text

Slack.reactionFrom("thums up")   // "+1"
Slack.shortcodeFrom("laugh")     // ":joy:"
```

### Discord

Standard reactions want **unicode**. Custom reactions want `name:id`.

```ts
import { Discord } from "emoji-resolve/platforms/discord"
import { registerCustom, resolve } from "emoji-resolve"

const hit = resolve("🎉")!
Discord.reaction(hit)  // "🎉"
Discord.message(hit)   // "🎉"

registerCustom([
  { name: "partyparrot", id: "1234567890", animated: true },
])

const custom = resolve("partyparrot")!
Discord.reaction(custom)  // "partyparrot:1234567890"
Discord.message(custom)   // "<a:partyparrot:1234567890>"
```

| Need | Use |
|------|-----|
| Slack reaction | `Slack.reaction(match)` or `toName(input)` |
| Slack message shortcode | `Slack.shortcode(match)` or `toShortcode(input)` |
| Discord standard reaction | `Discord.reaction(match)` → unicode |
| Discord custom reaction | register with `{ name, id }`, then `Discord.reaction` |
| Discord message fragment | `Discord.message(match)` |

---

## Formatters

```ts
import {
  textToShortcode,
  toUnicode,
  extractEmoji,
} from "emoji-resolve/formatters"

textToShortcode("hello 🎉 world 😂")
// "hello :tada: world :joy:"

toUnicode("joy")        // "😂"
toUnicode(":tada:")     // "🎉"
toUnicode("thums up")   // "👍"

extractEmoji("a 🎉 b 👍🏽 c")
// ["🎉", "👍🏽"]
```

| Function | What it does |
|----------|----------------|
| `textToShortcode(text)` | Replace every emoji *character* with its shortcode (no fuzzy words) |
| `toUnicode(input, opts?)` | Shortcode / name / word → unicode |
| `extractEmoji(text)` | Pull graphemes (skin tones, ZWJ) out of text |

---

## Custom / workspace emoji

```ts
import { registerCustom, resolve, listCustom } from "emoji-resolve"

// Slack emoji.list()
registerCustom(await client.emoji.list())

// Name → URL map
registerCustom({
  shipit: "https://emoji.slack-edge.com/…/shipit.png",
  meow: "alias:partyparrot",
})

// Names only
registerCustom(["shipit", "partyparrot"])

// Discord-friendly (with snowflake ids)
registerCustom([
  { name: "partyparrot", id: "1234567890", animated: true },
])

// Per-call, without installing globally
resolve("shipit", { customEmoji: { shipit: "https://…" } })

listCustom()           // ["shipit", …]
registerCustom(null)   // clear
```

Workspace matches prefer custom names over builtins when confident (`ship it` → `:shipit:` not `:rocket:`).

---

## How matching works

1. **Literal emoji** in the input → exact name (+ skin tone when present)
2. **Shortcode / plain name** against workspace custom, then builtins
3. **Fuzzy** for queries ≥ 3 chars: BM25 over aliases + substring + edit distance
4. Short noise (1–2 chars that miss exact) does **not** guess

Concept aliases widen matching (`party` → tada, `lol` → joy, `lgtm` → +1, CLDR names → shortcode names, …).

Popular reactions get a small tie-break boost so bots land on what humans actually click.

---

## Data

```ts
import { EMOJI_TO_NAME, NAME_TO_EMOJI } from "emoji-resolve/data"

EMOJI_TO_NAME.get("😂")  // "joy"
NAME_TO_EMOJI.get("joy") // "😂"
```

Aliases `EMOJI_TO_SLACK` / `SLACK_TO_EMOJI` still exist for older imports.

---

## Development

```bash
git clone https://github.com/supermemoryai/emoji-resolve.git
cd emoji-resolve
npm ci
npm test   # build + vitest
```

CI runs on every push and PR to `main` (Node 20 & 22).

---

## License

MIT · [Supermemory](https://github.com/supermemoryai)
