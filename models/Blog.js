import mongoose from "mongoose";

const pricingTier = new mongoose.Schema(
  {
    plan: { type: String, required: true },
    priceText: { type: String, required: true },
    amount: { type: Number },
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

const normalizeTags = (arr = []) => [
  ...new Set(arr.map((t) => t.toString().trim().toLowerCase()).filter(Boolean)),
];

const buildKeywords = (doc) => {
  const kws = new Set();
  normalizeTags(doc.tags).forEach((t) => kws.add(t));
  (doc.features || []).forEach((f) => kws.add(f));
  (doc.targetUsers || []).forEach((u) => kws.add(u));
  (doc.strengths || []).forEach((p) => kws.add(p));
  (doc.weaknesses || []).forEach((c) => kws.add(c));
  return Array.from(kws).slice(0, 200);
};

const botSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true }, // cần cho /slug/:slug
    name: { type: Map, of: String, required: true }, // { vi, en, ... }
    summary: { type: Map, of: String },
    description: { type: Map, of: String },
    category: { type: String, index: true },

    tags: { type: [String], default: [] },
    features: { type: [String], default: [] },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    targetUsers: { type: [String], default: [] },
    pricing: { type: [pricingTier], default: [] },

    views: { type: Number, default: 0, index: true },
    clicks: { type: Number, default: 0 },
    searchKeywords: { type: [String], default: [] },

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

// text index (chỉ 1 text index/collection)
botSchema.index(
  {
    "name.vi": "text",
    "name.en": "text",
    "summary.vi": "text",
    "summary.en": "text",
    "description.vi": "text",
    "description.en": "text",
    tags: "text",
    features: "text",
    strengths: "text",
    weaknesses: "text",
    targetUsers: "text",
    searchKeywords: "text",
  },
  {
    name: "bot_text_idx",
    weights: {
      "name.vi": 10,
      "name.en": 10,
      "summary.vi": 6,
      "summary.en": 6,
      "description.vi": 4,
      "description.en": 4,
      tags: 3,
      features: 3,
      strengths: 2,
      weaknesses: 1,
      targetUsers: 2,
      searchKeywords: 2,
    },
    default_language: "english",
  }
);

function baseFromName(name) {
  if (typeof name === "string") return name;
  if (name && typeof name === "object")
    return name.vi || name.en || Object.values(name)[0] || "";
  return "";
}

// tạo slug duy nhất
botSchema.methods.ensureUniqueSlug = async function ensureUniqueSlug() {
  const Model = this.constructor;
  const base = toSlug(this.slug || baseFromName(this.name) || String(this._id));
  let candidate = base || String(this._id);
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug: candidate, _id: { $ne: this._id } })) {
    candidate = `${base}-${i++}`;
  }
  this.slug = candidate;
};

botSchema.pre("validate", async function (next) {
  if (!this.slug) await this.ensureUniqueSlug();
  this.tags = normalizeTags(this.tags);
  this.searchKeywords = buildKeywords(this);
  next();
});

const Bot = mongoose.model("Bot", botSchema);
export default Bot;
