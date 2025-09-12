/* eslint-disable no-console */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const DB_NAME = process.env.MONGODB_DB || "test";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");
  await mongoose.connect(uri, { dbName: DB_NAME });
  console.log("Connected.");

  // (A) Xoá cho tất cả:
  // const r = await mongoose.connection.db.collection("bots")
  //   .updateMany({}, { $unset: { category: "" } });

  // (B) Chỉ xoá các category đã backfill:
  const KEYS = [
    "design-creative",
    "growth-marketing",
    "technology-it",
    "writing-editing",
    "office-ai",
    "workflow-automation",
    "customer-support",
    "ai-education",
  ];
  const r = await mongoose.connection.db
    .collection("bots")
    .updateMany({ category: { $in: KEYS } }, { $unset: { category: "" } });
  console.log(`Unset category on ${r.modifiedCount} bots`);

  // (tuỳ chọn) drop index
  try {
    await mongoose.connection.db
      .collection("bots")
      .dropIndex("category_1_status_1");
    console.log("Dropped index category_1_status_1");
  } catch (e) {
    console.log("Skip drop index:", e.message);
  }

  const stat = await mongoose.connection.db
    .collection("bots")
    .aggregate([
      { $group: { _id: "$category", c: { $sum: 1 } } },
      { $sort: { c: -1 } },
    ])
    .toArray();
  console.table(stat);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
