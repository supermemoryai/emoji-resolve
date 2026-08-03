/**
 * Emoji registry + fuzzy resolver (internal).
 */

import {
  CONCEPT_ALIASES,
  DATA,
  POPULAR,
  SKIN_TONES,
} from "./catalog-data.js"
import type { CustomEmojiEntry, Match, ResolveOptions } from "./schema.js"

const VS16 = "\uFE0F"
const CUSTOM_BOOST = 0.08
const CUSTOM_THRESHOLD = 0.66
const BM25_K1 = 1.4
const BM25_B = 0.72

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocInfo {
  readonly name: string
  readonly len: number
}

interface CustomMeta {
  readonly url: string | null
  readonly aliasOf: string | null
  readonly id: string | null
  readonly animated: boolean
}

interface Layer {
  readonly isCustom: boolean
  lookup: Map<string, string>
  keys: Array<string>
  norm: Map<string, string>
  tokenIndex: Map<string, Set<string>>
  postings: Map<string, Map<number, number>>
  docs: Map<number, DocInfo>
  idf: Map<string, number>
  avgdl: number
  avgIdf: number
  meta: Map<string, CustomMeta>
}

interface Scored {
  readonly name: string
  readonly score: number
  readonly layer: Layer | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+-]/g, "")

const tokens = (s: string): Array<string> =>
  s
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter(Boolean)

const makeLayer = (isCustom: boolean): Layer => ({
  isCustom,
  lookup: new Map(),
  keys: [],
  norm: new Map(),
  tokenIndex: new Map(),
  postings: new Map(),
  docs: new Map(),
  idf: new Map(),
  avgdl: 1,
  avgIdf: 1,
  meta: new Map(),
})

const addKey = (layer: Layer, key: string, name: string): void => {
  if (!key || layer.lookup.has(key)) return
  layer.lookup.set(key, name)
  layer.keys.push(key)
}

const sealLayer = (layer: Layer): Layer => {
  const N = layer.keys.length || 1
  let totalLen = 0

  layer.keys.forEach((key, i) => {
    const name = layer.lookup.get(key)
    if (name === undefined) return
    const n = squash(key)
    if (!layer.norm.has(n)) layer.norm.set(n, name)

    const terms = new Map<string, number>()
    for (const t of tokens(key)) {
      terms.set(t, (terms.get(t) ?? 0) + 1)
      let set = layer.tokenIndex.get(t)
      if (!set) {
        set = new Set()
        layer.tokenIndex.set(t, set)
      }
      set.add(name)
      let post = layer.postings.get(t)
      if (!post) {
        post = new Map()
        layer.postings.set(t, post)
      }
      post.set(i, (post.get(i) ?? 0) + 1)
    }
    const len = terms.size || 1
    layer.docs.set(i, { name, len })
    totalLen += len
  })

  layer.avgdl = totalLen / N
  for (const [t, postings] of layer.postings) {
    const df = postings.size
    layer.idf.set(t, Math.log(1 + (N - df + 0.5) / (df + 0.5)))
  }
  let idfSum = 0
  for (const v of layer.idf.values()) idfSum += v
  layer.avgIdf = layer.idf.size ? idfSum / layer.idf.size : 1
  return layer
}

// ---------------------------------------------------------------------------
// Base catalog
// ---------------------------------------------------------------------------

const emojiToName = new Map<string, string>()
const nameToEmoji = new Map<string, string>()
const base = makeLayer(false)

for (const entry of DATA) {
  const parts = entry.trim().split(/\s+/)
  const emoji = parts[0]
  const canonical = parts[1]
  if (!emoji || !canonical) continue

  emojiToName.set(emoji, canonical)
  const bare = emoji.replaceAll(VS16, "")
  if (bare !== emoji) emojiToName.set(bare, canonical)
  if (!nameToEmoji.has(canonical)) nameToEmoji.set(canonical, emoji)

  addKey(base, canonical, canonical)
  for (const a of parts.slice(2)) addKey(base, a, canonical)
}

