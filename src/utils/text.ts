const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
};

export function decodeEntities(text: string): string {
  if (!text) return '';
  let output = text;
  for (const [encoded, decoded] of Object.entries(ENTITIES)) {
    output = output.replaceAll(encoded, decoded);
  }
  return output;
}

export function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanXmlValue(raw: string): string {
  const noCdata = raw.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  return decodeEntities(stripTags(noCdata).trim());
}
