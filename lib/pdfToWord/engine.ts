export type PdfToWordEngineId = "internal" | "wpsOfficial";

export type PdfToWordEngineAvailability = {
  id: PdfToWordEngineId;
  available: boolean;
  processing: "local" | "cloud";
  reason?: string;
};

export type PdfToWordEngineSelection = {
  engine: PdfToWordEngineId;
  availability: PdfToWordEngineAvailability[];
};

/**
 * Keeps engine selection explicit and auditable. The official WPS engine may
 * only be selected by a server-side integration after licensing, credentials,
 * remote-file consent, and the product feature flag have all been verified.
 */
export function selectPdfToWordEngine(options: {
  requested?: "auto" | PdfToWordEngineId;
  wpsFeatureEnabled?: boolean;
  wpsCredentialsAvailable?: boolean;
  remoteProcessingApproved?: boolean;
} = {}): PdfToWordEngineSelection {
  const wpsAvailable = Boolean(options.wpsFeatureEnabled
    && options.wpsCredentialsAvailable
    && options.remoteProcessingApproved);
  const availability: PdfToWordEngineAvailability[] = [
    { id: "internal", available: true, processing: "local" },
    {
      id: "wpsOfficial",
      available: wpsAvailable,
      processing: "cloud",
      reason: wpsAvailable
        ? undefined
        : "Official WPS access requires a licensed server integration, credentials, and approved remote-processing disclosure.",
    },
  ];
  if (options.requested === "wpsOfficial" && !wpsAvailable) {
    throw new Error(availability[1].reason);
  }
  return { engine: options.requested === "wpsOfficial" && wpsAvailable ? "wpsOfficial" : "internal", availability };
}
