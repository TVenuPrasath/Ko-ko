import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const requireAdmin = (req, res, next) => {
  const role = String(req.user?.role || "").toUpperCase();
  if (role !== "ADMIN") return res.status(403).json({ message: "Admin access required" });
  next();
};

export const requireCrpOrAdmin = (req, res, next) => {
  const role = String(req.user?.role || "").toUpperCase();
  if (role !== "CRP" && role !== "ADMIN") return res.status(403).json({ message: "CRP or Admin access required" });
  next();
};