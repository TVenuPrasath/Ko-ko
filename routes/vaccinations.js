import express from "express";
import Vaccination from "../models/Vaccination.js";
import BirdBatch from "../models/BirdBatch.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { generateSchedule } from "../utils/scheduleEngine.js";
import { notifyUsers, notifyUsersByRole, getUsersByRole } from "../utils/notificationService.js";

const router = express.Router();

function buildScheduleResult(schedule, dbRecords) {
  const today = new Date();
  return schedule.map((e) => {
    const eDate = new Date(e.scheduledDate);
    eDate.setHours(0, 0, 0, 0);

    const dbRecord = dbRecords.find((r) => {
      if (!r.scheduledDate) return false;
      const rDate = new Date(r.scheduledDate);
      rDate.setHours(0, 0, 0, 0);
      return r.type === e.type && rDate.getTime() === eDate.getTime();
    });

    if (dbRecord) {
      return {
        ...e,
        _id: dbRecord._id,
        status: dbRecord.status,
        completedDate: dbRecord.completedDate,
        completedBy: dbRecord.completedBy,
        rescheduledDate: dbRecord.rescheduledDate,
        notes: dbRecord.notes,
      };
    }

    return {
      ...e,
      status: eDate < today ? "overdue" : "scheduled",
    };
  });
}

// ── Batch management ──────────────────────────────────────────────────────────

