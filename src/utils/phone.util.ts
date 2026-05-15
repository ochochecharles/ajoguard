/**
 * Normalises a Nigerian phone number to E.164 international format (+234XXXXXXXXXX).
 *
 * Handles the three formats commonly seen across input channels:
 *   "08012345678"      → "+2348012345678"  (web form, no country code)
 *   "2348012345678"    → "+2348012345678"  (Meta WhatsApp, missing + prefix)
 *   "+2348012345678"   → "+2348012345678"  (Africa's Talking, already correct)
 *   "8012345678"       → "+2348012345678"  (missing leading 0 and country code)
 *
 * E.164 is the international standard used by all SMS and WhatsApp providers.
 * Africa's Talking and Meta both require this format to deliver messages.
 *
 * @param phone - Raw phone number string from any input source
 */
export function normalisePhoneNumber(phone: string): string {

  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number is required');
  }

  // Remove all whitespace, dashes, and parentheses
  // e.g "080 1234 5678" → "08012345678"
  //     "(080) 123-4567" → "0801234567"
  let cleaned = phone.replace(/[\s\-\(\)]/g, '').trim();

  // Already in correct E.164 format — nothing to do
  if (cleaned.startsWith('+234') && cleaned.length === 14) {
    return cleaned;
  }

  // Has country code but missing + prefix
  // e.g "2348012345678" → "+2348012345678"
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return `+${cleaned}`;
  }

  // Nigerian local format with leading 0
  // e.g "08012345678" → "+2348012345678"
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `+234${cleaned.slice(1)}`;
  }

  // Missing leading 0 and country code
  // e.g "8012345678" → "+2348012345678"
  if (!cleaned.startsWith('0') && !cleaned.startsWith('234') && cleaned.length === 10) {
    return `+234${cleaned}`;
  }

  // Cannot determine format — throw with helpful message
  throw new Error(
    `Invalid phone number format: "${phone}". ` +
    `Expected Nigerian number e.g 08012345678 or +2348012345678`,
  );
}