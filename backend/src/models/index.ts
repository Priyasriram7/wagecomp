import {Schema,model} from 'mongoose';
const opts = { timestamps: true, strict: false }; const ref = Schema.Types.Mixed; const mixed = Schema.Types.Mixed;

export const UserModel=model('User',new Schema({name:String,email:{type:String,unique:true,index:true},phone:String,passwordHash:{type:String,select:false},role:{type:String,enum:['LABOUR_OFFICER','LABOUR_INSPECTOR','EMPLOYER'],index:true},districtId:{type:ref,index:true},establishmentId:{type:ref,index:true},employeeId:String,status:String},opts));
export const DistrictModel=model('District',new Schema({districtName:String,districtCode:{type:String,unique:true},state:String,officeAddress:String,contactDetails:String,status:String},opts));
export const EstablishmentModel=model('Establishment',new Schema({establishmentName:{type:String,index:true},registrationNumber:{type:String,unique:true,index:true},industryType:{type:String,index:true},establishmentType:String,address:String,districtId:{type:ref,index:true},ownerName:String,contactPerson:String,email:String,phone:String,licenceDetails:String,totalEmployees:Number,maleEmployees:Number,femaleEmployees:Number,contractEmployees:Number,permanentEmployees:Number,establishmentStatus:String,verificationStatus:{type:String,index:true},documentVerificationStatus:{type:String,enum:['PENDING','APPROVED','REJECTED'],default:'PENDING',index:true},documentVerificationRemarks:{type:String,default:''},documentVerifiedBy:{type:ref,default:null},documentVerifiedAt:{type:Date,default:null},documents:[mixed],lastInspectionDate:Date,risk:mixed},opts));
export const ComplianceSubmissionModel=model('ComplianceSubmission',new Schema({establishmentId:{type:ref,index:true},reportingPeriod:{type:String,index:true},employeeCount:Number,wageInformation:mixed,minimumWageReference:String,attendanceSummary:mixed,overtimeHours:Number,overtimePayment:String,statutoryRegisters:mixed,requiredDocuments:[mixed],submissionDate:Date,submissionStatus:String,validationResults:mixed,complianceScore:Number},opts));
export const InspectionModel=model('Inspection',new Schema({establishmentId:{type:ref,index:true},districtId:{type:ref,index:true},assignedInspectorId:{type:ref,index:true},assignedBy:ref,inspectionType:String,scheduledDate:Date,actualInspectionDate:Date,status:{type:String,index:true},priority:String,riskScoreAtAssignment:Number,checklist:[mixed],observations:String,evidence:[mixed],workerInteractionSummary:String,inspectorRemarks:String,reportSubmittedAt:Date,followUpFor:ref},opts));
export const ViolationModel=model('Violation',new Schema({establishmentId:{type:ref,index:true},inspectionId:ref,violationCategory:String,description:String,legalReference:String,evidence:[mixed],severity:String,status:{type:String,index:true},correctiveDeadline:Date,resolvedAt:Date},opts));
export const NoticeModel=model('Notice',new Schema({establishmentId:{type:ref,index:true},inspectionId:ref,violationId:ref,issuedBy:ref,noticeType:String,noticeNumber:{type:String,index:true},issueDate:Date,responseDeadline:Date,description:String,status:{type:String,index:true},employerResponse:String,responseDate:Date},opts));
export const CorrectiveActionModel=model('CorrectiveAction',new Schema({establishmentId:{type:ref,index:true},violationId:ref,noticeId:ref,submittedBy:ref,description:String,evidence:[mixed],submittedDate:Date,verificationStatus:String,verifiedBy:ref,verificationDate:Date,remarks:String},opts));
export const RiskAssessmentModel=model('RiskAssessment',new Schema({establishmentId:{type:ref,index:true},complianceScore:Number,riskScore:{type:Number,index:true},riskLevel:{type:String,index:true},factors:[mixed],recommendations:String,calculatedAt:Date,engineVersion:String},opts));
export const NotificationModel=model('Notification',new Schema({recipientId:{type:ref,index:true},title:String,message:String,type:String,relatedEntityId:ref,isRead:Boolean},opts));
export const AuditLogModel=model('AuditLog',new Schema({userId:{type:ref,index:true},action:String,entityType:String,entityId:ref,oldValue:mixed,newValue:mixed,ipAddress:String,timestamp:{type:Date,default:Date.now,index:true}},opts));

// ─── Triangulated Wage Assurance Models ────────────────────────────────────

/**
 * WageDeclaration — Stream 1: Employer-declared wage information
 * Employer submits this for a specific establishment + reporting period.
 */
