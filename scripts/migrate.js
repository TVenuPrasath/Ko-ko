import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import User from "../models/User.js";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";

dotenv.config();

// ---------------------------------------------------------------------------
// Hamlet/Street reconciliation audit — Phase 3.
//
// This script is READ-ONLY by design. The dry-run path below never calls
// create(), save(), updateOne(), updateMany(), findOneAndUpdate(), deleteOne(),
// deleteMany(), or any other Mongoose write method — it only runs find()/count
// queries and prints/writes a report. No farmer, Hamlet, Street, or CRP record
// is ever created, modified, or deleted by this script in its current form.
//
// --apply (a future write/reconciliation mode) is intentionally not implemented.
// Passing --apply refuses to run and exits before any database connection is
// made — see the guard at the top of main() below.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const isApply = argv.includes("--apply");
  const jsonArg = argv.find((a) => a === "--json" || a.startsWith("--json="));
  let jsonOutPath = null;
  if (jsonArg) {
    const eq = jsonArg.indexOf("=");
    jsonOutPath = eq === -1
      ? path.join(process.cwd(), `hamlet-reconciliation-audit-${Date.now()}.json`)
      : jsonArg.slice(eq + 1);
  }
  return { isApply, jsonOutPath };
}

// Case-insensitive fold for comparison. Tamil script has no case concept, so
// this is an inert no-op for nameTa — it only ever affects Latin-script (name /
// nameEn) comparisons. Never fuzzy, never partial: still exact string equality
// after trimming/folding.
function normalize(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hamletMatchesLegacyName(hamlet, legacyName) {
  const target = normalize(legacyName);
  if (!target) return false;
  return [hamlet.name, hamlet.nameTa, hamlet.nameEn].some((v) => normalize(v) === target);
}

function findMatchingHamlets(hamlets, legacyName) {
  return hamlets.filter((h) => hamletMatchesLegacyName(h, legacyName));
}

function findStreetCandidates(streets, hamletId, legacyStreetName) {
  const target = normalize(legacyStreetName);
  if (!target || !hamletId) return [];
  return streets.filter(
    (s) => String(s.hamletId) === String(hamletId) &&
      [s.name, s.nameTa, s.nameEn].some((v) => normalize(v) === target)
  );
}

function hamletSummary(h) {
  return { id: String(h._id), name: h.name || "", nameTa: h.nameTa || "", nameEn: h.nameEn || "" };
}

function streetSummary(s) {
  return { id: String(s._id), name: s.name || "", nameTa: s.nameTa || "", nameEn: s.nameEn || "" };
}

// Classifies a single SHG Member farmer into exactly one primary bucket
// (A/B/C/D/E, plus F/G for edge cases the requested taxonomy doesn't cover —
// see the final report for why those two exist), while still recording every
// applicable issue in `issues` so nothing is lost when two problems overlap
// (e.g. a farmer with both a stale name AND a stale CRP).
function classifyFarmer(farmer, hamletsById, hamlets, streets) {
  const record = {
    _id: String(farmer._id),
    name: farmer.name || "",
    phone: farmer.phone || "",
    legacyHamlet: farmer.hamlet || "",
    legacyStreet: farmer.street || "",
    hamletId: farmer.hamletId ? String(farmer.hamletId) : null,
    crpId: farmer.crpId ? String(farmer.crpId) : null,
    bucket: null,
    issues: [],
    details: {},
  };

  if (!farmer.hamletId) {
    if (!farmer.hamlet) {
      record.bucket = "F";
      record.details.reason = "no hamletId and no legacy hamlet string — no location data at all";
      return record;
    }

    const matches = findMatchingHamlets(hamlets, farmer.hamlet);
    if (matches.length === 1) {
      record.bucket = "B";
      const candidate = matches[0];
      record.details.candidateHamlet = hamletSummary(candidate);
      const streetCandidates = findStreetCandidates(streets, candidate._id, farmer.street);
      if (streetCandidates.length === 1) {
        record.details.candidateStreet = streetSummary(streetCandidates[0]);
      } else if (streetCandidates.length > 1) {
        record.details.candidateStreetAmbiguous = streetCandidates.map(streetSummary);
      }
      return record;
    }

    record.bucket = "E";
    record.details.reason = matches.length === 0
      ? "no hamlet matches the legacy hamlet string"
      : `ambiguous — ${matches.length} hamlets match the legacy hamlet string`;
    if (matches.length > 1) record.details.candidates = matches.map(hamletSummary);
    return record;
  }

  const hamletDoc = hamletsById.get(record.hamletId);
  if (!hamletDoc) {
    record.bucket = "G";
    record.details.reason = "hamletId is set but no such Hamlet document exists (dangling reference)";
    return record;
  }

  const nameOk = hamletMatchesLegacyName(hamletDoc, farmer.hamlet);
  const canonicalCrpId = hamletDoc.crpId ? String(hamletDoc.crpId) : null;
  const crpOk = (record.crpId || null) === canonicalCrpId;

  if (!nameOk) {
    record.issues.push("name-mismatch");
    record.details.canonicalHamlet = hamletSummary(hamletDoc);
    record.details.nameIssueReason = farmer.hamlet ? "differs from canonical name fields" : "no legacy value stored";
  }
  if (!crpOk) {
    record.issues.push("crp-mismatch");
    record.details.currentCrpId = record.crpId;
    record.details.canonicalCrpId = canonicalCrpId;
  }

  if (nameOk && crpOk) {
    record.bucket = "A";
  } else if (!crpOk) {
    // Tie-break: when a farmer has both a stale name and a stale CRP, CRP
    // correctness is treated as the primary issue (it affects notification
    // routing/data access), while the name-mismatch is still recorded in
    // `issues`. Adjust this ordering if you'd rather prioritize the other way.
    record.bucket = "D";
  } else {
    record.bucket = "C";
  }

  return record;
}

async function runAudit() {
  const farmers = await User.find(
    { role: "SHG Member" },
    "name phone hamlet street hamletId streetId crpId created_at"
  ).lean();

  const hamlets = await Hamlet.find({}, "name nameTa nameEn crpId").lean();
  const streets = await Street.find({}, "name nameTa nameEn hamletId").lean();

  const hamletsById = new Map(hamlets.map((h) => [String(h._id), h]));

  const results = farmers.map((f) => classifyFarmer(f, hamletsById, hamlets, streets));

  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  for (const r of results) counts[r.bucket]++;

  return { results, counts, total: farmers.length };
}

function printReport({ results, counts, total }) {
  const line = "=".repeat(70);
  console.log(line);
  console.log("Hamlet/Street Reconciliation Audit — DRY RUN (read-only)");
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(line);

  console.log("\nSummary (mutually exclusive primary bucket per farmer)");
  console.log(`  Total SHG Members:                 ${total}`);
  console.log(`  Bucket A - Clean:                   ${counts.A}`);
  console.log(`  Bucket B - String-only:             ${counts.B}`);
  console.log(`  Bucket C - Mismatched name:         ${counts.C}`);
  console.log(`  Bucket D - Missing/stale CRP:       ${counts.D}`);
  console.log(`  Bucket E - Unmatched/ambiguous:     ${counts.E}`);
  console.log(`  Bucket F - No location data:        ${counts.F}  (not in the original A-E spec — added so every farmer is accounted for)`);
  console.log(`  Bucket G - Broken hamletId ref:     ${counts.G}  (not in the original A-E spec — added so every farmer is accounted for)`);
  const sum = counts.A + counts.B + counts.C + counts.D + counts.E + counts.F + counts.G;
  console.log(`  ---`);
  console.log(`  Sum check: ${sum} ${sum === total ? "== " : "!= "} Total SHG Members ${sum === total ? "✅" : "❌"}`);
  console.log("\nNote: a farmer can carry multiple issue flags (e.g. name-mismatch AND");
  console.log("crp-mismatch) even though only one bucket is counted in the totals above.");
  console.log("Full per-farmer issue flags are in the detailed listings below / --json output.");

  const bucketB = results.filter((r) => r.bucket === "B");
  console.log(`\n--- Bucket B: String-only (${bucketB.length}) ---`);
  bucketB.forEach((r, i) => {
    console.log(`  [${i + 1}] _id=${r._id} name="${r.name}" phone=${r.phone}`);
    console.log(`      legacyHamlet="${r.legacyHamlet}" legacyStreet="${r.legacyStreet}"`);
    const c = r.details.candidateHamlet;
    console.log(`      candidateHamlet: name="${c.name}" nameTa="${c.nameTa}" nameEn="${c.nameEn}" id=${c.id}`);
    if (r.details.candidateStreet) {
      const s = r.details.candidateStreet;
      console.log(`      candidateStreet: name="${s.name}" nameTa="${s.nameTa}" nameEn="${s.nameEn}" id=${s.id}`);
    } else if (r.details.candidateStreetAmbiguous) {
      console.log(`      candidateStreet: ambiguous (${r.details.candidateStreetAmbiguous.length} matches) — left unset`);
    }
  });

  const bucketE = results.filter((r) => r.bucket === "E");
  console.log(`\n--- Bucket E: Unmatched / ambiguous (${bucketE.length}) ---`);
  bucketE.forEach((r, i) => {
    console.log(`  [${i + 1}] _id=${r._id} name="${r.name}" phone=${r.phone}`);
    console.log(`      legacyHamlet="${r.legacyHamlet}" legacyStreet="${r.legacyStreet}"`);
    console.log(`      reason: ${r.details.reason}`);
    if (r.details.candidates) {
      console.log(`      candidates: ${r.details.candidates.map((c) => `"${c.name}"/"${c.nameTa}"/"${c.nameEn}" (${c.id})`).join(", ")}`);
    }
  });

  const bucketC = results.filter((r) => r.bucket === "C");
  console.log(`\n--- Bucket C: Mismatched denormalized name (${bucketC.length}) ---`);
  bucketC.forEach((r, i) => {
    const c = r.details.canonicalHamlet;
    console.log(`  [${i + 1}] _id=${r._id} legacyHamlet="${r.legacyHamlet}" canonicalNameTa="${c.nameTa}" canonicalNameEn="${c.nameEn}" hamletId=${r.hamletId}`);
  });

  const bucketD = results.filter((r) => r.bucket === "D");
  console.log(`\n--- Bucket D: Missing/stale CRP (${bucketD.length}) ---`);
  bucketD.forEach((r, i) => {
    console.log(`  [${i + 1}] _id=${r._id} hamletId=${r.hamletId} currentCrpId=${r.details.currentCrpId} canonicalCrpId=${r.details.canonicalCrpId}`);
  });

  const bucketF = results.filter((r) => r.bucket === "F");
  const bucketG = results.filter((r) => r.bucket === "G");
  if (bucketF.length) {
    console.log(`\n--- Bucket F: No location data (${bucketF.length}) ---`);
    bucketF.forEach((r, i) => console.log(`  [${i + 1}] _id=${r._id} name="${r.name}" phone=${r.phone}`));
  }
  if (bucketG.length) {
    console.log(`\n--- Bucket G: Broken hamletId reference (${bucketG.length}) ---`);
    bucketG.forEach((r, i) => console.log(`  [${i + 1}] _id=${r._id} name="${r.name}" phone=${r.phone} hamletId=${r.hamletId}`));
  }

  console.log(`\n${line}`);
  console.log("End of dry-run report. No documents were created, updated, or deleted.");
  console.log(line);
}

function writeJsonReport(jsonOutPath, { results, counts, total }) {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    summary: { total, counts },
    farmers: results,
  };
  fs.writeFileSync(jsonOutPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n📄 JSON report written to: ${jsonOutPath}`);
}

async function main() {
  const { isApply, jsonOutPath } = parseArgs(process.argv.slice(2));

  if (isApply) {
    console.error("❌ --apply is not implemented yet.");
    console.error("   This script currently only supports the read-only dry-run audit.");
    console.error("   Re-run without --apply (dry-run is the default) to generate the report.");
    process.exit(1);
    return;
  }

  console.log("Mode: DRY RUN — read-only. No database writes will be performed.\n");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB (read-only queries only)\n");

  const audit = await runAudit();
  printReport(audit);
  if (jsonOutPath) writeJsonReport(jsonOutPath, audit);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
