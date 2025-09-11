/* eslint-disable no-console */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Bot from "../models/Bot.js"; // đường dẫn model của bạn

dotenv.config();

const CATEGORY_KEYS = [
  "growth-marketing",
  "design-creative",
  "office-ai",
  "writing-editing",
  "technology-it",
  "workflow-automation",
  "customer-support",
  "ai-education",
];

// map keyword → category
const KEYMAP = [
  // Growth & Marketing
  {
    cat: "growth-marketing",
    kw: ["marketing", "growth", "seo", "ads", "affiliate", "campaign"],
  },

  // Design & Creative
  {
    cat: "design-creative",
    kw: [
      "design",
      "creative",
      "image",
      "video",
      "avatar",
      "graphic",
      "logo",
      "photo",
    ],
  },

  // Office
  {
    cat: "office-ai",
    kw: [
      "office",
      "document",
      "doc",
      "word",
      "pdf",
      "note",
      "spreadsheet",
      "excel",
      "ppt",
      "presentation",
      "meeting",
      "minutes",
    ],
  },

  // Writing & Editing
  {
    cat: "writing-editing",
    kw: [
      "write",
      "writing",
      "copy",
      "copywriting",
      "blog",
      "article",
      "book",
      "story",
      "edit",
      "grammar",
    ],
  },

  // Technology & IT
  {
    cat: "technology-it",
    kw: [
      "developer",
      "dev",
      "code",
      "coding",
      "api",
      "test",
      "devops",
      "github",
      "programming",
    ],
  },

  // Workflow automation
  {
    cat: "workflow-automation",
    kw: [
      "automation",
      "automate",
      "workflow",
      "pipeline",
      "schedule",
      "agent",
      "zapier",
    ],
  },

  // Customer support
  {
    cat: "customer-support",
    kw: ["customer", "support", "chatbot", "helpdesk", "ticket", "crm"],
  },

  // AI Education
  {
    cat: "ai-education",
    kw: [
      "education",
      "learn",
      "learning",
      "teacher",
      "student",
      "course",
      "classroom",
    ],
  },
];

// suy đoán category từ tags + text
function inferCategory(b) {
  if (b.category && CATEGORY_KEYS.includes(b.category)) return b.category;

  const hay = [
    ...(b.tags || []),
    b?.name?.vi,
    b?.name?.en,
    b?.title?.vi,
    b?.title?.en,
    b?.summary?.vi,
    b?.summary?.en,
    b?.description?.vi,
    b?.description?.en,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const m of KEYMAP) {
    if (m.kw.some((k) => hay.includes(k))) return m.cat;
  }

  // fallback nếu không đoán được
  return "technology-it";
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");

  await mongoose.connect(uri);
  console.log("Connected.");

  // tạo index cho category + status nếu chưa có
  try {
    await Bot.collection.createIndex({ category: 1, status: 1 });
  } catch (e) {
    // ignore
  }

  const bots = await Bot.find(
    {},
    {
      _id: 1,
      name: 1,
      title: 1,
      tags: 1,
      category: 1,
      summary: 1,
      description: 1,
    }
  ).lean();

  let updated = 0;
  for (const b of bots) {
    const cat = inferCategory(b);
    if (b.category !== cat) {
      await Bot.updateOne({ _id: b._id }, { $set: { category: cat } });
      updated++;
    }
  }

  const stat = await Bot.aggregate([
    { $group: { _id: "$category", c: { $sum: 1 } } },
  ]);
  console.table(stat);
  console.log(`Updated ${updated} bots.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