export const WageDeclarationModel = model('WageDeclaration', new Schema({
  establishmentId:  { type: ref, required: true, index: true },
  submittedBy:      { type: ref, required: true },          // employer userId
  reportingPeriod:  { type: String, required: true, index: true }, // e.g. "2026-Q3"
  totalWorkers:     { type: Number, required: true },
  declaredWageTotal:{ type: Number, required: true },        // total wage amount in ₹
  minimumWage:      { type: Number },                        // statutory minimum reference
  wageComponents:   { type: mixed },                         // breakdown (basic, DA, HRA …)
  paymentMode:      { type: String },                        // BANK / CASH / MIXED
  paymentDate:      { type: String },                        // e.g. "2026-09-28"
  remarks:          { type: String },
  documents:        [{ docName: String, docType: String, fileName: String, uploadedAt: String }],
  status:           { type: String, enum: ['DRAFT','SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUESTED','REVIEWED'], default: 'SUBMITTED', index: true },
  officerRemarks:   { type: String },
}, opts));

/**
 * PaymentEvidence — Stream 2: Payment & statutory contribution evidence
 * Imported from CSV by authorised personnel (Labour Officer).
 */
export const PaymentEvidenceModel = model('PaymentEvidence', new Schema({
  establishmentId:    { type: ref, required: true, index: true },
  importedBy:         { type: ref, required: true },          // officer userId
  reportingPeriod:    { type: String, required: true, index: true },
  importedAt:         { type: Date, default: Date.now },
  originalFileName:   { type: String },
  records: [{                                                 // each parsed CSV row
    employeeId:       String,
    employeeName:     String,
    wages:            Number,
    pfContribution:   Number,
    esiContribution:  Number,
    paymentDate:      String,
    bankRef:          String,
    remarks:          String,
  }],
  totalAmount:        { type: Number },                       // sum across all records
  totalWorkers:       { type: Number },                       // distinct count
  validationErrors:   [String],
  status:             { type: String, enum: ['VALID','PARTIAL','INVALID'], default: 'VALID' },
}, opts));

/**
 * WorkerFeedback — Stream 3: Anonymous aggregated worker feedback
 * Submitted through public interface without account.
 */
const workerFeedbackSchema = new Schema({
  establishmentId:  { type: ref, required: true, index: true },
  reportingPeriod:  { type: String, required: true, index: true },
  // Individual submission (kept minimal — no name, no unique identifier)
  wageReceivedOnTime:   { type: Boolean },
  wageAmountCorrect:    { type: Boolean },
  hasComplaints:        { type: Boolean },
  complaintCategory:    { type: String, enum: ['UNDERPAYMENT','DELAY','DEDUCTIONS','OVERTIME','OTHER','NONE'], default: 'NONE' },
  feedbackText:         { type: String, maxlength: 500 },     // optional, truncated
  submittedAt:          { type: Date, default: Date.now },
  // Privacy controls (no personal identifiers stored)
  sessionHash:          { type: String, index: true },        // salted hash of IP+UA to detect duplicates; not reversible
}, opts);
workerFeedbackSchema.index({ establishmentId: 1, reportingPeriod: 1, sessionHash: 1 }, { unique: true });
export const WorkerFeedbackModel = model('WorkerFeedback', workerFeedbackSchema);

/**
 * TriangulatedAssessment — The generated discrepancy assessment
 * Created/updated when an officer triggers analysis or declarations are submitted.
 */
export const TriangulatedAssessmentModel = model('TriangulatedAssessment', new Schema({
  establishmentId:      { type: ref, required: true, index: true },
  reportingPeriod:      { type: String, required: true, index: true },
  wageDeclarationId:    { type: ref },
  paymentEvidenceId:    { type: ref },
  // Computed assessment results
  assessmentStatus:     {
    type: String,
    enum: ['INCOMPLETE','PENDING_REVIEW','EXPLAINED','NOT_SUBSTANTIATED','CLARIFICATION_REQUESTED','REFERRED_FOR_INSPECTION'],
    default: 'INCOMPLETE', index: true,
  },
  completenessState:    { type: String },                     // human-readable note on what is missing
  discrepancyScore:     { type: Number, default: 0 },         // 0–100 review priority indicator
  discrepancyLevel:     { type: String, enum: ['NONE','LOW','MEDIUM','HIGH','CRITICAL'], default: 'NONE' },
  engineVersion:        { type: String, default: '1.1.0' },
  rules: [{                                                   // each applied rule
    ruleName:     String,
    passed:       Boolean,
    severity:     String,
    reason:       String,
    declaredValue: Number,
    evidenceValue: Number,
  }],
  feedbackSummary: {                                          // aggregated from WorkerFeedback
    totalResponses:       Number,
    thresholdMet:         Boolean,                            // true if >= MIN_FEEDBACK_THRESHOLD
    onTimePaymentRate:    Number,
    correctAmountRate:    Number,
    complaintRate:        Number,
    topComplaintCategory: String,
  },
  // Review workflow
  reviewedBy:           { type: ref },
  reviewedAt:           { type: Date },
  reviewDecision:       { type: String },
  reviewComments:       { type: String },
  clarificationRequested:{ type: Boolean, default: false },
  clarificationNote:    { type: String },
  employerClarification:{ type: String },
  employerClarifiedAt:  { type: Date },
  generatedAt:          { type: Date, default: Date.now },
}, opts));
