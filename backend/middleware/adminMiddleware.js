const adminMiddleware = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Authentication required." });
    }
    if (req.user.role !== "admin" || req.user.status !== "active") {
        return res.status(403).json({ success: false, message: "Administrator access is required." });
    }
    return next();
};

module.exports = adminMiddleware;