for (const [alias, canonical] of Object.entries(CONCEPT_ALIASES)) {
  if (nameToEmoji.has(canonical)) addKey(base, alias, canonical)
}

sealLayer(base)

export const EMOJI_TO_NAME: ReadonlyMap<string, string> = emojiToName
export const NAME_TO_EMOJI: ReadonlyMap<string, string> = nameToEmoji

// ---------------------------------------------------------------------------
// Custom emoji
// ---------------------------------------------------------------------------

const layerCache = new WeakMap<object, Layer>()

type CustomSource =
  | ReadonlyArray<string | CustomEmojiEntry>
  | Readonly<Record<string, string | CustomEmojiEntry>>
  | { readonly emoji?: Readonly<Record<string, string>> }
  | null
  | undefined

const normalizeCustom = (
  input: unknown,
): Map<string, CustomMeta> | null => {
  if (input == null) return null
  let src: unknown = input
  if (
    typeof src === "object" &&
    src !== null &&
    "emoji" in src &&
    typeof (src as { emoji: unknown }).emoji === "object" &&
    (src as { emoji: unknown }).emoji !== null
  ) {
    src = (src as { emoji: Record<string, string> }).emoji
  }

  const out = new Map<string, CustomMeta>()

  if (Array.isArray(src)) {
    for (const item of src) {
      if (typeof item === "string") {
        out.set(item, { url: null, aliasOf: null, id: null, animated: false })
      } else if (item && typeof item === "object" && "name" in item) {
        const e = item as CustomEmojiEntry
        out.set(e.name, {
          url: e.url ?? null,
          aliasOf: e.aliasOf ?? null,
          id: e.id ?? null,
          animated: e.animated ?? false,
        })
      }
    }
  } else if (typeof src === "object" && src !== null) {
    for (const [name, value] of Object.entries(src as Record<string, unknown>)) {
      if (typeof value === "string" && value.startsWith("alias:")) {
        out.set(name, {
          url: null,
          aliasOf: value.slice(6),
          id: null,
          animated: false,
        })
      } else if (typeof value === "string") {
        out.set(name, {
          url: value,
          aliasOf: null,
          id: null,
          animated: false,
        })
      } else if (value && typeof value === "object") {
        const e = value as CustomEmojiEntry
        out.set(name, {
          url: e.url ?? null,
          aliasOf: e.aliasOf ?? null,
          id: e.id ?? null,
          animated: e.animated ?? false,
        })
      }
    }
  } else {
    return null
  }

  if (!out.size) return null

  for (const [name, meta] of out) {
    let target = meta.aliasOf
    const seen = new Set([name])
    while (target && out.has(target) && !seen.has(target)) {
      seen.add(target)
      const next = out.get(target)?.aliasOf
      if (!next) break
      target = next
    }
    const resolved =
      target && !out.has(target) ? null : target || null
    if (resolved !== meta.aliasOf) {
      out.set(name, { ...meta, aliasOf: resolved })
    }
  }

  return out
}

const customKeysFor = (name: string): Array<string> => {
  const out = [name]
  const spaced = name.replace(/[-_.]+/g, " ").trim()
  if (spaced !== name) out.push(spaced)
  const undigit = spaced.replace(/\d+$/, "").trim()
  if (undigit && undigit !== spaced) out.push(undigit)
  return out
}

const buildCustomLayer = (map: Map<string, CustomMeta>): Layer => {
  const layer = makeLayer(true)
  for (const [name, meta] of map) {
    const canonical =
      meta.aliasOf && map.has(meta.aliasOf) ? meta.aliasOf : name
    const canonMeta = map.get(canonical)
    layer.meta.set(name, {
      url: meta.url ?? canonMeta?.url ?? null,
      aliasOf: meta.aliasOf,
      id: meta.id ?? canonMeta?.id ?? null,
      animated: meta.animated || (canonMeta?.animated ?? false),
    })
    for (const k of customKeysFor(name)) addKey(layer, k, canonical)
  }
  return sealLayer(layer)
}

