// server/config/db.js
import mongoose from "mongoose";

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!uri) {
  console.error("❌ Missing MONGODB_URI/MONGO_URI env");
  process.exit(1);
}

const connectDB = async () => {
  console.log("start");

  try {
    await mongoose.connect(uri);
    console.log("Database:", mongoose.connection.name);
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
console.log(
  "MONGO env present:",
  !!process.env.MONGODB_URI || !!process.env.MONGO_URI
);

export default connectDB;
