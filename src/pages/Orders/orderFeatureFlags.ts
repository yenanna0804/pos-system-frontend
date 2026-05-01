const asBool = (value: unknown, defaultValue = false) => {
  if (typeof value !== 'string') return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

export const orderFeatureFlags = {
  timeLineLevelPricing: asBool(import.meta.env.VITE_FEATURE_TIME_LINELEVEL_PRICING, true),
  telemetryTimeMismatch: asBool(import.meta.env.VITE_TELEMETRY_TIME_MISMATCH, false),
  orderPatchUpdate: asBool(import.meta.env.VITE_FEATURE_ORDER_PATCH_UPDATE, true),
};
