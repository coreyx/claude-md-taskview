/**
 * Whether a heading counts as a milestone: its label starts with one of the
 * keywords as a whole word, in any case, where letters, digits and `_` all
 * belong to a word. A keyword later in the heading, in the plural, or inside an
 * identifier (`Milestone_notes`) does not count, so notes, bookmarks and
 * overview sections ("Milestones") can mention a milestone without becoming one.
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
    const pattern = new RegExp(`^${escaped}([^a-zA-Z0-9_]|$)`, 'i');
    return pattern.test(normalizedLabel);
  });
}
