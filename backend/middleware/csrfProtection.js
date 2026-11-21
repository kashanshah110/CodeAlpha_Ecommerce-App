const crypto = require("node:crypto");

const csrfProtection = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

    const requestOrigin = req.get("origin");
    if (requestOrigin) {
        const sameOrigin = `${req.protocol}://${req.get("host")}` === requestOrigin;
        const configuredOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5500")
            .split(",")
            .map((origin) => origin.trim());
        if (!sameOrigin && !configuredOrigins.includes(requestOrigin)) {
            return res.status(403).json({ success: false, message: "Request origin is not allowed." });
        }
    }

    const token = req.get("x-csrf-token");
    if (!token || !req.session.csrfToken) {
        return res.status(403).json({ success: false, message: "Your session has expired. Refresh and try again." });
    }

    const expected = Buffer.from(req.session.csrfToken);
    const supplied = Buffer.from(token);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
        return res.status(403).json({ success: false, message: "Invalid request security token. Refresh and try again." });
    }
    return next();
};

module.exports = csrfProtection;