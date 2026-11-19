// Default field registry for calls that pass no { fields } (the UI sets it once with the dissectors' FIELDS).
let defaultFields = null;
export function setDefaultFields(fields) { defaultFields = fields || null; }
export function getDefaultFields() { return defaultFields; }
