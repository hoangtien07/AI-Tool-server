import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      // Cấu hình cho Google OAuth
      clientID: process.env.GOOGLE_CLIENT_ID, // ID client từ Google
      clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Secret từ Google
      callbackURL: "/auth/google/callback", // Đường dẫn callback
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Tìm kiếm người dùng trong cơ sở dữ liệu bằng googleId
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          // Nếu không tìm thấy người dùng, tạo mới
          user = new User({
            googleId: profile.id,
            username: profile.displayName || profile.name.givenName, // Lấy tên người dùng
            email: profile.emails[0].value, // Lấy email đầu tiên
            thumbnail: profile._json.picture, // Lưu đường dẫn ảnh đại diện
          });
          await user.save();
        }
        done(null, user); // Gọi hàm done với đối tượng user
      } catch (error) {
        done(error, null); // Gọi hàm done với lỗi nếu có
      }
    }
  )
);

// Xác thực người dùng
passport.serializeUser((user, done) => {
  done(null, user.id); // Lưu ID người dùng vào session
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id); // Tìm người dùng từ ID
    done(null, user); // Gọi hàm done với đối tượng user
  } catch (error) {
    done(error, null); // Gọi hàm done với lỗi nếu có
  }
});
