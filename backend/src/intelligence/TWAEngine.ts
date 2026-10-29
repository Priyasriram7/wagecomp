import { TWA_RULES_CONFIG } from '../config/rules.js';

export interface TWARuleResult {
  ruleName: string;
  passed: boolean;
  severity: 'NONE' | 'MEDIUM' | 'HIGH';
  reason: string;
  declaredValue: number;
  evidenceValue: number;
}

export interface FeedbackSummary {
  totalResponses: number;
  thresholdMet: boolean;
  onTimePaymentRate?: number;
  correctAmountRate?: number;
  complaintRate?: number;
  topComplaintCategory?: string;
}

export interface TWAAssessmentInput {
  establishmentId: string;
  reportingPeriod: string;
  declaration?: {
    _id?: any;
    establishmentId?: string;
    reportingPeriod?: string;
    declaredWageTotal?: number;
    totalWorkers?: number;
  } | null;
  paymentEvidence?: {
    _id?: any;
    establishmentId?: string;
    reportingPeriod?: string;
    totalAmount?: number;
    totalWorkers?: number;
  } | null;
  feedbackSummary?: FeedbackSummary;
}

export interface TWAAssessmentOutput {
  assessmentStatus: 'INCOMPLETE' | 'PENDING_REVIEW';
  completenessState: string;
  discrepancyScore: number;
  discrepancyLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  rules: TWARuleResult[];
  feedbackSummary: FeedbackSummary;
  engineVersion: string;
}

export function evaluateTWA(input: TWAAssessmentInput): TWAAssessmentOutput {
  const cfg = TWA_RULES_CONFIG;
  const feedbackSummary = input.feedbackSummary || { totalResponses: 0, thresholdMet: false };

  const missing: string[] = [];
  if (!input.declaration) {
    missing.push('Wage declaration not submitted');
  }
  if (!input.paymentEvidence) {
    missing.push('Payment evidence not imported');
  }

  // Check period or establishment mismatch
  if (input.declaration && input.paymentEvidence) {
    if (
      String(input.declaration.reportingPeriod || '').trim() !==
      String(input.paymentEvidence.reportingPeriod || '').trim()
    ) {
      missing.push('Reporting period mismatch');
    }
    if (
      String(input.declaration.establishmentId || '').trim() !==
      String(input.paymentEvidence.establishmentId || '').trim()
    ) {
      missing.push('Establishment ID mismatch');
    }
  }

  // If declaration, payment evidence, or matching reporting period is missing:
  // set assessmentStatus = INCOMPLETE, score = 0, level = NONE, rules = []
  if (missing.length > 0) {
    return {
      assessmentStatus: 'INCOMPLETE',
      completenessState: missing.join('; '),
      discrepancyScore: 0,
      discrepancyLevel: 'NONE',
      rules: [],
      feedbackSummary,
      engineVersion: cfg.version,
    };
  }

  const decl = input.declaration!;
  const evidence = input.paymentEvidence!;

  const rules: TWARuleResult[] = [];
  let totalScore = 0;

  // Rule 1: Wage Total Discrepancy
  const declaredTotal = Number(decl.declaredWageTotal) || 0;
  const evidenceTotal = Number(evidence.totalAmount) || 0;

  let diffPct = 0;
  if (declaredTotal === 0 && evidenceTotal === 0) {
    diffPct = 0;
  } else if (declaredTotal === 0) {
    diffPct = 100;
  } else {
    diffPct = (Math.abs(declaredTotal - evidenceTotal) / declaredTotal) * 100;
  }

  let wageBand = cfg.wageTotalBands.find((b) => diffPct < b.maxDiffPct);
  if (!wageBand) {
    wageBand = cfg.wageTotalBands[cfg.wageTotalBands.length - 1];
  }
  totalScore += wageBand.score;
  const wagePassed = wageBand.score === 0;
  rules.push({
    ruleName: 'Wage Total Discrepancy',
    passed: wagePassed,
    severity: wageBand.severity,
    reason: wagePassed
      ? `Declared and evidence wage totals are within acceptable range (${diffPct.toFixed(1)}% difference).`
      : `Declared wage total (₹${declaredTotal}) differs from evidence total (₹${evidenceTotal}) by ${diffPct.toFixed(1)}%.`,
    declaredValue: declaredTotal,
    evidenceValue: evidenceTotal,
  });

  // Rule 2: Worker Count Discrepancy
  const declWorkers = Number(decl.totalWorkers) || 0;
  const evidWorkers = Number(evidence.totalWorkers) || 0;
  const countDiff = Math.abs(declWorkers - evidWorkers);

  let workerBand = cfg.workerCountBands.find((b) => countDiff <= b.maxDiffCount);
  if (!workerBand) {
    workerBand = cfg.workerCountBands[cfg.workerCountBands.length - 1];
  }
  totalScore += workerBand.score;
  const workerPassed = workerBand.score === 0;
  rules.push({
    ruleName: 'Worker Count Discrepancy',
    passed: workerPassed,
    severity: workerBand.severity,
    reason: workerPassed
      ? 'Declared worker count matches payment evidence worker count.'
      : `Declared count (${declWorkers}) differs from evidence count (${evidWorkers}) by ${countDiff} worker(s).`,
    declaredValue: declWorkers,
    evidenceValue: evidWorkers,
  });

  // Rule 3: Worker Feedback Concern (evaluated only if feedback threshold is met)
  if (feedbackSummary.thresholdMet) {
    const complRate = feedbackSummary.complaintRate || 0;
    const onTimeRate = feedbackSummary.onTimePaymentRate ?? 100;
    const fbCfg = cfg.workerFeedback;

    if (complRate > fbCfg.mediumConcernComplaintRate || onTimeRate < fbCfg.mediumConcernOnTimeRate) {
      const isHigh = complRate > fbCfg.highConcernComplaintRate || onTimeRate < fbCfg.highConcernOnTimeRate;
      const score = isHigh ? fbCfg.highConcernScore : fbCfg.mediumConcernScore;
      totalScore += score;
      rules.push({
        ruleName: 'Worker Feedback Concern',
        passed: false,
        severity: isHigh ? 'HIGH' : 'MEDIUM',
        reason: `Aggregated worker feedback indicates concerns: ${complRate}% complaint rate, ${onTimeRate}% on-time payment rate.`,
        declaredValue: 0,
        evidenceValue: 0,
      });
    } else {
      rules.push({
        ruleName: 'Worker Feedback Concern',
        passed: true,
        severity: 'NONE',
        reason: `Worker feedback is within acceptable range: ${complRate}% complaint rate.`,
        declaredValue: 0,
        evidenceValue: 0,
      });
    }
  }

  const cappedScore = Math.min(100, totalScore);
  const levels = cfg.discrepancyLevels;
  const discrepancyLevel =
    cappedScore <= levels.NONE_MAX
      ? 'NONE'
      : cappedScore <= levels.LOW_MAX
      ? 'LOW'
      : cappedScore <= levels.MEDIUM_MAX
      ? 'MEDIUM'
      : cappedScore <= levels.HIGH_MAX
      ? 'HIGH'
      : 'CRITICAL';

  return {
    assessmentStatus: 'PENDING_REVIEW',
    completenessState: 'All evidence streams available',
    discrepancyScore: cappedScore,
    discrepancyLevel,
    rules,
    feedbackSummary,
    engineVersion: cfg.version,
  };
}
