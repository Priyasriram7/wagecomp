/**
 * Validation utilities for File Uploads and CSV Payment Evidence Imports.
 */

// ─── File Upload Validation ───────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Checks the magic byte signature of a file Buffer or base64 string against its declared MIME type.
 */
export function verifyFileSignature(fileType: string, buffer: Buffer): boolean {
  if (buffer.length < 4) return false;

  if (fileType === 'application/pdf') {
    // PDF starts with %PDF (0x25 0x50 0x44 0x46)
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  if (fileType === 'image/jpeg') {
    // JPEG starts with 0xFF 0xD8 0xFF
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (fileType === 'image/png') {
    // PNG starts with 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (fileType === 'image/webp') {
    // WebP has "RIFF" at bytes 0-3 and "WEBP" at bytes 8-11
    if (buffer.length < 12) return false;
    const isRiff =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46;
    const isWebp =
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;
    return isRiff && isWebp;
  }

  return false;
}

export function extractBufferFromDataUri(dataUriOrBase64: string): Buffer | null {
  try {
    const raw = dataUriOrBase64.includes(',')
      ? dataUriOrBase64.split(',')[1]
      : dataUriOrBase64;
    return Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
}

export function validateUploadedFile(file: {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileData?: string;
}): { valid: boolean; error?: string } {
  if (!file.fileType || !ALLOWED_MIME_TYPES.includes(file.fileType)) {
    return {
      valid: false,
      error: `Invalid file type: "${file.fileType || 'unknown'}". Only PDF, JPG, PNG, and WebP are allowed.`,
    };
  }

  if (file.fileSize && file.fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${file.fileSize} bytes) exceeds the maximum allowed limit of 25MB.`,
    };
  }

  if (file.fileData) {
    const buf = extractBufferFromDataUri(file.fileData);
    if (!buf || buf.length === 0) {
      return { valid: false, error: 'File data could not be parsed.' };
    }
    if (buf.length > MAX_FILE_SIZE_BYTES) {
      return { valid: false, error: 'File size exceeds maximum allowed limit of 25MB.' };
    }
    const signatureMatches = verifyFileSignature(file.fileType, buf);
    if (!signatureMatches) {
      return {
        valid: false,
        error: `File signature does not match declared MIME type "${file.fileType}".`,
      };
    }
  }

  return { valid: true };
}

// ─── CSV Import Validation ────────────────────────────────────────────────

export const REQUIRED_CSV_COLUMNS = [
  'employeeId',
  'employeeName',
  'wages',
  'pfContribution',
  'esiContribution',
  'paymentDate',
  'bankRef',
] as const;

export const OPTIONAL_CSV_COLUMNS = ['remarks'] as const;

export const MAX_CSV_ROWS = 5000;
export const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface CSVRecordInput {
  employeeId?: any;
  employeeName?: any;
  wages?: any;
  pfContribution?: any;
  esiContribution?: any;
  paymentDate?: any;
  bankRef?: any;
  remarks?: any;
  [key: string]: any;
}

export interface ValidPaymentRecord {
  employeeId: string;
  employeeName: string;
  wages: number;
  pfContribution: number;
  esiContribution: number;
  paymentDate: string;
  bankRef: string;
  remarks?: string;
}

export interface CSVValidationResult {
  valid: boolean;
  error?: string; // Header or structural error
  status: 'VALID' | 'PARTIAL' | 'INVALID';
  validRecords: ValidPaymentRecord[];
  validationErrors: string[];
  totalAmount: number;
  totalWorkers: number;
}

export function validateCSVRecords(
  records: CSVRecordInput[],
  columnsPresent?: string[]
): CSVValidationResult {
  if (!Array.isArray(records) || records.length === 0) {
    return {
      valid: false,
      error: 'CSV contains no data rows.',
      status: 'INVALID',
      validRecords: [],
      validationErrors: ['File contains no data rows.'],
      totalAmount: 0,
      totalWorkers: 0,
    };
  }

  if (records.length > MAX_CSV_ROWS) {
    return {
      valid: false,
      error: `Row count (${records.length}) exceeds maximum limit of ${MAX_CSV_ROWS} rows.`,
      status: 'INVALID',
      validRecords: [],
      validationErrors: [`Row count exceeds ${MAX_CSV_ROWS}`],
      totalAmount: 0,
      totalWorkers: 0,
    };
  }

  // If explicit column list passed, validate columns
  const cols = columnsPresent || Object.keys(records[0] || {});
  const missingCols = REQUIRED_CSV_COLUMNS.filter((c) => !cols.includes(c));
  if (missingCols.length > 0) {
    return {
      valid: false,
      error: `Missing required column(s): ${missingCols.join(', ')}.`,
      status: 'INVALID',
      validRecords: [],
      validationErrors: [`Missing required column(s): ${missingCols.join(', ')}`],
      totalAmount: 0,
      totalWorkers: 0,
    };
  }

  const allowedCols = [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS];
  const unknownCols = cols.filter((c) => !allowedCols.includes(c as any));
  if (unknownCols.length > 0) {
    return {
      valid: false,
      error: `Unknown column(s) not allowed: ${unknownCols.join(', ')}.`,
      status: 'INVALID',
      validRecords: [],
      validationErrors: [`Unknown column(s): ${unknownCols.join(', ')}`],
      totalAmount: 0,
      totalWorkers: 0,
    };
  }

  const seenEmployeeIds = new Set<string>();
  const validationErrors: string[] = [];
  const validRecords: ValidPaymentRecord[] = [];

  records.forEach((row, idx) => {
    const rowNum = idx + 1;
    const rowErrors: string[] = [];

    // employeeId
    const empId = String(row.employeeId || '').trim();
    if (!empId) {
      rowErrors.push(`Row ${rowNum}: employeeId is required`);
    } else if (seenEmployeeIds.has(empId)) {
      rowErrors.push(`Row ${rowNum}: duplicate employeeId "${empId}"`);
    } else {
      seenEmployeeIds.add(empId);
    }

    // employeeName
    const empName = String(row.employeeName || '').trim();
    if (!empName) {
      rowErrors.push(`Row ${rowNum}: employeeName is required`);
    }

    // wages
    const wagesNum = Number(row.wages);
    if (isNaN(wagesNum) || wagesNum < 0 || row.wages === null || row.wages === undefined || row.wages === '') {
      rowErrors.push(`Row ${rowNum}: wages must be a non-negative number`);
    }

    // pfContribution
    const pfNum = row.pfContribution !== undefined && row.pfContribution !== null && row.pfContribution !== ''
      ? Number(row.pfContribution)
      : 0;
    if (isNaN(pfNum) || pfNum < 0) {
      rowErrors.push(`Row ${rowNum}: pfContribution must be a non-negative number`);
    }

    // esiContribution
    const esiNum = row.esiContribution !== undefined && row.esiContribution !== null && row.esiContribution !== ''
      ? Number(row.esiContribution)
      : 0;
    if (isNaN(esiNum) || esiNum < 0) {
      rowErrors.push(`Row ${rowNum}: esiContribution must be a non-negative number`);
    }

    // paymentDate
    const dateStr = String(row.paymentDate || '').trim();
    if (!dateStr || isNaN(Date.parse(dateStr))) {
      rowErrors.push(`Row ${rowNum}: paymentDate must be a valid date`);
    }

    // bankRef
    const bankRef = String(row.bankRef || '').trim();
    if (!bankRef) {
      rowErrors.push(`Row ${rowNum}: bankRef is required`);
    }

    if (rowErrors.length > 0) {
      validationErrors.push(...rowErrors);
    } else {
      validRecords.push({
        employeeId: empId,
        employeeName: empName,
        wages: wagesNum,
        pfContribution: pfNum,
        esiContribution: esiNum,
        paymentDate: dateStr,
        bankRef,
        remarks: row.remarks ? String(row.remarks).trim() : undefined,
      });
    }
  });

  const totalAmount = validRecords.reduce((sum, r) => sum + r.wages, 0);
  const totalWorkers = validRecords.length;

  let status: 'VALID' | 'PARTIAL' | 'INVALID' = 'VALID';
  if (validationErrors.length > 0) {
    status = validRecords.length > 0 ? 'PARTIAL' : 'INVALID';
  }

  return {
    valid: true,
    status,
    validRecords,
    validationErrors,
    totalAmount,
    totalWorkers,
  };
}
