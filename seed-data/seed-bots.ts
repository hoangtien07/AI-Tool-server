
import mongoose from "mongoose";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import dotenv from "dotenv";
import Bot from "../models/Bot.js";

dotenv.config();

type Lang = "vi" | "en";

type SrcItem = {
  key?: string;
  name?: string;
  logo?: string; // -> image
  image?: string; // some rows might already use "image"
  link?: string; // -> affiliateLink
  headquarters?: string;
  founded?: string | number; // -> foundedYear
  summary?: string;
  description?: string;
  tag?: string[]; // -> tags
  tags?: string[];
  features?: string[];
  strengths?: string[];
  weaknesses?: string[];
  pros?: string[]; // -> strengths
  cons?: string[]; // -> weaknesses
  targetUsers?: string[];
  price?: Array<{ service: string; price: string }>; // legacy -> pricing
  seo?: {
    title?: string;
    description?: string;
    ogImage?: string;
    canonical?: string;
  };
};

function getArg(name: string, def?: string) {
  const key = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (key) return key.split("=").slice(1).join("="); // supports equals in value
  const flag = process.argv.includes(`--${name}`);
  return flag ? "true" : def;
}

const MONGODB_URI =
  process.env.MONGODB_URI ||
  getArg("uri") ||
  "mongodb://localhost:27017/ai_tooler";

const FILE = getArg("file", "./groupsData.ts")!;
const LANG = getArg("lang", "vi") as Lang;
const DROP = getArg("drop") === "true";
const DRY = getArg("dry") === "true";
const UPSERT = getArg("upsert", "true") === "true";

function mapLegacyPriceToPricing(src: SrcItem) {
  if (Array.isArray(src.price)) {
    return src.price.map((p) => ({
      plan: p.service,
      priceText: p.price,
    }));
  }
  return [];
}

function asArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  return [String(v)];
}

function normalizeDoc(src: SrcItem) {
  const strengths =
    src.strengths && src.strengths.length ? src.strengths : src.pros || [];
  const weaknesses =
    src.weaknesses && src.weaknesses.length ? src.weaknesses : src.cons || [];
  const tags = src.tags && src.tags.length ? src.tags : src.tag || [];
  return {
    externalKey: src.key,
    name: src.name,
    image: src.image || src.logo,
    affiliateLink: src.link,
    headquarters: src.headquarters,
    foundedYear: src.founded as any, // schema will coerce string->number
    summary: src.summary,
    description: src.description,
    tags: asArray(tags),
    features: asArray(src.features),
    strengths: asArray(strengths),
    weaknesses: asArray(weaknesses),
    targetUsers: asArray(src.targetUsers),
    pricing: mapLegacyPriceToPricing(src),
    seo: src.seo || undefined,
    status: "active" as const,
  };
}

async function main() {
  console.log("Connecting to MongoDB:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  if (DROP) {
    console.log("Dropping existing bots collection...");
    try {
      await mongoose.connection.db?.dropCollection("bots");
      console.log("Dropped 'bots' collection.");
    } catch (e) {
      console.warn("No existing 'bots' collection to drop. Continuing.");
    }
  }

  // Load data file dynamically (works for .ts or .js)
  const fileUrl = pathToFileURL(path.resolve(FILE)).href;
  const mod = await import(fileUrl);
  const raw = mod.botData as any[];
  if (!Array.isArray(raw))
    throw new Error("Expected export const botData = [] in data file.");

  const items = raw
    .map((row: any) => {
      // Each row has shape { en: {...}, vi: {...} }
      const src = (row?.[LANG] || row?.en || row?.vi) as SrcItem;
      if (!src?.name) {
        console.warn("Skipping row without name:", row);
        return null;
      }
      return normalizeDoc(src);
    })
    .filter(Boolean) as ReturnType<typeof normalizeDoc>[];

  console.log(
    `Prepared ${items.length} items from ${path.basename(
      FILE
    )} (lang=${LANG}). DRY=${DRY} UPSERT=${UPSERT}`
  );

  if (DRY) {
    console.log(items.slice(0, 2));
    await mongoose.disconnect();
    return;
  }

  let created = 0,
    updated = 0,
    skipped = 0,
    errors = 0;

  for (const payload of items) {
    try {
      // Prefer upsert by externalKey, fallback to name
      const query: any = payload.externalKey
        ? { externalKey: payload.externalKey }
        : { name: payload.name };
      if (UPSERT) {
        // Try to find existing, then update via doc.save() so middleware runs (slug/tags/keywords)
        const existing = await Bot.findOne(query);
        if (existing) {
          existing.set(payload);
          await existing.save();
          updated++;
        } else {
          await new Bot(payload).save();
          created++;
        }
      } else {
        // Insert only, skip if exists
        const exists = await Bot.exists(query);
        if (exists) {
          skipped++;
        } else {
          await new Bot(payload).save();
          created++;
        }
      }
    } catch (err: any) {
      errors++;
      if (err?.code === 11000) {
        // Duplicate key (name/slug unique)
        console.warn("Duplicate:", err.keyValue);
      } else {
        console.error("Error saving doc:", err?.message || err);
      }
    }
  }

  console.log(
    `Done. created=${created}, updated=${updated}, skipped=${skipped}, errors=${errors}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