const layerFromCustom = (raw: unknown): Layer | null => {
  if (raw == null) return null
  if (typeof raw === "object" && raw !== null && layerCache.has(raw)) {
    return layerCache.get(raw) ?? null
  }
  const map = normalizeCustom(raw)
  if (!map) return null
  const layer = buildCustomLayer(map)
  if (typeof raw === "object" && raw !== null) layerCache.set(raw, layer)
  return layer
}

// ---------------------------------------------------------------------------
// Emoji extraction + skin tones
// ---------------------------------------------------------------------------

let EMOJI_RE: RegExp
try {
  EMOJI_RE = new RegExp(
    "(?:\\p{RI}\\p{RI})|" +
      "\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?" +
      "(?:\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)?)*",
    "gu",
  )
} catch {
  EMOJI_RE = /[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF\uFE0F\u200D]+/g
}

export const extractEmoji = (text: string): Array<string> =>
  String(text).match(EMOJI_RE) ?? []

const splitSkinTone = (
  grapheme: string,
): { base: string; tone: string | null } => {
  for (const [mod, name] of Object.entries(SKIN_TONES)) {
    if (grapheme.includes(mod)) {
      return {
        base: grapheme.replace(mod, "").replaceAll(VS16, "") || grapheme,
        tone: name,
      }
    }
  }
  return { base: grapheme.replaceAll(VS16, ""), tone: null }
}

const nameForGrapheme = (
  grapheme: string,
): { name: string; tone: string | null } | null => {
  const direct = emojiToName.get(grapheme) ?? emojiToName.get(grapheme.replaceAll(VS16, ""))
  if (direct) return { name: direct, tone: null }

  const { base: b, tone } = splitSkinTone(grapheme)
  const name =
    emojiToName.get(b) ??
    emojiToName.get(b + VS16) ??
    emojiToName.get(b.replaceAll(VS16, ""))
  if (!name) return null
  return { name, tone }
}

// ---------------------------------------------------------------------------
// Fuzzy search
// ---------------------------------------------------------------------------

const levenshtein = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let cur0 = i
    let minRow = cur0
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const cur = Math.min(prev[j]! + 1, cur0 + 1, prev[j - 1]! + cost)
      prev[j - 1] = cur0
      cur0 = cur
      if (cur < minRow) minRow = cur
    }
    prev[b.length] = cur0
    if (minRow > max) return max + 1
  }
  return prev[b.length]!
}

const fuzzyByEdit = (layer: Layer, query: string, bonus: number): Scored | null => {
  if (query.length < 3) return null
  const maxDist = query.length <= 4 ? 1 : 2
  let best: Scored | null = null
  for (const key of layer.keys) {
    const k = squash(key)
    if (Math.abs(k.length - query.length) > maxDist) continue
    const d = levenshtein(query, k, maxDist)
    if (d > maxDist) continue
    const score = (d === 0 ? 0.9 : d === 1 ? 0.75 : 0.6) + bonus
    if (!best || score > best.score) {
      const name = layer.lookup.get(key)
      if (name) best = { name, score, layer }
    }
  }
  return best
}

const termCandidates = (layer: Layer, t: string): Set<string> => {
  const out = new Set<string>()
  const exact = layer.tokenIndex.get(t)
  if (exact) for (const n of exact) out.add(n)
  if (t.length >= 3) {
    for (const [tok, names] of layer.tokenIndex) {
      if (tok.startsWith(t) || t.startsWith(tok)) {
        for (const n of names) out.add(n)
      }
    }
  }
  return out
}

