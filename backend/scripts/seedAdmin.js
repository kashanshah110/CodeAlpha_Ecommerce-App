require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");

async function seedAdmin() {
  const { MONGO_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!MONGO_URI || !ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Set MONGO_URI, ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD for this command.");
  }
  if (ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 128 || Buffer.byteLength(ADMIN_PASSWORD, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD must be 12–128 characters and no more than 72 UTF-8 bytes.");
  }
  const email = ADMIN_EMAIL.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL must be valid.");
  if (ADMIN_NAME.trim().length < 2 || ADMIN_NAME.trim().length > 80) {
    throw new Error("ADMIN_NAME must be between 2 and 80 characters.");
  }

  await mongoose.connect(MONGO_URI);
  try {
    if (await User.exists({ role: "admin" })) {
      throw new Error("An administrator already exists. The initial-admin seed can only run once.");
    }
    const password = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const user = await User.create({
      name: ADMIN_NAME.trim(),
      email,
      password,
      role: "admin",
    });
    console.log(`Created initial administrator account for ${user.email}.`);
  } finally {
    await mongoose.disconnect();
  }
}

seedAdmin().catch((error) => {
  console.error("Could not create initial administrator:", error.message);
  process.exitCode = 1;
});
