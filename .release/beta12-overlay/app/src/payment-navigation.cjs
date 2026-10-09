"use strict";

function shouldOpenCatalogAfterSync(previous, result) {
  if (result.state !== "active" || !result.status?.ok) return false;
  if (!previous.ok) return true;
  const before = previous.payload || {};
  const after = result.status.payload || {};
  return before.licenseId !== after.licenseId || before.expiresAt !== after.expiresAt || before.plan !== after.plan;
}

module.exports = { shouldOpenCatalogAfterSync };
