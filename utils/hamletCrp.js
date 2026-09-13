import Hamlet from "../models/Hamlet.js";
import Crp from "../models/Crp.js";
import User from "../models/User.js";

// Keeps Hamlet.crpId, Crp.assignedHamlets, and User.crpId (for every farmer in
// that hamlet) in sync. Pass newCrpId = null to unassign the hamlet from any CRP.
// Uses findByIdAndUpdate rather than document.save() so it never triggers
// full-document validation against fields (nameTa/nameEn) unrelated to this change.
export async function reassignHamletCrp(hamletId, newCrpId) {
  const hamlet = await Hamlet.findById(hamletId);
  if (!hamlet) return null;

  const previousCrpId = hamlet.crpId ? hamlet.crpId.toString() : null;
  const nextCrpId = newCrpId ? newCrpId.toString() : null;

  if (previousCrpId === nextCrpId) return hamlet;

  await Hamlet.findByIdAndUpdate(hamletId, { crpId: nextCrpId || null });
  await User.updateMany({ hamletId }, { crpId: nextCrpId || null });

  if (previousCrpId) {
    await Crp.findByIdAndUpdate(previousCrpId, { $pull: { assignedHamlets: hamletId } });
  }
  if (nextCrpId) {
    await Crp.findByIdAndUpdate(nextCrpId, { $addToSet: { assignedHamlets: hamletId } });
  }

  return Hamlet.findById(hamletId);
}