const bm25Search = (
  layer: Layer,
  rawQuery: string,
  bonus: number,
): Scored | null => {
  const qTokens = tokens(rawQuery)
  if (!qTokens.length) return null

  const scores = new Map<string, number>()
  for (const t of qTokens) {
    const idf = layer.idf.get(t) ?? layer.avgIdf * 0.5
    for (const name of termCandidates(layer, t)) {
      // score names by summing BM25-ish over their keys
      let bestForName = 0
      for (let i = 0; i < layer.keys.length; i++) {
        const key = layer.keys[i]!
        if (layer.lookup.get(key) !== name) continue
        const doc = layer.docs.get(i)
        if (!doc) continue
        const tf = layer.postings.get(t)?.get(i) ?? (
          squash(key).includes(t) ? 1 : 0
        )
        if (!tf) continue
        const denom =
          tf + BM25_K1 * (1 - BM25_B + (BM25_B * doc.len) / layer.avgdl)
        const part = idf * ((tf * (BM25_K1 + 1)) / denom)
        if (part > bestForName) bestForName = part
      }
      if (bestForName > 0) {
        scores.set(name, (scores.get(name) ?? 0) + bestForName)
      }
    }
  }

  let best: Scored | null = null
  for (const [name, raw] of scores) {
    let score = Math.min(0.92, 0.45 + raw * 0.12) + bonus
    if (POPULAR.has(name)) score += 0.03
    if (!best || score > best.score) best = { name, score, layer }
  }
  return best
}

const fuzzyBySubstring = (
  layer: Layer,
  query: string,
  bonus: number,
): Scored | null => {
  if (query.length < 3) return null
  let best: Scored | null = null
  for (const key of layer.keys) {
    const k = squash(key)
    let score: number | null = null
    // Key starts with the whole query (query is a prefix of a known key).
    if (k.startsWith(query)) {
      score = 0.72 - Math.abs(k.length - query.length) * 0.01
    // Query starts with key only when the key is long enough — otherwise
    // "x" would match every string that begins with x.
    } else if (query.startsWith(k) && k.length >= 4) {
      score = 0.72 - Math.abs(k.length - query.length) * 0.01
    } else if (
      query.length >= 4 &&
      k.length >= 4 &&
      (k.includes(query) || query.includes(k))
    ) {
      score = 0.6 - Math.abs(k.length - query.length) * 0.01
    }
    if (score !== null && (!best || score + bonus > best.score)) {
      const name = layer.lookup.get(key)
      if (name) best = { name, score: score + bonus, layer }
    }
  }
  return best
}

const searchLayer = (
  layer: Layer,
  stripped: string,
  q: string,
  bonus: number,
): Scored | null => {
  const candidates = [
    bm25Search(layer, stripped, bonus),
    fuzzyBySubstring(layer, q, bonus),
    fuzzyByEdit(layer, q, bonus),
  ].filter((c): c is Scored => c !== null)
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] ?? null
}

// ---------------------------------------------------------------------------
// Build match
// ---------------------------------------------------------------------------

const buildMatch = (
  name: string,
  tone: string | null,
  score: number,
  customLayer: Layer | null,
): Match => {
  const isCustom = customLayer !== null
  const emoji = isCustom ? null : (nameToEmoji.get(name) ?? null)
  const meta = isCustom ? customLayer.meta.get(name) : undefined
  let shortcode = `:${name}:`
  if (tone) shortcode += `:${tone}:`

  const match: Match = {
    name,
    shortcode,
    emoji,
    score: Number(Math.min(1, score).toFixed(3)),
  }
  if (tone) {
    return {
      ...match,
      tone,
      ...(isCustom
        ? {
            custom: true,
            url: meta?.url ?? null,
            id: meta?.id ?? null,
            animated: meta?.animated ?? false,
          }
        : {}),
    }
  }
  if (isCustom) {
    return {
      ...match,
      custom: true,
      url: meta?.url ?? null,
      id: meta?.id ?? null,
      animated: meta?.animated ?? false,
    }
  }
  return match
}

// ---------------------------------------------------------------------------
// Public pure API
// ---------------------------------------------------------------------------

export interface Registry {
  resolve(input: string | null | undefined, opts?: ResolveOptions): Match | null
  suggest(input: string, n?: number, opts?: ResolveOptions): Array<Match>
  setCustom(input: unknown): number
  listCustom(): Array<string>
  getCustomLayer(): Layer | null
}

