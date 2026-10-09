/**
 * Whether a heading counts as a milestone: its label holds one of the
 * keywords as a whole word, in any case, optionally pluralised.
 *
 * @param label Heading label, markdown formatting already stripped.
 * @param keywords Configured milestone keywords.
 */
export function isMilestoneHeading(label: string, keywords: string[]): boolean {
  if (!label || !keywords || keywords.length === 0) return false;
  const normalizedLabel = label.trim().toLowerCase();
  return keywords.some((kw) => {
    const trimmed = kw.trim().toLowerCase();
    if (!trimmed) return false;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-zA-Z0-9])${escaped}(?:s|es)?([^a-zA-Z0-9]|$)`, 'i');
    return pattern.test(normalizedLabel);
  });
}
