const path = require("node:path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const { rateLimit } = require("express-rate-limit");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("./config/db");
const productRoutes = require("./routes/productRoutes");
const userRoutes = require("./routes/userRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminRoutes = require("./routes/adminRoutes");
const csrfProtection = require("./middleware/csrfProtection");

const app = express();
const frontendDirectory = path.resolve(__dirname, "..", "frontend");
const sessionSecret = process.env.SESSION_SECRET;
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "http://localhost:5500")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", ...allowedOrigins],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);
app.use((req, res, next) => {
  const sameOrigin = `${req.protocol}://${req.get("host")}`;
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, sameOrigin);
      if (origin === sameOrigin || allowedOrigins.has(origin)) return callback(null, origin);
      return callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"],
  })(req, res, next);
});
app.use(express.json({ limit: "64kb" }));
let applicationConfigured = false;

async function configureApplication() {
  if (applicationConfigured) return;
  const sessionStore = MongoStore.create({
    client: mongoose.connection.getClient(),
    collectionName: "sessions",
    ttl: 60 * 60 * 24 * 7,
  });
  await sessionStore.collectionP;
  app.use(
    session({
      name: "novastore.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );
  app.use("/api", csrfProtection);
  app.get("/api/csrf", (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    res.json({ success: true, csrfToken: req.session.csrfToken });
  });
  app.get("/api/health", (req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({
      success: ready,
      service: "NovaStore API",
      database: ready ? "connected" : "unavailable",
    });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, message: "Too many sign-in attempts. Please try again later." },
  });
  app.use("/api/users/login", authLimiter);
  app.use("/api/users/register", authLimiter);
  app.use("/api/products", productRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/cart", cartRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(express.static(frontendDirectory, { extensions: ["html"] }));
  app.get("/", (req, res) => res.sendFile(path.join(frontendDirectory, "index.html")));

  app.use((req, res) => {
    res.status(404).json({ success: false, message: "The requested resource was not found." });
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, message: "Request body must contain valid JSON." });
    }
    console.error("Request failed:", error.message);
    const status = error.message === "Origin is not allowed by CORS." ? 403 : 500;
    return res.status(status).json({
      success: false,
      message: status === 403 ? "This origin is not allowed." : "An unexpected server error occurred.",
    });
  });
  applicationConfigured = true;
}

async function start() {
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.startsWith("replace-with-")) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI must be configured before starting NovaStore.");
  }
  await connectDB();
  await configureApplication();
  const port = Number(process.env.PORT) || 5000;
  app.listen(port, () => console.log(`NovaStore is ready at http://localhost:${port}`));
}

if (require.main === module) {
  start().catch(async (error) => {
    console.error("NovaStore could not start:", error.message);
    await mongoose.disconnect().catch((disconnectError) => {
      console.error("Could not close the database connection:", disconnectError.message);
    });
    process.exitCode = 1;
  });
}

module.exports = app;
