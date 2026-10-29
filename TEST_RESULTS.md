# Test Results

Test runner: Node.js native test runner (`node --test`)
Executed at: 2026-10-29
Total tests: 27
Passed: 27
Failed: 0

| Test Name | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Existing Tests** | | | |
| clean establishment is low risk | riskScore: 0 | riskScore: 0 | PASS |
| combined factors are deterministic and capped | riskScore: 100, deterministic output | riskScore: 100, matched deepEqual | PASS |
| risk level boundaries | 30: LOW, 31: MEDIUM, 61: HIGH, 81: CRITICAL | 30: LOW, 31: MEDIUM, 61: HIGH, 81: CRITICAL | PASS |
| **TWA Engine (Task 1 & 2)** | | | |
| wage band boundary 4.9% (below 5% tolerance) | score: 0, level: NONE, rule.passed: true | score: 0, level: NONE, rule.passed: true | PASS |
| wage band boundary 5.0% (minor band trigger) | score: 20, level: LOW, rule.passed: false | score: 20, level: LOW, rule.passed: false | PASS |
| wage band boundary 15.0% (moderate band trigger) | score: 40, level: MEDIUM, rule.passed: false | score: 40, level: MEDIUM, rule.passed: false | PASS |
| wage band boundary 30.0% (severe band trigger) | score: 60, level: HIGH, rule.passed: false | score: 60, level: HIGH, rule.passed: false | PASS |
| worker count band minor (diff 1-2 workers) | score: 10, rule.passed: false | score: 10, rule.passed: false | PASS |
| worker count band major (diff > 10 workers) | score: 40, rule.passed: false | score: 40, rule.passed: false | PASS |
| declaredWageTotal = 0 guards division by zero | finite numeric score (60), no NaN | finite numeric score: 60, no NaN | PASS |
| missing payment evidence gives INCOMPLETE | status: INCOMPLETE, score: 0, level: NONE | status: INCOMPLETE, score: 0, level: NONE | PASS |
| reporting period mismatch gives INCOMPLETE | status: INCOMPLETE, score: 0, level: NONE | status: INCOMPLETE, score: 0, level: NONE | PASS |
| **CSV Validation (Task 3)** | | | |
| valid file with all required columns | valid: true, status: VALID, total: 33500 | valid: true, status: VALID, total: 33500 | PASS |
| missing required column | valid: false, status: INVALID, error message | valid: false, status: INVALID, error message | PASS |
| bad/negative wage number | validRecords: 0, error in validationErrors | validRecords: 0, row flagged | PASS |
| duplicate employeeId within file | status: PARTIAL, duplicate error flagged | status: PARTIAL, duplicate error flagged | PASS |
| invalid rows excluded from totals | status: PARTIAL, valid: 1, total: 20000 | status: PARTIAL, valid: 1, total: 20000 | PASS |
| **Feedback Privacy & Duplication (Task 6)** | | | |
| 4 responses give suppressed | suppressed: true, breakdowns undefined | suppressed: true, breakdowns undefined | PASS |
| 5 responses meet threshold | suppressed: false, total: 5, onTime: 80% | suppressed: false, total: 5, onTime: 80% | PASS |
| duplicate sessionHash rejected | status: 429, already recorded error | status: 429, already recorded error | PASS |
| **Authorization Scoping (Task 5)** | | | |
| employer cannot read another establishment | status: 403, allowed: false | status: 403, allowed: false | PASS |
| inspector cannot read unassigned establishment | status: 403, allowed: false | status: 403, allowed: false | PASS |
| wrong role gets 403 | status: 403, allowed: false | status: 403, allowed: false | PASS |
| **File Upload Validation (Task 4)** | | | |
| wrong MIME type rejected | valid: false, error: invalid file type | valid: false, error: invalid file type | PASS |
| oversized file (>25MB) rejected | valid: false, error: exceeds limit | valid: false, error: exceeds limit | PASS |
| mismatched magic byte signature rejected | valid: false, error: signature mismatch | valid: false, error: signature mismatch | PASS |
| genuine PDF with %PDF header accepted | valid: true, signature check true | valid: true, signature check true | PASS |
