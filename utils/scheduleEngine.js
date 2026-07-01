// Vaccination schedule — day 0 is hatch/purchase day
// Day 0 (F vaccine) is recorded only, no advance notification
const SCHEDULE = [
  { day: 14, type: "F_vaccine",    label: "F Vaccine",     noAdvanceNotif: true },
  { day: 28, type: "IBD",          label: "IBD Vaccine" },
  { day: 42, type: "LaSota",       label: "LaSota Vaccine" },
  { day: 56, type: "fowl_pox",     label: "Fowl Pox Vaccine" },
  { day: 70, type: "deworming",    label: "Dewormer" },
  { day: 84, type: "R2B",          label: "R2B + Dewormer" },
  { day: 98, type: "multivitamin", label: "Multivitamins" },
];

const FIRST_BOOSTER_DAY = 150; // 5 months from hatch
const BOOSTER_INTERVAL_DAYS = 120; // repeat every 4 months

export function generateSchedule(batchDate, boosterCount = 20) {
  const base = new Date(batchDate);
  base.setHours(0, 0, 0, 0);

  const events = SCHEDULE.map(({ day, type, label, noAdvanceNotif }) => {
    const d = new Date(base);
    d.setDate(d.getDate() + day);
    return { type, label, scheduledDate: new Date(d), dayOffset: day, isBooster: false, noAdvanceNotif: !!noAdvanceNotif };
  });

  // First booster at 5 months, then every 4 months
  for (let i = 0; i < boosterCount; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + FIRST_BOOSTER_DAY + BOOSTER_INTERVAL_DAYS * i);
    events.push({
      type: "R2B_booster",
      label: `R2B Booster + Dewormer`,
      scheduledDate: new Date(d),
      dayOffset: FIRST_BOOSTER_DAY + BOOSTER_INTERVAL_DAYS * i,
      isBooster: true,
      noAdvanceNotif: false,
    });
  }

  return events;
}

// Returns notification type based on event type and days until event
// For R2B/booster: 3 days before = deworming notif, 2 days before = r2b notif
// For others: 3 days before = vaccination_reminder
export function getNotificationType(eventType, daysUntil) {
  if (eventType === "F_vaccine") return null; // no advance notification

  if (eventType === "R2B" || eventType === "R2B_booster") {
    if (daysUntil === 3) return "deworming_reminder";
    if (daysUntil === 2) return "r2b_reminder";
    return null;
  }

  if (daysUntil === 3) return "vaccination_reminder";
  return null;
}

// Farmer-facing message
export function getFarmerMessage(event, daysUntil) {
  const isR2B = event.type === "R2B" || event.type === "R2B_booster";

  if (isR2B) {
    const dewormDate = addDays(event.scheduledDate, -2);
    if (daysUntil === 3) {
      // 3 days before R2B = deworming is tomorrow (2 days before R2B)
      return `Deworm tomorrow ${formatDate(dewormDate)}`;
    }
    if (daysUntil === 2) {
      // 2 days before R2B = vaccinate on R2B day
      return `Vaccinate on ${formatDate(event.scheduledDate)} R2B`;
    }
    return "";
  }

  if (daysUntil === 3) {
    return `Vaccinate on ${formatDate(event.scheduledDate)} ${event.label}`;
  }

  return "";
}

// CRP-facing message — includes farmer's full address
export function getCrpMessage(event, daysUntil, farmer) {
  const address = [farmer?.hamlet, farmer?.street, farmer?.houseNo].filter(Boolean).join(", ");
  const isR2B = event.type === "R2B" || event.type === "R2B_booster";

  if (isR2B) {
    const dewormDate = addDays(event.scheduledDate, -2);
    if (daysUntil === 3) {
      return `Prepare for deworming tomorrow on ${formatDate(dewormDate)} for ${farmer?.name || "farmer"} at ${address}`;
    }
    if (daysUntil === 2) {
      return `Prepare for R2B vaccination on ${formatDate(event.scheduledDate)} for ${farmer?.name || "farmer"} at ${address}`;
    }
    return "";
  }

  if (daysUntil === 3) {
    return `Prepare ${event.label} on ${formatDate(event.scheduledDate)} for ${farmer?.name || "farmer"} at ${address}`;
  }

  return "";
}

// Keep backward compat
export function getNotificationMessage(event, daysUntil) {
  return getFarmerMessage(event, daysUntil);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
