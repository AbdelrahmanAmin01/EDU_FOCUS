import express from "express";
import multer from "multer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
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

// POST /register
app.post("/register", upload.single("profile_image"), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const profile_image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password,
        role: role || "STUDENT", // default to STUDENT
        profile_image_url,
      },
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if the user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Compare passwords directly (no bcrypt)
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
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
// ✅ Update (Edit) a user
app.put("/users/:id", upload.single("profile_image"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body;

    // check user exists
    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // if new image uploaded, update url
    const profile_image_url = req.file
      ? `/uploads/${req.file.filename}`
      : existingUser.profile_image_url;

    // update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name: name || existingUser.name,
        email: email || existingUser.email,
        password: password || existingUser.password, // you can hash if you want
        role: role || existingUser.role,
        profile_image_url,
      },
    });

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Delete a user
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

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
app.get("/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});
app.post("/meetings", async (req, res) => {
  try {
    const { room_name, s_date, e_date, created_by } = req.body;

    if (!room_name || !s_date || !e_date || !created_by) {
      return res
        .status(400)
        .json({ error: "room_name, s_date, e_date, created_by are required" });
    }

    // Ensure the creator exists
    const creator = await prisma.user.findUnique({
      where: { id: created_by },
    });
    if (!creator) {
      return res.status(404).json({ error: "Creator user not found" });
    }

    const meeting = await prisma.meeting.create({
      data: {
        room_name,
        s_date: new Date(s_date),
        e_date: new Date(e_date),
        created_by,
      },
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
// ✅ Update Meeting
app.put("/meetings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { room_name, s_date, e_date } = req.body;

    const existingMeeting = await prisma.meeting.findUnique({ where: { id } });
    if (!existingMeeting) {
      return res.status(404).json({ error: "Meeting not found" });
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

// ✅ Delete Meeting
app.delete("/meetings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingMeeting = await prisma.meeting.findUnique({ where: { id } });
    if (!existingMeeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    await prisma.meeting.delete({ where: { id } });

    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Add Participant
app.post("/participants", async (req, res) => {
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
// ✅ Update Participant
app.put("/participants/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { role, joined_at, left_at } = req.body;

    const existingParticipant = await prisma.participant.findUnique({ where: { id } });
    if (!existingParticipant) {
      return res.status(404).json({ error: "Participant not found" });
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

// ✅ Delete Participant
app.delete("/participants/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingParticipant = await prisma.participant.findUnique({ where: { id } });
    if (!existingParticipant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    await prisma.participant.delete({ where: { id } });

    res.json({ message: "Participant deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
