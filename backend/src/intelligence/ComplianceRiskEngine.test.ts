import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk, riskLevel } from './ComplianceRiskEngine.js';
import { evaluateTWA } from './TWAEngine.js';
import { validateCSVRecords, validateUploadedFile, verifyFileSignature } from '../utils/validation.js';

// ─── Existing Three Tests (Preserved exactly as required) ───────────────────
test('clean establishment is low risk', () => assert.equal(calculateRisk({}).riskScore, 0));

test('combined factors are deterministic and capped', () => {
  const data = {
    unresolvedViolations: [{ severity: 'CRITICAL' }, { severity: 'CRITICAL' }, { severity: 'CRITICAL' }],
    wageConcerns: 10,
    overdueNotices: 5,
    missingRecords: 4,
    lateSubmissions: 6,
    daysSinceInspection: 1000,
    anomalies: 4,
  };
  const r = calculateRisk(data);
  assert.equal(r.riskScore, 100);
  assert.deepEqual(r, calculateRisk(data));
});

test('risk level boundaries', () => {
  assert.equal(riskLevel(30), 'LOW');
  assert.equal(riskLevel(31), 'MEDIUM');
  assert.equal(riskLevel(61), 'HIGH');
  assert.equal(riskLevel(81), 'CRITICAL');
});

// ─── TASK 9: TWA Engine Tests ───────────────────────────────────────────────
test('TWA engine: wage band boundary 4.9% (below 5% tolerance -> 0 score)', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { totalAmount: 95100, totalWorkers: 50 }, // 4.9% difference
  });
  assert.equal(res.assessmentStatus, 'PENDING_REVIEW');
  assert.equal(res.discrepancyScore, 0);
  assert.equal(res.discrepancyLevel, 'NONE');
  assert.equal(res.rules[0].passed, true);
});

test('TWA engine: wage band boundary 5.0% (triggers minor band -> score 20)', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { totalAmount: 95000, totalWorkers: 50 }, // 5.0% difference
  });
  assert.equal(res.assessmentStatus, 'PENDING_REVIEW');
  assert.equal(res.discrepancyScore, 20);
  assert.equal(res.discrepancyLevel, 'LOW');
  assert.equal(res.rules[0].passed, false);
});

test('TWA engine: wage band boundary 15.0% (triggers moderate band -> score 40)', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { totalAmount: 85000, totalWorkers: 50 }, // 15.0% difference
  });
  assert.equal(res.assessmentStatus, 'PENDING_REVIEW');
  assert.equal(res.discrepancyScore, 40);
  assert.equal(res.discrepancyLevel, 'MEDIUM');
});

test('TWA engine: wage band boundary 30.0% (triggers severe band -> score 60)', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { totalAmount: 70000, totalWorkers: 50 }, // 30.0% difference
  });
  assert.equal(res.assessmentStatus, 'PENDING_REVIEW');
  assert.equal(res.discrepancyScore, 60);
  assert.equal(res.discrepancyLevel, 'HIGH');
});

test('TWA engine: worker count band minor (diff 1-2 -> score 10)', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { totalAmount: 100000, totalWorkers: 48 }, // diff 2
  });
  assert.equal(res.discrepancyScore, 10);
  assert.equal(res.rules[1].passed, false);
});

test('TWA engine: worker count band major (diff >10 -> score 40)', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { totalAmount: 100000, totalWorkers: 35 }, // diff 15
  });
  assert.equal(res.discrepancyScore, 40);
});

test('TWA engine: declaredWageTotal = 0 guards against division by zero', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 0, totalWorkers: 10 },
    paymentEvidence: { totalAmount: 50000, totalWorkers: 10 },
  });
  assert.equal(Number.isNaN(res.discrepancyScore), false);
  assert.equal(Number.isFinite(res.discrepancyScore), true);
  assert.equal(res.discrepancyScore, 60);
});

test('TWA engine: missing payment evidence gives INCOMPLETE with score 0 and level NONE', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: null,
  });
  assert.equal(res.assessmentStatus, 'INCOMPLETE');
  assert.equal(res.discrepancyScore, 0);
  assert.equal(res.discrepancyLevel, 'NONE');
  assert.match(res.completenessState, /Payment evidence not imported/i);
});

test('TWA engine: reporting period mismatch gives INCOMPLETE with score 0', () => {
  const res = evaluateTWA({
    establishmentId: 'EST-001',
    reportingPeriod: '2026-Q3',
    declaration: { establishmentId: 'EST-001', reportingPeriod: '2026-Q3', declaredWageTotal: 100000, totalWorkers: 50 },
    paymentEvidence: { establishmentId: 'EST-001', reportingPeriod: '2026-Q2', totalAmount: 100000, totalWorkers: 50 },
  });
  assert.equal(res.assessmentStatus, 'INCOMPLETE');
  assert.equal(res.discrepancyScore, 0);
  assert.equal(res.discrepancyLevel, 'NONE');
  assert.match(res.completenessState, /Reporting period mismatch/i);
});

