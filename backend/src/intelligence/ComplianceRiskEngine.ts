import { COMPLIANCE_RISK_CONFIG } from '../config/rules.js';

export type Factor = { name: string; score: number; maximum: number; reason: string };
export type RiskInput = {
  unresolvedViolations?: { severity: string; createdAt?: string }[];
  wageConcerns?: number;
  overdueNotices?: number;
  missingRecords?: number;
  lateSubmissions?: number;
  daysSinceInspection?: number;
  anomalies?: number;
};

export const riskLevel = (score: number) =>
  score <= COMPLIANCE_RISK_CONFIG.levelBoundaries.LOW_MAX
    ? 'LOW'
    : score <= COMPLIANCE_RISK_CONFIG.levelBoundaries.MEDIUM_MAX
    ? 'MEDIUM'
    : score <= COMPLIANCE_RISK_CONFIG.levelBoundaries.HIGH_MAX
    ? 'HIGH'
    : 'CRITICAL';

export function calculateRisk(input: RiskInput) {
  const cfg = COMPLIANCE_RISK_CONFIG;
  const v = input.unresolvedViolations ?? [];
  const violation = Math.min(
    cfg.weights.violations,
    v.reduce((sum, x) => sum + (cfg.severityWeights[x.severity] ?? 2), 0)
  );

  const scores: [string, number, number, string][] = [
    [
      'Previous Violations',
      violation,
      cfg.weights.violations,
      violation ? `${v.length} unresolved confirmed finding(s), weighted by severity` : 'No unresolved confirmed findings',
    ],
    [
      'Wage Compliance Concerns',
      Math.min(cfg.weights.wage, (input.wageConcerns ?? 0) * cfg.multipliers.wageConcerns),
      cfg.weights.wage,
      (input.wageConcerns ?? 0) ? 'Reported wage information needs review' : 'No reported wage concerns',
    ],
    [
      'Pending Notices',
      Math.min(cfg.weights.notices, (input.overdueNotices ?? 0) * cfg.multipliers.overdueNotices),
      cfg.weights.notices,
      (input.overdueNotices ?? 0) ? 'One or more notice deadlines have passed' : 'No overdue notices',
    ],
    [
      'Missing Statutory Records',
      Math.min(cfg.weights.records, (input.missingRecords ?? 0) * cfg.multipliers.missingRecords),
      cfg.weights.records,
      (input.missingRecords ?? 0) ? 'Required records were marked unavailable' : 'Required records reported available',
    ],
    [
      'Delayed Submissions',
      Math.min(cfg.weights.late, (input.lateSubmissions ?? 0) * cfg.multipliers.lateSubmissions),
      cfg.weights.late,
      (input.lateSubmissions ?? 0) ? 'Compliance submissions have been late' : 'No repeated late submissions',
    ],
    [
      'Time Since Last Inspection',
      Math.min(
        cfg.weights.inspection,
        Math.max(
          0,
          Math.floor(((input.daysSinceInspection ?? 0) - cfg.multipliers.inspectionBaseDays) / cfg.multipliers.inspectionStepDays)
        )
      ),
      cfg.weights.inspection,
      (input.daysSinceInspection ?? 0) > cfg.multipliers.inspectionBaseDays
        ? 'Longer interval since the last inspection'
        : 'Inspection is reasonably recent',
    ],
    [
      'Reporting Anomalies',
      Math.min(cfg.weights.anomalies, (input.anomalies ?? 0) * cfg.multipliers.anomalies),
      cfg.weights.anomalies,
      (input.anomalies ?? 0) ? 'Inconsistent reporting patterns require review' : 'No reporting anomalies identified',
    ],
  ];

  const factors: Factor[] = scores.map(([name, score, maximum, reason]) => ({ name, score, maximum, reason }));
  const riskScore = factors.reduce((s, x) => s + x.score, 0);

  return {
    riskScore,
    riskLevel: riskLevel(riskScore),
    factors,
    recommendation: riskScore > cfg.levelBoundaries.MEDIUM_MAX ? 'Priority inspection may be considered' : 'Continue routine monitoring',
    engineVersion: cfg.version,
  };
}
