// server/config/db.js
import mongoose from "mongoose";

// const connectDB = async () => {
//   console.log("start");

//   try {
//     await mongoose.connect(process.env.MONGO_URI);
//     console.log("Database:", mongoose.connection.name);
//   } catch (error) {
//     console.error("MongoDB connection error:", error);
//     process.exit(1);
//   }
// };

const clientOptions = {
  serverApi: { version: "1", strict: true, deprecationErrors: true },
};
const connectDB = async () => {
   const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
   if (!uri) {
     console.error("Missing MONGODB_URI / MONGO_URI in environment.");
     process.exit(1);
   }
   try {
     await mongoose.connect(uri, clientOptions);
     // Ping để xác nhận kết nối
     await mongoose.connection.db.admin().command({ ping: 1 });
     console.log("✅ Connected to MongoDB:", mongoose.connection.name);
   } catch (err) {
     console.error("❌ MongoDB connection error:", err);
     process.exit(1);
   }
};

export default connectDB;