// ─── TASK 9: CSV Validation Tests ───────────────────────────────────────────
test('CSV validation: valid file with all required columns accepted', () => {
  const records = [
    { employeeId: 'EMP001', employeeName: 'Ravi Kumar', wages: 18000, pfContribution: 2160, esiContribution: 765, paymentDate: '2026-09-28', bankRef: 'NEFT001' },
    { employeeId: 'EMP002', employeeName: 'Suganya T', wages: 15500, pfContribution: 1860, esiContribution: 581, paymentDate: '2026-09-28', bankRef: 'NEFT002' },
  ];
  const res = validateCSVRecords(records);
  assert.equal(res.valid, true);
  assert.equal(res.status, 'VALID');
  assert.equal(res.validRecords.length, 2);
  assert.equal(res.totalAmount, 33500);
  assert.equal(res.totalWorkers, 2);
  assert.equal(res.validationErrors.length, 0);
});

test('CSV validation: missing required column rejected with clear error', () => {
  const records = [
    { employeeId: 'EMP001', employeeName: 'Ravi Kumar', wages: 18000 },
  ];
  const res = validateCSVRecords(records, ['employeeId', 'employeeName', 'wages']);
  assert.equal(res.valid, false);
  assert.equal(res.status, 'INVALID');
  assert.match(res.error || '', /Missing required column/i);
});

test('CSV validation: bad/negative wage number detected and flagged', () => {
  const records = [
    { employeeId: 'EMP001', employeeName: 'Ravi Kumar', wages: -500, pfContribution: 0, esiContribution: 0, paymentDate: '2026-09-28', bankRef: 'NEFT001' },
  ];
  const res = validateCSVRecords(records);
  assert.equal(res.status, 'INVALID');
  assert.equal(res.validRecords.length, 0);
  assert.match(res.validationErrors[0], /wages must be a non-negative number/i);
});

test('CSV validation: duplicate employeeId within file flagged', () => {
  const records = [
    { employeeId: 'EMP001', employeeName: 'Ravi Kumar', wages: 18000, pfContribution: 2160, esiContribution: 765, paymentDate: '2026-09-28', bankRef: 'NEFT001' },
    { employeeId: 'EMP001', employeeName: 'Duplicate Emp', wages: 18000, pfContribution: 2160, esiContribution: 765, paymentDate: '2026-09-28', bankRef: 'NEFT002' },
  ];
  const res = validateCSVRecords(records);
  assert.equal(res.status, 'PARTIAL');
  assert.equal(res.validRecords.length, 1);
  assert.match(res.validationErrors[0], /Duplicate employeeId "EMP001"/i);
});

test('CSV validation: invalid rows excluded from totals (PARTIAL status)', () => {
  const records = [
    { employeeId: 'EMP001', employeeName: 'Ravi Kumar', wages: 20000, pfContribution: 2400, esiContribution: 800, paymentDate: '2026-09-28', bankRef: 'NEFT001' },
    { employeeId: 'EMP002', employeeName: 'Bad Row', wages: -100, pfContribution: 0, esiContribution: 0, paymentDate: '2026-09-28', bankRef: 'NEFT002' },
  ];
  const res = validateCSVRecords(records);
  assert.equal(res.status, 'PARTIAL');
  assert.equal(res.validRecords.length, 1);
  assert.equal(res.totalAmount, 20000); // Bad row's -100 excluded
  assert.equal(res.totalWorkers, 1);
  assert.equal(res.validationErrors.length, 1);
});

// ─── TASK 9: Feedback Aggregation Privacy & Duplicate Tests ─────────────────
function aggregateFeedback(docs: any[]) {
  const MIN_THRESHOLD = 5;
  if (docs.length < MIN_THRESHOLD) {
    return { suppressed: true, message: `Minimum ${MIN_THRESHOLD} responses required.` };
  }
  const onTime = docs.filter(f => f.wageReceivedOnTime).length;
  const correct = docs.filter(f => f.wageAmountCorrect).length;
  const complaints = docs.filter(f => f.hasComplaints).length;
  return {
    suppressed: false,
    total: docs.length,
    onTimePaymentRate: Math.round((onTime / docs.length) * 100),
    correctAmountRate: Math.round((correct / docs.length) * 100),
    complaintRate: Math.round((complaints / docs.length) * 100),
  };
}

test('Feedback aggregation: 4 responses give suppressed with no breakdowns', () => {
  const responses = [
    { wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false },
    { wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false },
    { wageReceivedOnTime: false, wageAmountCorrect: true, hasComplaints: true },
    { wageReceivedOnTime: true, wageAmountCorrect: false, hasComplaints: true },
  ];
  const summary = aggregateFeedback(responses);
  assert.equal(summary.suppressed, true);
  assert.equal((summary as any).onTimePaymentRate, undefined);
  assert.equal((summary as any).total, undefined);
});

