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
  originalHeaders: string[];
  rawRows: string[][];
  linkColumnIndex: number;
  roleColumnIndex: number;
}

const KNOWN_FIELDS: Record<string, string> = {
  reason: 'reason',
  maxuse: 'maxUses',
  maxage: 'maxAge',
  role: 'role',
  invitelink: 'inviteLink',
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[-_ ]/g, '').replace(/s$/, '');
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
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function resolveColumnIndices(originalHeaders: string[]): { columnMap: Record<string, number>; errors: string[] } {
  const columnMap: Record<string, number> = {};
  const errors: string[] = [];

  for (let i = 0; i < originalHeaders.length; i++) {
    const normalized = normalizeHeader(originalHeaders[i]);
    const knownField = KNOWN_FIELDS[normalized];
    if (!knownField) continue;
    if (columnMap[knownField] !== undefined) {
      errors.push(
        `Duplicate column: "${originalHeaders[i].trim()}" resolves to the same field as "${originalHeaders[columnMap[knownField]].trim()}".`
      );
    } else {
      columnMap[knownField] = i;
    }
  }

  return { columnMap, errors };
}

function emptyResult(errors: string[]): CsvParseResult {
  return { rows: [], errors, originalHeaders: [], rawRows: [], linkColumnIndex: -1, roleColumnIndex: -1 };
}

export function parseCsv(content: string): CsvParseResult {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    return emptyResult(['CSV must have a header row and at least one data row.']);
  }

  const originalHeaders = parseCsvLine(lines[0]);
  const { columnMap, errors: dupeErrors } = resolveColumnIndices(originalHeaders);

  if (dupeErrors.length > 0) {
    return { rows: [], errors: dupeErrors, originalHeaders, rawRows: [], linkColumnIndex: columnMap['inviteLink'] ?? -1, roleColumnIndex: columnMap['role'] ?? -1 };
  }

  const reasonIdx = columnMap['reason'] ?? -1;
  if (reasonIdx === -1) {
    return { rows: [], errors: ['CSV is missing the required "reason" column.'], originalHeaders, rawRows: [], linkColumnIndex: -1, roleColumnIndex: -1 };
  }

  const maxUsesIdx = columnMap['maxUses'] ?? -1;
  const maxAgeIdx = columnMap['maxAge'] ?? -1;
  const linkIdx = columnMap['inviteLink'] ?? -1;
  const roleIdx = columnMap['role'] ?? -1;

  const rows: CsvRow[] = [];
  const rawRows: string[][] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rowNum = i + 1;

    const rawRole = roleIdx !== -1 ? (fields[roleIdx]?.trim().toLowerCase() ?? '') : '';
    if (rawRole !== '' && rawRole !== 'student' && rawRole !== 'mentor') {
      errors.push(`Row ${rowNum}: role must be "student" or "mentor", got "${fields[roleIdx]?.trim()}".`);
      continue;
    }
    const role: InviteRole = (rawRole || 'student') as InviteRole;

    const linkValue = linkIdx !== -1 ? (fields[linkIdx]?.trim() ?? '') : '';
    if (linkValue !== '') {
      rows.push({
        reason: fields[reasonIdx]?.trim() || '',
        maxUses: 1,
        maxAge: 7,
        role,
        existingLink: linkValue,
      });
      rawRows.push(fields);
      continue;
    }

    const reason = fields[reasonIdx]?.trim() ?? '';
    if (reason === '') {
      errors.push(`Row ${rowNum}: reason cannot be empty.`);
      continue;
    }

    let maxUses = 1;
    if (maxUsesIdx !== -1) {
      const raw = fields[maxUsesIdx]?.trim() ?? '';
      if (raw === '') {
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
      const raw = fields[maxAgeIdx]?.trim() ?? '';
      if (raw === '') {
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
    rawRows.push(fields);
  }

  return { rows, errors, originalHeaders, rawRows, linkColumnIndex: linkIdx, roleColumnIndex: roleIdx };
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildOutputCsv(parseResult: CsvParseResult, links: (string | null)[]): string {
  const { originalHeaders, rawRows, linkColumnIndex, roleColumnIndex, rows } = parseResult;

  const outHeaders = [...originalHeaders];
  let roleFillIdx = roleColumnIndex;
  let linkFillIdx = linkColumnIndex;

  if (roleColumnIndex === -1) {
    roleFillIdx = outHeaders.length;
    outHeaders.push('role');
  }
  if (linkColumnIndex === -1) {
    linkFillIdx = outHeaders.length;
    outHeaders.push('invite-link');
  }

  const outputLines: string[] = [outHeaders.map(h => escapeCsvField(h)).join(',')];

  for (let i = 0; i < rawRows.length; i++) {
    const fields = [...rawRows[i]];
    const row = rows[i];

    while (fields.length < outHeaders.length) {
      fields.push('');
    }

    fields[linkFillIdx] = row.existingLink ?? links[i] ?? '';

    if (roleColumnIndex === -1) {
      fields[roleFillIdx] = row.role;
    }

    outputLines.push(fields.map(f => escapeCsvField(f)).join(','));
  }

  return outputLines.join('\n');
}
