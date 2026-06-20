import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

import authRoutes from "./routes/auth.js";
import birdRoutes from "./routes/birds.js";
import diseaseRoutes from "./routes/disease.js";
import serviceRoutes from "./routes/services.js";
import marketRoutes from "./routes/market.js";
import notificationRoutes from "./routes/notifications.js";
import vaccinationRoutes from "./routes/vaccinations.js";
import farmerRoutes from "./routes/farmers.js";
import shgRoutes from "./routes/shg.js";
import saleStockRoutes from "./routes/saleStocks.js";
import activityRoutes from "./routes/activity.js";
import crpRoutes from "./routes/crps.js";
import hamletRoutes from "./routes/hamlets.js";
import streetRoutes from "./routes/streets.js";
import vaccinationStockRoutes from "./routes/vaccinationStock.js";
import { startNotificationScheduler } from "./utils/notificationScheduler.js";

dotenv.config();
connectDB();

const app = express();

app.use(cors({ origin: ["http://localhost:8080", "http://localhost:5173", "https://ko-ko-frontend.vercel.app", "https://localhost", "capacitor://localhost"], credentials: false }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/birds", birdRoutes);
app.use("/api/disease", diseaseRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/vaccinations", vaccinationRoutes);
app.use("/api/farmers", farmerRoutes);
app.use("/api/shg", shgRoutes);
app.use("/api/sale-stocks", saleStockRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/crps", crpRoutes);
app.use("/api/hamlets", hamletRoutes);
app.use("/api/streets", streetRoutes);
app.use("/api/vaccination-stock", vaccinationStockRoutes);

startNotificationScheduler();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
