# EMPLOYER PORTAL AUDIT

**Generated:** 2026-10-29 | **Codebase:** Tamil Nadu Wage Compliance Portal

---

## Current Employer Menu (5 items, no exact match to target 6)

| # | Current ID | Label | Component |
|---|-----------|-------|-----------|
| 1 | `Dashboard` | Dashboard | `EmployerDashboard` |
| 2 | `Establishment Profile` | Establishment Profile | `EmployerEstablishmentModule` |
| 3 | `Wage Compliance` | Wage Compliance | `EmployerComplianceModule` |
| 4 | `Inspections & Notices` | Inspections & Notices | `EmployerInspectionsNoticesModule` |
| 5 | `Account & Support` | Account & Support | `EmployerAccountSupportModule` |

**TARGET:** Dashboard, My Establishment, Wage Return, Notices and Actions, Inspection Reports, Account

---

## Screens & Sub-tabs

### 1. EmployerDashboard
- KPI Cards: Compliance Status, Registration Status, Active Inspections, Actions Due
- Pending Statutory Actions table (notices + corrective actions)
- Quick Notice Response modal (inline)
- **DATA:** `d.establishment || EMPLOYER_ESTABLISHMENT_DATA` ← ⚠️ MOCK FALLBACK
- **DATA:** `d.submissions || EMPLOYER_COMPLIANCE_HISTORY` ← ⚠️ MOCK FALLBACK
- **DATA:** `d.inspections || EMPLOYER_UPCOMING_INSPECTIONS` ← ⚠️ MOCK FALLBACK (includes non-COMPLETED!)
- **DATA:** `d.notices || EMPLOYER_NOTICES` ← ⚠️ MOCK FALLBACK
- **DATA:** `d.actions || EMPLOYER_CORRECTIVE_ACTIONS` ← ⚠️ MOCK FALLBACK
- "Active Inspections" card counts non-COMPLETED → exposes scheduling info ← ⚠️ TASK 1

### 2. EmployerEstablishmentModule (sub-tabs: Overview | Edit | Status)
- Overview: displays establishment fields from API/mock
- Edit: form → `POST /api/establishments`
- Status: verification timeline (hardcoded dates) ← ⚠️ MOCK
- **NO** Documents section here

### 3. EmployerComplianceModule (sub-tabs: Submit | History | Documents | Declarations)
- **Submit** tab: "Statutory Wage Return Form A" → `POST /api/compliance`
  - Fields: period, workers, minimumWageCompliant, paymentMode, wagesInfo, overtimeApplicable, otInfo, attendanceMaintained, recordsMaintained, remarks
  - ⚠️ DUPLICATE: no declaredWageTotal, no minimumWageReference field
  - **fallback:** `EMPLOYER_COMPLIANCE_HISTORY` ← ⚠️ MOCK
- **History** tab: table of submissions
  - fallback: `EMPLOYER_COMPLIANCE_HISTORY` ← ⚠️ MOCK
- **Documents** tab: upload form → `POST /api/employer/documents`; list → `GET /api/employer/documents`
  - ⚠️ DUPLICATE: Documents also accessible via `EmployerEstablishmentModule` is not there — but a separate tab in `Wage Compliance`
- **Declarations** tab: embeds `EmployerWageAssuranceModule` → `POST /api/wage-declarations`
  - ⚠️ DUPLICATE with Submit Return — both collect wage data for same period
  - ⚠️ DUPLICATE: TWA Wage Declaration is a separate form from Wage Return Form A

### 4. EmployerInspectionsNoticesModule (sub-tabs: Inspections | Notices | Actions)
- **Inspections** tab: Scheduled Visits (non-COMPLETED) + Inspection History (COMPLETED)
  - Scheduled Visits shows: inspectorName, riskLevel, scheduledDate ← ⚠️ TASK 1 VIOLATION
  - fallback: `EMPLOYER_UPCOMING_INSPECTIONS` (has ASSIGNED/SCHEDULED) ← ⚠️ MOCK + TASK 1
  - fallback: `EMPLOYER_INSPECTION_HISTORY` ← ⚠️ MOCK
- **Notices** tab: `GET /api/notices` + response form → `PATCH /api/notices/:id/response`
  - fallback: `EMPLOYER_NOTICES` ← ⚠️ MOCK
  - Also has `EMPLOYER_EXPLANATIONS` hardcoded ← ⚠️ MOCK
- **Actions** tab: `GET /api/corrective-actions` + submit → `POST /api/corrective-actions`
  - fallback: `EMPLOYER_CORRECTIVE_ACTIONS` ← ⚠️ MOCK
  - Has `EMPLOYER_FOLLOWUPS[0]` hardcoded card ← ⚠️ MOCK

