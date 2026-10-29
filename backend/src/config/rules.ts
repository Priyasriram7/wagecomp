/**
 * Centralized, visible rules configuration for Compliance Risk Engine and
 * Triangulated Wage Assurance (TWA) Discrepancy Engine.
 */

export const ACTIVE_RULES_VERSION = '1.1.0';

export interface WageBandConfig {
  maxDiffPct: number;
  score: number;
  severity: 'NONE' | 'MEDIUM' | 'HIGH';
}

export interface WorkerCountBandConfig {
  maxDiffCount: number;
  score: number;
  severity: 'NONE' | 'MEDIUM' | 'HIGH';
}

export const TWA_RULES_CONFIG = {
  version: ACTIVE_RULES_VERSION,
  wageTotalBands: [
    { maxDiffPct: 5, score: 0, severity: 'NONE' },
    { maxDiffPct: 15, score: 20, severity: 'MEDIUM' },
    { maxDiffPct: 30, score: 40, severity: 'HIGH' },
    { maxDiffPct: Infinity, score: 60, severity: 'HIGH' },
  ] as WageBandConfig[],
  workerCountBands: [
    { maxDiffCount: 0, score: 0, severity: 'NONE' },
    { maxDiffCount: 2, score: 10, severity: 'MEDIUM' },
    { maxDiffCount: 10, score: 25, severity: 'HIGH' },
    { maxDiffCount: Infinity, score: 40, severity: 'HIGH' },
  ] as WorkerCountBandConfig[],
  workerFeedback: {
    minThreshold: 5,
    highConcernComplaintRate: 60,
    highConcernOnTimeRate: 40,
    highConcernScore: 30,
    mediumConcernComplaintRate: 40,
    mediumConcernOnTimeRate: 60,
    mediumConcernScore: 15,
  },
  discrepancyLevels: {
    NONE_MAX: 0,
    LOW_MAX: 20,
    MEDIUM_MAX: 45,
    HIGH_MAX: 70,
  },
};

export const COMPLIANCE_RISK_CONFIG = {
  version: ACTIVE_RULES_VERSION,
  weights: {
    violations: 25,
    wage: 25,
    notices: 15,
    records: 10,
    late: 10,
    inspection: 10,
    anomalies: 5,
  },
  severityWeights: {
    CRITICAL: 12,
    HIGH: 8,
    MEDIUM: 5,
    LOW: 2,
  } as Record<string, number>,
  multipliers: {
    wageConcerns: 5,
    overdueNotices: 8,
    missingRecords: 3,
    lateSubmissions: 3,
    anomalies: 2,
    inspectionBaseDays: 180,
    inspectionStepDays: 36,
  },
  levelBoundaries: {
    LOW_MAX: 30,
    MEDIUM_MAX: 60,
    HIGH_MAX: 80,
  },
};

export const ACTIVE_RULES = {
  version: ACTIVE_RULES_VERSION,
  complianceRisk: COMPLIANCE_RISK_CONFIG,
  twa: TWA_RULES_CONFIG,
};
