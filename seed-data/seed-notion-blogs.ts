/**
 * Usage:
 *   npx tsx ./seed-data/seed-notion-blogs.ts --url="https://www.notion.so/Top-AI-Tools-N-m-2025-10-C-ng-C-Gi-p-B-n-B-t-Ph-Trong-K-Nguy-n-S-25aa2873ccd4800b9163e08552cc6146?source=copy_link" --lang=vi --tags=ai,tools --publish
 */

import mongoose from "mongoose";
import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import dotenv from "dotenv";

// 🔧 Adjust to your project:
import Blog from "../models/Blog.js";

dotenv.config();

function arg(name: string, def?: string) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const flag = process.argv.includes(`--${name}`);
  return flag ? "true" : def;
}

const MONGODB_URI =
  process.env.MONGODB_URI ||
  arg("uri") ||
  "mongodb://127.0.0.1:27017/ai_tooler";
const NOTION_URL = arg("url");
const FILE = arg("file");
const LANG = (arg("lang", "vi") || "vi") as "vi" | "en";
const EXTRA_TAGS = (arg("tags") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const PUBLISH = arg("publish") === "true";
const DRY = arg("dry") === "true";

function withPvs4(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("pvs", "4");
    return u.toString();
  } catch {
    return url.includes("pvs=")
      ? url
      : url + (url.includes("?") ? "&" : "?") + "pvs=4";
  }
}

function getNotionPageId(url: string) {
  const m = url.match(/[a-f0-9]{32}/i);
  return m?.[0]?.toLowerCase() || null;
}

function absolutize(baseUrl: string, maybeUrl?: string | null) {
  if (!maybeUrl) return undefined;
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return maybeUrl || undefined;
  }
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "seed-notion/1.0 (+node)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${res.statusText}`);
  return await res.text();
}

function firstNonEmptyText($: any, root: any) {
  const text = ($(root).text?.() || String(root)).replace(/\s+/g, " ").trim();
  return text.slice(0, 200);
}

function extract(html: string, pageUrl: string) {
  const $: any = cheerio.load(html);

  // Title: prefer h1 over OG (OG on Notion can be generic)
  const h1Title = $("h1").first().text().trim();
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  const title =
    h1Title || ogTitle || $("title").first().text().trim() || "Untitled";

  // image: og:image or first content image
  const ogImage = $('meta[property="og:image"]').attr("content")?.trim();
  const firstImg = $("img").first().attr("src");
  const image = absolutize(pageUrl, ogImage) || absolutize(pageUrl, firstImg);

  // Prefer <article>, else fallback
  let container: any = $("article").first();
  if (!container || container.length === 0) container = $("main").first();
  if (!container || container.length === 0) container = $("#root").first();
  if (!container || container.length === 0) container = $("body").first();

  // Clean out non-content
  container.find("script, header, nav, footer").remove();

  // Fix images and links
  container.find("img").each((_: any, el: any) => {
    const img = $(el);
    const src = img.attr("src");
    const fixed = absolutize(pageUrl, src);
    if (fixed) img.attr("src", fixed);
    img.attr("loading", "lazy");
    img.attr("decoding", "async");
  });

  container.find("a").each((_: any, el: any) => {
    const a = $(el);
    const href = a.attr("href");
    const fixed = absolutize(pageUrl, href);
    if (fixed) a.attr("href", fixed);
    a.attr("rel", "nofollow noopener noreferrer");
    a.attr("target", "_blank");
  });

  // Inner HTML
  const rawHtml = container.html() || "";

  // ✅ Safe sanitize: explicitly list allowed tags (NO <style>)
  const allowedTags = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "img",
    "code",
    "pre",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "hr",
    "br",
    "span",
    "div",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ];

  const clean = sanitizeHtml(rawHtml, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "loading", "decoding"],
      "*": ["id", "class"],
    },
    // Do NOT allow style tag; also do not allow style attribute
    disallowedTagsMode: "discard",
    transformTags: {
      a: (t, attr) => ({
        tagName: "a",
        attribs: {
          ...attr,
          rel: "nofollow noopener noreferrer",
          target: "_blank",
        },
      }),
    },
  });

  // Extract hashtags
  const tags = new Set<string>();
  container.find("h1,h2,h3,p,li").each((_: any, el: any) => {
    const text = $(el).text();
    (text.match(/#([A-Za-z0-9\-_]+)/g) || []).forEach((t: string) =>
      tags.add(t.replace(/^#/, ""))
    );
  });

  const excerpt = firstNonEmptyText($, container);

  return { title, image, content: clean, tags: Array.from(tags), excerpt };
}

async function upsertBlog(payload: any) {
  const q: any[] = [];
  if (payload.externalKey) q.push({ externalKey: payload.externalKey });
  if (payload.sourceUrl) q.push({ sourceUrl: payload.sourceUrl });
  q.push({ title: payload.title });

  // ⬇️ Allow extra fields even if not in schema
  const doc = await (Blog as any).findOneAndUpdate(
    { $or: q },
    { $set: payload },
    { upsert: true, new: true, strict: false, setDefaultsOnInsert: true }
  );
  return doc;
}

async function importOne(url: string) {
  const pageUrl = withPvs4(url.trim());
  if (!pageUrl) return;
  const pageId = getNotionPageId(pageUrl);

  console.log(`\n→ Fetching: ${pageUrl}`);
  const html = await fetchHtml(pageUrl);
  const extracted = extract(html, pageUrl);

  const payload: any = {
    title: extracted.title,
    content: extracted.content,
    image: extracted.image,
    tags: [...new Set([...(extracted.tags || []), ...EXTRA_TAGS, LANG])],
    excerpt: extracted.excerpt,
    status: "active",
    source: "notion",
    sourceUrl: pageUrl,
    externalKey: pageId ? `notion:${pageId}` : undefined,
  };
  if (PUBLISH) payload.publishedAt = new Date().toISOString();

  console.log("   Parsed:", {
    title: payload.title,
    image: payload.image,
    tags: payload.tags,
  });
  if (DRY) return null;

  const doc = await upsertBlog(payload);
  console.log("   Saved:", { id: doc?._id?.toString(), title: doc?.title });
  return doc;
}

async function main() {
  const inputs: string[] = [];

  if (NOTION_URL) inputs.push(NOTION_URL);
  if (FILE) {
    const text = fs.readFileSync(path.resolve(FILE), "utf-8");
    text.split(/\r?\n/).forEach((line) => {
      const u = line.trim();
      if (u) inputs.push(u);
    });
  }
  if (!inputs.length) {
    console.error(
      "Provide --url=<public notion url> or --file=<list-of-urls.txt>"
    );
    process.exit(1);
  }

  console.log("Connecting to MongoDB:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  for (const u of inputs) {
    try {
      await importOne(u);
    } catch (e: any) {
      console.error("   Failed:", e?.message || e);
    }
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
