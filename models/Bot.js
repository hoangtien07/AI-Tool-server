// models/Bot.js
import mongoose from "mongoose";

const LocalizedSub = { vi: String, en: String };

const PricingTier = new mongoose.Schema(
  {
    plan: LocalizedSub,
    priceText: LocalizedSub,
    amount: Number,
    currency: { type: String, default: "USD" },
    interval: {
      type: String,
      enum: ["month", "year", "one_time", "other"],
      default: "month",
    },
  },
  { _id: false }
);

const toSlug = (s = "") =>
  s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toLoc = (v) => {
  if (!v) return { vi: "", en: "" };
  if (typeof v === "object" && ("vi" in v || "en" in v)) return v;
  const s = String(v);
  return { vi: s, en: s };
};
const toLocList = (arr) =>
  (Array.isArray(arr) ? arr : [arr])
    .filter((x) => x !== undefined && x !== null)
    .map((x) => (typeof x === "string" ? { vi: x, en: x } : toLoc(x)));

const coercePricing = (arr) =>
  (Array.isArray(arr) ? arr : [arr]).map((p) => ({
    plan: toLoc(p?.plan),
    priceText: toLoc(p?.priceText),
    amount: p?.amount,
    currency: p?.currency ?? "USD",
    interval: p?.interval ?? "month",
  }));

const uniqueTags = (arr = []) => [
  ...new Set(
    (Array.isArray(arr) ? arr : [])
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
  ),
];

const botSchema = new mongoose.Schema(
  {
    // i18n text
    name: { type: Map, of: String, required: true },
    title: { type: Map, of: String },
    summary: { type: Map, of: String },
    description: { type: Map, of: String },

    // i18n lists
    features: { type: [LocalizedSub], default: [], set: toLocList },
    strengths: { type: [LocalizedSub], default: [], set: toLocList },
    weaknesses: { type: [LocalizedSub], default: [], set: toLocList },
    targetUsers: { type: [LocalizedSub], default: [], set: toLocList },

    // pricing
    pricing: { type: [PricingTier], default: [], set: coercePricing },

    // non-i18n
    slug: { type: String, required: true, unique: true, index: true },
    externalKey: { type: String, unique: true, sparse: true },
    image: String,
    affiliateLink: String,
    originUrl: String,
    headquarters: String,
    foundedYear: Number,
    category: {
      type: String,
      enum: [
        "customer-support",
        "ai-education",
        "office-ai",
        "growth-marketing",
        "writing-editing",
        "technology-it",
        "design-creative",
        "workflow-automation",
      ],
      index: true,
    },
    tags: { type: [String], default: [] },

    views: { type: Number, default: 0, index: true },
    clicks: { type: Number, default: 0 },

    seo: {
      title: String,
      description: String,
      ogImage: String,
      canonical: String,
    },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

botSchema.index(
  {
    "name.vi": "text",
    "name.en": "text",
    "title.vi": "text",
    "title.en": "text",
    "summary.vi": "text",
    "summary.en": "text",
    "description.vi": "text",
    "description.en": "text",
    "features.vi": "text",
    "features.en": "text",
    "strengths.vi": "text",
    "strengths.en": "text",
    "weaknesses.vi": "text",
    "weaknesses.en": "text",
    "targetUsers.vi": "text",
    "targetUsers.en": "text",
    "pricing.plan.vi": "text",
    "pricing.plan.en": "text",
    "pricing.priceText.vi": "text",
    "pricing.priceText.en": "text",
    tags: "text",
  },
  {
    name: "bot_text_idx",
    default_language: "english",
    weights: {
      "name.vi": 10,
      "name.en": 10,
      "title.vi": 9,
      "title.en": 9,
      "summary.vi": 6,
      "summary.en": 6,
      "description.vi": 4,
      "description.en": 4,
      "features.vi": 3,
      "features.en": 3,
      "strengths.vi": 3,
      "strengths.en": 3,
      "weaknesses.vi": 2,
      "weaknesses.en": 2,
      "targetUsers.vi": 2,
      "targetUsers.en": 2,
      "pricing.plan.vi": 2,
      "pricing.plan.en": 2,
      "pricing.priceText.vi": 2,
      "pricing.priceText.en": 2,
      tags: 2,
    },
  }
);

botSchema.methods.ensureUniqueSlug = async function () {
  const Model = this.constructor;
  const baseText =
    (this.title && (this.title.get?.("vi") || this.title.get?.("en"))) ||
    (this.name && (this.name.get?.("vi") || this.name.get?.("en"))) ||
    "";
  const base = toSlug(this.slug || baseText || String(this._id));
  let candidate = base || String(this._id);
  let i = 2;
  while (await Model.exists({ slug: candidate, _id: { $ne: this._id } })) {
    candidate = `${base}-${i++}`;
  }
  this.slug = candidate;
};

botSchema.pre("validate", async function (next) {
  if (!this.slug) await this.ensureUniqueSlug();
  this.tags = uniqueTags(this.tags);
  if (typeof this.foundedYear === "string") {
    const n = Number(this.foundedYear);
    if (!Number.isNaN(n)) this.foundedYear = n;
  }
  next();
});

const MODEL = "Bot";
try {
  if (mongoose.modelNames().includes(MODEL)) {
    if (typeof mongoose.deleteModel === "function") mongoose.deleteModel(MODEL);
    else delete mongoose.connection.models[MODEL];
  }
} catch {}
export default mongoose.model(MODEL, botSchema);