export const createRegistry = (): Registry => {
  let installedCustom: Layer | null = null

  const customFor = (opts?: ResolveOptions): Layer | null => {
    if (opts && "customEmoji" in opts && opts.customEmoji !== undefined) {
      return layerFromCustom(opts.customEmoji)
    }
    return installedCustom
  }

  const resolve = (
    input: string | null | undefined,
    opts: ResolveOptions = {},
  ): Match | null => {
    const minScore = opts.minScore ?? 0.5
    if (input == null) return null
    const raw = String(input).trim()
    if (!raw) return null

    const custom = customFor(opts)

    for (const grapheme of extractEmoji(raw)) {
      const hit = nameForGrapheme(grapheme)
      if (hit) return buildMatch(hit.name, hit.tone, 1, null)
    }

    const stripped = raw.replace(/^:+|:+$/g, "").trim()
    const q = squash(stripped)
    if (!q) return null

    if (custom) {
      const exact = custom.lookup.get(stripped)
      if (exact) return buildMatch(exact, null, 0.99, custom)
      const norm = custom.norm.get(q)
      if (norm) return buildMatch(norm, null, 0.96, custom)
      if (q.length >= 3) {
        const pick = searchLayer(custom, stripped, q, CUSTOM_BOOST)
        if (pick && pick.score >= CUSTOM_THRESHOLD) {
          return buildMatch(pick.name, null, pick.score, custom)
        }
      }
    }

    const exactB = base.lookup.get(stripped)
    if (exactB) return buildMatch(exactB, null, 0.98, null)
    const normB = base.norm.get(q)
    if (normB) return buildMatch(normB, null, 0.95, null)

    if (q.length < 3) return null

    const winner = searchLayer(base, stripped, q, 0)
    if (!winner || winner.score < minScore) return null
    return buildMatch(winner.name, null, winner.score, null)
  }

  const suggest = (
    input: string,
    n = 5,
    opts: ResolveOptions = {},
  ): Array<Match> => {
    const stripped = String(input).replace(/^:+|:+$/g, "").trim()
    const q = squash(stripped)
    const custom = customFor(opts)
    const scored = new Map<string, Scored>()
    const add = (c: Scored | null) => {
      if (!c) return
      const prev = scored.get(c.name)
      if (!prev || c.score > prev.score) scored.set(c.name, c)
    }
    const layers: Array<[Layer, number]> = custom
      ? [
          [base, 0],
          [custom, CUSTOM_BOOST],
        ]
      : [[base, 0]]
    for (const [layer, bonus] of layers) {
      add(bm25Search(layer, stripped, bonus))
      add(fuzzyBySubstring(layer, q, bonus))
      add(fuzzyByEdit(layer, q, bonus))
      for (const key of layer.keys) {
        if (q && squash(key).includes(q)) {
          const name = layer.lookup.get(key)
          if (name) add({ name, score: 0.5 + bonus, layer })
        }
      }
    }
    return [...scored.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((c) =>
        buildMatch(
          c.name,
          null,
          c.score,
          c.layer?.isCustom ? c.layer : null,
        ),
      )
  }

  return {
    resolve,
    suggest,
    setCustom(input: unknown): number {
      if (input == null) {
        installedCustom = null
        return 0
      }
      const map = normalizeCustom(input)
      installedCustom = map ? buildCustomLayer(map) : null
      return installedCustom ? installedCustom.meta.size : 0
    },
    listCustom(): Array<string> {
      return installedCustom ? [...installedCustom.meta.keys()] : []
    },
    getCustomLayer(): Layer | null {
      return installedCustom
    },
  }
}

/** Shared process-wide registry used by the public converters. */
export const defaultRegistry = createRegistry()

// ---------------------------------------------------------------------------
// Formatters (pure)
// ---------------------------------------------------------------------------

export const textToShortcode = (text: string): string =>
  String(text).replace(EMOJI_RE, (m) => {
    const hit = nameForGrapheme(m)
    if (!hit) return m
    return hit.tone ? `:${hit.name}::${hit.tone}:` : `:${hit.name}:`
  })

export const toUnicode = (
  input: string | null | undefined,
  opts?: ResolveOptions,
): string | null => {
  const hit = defaultRegistry.resolve(input, opts)
  return hit?.emoji ?? (opts?.fallback !== undefined ? opts.fallback : null)
}

// silence unused type import if any
export type { CustomSource }
