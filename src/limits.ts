// Resource ceilings for this small, local MCP client. Enforced before API requests.
export const INPUT_LIMITS = Object.freeze({
  messageBytes: 256 * 1024,
  elements: 1_024,
  mediaUrls: 10,
  originalUrls: 20,
  extraFields: 32,
  fieldName: 128,
  fieldValue: 2_000,
  url: 4_096,
  shortText: 256,
  text: 10_000,
  email: 320,
  address: 2_000,
  phone: 64,
});