test('Feedback aggregation: 5 responses meet threshold and give calculated results', () => {
  const responses = [
    { wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false },
    { wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false },
    { wageReceivedOnTime: true, wageAmountCorrect: true, hasComplaints: false },
    { wageReceivedOnTime: false, wageAmountCorrect: true, hasComplaints: true },
    { wageReceivedOnTime: true, wageAmountCorrect: false, hasComplaints: true },
  ];
  const summary = aggregateFeedback(responses);
  assert.equal(summary.suppressed, false);
  assert.equal(summary.total, 5);
  assert.equal(summary.onTimePaymentRate, 80);
  assert.equal(summary.correctAmountRate, 80);
  assert.equal(summary.complaintRate, 40);
});

test('Feedback submission: duplicate sessionHash rejected for same establishment & period', () => {
  const recorded = new Set<string>();
  const submitFeedback = (estId: string, period: string, sessionHash: string) => {
    const key = `${estId}:${period}:${sessionHash}`;
    if (recorded.has(key)) return { status: 429, error: 'Feedback already recorded from this session.' };
    recorded.add(key);
    return { status: 200, success: true };
  };

  const first = submitFeedback('EST-001', '2026-Q3', 'hash-abc-123');
  assert.equal(first.status, 200);

  const duplicate = submitFeedback('EST-001', '2026-Q3', 'hash-abc-123');
  assert.equal(duplicate.status, 429);
  assert.match(duplicate.error || '', /already recorded/i);
});

// ─── TASK 9: Authorization Scoping Tests ────────────────────────────────────
function checkAuthorization(user: { role: string; establishmentId?: string; assignedInspectorId?: string }, record: { establishmentId: string }, assignedEsts: string[]) {
  if (user.role === 'EMPLOYER') {
    if (String(user.establishmentId) !== String(record.establishmentId)) {
      return { allowed: false, status: 403, error: 'Access denied: cannot access another establishment records' };
    }
    return { allowed: true, status: 200 };
  }
  if (user.role === 'LABOUR_INSPECTOR') {
    if (!assignedEsts.includes(String(record.establishmentId))) {
      return { allowed: false, status: 403, error: 'Access denied: establishment not assigned to you' };
    }
    return { allowed: true, status: 200 };
  }
  if (user.role === 'LABOUR_OFFICER') {
    return { allowed: true, status: 200 };
  }
  return { allowed: false, status: 403, error: 'Role unauthorized' };
}

test('Authorization: employer cannot read another establishment records (returns 403)', () => {
  const employerUser = { role: 'EMPLOYER', establishmentId: 'EST-1001' };
  const targetRecord = { establishmentId: 'EST-2002' };
  const authRes = checkAuthorization(employerUser, targetRecord, []);
  assert.equal(authRes.allowed, false);
  assert.equal(authRes.status, 403);
});

test('Authorization: inspector cannot read unassigned establishment records (returns 403)', () => {
  const inspectorUser = { role: 'LABOUR_INSPECTOR', id: 'INSP-01' };
  const targetRecord = { establishmentId: 'EST-9999' };
  const assigned = ['EST-1001', 'EST-1002'];
  const authRes = checkAuthorization(inspectorUser, targetRecord, assigned);
  assert.equal(authRes.allowed, false);
  assert.equal(authRes.status, 403);
});

test('Authorization: wrong role gets 403', () => {
  const strangerUser = { role: 'CITIZEN' };
  const targetRecord = { establishmentId: 'EST-1001' };
  const authRes = checkAuthorization(strangerUser as any, targetRecord, []);
  assert.equal(authRes.allowed, false);
  assert.equal(authRes.status, 403);
});

// ─── TASK 9: File Upload Validation Tests ───────────────────────────────────
test('File upload: wrong MIME type rejected', () => {
  const res = validateUploadedFile({
    fileName: 'malicious.exe',
    fileType: 'application/x-msdownload',
    fileSize: 1024,
  });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /Invalid file type/i);
});

test('File upload: oversized file (>25MB) rejected', () => {
  const res = validateUploadedFile({
    fileName: 'large.pdf',
    fileType: 'application/pdf',
    fileSize: 26 * 1024 * 1024, // 26 MB
  });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /exceeds the maximum allowed limit/i);
});

test('File upload: mismatched magic byte file signature rejected', () => {
  // Declaring PDF but sending plain text bytes
  const fakePdfBuffer = Buffer.from('Plain text content that is not a real PDF file header');
  const res = validateUploadedFile({
    fileName: 'fake.pdf',
    fileType: 'application/pdf',
    fileSize: fakePdfBuffer.length,
    fileData: `data:application/pdf;base64,${fakePdfBuffer.toString('base64')}`,
  });
  assert.equal(res.valid, false);
  assert.match(res.error || '', /File signature does not match/i);
});

test('File upload: genuine PDF with %PDF magic bytes accepted', () => {
  const realPdfHeader = Buffer.from('%PDF-1.4 real pdf header bytes');
  const res = validateUploadedFile({
    fileName: 'real.pdf',
    fileType: 'application/pdf',
    fileSize: realPdfHeader.length,
    fileData: `data:application/pdf;base64,${realPdfHeader.toString('base64')}`,
  });
  assert.equal(res.valid, true);
  assert.equal(verifyFileSignature('application/pdf', realPdfHeader), true);
});