// GET /api/vaccinations/batches/me
router.get("/batches/me", verifyToken, async (req, res) => {
  try {
    const batches = await BirdBatch.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaccinations/batches/farmer/:farmerId
router.get("/batches/farmer/:farmerId", verifyToken, async (req, res) => {
  try {
    const batches = await BirdBatch.find({ userId: req.params.farmerId }).sort({ createdAt: -1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaccinations/batches/all
router.get("/batches/all", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const batches = await BirdBatch.find()
      .populate("userId", "name phone hamlet street houseNo shg_name")
      .sort({ createdAt: -1 });
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaccinations/batches — CRP creates a batch and generates schedule
router.post("/batches", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const { userId, batchName, numberOfChicks, batchDate } = req.body;
    if (!userId || !batchDate) return res.status(400).json({ message: "userId and batchDate required" });

    const batch = await BirdBatch.create({
      userId,
      batchName: batchName || "Batch 1",
      numberOfChicks: numberOfChicks || 0,
      activeBirdCount: numberOfChicks || 0,
      batchDate: new Date(batchDate),
    });

    const events = generateSchedule(batchDate);
    const records = events.map((e) => ({
      userId,
      batchId: batch._id,
      type: e.type,
      label: e.label,
      scheduledDate: e.scheduledDate,
      dateGiven: e.scheduledDate,   // keep legacy field populated
      nextDueDate: e.scheduledDate, // keep legacy field populated
      status: "scheduled",
      isAutoScheduled: true,
    }));
    await Vaccination.insertMany(records, { ordered: false, rawResult: false });

    res.status(201).json({ batch, scheduleCount: records.length });
  } catch (err) {
    console.error("POST /batches error:", err.message, err.errors);
    res.status(500).json({ error: err.message, details: err.errors });
  }
});

// PATCH /api/vaccinations/batches/:batchId/status
router.patch("/batches/:batchId/status", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const batch = await BirdBatch.findByIdAndUpdate(
      req.params.batchId,
      { batchStatus: req.body.batchStatus, updatedAt: new Date() },
      { new: true }
    );
    if (!batch) return res.status(404).json({ message: "Batch not found" });
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// DELETE /api/vaccinations/batches/:batchId
router.delete("/batches/:batchId", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const batch = await BirdBatch.findById(req.params.batchId);
    if (!batch) return res.status(404).json({ message: "Batch not found" });

    await Vaccination.deleteMany({ batchId: batch._id });
    await batch.deleteOne();

    res.json({ message: "Batch deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── Schedule views ────────────────────────────────────────────────────────────

// GET /api/vaccinations/schedule/me — farmer sees all active batches + schedules
router.get("/schedule/me", verifyToken, async (req, res) => {
  try {
    const batches = await BirdBatch.find({ userId: req.user.userId, batchStatus: "active" });
    if (!batches.length) return res.json([]);

    const result = await Promise.all(batches.map(async (batch) => {
      const schedule = generateSchedule(batch.batchDate);
      const dbRecords = await Vaccination.find({ batchId: batch._id });
      return {
        batchId: batch._id,
        batchName: batch.batchName || "Batch 1",
        numberOfChicks: batch.numberOfChicks,
        batchDate: batch.batchDate,
        schedule: buildScheduleResult(schedule, dbRecords),
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaccinations/schedule/:farmerId — CRP sees a farmer's all batches
router.get("/schedule/:farmerId", verifyToken, async (req, res) => {
  try {
    const batches = await BirdBatch.find({ userId: req.params.farmerId });
    if (!batches.length) return res.json([]);

    const result = await Promise.all(batches.map(async (batch) => {
      const schedule = generateSchedule(batch.batchDate);
      const dbRecords = await Vaccination.find({ batchId: batch._id });
      return {
        batchId: batch._id,
        batchName: batch.batchName || "Batch 1",
        numberOfChicks: batch.numberOfChicks,
        batchDate: batch.batchDate,
        batchStatus: batch.batchStatus,
        schedule: buildScheduleResult(schedule, dbRecords),
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Vaccination status actions ────────────────────────────────────────────────

// PATCH /api/vaccinations/:id/complete
router.patch("/:id/complete", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const { notes } = req.body;
    const record = await Vaccination.findByIdAndUpdate(
      req.params.id,
      { status: "completed", completedDate: new Date(), completedBy: String(req.user.userId), notes },
      { new: true }
    );
    if (!record) return res.status(404).json({ message: "Not found" });

    await notifyUsers([record.userId.toString(), ...await getUsersByRole(["CRP"])], {
      batchId: record.batchId,
      type: "vaccination_completed",
      title: "Vaccination Completed",
      message: `Vaccination ${record.type} has been marked completed.`,
      hamlet: undefined,
      shg_name: undefined,
      payload: { vaccinationId: record._id.toString() },
    });

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/vaccinations/:id/missed
router.patch("/:id/missed", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const { notes } = req.body;
    const record = await Vaccination.findByIdAndUpdate(
      req.params.id,
      {
        status: "missed",
        completedDate: new Date(),
        completedBy: String(req.user.userId),
        notes: notes || "missed",
      },
      { new: true }
    );
    if (!record) return res.status(404).json({ message: "Not found" });

    await notifyUsers(await getUsersByRole(["CRP"]), {
      batchId: record.batchId,
      type: "vaccination_missed",
      title: "Vaccination Missed",
      message: `Vaccination ${record.type} scheduled on ${record.scheduledDate?.toISOString().split("T")[0]} was marked missed.`,
      payload: { vaccinationId: record._id.toString() },
    });

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/vaccinations/:id/reschedule
router.patch("/:id/reschedule", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const { rescheduledDate, notes } = req.body;
    if (!rescheduledDate) return res.status(400).json({ message: "rescheduledDate required" });
    const record = await Vaccination.findByIdAndUpdate(
      req.params.id,
      { status: "rescheduled", rescheduledDate: new Date(rescheduledDate), notes },
      { new: true }
    );
    if (!record) return res.status(404).json({ message: "Not found" });

    await notifyUsers([record.userId.toString(), ...await getUsersByRole(["CRP"])], {
      batchId: record.batchId,
      type: "vaccination_rescheduled",
      title: "Vaccination Rescheduled",
      message: `Vaccination ${record.type} has been rescheduled to ${new Date(rescheduledDate).toLocaleDateString()}.`,
      payload: { vaccinationId: record._id.toString(), rescheduledDate },
    });

    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Legacy ────────────────────────────────────────────────────────────────────

// GET /api/vaccinations — farmer's own records (handles both old and new schema)
router.get("/", verifyToken, async (req, res) => {
  try {
    const records = await Vaccination.find({ userId: req.user.userId })
      .sort({ scheduledDate: -1, dateGiven: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaccinations/all — CRP: all records
router.get("/all", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const records = await Vaccination.find()
      .populate("userId", "name phone hamlet street houseNo shg_name")
      .populate("batchId", "batchName batchDate")
      .sort({ scheduledDate: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
