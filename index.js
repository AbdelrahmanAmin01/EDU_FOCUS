import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import nodemailer from "nodemailer";


//---------------- Cors -----------------//
import cors from "cors";

// تحميل متغيرات البيئة
dotenv.config();


const prisma = new PrismaClient();
const app = express();

// ✅ تفعيل CORS
app.use(cors({
  origin: "http://localhost:5173", // عنوان الفرونت
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

//---------------- Cors -----------------//

app.use(express.json());

// store uploaded images locally for test purposes with .jpg extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ".jpg");
  },
});
const upload = multer({ storage });

// JWT Secret - يجب أن يكون في ملف .env
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

// Middleware للتحقق من التوكن
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};


// Create your transporter (configure with your email service)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Function to generate a 6-digit verification code
function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000);
}



// Image Upload Endpoint
app.post("/upload-image", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const imageUrl = `/uploads/${req.file.filename}`; // رابط الصورة

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully",
      imageUrl, // هنا هترجع رابط الصورة
    });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});


// Register User
app.post("/registers", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    console.log("✅ Received registration request");

    // Validate required fields
    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      console.log("❌ Validation failed");
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      console.log("❌ Email already in use");
      return res.status(400).json({ error: "Email already in use" });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create user
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        password:hashedPassword, // Consider hashing before saving
        verificationCode: String(verificationCode),
        isVerified: false,
      },
    });

    console.log("📧 Sending verification email...");

    // Send email
    await transporter.sendMail({
      from: `"Edu Focus" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "🎓 Welcome to Edu Focus! Verify Your Email",
      text: `Hi ${name},

        Thank you for joining Edu Focus!! 🎓

        To complete your registration and verify your email, use the following verification code:

        🔑 Verification Code: ${verificationCode}

        If you didn’t sign up, please ignore this email.

        The Edu Focus Team
        🚀 Your learning journey starts here!`,
    });

    console.log("✅ User registered successfully!");
    res.status(201).json({
      success: true,
      message: "Registration successful. A verification email has been sent.",
      otp: verificationCode, // هنا بنرجع الـ OTP
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        // profile_image_url: newUser.profile_image_url,
      },
    });
  } catch (error) {
    console.error("❌ ERROR in /registers:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.verificationCode !== otp)
      return res.status(400).json({ error: "Invalid OTP" });

    await prisma.user.update({
      where: { email },
      data: { isVerified: true, verificationCode: null },
    });

    res.json({  success: true, message: "Email verified successfully!" });
  } catch (error) {
    console.error("❌ ERROR in /verify-otp:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // البحث عن المستخدم بالإيميل
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ✅ تحقق إذا الحساب مفعل
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Account not verified. Please check your email for the verification code.",
      });
    }

    // ✅ مقارنة كلمة المرور باستخدام bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // ✅ إنشاء JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // ✅ استجابة النجاح
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profile_image_url: user.profile_image_url,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
});


// مسار للتحقق من التوكن
app.get("/verify-token", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Token is valid",
    user: req.user
  });
});

// مسار للحصول على معلومات المستخدم الحالي
app.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        profile_image_url: true,
        created_at: true
      }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
});

// Update (Edit) a user
app.put("/users/:id", authenticateToken, upload.single("profile_image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    // التحقق من أن المستخدم يحدث نفسه أو أن لديه صلاحيات
    if (req.user.id !== id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Unauthorized to update this user" });
    }

    // check user exists
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // التحقق من وجود الإيميل الجديد إذا تم تغييره
    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email }
      });
      if (emailExists) {
        return res.status(400).json({
          error: "Email already exists",
          message: "An account with this email already exists"
        });
      }
    }

    // if new image uploaded, update url
    const profile_image_url = req.file
      ? `/uploads/${req.file.filename}`
      : existingUser.profile_image_url;

    // تشفير كلمة المرور الجديدة إذا تم توفيرها
    let hashedPassword = existingUser.password;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: name || existingUser.name,
        email: email || existingUser.email,
        password: hashedPassword,
        role: role || existingUser.role,
        profile_image_url,
      },
    });

    // إزالة كلمة المرور من الاستجابة
    const { password: _, ...userWithoutPassword } = updatedUser;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a user
app.delete("/users/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // التحقق من أن المستخدم يحذف نفسه أو أن لديه صلاحيات
    if (req.user.id !== id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Unauthorized to delete this user" });
    }

    // check user exists
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // delete user
    await prisma.user.delete({ where: { id } });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// list all users
app.get("/users", authenticateToken, async (req, res) => {
  try {
    // فقط المدراء يمكنهم رؤية جميع المستخدمين
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Unauthorized to view all users" });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        profile_image_url: true,
        created_at: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});




function generateRoomName(baseName) {
  const randomPart = Math.random().toString(36).substring(2, 8); // رقم 4 أرقام
  return `${baseName}-${randomPart}`;
}

// MEETING
app.post("/meetings", authenticateToken, async (req, res) => {
  try {
    const { base_room_name, s_date, e_date } = req.body;

    if (!base_room_name || !s_date) {
      return res
        .status(400)
        .json({ error: "base_room_name and s_date are required" });
    }

    const room_name = generateRoomName(base_room_name);

    const meetingData = {
      room_name,
      s_date: new Date(s_date),
      created_by: req.user.id, // استخدام المستخدم الحالي
    };

    // إضافة e_date فقط لو موجود
    if (e_date) {
      meetingData.e_date = new Date(e_date);
    }

    const meeting = await prisma.meeting.create({
      data: meetingData,
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(meeting);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});
app.patch("/meetings/:id/end-date", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { e_date } = req.body;

    if (!e_date) {
      return res.status(400).json({ error: "e_date is required" });
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: { e_date: new Date(e_date) },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(200).json({
      message: "End date updated successfully",
      meeting: updatedMeeting,
    });
  } catch (error) {
    console.error("Error updating e_date:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update Meeting
app.put("/meetings/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { room_name, s_date, e_date } = req.body;

    const existingMeeting = await prisma.meeting.findUnique({ where: { id } });
    if (!existingMeeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // التحقق من أن المستخدم هو منشئ الاجتماع أو مدير
    if (existingMeeting.created_by !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Unauthorized to update this meeting" });
    }

    const updatedMeeting = await prisma.meeting.update({
      where: { id },
      data: {
        room_name: room_name || existingMeeting.room_name,
        s_date: s_date ? new Date(s_date) : existingMeeting.s_date,
        e_date: e_date ? new Date(e_date) : existingMeeting.e_date,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updatedMeeting);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Delete Meeting
app.delete("/meetings/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existingMeeting = await prisma.meeting.findUnique({ where: { id } });
    if (!existingMeeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // التحقق من أن المستخدم هو منشئ الاجتماع أو مدير
    if (existingMeeting.created_by !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Unauthorized to delete this meeting" });
    }

    await prisma.meeting.delete({ where: { id } });

    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Add Participant
app.post("/participants", authenticateToken, async (req, res) => {
  try {
    const { meeting_id, user_id, role, joined_at, left_at } = req.body;

    // Validate input
    if (!meeting_id || !user_id || !role) {
      return res
        .status(400)
        .json({ error: "meeting_id, user_id and role are required" });
    }

    // Check meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meeting_id },
    });
    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    // التحقق من أن المستخدم هو منشئ الاجتماع أو مدير
    if (meeting.created_by !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: "Unauthorized to add participants to this meeting" });
    }

    // Check user exists
    const user = await prisma.user.findUnique({
      where: { id: user_id },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create participant
    const participant = await prisma.participant.create({
      data: {
        meeting_id,
        user_id,
        role,
        joined_at: joined_at ? new Date(joined_at) : null,
        left_at: left_at ? new Date(left_at) : null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        meeting: { select: { id: true, room_name: true, s_date: true } },
      },
    });

    res.status(201).json(participant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Update Participant
app.put("/participants/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, joined_at, left_at } = req.body;

    const existingParticipant = await prisma.participant.findUnique({
      where: { id },
      include: { meeting: true }
    });
    if (!existingParticipant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    // التحقق من أن المستخدم هو منشئ الاجتماع أو مدير أو المشارك نفسه
    if (existingParticipant.meeting.created_by !== req.user.id &&
      req.user.role !== 'ADMIN' &&
      existingParticipant.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to update this participant" });
    }

    const updatedParticipant = await prisma.participant.update({
      where: { id },
      data: {
        role: role || existingParticipant.role,
        joined_at: joined_at ? new Date(joined_at) : existingParticipant.joined_at,
        left_at: left_at ? new Date(left_at) : existingParticipant.left_at,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        meeting: { select: { id: true, room_name: true, s_date: true } },
      },
    });

    res.json(updatedParticipant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Delete Participant
app.delete("/participants/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const existingParticipant = await prisma.participant.findUnique({
      where: { id },
      include: { meeting: true }
    });
    if (!existingParticipant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    // التحقق من أن المستخدم هو منشئ الاجتماع أو مدير أو المشارك نفسه
    if (existingParticipant.meeting.created_by !== req.user.id &&
      req.user.role !== 'ADMIN' &&
      existingParticipant.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to delete this participant" });
    }

    await prisma.participant.delete({ where: { id } });

    res.json({ message: "Participant deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