### 5. EmployerAccountSupportModule
- Update profile: name, phone, designation → `PATCH /api/user/profile`
- Session & Security section
- Support Directory (hardcoded Labour Dept contact info)
- ⚠️ DUPLICATE: `ProfileModule` (used by officer/inspector) also shows employer profile block with `EMPLOYER_ESTABLISHMENT_DATA` ← ⚠️ MOCK

---

## Forms and Endpoints

| Form | Fields | Endpoint | Officer Screen | Duplicate? |
|------|--------|----------|----------------|-----------|
| Wage Return (Compliance) | period, workers, minWageCompliant, paymentMode, wagesInfo, overtime, attendance, records, remarks | `POST /api/compliance` | Compliance Submissions | ✅ Yes — also TWA Wage Declaration |
| Wage Declaration (TWA) | reportingPeriod, totalWorkers, declaredWageTotal, paymentMode, paymentDate, remarks, documents | `POST /api/wage-declarations` | Wage Assurance/TWA Assessments | ✅ Yes — same data as Compliance form |
| Establishment Profile | name, industry, regNo, district, address, owner, workers, phone, email | `POST /api/establishments` | Establishments screen | No |
| Document Upload | docName, docType, fileName, fileData | `POST /api/employer/documents` | Document verification | No |
| Notice Response | explanation, evidence | `PATCH /api/notices/:id/response` | Enforcement > Notices | ✅ Duplicate: also in Dashboard quick-respond |
| Corrective Action | noticeId, violationId, description, evidence | `POST /api/corrective-actions` | Enforcement > Corrective Actions | No |
| Account Update | name, phone, designation | `PATCH /api/user/profile` | — | ✅ Duplicate: also in ProfileModule |

---

## Mock Data Usage (ALL must be removed)

| Variable | Used In | Should Come From |
|----------|---------|-----------------|
| `EMPLOYER_ESTABLISHMENT_DATA` | Dashboard, Compliance, Account, ProfileModule | `GET /api/employer/establishment` |
| `EMPLOYER_COMPLIANCE_HISTORY` | Dashboard, Compliance | `GET /api/compliance` |
| `EMPLOYER_UPCOMING_INSPECTIONS` | Dashboard, Inspections tab | `GET /api/inspections` (COMPLETED only) |
| `EMPLOYER_INSPECTION_HISTORY` | Inspections tab | `GET /api/inspections` (COMPLETED only) |
| `EMPLOYER_NOTICES` | Dashboard, Notices tab | `GET /api/notices` |
| `EMPLOYER_CORRECTIVE_ACTIONS` | Dashboard, Actions tab | `GET /api/corrective-actions` |
| `EMPLOYER_FOLLOWUPS` | Actions tab | Should not show — remove card |
| `EMPLOYER_EXPLANATIONS` | Notices tab | Track via notice.employerResponse |
| `EMPLOYER_KPI_STATS` | Not directly used in display (imported but stats computed locally) | Remove |
| `EMPLOYER_DOCUMENTS` | Compliance Documents tab | `GET /api/employer/documents` |
| `EMPLOYER_REGISTRATION_STATUS_STEPS` | Not used (superceded by computed steps in Establishment module) | Remove |
| `EMPLOYER_CURRENT_COMPLIANCE` | Not used in display (values separate) | Remove |

---

## Duplicates

1. **Wage Return + Wage Declaration** — same period, same establishment, separate forms/endpoints → merge
2. **Notice Response** — in Dashboard modal AND in Inspections & Notices > Notices tab → unify via Notices & Actions page
3. **Documents** — lives in Wage Compliance sub-tab but logically belongs with Establishment → merge into My Establishment
4. **Account profile** — `EmployerAccountSupportModule` + `ProfileModule` employer block → remove ProfileModule employer block
5. **Upcoming Inspections** — shown in Dashboard KPI ("Active Inspections") and in Inspections tab → Task 1: remove both

---

## Task Summary

| Task | What Changes |
|------|-------------|
| T1 | Backend filter inspections for EMPLOYER; frontend remove upcoming/non-COMPLETED displays |
| T2 | New `/api/employer/action-items` endpoint; unified NoticesAndActionsPage replacing separate Notices + Actions tabs |
| T3 | `POST /api/compliance` also creates WageDeclaration; unify frontend form; duplicate block by period |
| T4 | Add Documents section to EmployerEstablishmentModule; remove Documents sub-tab from Compliance |
| T5 | Remove support directory from Account; remove employer profile block from ProfileModule |
| T6 | Remove all mock fallbacks from Dashboard; show empty states |
| T7 | Verify cross-linking by reference ID between employer and officer screens |
| T8 | node:test tests + EMPLOYER_PORTAL_TEST.md |
