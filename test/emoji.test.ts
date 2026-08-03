import { describe, expect, it } from "vitest"
import {
  listCustom,
  registerCustom,
  resolve,
  suggest,
  toName,
  toShortcode,
} from "../src/index.js"
import * as formatters from "../src/formatters.js"
import * as data from "../src/data.js"
import { Discord } from "../src/platforms/discord.js"
import { Slack } from "../src/platforms/slack.js"

describe("converters", () => {
  it("resolves emoji, words, typos", () => {
    expect(toShortcode("😂")).toBe(":joy:")
    expect(toShortcode("laugh")).toBe(":joy:")
    expect(toShortcode("thums up")).toBe(":+1:")
    expect(toName("🎉")).toBe("tada")
    expect(toShortcode("xqzztplorb")).toBe(":question:")
    expect(toShortcode("xqzztplorb", { fallback: ":wave:" })).toBe(":wave:")
  })

  it("handles skin tones", () => {
    const hit = resolve("👍🏽")
    expect(hit?.name).toBe("+1")
    expect(hit?.tone).toBe("skin-tone-4")
    expect(hit?.shortcode).toBe(":+1::skin-tone-4:")
  })

  it("returns null on noise", () => {
    expect(resolve(null)).toBeNull()
    expect(resolve("xy")).toBeNull()
    expect(resolve("xqzztplorb")).toBeNull()
  })

  it("suggests candidates", () => {
    const hits = suggest("party", 3)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits.every((h) => h.name && h.shortcode)).toBe(true)
  })

  it("registers custom emoji", () => {
    const n = registerCustom({
      shipit: "https://example.com/shipit.png",
      partyparrot: "https://example.com/pp.gif",
      meow: "alias:partyparrot",
    })
    expect(n).toBeGreaterThanOrEqual(3)
    expect(listCustom()).toContain("shipit")
    expect(resolve("ship it")?.name).toBe("shipit")
    registerCustom(null)
    expect(listCustom()).toEqual([])
  })
})

describe("formatters", () => {
  it("rewrites emoji in text", () => {
    const out = formatters.textToShortcode("hello 🎉 world 😂")
    expect(out).toContain(":tada:")
    expect(out).toContain(":joy:")
    expect(out).not.toContain("🎉")
  })

  it("toUnicode reverse lookup", () => {
    expect(formatters.toUnicode("joy")).toBe("😂")
    expect(formatters.toUnicode(":tada:")).toBe("🎉")
    expect(formatters.toUnicode("xqzztplorb")).toBeNull()
  })

  it("extractEmoji", () => {
    const em = formatters.extractEmoji("a 🎉 b 👍🏽 c")
    expect(em.length).toBeGreaterThanOrEqual(2)
  })
})

describe("data maps", () => {
  it("has bidirectional maps", () => {
    expect(data.EMOJI_TO_NAME.get("😂")).toBe("joy")
    expect(data.NAME_TO_EMOJI.get("joy")).toBe("😂")
  })
})

describe("platforms", () => {
  it("Slack wants bare names for reactions", () => {
    const hit = resolve("🎉")!
    expect(Slack.reaction(hit)).toBe("tada")
    expect(Slack.shortcode(hit)).toBe(":tada:")
    expect(Slack.reactionFrom("thums up")).toBe("+1")
  })

  it("Discord wants unicode for standard reactions", () => {
    const hit = resolve("🎉")!
    expect(Discord.reaction(hit)).toBe("🎉")
    expect(Discord.message(hit)).toBe("🎉")
    expect(Discord.reactionFrom("party")).toBe("🎉")
  })

  it("Discord formats custom emoji with id", () => {
    registerCustom([
      {
        name: "partyparrot",
        id: "1234567890",
        animated: true,
        url: "https://cdn.example/pp.gif",
      },
    ])
    const hit = resolve("partyparrot")!
    expect(hit.custom).toBe(true)
    expect(Discord.reaction(hit)).toBe("partyparrot:1234567890")
    expect(Discord.message(hit)).toBe("<a:partyparrot:1234567890>")
    registerCustom(null)
  })
})
