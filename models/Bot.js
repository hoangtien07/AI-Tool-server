import mongoose from "mongoose";

/* i18n atom */
const Localized = new mongoose.Schema(
  { vi: String, en: String },
  { _id: false }
);

const PricingTier = new mongoose.Schema(
  {
    plan: { type: Localized, required: true },
    priceText: { type: Localized, required: true },
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
/* helpers ngắn gọn */
const toSlug = (s = "") =>
  s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const uniqueTags = (arr = []) => [
  ...new Set(
    (Array.isArray(arr) ? arr : [])
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
  ),
];

const flattenLocList = (list = []) =>
  (Array.isArray(list) ? list : [])
    .flatMap((x) => [x?.vi, x?.en])
    .filter(Boolean)
    .map(String);

const buildKeywords = (doc) => {
  const set = new Set();
  uniqueTags(doc.tags).forEach((t) => set.add(t));
  flattenLocList(doc.features).forEach((v) => set.add(v));
  flattenLocList(doc.strengths).forEach((v) => set.add(v));
  flattenLocList(doc.weaknesses).forEach((v) => set.add(v));
  flattenLocList(doc.targetUsers).forEach((v) => set.add(v));
  (doc.pricing || []).forEach((p) => {
    if (p?.plan?.vi) set.add(p.plan.vi);
    if (p?.plan?.en) set.add(p.plan.en);
    if (p?.priceText?.vi) set.add(p.priceText.vi);
    if (p?.priceText?.en) set.add(p.priceText.en);
  });
  return Array.from(set).slice(0, 200);
};

/* schema */
const botSchema = new mongoose.Schema(
  {
    // i18n text
    name: { type: Map, of: String, required: true }, // {vi,en}
    title: { type: Map, of: String },
    summary: { type: Map, of: String },
    description: { type: Map, of: String },

    // i18n list
    features: { type: [Localized], default: [] },
    strengths: { type: [Localized], default: [] },
    weaknesses: { type: [Localized], default: [] },
    targetUsers: { type: [Localized], default: [] },

    // pricing i18n
    pricing: { type: [PricingTier], default: [] },

    // non-i18n
    slug: { type: String, required: true, unique: true, index: true },
    externalKey: { type: String, unique: true, sparse: true },
    image: String,
    affiliateLink: String,
    originUrl: String,
    headquarters: String,
    foundedYear: Number,
    category: { type: String, index: true },
    tags: { type: [String], default: [] },
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

/* text index (duy nhất) */
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
    searchKeywords: "text",
  },
  {
    name: "bot_text_idx",
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
      searchKeywords: 2,
    },
    default_language: "english",
  }
);

/* slug duy nhất từ title/name */
botSchema.methods.ensureUniqueSlug = async function () {
  const Model = this.constructor;
  const baseText =
    (this.title && (this.title.get?.("vi") || this.title.get?.("en"))) ||
    (this.name && (this.name.get?.("vi") || this.name.get?.("en"))) ||
    "";
  const base = toSlug(this.slug || baseText || String(this._id));
  let candidate = base || String(this._id);
  let i = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug: candidate, _id: { $ne: this._id } })) {
    candidate = `${base}-${i++}`;
  }
  this.slug = candidate;
};

/* chuẩn hoá */
botSchema.pre("validate", async function (next) {
  if (!this.slug) await this.ensureUniqueSlug();
  this.tags = uniqueTags(this.tags);
  this.searchKeywords = buildKeywords(this);
  if (typeof this.foundedYear === "string") {
    const n = Number(this.foundedYear);
    if (!Number.isNaN(n)) this.foundedYear = n;
  }
  next();
});

/* tránh OverwriteModelError */
const Bot = mongoose.models.Bot ?? mongoose.model("Bot", botSchema);
export default Bot;
