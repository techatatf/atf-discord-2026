export type InviteRole = 'student' | 'mentor';

export interface CsvRow {
  reason: string;
  maxUses: number;
  maxAge: number;
  role: InviteRole;
  existingLink?: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: string[];
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCsv(content: string): CsvParseResult {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must have a header row and at least one data row.'] };
  }

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
  const reasonIdx = headers.indexOf('reason');
  if (reasonIdx === -1) {
    return { rows: [], errors: ['CSV is missing the required "reason" column.'] };
  }

  const maxUsesIdx = headers.indexOf('max-uses');
  const maxAgeIdx = headers.indexOf('max-age');
  const linkIdx = headers.indexOf('invite-link');
  const roleIdx = headers.indexOf('role');

  const rows: CsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rowNum = i + 1;

    const rawRole = roleIdx !== -1 && fields[roleIdx] ? fields[roleIdx].toLowerCase() : '';
    if (rawRole !== '' && rawRole !== 'student' && rawRole !== 'mentor') {
      errors.push(`Row ${rowNum}: role must be "student" or "mentor", got "${fields[roleIdx]}".`);
      continue;
    }
    const role: InviteRole = (rawRole || 'student') as InviteRole;

    // If re-upload and row already has a link, pass it through
    if (linkIdx !== -1 && fields[linkIdx] && fields[linkIdx] !== '') {
      rows.push({
        reason: fields[reasonIdx] || '',
        maxUses: 1,
        maxAge: 7,
        role,
        existingLink: fields[linkIdx],
      });
      continue;
    }

    const reason = fields[reasonIdx];
    if (!reason || reason.trim() === '') {
      errors.push(`Row ${rowNum}: reason cannot be empty.`);
      continue;
    }

    let maxUses = 1;
    if (maxUsesIdx !== -1) {
      const raw = fields[maxUsesIdx];
      if (raw === undefined || raw === '') {
        errors.push(`Row ${rowNum}: max-uses cell is empty (use -1 for default).`);
        continue;
      }
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed.toString() !== raw) {
        errors.push(`Row ${rowNum}: max-uses must be an integer, got "${raw}".`);
        continue;
      }
      if (parsed === -1) {
        maxUses = 1;
      } else if (parsed < 1) {
        errors.push(`Row ${rowNum}: max-uses must be a positive integer or -1.`);
        continue;
      } else {
        maxUses = parsed;
      }
    }

    let maxAge = 7;
    if (maxAgeIdx !== -1) {
      const raw = fields[maxAgeIdx];
      if (raw === undefined || raw === '') {
        errors.push(`Row ${rowNum}: max-age cell is empty (use -1 for default).`);
        continue;
      }
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed) || parsed.toString() !== raw) {
        errors.push(`Row ${rowNum}: max-age must be an integer, got "${raw}".`);
        continue;
      }
      if (parsed === -1) {
        maxAge = 7;
      } else if (parsed < 1) {
        errors.push(`Row ${rowNum}: max-age must be a positive integer or -1 (0 is not allowed).`);
        continue;
      } else {
        maxAge = parsed;
      }
    }

    rows.push({ reason, maxUses, maxAge, role });
  }

  return { rows, errors };
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildOutputCsv(rows: CsvRow[], links: (string | null)[]): string {
  const lines: string[] = ['reason,max-uses,max-age,role,invite-link'];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const link = row.existingLink ?? links[i] ?? '';
    lines.push(
      `${escapeCsvField(row.reason)},${row.maxUses},${row.maxAge},${row.role},${link}`
    );
  }

  return lines.join('\n');
}
