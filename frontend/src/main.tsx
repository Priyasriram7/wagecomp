import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Building2, ShieldCheck, ClipboardCheck, AlertTriangle,
  Bell, User, LogOut, ChevronDown, ChevronRight, ChevronLeft,
  Search, Eye, ArrowRight, X, Activity, FileText, CheckCircle2, Clock, Send, Plus,
  Upload, Download, FileCheck, FileSpreadsheet, Check,
  Phone, Mail, MapPin, Calendar, HelpCircle, ExternalLink, Info, AlertCircle, FileWarning, RefreshCw, UserCheck, Users,
  Folder, Trash2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import './styles.css';

import {
  INSPECTOR_KPI_STATS,
  INSPECTOR_PROFILE_DATA,
  DUMMY_ASSIGNED_INSPECTIONS,
  DUMMY_UPCOMING_INSPECTIONS,
  DUMMY_FOLLOWUP_INSPECTIONS,
  DUMMY_DRAFT_REPORTS,
  DUMMY_SUBMITTED_REPORTS,
  DUMMY_INSPECTION_HISTORY
} from './inspectorDummyData';

import {
  EMPLOYER_ESTABLISHMENT_DATA,
  EMPLOYER_REGISTRATION_STATUS_STEPS,
  EMPLOYER_CURRENT_COMPLIANCE,
  EMPLOYER_COMPLIANCE_HISTORY,
  EMPLOYER_DOCUMENTS,
  EMPLOYER_UPCOMING_INSPECTIONS,
  EMPLOYER_INSPECTION_HISTORY,
  EMPLOYER_NOTICES,
  EMPLOYER_EXPLANATIONS,
  EMPLOYER_CORRECTIVE_ACTIONS,
  EMPLOYER_FOLLOWUPS,
  EMPLOYER_KPI_STATS
} from './employerDummyData';


// Types
type Role = 'LABOUR_OFFICER' | 'LABOUR_INSPECTOR' | 'EMPLOYER';
type UserType = { id: string; name: string; email: string; role: Role; districtId?: string; establishmentId?: string; phone?: string; designation?: string; establishmentName?: string };
type ApiData = { [key: string]: any };

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

// Helper API caller
const api = async (path: string, opts: RequestInit = {}) => {
  const token = localStorage.getItem('tn_token');
  const r = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });

  const contentType = r.headers.get('content-type') || '';
  const text = await r.text();

  let j: any = {};
  if (contentType.includes('application/json')) {
    try {
      j = text ? JSON.parse(text) : {};
    } catch (e) {
      j = { message: text };
    }
  } else {
    console.error('Non-JSON API response received:', text);
    throw new Error(!r.ok ? `API route returned HTTP ${r.status}. Ensure backend is running.` : 'Invalid JSON response format');
  }

  if (!r.ok) throw new Error(j.message || 'Request failed');
  return j.data !== undefined ? j.data : j;
};

// UI Components
const Badge = ({ value }: { value: string }) => {
  if (!value) return <span className="badge pending">UNKNOWN</span>;
  const valStr = String(value).toUpperCase().replace(/ /g, '_');
  return <span className={`badge ${valStr.toLowerCase()}`}>{valStr.replace(/_/g, ' ')}</span>;
};

const Card = ({ name, value, Icon, colorClass = 'blue' }: { name: string; value: any; Icon: any; colorClass?: string }) => (
  <article>
    <div className={`metric-icon ${colorClass}`}><Icon size={22} /></div>
    <div>
      <p>{name}</p>
      <strong>{value ?? 0}</strong>
    </div>
  </article>
);

const Hero = ({ title, text }: { title: string; text: string }) => (
  <section className="disclaimer">
    <ShieldCheck size={24} style={{ flexShrink: 0, marginTop: 2 }} />
    <div>
      <b>{title}</b>
      <div>{text}</div>
    </div>
  </section>
);

// ────────────────────────────────────────────────────────────────
// DOCUMENT VIEWER & FILE UPLOAD REUSABLE COMPONENTS
// ────────────────────────────────────────────────────────────────

const DocumentViewerModal = ({
  document: doc,
  onClose
}: {
  document: any | null;
  onClose: () => void;
}) => {
  if (!doc) return null;

  const fileName = doc.fileName || doc.file || 'document.pdf';
  const docTitle = doc.docName || doc.title || doc.name || fileName;
  const category = doc.docType || doc.category || doc.type || 'Statutory Compliance Record';
  const uploadDate = doc.uploadedAt || doc.uploadDate || doc.submittedDate || '2026-10-06';
  const status = doc.verificationStatus || doc.status || 'VERIFIED';
  const remarks = doc.remarks || doc.officerRemarks || '';
  const establishmentName = doc.establishmentName || 'Sakthi Textiles Pvt Ltd';

  const isImage = (doc.fileData && doc.fileData.startsWith('data:image')) ||
    (doc.fileType && doc.fileType.includes('image')) ||
    Boolean(fileName.match(/\.(jpg|jpeg|png|webp|svg)$/i));

  const isPdfData = (doc.fileData && (doc.fileData.startsWith('data:application/pdf') || doc.fileData.startsWith('data:application/octet-stream')));

  const handleDownload = () => {
    if (doc.fileData && doc.fileData.startsWith('data:')) {
      const a = window.document.createElement('a');
      a.href = doc.fileData;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
    } else {
      const content = `GOVERNMENT OF TAMIL NADU - DEPARTMENT OF LABOUR AND EMPLOYMENT\n` +
        `OFFICIAL STATUTORY DOCUMENT ARCHIVE RECORD\n` +
        `--------------------------------------------------\n` +
        `Establishment: ${establishmentName}\n` +
        `Document Title: ${docTitle}\n` +
        `File Reference: ${fileName}\n` +
        `Category: ${category}\n` +
        `Uploaded Date: ${uploadDate}\n` +
        `Verification Status: ${status}\n` +
        `Officer Verification Remarks: ${remarks || 'Verified and archived under Tamil Nadu Statutory Compliance rules.'}\n` +
        `--------------------------------------------------\n` +
        `Digital Fingerprint (SHA-256): 9b4a12ec8724d10f8812c3912daef401827419e5\n` +
        `Authenticated via TN Wage Compliance Portal\n`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = fileName.replace(/\.pdf$/i, '.txt');
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="doc-viewer-card">
        {/* Header */}
        <div className="doc-viewer-header">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ background: '#eff6ff', color: '#1e40af', padding: 10, borderRadius: 10, display: 'grid', placeItems: 'center' }}>
              <FileText size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#0f2d59', fontSize: 18 }}>{docTitle}</h3>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                <b>File:</b> {fileName} &bull; <b>Category:</b> {category} &bull; <b>Uploaded:</b> {uploadDate.slice(0, 10)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleDownload} title="Download file to device">
              <Download size={14} style={{ marginRight: 4 }} /> Download File
            </button>
            <button className="close-btn" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="doc-viewer-body">
          {/* Real uploaded Base64 Image */}
          {isImage && doc.fileData ? (
            <div style={{ textAlign: 'center', background: '#0f172a', padding: 24, borderRadius: 10 }}>
              <img
                src={doc.fileData}
                alt={fileName}
                style={{ maxWidth: '100%', maxHeight: '560px', objectFit: 'contain', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
              />
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 12 }}>
                High-Resolution Evidence Capture &bull; {fileName} &bull; Verified
              </div>
            </div>
          ) : isPdfData ? (
            /* Real uploaded Base64 PDF */
            <div style={{ width: '100%', height: '580px', borderRadius: 8, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
              <iframe
                src={doc.fileData}
                title={fileName}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          ) : isImage ? (
            /* Simulated Site Photographic Evidence */
            <div style={{ background: '#0b192c', color: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 6px 20px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 10, marginBottom: 16 }}>
                <div>
                  <b style={{ color: '#60a5fa', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Tamil Nadu Labour Enforcement &bull; Site Observation Evidence
                  </b>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                    GPS: 11.1085° N, 77.3411° E &bull; Erode Industrial Zone &bull; Camera ID: TN-FLD-CAM-08
                  </div>
                </div>
                <Badge value={status} />
              </div>

              {/* Graphic photo frame */}
              <div style={{
                background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                border: '2px solid #334155',
                borderRadius: 8,
                padding: '40px 20px',
                textAlign: 'center',
                minHeight: '260px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  top: 12,
                  left: 14,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: '#fbbf24',
                  background: 'rgba(0,0,0,0.6)',
                  padding: '2px 8px',
                  borderRadius: 4
                }}>
                  REC: {uploadDate.slice(0, 10)} 11:34:02 AM IST
                </div>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1e3a8a', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: '#93c5fd' }}>
                  <Eye size={32} />
                </div>
                <h4 style={{ margin: '0 0 8px', color: '#f8fafc', fontSize: 16 }}>
                  Site Observation Photographic Evidence Docket
                </h4>
                <p style={{ maxWidth: 500, margin: '0 auto', fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  Photographic record captured on site during statutory field inspection of <b>{establishmentName}</b>.
                  Pertains to: <i>{doc.relatedTo || category}</i>.
                </p>
                <div style={{ marginTop: 16, display: 'inline-flex', gap: 12, fontSize: 12, background: 'rgba(255,255,255,0.08)', padding: '6px 16px', borderRadius: 20 }}>
                  <span>Verified Image Hash: <b>SHA256: 4e91...d109</b></span>
                  <span>&bull;</span>
                  <span>Resolution: <b>1920x1080 FHD</b></span>
                </div>
              </div>

              {remarks && (
                <div style={{ marginTop: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: 12, borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
                  <b>Inspector / Officer Remarks:</b> {remarks}
                </div>
              )}
            </div>
          ) : (
            /* Official Tamil Nadu Labour Department Document Sheet Preview */
            <div className="doc-certificate-paper">
              <div className="doc-watermark">GOVERNMENT OF TAMIL NADU</div>

              {/* Banner */}
              <div className="doc-header-banner">
                <div className="doc-seal-badge">TN</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2d59', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  GOVERNMENT OF TAMIL NADU
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 }}>
                  DEPARTMENT OF LABOUR & EMPLOYMENT
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Directorate of Industrial Safety and Health &bull; Statutory Wage Compliance System
                </div>
                <div style={{ marginTop: 12, display: 'inline-block', background: '#0f2d59', color: '#f7e8c4', padding: '4px 18px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
                  {docTitle.toUpperCase()}
                </div>
              </div>

              {/* Metadata strip */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', border: '1px solid #e2e8f0', padding: 14, borderRadius: 8, fontSize: 13, marginBottom: 18, position: 'relative', zIndex: 1 }}>
                <div><b>Establishment Name:</b> {establishmentName}</div>
                <div><b>Registration No:</b> {doc.registrationNumber || 'TN-ERD-2024-00125'}</div>
                <div><b>Document Category:</b> {category}</div>
                <div><b>File Reference:</b> {fileName}</div>
                <div><b>Uploaded Date:</b> {uploadDate.slice(0, 10)}</div>
                <div><b>Verification Status:</b> <Badge value={status} /></div>
                {remarks && (
                  <div style={{ gridColumn: 'span 2', color: '#991b1b', background: '#fee2e2', padding: '6px 12px', borderRadius: 6 }}>
                    <b>Officer Remarks:</b> {remarks}
                  </div>
                )}
              </div>

              {/* Dynamic Body based on doc category */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                {category.toLowerCase().includes('wage') ? (
                  <>
                    <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 14 }}>
                      Statutory Register of Wages (Form-B Excerpt)
                    </h4>
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Worker ID & Name</th>
                          <th>Category</th>
                          <th>Days</th>
                          <th>Basic Wage (₹)</th>
                          <th>DA (₹)</th>
                          <th>OT (₹)</th>
                          <th>Net Disbursed (₹)</th>
                          <th>Payment Mode</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><b>W-101</b> S. Murugan</td>
                          <td>Skilled (Weaving)</td>
                          <td>26</td>
                          <td>₹14,500</td>
                          <td>₹3,200</td>
                          <td>₹1,800</td>
                          <td><b>₹19,500</b></td>
                          <td>Bank Transfer (NEFT)</td>
                        </tr>
                        <tr>
                          <td><b>W-102</b> K. Ramasamy</td>
                          <td>Semi-Skilled</td>
                          <td>25</td>
                          <td>₹12,000</td>
                          <td>₹2,800</td>
                          <td>₹1,200</td>
                          <td><b>₹16,000</b></td>
                          <td>Bank Transfer (NEFT)</td>
                        </tr>
                        <tr>
                          <td><b>W-103</b> P. Selvi</td>
                          <td>Skilled (Spinning)</td>
                          <td>26</td>
                          <td>₹14,500</td>
                          <td>₹3,200</td>
                          <td>₹1,400</td>
                          <td><b>₹19,100</b></td>
                          <td>Bank Transfer (NEFT)</td>
                        </tr>
                        <tr>
                          <td><b>W-104</b> M. Anbarasan</td>
                          <td>Unskilled Helper</td>
                          <td>24</td>
                          <td>₹10,500</td>
                          <td>₹2,400</td>
                          <td>₹800</td>
                          <td><b>₹13,700</b></td>
                          <td>Bank Transfer (NEFT)</td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                ) : category.toLowerCase().includes('attendance') ? (
                  <>
                    <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 14 }}>
                      Statutory Muster Roll & Attendance Register (Form-I)
                    </h4>
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Shift</th>
                          <th>Active Roll Strength</th>
                          <th>Average Daily Attendance</th>
                          <th>Overtime Hours Logged</th>
                          <th>Weekly Rest Observed</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><b>General Shift (08:00 - 17:00)</b></td>
                          <td>140 Workers</td>
                          <td>136 Workers (97.1%)</td>
                          <td>120 Hours Total</td>
                          <td>Verified Compliant</td>
                        </tr>
                        <tr>
                          <td><b>Shift B (17:00 - 01:00)</b></td>
                          <td>110 Workers</td>
                          <td>104 Workers (94.5%)</td>
                          <td>95 Hours Total</td>
                          <td>Verified Compliant</td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                ) : (
                  <>
                    <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 14 }}>
                      Statutory Grant & Official Verification Declaration
                    </h4>
                    <p style={{ fontSize: 13, lineHeight: 1.7, color: '#334155', margin: '8px 0' }}>
                      This certified document constitutes valid statutory record for <b>{establishmentName}</b> filed under the provisions of the Tamil Nadu Shops and Establishments Act, 1947, and the Minimum Wages Act, 1948. The records submitted herein have been processed through the Digital Wage Compliance & Inspection Monitoring System of the Government of Tamil Nadu.
                    </p>
                  </>
                )}
              </div>

              {/* Official Seal Footer */}
              <div className="doc-footer-meta">
                <div>
                  <b>Digitally Certified Document</b><br />
                  Digital Signature: TN-LABOUR-DEPT-OFFICER-VERIFIED<br />
                  Timestamp: {uploadDate.slice(0, 10)} &bull; SHA256: 7e9a4f2b901c84d63251e08fa3729b418e22c95d
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ border: '2px solid #059669', color: '#059669', padding: '4px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, display: 'inline-block' }}>
                    ✓ Authenticated Record
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FileUploadBox = ({
  accept,
  selectedFile,
  onFileSelect,
  onClear,
  label = "Upload Document / File",
  hint = "Click or drag & drop to choose a file (PDF, JPG, PNG up to 25MB)"
}: {
  accept: string;
  selectedFile: { name: string; size?: number; type?: string; dataUrl?: string } | null;
  onFileSelect: (file: File, dataUrl: string) => void;
  onClear: () => void;
  label?: string;
  hint?: string;
}) => {
  const [dragging, setDragging] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      onFileSelect(file, (e.target?.result as string) || '');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#1e293b' }}>
          {label}
        </label>
      )}
      {!selectedFile ? (
        <div
          className={`file-upload-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                processFile(e.target.files[0]);
              }
            }}
            style={{ display: 'none' }}
          />
          <Upload size={28} style={{ color: '#2563eb', margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f2d59' }}>
            Choose a file or drag it here
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            {hint}
          </div>
        </div>
      ) : (
        <div className="selected-file-chip">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileCheck size={20} style={{ color: '#16a34a' }} />
            <div>
              <b style={{ color: '#0f2d59' }}>{selectedFile.name}</b>
              {selectedFile.size ? (
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                  ({Math.round(selectedFile.size / 1024)} KB)
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClear}
            style={{ padding: '4px 8px', fontSize: 12 }}
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────────
// AUTH SCREENS  –  Login + Register
// ────────────────────────────────────────────────────────────────

type AuthRole = 'LABOUR_OFFICER' | 'LABOUR_INSPECTOR' | 'EMPLOYER';

const ROLE_META: { role: AuthRole; label: string; sub: string; icon: string }[] = [
  { role: 'LABOUR_OFFICER', label: 'Labour Department Officer', sub: 'Officer-level oversight access', icon: '🏛️' },
  { role: 'LABOUR_INSPECTOR', label: 'Labour Inspector', sub: 'Field inspection access', icon: '🔍' },
  { role: 'EMPLOYER', label: 'Employer', sub: 'Establishment management access', icon: '🏭' },
];

// ── Login Component ──────────────────────────────────────────────
function Login({ done, onRegister }: { done: (u: UserType) => void; onRegister: (role: AuthRole) => void }) {
  const [selectedRole, setSelectedRole] = useState<AuthRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; role?: string }>({});

  // Restore remembered email
  React.useEffect(() => {
    const saved = localStorage.getItem('tn_remembered_email');
    if (saved) { setEmail(saved); setRemember(true); }
    // If a registered role hint was stored, pre-select it
    const roleHint = sessionStorage.getItem('tn_reg_role') as AuthRole | null;
    if (roleHint) { setSelectedRole(roleHint); sessionStorage.removeItem('tn_reg_role'); }
  }, []);

  function validate() {
    const errs: typeof fieldErrors = {};
    if (!selectedRole) errs.role = 'Please select your role to continue.';
    if (!email.trim()) errs.email = 'Please enter your email address.';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Please enter a valid email address.';
    if (!password) errs.password = 'Please enter your password.';
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError('');
    setLoading(true);
    try {
      const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      // Backend-verified: JWT contains the real role. Inform user if mismatch.
      if (selectedRole && d.user.role !== selectedRole) {
        setLoading(false);
        setError(`Your account is registered as ${d.user.role.replace(/_/g, ' ')}. Please select the correct role.`);
        return;
      }
      if (remember) localStorage.setItem('tn_remembered_email', email.trim());
      else localStorage.removeItem('tn_remembered_email');
      localStorage.setItem('tn_token', d.token);
      done(d.user);
    } catch (x: any) {
      setLoading(false);
      setError(x.message || 'Invalid email or password. Please try again.');
    }
  }

  function quickFill(role: AuthRole) {
    const map: Record<AuthRole, string> = {
      LABOUR_OFFICER: 'officer@example.com',
      LABOUR_INSPECTOR: 'inspector@example.com',
      EMPLOYER: 'employer@example.com',
    };
    setSelectedRole(role);
    setEmail(map[role]);
    setPassword('Demo@123');
    setError('');
    setFieldErrors({});
  }

  return (
    <main className="login">
      {/* ── Left panel ── */}
      <section className="login-hero">
        <div className="seal">TN</div>
        <p className="eyebrow">TAMIL NADU STATE LABOUR DEPARTMENT</p>
        <h1>Wage Compliance<br />Monitoring Portal</h1>
        <p className="login-hero-desc">
          Role-based monitoring, inspection intelligence,<br />
          risk analytics, and enforcement management.
        </p>
        <div className="login-feature-list">
          <div className="login-feature-item"><ShieldCheck size={16} /><span>Secure JWT Authentication</span></div>
          <div className="login-feature-item"><ClipboardCheck size={16} /><span>Role-Verified Access Control</span></div>
          <div className="login-feature-item"><Activity size={16} /><span>Explainable Risk Scoring</span></div>
        </div>
      </section>

      {/* ── Right panel (form card) ── */}
      <section className="login-form-panel">
        <form onSubmit={submit} noValidate className="login-card">
          <div className="login-card-header">
            <p className="eyebrow" style={{ color: '#2563eb' }}>PORTAL ACCESS</p>
            <h2>Sign in to your account</h2>
            <p className="login-card-sub">Select your role and enter your credentials</p>
          </div>

          {/* Role Selection */}
          <div className="role-select-group">
            <label className="field-label">Select Role <span className="required">*</span></label>
            <div className="role-cards">
              {ROLE_META.map(r => (
                <button
                  key={r.role}
                  type="button"
                  className={`role-card ${selectedRole === r.role ? 'selected' : ''}`}
                  onClick={() => { setSelectedRole(r.role); setError(''); setFieldErrors(f => ({ ...f, role: undefined })); }}
                >
                  <span className="role-card-icon">{r.icon}</span>
                  <span className="role-card-label">{r.label}</span>
                </button>
              ))}
            </div>
            {fieldErrors.role && <p className="field-error">{fieldErrors.role}</p>}
          </div>

          {/* Email */}
          <div className="field-group">
            <label className="field-label" htmlFor="login-email">Email Address <span className="required">*</span></label>
            <input
              id="login-email"
              type="email"
              className={`field-input ${fieldErrors.email ? 'input-error' : ''}`}
              placeholder="Enter your registered email"
              value={email}
              onChange={e => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: undefined })); }}
              autoComplete="email"
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
          </div>

          {/* Password */}
          <div className="field-group">
            <label className="field-label" htmlFor="login-password">Password <span className="required">*</span></label>
            <div className="pw-wrap">
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                className={`field-input pw-input ${fieldErrors.password ? 'input-error' : ''}`}
                placeholder="Enter your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })); }}
                autoComplete="current-password"
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1} aria-label="Toggle password visibility">
                {showPw ? <Eye size={17} /> : <Eye size={17} />}
                <span style={{ fontSize: 11 }}>{showPw ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          </div>

          {/* Remember me */}
          <div className="remember-row">
            <label className="remember-label">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              <span>Remember my email</span>
            </label>
          </div>

          {/* Error */}
          {error && <div className="error" role="alert">{error}</div>}

          {/* Submit */}
          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? (
              <><span className="spinner-sm" /> Signing in...</>
            ) : (
              <>Sign In <ArrowRight size={17} /></>
            )}
          </button>

          {/* Register link */}
          <div className="login-register-row">
            <span>New user?</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => onRegister(selectedRole || 'EMPLOYER')}
            >
              Register here
            </button>
          </div>

          {/* Demo credentials */}
          <div className="demo-section">
            <p className="demo-label">Quick fill demo credentials (password: Demo@123)</p>
            <div className="demo-btns">
              {ROLE_META.map(r => (
                <button key={r.role} type="button" className="demo-btn" onClick={() => quickFill(r.role)}>
                  {r.icon} {r.label.split(' ').slice(-1)[0]}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}

// ── Register Component ───────────────────────────────────────────
function Register({ initialRole, onBack }: { initialRole: AuthRole; onBack: (role?: AuthRole) => void }) {
  const [selectedRole, setSelectedRole] = useState<AuthRole>(initialRole);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function setF(k: string, v: string) {
    setForm(prev => ({ ...prev, [k]: v }));
    setFieldErrors(prev => { const n = { ...prev }; delete n[k]; return n; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    const f = form;
    if (!f.name?.trim()) errs.name = 'Full name is required.';
    if (!f.email?.trim()) errs.email = 'Email address is required.';
    else if (!/\S+@\S+\.\S+/.test(f.email)) errs.email = 'Please enter a valid email address.';
    if (!f.password) errs.password = 'Password is required.';
    else if (f.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (!f.confirmPassword) errs.confirmPassword = 'Please confirm your password.';
    else if (f.password !== f.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    if (f.phone && !/^\d{10}$/.test(f.phone.replace(/\s/g, ''))) errs.phone = 'Phone number must be 10 digits.';
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError('');
    setLoading(true);
    try {
      const payload: Record<string, string> = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: selectedRole,                          // unified endpoint needs role
        ...(form.phone ? { phone: form.phone.trim() } : {}),
        ...(form.employeeId ? { employeeId: form.employeeId.trim() } : {}),
        ...(form.inspectorId ? { inspectorId: form.inspectorId.trim() } : {}),
        ...(form.districtId ? { districtId: form.districtId } : {}),
        ...(form.establishmentName ? { establishmentName: form.establishmentName.trim() } : {}),
        ...(form.registrationNumber ? { registrationNumber: form.registrationNumber.trim() } : {}),
      };
      // All roles use the unified endpoint
      await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      setSuccess('Registration successful! Please sign in with your registered credentials.');
      sessionStorage.setItem('tn_reg_role', selectedRole);
    } catch (x: any) {
      setError(x.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const districts = [
    { id: 'd-chennai', name: 'Chennai' },
    { id: 'd-coimbatore', name: 'Coimbatore' },
    { id: 'd-madurai', name: 'Madurai' },
  ];

  const meta = ROLE_META.find(r => r.role === selectedRole)!;

  return (
    <main className="login register-layout">
      {/* Left */}
      <section className="login-hero">
        <div className="seal">TN</div>
        <p className="eyebrow">TAMIL NADU STATE LABOUR DEPARTMENT</p>
        <h1>Create Your<br />Account</h1>
        <p className="login-hero-desc">
          Register as {meta.label} to access the<br />
          Wage Compliance Monitoring Portal.
        </p>
        <div className="login-feature-list">
          {ROLE_META.map(r => (
            <div key={r.role} className={`login-feature-item ${selectedRole === r.role ? 'active' : ''}`}>
              <span>{r.icon}</span><span>{r.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Right */}
      <section className="login-form-panel">
        <form onSubmit={submit} noValidate className="login-card register-card">
          {/* Success state */}
          {success ? (
            <div className="reg-success">
              <div className="reg-success-icon">✓</div>
              <h3>Registration Successful</h3>
              <p>{success}</p>
              <button type="button" className="login-submit-btn" onClick={() => onBack(selectedRole)}>
                Proceed to Sign In <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <>
              <div className="login-card-header">
                <p className="eyebrow" style={{ color: '#2563eb' }}>NEW ACCOUNT</p>
                <h2>Register</h2>
                <p className="login-card-sub">Create your portal account</p>
              </div>

              {/* Role selector */}
              <div className="role-select-group">
                <label className="field-label">Account Type <span className="required">*</span></label>
                <div className="role-cards">
                  {ROLE_META.map(r => (
                    <button
                      key={r.role}
                      type="button"
                      className={`role-card ${selectedRole === r.role ? 'selected' : ''}`}
                      onClick={() => { setSelectedRole(r.role); setError(''); }}
                    >
                      <span className="role-card-icon">{r.icon}</span>
                      <span className="role-card-label">{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Common fields ── */}
              <div className="reg-fields-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="reg-name">Full Name <span className="required">*</span></label>
                  <input id="reg-name" type="text" className={`field-input ${fieldErrors.name ? 'input-error' : ''}`}
                    placeholder="Enter your full name" value={form.name || ''} onChange={e => setF('name', e.target.value)} />
                  {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
                </div>

                {/* Role-specific ID field */}
                {selectedRole === 'LABOUR_OFFICER' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="reg-empid">Employee / Officer ID</label>
                    <input id="reg-empid" type="text" className="field-input"
                      placeholder="e.g. TN-OFF-2024-001" value={form.employeeId || ''} onChange={e => setF('employeeId', e.target.value)} />
                  </div>
                )}
                {selectedRole === 'LABOUR_INSPECTOR' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="reg-inspid">Inspector ID</label>
                    <input id="reg-inspid" type="text" className="field-input"
                      placeholder="e.g. TN-INS-2024-001" value={form.inspectorId || ''} onChange={e => setF('inspectorId', e.target.value)} />
                  </div>
                )}
                {selectedRole === 'EMPLOYER' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="reg-estname">Establishment Name</label>
                    <input id="reg-estname" type="text" className="field-input"
                      placeholder="Name of your establishment" value={form.establishmentName || ''} onChange={e => setF('establishmentName', e.target.value)} />
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label" htmlFor="reg-email">Email Address <span className="required">*</span></label>
                  <input id="reg-email" type="email" className={`field-input ${fieldErrors.email ? 'input-error' : ''}`}
                    placeholder="Enter your official email" value={form.email || ''} onChange={e => setF('email', e.target.value)} autoComplete="email" />
                  {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="reg-phone">Phone Number</label>
                  <input id="reg-phone" type="tel" className={`field-input ${fieldErrors.phone ? 'input-error' : ''}`}
                    placeholder="10-digit mobile number" value={form.phone || ''} onChange={e => setF('phone', e.target.value)} />
                  {fieldErrors.phone && <p className="field-error">{fieldErrors.phone}</p>}
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="reg-district">{selectedRole === 'EMPLOYER' ? 'District' : 'District / Office'}</label>
                  <select id="reg-district" className="field-input"
                    value={form.districtId || ''} onChange={e => setF('districtId', e.target.value)}>
                    <option value="">-- Select District --</option>
                    {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>

                {selectedRole === 'EMPLOYER' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="reg-regno">Registration Number</label>
                    <input id="reg-regno" type="text" className="field-input"
                      placeholder="e.g. TN-1234" value={form.registrationNumber || ''} onChange={e => setF('registrationNumber', e.target.value)} />
                  </div>
                )}

                <div className="field-group">
                  <label className="field-label" htmlFor="reg-pw">Password <span className="required">*</span></label>
                  <div className="pw-wrap">
                    <input id="reg-pw" type={showPw ? 'text' : 'password'}
                      className={`field-input pw-input ${fieldErrors.password ? 'input-error' : ''}`}
                      placeholder="Minimum 8 characters" value={form.password || ''} onChange={e => setF('password', e.target.value)} autoComplete="new-password" />
                    <button type="button" className="pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                      <Eye size={17} /><span style={{ fontSize: 11 }}>{showPw ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="reg-cpw">Confirm Password <span className="required">*</span></label>
                  <div className="pw-wrap">
                    <input id="reg-cpw" type={showCpw ? 'text' : 'password'}
                      className={`field-input pw-input ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                      placeholder="Re-enter password" value={form.confirmPassword || ''} onChange={e => setF('confirmPassword', e.target.value)} autoComplete="new-password" />
                    <button type="button" className="pw-toggle" onClick={() => setShowCpw(v => !v)} tabIndex={-1}>
                      <Eye size={17} /><span style={{ fontSize: 11 }}>{showCpw ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}
                </div>
              </div>

              {error && <div className="error" role="alert">{error}</div>}

              <button type="submit" className="login-submit-btn" disabled={loading}>
                {loading ? <><span className="spinner-sm" /> Creating Account...</> : <>Create Account <ArrowRight size={17} /></>}
              </button>

              <div className="login-register-row">
                <span>Already have an account?</span>
                <button type="button" className="link-btn" onClick={() => onBack()}>Sign in here</button>
              </div>
            </>
          )}
        </form>
      </section>
    </main>
  );
}

// ----------------------------------------------------
// SIDEBAR STRUCTURE & DEFINITION
// ----------------------------------------------------
type NavSubitem = { id: string; label: string };
type NavItem = { id: string; label: string; icon: any; subitems?: NavSubitem[] };

// OFFICER PRIMARY SIDEBAR ITEMS (SIMPLIFIED NAVIGATION - SUBTOPICS ACCESSIBLE WITHIN PAGES)
const OFFICER_NAV: NavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Establishments', label: 'Establishments', icon: Building2 },
  { id: 'Compliance & Risk', label: 'Compliance & Risk', icon: ShieldCheck },
  { id: 'Inspections', label: 'Inspections', icon: ClipboardCheck },
  { id: 'Enforcement', label: 'Enforcement', icon: AlertTriangle },
  { id: 'Wage Assurance', label: 'Wage Assurance', icon: ShieldCheck },
  { id: 'Profile', label: 'Profile', icon: User }
];

const INSPECTOR_NAV: NavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'My Inspections', label: 'My Inspections', icon: ClipboardCheck },
  { id: 'Inspection Reports', label: 'Inspection Reports', icon: FileText },
  { id: 'Profile', label: 'Profile', icon: User }
];

const EMPLOYER_NAV: NavItem[] = [
  { id: 'Dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'Establishment Profile', label: 'Establishment Profile', icon: Building2 },
  { id: 'Wage Compliance', label: 'Wage Compliance', icon: ShieldCheck },
  { id: 'Inspections & Notices', label: 'Inspections & Notices', icon: ClipboardCheck },
  { id: 'Account & Support', label: 'Account & Support', icon: UserCheck }
];

// Sidebar Component
function Sidebar({
  user,
  activeMain,
  activeSub,
  collapsed,
  onToggleCollapse,
  onSelectNav,
  onLogout
}: {
  user: UserType;
  activeMain: string;
  activeSub: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectNav: (mainId: string, subId?: string) => void;
  onLogout: () => void;
}) {
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(activeMain);

  useEffect(() => {
    setOpenSubmenu(activeMain);
  }, [activeMain]);

  const navItems = user.role === 'LABOUR_OFFICER' ? OFFICER_NAV :
    user.role === 'LABOUR_INSPECTOR' ? INSPECTOR_NAV : EMPLOYER_NAV;

  const toggleSubmenu = (mainId: string) => {
    if (openSubmenu === mainId) {
      setOpenSubmenu(null);
    } else {
      setOpenSubmenu(mainId);
    }
  };

  return (
    <aside className={collapsed ? 'collapsed' : ''}>
      <button className="collapse-btn" onClick={onToggleCollapse} title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className="brand">
        <div className="mini">TN</div>
        {!collapsed && (
          <div className="brand-text">
            <b>TN Labour Dept</b>
            <small>{user.role.replace(/_/g, ' ')}</small>
          </div>
        )}
      </div>

      <div className="profile-card">
        <div className="avatar">{user.name[0]}</div>
        {!collapsed && (
          <div className="profile-info">
            <b>{user.name}</b>
            <small>{user.email}</small>
          </div>
        )}
      </div>

      <nav>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isMainActive = activeMain === item.id;
          const hasSub = Boolean(item.subitems && item.subitems.length > 0);
          const isExpanded = openSubmenu === item.id;

          return (
            <div key={item.id} className="nav-group">
              <button
                className={`nav-item ${isMainActive ? 'active' : ''}`}
                onClick={() => {
                  if (hasSub) {
                    toggleSubmenu(item.id);
                    if (item.subitems && item.subitems.length > 0) {
                      onSelectNav(item.id, item.subitems[0].id);
                    }
                  } else {
                    onSelectNav(item.id);
                  }
                }}
                title={collapsed ? item.label : undefined}
              >
                <span className="icon"><Icon size={19} /></span>
                {!collapsed && <span className="label">{item.label}</span>}
                {!collapsed && hasSub && (
                  <span className="arrow">
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </span>
                )}
              </button>

              {!collapsed && hasSub && isExpanded && (
                <div className="submenu">
                  {item.subitems?.map((sub) => {
                    const isSubActive = activeSub === sub.id;
                    return (
                      <button
                        key={sub.id}
                        className={`submenu-item ${isSubActive ? 'active' : ''}`}
                        onClick={() => onSelectNav(item.id, sub.id)}
                      >
                        {sub.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <button className="signout" onClick={onLogout} title={collapsed ? "Sign Out" : undefined}>
        <LogOut size={18} />
        {!collapsed && <span>Sign Out</span>}
      </button>
    </aside>
  );
}

// ----------------------------------------------------
// DUMMY DATA FOR OFFICER PROTOTYPE
// ----------------------------------------------------
const PENDING_REGISTRATIONS_DATA = [
  { id: 'EST-1001', establishmentName: 'Sakthi Textiles Pvt Ltd', type: 'Textile Manufacturing', district: 'Tiruppur', totalEmployees: 280, submittedDate: '2026-08-15', verificationStatus: 'PENDING_VERIFICATION', documentVerificationStatus: 'PENDING', ownerName: 'R. Sakthivel' },
  { id: 'EST-1002', establishmentName: 'Erode Engineering Works', type: 'Engineering & Metallurgy', district: 'Erode', totalEmployees: 140, submittedDate: '2026-08-18', verificationStatus: 'UNDER_REVIEW', documentVerificationStatus: 'APPROVED', ownerName: 'S. Loganathan' },
  { id: 'EST-1003', establishmentName: 'Kongu Construction Services', type: 'Construction & Civil', district: 'Coimbatore', totalEmployees: 320, submittedDate: '2026-08-20', verificationStatus: 'CORRECTION_REQUIRED', documentVerificationStatus: 'REJECTED', ownerName: 'K. Palanisamy' },
  { id: 'EST-1004', establishmentName: 'Salem Food Products Unit', type: 'Food Processing', district: 'Salem', totalEmployees: 95, submittedDate: '2026-08-22', verificationStatus: 'PENDING_VERIFICATION', documentVerificationStatus: 'PENDING', ownerName: 'M. Sampath' },
  { id: 'EST-1005', establishmentName: 'Metro Retail Outlets Ltd', type: 'Retail & Commercial', district: 'Chennai', totalEmployees: 210, submittedDate: '2026-08-25', verificationStatus: 'UNDER_REVIEW', documentVerificationStatus: 'APPROVED', ownerName: 'A. Ramanathan' },
  { id: 'EST-1006', establishmentName: 'Namakkal Poultry Feeds', type: 'Agro Processing', district: 'Namakkal', totalEmployees: 85, submittedDate: '2026-08-28', verificationStatus: 'PENDING_VERIFICATION', documentVerificationStatus: 'PENDING', ownerName: 'P. Sengottaiyan' }
];

const COMPLIANCE_SUBMISSIONS_DATA = [
  { id: 'CS-901', establishmentName: 'Sakthi Textiles Pvt Ltd', submissionType: 'Annual Wage & Attendance Return', submittedDate: '2026-08-30', complianceStatus: 'Compliant', reviewStatus: 'UNDER_REVIEW' },
  { id: 'CS-902', establishmentName: 'Erode Engineering Works', submissionType: 'Q2 Overtime & Wage Filing', submittedDate: '2026-08-28', complianceStatus: 'Correction Required', reviewStatus: 'CORRECTION_REQUIRED' },
  { id: 'CS-903', establishmentName: 'Kongu Construction Services', submissionType: 'Statutory Attendance Register', submittedDate: '2026-08-25', complianceStatus: 'Compliant', reviewStatus: 'ACCEPTED' },
  { id: 'CS-904', establishmentName: 'Salem Food Products Unit', submissionType: 'Minimum Wage Payment Filing', submittedDate: '2026-08-22', complianceStatus: 'Non-Compliant', reviewStatus: 'CORRECTION_REQUIRED' },
  { id: 'CS-905', establishmentName: 'Metro Retail Outlets Ltd', submissionType: 'Equal Remuneration Return', submittedDate: '2026-08-20', complianceStatus: 'Pending Review', reviewStatus: 'SUBMITTED' }
];

const COMPLIANCE_HISTORY_DATA = [
  { id: 'CH-801', establishmentName: 'Sakthi Textiles Pvt Ltd', submissionDate: '2026-07-15', compliancePeriod: 'Q1 2026', complianceStatus: 'ACCEPTED', previousStatus: 'UNDER_REVIEW', reviewDate: '2026-07-20' },
  { id: 'CH-802', establishmentName: 'Erode Engineering Works', submissionDate: '2026-06-10', compliancePeriod: 'Annual 2025-26', complianceStatus: 'CORRECTION_REQUIRED', previousStatus: 'SUBMITTED', reviewDate: '2026-06-18' },
  { id: 'CH-803', establishmentName: 'Kongu Construction Services', submissionDate: '2026-05-05', compliancePeriod: 'Q1 2026', complianceStatus: 'ACCEPTED', previousStatus: 'UNDER_REVIEW', reviewDate: '2026-05-12' },
  { id: 'CH-804', establishmentName: 'Salem Food Products Unit', submissionDate: '2026-04-12', compliancePeriod: 'Annual 2025-26', complianceStatus: 'ACCEPTED', previousStatus: 'SUBMITTED', reviewDate: '2026-04-20' },
  { id: 'CH-805', establishmentName: 'Metro Retail Outlets Ltd', submissionDate: '2026-03-01', compliancePeriod: 'Q4 2025', complianceStatus: 'ACCEPTED', previousStatus: 'UNDER_REVIEW', reviewDate: '2026-03-08' }
];

const INSPECTION_REPORTS_DATA = [
  { id: 'INSP-2026-01', establishmentName: 'Sakthi Textiles Pvt Ltd', inspector: 'R. Kumar', inspectionDate: '2026-08-10', riskLevel: 'HIGH', status: 'SUBMITTED', remarks: 'Wage register anomalies detected during random check.' },
  { id: 'INSP-2026-02', establishmentName: 'Erode Engineering Works', inspector: 'S. Prakash', inspectionDate: '2026-08-12', riskLevel: 'MEDIUM', status: 'UNDER_REVIEW', remarks: 'Overtime hours exceed permissible statutory threshold.' },
  { id: 'INSP-2026-03', establishmentName: 'Kongu Construction Services', inspector: 'M. Anand', inspectionDate: '2026-08-14', riskLevel: 'CRITICAL', status: 'REVIEWED', remarks: 'Contractor wage disbursement records missing for 42 workers.' },
  { id: 'INSP-2026-04', establishmentName: 'Salem Food Products Unit', inspector: 'K. Suresh', inspectionDate: '2026-08-18', riskLevel: 'LOW', status: 'FOLLOW_UP_REQUIRED', remarks: 'Minor discrepancy in statutory display boards.' },
  { id: 'INSP-2026-05', establishmentName: 'Metro Retail Outlets Ltd', inspector: 'R. Kumar', inspectionDate: '2026-08-20', riskLevel: 'MEDIUM', status: 'CLOSED', remarks: 'All minimum wage registers verified and compliant.' }
];

// ENFORCEMENT DATA WITH EXPLICIT TWO-WAY VIOLATION <-> FOLLOW-UP MAPPING
const VIOLATIONS_DATA = [
  { id: 'VIO-1001', establishmentName: 'Sakthi Textiles Pvt Ltd', category: 'Wage Disbursement & Attendance Anomaly', severity: 'HIGH', status: 'OPEN', legalReference: 'Minimum Wages Act 1948 Sec 12', followUpId: 'FU-2001' },
  { id: 'VIO-1002', establishmentName: 'Erode Engineering Works', category: 'Overtime Calculation Threshold Exceeded', severity: 'MEDIUM', status: 'OPEN', legalReference: 'Factories Act 1948 Sec 59', followUpId: null },
  { id: 'VIO-1003', establishmentName: 'Kongu Construction Services', category: 'Contractor Wage Records Missing', severity: 'CRITICAL', status: 'OPEN', legalReference: 'Contract Labour Act 1970 Sec 21', followUpId: 'FU-2003' }
];

const FOLLOWUPS_DATA = [
  { id: 'FU-2001', establishmentName: 'Sakthi Textiles Pvt Ltd', scheduledDate: '2026-09-15', inspector: 'Inspector Meera', status: 'PENDING', verificationResult: 'Awaiting Inspection', violationId: 'VIO-1001' },
  { id: 'FU-2003', establishmentName: 'Kongu Construction Services', scheduledDate: '2026-09-20', inspector: 'Inspector Meera', status: 'IN_PROGRESS', verificationResult: 'Under Verification', violationId: 'VIO-1003' }
];

// ----------------------------------------------------
// OFFICER DASHBOARD (WITH INTEGRATED ANALYTICS & NO ACTION CENTRE)
// ----------------------------------------------------
function OfficerDashboard() {
  const [d, setD] = useState<ApiData>({});
  const [q, setQ] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([api('/dashboard'), api('/risk/priority-queue')])
      .then(([x, y]) => { setD(x); setQ(y); })
      .catch(() => { });
  }, []);

  // Analytics Dummy Charts Data
  const riskDistData = [
    { name: 'LOW', count: 42, color: '#10b981' },
    { name: 'MEDIUM', count: 28, color: '#3b82f6' },
    { name: 'HIGH', count: 14, color: '#f59e0b' },
    { name: 'CRITICAL', count: 6, color: '#ef4444' }
  ];

  const complianceOverviewData = [
    { name: 'Compliant', value: 58 },
    { name: 'Pending Review', value: 18 },
    { name: 'Correction Required', value: 14 },
    { name: 'Non-Compliant', value: 10 }
  ];

  const inspectionOverviewData = [
    { status: 'Pending', count: 12 },
    { status: 'Scheduled', count: 8 },
    { status: 'Completed', count: 34 },
    { status: 'Follow-up', count: 6 }
  ];

  const monthlyTrendsData = [
    { month: 'Jan', compliance: 72, inspections: 18 },
    { month: 'Feb', compliance: 75, inspections: 22 },
    { month: 'Mar', compliance: 78, inspections: 20 },
    { month: 'Apr', compliance: 82, inspections: 25 },
    { month: 'May', compliance: 80, inspections: 28 },
    { month: 'Jun', compliance: 85, inspections: 30 },
    { month: 'Jul', compliance: 88, inspections: 32 },
    { month: 'Aug', compliance: 86, inspections: 35 }
  ];

  return (
    <>
      <Hero
        title="Department Oversight Dashboard & Integrated Analytics"
        text="Real-time wage compliance KPIs, risk distribution, inspection trends, and informational priority queue."
      />

      {/* KPI Cards (No Action Centre) */}
      <div className="metrics">
        <Card name="Total Establishments" value={d.totals?.establishments || 90} Icon={Building2} colorClass="blue" />
        <Card name="Pending Registrations" value={6} Icon={Clock} colorClass="orange" />
        <Card name="Compliance Submissions" value={5} Icon={FileText} colorClass="green" />
        <Card name="High / Critical Risk" value={20} Icon={AlertTriangle} colorClass="red" />
        <Card name="Pending Inspections" value={12} Icon={ClipboardCheck} colorClass="purple" />
        <Card name="Open Violations" value={d.totals?.openViolations || 4} Icon={AlertTriangle} colorClass="red" />
        <Card name="Pending Notices" value={d.totals?.pendingNotices || 3} Icon={FileText} colorClass="orange" />
        <Card name="Corrective Actions" value={5} Icon={CheckCircle2} colorClass="blue" />
      </div>

      {/* Integrated Analytics Charts Grid */}
      <section className="grid" style={{ marginBottom: 24 }}>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h3>Risk Level Distribution</h3>
              <p>Establishment risk classification across Tamil Nadu</p>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskDistData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0f2d59" radius={[6, 6, 0, 0]}>
                  {riskDistData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <h3>Compliance Overview</h3>
              <p>Statutory wage filing status breakdown</p>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={complianceOverviewData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {complianceOverviewData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="grid" style={{ marginBottom: 24 }}>
        <article className="panel">
          <div className="panel-title">
            <div>
              <h3>Monthly Compliance & Inspection Trends</h3>
              <p>8-Month department performance trajectory</p>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendsData}>
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="compliance" stroke="#10b981" strokeWidth={3} name="Compliance Rate (%)" />
                <Line type="monotone" dataKey="inspections" stroke="#3b82f6" strokeWidth={3} name="Inspections Completed" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <h3>Inspection Status Overview</h3>
              <p>Current state of field inspection tasks</p>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={inspectionOverviewData} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="status" type="category" width={80} />
                <Tooltip />
                <Bar dataKey="count" fill="#1e40af" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      {/* Informational Priority Queue (NO Action column or buttons) */}
      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <h3>Inspection Priority Queue (Informational)</h3>
            <p>Establishments ordered by explainable risk score</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Establishment</th>
                <th>Risk Score</th>
                <th>Risk Level</th>
                <th>Priority</th>
                <th>Last Inspection</th>
              </tr>
            </thead>
            <tbody>
              {q.map((row) => (
                <tr key={row.id}>
                  <td><b>{row.establishmentName}</b><br /><small>{row.industry}</small></td>
                  <td><b style={{ fontSize: 15 }}>{row.risk?.riskScore ?? 50}/100</b></td>
                  <td><Badge value={row.risk?.riskLevel || 'MEDIUM'} /></td>
                  <td><Badge value={row.risk?.riskLevel === 'CRITICAL' ? 'HIGH' : row.risk?.riskLevel === 'HIGH' ? 'HIGH' : 'NORMAL'} /></td>
                  <td>{row.lastInspectionDate ? row.lastInspectionDate.slice(0, 10) : 'Overdue (>300 days)'}</td>
                </tr>
              ))}
              {!q.length && <tr><td colSpan={5}>No priority establishments recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* District Compliance Overview (Calculated dynamically) */}
      <section className="panel table-panel" style={{ marginTop: 24 }}>
        <div className="panel-title">
          <div>
            <h3>District Wage Compliance Rates</h3>
            <p>Percentage of registered establishments with LOW or MEDIUM risk profile</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>District</th>
                <th>Compliance Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(d.districtCompliance || []).map((item: any) => (
                <tr key={item.name}>
                  <td><b>{item.name}</b></td>
                  <td><b>{item.rate !== null && item.rate !== undefined ? `${item.rate}%` : 'No data'}</b></td>
                  <td>
                    {item.rate === null || item.rate === undefined ? (
                      <span className="badge gray">No data</span>
                    ) : item.rate >= 70 ? (
                      <span className="badge green">High Compliance</span>
                    ) : (
                      <span className="badge orange">Attention Required</span>
                    )}
                  </td>
                </tr>
              ))}
              {(!d.districtCompliance || d.districtCompliance.length === 0) && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#64748b' }}>No district compliance data available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ----------------------------------------------------
// PUBLIC WORKER FEEDBACK QR CODE COMPONENT
// ----------------------------------------------------
function FeedbackQRCode({ establishmentId, reportingPeriod }: { establishmentId: string; reportingPeriod?: string }) {
  const [qr, setQr] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!establishmentId) return;
    setLoading(true);
    const p = reportingPeriod || new Date().toISOString().slice(0, 7);
    api(`/public/worker-feedback-qr?establishmentId=${encodeURIComponent(establishmentId)}&reportingPeriod=${encodeURIComponent(p)}`)
      .then(setQr)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [establishmentId, reportingPeriod]);

  if (loading) return <div style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>Generating feedback QR code...</div>;
  if (!qr?.qrDataUrl) return null;

  return (
    <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
      <img src={qr.qrDataUrl} alt="Worker Feedback QR Code" style={{ width: 110, height: 110, borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', padding: 4 }} />
      <div>
        <h4 style={{ margin: '0 0 4px', color: '#0f2d59' }}>Worker Feedback QR Code</h4>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>
          Workers can scan this QR code to access the login-free public feedback form for period <b>{qr.reportingPeriod}</b>.
        </p>
        <a href={qr.feedbackUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1e40af', textDecoration: 'underline', fontWeight: 600 }}>
          Open Public Feedback Form &rarr;
        </a>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// ESTABLISHMENTS MODULE (OFFICER WITH DOCUMENT VERIFICATION)
// ----------------------------------------------------
function EstablishmentsModule({
  subTab = 'All Establishments',
  onNavigate
}: {
  subTab?: string;
  onNavigate?: (main: string, sub?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(subTab || 'All Establishments');
  const [data, setData] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedEst, setSelectedEst] = useState<any | null>(null);
  const [docModalEst, setDocModalEst] = useState<any | null>(null);
  const [docRemarks, setDocRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [docModalDocs, setDocModalDocs] = useState<any[]>([]);
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);

  const loadEstablishments = () => {
    if (activeTab === 'Pending Registrations') {
      api('/officer/establishments/pending').then(res => setData(res.items || [])).catch(() => { });
    } else {
      api('/establishments').then(res => setData(res.items || [])).catch(() => { });
    }
  };

  useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  useEffect(() => {
    loadEstablishments();
  }, [activeTab]);

  const openDocReview = (est: any) => {
    setDocModalEst(est);
    setDocRemarks(est.documentVerificationRemarks || '');
    setErr('');
    setPreviewDoc(null);
    setDocModalDocs([]);
    api(`/establishments/${est.id}/documents`).then(res => {
      if (Array.isArray(res) && res.length) {
        setDocModalDocs(res);
      } else {
        setDocModalDocs([
          { id: 'REG-001', docName: 'Form-A Registration Certificate', docType: 'Registration Certificate', fileName: 'tn_form_a_cert.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' },
          { id: 'DOC-002', docName: 'Business Ownership / Incorporation Proof', docType: 'Establishment Proof', fileName: 'business_incorporation.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' },
          { id: 'DOC-003', docName: 'Wage & Employment Roll Register', docType: 'Wage Register', fileName: 'employee_roll_2026.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' },
          { id: 'DOC-004', docName: 'Statutory Premises Layout & Lease Deed', docType: 'Establishment Proof', fileName: 'lease_deed_premises.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' }
        ]);
      }
    }).catch(() => {
      setDocModalDocs([
        { id: 'REG-001', docName: 'Form-A Registration Certificate', docType: 'Registration Certificate', fileName: 'tn_form_a_cert.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' },
        { id: 'DOC-002', docName: 'Business Ownership / Incorporation Proof', docType: 'Establishment Proof', fileName: 'business_incorporation.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' },
        { id: 'DOC-003', docName: 'Wage & Employment Roll Register', docType: 'Wage Register', fileName: 'employee_roll_2026.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' },
        { id: 'DOC-004', docName: 'Statutory Premises Layout & Lease Deed', docType: 'Establishment Proof', fileName: 'lease_deed_premises.pdf', uploadedAt: '2026-08-15', verificationStatus: est.documentVerificationStatus || 'PENDING' }
      ]);
    });
  };

  const handleDocVerification = async (newStatus: 'APPROVED' | 'REJECTED' | 'PENDING') => {
    if (!docModalEst) return;
    if (newStatus === 'REJECTED' && (!docRemarks || !docRemarks.trim())) {
      setErr('Officer remarks / rejection reason is required when rejecting documents.');
      return;
    }

    if (!window.confirm(`Are you sure you want to set Document Verification status to ${newStatus}?`)) {
      return;
    }

    setLoading(true);
    setErr('');
    try {
      await api(`/officer/establishments/${docModalEst.id}/document-verification`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, remarks: docRemarks })
      });

      // Update local states
      docModalEst.documentVerificationStatus = newStatus;
      docModalEst.documentVerificationRemarks = docRemarks;

      // Update matching items in lists
      const listMatch = data.find(x => x.id === docModalEst.id);
      if (listMatch) {
        listMatch.documentVerificationStatus = newStatus;
      }

      setToast(`Document verification status updated to ${newStatus}.`);
      setLoading(false);
      setDocModalEst(null);
      loadEstablishments();
    } catch (e: any) {
      setLoading(false);
      setErr(e.message || 'Failed to update document verification status');
    }
  };

  return (
    <>
      <Hero
        title={`Establishments — ${activeTab}`}
        text="Review registered establishments, verify registration applications, and review statutory establishment documents."
      />
      {toast && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 18 }}>{toast}</p>}

      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'All Establishments' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('All Establishments');
            onNavigate?.('Establishments', 'All Establishments');
          }}
        >
          <Building2 size={16} /> All Establishments
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Pending Registrations' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Pending Registrations');
            onNavigate?.('Establishments', 'Pending Registrations');
          }}
        >
          <Clock size={16} /> Pending Registrations
        </button>
      </div>

      {activeTab === 'Pending Registrations' ? (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Pending Registration Applications</h3>
              <p>Registration & Document Verification Status Monitoring</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Establishment ID</th>
                  <th>Establishment Name</th>
                  <th>Industry Type</th>
                  <th>District</th>
                  <th>Workers</th>
                  <th>Submitted Date</th>
                  <th>Verification Status</th>
                  <th>Document Verification</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.id}</b></td>
                    <td><b>{row.establishmentName}</b></td>
                    <td>{row.industry || row.industryType}</td>
                    <td>{row.districtId || 'Chennai'}</td>
                    <td>{row.totalEmployees || 50}</td>
                    <td>{String(row.createdAt).slice(0, 10)}</td>
                    <td><Badge value={row.verificationStatus} /></td>
                    <td><Badge value={row.documentVerificationStatus || 'PENDING'} /></td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => openDocReview(row)}>Review Documents</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel table-panel">
          <div className="filters-bar">
            <div className="search">
              <Search size={16} />
              <input placeholder="Search establishment name..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Establishment Name</th>
                  <th>Reg. Number</th>
                  <th>Industry</th>
                  <th>Employees</th>
                  <th>Verification Status</th>
                  <th>Document Verification</th>
                  <th>Risk Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .filter(e => e.establishmentName.toLowerCase().includes(search.toLowerCase()))
                  .map((e) => (
                    <tr key={e.id}>
                      <td><b>{e.establishmentName}</b><br /><small>{e.ownerName || 'Representative'}</small></td>
                      <td>{e.registrationNumber}</td>
                      <td>{e.industry || e.industryType}</td>
                      <td>{e.totalEmployees || 50}</td>
                      <td><Badge value={e.verificationStatus} /></td>
                      <td><Badge value={e.documentVerificationStatus || 'PENDING'} /></td>
                      <td>
                        <Badge value={e.risk?.riskLevel || 'LOW'} />
                        <span style={{ marginLeft: 8, fontWeight: 700 }}>{e.risk?.riskScore || 0}/100</span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }} onClick={() => setSelectedEst(e)}>Details</button>
                        <button className="btn btn-primary btn-sm" onClick={() => openDocReview(e)}>Verify Docs</button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Establishment Details Drawer / Modal */}
      {selectedEst && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{selectedEst.establishmentName}</h3>
              <button className="close-btn" onClick={() => setSelectedEst(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
              <div><b>ID / Reg No:</b> {selectedEst.id || selectedEst.registrationNumber}</div>
              <div><b>Industry Type:</b> {selectedEst.type || selectedEst.industry || selectedEst.industryType}</div>
              <div><b>District:</b> {selectedEst.district || 'Chennai'}</div>
              <div><b>Total Employees:</b> {selectedEst.totalEmployees || 50}</div>
              <div><b>Verification Status:</b> <Badge value={selectedEst.verificationStatus || selectedEst.status} /></div>
              <div><b>Document Verification:</b> <Badge value={selectedEst.documentVerificationStatus || 'PENDING'} /></div>
            </div>
            <FeedbackQRCode establishmentId={selectedEst.id || selectedEst.registrationNumber} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setSelectedEst(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT REVIEW & VERIFICATION MODAL */}
      {docModalEst && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h3>Document Verification — {docModalEst.establishmentName}</h3>
              <button className="close-btn" onClick={() => setDocModalEst(null)}><X size={20} /></button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
                <div><b>Establishment Name:</b> {docModalEst.establishmentName}</div>
                <div><b>Registration No:</b> {docModalEst.registrationNumber || docModalEst.id}</div>
                <div><b>District:</b> {docModalEst.district || 'Tiruppur'}</div>
                <div><b>Employer / Authorized Person:</b> {docModalEst.ownerName || 'Authorized Representative'}</div>
                <div><b>Submitted Date:</b> {docModalEst.submittedDate || docModalEst.createdAt?.slice(0, 10) || '2026-08-25'}</div>
                <div><b>Current Document Status:</b> <Badge value={docModalEst.documentVerificationStatus || 'PENDING'} /></div>
              </div>

              {/* Submitted Documents List */}
              <h4 style={{ margin: '8px 0 4px', color: '#0f2d59' }}>Submitted Statutory Registration Documents:</h4>
              <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                {docModalDocs.length > 0 ? (
                  docModalDocs.map((doc, idx) => (
                    <div key={doc.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: idx < docModalDocs.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                      <div>
                        <b style={{ fontSize: 13, color: '#1e293b' }}>{doc.docName || doc.title}</b>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {doc.docType || doc.type} &bull; {doc.fileName} &bull; Uploaded: {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '2026-08-15'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Badge value={doc.verificationStatus || docModalEst.documentVerificationStatus || 'PENDING'} />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setViewerDoc({ ...doc, establishmentName: docModalEst.establishmentName, registrationNumber: docModalEst.registrationNumber })}
                        >
                          <Eye size={13} style={{ marginRight: 4 }} /> View Document
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                    Loading establishment documents...
                  </div>
                )}
              </div>

              {/* Officer Remarks */}
              <label style={{ display: 'block', marginTop: 6 }}>Officer Remarks / Clarification (Required for Rejection):
                <textarea
                  rows={3}
                  value={docRemarks}
                  onChange={e => { setDocRemarks(e.target.value); setErr(''); }}
                  placeholder="Enter verification notes or rejection reasons..."
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>

              {err && <p className="error" style={{ margin: 0 }}>{err}</p>}

              {/* Verification Action Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={loading}
                  onClick={() => handleDocVerification('APPROVED')}
                >
                  {loading ? 'Processing...' : 'Approve Documents'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={loading}
                  onClick={() => handleDocVerification('REJECTED')}
                >
                  {loading ? 'Processing...' : 'Reject Documents'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading}
                  onClick={() => handleDocVerification('PENDING')}
                >
                  Keep Pending
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}

// ----------------------------------------------------
// COMPLIANCE & RISK MODULE (OFFICER)
// ----------------------------------------------------
function ComplianceRiskModule({
  subTab = 'Compliance Submissions',
  onNavigate
}: {
  subTab?: string;
  onNavigate?: (main: string, sub?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(subTab || 'Compliance Submissions');
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);

  useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  return (
    <>
      <Hero
        title={`Compliance & Risk — ${activeTab}`}
        text="Review periodic statutory wage filings, attendance declarations, and historical compliance records."
      />

      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'Compliance Submissions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Compliance Submissions');
            onNavigate?.('Compliance & Risk', 'Compliance Submissions');
          }}
        >
          <FileText size={16} /> Compliance Submissions <span className="tab-badge">{COMPLIANCE_SUBMISSIONS_DATA.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Compliance History' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Compliance History');
            onNavigate?.('Compliance & Risk', 'Compliance History');
          }}
        >
          <Clock size={16} /> Compliance History <span className="tab-badge">{COMPLIANCE_HISTORY_DATA.length}</span>
        </button>
      </div>

      {activeTab === 'Compliance History' ? (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Establishment Compliance History</h3>
              <p>Historical compliance record log</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Establishment</th>
                  <th>Submission Date</th>
                  <th>Compliance Period</th>
                  <th>Status</th>
                  <th>Previous Status</th>
                  <th>Review Date</th>
                </tr>
              </thead>
              <tbody>
                {COMPLIANCE_HISTORY_DATA.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.establishmentName}</b></td>
                    <td>{row.submissionDate}</td>
                    <td>{row.compliancePeriod}</td>
                    <td><Badge value={row.complianceStatus} /></td>
                    <td><Badge value={row.previousStatus} /></td>
                    <td>{row.reviewDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Employer Compliance Submissions</h3>
              <p>Current period statutory wage declarations</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Submission ID</th>
                  <th>Establishment Name</th>
                  <th>Submission Type</th>
                  <th>Submitted Date</th>
                  <th>Compliance Status</th>
                  <th>Review Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {COMPLIANCE_SUBMISSIONS_DATA.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.id}</b></td>
                    <td><b>{row.establishmentName}</b></td>
                    <td>{row.submissionType}</td>
                    <td>{row.submittedDate}</td>
                    <td><Badge value={row.complianceStatus === 'Compliant' ? 'ACCEPTED' : row.complianceStatus === 'Non-Compliant' ? 'CORRECTION_REQUIRED' : 'PENDING'} /></td>
                    <td><Badge value={row.reviewStatus} /></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSubmission(row)}>Review Submission</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedSubmission && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Review Compliance Submission — {selectedSubmission.id}</h3>
              <button className="close-btn" onClick={() => setSelectedSubmission(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><b>Establishment:</b> {selectedSubmission.establishmentName}</div>
              <div><b>Submission Type:</b> {selectedSubmission.submissionType}</div>
              <div><b>Submitted Date:</b> {selectedSubmission.submittedDate}</div>
              <div><b>Status:</b> <Badge value={selectedSubmission.reviewStatus} /></div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setViewerDoc({
                    docName: `Statutory Wage Return (${selectedSubmission.id})`,
                    fileName: `${selectedSubmission.id.toLowerCase()}_wage_return.pdf`,
                    category: selectedSubmission.submissionType || 'Wage Return Form-B',
                    establishmentName: selectedSubmission.establishmentName,
                    uploadedAt: selectedSubmission.submittedDate,
                    remarks: `Submission: ${selectedSubmission.submissionType}, Review Status: ${selectedSubmission.reviewStatus}`
                  })}
                >
                  <Eye size={13} /> View Attached Return Document
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="btn btn-secondary" onClick={() => setSelectedSubmission(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}

// ----------------------------------------------------
// INSPECTIONS MODULE (OFFICER) WITH ASSIGN INSPECTION PAGE
// ----------------------------------------------------
function InspectionsModule({
  subTab = 'Inspection Reports',
  onNavigate
}: {
  subTab?: string;
  onNavigate?: (main: string, sub?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(subTab || 'Inspection Reports');
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);

  // Live inspections and filter states
  const [apiInspections, setApiInspections] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Assign Inspection Form States
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [inspectors, setInspectors] = useState<any[]>([]);
  const [selectedEstId, setSelectedEstId] = useState('');
  const [selectedInspectorId, setSelectedInspectorId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
  const [inspectionType, setInspectionType] = useState('Risk-Based');
  const [instructions, setInstructions] = useState('');
  const [msg, setMsg] = useState('');

  const loadInspections = () => {
    api('/inspections').then(res => {
      if (Array.isArray(res)) setApiInspections(res);
    }).catch(() => { });
  };

  useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  useEffect(() => {
    loadInspections();
    api('/establishments').then(res => setEstablishments(res.items || [])).catch(() => { });
    api('/users/inspectors').then(setInspectors).catch(() => { });
  }, []);

  const selectedEstObj = establishments.find(e => e.id === selectedEstId);

  // Synchronized list combining live inspections from database and fallback demo data
  const reportsList = apiInspections.length > 0
    ? apiInspections.map(i => {
        const est = establishments.find(e => String(e.id) === String(i.establishmentId) || String(e._id) === String(i.establishmentId));
        return {
          ...i,
          id: i.customId || i.id,
          establishmentName: i.establishmentName || est?.establishmentName || 'Sakthi Textiles Pvt Ltd',
          registrationNumber: i.registrationNumber || est?.registrationNumber || 'TN-1001',
          district: i.district || est?.district || 'Erode',
          industry: i.industry || est?.industry || 'Textiles',
          totalEmployees: i.totalEmployees || est?.totalEmployees || 250,
          inspector: i.inspectorName || 'Inspector Meera',
          inspectionDate: i.actualInspectionDate ? String(i.actualInspectionDate).slice(0, 10) : (i.scheduledDate ? String(i.scheduledDate).slice(0, 10) : '2026-10-25'),
          riskLevel: i.riskLevel || i.priority || 'HIGH',
          riskScore: i.riskScore || i.riskScoreAtAssignment || 75,
          status: i.status || 'SCHEDULED',
          remarks: i.inspectorRemarks || i.observations || 'Inspection record',
          checklist: i.checklist || [],
          observations: i.observations || [],
          findings: i.findings || [],
          evidence: i.evidence || []
        };
      })
    : INSPECTION_REPORTS_DATA.map(i => ({
        ...i,
        riskScore: 75,
        totalEmployees: 250,
        registrationNumber: 'TN-1001',
        district: 'Erode',
        checklist: [
          { id: 1, item: 'Minimum Wage Compliance', result: 'PASS', remarks: 'Statutory minimum wages verified.' },
          { id: 2, item: 'Attendance & Overtime Registers', result: i.riskLevel === 'HIGH' ? 'FAIL' : 'PASS', remarks: i.remarks || 'Verified muster rolls.' }
        ],
        observations: [],
        findings: [],
        evidence: [
          { id: 'EVD-901', fileName: 'attendance_register_oct.pdf', fileType: 'application/pdf', uploadDate: i.inspectionDate || '2026-08-10', relatedTo: 'Attendance Records' }
        ]
      }));

  const filteredReports = reportsList.filter(row => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      row.establishmentName?.toLowerCase().includes(q) ||
      row.id?.toLowerCase().includes(q) ||
      row.district?.toLowerCase().includes(q) ||
      row.inspector?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'ALL' ||
      (statusFilter === 'COMPLETED' && (row.status === 'COMPLETED' || row.status === 'SUBMITTED')) ||
      (statusFilter === 'IN_PROGRESS' && row.status === 'IN_PROGRESS') ||
      (statusFilter === 'SCHEDULED' && (row.status === 'SCHEDULED' || row.status === 'ASSIGNED'));
    return matchSearch && matchStatus;
  });

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstId || !selectedInspectorId) return;

    try {
      await api('/inspections', {
        method: 'POST',
        body: JSON.stringify({
          establishmentId: selectedEstId,
          assignedInspectorId: selectedInspectorId,
          scheduledDate,
          inspectionType,
          instructions
        })
      });
      setMsg('Inspection assigned successfully.');
      setSelectedEstId('');
      setSelectedInspectorId('');
      setInstructions('');
      loadInspections();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApproveReport = (report: any) => {
    setMsg(`Inspection report ${report.id} for ${report.establishmentName} officially reviewed and acknowledged by Labour Officer.`);
    setSelectedReport(null);
  };

  return (
    <>
      <Hero
        title={activeTab === 'Assign Inspection' ? 'Assign Field Inspection' : 'Inspections & Reports Registry'}
        text={activeTab === 'Assign Inspection'
          ? 'Authorize and assign targeted field inspections to eligible Labour Inspectors based on statutory risk scores.'
          : 'Review digital inspection reports, checklists, observations, findings, and evidence submitted by field inspectors.'}
      />
      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}

      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'Inspection Reports' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Inspection Reports');
            onNavigate?.('Inspections', 'Inspection Reports');
          }}
        >
          <ClipboardCheck size={16} /> Inspection Reports <span className="tab-badge">{filteredReports.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Assign Inspection' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Assign Inspection');
            onNavigate?.('Inspections', 'Assign Inspection');
          }}
        >
          <Plus size={16} /> Assign Inspection
        </button>
      </div>

      {activeTab === 'Assign Inspection' ? (
        <section className="panel" style={{ maxWidth: 750 }}>
          <form onSubmit={handleAssignSubmit}>
            <label style={{ display: 'block', marginBottom: 16 }}>Establishment
              <select
                value={selectedEstId}
                onChange={e => setSelectedEstId(e.target.value)}
                required
                className="filter-select"
                style={{ width: '100%', marginTop: 6 }}
              >
                <option value="">-- Select Establishment --</option>
                {establishments.map(e => (
                  <option key={e.id} value={e.id}>{e.establishmentName} ({e.registrationNumber})</option>
                ))}
              </select>
            </label>

            {selectedEstObj && (
              <div className="risk-card" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#93c5fd' }}>Establishment Risk Preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>Risk Score</div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>{selectedEstObj.risk?.riskScore || 82} / 100</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>Risk Level</div>
                    <div style={{ marginTop: 4 }}><Badge value={selectedEstObj.risk?.riskLevel || 'CRITICAL'} /></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#cbd5e1' }}>Priority</div>
                    <div style={{ marginTop: 4 }}><Badge value={selectedEstObj.risk?.riskLevel === 'CRITICAL' ? 'HIGH' : 'NORMAL'} /></div>
                  </div>
                </div>
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 16 }}>Inspector
              <select
                value={selectedInspectorId}
                onChange={e => setSelectedInspectorId(e.target.value)}
                required
                className="filter-select"
                style={{ width: '100%', marginTop: 6 }}
              >
                <option value="">-- Select Inspector --</option>
                {inspectors.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.email})</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <label>Inspection Date
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
              <label>Inspection Type
                <select
                  value={inspectionType}
                  onChange={e => setInspectionType(e.target.value)}
                  className="filter-select"
                  style={{ width: '100%', marginTop: 6 }}
                >
                  <option value="Routine">Routine</option>
                  <option value="Risk-Based">Risk-Based</option>
                  <option value="Follow-up">Follow-up</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'block', marginBottom: 20 }}>Instructions / Directives
              <textarea
                rows={4}
                value={instructions}
                onChange={e => setInstructions(e.target.value)}
                placeholder="Specify wage register verification guidelines, attendance check instructions..."
                style={{ width: '100%', marginTop: 6 }}
              />
            </label>

            <button type="submit" className="btn btn-primary">
              <Plus size={18} /> Assign Inspection
            </button>
          </form>
        </section>
      ) : (
        <section className="panel table-panel">
          <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h3>Inspection Reports Registry</h3>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
                Field inspection reports, verified statutory checklists, and evidence uploaded by inspectors
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search" style={{ width: 260 }}>
                <Search size={16} />
                <input
                  placeholder="Search establishment, ID, or district..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ fontSize: 13, padding: '7px 12px' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLETED">Completed / Submitted</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="SCHEDULED">Scheduled / Assigned</option>
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Establishment Name</th>
                  <th>Assigned Inspector</th>
                  <th>Inspection Date</th>
                  <th>Evidence Files</th>
                  <th>Risk Level</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.id}</b></td>
                    <td>
                      <div>
                        <b>{row.establishmentName}</b>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{row.registrationNumber} &bull; {row.district}</div>
                      </div>
                    </td>
                    <td>{row.inspector}</td>
                    <td>{row.inspectionDate}</td>
                    <td>
                      <span className="badge blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Folder size={12} /> {row.evidence?.length || 0} File{(row.evidence?.length || 0) === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td><Badge value={row.riskLevel} /></td>
                    <td><Badge value={row.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setSelectedReport(row)}>
                        View Full Report & Findings
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredReports.length && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>
                      No inspection reports matching the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Inspection Report & Findings Detail Viewer with Live Inspector Uploads & Evidence */}
      {selectedReport && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 850 }}>
            <div className="modal-header">
              <div>
                <span className="badge blue" style={{ marginBottom: 4, display: 'inline-block' }}>{selectedReport.id}</span>
                <h3 style={{ margin: 0, color: '#0f2d59' }}>Inspection Report — {selectedReport.establishmentName}</h3>
              </div>
              <button className="close-btn" onClick={() => setSelectedReport(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Header Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }}>
                <div><b>Establishment:</b> {selectedReport.establishmentName}</div>
                <div><b>Registration:</b> {selectedReport.registrationNumber || 'TN-1001'}</div>
                <div><b>District:</b> {selectedReport.district || 'Erode'}</div>
                <div><b>Inspector:</b> {selectedReport.inspector}</div>
                <div><b>Inspection Date:</b> {selectedReport.inspectionDate}</div>
                <div><b>Workers:</b> {selectedReport.totalEmployees || 250}</div>
                <div><b>Status:</b> <Badge value={selectedReport.status} /></div>
                <div><b>Risk Level:</b> <Badge value={selectedReport.riskLevel} /></div>
              </div>

              {/* Digital Checklist Results from Inspector */}
              <div>
                <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 15 }}>
                  Statutory Digital Checklist & Requirement Verification:
                </h4>
                {selectedReport.checklist && selectedReport.checklist.length > 0 ? (
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', display: 'grid', gap: 10 }}>
                    {selectedReport.checklist.map((c: any, cIdx: number) => {
                      const itemEvidence = (selectedReport.evidence || []).filter((ev: any) =>
                        ev.relatedTo === c.item || (ev.relatedTo && c.item && ev.relatedTo.toLowerCase().includes(c.item.toLowerCase()))
                      );
                      return (
                        <div
                          key={c.id || cIdx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingBottom: cIdx < selectedReport.checklist.length - 1 ? 10 : 0,
                            borderBottom: cIdx < selectedReport.checklist.length - 1 ? '1px solid #e2e8f0' : 'none',
                            gap: 12
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13 }}>{c.item}</div>
                            {c.remarks && (
                              <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                                <b>Inspector Remark:</b> {c.remarks}
                              </div>
                            )}
                            {itemEvidence.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                {itemEvidence.map((ev: any, evIdx: number) => (
                                  <button
                                    key={ev.id || evIdx}
                                    type="button"
                                    className="btn btn-secondary btn-xs"
                                    onClick={() => setViewerDoc({ ...ev, establishmentName: selectedReport.establishmentName })}
                                    style={{ padding: '3px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <FileText size={12} color="#2563eb" /> {ev.fileName} <Eye size={11} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <Badge value={c.result || c.status || 'PASS'} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 13, color: '#64748b' }}>
                    Standard statutory minimum wages and muster roll registers evaluated.
                  </div>
                )}
              </div>

              {/* Site Observations if logged */}
              {selectedReport.observations && (
                Array.isArray(selectedReport.observations) && selectedReport.observations.length > 0 ? (
                  <div>
                    <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 15 }}>Recorded Site Observations:</h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {selectedReport.observations.map((o: any, oIdx: number) => (
                        <div key={o.id || oIdx} style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: 12, borderRadius: 8, fontSize: 13 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <b style={{ color: '#92400e' }}>{o.category || 'WAGES'} &bull; {o.id}</b>
                            <Badge value={o.severity || 'MEDIUM'} />
                          </div>
                          <div style={{ color: '#78350f' }}>{o.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : typeof selectedReport.observations === 'string' && selectedReport.observations.trim() ? (
                  <div>
                    <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 15 }}>Site Observation:</h4>
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: 12, borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                      {selectedReport.observations}
                    </div>
                  </div>
                ) : null
              )}

              {/* Inspector Findings & Recommendations */}
              {Array.isArray(selectedReport.findings) && selectedReport.findings.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 15 }}>Inspector Findings & Recommendations:</h4>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {selectedReport.findings.map((f: any, fIdx: number) => (
                      <div key={f.id || fIdx} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: 12, borderRadius: 8, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <b style={{ color: '#0f2d59' }}>{f.category} &bull; {f.id}</b>
                          <Badge value={f.severity || 'HIGH'} />
                        </div>
                        <div style={{ color: '#334155' }}>{f.description}</div>
                        {f.inspectorRemarks && (
                          <div style={{ marginTop: 4, color: '#1e3a8a', fontSize: 12 }}>
                            <b>Inspector Recommendation:</b> {f.inspectorRemarks}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inspector Overall Remarks */}
              <div>
                <h4 style={{ margin: '0 0 8px', color: '#0f2d59', fontSize: 15 }}>Inspector Report Remarks:</h4>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 14, borderRadius: 8, color: '#1e40af', fontSize: 13 }}>
                  <b>Observation / Summary:</b> {selectedReport.remarks || selectedReport.inspectorRemarks || 'Inspection completed according to statutory schedule.'}
                </div>
              </div>

              {/* Attached Inspection Evidence & Documents Dossier (Live from Inspector) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#0f2d59', fontSize: 15 }}>
                    Attached Inspection Evidence Dossier ({selectedReport.evidence?.length || 0} File{(selectedReport.evidence?.length || 0) === 1 ? '' : 's'}):
                  </h4>
                  <span className="badge blue" style={{ fontSize: 11 }}>
                    <Folder size={12} style={{ marginRight: 4 }} /> Inspector Uploads
                  </span>
                </div>

                {(selectedReport.evidence && selectedReport.evidence.length > 0) ? (
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                    {selectedReport.evidence.map((ev: any, idx: number) => (
                      <div
                        key={ev.id || idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 16px',
                          borderBottom: idx < selectedReport.evidence.length - 1 ? '1px solid #e2e8f0' : 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ background: '#eff6ff', padding: 8, borderRadius: 6, color: '#2563eb' }}>
                            <FileText size={18} />
                          </div>
                          <div>
                            <b style={{ fontSize: 13, color: '#1e293b' }}>{ev.fileName}</b>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                              <b>Scope:</b> {ev.relatedTo || 'General Finding'} &bull; Uploaded: {ev.uploadDate || '2026-10-25'}
                              {ev.fileSize ? ` • ${(ev.fileSize / 1024).toFixed(1)} KB` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setViewerDoc({ ...ev, establishmentName: selectedReport.establishmentName })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Eye size={14} /> View Evidence
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                    <Folder size={28} color="#cbd5e1" style={{ margin: '0 auto 6px', display: 'block' }} />
                    No supporting documents or photographic evidence attached to this inspection report.
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleApproveReport(selectedReport)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <CheckCircle2 size={16} /> Acknowledge & Approve Inspection Report
                </button>
                <button className="btn btn-secondary" onClick={() => setSelectedReport(null)}>
                  Close Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}

// ----------------------------------------------------
// ENFORCEMENT MODULE (WITH TWO-WAY VIOLATIONS <-> FOLLOW-UPS LINKING)
// ----------------------------------------------------
function EnforcementModule({
  subTab = 'Violations',
  onNavigate
}: {
  subTab?: string;
  onNavigate?: (main: string, sub?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(subTab || 'Violations');
  const [selectedFollowUp, setSelectedFollowUp] = useState<any | null>(null);
  const [selectedViolation, setSelectedViolation] = useState<any | null>(null);
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);

  useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  const openFollowUp = (fuId: string) => {
    const fu = FOLLOWUPS_DATA.find(f => f.id === fuId);
    if (fu) setSelectedFollowUp(fu);
  };

  const openViolation = (vioId: string) => {
    const vio = VIOLATIONS_DATA.find(v => v.id === vioId);
    if (vio) setSelectedViolation(vio);
  };

  return (
    <>
      <Hero
        title={`Enforcement Management — ${activeTab}`}
        text="Review inspector findings, manage statutory violations, track show-cause notices, and inspect related follow-up verifications."
      />

      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'Violations' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Violations');
            onNavigate?.('Enforcement', 'Violations');
          }}
        >
          <AlertTriangle size={16} /> Violations <span className="tab-badge">{VIOLATIONS_DATA.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Notices' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Notices');
            onNavigate?.('Enforcement', 'Notices');
          }}
        >
          <FileText size={16} /> Notices <span className="tab-badge">1</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Corrective Actions' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Corrective Actions');
            onNavigate?.('Enforcement', 'Corrective Actions');
          }}
        >
          <CheckCircle2 size={16} /> Corrective Actions <span className="tab-badge">1</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Follow-up' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Follow-up');
            onNavigate?.('Enforcement', 'Follow-up');
          }}
        >
          <ClipboardCheck size={16} /> Follow-up <span className="tab-badge">{FOLLOWUPS_DATA.length}</span>
        </button>
      </div>

      {activeTab === 'Follow-up' ? (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Follow-up Inspection Verification Tasks</h3>
              <p>Re-inspection tracking linked to statutory violations</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Follow-up ID</th>
                  <th>Establishment Name</th>
                  <th>Scheduled Date</th>
                  <th>Assigned Inspector</th>
                  <th>Status</th>
                  <th>Related Violation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {FOLLOWUPS_DATA.map((fu) => (
                  <tr key={fu.id}>
                    <td><b>{fu.id}</b></td>
                    <td><b>{fu.establishmentName}</b></td>
                    <td>{fu.scheduledDate}</td>
                    <td>{fu.inspector}</td>
                    <td><Badge value={fu.status} /></td>
                    <td>
                      <b style={{ color: '#1e40af' }}>{fu.violationId}</b>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openViolation(fu.violationId)}>
                        Related Violation
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'Notices' ? (
        <section className="panel table-panel">
          <div className="panel-title">
            <h3>Issued Statutory Notices</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Notice Number</th>
                  <th>Establishment</th>
                  <th>Issue Date</th>
                  <th>Response Deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>TN/DEMO/2026/014</b></td>
                  <td>Sakthi Textiles Pvt Ltd</td>
                  <td>2026-08-10</td>
                  <td>2026-08-25</td>
                  <td><Badge value="OVERDUE" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : activeTab === 'Corrective Actions' ? (
        <section className="panel table-panel">
          <div className="panel-title">
            <h3>Employer Corrective Action Submissions</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Submission Description</th>
                  <th>Submitted Date</th>
                  <th>Status</th>
                  <th>Proof Document</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Wage arrears disbursed for 18 contract workers with bank proof attached.</td>
                  <td>2026-08-24</td>
                  <td><Badge value="UNDER_REVIEW" /></td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setViewerDoc({
                        docName: 'Corrective Action Proof — Wage Arrears Disbursement',
                        fileName: 'bank_payment_disbursement_proof.pdf',
                        category: 'Wage Arrears Disbursement Proof',
                        establishmentName: 'Sakthi Textiles Pvt Ltd',
                        uploadedAt: '2026-08-24',
                        verificationStatus: 'UNDER_REVIEW',
                        remarks: 'Bank NEFT confirmation slip for 18 contract employees.'
                      })}
                    >
                      <Eye size={13} style={{ marginRight: 4 }} /> View Proof
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* VIOLATIONS TAB WITH TWO-WAY FOLLOW-UP LINKING */
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Confirmed Statutory Violations</h3>
              <p>Confirmed findings linked to follow-up verification tasks</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Violation ID</th>
                  <th>Establishment Name</th>
                  <th>Violation Category</th>
                  <th>Severity</th>
                  <th>Legal Reference</th>
                  <th>Status</th>
                  <th>Related Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {VIOLATIONS_DATA.map((v) => (
                  <tr key={v.id}>
                    <td><b>{v.id}</b></td>
                    <td><b>{v.establishmentName}</b></td>
                    <td>{v.category}</td>
                    <td><Badge value={v.severity} /></td>
                    <td><small>{v.legalReference}</small></td>
                    <td><Badge value={v.status} /></td>
                    <td>
                      {v.followUpId ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => openFollowUp(v.followUpId)}>
                          View Follow-up ({v.followUpId})
                        </button>
                      ) : (
                        <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>No Follow-up Scheduled</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Violation Detail Modal */}
      {selectedViolation && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Violation Details — {selectedViolation.id}</h3>
              <button className="close-btn" onClick={() => setSelectedViolation(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
              <div><b>Violation ID:</b> {selectedViolation.id}</div>
              <div><b>Establishment:</b> {selectedViolation.establishmentName}</div>
              <div><b>Category:</b> {selectedViolation.category}</div>
              <div><b>Severity:</b> <Badge value={selectedViolation.severity} /></div>
              <div><b>Legal Reference:</b> {selectedViolation.legalReference}</div>
              <div><b>Status:</b> <Badge value={selectedViolation.status} /></div>
              {selectedViolation.followUpId && (
                <div><b>Linked Follow-up ID:</b> {selectedViolation.followUpId}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              {selectedViolation.followUpId && (
                <button className="btn btn-primary" onClick={() => { const fId = selectedViolation.followUpId; setSelectedViolation(null); openFollowUp(fId); }}>
                  View Related Follow-up
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setSelectedViolation(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Follow-up Detail Modal */}
      {selectedFollowUp && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Follow-up Details — {selectedFollowUp.id}</h3>
              <button className="close-btn" onClick={() => setSelectedFollowUp(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
              <div><b>Follow-up ID:</b> {selectedFollowUp.id}</div>
              <div><b>Establishment:</b> {selectedFollowUp.establishmentName}</div>
              <div><b>Scheduled Date:</b> {selectedFollowUp.scheduledDate}</div>
              <div><b>Assigned Inspector:</b> {selectedFollowUp.inspector}</div>
              <div><b>Status:</b> <Badge value={selectedFollowUp.status} /></div>
              <div><b>Related Violation ID:</b> {selectedFollowUp.violationId}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-primary" onClick={() => { const vId = selectedFollowUp.violationId; setSelectedFollowUp(null); openViolation(vId); }}>
                View Related Violation ({selectedFollowUp.violationId})
              </button>
              <button className="btn btn-secondary" onClick={() => setSelectedFollowUp(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}

// ----------------------------------------------------
// INSPECTOR MODULES (UNTOUCHED)
// ----------------------------------------------------
function InspectorDashboard({ onNavigate }: { onNavigate: (main: string, sub: string) => void }) {
  const [d, setD] = useState<ApiData>({});

  useEffect(() => {
    api('/dashboard/inspector').then(setD).catch(() => { });
  }, []);

  const liveAssigned = Array.isArray(d.assigned) ? d.assigned : [];
  const assignedList = liveAssigned.length > 0
    ? [...liveAssigned.filter((a: any) => a.status !== 'COMPLETED'), ...DUMMY_ASSIGNED_INSPECTIONS.filter(di => !liveAssigned.some((a: any) => a.id === di.id))]
    : DUMMY_ASSIGNED_INSPECTIONS;

  const followUpList = (liveAssigned.filter((i: any) => i.followUpFor || i.inspectionType === 'Follow-up').length > 0)
    ? [...liveAssigned.filter((i: any) => i.followUpFor || i.inspectionType === 'Follow-up'), ...DUMMY_FOLLOWUP_INSPECTIONS.filter(di => !liveAssigned.some((a: any) => a.id === di.id))]
    : DUMMY_FOLLOWUP_INSPECTIONS;

  const submittedList = (liveAssigned.filter((i: any) => i.status === 'COMPLETED').length > 0)
    ? [...liveAssigned.filter((i: any) => i.status === 'COMPLETED'), ...DUMMY_SUBMITTED_REPORTS.filter(di => !liveAssigned.some((a: any) => a.id === di.id))]
    : DUMMY_SUBMITTED_REPORTS;

  const totalAssigned = Math.max(d.totals?.assigned || 0, assignedList.length);
  const totalUpcoming = Math.max(d.totals?.upcoming || 0, DUMMY_UPCOMING_INSPECTIONS.length);
  const totalInProgress = Math.max(d.totals?.inProgress || 0, assignedList.filter((i: any) => i.status === 'IN_PROGRESS').length + DUMMY_DRAFT_REPORTS.length);
  const totalCompleted = Math.max(d.totals?.completed || 0, submittedList.length);
  const totalFollowUps = Math.max(d.totals?.followUps || 0, followUpList.length);
  const totalHistory = totalCompleted + DUMMY_INSPECTION_HISTORY.length;

  return (
    <>
      <Hero
        title="Labour Inspector Field Workspace"
        text="Digital inspection management, statutory wage checklists, site observations, evidence uploads, and follow-up verification."
      />

      {/* 6 KPI Cards for Inspector */}
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('My Inspections', 'Assigned')}>
          <Card name="Assigned Inspections" value={totalAssigned} Icon={ClipboardCheck} colorClass="blue" />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('My Inspections', 'Upcoming')}>
          <Card name="Upcoming Inspections" value={totalUpcoming} Icon={Clock} colorClass="purple" />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('My Inspections', 'Assigned')}>
          <Card name="In Progress" value={totalInProgress} Icon={Activity} colorClass="orange" />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('Inspection Reports', 'Submitted Reports')}>
          <Card name="Submitted Reports" value={totalCompleted} Icon={FileText} colorClass="green" />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('My Inspections', 'Follow-up')}>
          <Card name="Follow-ups Required" value={totalFollowUps} Icon={AlertTriangle} colorClass="red" />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('Inspection Reports', 'Inspection History')}>
          <Card name="Completed History" value={totalHistory} Icon={ShieldCheck} colorClass="teal" />
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 24 }}>
        {/* Assigned Field Inspections Table */}
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Active Assigned Field Inspections</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Inspections currently assigned to you for site execution.</p>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('My Inspections', 'Assigned')}>View All Assigned</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Establishment</th>
                  <th>District</th>
                  <th>Scheduled Date</th>
                  <th>Risk Level</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(assignedList || []).map((row: any) => (
                  <tr key={row.id}>
                    <td><b>{row.id}</b></td>
                    <td><b>{row.establishmentName}</b><br /><small>{row.industry || 'Manufacturing'}</small></td>
                    <td>{row.district || 'Chennai'}</td>
                    <td>{row.scheduledDate || '2026-10-12'}</td>
                    <td><Badge value={row.riskLevel || 'HIGH'} /></td>
                    <td><Badge value={row.status || 'ASSIGNED'} /></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('My Inspections', 'Assigned')}>
                        {row.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Follow-up Tasks Table */}
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Follow-up Verification Tasks</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Re-inspections assigned to verify employer violation corrections.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('My Inspections', 'Follow-up')}>View Follow-ups</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Follow-up ID</th>
                  <th>Establishment</th>
                  <th>Related Violation</th>
                  <th>Scheduled Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {followUpList.map((fu: any) => (
                  <tr key={fu.id}>
                    <td><b>{fu.id}</b></td>
                    <td><b>{fu.establishmentName}</b><br /><small>{fu.district || 'Erode'}</small></td>
                    <td><Badge value={fu.relatedViolation || fu.followUpFor || 'VIO-1025'} /></td>
                    <td>{fu.scheduledDate || '2026-10-18'}</td>
                    <td><Badge value={fu.status || 'ASSIGNED'} /></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('My Inspections', 'Follow-up')}>
                        Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Recent Submitted Reports Table */}
      <section className="panel table-panel">
        <div className="panel-title">
          <div>
            <h3>Recent Submitted Inspection Reports</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Reports submitted for Labour Officer review and violation confirmation.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('Inspection Reports', 'Submitted Reports')}>View Submitted Reports</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Establishment Name</th>
                <th>District</th>
                <th>Inspection Date</th>
                <th>Risk Level</th>
                <th>Submission Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {submittedList.map((rpt: any) => (
                <tr key={rpt.id}>
                  <td><b>{rpt.id}</b></td>
                  <td><b>{rpt.establishmentName}</b></td>
                  <td>{rpt.district || 'Chennai'}</td>
                  <td>{rpt.inspectionDate || '2026-10-02'}</td>
                  <td><Badge value={rpt.riskLevel || 'MEDIUM'} /></td>
                  <td>{rpt.submittedDate || rpt.reportSubmittedAt?.slice(0, 10) || '2026-10-03'}</td>
                  <td><Badge value={rpt.status || 'SUBMITTED'} /></td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('Inspection Reports', 'Submitted Reports')}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function InspectorReportsModule({
  mainSection = 'My Inspections',
  subTab,
  onNavigate
}: {
  mainSection?: 'My Inspections' | 'Inspection Reports';
  subTab?: string;
  onNavigate?: (main: string, sub?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>(
    subTab || (mainSection === 'Inspection Reports' ? 'Draft Reports' : 'Assigned')
  );
  const [apiInspections, setApiInspections] = useState<any[]>([]);
  const [selectedInsp, setSelectedInsp] = useState<any | null>(null);
  const [activeFormTab, setActiveFormTab] = useState('Checklist');
  const [checklist, setChecklist] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [inspectorRemarks, setInspectorRemarks] = useState('');
  const [verificationResult, setVerificationResult] = useState<'CORRECTED' | 'PARTIALLY_CORRECTED' | 'NOT_CORRECTED'>('CORRECTED');
  const [verificationRemarks, setVerificationRemarks] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [evidenceRelatedTo, setEvidenceRelatedTo] = useState('Attendance Records');
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);

  const load = () => {
    api('/inspections').then(res => {
      setApiInspections(Array.isArray(res) ? res : []);
    }).catch(() => { });
  };

  useEffect(() => {
    load();
  }, [subTab, mainSection]);

  useEffect(() => {
    if (subTab) {
      setActiveTab(subTab);
    } else {
      setActiveTab(mainSection === 'Inspection Reports' ? 'Draft Reports' : 'Assigned');
    }
  }, [subTab, mainSection]);

  // Distinct datasets for each subTab (from API merged with rich dummy data fallback)
  const liveList = Array.isArray(apiInspections) ? apiInspections : [];

  const assignedList = liveList.filter(a => a.status !== 'COMPLETED' && !a.followUpFor).length > 0
    ? [...liveList.filter(a => a.status !== 'COMPLETED' && !a.followUpFor), ...DUMMY_ASSIGNED_INSPECTIONS.filter(di => !liveList.some(a => a.id === di.id))]
    : DUMMY_ASSIGNED_INSPECTIONS;

  const upcomingList = liveList.filter(a => a.status === 'ASSIGNED' || a.status === 'SCHEDULED').length > 0
    ? [...liveList.filter(a => a.status === 'ASSIGNED' || a.status === 'SCHEDULED'), ...DUMMY_UPCOMING_INSPECTIONS.filter(di => !liveList.some(a => a.id === di.id))]
    : DUMMY_UPCOMING_INSPECTIONS;

  const followupList = liveList.filter(a => Boolean(a.followUpFor) || a.inspectionType === 'Follow-up').length > 0
    ? [...liveList.filter(a => Boolean(a.followUpFor) || a.inspectionType === 'Follow-up'), ...DUMMY_FOLLOWUP_INSPECTIONS.filter(di => !liveList.some(a => a.id === di.id))]
    : DUMMY_FOLLOWUP_INSPECTIONS;

  const draftList = liveList.filter(a => a.status === 'IN_PROGRESS').length > 0
    ? [...liveList.filter(a => a.status === 'IN_PROGRESS'), ...DUMMY_DRAFT_REPORTS.filter(di => !liveList.some(a => a.id === di.id))]
    : DUMMY_DRAFT_REPORTS;

  const submittedList = liveList.filter(a => a.status === 'COMPLETED').length > 0
    ? [...liveList.filter(a => a.status === 'COMPLETED'), ...DUMMY_SUBMITTED_REPORTS.filter(di => !liveList.some(a => a.id === di.id))]
    : DUMMY_SUBMITTED_REPORTS;

  const historyList = liveList.filter(a => a.status === 'COMPLETED').length > 0
    ? [...liveList.filter(a => a.status === 'COMPLETED'), ...DUMMY_INSPECTION_HISTORY.filter(di => !liveList.some(a => a.id === di.id))]
    : DUMMY_INSPECTION_HISTORY;

  const openInspection = (i: any) => {
    setSelectedInsp(i);
    setChecklist(i.checklist || []);
    setObservations(i.observations || []);
    setFindings(i.findings || []);
    setEvidence(i.evidence || []);
    setInspectorRemarks(i.inspectorRemarks || '');
    setVerificationResult(i.verificationResult || 'CORRECTED');
    setVerificationRemarks(i.verificationObservation || '');
    setActiveFormTab('Checklist');
  };

  const handleStart = async () => {
    try {
      await api('/inspections/' + selectedInsp.id + '/start', { method: 'PATCH' }).catch(() => { });
      const updated = { ...selectedInsp, status: 'IN_PROGRESS' };
      setSelectedInsp(updated);
      setToast('Inspection started. Digital checklist & observation workspace unlocked.');
      load();
    } catch (err: any) { alert(err.message); }
  };

  const saveDraft = async (dataOverride?: any) => {
    try {
      const payload = dataOverride || { checklist, observations, findings, evidence, inspectorRemarks };
      await api('/inspections/' + selectedInsp.id + '/draft', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }).catch(() => { });
      const updated = { ...selectedInsp, ...payload, status: 'IN_PROGRESS' };
      setSelectedInsp(updated);
      setToast('Draft inspection report saved successfully.');
      load();
    } catch (err: any) { alert(err.message); }
  };

  const handleSubmitReport = async () => {
    if (!window.confirm('Submit Inspection Report to Labour Department Officer? Once submitted, the report cannot be modified.')) return;
    try {
      await api('/inspections/' + selectedInsp.id + '/report', {
        method: 'PATCH',
        body: JSON.stringify({ checklist, observations, findings, inspectorRemarks })
      }).catch(() => { });
      setToast(`Inspection report for ${selectedInsp.establishmentName} submitted successfully to Labour Officer.`);
      setSelectedInsp(null);
      load();
    } catch (err: any) { alert(err.message); }
  };

  const handleVerifySubmit = async () => {
    if (!window.confirm(`Submit follow-up verification result: ${verificationResult}?`)) return;
    try {
      await api('/violations/' + (selectedInsp.followUpFor || selectedInsp.relatedViolation || 'VIO-1025') + '/verification', {
        method: 'PATCH',
        body: JSON.stringify({ result: verificationResult })
      }).catch(() => { });
      setToast(`Follow-up verification result (${verificationResult}) submitted to Labour Officer for final review.`);
      setSelectedInsp(null);
      load();
    } catch (err: any) { alert(err.message); }
  };

  const handleFileUpload = async (e: any, relatedItemName?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Only PDF, JPG, and PNG evidence files are supported.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('File size must not exceed 25MB.');
      return;
    }
    const category = relatedItemName || evidenceRelatedTo || 'General Finding';
    const reader = new FileReader();
    reader.onload = async (evEvent) => {
      const dataUrl = (evEvent.target?.result as string) || '';
      try {
        const payload = {
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          fileSize: file.size,
          fileData: dataUrl,
          relatedTo: category
        };
        const res = await api('/inspections/' + selectedInsp.id + '/evidence', {
          method: 'POST',
          body: JSON.stringify(payload)
        }).catch(() => ({
          id: 'EVD-' + Date.now(),
          fileName: file.name,
          fileType: file.type || 'PDF',
          fileData: dataUrl,
          fileSize: file.size,
          uploadDate: new Date().toISOString().slice(0, 10),
          relatedTo: category
        }));
        const newEv = [...evidence, res];
        setEvidence(newEv);
        saveDraft({ evidence: newEv });
        setToast(`Evidence "${file.name}" uploaded successfully for "${category}".`);
      } catch (err: any) { alert(err.message); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeleteEvidence = async (evId: string) => {
    if (!window.confirm('Are you sure you want to remove this evidence file from the dossier?')) return;
    const newEv = evidence.filter(ev => ev.id !== evId);
    setEvidence(newEv);
    saveDraft({ evidence: newEv });
    setToast('Evidence file removed from inspection dossier.');
  };

  if (selectedInsp) {
    const isFollowUp = !!selectedInsp.followUpFor || selectedInsp.inspectionType === 'Follow-up';
    const isReadOnly = selectedInsp.status === 'SUBMITTED' || selectedInsp.status === 'COMPLETED';

    return (
      <>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelectedInsp(null)}>
            ← Back to {mainSection}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {selectedInsp.status === 'IN_PROGRESS' && !isFollowUp && (
              <button className="btn btn-secondary btn-sm" onClick={() => saveDraft()}>Save Draft</button>
            )}
            {selectedInsp.status === 'IN_PROGRESS' && !isFollowUp && (
              <button className="btn btn-primary btn-sm" onClick={handleSubmitReport}>Submit Report to Officer</button>
            )}
          </div>
        </div>

        {toast && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 18 }}>{toast}</p>}

        {/* Detailed Inspection Header Card */}
        <section className="panel" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span className="badge blue" style={{ marginBottom: 6, display: 'inline-block' }}>{selectedInsp.id}</span>
              <h2 style={{ margin: '4px 0 6px', color: '#0f2d59', fontSize: 22 }}>{selectedInsp.establishmentName}</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                <b>Reg No:</b> {selectedInsp.registrationNumber || 'TN-ERD-2024-00125'} | <b>District:</b> {selectedInsp.district || 'Erode'} | <b>Industry:</b> {selectedInsp.industry || 'Manufacturing'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Risk Score</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: (selectedInsp.riskScore || 70) > 75 ? '#dc2626' : '#2563eb' }}>
                  {selectedInsp.riskScore || 75}/100
                </span>
              </div>
              <Badge value={selectedInsp.riskLevel || 'HIGH'} />
              <Badge value={selectedInsp.status} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 18, background: '#f8fafc', padding: 16, borderRadius: 8, fontSize: 13 }}>
            <div><b>Workers Covered:</b> {selectedInsp.totalEmployees || 250}</div>
            <div><b>Employer Representative:</b> {selectedInsp.ownerName || 'R. Sakthivel'}</div>
            <div><b>Inspection Type:</b> {selectedInsp.inspectionType || 'Risk-Based'}</div>
            <div><b>Priority:</b> <Badge value={selectedInsp.priority || 'HIGH'} /></div>
            <div><b>Scheduled Date:</b> {selectedInsp.scheduledDate || selectedInsp.inspectionDate}</div>
            <div><b>Assigned Inspector:</b> {INSPECTOR_PROFILE_DATA.name} ({INSPECTOR_PROFILE_DATA.employeeId})</div>
          </div>

          {selectedInsp.instructions && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: '#eff6ff', borderLeft: '4px solid #3b82f6', borderRadius: 4, fontSize: 13, color: '#1e40af' }}>
              <b>Officer Instructions:</b> {selectedInsp.instructions}
            </div>
          )}

          {/* Establishment Wage & History Briefing */}
          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>
                Previous Inspection History
              </span>
              <p style={{ margin: '4px 0 0', color: '#1e293b', lineHeight: 1.45 }}>
                {selectedInsp.previousInspectionSummary || 'Prior inspection showed minor overtime recording delay.'}
              </p>
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>
                Statutory Wage Return Status
              </span>
              <p style={{ margin: '4px 0 0', color: '#1e293b', lineHeight: 1.45 }}>
                {selectedInsp.complianceSummary || 'Form B wage register maintained. Q2 returns filed.'}
              </p>
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }}>
                Applicable Wage Schedule
              </span>
              <p style={{ margin: '4px 0 0', color: '#1e293b', lineHeight: 1.45 }}>
                {selectedInsp.wageInfoSummary || 'Statutory minimum wage rate: ₹520/day; OT: double rate.'}
              </p>
            </div>
          </div>

          {/* Legal disclaimer banner regarding Inspector authority */}
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: 4, fontSize: 12, color: '#92400e' }}>
            <b>Statutory Notice:</b> Inspector findings represent field observations. Final confirmation of violations, issuing notices, and approving corrective actions rest strictly with the Labour Department Officer.
          </div>
        </section>

        {/* If Inspection is ASSIGNED / SCHEDULED, display Start Action */}
        {['ASSIGNED', 'SCHEDULED'].includes(selectedInsp.status) && !isFollowUp && (
          <section className="panel" style={{ textAlign: 'center', padding: 36, marginBottom: 20 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 8 }}>Ready to Conduct Site Inspection?</h3>
            <p style={{ color: '#64748b', maxWidth: 540, margin: '0 auto 20px', fontSize: 14 }}>
              Clicking "Start Field Inspection" unlocks the digital statutory wage checklist, observation logging, evidence attachment, and report submission workspace.
            </p>
            <button className="btn btn-primary btn-lg" onClick={handleStart}>
              <ClipboardCheck size={18} style={{ marginRight: 8 }} /> Start Field Inspection
            </button>
          </section>
        )}

        {/* Follow-up Verification Specific View */}
        {isFollowUp && (
          <section className="panel" style={{ marginBottom: 20 }}>
            <div className="panel-title">
              <h3>Follow-up Inspection Verification</h3>
            </div>
            <div style={{ display: 'grid', gap: 16, background: '#f8fafc', padding: 18, borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
              <div><b>Related Statutory Violation:</b> <Badge value={selectedInsp.relatedViolation || selectedInsp.followUpFor || 'VIO-1025'} /></div>
              <div><b>Required Corrective Action:</b> {selectedInsp.requiredAction || 'Maintain complete attendance records and update statutory registers.'}</div>
              <div><b>Employer Submitted Proof:</b> <span style={{ color: '#2563eb', fontWeight: 600 }}>{selectedInsp.employerProof || 'attendance_records_sep_oct.pdf'}</span></div>
            </div>

            <div style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
              <label style={{ fontWeight: 600, fontSize: 14 }}>
                Inspector Verification Result *
                <select className="filter-select" value={verificationResult} onChange={(e: any) => setVerificationResult(e.target.value)} style={{ width: '100%', marginTop: 8 }} disabled={isReadOnly}>
                  <option value="CORRECTED">CORRECTED — Violation has been fully rectified by employer</option>
                  <option value="PARTIALLY_CORRECTED">PARTIALLY_CORRECTED — Partial compliance verified; further action needed</option>
                  <option value="NOT_CORRECTED">NOT_CORRECTED — Violation remains unrectified upon site inspection</option>
                </select>
              </label>

              <label style={{ fontWeight: 600, fontSize: 14 }}>
                Inspector Verification Remarks & Site Observations *
                <textarea rows={4} className="input" value={verificationRemarks} onChange={e => setVerificationRemarks(e.target.value)} placeholder="Record exact site findings regarding employer's corrective proof..." style={{ width: '100%', marginTop: 8 }} disabled={isReadOnly} />
              </label>

              {!isReadOnly && (
                <div>
                  <button className="btn btn-primary" onClick={handleVerifySubmit}>
                    Submit Verification Result
                  </button>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                    Result will be sent to the Labour Department Officer for final violation closure or notice issuance decision.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Regular Inspection Workspace */}
        {!isFollowUp && (selectedInsp.status === 'IN_PROGRESS' || selectedInsp.status === 'COMPLETED' || selectedInsp.status === 'SUBMITTED' || selectedInsp.status === 'DRAFT') && (
          <section className="panel">
            {/* Enhanced Inspection Workspace Form Tabs (Overview removed) */}
            <div className="tabs" style={{ marginBottom: 22 }}>
              {[
                { id: 'Checklist', label: 'Checklist & Evidence Folder', icon: ClipboardCheck, count: checklist.length },
                { id: 'Observations', label: 'Site Observations', icon: AlertTriangle, count: observations.length },
                { id: 'Findings', label: 'Findings & Recommendations', icon: FileText, count: findings.length },
                { id: 'Submit Report', label: 'Submit Official Report', icon: Send, count: null }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeFormTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`tab ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveFormTab(tab.id)}
                  >
                    <span className="tab-icon"><Icon size={16} /></span>
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span className="tab-count">{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* TAB 2: CHECKLIST WITH EMBEDDED EVIDENCE FOLDER & UPLOAD */}
            {activeFormTab === 'Checklist' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#0f2d59' }}>Statutory Labour & Wage Compliance Checklist & Evidence</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                      Evaluate statutory compliance and attach supporting photographic or documentary evidence directly to requirements (for PASS or FAIL).
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="badge blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 12 }}>
                      <Folder size={14} /> Evidence Dossier ({evidence.length} file{evidence.length === 1 ? '' : 's'})
                    </span>
                    {!isReadOnly && (
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        const newC = [...checklist, { id: Date.now(), item: 'New Statutory Requirement', result: 'PASS', remarks: '' }];
                        setChecklist(newC);
                        saveDraft({ checklist: newC });
                      }}>
                        <Plus size={14} /> Add Item
                      </button>
                    )}
                  </div>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '22%' }}>Compliance Item</th>
                        <th style={{ width: '16%' }}>Result Status</th>
                        <th style={{ width: '28%' }}>Inspector Remarks</th>
                        <th style={{ width: '34%' }}>Evidence Folder & Upload</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checklist.map((c, idx) => {
                        const itemEvs = evidence.filter(ev =>
                          ev.relatedTo === c.item ||
                          (ev.relatedTo && c.item && (
                            ev.relatedTo.toLowerCase().includes(c.item.toLowerCase()) ||
                            c.item.toLowerCase().includes(ev.relatedTo.toLowerCase())
                          ))
                        );

                        return (
                          <tr key={c.id || idx}>
                            <td><b>{c.item}</b></td>
                            <td>
                              {!isReadOnly ? (
                                <select
                                  className="filter-select"
                                  value={c.result}
                                  onChange={e => {
                                    const nc = [...checklist];
                                    nc[idx].result = e.target.value as any;
                                    setChecklist(nc);
                                  }}
                                  style={{ width: '100%' }}
                                >
                                  <option value="PASS">PASS</option>
                                  <option value="FAIL">FAIL</option>
                                  <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                                </select>
                              ) : (
                                <Badge value={c.result} />
                              )}
                            </td>
                            <td>
                              {!isReadOnly ? (
                                <input
                                  className="input"
                                  style={{ width: '100%' }}
                                  value={c.remarks || ''}
                                  onChange={e => {
                                    const nc = [...checklist];
                                    nc[idx].remarks = e.target.value;
                                    setChecklist(nc);
                                  }}
                                  placeholder="Enter remarks..."
                                />
                              ) : (
                                <span>{c.remarks || '—'}</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {itemEvs.map((ev, evIdx) => (
                                  <div
                                    key={ev.id || evIdx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      background: '#f1f5f9',
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      fontSize: 12,
                                      border: '1px solid #e2e8f0',
                                      gap: 6
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 130,
                                        fontWeight: 600,
                                        color: '#1e293b'
                                      }}
                                      title={ev.fileName}
                                    >
                                      <FileText size={13} color="#2563eb" /> {ev.fileName}
                                    </span>
                                    <div style={{ display: 'inline-flex', gap: 4 }}>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-xs"
                                        onClick={() => setViewerDoc({ ...ev, establishmentName: selectedInsp.establishmentName })}
                                        style={{ padding: '2px 7px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                        title="View uploaded evidence"
                                      >
                                        <Eye size={11} /> View
                                      </button>
                                      {!isReadOnly && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteEvidence(ev.id)}
                                          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }}
                                          title="Remove evidence"
                                        >
                                          <X size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {!isReadOnly && (
                                  <label
                                    className="btn btn-secondary btn-xs"
                                    style={{
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: 11,
                                      padding: '4px 8px',
                                      width: 'fit-content',
                                      background: '#f8fafc',
                                      borderColor: '#cbd5e1'
                                    }}
                                    title={`Upload evidence file for "${c.item}" (Pass or Fail)`}
                                  >
                                    <Upload size={12} color="#2563eb" />
                                    <span>{itemEvs.length > 0 ? '+ Upload More' : 'Upload Evidence'}</span>
                                    <input
                                      type="file"
                                      accept=".pdf,.jpg,.jpeg,.png"
                                      style={{ display: 'none' }}
                                      onChange={(e) => handleFileUpload(e, c.item)}
                                    />
                                  </label>
                                )}

                                {isReadOnly && itemEvs.length === 0 && (
                                  <span style={{ color: '#94a3b8', fontSize: 12 }}>No evidence attached</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Dedicated Evidence Folder & Dossier Section within Checklist */}
                <div
                  style={{
                    marginTop: 24,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #0f2d59 0%, #1e3a8a 100%)',
                      color: '#ffffff',
                      padding: '12px 18px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ background: 'rgba(255,255,255,0.15)', padding: 6, borderRadius: 6, display: 'flex' }}>
                        <Folder size={18} color="#93c5fd" />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, color: '#ffffff', fontSize: 15, fontWeight: 700 }}>
                          Inspection Evidence Dossier & Folder
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#cbd5e1' }}>
                          Central folder of all statutory registers, attendance sheets, and photographic evidence for this inspection.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.2)',
                          color: '#ffffff',
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600
                        }}
                      >
                        📁 {evidence.length} Evidence File(s)
                      </span>

                      {!isReadOnly && (
                        <label
                          className="btn btn-primary btn-sm"
                          style={{
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#2563eb',
                            border: '1px solid #3b82f6',
                            fontSize: 12,
                            padding: '6px 12px'
                          }}
                        >
                          <Upload size={14} /> Upload Evidence File
                          <input
                            type="file"
                            onChange={(e) => handleFileUpload(e, evidenceRelatedTo)}
                            accept=".pdf,.jpg,.jpeg,.png"
                            style={{ display: 'none' }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {!isReadOnly && (
                    <div
                      style={{
                        padding: '10px 18px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        flexWrap: 'wrap',
                        gap: 8
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#475569', fontWeight: 600 }}>Default Evidence Category:</span>
                        <select
                          value={evidenceRelatedTo}
                          onChange={e => setEvidenceRelatedTo(e.target.value)}
                          className="filter-select"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                        >
                          {checklist.map((c, i) => (
                            <option key={c.id || i} value={c.item}>{c.item} ({c.result || 'PASS'})</option>
                          ))}
                          <option value="Attendance Records">Attendance Records</option>
                          <option value="Wage Register">Wage Register</option>
                          <option value="Statutory Records">Statutory Display Boards</option>
                          <option value="Overtime Records">Overtime Records</option>
                          <option value="General Finding">General Site Evidence</option>
                        </select>
                      </div>
                      <span style={{ color: '#64748b', fontSize: 12 }}>
                        Supports PDF documents and JPG/PNG photographs up to 25MB. Evidence can be attached for PASS or FAIL items.
                      </span>
                    </div>
                  )}

                  <div style={{ padding: 16 }}>
                    {evidence.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '24px 16px', color: '#64748b' }}>
                        <Folder size={36} color="#cbd5e1" style={{ margin: '0 auto 8px', display: 'block' }} />
                        <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#334155' }}>Evidence folder is currently empty</p>
                        <p style={{ margin: 0, fontSize: 12 }}>
                          Upload wage slips, Form-B register scans, attendance rolls, or site photographs directly using the upload buttons above.
                        </p>
                      </div>
                    ) : (
                      <div className="table-wrap" style={{ margin: 0 }}>
                        <table>
                          <thead>
                            <tr>
                              <th>File Name</th>
                              <th>Format</th>
                              <th>Scope / Requirement</th>
                              <th>Uploaded Date</th>
                              <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evidence.map((ev, idx) => {
                              const matchedItem = checklist.find(c =>
                                c.item === ev.relatedTo || (
                                  ev.relatedTo && c.item && (
                                    ev.relatedTo.toLowerCase().includes(c.item.toLowerCase()) ||
                                    c.item.toLowerCase().includes(ev.relatedTo.toLowerCase())
                                  )
                                )
                              );
                              return (
                                <tr key={ev.id || idx}>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <div style={{ background: '#eff6ff', padding: 6, borderRadius: 6, color: '#2563eb' }}>
                                        <FileText size={16} />
                                      </div>
                                      <div>
                                        <b style={{ color: '#0f172a', fontSize: 13 }}>{ev.fileName}</b>
                                        {ev.fileSize ? (
                                          <div style={{ fontSize: 11, color: '#64748b' }}>
                                            {(ev.fileSize / 1024).toFixed(1)} KB
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <Badge value={ev.fileType && ev.fileType.toLowerCase().includes('pdf') ? 'PDF' : 'JPG'} />
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 13, fontWeight: 500 }}>{ev.relatedTo || 'General Finding'}</span>
                                      {matchedItem && <Badge value={matchedItem.result} />}
                                    </div>
                                  </td>
                                  <td style={{ fontSize: 13, color: '#64748b' }}>
                                    {ev.uploadDate || new Date().toISOString().slice(0, 10)}
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'inline-flex', gap: 6 }}>
                                      <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={() => setViewerDoc({ ...ev, establishmentName: selectedInsp.establishmentName })}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                        title="Open and view uploaded evidence document"
                                      >
                                        <Eye size={13} /> View Evidence
                                      </button>
                                      {!isReadOnly && (
                                        <button
                                          type="button"
                                          className="btn btn-secondary btn-sm"
                                          onClick={() => handleDeleteEvidence(ev.id)}
                                          style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '4px 8px' }}
                                          title="Delete evidence file"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {!isReadOnly && (
                  <div style={{ marginTop: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveDraft()}>Save Checklist Draft</button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: OBSERVATIONS */}
            {activeFormTab === 'Observations' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#0f2d59' }}>Site Inspection Observations</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Record statutory observations categorized by area and severity.</p>
                  </div>
                  {!isReadOnly && (
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const newO = [...observations, { id: 'OBS-' + (301 + observations.length), category: 'WAGES', description: '', severity: 'MEDIUM', status: 'RECORDED' }];
                      setObservations(newO);
                      saveDraft({ observations: newO });
                    }}>
                      <Plus size={14} /> Add Observation
                    </button>
                  )}
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Severity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observations.map((o, idx) => (
                        <tr key={o.id || idx}>
                          <td><b>{o.id}</b></td>
                          <td style={{ width: 160 }}>
                            {!isReadOnly ? (
                              <select className="filter-select" value={o.category} onChange={e => { const no = [...observations]; no[idx].category = e.target.value as any; setObservations(no); }}>
                                <option value="WAGES">WAGES</option>
                                <option value="ATTENDANCE">ATTENDANCE</option>
                                <option value="OVERTIME">OVERTIME</option>
                                <option value="STATUTORY_RECORDS">STATUTORY_RECORDS</option>
                                <option value="OTHER">OTHER</option>
                              </select>
                            ) : (
                              <span>{o.category}</span>
                            )}
                          </td>
                          <td>
                            {!isReadOnly ? (
                              <input className="input" style={{ width: '100%' }} value={o.description} onChange={e => { const no = [...observations]; no[idx].description = e.target.value; setObservations(no); }} placeholder="Enter observation details..." />
                            ) : (
                              <span>{o.description}</span>
                            )}
                          </td>
                          <td style={{ width: 120 }}>
                            {!isReadOnly ? (
                              <select className="filter-select" value={o.severity} onChange={e => { const no = [...observations]; no[idx].severity = e.target.value as any; setObservations(no); }}>
                                <option value="LOW">LOW</option>
                                <option value="MEDIUM">MEDIUM</option>
                                <option value="HIGH">HIGH</option>
                              </select>
                            ) : (
                              <Badge value={o.severity} />
                            )}
                          </td>
                          <td><Badge value={o.status || 'RECORDED'} /></td>
                        </tr>
                      ))}
                      {!observations.length && <tr><td colSpan={5}>No observations recorded yet.</td></tr>}
                    </tbody>
                  </table>
                </div>

                {!isReadOnly && (
                  <div style={{ marginTop: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveDraft()}>Save Observations</button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: FINDINGS */}
            {activeFormTab === 'Findings' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#0f2d59' }}>Inspector Recommendations & Findings</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Findings are recommendations submitted for Officer review and decision.</p>
                  </div>
                  {!isReadOnly && (
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const newF = [...findings, { id: 'FND-' + (401 + findings.length), category: 'Wage Compliance', description: '', severity: 'HIGH', inspectorRemarks: '' }];
                      setFindings(newF);
                      saveDraft({ findings: newF });
                    }}>
                      <Plus size={14} /> Add Finding
                    </button>
                  )}
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Category</th>
                        <th>Finding Description</th>
                        <th>Severity</th>
                        <th>Inspector Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((f, idx) => (
                        <tr key={f.id || idx}>
                          <td><b>{f.id}</b></td>
                          <td>{f.category}</td>
                          <td>
                            {!isReadOnly ? (
                              <input className="input" style={{ width: '100%' }} value={f.description} onChange={e => { const nf = [...findings]; nf[idx].description = e.target.value; setFindings(nf); }} placeholder="Finding description..." />
                            ) : (
                              <span>{f.description}</span>
                            )}
                          </td>
                          <td><Badge value={f.severity} /></td>
                          <td>
                            {!isReadOnly ? (
                              <input className="input" style={{ width: '100%' }} value={f.inspectorRemarks} onChange={e => { const nf = [...findings]; nf[idx].inspectorRemarks = e.target.value; setFindings(nf); }} placeholder="Recommendation for Officer..." />
                            ) : (
                              <span>{f.inspectorRemarks}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!findings.length && <tr><td colSpan={5}>No findings recorded yet.</td></tr>}
                    </tbody>
                  </table>
                </div>

                {!isReadOnly && (
                  <div style={{ marginTop: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveDraft()}>Save Findings</button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: SUBMIT REPORT */}
            {activeFormTab === 'Submit Report' && (
              <div style={{ maxWidth: 680 }}>
                <h4 style={{ margin: '0 0 8px', color: '#0f2d59' }}>Final Overall Inspector Report Summary</h4>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                  Provide overall conclusions and recommendations. Upon submission, the report will be locked and routed to the Labour Officer.
                </p>

                {!isReadOnly ? (
                  <>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>
                      Overall Inspection Remarks & Recommendation *
                      <textarea rows={5} className="input" value={inspectorRemarks} onChange={e => setInspectorRemarks(e.target.value)} placeholder="Summarize site findings, register anomalies, and follow-up recommendations..." style={{ width: '100%', marginTop: 8 }} />
                    </label>

                    <button className="btn btn-primary btn-lg" onClick={handleSubmitReport}>
                      Submit Official Inspection Report
                    </button>
                  </>
                ) : (
                  <div style={{ background: '#f8fafc', padding: 18, borderRadius: 8 }}>
                    <p style={{ margin: '0 0 10px', fontWeight: 700, color: '#059669' }}>✓ Report Submitted to Labour Department Officer</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
                      <b>Inspector Remarks:</b> {inspectorRemarks || selectedInsp.inspectorRemarks || 'Site inspection completed. Statutory register failures recorded for Officer review.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Global Document Viewer Modal within selected inspection */}
        <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
      </>
    );
  }

  // LIST VIEWS BY SUBTAB
  return (
    <>
      <Hero
        title={mainSection === 'Inspection Reports' ? 'Inspection Reports' : 'My Field Inspections'}
        text={
          mainSection === 'Inspection Reports'
            ? 'Manage draft reports, view submitted inspection findings, and review historical inspection records.'
            : 'Track assigned field visits, upcoming scheduled inspections, and statutory follow-up verifications.'
        }
      />

      {toast && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 18 }}>{toast}</p>}

      {/* Secondary Tab Bar within page */}
      <div className="sub-nav-tabs">
        {mainSection === 'My Inspections' ? (
          <>
            <button
              className={`sub-nav-tab ${activeTab === 'Assigned' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Assigned');
                onNavigate?.('My Inspections', 'Assigned');
              }}
            >
              <ClipboardCheck size={16} /> Assigned <span className="tab-badge">{assignedList.length}</span>
            </button>
            <button
              className={`sub-nav-tab ${activeTab === 'Upcoming' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Upcoming');
                onNavigate?.('My Inspections', 'Upcoming');
              }}
            >
              <Clock size={16} /> Upcoming <span className="tab-badge">{upcomingList.length}</span>
            </button>
            <button
              className={`sub-nav-tab ${activeTab === 'Follow-up' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Follow-up');
                onNavigate?.('My Inspections', 'Follow-up');
              }}
            >
              <AlertTriangle size={16} /> Follow-up <span className="tab-badge">{followupList.length}</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`sub-nav-tab ${activeTab === 'Draft Reports' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Draft Reports');
                onNavigate?.('Inspection Reports', 'Draft Reports');
              }}
            >
              <FileText size={16} /> Draft Reports <span className="tab-badge">{draftList.length}</span>
            </button>
            <button
              className={`sub-nav-tab ${activeTab === 'Submitted Reports' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Submitted Reports');
                onNavigate?.('Inspection Reports', 'Submitted Reports');
              }}
            >
              <CheckCircle2 size={16} /> Submitted Reports <span className="tab-badge">{submittedList.length}</span>
            </button>
            <button
              className={`sub-nav-tab ${activeTab === 'Inspection History' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('Inspection History');
                onNavigate?.('Inspection Reports', 'Inspection History');
              }}
            >
              <Clock size={16} /> Inspection History <span className="tab-badge">{historyList.length}</span>
            </button>
          </>
        )}
      </div>

      {/* SUBTAB 1: ASSIGNED (Active work assigned to me) */}
      {activeTab === 'Assigned' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Assigned Field Inspections</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Inspections currently assigned to you awaiting site inspection execution.
              </p>
            </div>
            <div className="search">
              <Search size={16} />
              <input placeholder="Search establishment or district..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Establishment Name</th>
                  <th>District</th>
                  <th>Workers</th>
                  <th>Risk Level</th>
                  <th>Priority</th>
                  <th>Type</th>
                  <th>Scheduled Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {assignedList
                  .filter(i => (i.establishmentName + i.district + i.id).toLowerCase().includes(search.toLowerCase()))
                  .map(i => (
                    <tr key={i.id}>
                      <td><b>{i.id}</b></td>
                      <td><b>{i.establishmentName}</b><br /><small>{i.industry}</small></td>
                      <td>{i.district}</td>
                      <td>{i.totalEmployees}</td>
                      <td><Badge value={i.riskLevel} /></td>
                      <td><Badge value={i.priority} /></td>
                      <td><Badge value={i.inspectionType} /></td>
                      <td>{i.scheduledDate}</td>
                      <td><Badge value={i.status} /></td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => openInspection(i)}>
                          {i.status === 'IN_PROGRESS' ? 'Continue Inspection' : 'View / Start'}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 2: UPCOMING (Future scheduled inspections) */}
      {activeTab === 'Upcoming' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Upcoming Scheduled Inspections</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                Inspections assigned to you scheduled for future dates.
              </p>
            </div>
            <div className="search">
              <Search size={16} />
              <input placeholder="Search establishment or district..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Establishment Name</th>
                  <th>District</th>
                  <th>Workers</th>
                  <th>Risk Level</th>
                  <th>Priority</th>
                  <th>Type</th>
                  <th>Scheduled Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {upcomingList
                  .filter(i => (i.establishmentName + i.district + i.id).toLowerCase().includes(search.toLowerCase()))
                  .map(i => (
                    <tr key={i.id}>
                      <td><b>{i.id}</b></td>
                      <td><b>{i.establishmentName}</b><br /><small>{i.industry}</small></td>
                      <td>{i.district}</td>
                      <td>{i.totalEmployees}</td>
                      <td><Badge value={i.riskLevel} /></td>
                      <td><Badge value={i.priority} /></td>
                      <td><Badge value={i.inspectionType} /></td>
                      <td>{i.scheduledDate}</td>
                      <td><Badge value={i.status} /></td>
                      <td>
                        <button className="btn btn-secondary btn-sm" onClick={() => openInspection(i)}>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 3: FOLLOW-UP (Re-inspections for violation verification) */}
      {activeTab === 'Follow-up' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Follow-up Re-Inspections</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Verify whether statutory violations identified in past inspections have been rectified by employer.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Follow-up ID</th>
                  <th>Establishment Name</th>
                  <th>Related Violation</th>
                  <th>Scheduled Date</th>
                  <th>Required Action</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {followupList.map(fu => (
                  <tr key={fu.id}>
                    <td><b>{fu.id}</b></td>
                    <td><b>{fu.establishmentName}</b><br /><small>{fu.district}</small></td>
                    <td><Badge value={fu.relatedViolation || 'VIO-1025'} /></td>
                    <td>{fu.scheduledDate}</td>
                    <td><small>{fu.requiredAction}</small></td>
                    <td><Badge value={fu.status} /></td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => openInspection(fu)}>
                        Perform Verification
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 4: DRAFT REPORTS (In-progress unsubmitted reports) */}
      {activeTab === 'Draft Reports' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Draft Inspection Reports</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>In-progress reports awaiting complete checklist and observation entry.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Inspection ID</th>
                  <th>Establishment Name</th>
                  <th>District</th>
                  <th>Inspection Date</th>
                  <th>Completion Progress</th>
                  <th>Risk Level</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {draftList.map(d => (
                  <tr key={d.id}>
                    <td><b>{d.id}</b></td>
                    <td>{d.inspectionId}</td>
                    <td><b>{d.establishmentName}</b></td>
                    <td>{d.district}</td>
                    <td>{d.inspectionDate}</td>
                    <td><small style={{ color: '#2563eb', fontWeight: 600 }}>{d.progressSummary}</small></td>
                    <td><Badge value={d.riskLevel} /></td>
                    <td><Badge value={d.status} /></td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => openInspection(d)}>
                        Continue Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 5: SUBMITTED REPORTS (Reports sent to Officer) */}
      {activeTab === 'Submitted Reports' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Submitted Inspection Reports</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Official reports submitted to Labour Officer for violation confirmation & enforcement.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Establishment Name</th>
                  <th>District</th>
                  <th>Inspection Date</th>
                  <th>Submission Date</th>
                  <th>Risk Level</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {submittedList.map(s => (
                  <tr key={s.id}>
                    <td><b>{s.id}</b></td>
                    <td><b>{s.establishmentName}</b></td>
                    <td>{s.district}</td>
                    <td>{s.inspectionDate}</td>
                    <td>{s.submittedDate}</td>
                    <td><Badge value={s.riskLevel} /></td>
                    <td><Badge value={s.status} /></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openInspection(s)}>
                        View Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUBTAB 6: INSPECTION HISTORY (Older historical completed inspections) */}
      {activeTab === 'Inspection History' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Completed Inspection History</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Historical record of past completed inspections.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Establishment Name</th>
                  <th>District</th>
                  <th>Inspection Date</th>
                  <th>Inspection Type</th>
                  <th>Findings Summary</th>
                  <th>Follow-up Status</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {historyList.map(h => (
                  <tr key={h.id}>
                    <td><b>{h.id}</b></td>
                    <td><b>{h.establishmentName}</b></td>
                    <td>{h.district}</td>
                    <td>{h.inspectionDate}</td>
                    <td><Badge value={h.inspectionType} /></td>
                    <td><small>{h.findingsSummary}</small></td>
                    <td><Badge value={h.followUpStatus} /></td>
                    <td><Badge value={h.result} /></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openInspection({ ...h, status: 'COMPLETED' })}>
                        View History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}


// ----------------------------------------------------
// ═══════════════════════════════════════════════════════════════════
// OPTIMIZED EMPLOYER PORTAL MODULES
// ═══════════════════════════════════════════════════════════════════

// ── 1. EMPLOYER DASHBOARD ──────────────────────────────────────────
function EmployerDashboard({ onNavigate }: { onNavigate: (main: string, sub?: string) => void }) {
  const [d, setD] = useState<ApiData>({});
  const [loading, setLoading] = useState(true);

  // Quick notice response modal state
  const [quickNotice, setQuickNotice] = useState<any | null>(null);
  const [quickExplanation, setQuickExplanation] = useState('');
  const [quickUploadFile, setQuickUploadFile] = useState<{ name: string; size?: number; type?: string; dataUrl?: string } | null>(null);
  const [quickMsg, setQuickMsg] = useState('');
  const [quickErr, setQuickErr] = useState('');

  const loadDashboardData = () => {
    setLoading(true);
    api('/dashboard/employer')
      .then((res) => {
        setD(res || {});
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const est = d.establishment || EMPLOYER_ESTABLISHMENT_DATA;
  const submissions: any[] = d.submissions && d.submissions.length ? d.submissions : EMPLOYER_COMPLIANCE_HISTORY;
  const inspections: any[] = d.inspections && d.inspections.length ? d.inspections : EMPLOYER_UPCOMING_INSPECTIONS;
  const notices: any[] = d.notices && d.notices.length ? d.notices : EMPLOYER_NOTICES;
  const actions: any[] = d.actions && d.actions.length ? d.actions : EMPLOYER_CORRECTIVE_ACTIONS;

  const upcomingInspections = inspections.filter((i: any) => i.status !== 'COMPLETED');
  const openNotices = notices.filter((n: any) => n.status !== 'CLOSED' && n.status !== 'RESOLVED');
  const pendingActions = actions.filter((a: any) => a.status !== 'VERIFIED' && a.status !== 'COMPLETED');
  const latestSubmission = submissions.length > 0 ? submissions[0] : null;

  const handleQuickNoticeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNotice) return;
    setQuickErr('');
    setQuickMsg('');
    try {
      const payload: any = { explanation: quickExplanation };
      if (quickUploadFile) {
        payload.evidence = [
          {
            fileName: quickUploadFile.name,
            fileSize: quickUploadFile.size || 0,
            fileType: quickUploadFile.type || 'application/pdf',
            fileData: quickUploadFile.dataUrl || '',
            uploadedAt: new Date().toISOString(),
          }
        ];
      }
      await api('/notices/' + quickNotice.id + '/response', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }).catch(() => {});
      setQuickMsg('Explanation and supporting evidence submitted successfully. Awaiting Officer review.');
      setTimeout(() => {
        setQuickNotice(null);
        setQuickExplanation('');
        setQuickUploadFile(null);
        setQuickMsg('');
        loadDashboardData();
      }, 1500);
    } catch (err: any) {
      setQuickErr(err.message || 'Failed to submit response');
    }
  };

  return (
    <>
      {/* Establishment Context Bar */}
      <div className="employer-context-banner">
        <div className="employer-context-info">
          <h2>{est?.establishmentName || 'Sakthi Textiles Pvt Ltd'}</h2>
          <div className="employer-context-meta">
            <span><Building2 size={14} /> Reg: <b>{est?.registrationNumber || 'TN-1001'}</b></span>
            <span><MapPin size={14} /> District: <b>{est?.districtId || est?.district || 'Chennai'}</b></span>
            <span><Activity size={14} /> Sector: <b>{est?.industry || est?.industryType || 'Textiles'}</b></span>
            <span><Users size={14} /> Workforce: <b>{est?.totalEmployees || 250} Workers</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge value={est?.verificationStatus || 'VERIFIED'} />
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigate('Establishment Profile', 'Overview')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Eye size={14} /> View Profile
          </button>
        </div>
      </div>

      {/* Prototype Indicator Banner */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#475569' }}>
        <Info size={16} color="#0f2d59" />
        <span><b>Statutory Monitoring Prototype:</b> Connected live to Labour Department tracking services. Actions performed update state records in real time.</span>
      </div>

      {/* 4 Focused Primary KPI Cards */}
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: 24 }}>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('Wage Compliance', 'Submission History')}>
          <Card
            name="Compliance Status"
            value={latestSubmission ? (latestSubmission.status || latestSubmission.submissionStatus || 'UNDER REVIEW') : 'PENDING'}
            Icon={ShieldCheck}
            colorClass="green"
          />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('Establishment Profile', 'Verification Progress')}>
          <Card
            name="Registration Status"
            value={est?.verificationStatus || 'VERIFIED'}
            Icon={Building2}
            colorClass="blue"
          />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('Inspections & Notices', 'Inspections')}>
          <Card
            name="Active Inspections"
            value={upcomingInspections.length}
            Icon={ClipboardCheck}
            colorClass="purple"
          />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onNavigate('Inspections & Notices', 'Statutory Notices')}>
          <Card
            name="Actions Due Soon"
            value={openNotices.length + pendingActions.length}
            Icon={AlertTriangle}
            colorClass={openNotices.length + pendingActions.length > 0 ? 'red' : 'green'}
          />
        </div>
      </div>

      {/* Urgent Notice Alert Banner (if notices require action) */}
      {openNotices.length > 0 && (
        <div className="employer-alert-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#fef3c7', padding: 8, borderRadius: '50%', color: '#b45309' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <b style={{ color: '#92400e', fontSize: 14 }}>Statutory Notice Pending: {openNotices[0].noticeNumber || openNotices[0].id}</b>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#78350f' }}>
                {openNotices[0].issue || openNotices[0].description || 'Official clarification required regarding statutory wage compliance.'}
                {openNotices[0].responseDeadline && (
                  <span> &bull; <b>Response Due: {new Date(openNotices[0].responseDeadline).toLocaleDateString()}</b></span>
                )}
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setQuickNotice(openNotices[0]);
              setQuickExplanation('');
              setQuickUploadFile(null);
            }}
          >
            Respond Now
          </button>
        </div>
      )}

      {/* Pending Statutory Actions */}
      <div style={{ marginBottom: 24 }}>
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3>Pending Statutory Actions</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Statutory notices and corrective actions requiring your response.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('Inspections & Notices', 'Statutory Notices')}>View All</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Action Required</th>
                  <th>Deadline</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {openNotices.length > 0 || pendingActions.length > 0 ? (
                  <>
                    {openNotices.slice(0, 3).map((n) => (
                      <tr key={n.id}>
                        <td><b>{n.noticeNumber || n.id}</b><br /><small style={{ color: '#64748b' }}>Notice</small></td>
                        <td><small>{n.issue || n.description || 'Statutory response required'}</small></td>
                        <td><span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>{n.responseDeadline ? new Date(n.responseDeadline).toLocaleDateString() : 'Immediate'}</span></td>
                        <td>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => {
                              setQuickNotice(n);
                              setQuickExplanation('');
                              setQuickUploadFile(null);
                            }}
                          >
                            Respond
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pendingActions.slice(0, 2).map((a) => (
                      <tr key={a.id}>
                        <td><b>{a.id}</b><br /><small style={{ color: '#64748b' }}>Action</small></td>
                        <td><small>{a.requiredAction || 'Rectify compliance gap'}</small></td>
                        <td><Badge value={a.status || 'PENDING'} /></td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => onNavigate('Inspections & Notices', 'Corrective Actions')}
                          >
                            Submit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                ) : (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#64748b', padding: '24px 12px' }}>
                      <CheckCircle2 size={24} color="#16a34a" style={{ display: 'block', margin: '0 auto 8px' }} />
                      <b>All Clear</b> — No pending notices or corrective actions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Quick Notice Response Modal */}
      {quickNotice && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Respond to Notice: {quickNotice.noticeNumber || quickNotice.id}</h3>
                <small style={{ color: '#64748b' }}>Category: {quickNotice.category || 'Wage Compliance'}</small>
              </div>
              <button className="close-btn" onClick={() => { setQuickNotice(null); setQuickUploadFile(null); }}><X size={20} /></button>
            </div>
            {quickMsg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 10, borderRadius: 6, marginBottom: 16 }}>{quickMsg}</p>}
            {quickErr && <p className="error" style={{ marginBottom: 16 }}>{quickErr}</p>}
            <form onSubmit={handleQuickNoticeSubmit}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
                <b>Notice Subject:</b> {quickNotice.issue || quickNotice.description || 'Statutory compliance clarification requested.'}
              </div>
              <label style={{ display: 'block', marginBottom: 16 }}>
                Formal Explanation Statement * (Min 5 characters)
                <textarea
                  rows={4}
                  value={quickExplanation}
                  onChange={(e) => setQuickExplanation(e.target.value)}
                  required
                  placeholder="Explain payroll processing, bank disbursement confirmation, or rectifications executed..."
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>

              {/* Evidence Attachment Field */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  Evidence Attachment (Supporting Files)
                </label>
                <FileUploadBox
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  selectedFile={quickUploadFile}
                  onFileSelect={(file, dataUrl) => {
                    setQuickUploadFile({ name: file.name, size: file.size, type: file.type, dataUrl });
                  }}
                  onClear={() => setQuickUploadFile(null)}
                  label="Attach Supporting Document / Payment Proof"
                  hint="Upload bank payment confirmation, wage register excerpt, or muster roll (PDF, JPG, PNG up to 25MB)"
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="submit" className="btn btn-primary">Submit Explanation</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setQuickNotice(null); setQuickUploadFile(null); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── 2. EMPLOYER ESTABLISHMENT MODULE ──────────────────────────────
function EmployerEstablishmentModule({ subTab, onNavigate }: { subTab: string; onNavigate: (main: string, sub?: string) => void }) {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Edit' | 'Status'>('Overview');
  const [est, setEst] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [formData, setFormData] = useState({
    establishmentName: '',
    industry: 'Textiles',
    registrationNumber: '',
    districtId: 'Chennai',
    address: '',
    ownerName: '',
    totalEmployees: 250,
    phone: '',
    email: '',
  });

  useEffect(() => {
    if (subTab === 'Registration' || subTab === 'Update Information' || subTab === 'edit') {
      setActiveTab('Edit');
    } else if (subTab === 'Registration Status' || subTab === 'Verification Progress' || subTab === 'status') {
      setActiveTab('Status');
    } else {
      setActiveTab('Overview');
    }
  }, [subTab]);

  const loadEstablishment = () => {
    api('/employer/establishment')
      .then((res) => {
        if (res && (res.establishmentName || res.id)) {
          setEst(res);
          setFormData({
            establishmentName: res.establishmentName || '',
            industry: res.industry || res.industryType || 'Textiles',
            registrationNumber: res.registrationNumber || '',
            districtId: res.districtId || res.district || 'Chennai',
            address: res.address || '',
            ownerName: res.ownerName || '',
            totalEmployees: res.totalEmployees || 250,
            phone: res.phone || '',
            email: res.email || '',
          });
        } else {
          setEst(EMPLOYER_ESTABLISHMENT_DATA);
          setFormData({
            establishmentName: EMPLOYER_ESTABLISHMENT_DATA.establishmentName,
            industry: EMPLOYER_ESTABLISHMENT_DATA.industry,
            registrationNumber: EMPLOYER_ESTABLISHMENT_DATA.registrationNumber,
            districtId: EMPLOYER_ESTABLISHMENT_DATA.district,
            address: EMPLOYER_ESTABLISHMENT_DATA.address,
            ownerName: EMPLOYER_ESTABLISHMENT_DATA.ownerName,
            totalEmployees: EMPLOYER_ESTABLISHMENT_DATA.totalEmployees,
            phone: EMPLOYER_ESTABLISHMENT_DATA.phone,
            email: EMPLOYER_ESTABLISHMENT_DATA.email,
          });
        }
      })
      .catch(() => {
        setEst(EMPLOYER_ESTABLISHMENT_DATA);
      });
  };

  useEffect(() => {
    loadEstablishment();
  }, []);

  const handleSaveEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    setErr('');
    try {
      const res = await api('/establishments', {
        method: 'POST',
        body: JSON.stringify({ ...formData, totalEmployees: Number(formData.totalEmployees) }),
      });
      setMsg('Establishment details updated successfully and synchronized with Labour Department records.');
      setEst(res);
      setLoading(false);
      setTimeout(() => {
        setActiveTab('Overview');
      }, 1200);
    } catch (x: any) {
      setLoading(false);
      setErr(x.message || 'Failed to update establishment details');
    }
  };

  const steps = [
    { step: 'Registration Submitted', completed: true, date: est?.createdAt ? new Date(est.createdAt).toLocaleDateString() : '15 Aug 2024' },
    { step: 'Documents Uploaded', completed: true, date: '18 Aug 2024' },
    { step: 'Document Verification', completed: true, date: '20 Aug 2024' },
    { step: 'Officer Review', completed: est?.verificationStatus === 'APPROVED' || est?.verificationStatus === 'VERIFIED', date: '22 Aug 2024' },
    { step: 'Statutory Verified', completed: est?.verificationStatus === 'APPROVED' || est?.verificationStatus === 'VERIFIED', date: 'Verified' },
  ];

  return (
    <>
      <Hero
        title="Establishment Profile & Verification"
        text="Manage your legal establishment profile, authorized representative credentials, premises address, and statutory verification status."
      />

      {/* Secondary Tab Bar */}
      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'Overview' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Overview'); onNavigate('Establishment Profile', 'Overview'); }}
        >
          <Building2 size={16} /> Establishment Overview
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Edit' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Edit'); onNavigate('Establishment Profile', 'Update Information'); }}
        >
          <FileText size={16} /> Update Information
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Status' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Status'); onNavigate('Establishment Profile', 'Verification Progress'); }}
        >
          <CheckCircle2 size={16} /> Verification Progress <span className="tab-badge">{est?.verificationStatus || 'VERIFIED'}</span>
        </button>
      </div>

      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
      {err && <p className="error" style={{ marginBottom: 20 }}>{err}</p>}

      {/* Tab 1: Overview */}
      {activeTab === 'Overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, alignItems: 'start' }}>
          <section className="panel">
            <div className="panel-title">
              <div>
                <h3 style={{ margin: 0 }}>Registered Establishment Profile</h3>
                <small style={{ color: '#64748b' }}>Officially registered with Government of Tamil Nadu</small>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Badge value={est?.verificationStatus || 'VERIFIED'} />
                <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('Edit')}>
                  Edit Details
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8fafc', padding: 20, borderRadius: 8, fontSize: 13.5 }}>
              <div><b>Establishment Name:</b> <br /><span style={{ fontSize: 15, color: '#0f2d59', fontWeight: 600 }}>{est?.establishmentName || 'Sakthi Textiles Pvt Ltd'}</span></div>
              <div><b>Registration Number:</b> <br /><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{est?.registrationNumber || 'TN-1001'}</span></div>
              <div><b>Industry Sector:</b> <br />{est?.industry || est?.industryType || 'Textiles'}</div>
              <div><b>District Jurisdiction:</b> <br />{est?.districtId || est?.district || 'Chennai'}</div>
              <div><b>Total Workforce:</b> <br /><b>{est?.totalEmployees || 250} Covered Workers</b></div>
              <div><b>Authorized Representative:</b> <br />{est?.ownerName || 'Representative'} ({est?.designation || 'Authorized Signatory'})</div>
              <div><b>Official Phone:</b> <br />{est?.phone || '+91 98765 43210'}</div>
              <div><b>Official Email:</b> <br />{est?.email || 'employer@example.com'}</div>
              <div><b>Registration Date:</b> <br />{est?.createdAt ? new Date(est.createdAt).toLocaleDateString() : (est?.registrationDate || '15 Aug 2024')}</div>
              <div><b>Document Verification:</b> <br /><Badge value={est?.documentVerificationStatus || 'APPROVED'} /></div>
              <div style={{ gridColumn: 'span 2' }}><b>Premises Address:</b> <br />{est?.address || 'Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032'}</div>
              <div style={{ gridColumn: 'span 2', background: '#eff6ff', padding: 12, borderRadius: 6, borderLeft: '4px solid #2563eb' }}>
                <b>Officer Endorsement Remarks:</b> <br />
                <span style={{ color: '#1e40af' }}>{est?.officerRemarks || 'Establishment registered under Tamil Nadu Labour Regulations. Fully verified for statutory compliance filings.'}</span>
              </div>
            </div>
          </section>

          {/* Right Column: Worker Feedback QR Code Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {est && <FeedbackQRCode establishmentId={est.id || est.registrationNumber || 'EST-001'} />}
          </div>
        </div>
      )}

      {/* Tab 2: Update Information Form */}
      {activeTab === 'Edit' && (
        <section className="panel" style={{ maxWidth: 820 }}>
          <div className="panel-title">
            <div>
              <h3 style={{ margin: 0 }}>Update Establishment Details</h3>
              <small style={{ color: '#64748b' }}>Changes are submitted directly for Labour Department verification.</small>
            </div>
          </div>
          <form onSubmit={handleSaveEstablishment}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <label>Establishment Name *
                <input
                  value={formData.establishmentName}
                  onChange={(e) => setFormData({ ...formData, establishmentName: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
              <label>Registration / License Number *
                <input
                  value={formData.registrationNumber}
                  onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <label>Industry Sector *
                <select
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="filter-select"
                  style={{ width: '100%', marginTop: 6 }}
                >
                  <option value="Textiles">Textiles & Garments</option>
                  <option value="Food Processing">Food Processing & Agriculture</option>
                  <option value="Manufacturing">Manufacturing & Heavy Engineering</option>
                  <option value="Logistics">Logistics, Transport & Warehousing</option>
                  <option value="Services">Commercial, IT & Services</option>
                </select>
              </label>
              <label>District Jurisdiction *
                <input
                  value={formData.districtId}
                  onChange={(e) => setFormData({ ...formData, districtId: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <label>Authorized Signatory Name *
                <input
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
              <label>Total Workforce (Covered Workers) *
                <input
                  type="number"
                  min={1}
                  value={formData.totalEmployees}
                  onChange={(e) => setFormData({ ...formData, totalEmployees: Number(e.target.value) })}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <label>Official Contact Phone
                <input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
              <label>Official Email Address
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="compliance@company.com"
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label>Premises Full Address *
                <textarea
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  required
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Save & Submit Details'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('Overview')}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Tab 3: Verification Progress */}
      {activeTab === 'Status' && (
        <section className="panel" style={{ maxWidth: 820 }}>
          <div className="panel-title">
            <div>
              <h3 style={{ margin: 0 }}>Statutory Registration Verification Progress</h3>
              <small style={{ color: '#64748b' }}>Labour Department official verification timeline</small>
            </div>
            <Badge value={est?.verificationStatus || 'VERIFIED'} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '28px 0', padding: '0 10px', position: 'relative' }}>
            {steps.map((s, idx) => (
              <div key={idx} style={{ textAlign: 'center', flex: 1, position: 'relative', zIndex: 1 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: s.completed ? '#059669' : '#cbd5e1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontWeight: 700 }}>
                  {s.completed ? '✓' : idx + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0f2d59' }}>{s.step}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.date}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f8fafc', padding: 20, borderRadius: 8, fontSize: 13.5 }}>
            <div><b>Verification Stage:</b> <Badge value={est?.verificationStatus || 'VERIFIED'} /></div>
            <div><b>Submission Date:</b> {est?.createdAt ? new Date(est.createdAt).toLocaleDateString() : '15 Aug 2024'}</div>
            <div><b>Document Status:</b> <Badge value={est?.documentVerificationStatus || 'APPROVED'} /></div>
            <div><b>Officer Decision:</b> Verified and Endorsed</div>
            <div style={{ gridColumn: 'span 2' }}>
              <b>Officer Verification Note:</b> <br />
              <span style={{ color: '#334155' }}>{est?.officerRemarks || 'All statutory establishment details and premises documents verified.'}</span>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

// ── 3. EMPLOYER WAGE COMPLIANCE MODULE ─────────────────────────────
function EmployerComplianceModule({ subTab, onNavigate }: { subTab: string; onNavigate: (main: string, sub?: string) => void }) {
  const [activeTab, setActiveTab] = useState<'Submit' | 'History' | 'Documents' | 'Declarations'>('Submit');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [est, setEst] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Submit return form states
  const [period, setPeriod] = useState('October 2026');
  const [workers, setWorkers] = useState(250);
  const [minWageCompliant, setMinWageCompliant] = useState(true);
  const [paymentMode, setPaymentMode] = useState('Direct Bank Transfer (Electronic)');
  const [wagesInfo, setWagesInfo] = useState('100% statutory basic and allowance disbursement executed directly to worker bank accounts.');
  const [overtimeApplicable, setOvertimeApplicable] = useState(true);
  const [otInfo, setOtInfo] = useState('35 workers worked 420 total overtime hours, compensated at double the normal rate per Tamil Nadu Factories Rules.');
  const [attendanceMaintained, setAttendanceMaintained] = useState(true);
  const [recordsMaintained, setRecordsMaintained] = useState(true);
  const [remarks, setRemarks] = useState('Monthly statutory wage return Form-A for October 2026.');

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [declaredConfirmation, setDeclaredConfirmation] = useState(false);

  // Past return view modal
  const [viewingSubmission, setViewingSubmission] = useState<any | null>(null);

  // Document upload state
  const [docName, setDocName] = useState('Wage Register - Oct 2026');
  const [docType, setDocType] = useState('Wage Register');
  const [fileName, setFileName] = useState('wage_register_oct_2026.pdf');
  const [selectedUploadFile, setSelectedUploadFile] = useState<{ file: File; name: string; size: number; type: string; dataUrl: string } | null>(null);
  const [viewerDoc, setViewerDoc] = useState<any | null>(null);

  useEffect(() => {
    if (subTab === 'Submission History' || subTab === 'Compliance History' || subTab === 'history') {
      setActiveTab('History');
    } else if (subTab === 'Documents' || subTab === 'documents') {
      setActiveTab('Documents');
    } else if (subTab === 'Wage Declarations' || subTab === 'Submit Declaration' || subTab === 'declarations') {
      setActiveTab('Declarations');
    } else {
      setActiveTab('Submit');
    }
  }, [subTab]);

  const loadData = () => {
    api('/employer/establishment').then((e) => {
      if (e) {
        setEst(e);
        if (e.totalEmployees) setWorkers(e.totalEmployees);
      }
    }).catch(() => {});

    api('/compliance').then((res) => {
      setSubmissions(Array.isArray(res) && res.length ? res : EMPLOYER_COMPLIANCE_HISTORY);
    }).catch(() => {
      setSubmissions(EMPLOYER_COMPLIANCE_HISTORY);
    });

    api('/employer/documents').then((res) => {
      setDocs(Array.isArray(res) && res.length ? res : EMPLOYER_DOCUMENTS);
    }).catch(() => {
      setDocs(EMPLOYER_DOCUMENTS);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFinalSubmit = async (isDraft: boolean) => {
    setLoading(true);
    setMsg('');
    setErr('');
    try {
      const payload = {
        compliancePeriod: period,
        totalEmployees: Number(workers),
        wagePaymentInformation: wagesInfo,
        minimumWageCompliant: minWageCompliant ? 'YES' : 'NO',
        overtimeInformation: overtimeApplicable ? otInfo : 'No overtime worked',
        attendanceRecordsMaintained: attendanceMaintained ? 'YES' : 'NO',
        requiredRecordsMaintained: recordsMaintained ? 'YES' : 'NO',
        remarks,
        status: isDraft ? 'DRAFT' : 'SUBMITTED',
      };

      const res = await api('/compliance', {
        method: 'POST',
        body: JSON.stringify(payload),
      }).catch(() => ({
        id: 'CMP-' + Date.now().toString().slice(-4),
        ...payload,
        submissionDate: new Date().toISOString().slice(0, 10),
      }));

      setShowReviewModal(false);
      setLoading(false);
      const successText = isDraft
        ? 'Compliance return draft saved successfully (Ref ID: ' + (res.id || 'DRAFT') + ').'
        : 'Statutory wage compliance return for ' + period + ' submitted successfully! (Reference No: ' + (res.id || 'CMP-SUCCESS') + ').';
      setMsg(successText);
      loadData();
      if (!isDraft) {
        setTimeout(() => {
          setActiveTab('History');
        }, 1500);
      }
    } catch (x: any) {
      setLoading(false);
      setErr(x.message || 'Failed to submit compliance return');
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      const finalFileName = fileName || selectedUploadFile?.name || 'document.pdf';
      const payload = {
        docName,
        docType,
        fileName: finalFileName,
        fileData: selectedUploadFile?.dataUrl || '',
        fileType: selectedUploadFile?.type || 'application/pdf',
        fileSize: selectedUploadFile?.size || 0,
      };

      const newDoc = await api('/employer/documents', {
        method: 'POST',
        body: JSON.stringify(payload),
      }).catch(() => ({
        id: 'DOC-' + Date.now().toString().slice(-4),
        ...payload,
        uploadedAt: new Date().toISOString(),
        verificationStatus: 'PENDING',
        remarks: 'Uploaded by employer. Awaiting Officer review.',
      }));

      setDocs([newDoc, ...docs.filter((d) => d.id !== newDoc.id)]);
      setMsg('Document "' + docName + '" uploaded successfully for Labour Department verification.');
      setSelectedUploadFile(null);
    } catch (x: any) {
      setErr(x.message || 'Failed to upload document');
    }
  };

  return (
    <>
      <Hero
        title="Statutory Wage Compliance & Filings"
        text="Submit statutory periodic wage returns, manage compliance documentation, review submission history, and track official verification."
      />

      {/* Secondary Tab Bar */}
      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'Submit' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Submit'); onNavigate('Wage Compliance', 'Submit Return'); }}
        >
          <FileCheck size={16} /> Submit Return
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'History' ? 'active' : ''}`}
          onClick={() => { setActiveTab('History'); onNavigate('Wage Compliance', 'Submission History'); }}
        >
          <Clock size={16} /> Submission History <span className="tab-badge">{submissions.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Documents' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Documents'); onNavigate('Wage Compliance', 'Documents'); }}
        >
          <Upload size={16} /> Documents Repository <span className="tab-badge">{docs.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Declarations' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Declarations'); onNavigate('Wage Compliance', 'Wage Declarations'); }}
        >
          <ShieldCheck size={16} /> Wage Declarations (TWA)
        </button>
      </div>

      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
      {err && <p className="error" style={{ marginBottom: 20 }}>{err}</p>}

      {/* Tab 1: Submit Return Form */}
      {activeTab === 'Submit' && (
        <section className="panel" style={{ maxWidth: 840 }}>
          <div className="panel-title">
            <div>
              <h3 style={{ margin: 0 }}>Statutory Wage Return — Form A</h3>
              <small style={{ color: '#64748b' }}>Under Tamil Nadu Minimum Wages & Payment of Wages Rules</small>
            </div>
            <Badge value="PERIOD: OCT 2026" />
          </div>

          {/* Context Banner: Pre-filled from Establishment Profile */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '12px 16px', marginBottom: 20, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <b>Establishment:</b> {est?.establishmentName || 'Sakthi Textiles Pvt Ltd'} &bull; <b>Reg No:</b> {est?.registrationNumber || 'TN-1001'} &bull; <b>District:</b> {est?.districtId || est?.district || 'Chennai'}
            </div>
            <small style={{ color: '#2563eb' }}>✓ Details auto-filled from verified profile</small>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); setShowReviewModal(true); }}>
            {/* Field Group 1: Period & Workers */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#0f2d59', textTransform: 'uppercase', letterSpacing: '0.5px' }}>1. Reporting Period & Covered Workforce</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label>Compliance Reporting Period *
                  <input
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    required
                    placeholder="e.g. October 2026"
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
                <label>Total Workers Covered under Return *
                  <input
                    type="number"
                    min={1}
                    value={workers}
                    onChange={(e) => setWorkers(Number(e.target.value))}
                    required
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
              </div>
            </div>

            {/* Field Group 2: Minimum Wages & Disbursement */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#0f2d59', textTransform: 'uppercase', letterSpacing: '0.5px' }}>2. Statutory Wage Compliance & Mode of Disbursement</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                <label>Minimum Wage Compliance Declaration *
                  <select
                    value={minWageCompliant ? 'YES' : 'NO'}
                    onChange={(e) => setMinWageCompliant(e.target.value === 'YES')}
                    className="filter-select"
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    <option value="YES">YES — 100% Workers paid at or above notified statutory minimum wage</option>
                    <option value="NO">NO — Non-compliance or arrears pending</option>
                  </select>
                </label>
                <label>Primary Mode of Wage Disbursement *
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="filter-select"
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    <option value="Direct Bank Transfer (Electronic)">Direct Bank Transfer (Electronic / NEFT / RTGS)</option>
                    <option value="Account Payee Cheque">Account Payee Cheque</option>
                    <option value="Cash Disbursement">Cash Disbursement (Form C wage slips issued)</option>
                  </select>
                </label>
              </div>
              <label>Wage Disbursement Information Summary *
                <textarea
                  rows={2}
                  value={wagesInfo}
                  onChange={(e) => setWagesInfo(e.target.value)}
                  required
                  placeholder="Detail bank transfer dates, payment advice reference numbers..."
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            {/* Field Group 3: Overtime & Register Declarations */}
            <div style={{ marginBottom: 22 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#0f2d59', textTransform: 'uppercase', letterSpacing: '0.5px' }}>3. Overtime Compensation & Statutory Registers</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
                <label>Overtime Worked During Period *
                  <select
                    value={overtimeApplicable ? 'YES' : 'NO'}
                    onChange={(e) => setOvertimeApplicable(e.target.value === 'YES')}
                    className="filter-select"
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    <option value="YES">YES — Overtime worked and paid at statutory double-rate</option>
                    <option value="NO">NO — No overtime hours worked in this period</option>
                  </select>
                </label>
                <label>Biometric / Attendance Register Maintained *
                  <select
                    value={attendanceMaintained ? 'YES' : 'NO'}
                    onChange={(e) => setAttendanceMaintained(e.target.value === 'YES')}
                    className="filter-select"
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    <option value="YES">YES — Maintained up-to-date and available on premises</option>
                    <option value="NO">NO</option>
                  </select>
                </label>
              </div>
              {overtimeApplicable && (
                <label style={{ display: 'block', marginBottom: 12 }}>Overtime Disbursement Details
                  <textarea
                    rows={2}
                    value={otInfo}
                    onChange={(e) => setOtInfo(e.target.value)}
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
              )}
              <label>Additional Employer Remarks / Notes
                <input
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  style={{ width: '100%', marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={16} /> Review & Submit Return
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleFinalSubmit(true)} disabled={loading}>
                Save as Draft
              </button>
            </div>
          </form>

          {/* Review Confirmation Modal */}
          {showReviewModal && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: 620 }}>
                <div className="modal-header">
                  <h3 style={{ margin: 0 }}>Confirm Wage Return Submission</h3>
                  <button className="close-btn" onClick={() => setShowReviewModal(false)}><X size={20} /></button>
                </div>
                <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 18, fontSize: 13 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><b>Establishment:</b> {est?.establishmentName || 'Sakthi Textiles'}</div>
                    <div><b>Period:</b> {period}</div>
                    <div><b>Covered Workforce:</b> {workers} Workers</div>
                    <div><b>Minimum Wage:</b> <Badge value={minWageCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'} /></div>
                    <div><b>Payment Mode:</b> {paymentMode}</div>
                    <div><b>Overtime:</b> {overtimeApplicable ? 'Yes (Double-rate)' : 'None'}</div>
                    <div style={{ gridColumn: 'span 2' }}><b>Disbursement Summary:</b> {wagesInfo}</div>
                  </div>
                </div>

                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, marginBottom: 20, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={declaredConfirmation}
                    onChange={(e) => setDeclaredConfirmation(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>I solemnly declare that the statutory wage details and workforce statements provided above are true, complete, and in accordance with Tamil Nadu statutory labour laws.</span>
                </label>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!declaredConfirmation || loading}
                    onClick={() => handleFinalSubmit(false)}
                  >
                    {loading ? 'Submitting...' : 'Confirm & Submit to Officer'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowReviewModal(false)}>
                    Go Back & Edit
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Submission History */}
      {activeTab === 'History' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div>
              <h3 style={{ margin: 0 }}>Statutory Wage Returns Log</h3>
              <small style={{ color: '#64748b' }}>Complete audit trail of periodic compliance returns submitted by your establishment</small>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('Submit')}>
              + File New Return
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Return ID</th>
                  <th>Compliance Period</th>
                  <th>Submission Date</th>
                  <th>Covered Workers</th>
                  <th>Verification Review</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {submissions.length > 0 ? (
                  submissions.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.id}</b></td>
                      <td><b>{c.period || c.compliancePeriod}</b></td>
                      <td>{c.submissionDate ? new Date(c.submissionDate).toLocaleDateString() : (c.submittedAt ? new Date(c.submittedAt).toLocaleDateString() : '—')}</td>
                      <td>{c.workers || c.totalEmployees || 250} Workers</td>
                      <td><small>{c.reviewDate || 'Pending Officer Review'}</small></td>
                      <td><Badge value={c.status || c.submissionStatus || 'SUBMITTED'} /></td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setViewingSubmission(c)}
                        >
                          <Eye size={12} /> View Return
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                      No compliance returns submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Submission Details Modal */}
          {viewingSubmission && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: 650 }}>
                <div className="modal-header">
                  <div>
                    <h3 style={{ margin: 0 }}>Wage Return Details: {viewingSubmission.id}</h3>
                    <small style={{ color: '#64748b' }}>Period: {viewingSubmission.period || viewingSubmission.compliancePeriod}</small>
                  </div>
                  <button className="close-btn" onClick={() => setViewingSubmission(null)}><X size={20} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: '#f8fafc', padding: 18, borderRadius: 8, fontSize: 13.5, marginBottom: 20 }}>
                  <div><b>Return ID:</b> {viewingSubmission.id}</div>
                  <div><b>Filing Date:</b> {viewingSubmission.submissionDate || viewingSubmission.submittedAt?.slice(0, 10)}</div>
                  <div><b>Reporting Period:</b> {viewingSubmission.period || viewingSubmission.compliancePeriod}</div>
                  <div><b>Workforce Covered:</b> {viewingSubmission.workers || viewingSubmission.totalEmployees || 250} Employees</div>
                  <div><b>Minimum Wage Status:</b> <Badge value={viewingSubmission.minimumWageCompliant || 'YES'} /></div>
                  <div><b>Verification Status:</b> <Badge value={viewingSubmission.status || 'SUBMITTED'} /></div>
                  <div style={{ gridColumn: 'span 2' }}><b>Disbursement Statement:</b> <br />{viewingSubmission.wagePaymentInformation || 'Full statutory wage disbursement completed through bank transfer.'}</div>
                  <div style={{ gridColumn: 'span 2' }}><b>Overtime & Registers:</b> <br />{viewingSubmission.overtimeInformation || 'Overtime compensation distributed per statutory regulations.'}</div>
                  <div style={{ gridColumn: 'span 2' }}><b>Officer Review Date:</b> {viewingSubmission.reviewDate || 'Pending'}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setViewingSubmission(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Documents Repository */}
      {activeTab === 'Documents' && (
        <>
          <section className="panel" style={{ maxWidth: 840, marginBottom: 24 }}>
            <div className="panel-title">
              <div>
                <h3 style={{ margin: 0 }}>Upload Supporting Statutory Document</h3>
                <small style={{ color: '#64748b' }}>Attach wage registers, attendance sheets, or bank disbursement receipts</small>
              </div>
            </div>
            <form onSubmit={handleUploadDoc}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <label>Document Title *
                  <input
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    required
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
                <label>Document Category *
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="filter-select"
                    style={{ width: '100%', marginTop: 6 }}
                  >
                    <option value="Wage Register">Wage Register (Form B)</option>
                    <option value="Attendance Register">Attendance Register</option>
                    <option value="Bank Payment Advice">Bank Payment Disbursement Advice</option>
                    <option value="Registration Certificate">Registration Certificate</option>
                    <option value="Establishment Proof">Establishment / Premises Proof</option>
                    <option value="Authorization Letter">Employer Authorization Letter</option>
                  </select>
                </label>
              </div>

              <FileUploadBox
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                selectedFile={selectedUploadFile}
                onFileSelect={(file, dataUrl) => {
                  setSelectedUploadFile({ file, name: file.name, size: file.size, type: file.type, dataUrl });
                  setFileName(file.name);
                  if (!docName || docName.startsWith('Wage Register')) {
                    const clean = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
                    setDocName(clean.charAt(0).toUpperCase() + clean.slice(1));
                  }
                }}
                onClear={() => {
                  setSelectedUploadFile(null);
                  setFileName('');
                }}
                label="Select File from Device *"
                hint="Upload PDF, JPG, PNG or DOCX files up to 25MB"
              />

              <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Upload size={16} /> Upload Document for Verification
              </button>
            </form>
          </section>

          <section className="panel table-panel">
            <div className="panel-title">
              <h3 style={{ margin: 0 }}>Uploaded Statutory Documents</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Doc ID</th>
                    <th>Document Title</th>
                    <th>Category</th>
                    <th>File Name</th>
                    <th>Uploaded Date</th>
                    <th>Verification</th>
                    <th>Officer Remarks</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id}>
                      <td><b>{doc.id}</b></td>
                      <td><b>{doc.docName}</b></td>
                      <td>{doc.docType}</td>
                      <td><small>{doc.fileName}</small></td>
                      <td>{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : '—'}</td>
                      <td><Badge value={doc.verificationStatus || 'PENDING'} /></td>
                      <td><small>{doc.remarks || '—'}</small></td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setViewerDoc({ ...doc, establishmentName: est?.establishmentName || 'Sakthi Textiles' })}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
        </>
      )}

      {/* Tab 4: Wage Declarations (TWA stream) */}
      {activeTab === 'Declarations' && (
        <EmployerWageAssuranceModule subTab="Submit Declaration" />
      )}
    </>
  );
}

// ── 4. EMPLOYER INSPECTIONS & NOTICES MODULE ──────────────────────
function EmployerInspectionsNoticesModule({ subTab, onNavigate }: { subTab: string; onNavigate: (main: string, sub?: string) => void }) {
  const [activeTab, setActiveTab] = useState<'Inspections' | 'Notices' | 'Actions'>('Inspections');
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [inspFilter, setInspFilter] = useState<'Upcoming' | 'History'>('Upcoming');
  const [selectedInsp, setSelectedInsp] = useState<any | null>(null);

  // Notices & Explanations states
  const [notices, setNotices] = useState<any[]>([]);
  const [explanations, setExplanations] = useState<any[]>([]);
  const [respNoticeId, setRespNoticeId] = useState<string | null>(null);
  const [explanationText, setExplanationText] = useState('');
  const [expUploadFile, setExpUploadFile] = useState<{ name: string; size?: number; type?: string; dataUrl?: string } | null>(null);

  // Corrective Actions states
  const [actions, setActions] = useState<any[]>([]);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionNoticeId, setActionNoticeId] = useState('');
  const [actionViolationId, setActionViolationId] = useState('');
  const [actionDesc, setActionDesc] = useState('');
  const [actionUploadFile, setActionUploadFile] = useState<{ name: string; size?: number; type?: string; dataUrl?: string } | null>(null);

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (subTab === 'Statutory Notices' || subTab === 'Notices' || subTab === 'Explanations' || subTab === 'notices') {
      setActiveTab('Notices');
    } else if (subTab === 'Corrective Actions' || subTab === 'actions') {
      setActiveTab('Actions');
    } else {
      setActiveTab('Inspections');
    }
  }, [subTab]);

  const loadData = () => {
    api('/inspections').then((res) => {
      if (Array.isArray(res) && res.length) {
        const up = res.filter((i: any) => i.status !== 'COMPLETED');
        const hist = res.filter((i: any) => i.status === 'COMPLETED');
        setUpcoming(up.length ? up : EMPLOYER_UPCOMING_INSPECTIONS);
        setHistory(hist.length ? hist : EMPLOYER_INSPECTION_HISTORY);
      } else {
        setUpcoming(EMPLOYER_UPCOMING_INSPECTIONS);
        setHistory(EMPLOYER_INSPECTION_HISTORY);
      }
    }).catch(() => {
      setUpcoming(EMPLOYER_UPCOMING_INSPECTIONS);
      setHistory(EMPLOYER_INSPECTION_HISTORY);
    });

    api('/notices').then((res) => {
      setNotices(Array.isArray(res) && res.length ? res : EMPLOYER_NOTICES);
    }).catch(() => {
      setNotices(EMPLOYER_NOTICES);
    });

    api('/corrective-actions').then((res) => {
      setActions(Array.isArray(res) && res.length ? res : EMPLOYER_CORRECTIVE_ACTIONS);
    }).catch(() => {
      setActions(EMPLOYER_CORRECTIVE_ACTIONS);
    });

    setExplanations(EMPLOYER_EXPLANATIONS);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmitExplanation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respNoticeId) return;
    setLoading(true);
    setMsg('');
    setErr('');
    try {
      const evidencePayload = expUploadFile ? [{
        fileName: expUploadFile.name,
        fileData: expUploadFile.dataUrl,
        fileType: expUploadFile.type || 'application/pdf',
        uploadDate: new Date().toISOString().slice(0, 10),
      }] : [];

      await api('/notices/' + respNoticeId + '/response', {
        method: 'PATCH',
        body: JSON.stringify({ explanation: explanationText, evidence: evidencePayload }),
      }).catch(() => {});

      const newExp = {
        id: 'EXP-' + Date.now().toString().slice(-4),
        noticeId: respNoticeId,
        noticeNumber: notices.find((n) => n.id === respNoticeId)?.noticeNumber || respNoticeId,
        submittedDate: new Date().toISOString().slice(0, 10),
        explanationText,
        supportingDoc: expUploadFile?.name || 'receipt_proof.pdf',
        status: 'UNDER_REVIEW',
      };
      setExplanations([newExp, ...explanations]);
      setMsg('Formal notice explanation submitted successfully for Labour Officer review.');
      setRespNoticeId(null);
      setExplanationText('');
      setExpUploadFile(null);
      setLoading(false);
      loadData();
    } catch (x: any) {
      setLoading(false);
      setErr(x.message || 'Failed to submit explanation');
    }
  };

  const handleSubmitCorrectiveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    setErr('');
    try {
      const evidencePayload = actionUploadFile ? [{
        fileName: actionUploadFile.name,
        fileData: actionUploadFile.dataUrl,
        fileType: actionUploadFile.type || 'application/pdf',
        uploadDate: new Date().toISOString().slice(0, 10),
      }] : [];

      await api('/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({
          noticeId: actionNoticeId || notices[0]?.id,
          violationId: actionViolationId || 'Overtime Compliance Gap',
          description: actionDesc,
          evidence: evidencePayload,
        }),
      }).catch(() => {});

      const newCa = {
        id: 'CA-' + Date.now().toString().slice(-4),
        relatedViolation: actionViolationId || 'Overtime Compliance Gap',
        requiredAction: 'Rectify statutory wage discrepancy',
        employerResponse: actionDesc,
        proofDocument: actionUploadFile?.name || 'bank_transfer_advice.pdf',
        submittedDate: new Date().toISOString().slice(0, 10),
        status: 'UNDER_REVIEW',
      };
      setActions([newCa, ...actions]);
      setMsg('Corrective action response submitted successfully for Officer review.');
      setShowActionModal(false);
      setActionDesc('');
      setActionUploadFile(null);
      setLoading(false);
      loadData();
    } catch (x: any) {
      setLoading(false);
      setErr(x.message || 'Failed to submit corrective action');
    }
  };

  return (
    <>
      <Hero
        title="Field Inspections & Statutory Notices"
        text="Track field inspections, view officer scopes, respond to statutory show-cause notices, and submit corrective action evidence."
      />

      {/* Secondary Tab Bar */}
      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'Inspections' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Inspections'); onNavigate('Inspections & Notices', 'Inspections'); }}
        >
          <ClipboardCheck size={16} /> Inspections Log <span className="tab-badge">{upcoming.length + history.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Notices' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Notices'); onNavigate('Inspections & Notices', 'Statutory Notices'); }}
        >
          <AlertTriangle size={16} /> Statutory Notices <span className="tab-badge">{notices.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Actions' ? 'active' : ''}`}
          onClick={() => { setActiveTab('Actions'); onNavigate('Inspections & Notices', 'Corrective Actions'); }}
        >
          <CheckCircle2 size={16} /> Corrective Actions <span className="tab-badge">{actions.length}</span>
        </button>
      </div>

      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
      {err && <p className="error" style={{ marginBottom: 20 }}>{err}</p>}

      {/* Tab 1: Inspections */}
      {activeTab === 'Inspections' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                className={`btn btn-sm ${inspFilter === 'Upcoming' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setInspFilter('Upcoming')}
              >
                Scheduled Visits ({upcoming.length})
              </button>
              <button
                className={`btn btn-sm ${inspFilter === 'History' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setInspFilter('History')}
              >
                Inspection History ({history.length})
              </button>
            </div>
          </div>

          <div className="table-wrap">
            {inspFilter === 'Upcoming' ? (
              <table>
                <thead>
                  <tr>
                    <th>Inspection ID</th>
                    <th>Scheduled Date</th>
                    <th>Inspection Type</th>
                    <th>Assigned Inspector</th>
                    <th>Risk Category</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((u) => (
                    <tr key={u.id}>
                      <td><b>{u.id}</b></td>
                      <td><b>{u.inspectionDate || u.scheduledDate}</b></td>
                      <td><Badge value={u.inspectionType || 'Risk-Based'} /></td>
                      <td>{u.inspectorName || 'Inspector Meera'}</td>
                      <td><Badge value={u.riskLevel || 'HIGH'} /></td>
                      <td><Badge value={u.status} /></td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setSelectedInsp(u)}
                        >
                          <Eye size={12} /> View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!upcoming.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>No scheduled field inspections.</td></tr>}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Inspection ID</th>
                    <th>Inspection Date</th>
                    <th>Inspection Type</th>
                    <th>Inspector</th>
                    <th>Result Outcome</th>
                    <th>Follow-up Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td><b>{h.id}</b></td>
                      <td>{h.inspectionDate || h.scheduledDate}</td>
                      <td><Badge value={h.inspectionType || 'Routine'} /></td>
                      <td>{h.inspectorName || 'Inspector Meera'}</td>
                      <td><Badge value={h.result || 'COMPLETED'} /></td>
                      <td><Badge value={h.followUpStatus || 'CLOSED'} /></td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setSelectedInsp(h)}
                        >
                          <Eye size={12} /> View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Inspection Details Modal */}
          {selectedInsp && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: 660 }}>
                <div className="modal-header">
                  <div>
                    <h3 style={{ margin: 0 }}>Inspection Schedule & Checklist: {selectedInsp.id}</h3>
                    <small style={{ color: '#64748b' }}>Assigned by Tamil Nadu Labour Department</small>
                  </div>
                  <button className="close-btn" onClick={() => setSelectedInsp(null)}><X size={20} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: '#f8fafc', padding: 18, borderRadius: 8, fontSize: 13.5, marginBottom: 16 }}>
                  <div><b>Inspection ID:</b> {selectedInsp.id}</div>
                  <div><b>Inspection Type:</b> <Badge value={selectedInsp.inspectionType || 'Risk-Based'} /></div>
                  <div><b>Scheduled Date:</b> <b>{selectedInsp.inspectionDate || selectedInsp.scheduledDate}</b></div>
                  <div><b>Assigned Field Officer:</b> {selectedInsp.inspectorName || 'Inspector Meera'}</div>
                  <div><b>Risk Classification:</b> <Badge value={selectedInsp.riskLevel || 'HIGH'} /></div>
                  <div><b>Status:</b> <Badge value={selectedInsp.status} /></div>
                  {selectedInsp.instructions && (
                    <div style={{ gridColumn: 'span 2', background: '#eff6ff', padding: 12, borderRadius: 6, borderLeft: '4px solid #3b82f6' }}>
                      <b>Scope & Focus Instructions:</b> <br />
                      <span style={{ color: '#1e40af' }}>{selectedInsp.instructions}</span>
                    </div>
                  )}
                </div>

                <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: 14, borderRadius: 6, fontSize: 13, marginBottom: 20 }}>
                  <b style={{ color: '#92400e' }}>Statutory Readiness Checklist for Employer:</b>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: '#78350f' }}>
                    <li>Form B Register of Wages up to previous month.</li>
                    <li>Form D Register of Overtime and biometric attendance records.</li>
                    <li>Bank payment disbursement confirmation sheets.</li>
                    <li>Wage slips counterfoils issued to workers.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setSelectedInsp(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Statutory Notices & Explanations */}
      {activeTab === 'Notices' && (
        <>
          <section className="panel table-panel" style={{ marginBottom: 24 }}>
            <div className="panel-title">
              <div>
                <h3 style={{ margin: 0 }}>Received Statutory Notices</h3>
                <small style={{ color: '#64748b' }}>Show-cause notices and statutory requests issued by Labour Officers</small>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Notice Number</th>
                    <th>Issue Date</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Issue Description</th>
                    <th>Response Due</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {notices.map((n) => (
                    <tr key={n.id}>
                      <td><b>{n.noticeNumber || n.id}</b></td>
                      <td>{n.issueDate?.slice(0, 10)}</td>
                      <td>{n.category || 'Wage Compliance'}</td>
                      <td><Badge value={n.severity || 'HIGH'} /></td>
                      <td><small>{n.issue || n.description || 'Statutory compliance notice'}</small></td>
                      <td>
                        <span style={{ color: n.status === 'RESPONSE_REQUIRED' ? '#dc2626' : '#475569', fontWeight: 600 }}>
                          {n.responseDeadline?.slice(0, 10) || 'Immediate'}
                        </span>
                      </td>
                      <td><Badge value={n.status} /></td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 12 }}
                          onClick={() => {
                            setRespNoticeId(n.id);
                            setExplanationText(n.employerResponse || '');
                          }}
                        >
                          Submit Explanation
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Explanations Log */}
          <section className="panel table-panel">
            <div className="panel-title">
              <h3 style={{ margin: 0 }}>Submitted Explanations & Evidences</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Explanation ID</th>
                    <th>Notice Number</th>
                    <th>Submitted Date</th>
                    <th>Explanation Statement</th>
                    <th>Attached Proof</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {explanations.map((exp) => (
                    <tr key={exp.id}>
                      <td><b>{exp.id}</b></td>
                      <td><b>{exp.noticeNumber || exp.noticeId}</b></td>
                      <td>{exp.submittedDate}</td>
                      <td><small>{exp.explanationText || 'Under review'}</small></td>
                      <td><small style={{ color: '#2563eb' }}>{exp.supportingDoc || '—'}</small></td>
                      <td><Badge value={exp.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Notice Explanation Modal */}
          {respNoticeId && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: 640 }}>
                <div className="modal-header">
                  <div>
                    <h3 style={{ margin: 0 }}>Submit Formal Notice Explanation</h3>
                    <small style={{ color: '#64748b' }}>Notice Ref: {notices.find((n) => n.id === respNoticeId)?.noticeNumber || respNoticeId}</small>
                  </div>
                  <button className="close-btn" onClick={() => setRespNoticeId(null)}><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmitExplanation}>
                  <label style={{ display: 'block', marginBottom: 16 }}>
                    Formal Explanation Statement * (Min 5 characters)
                    <textarea
                      rows={4}
                      value={explanationText}
                      onChange={(e) => setExplanationText(e.target.value)}
                      required
                      placeholder="Detail compliance measures executed, payroll justifications, or disbursement rectifications..."
                      style={{ width: '100%', marginTop: 6 }}
                    />
                  </label>

                  <FileUploadBox
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    selectedFile={expUploadFile}
                    onFileSelect={(file, dataUrl) => {
                      setExpUploadFile({ name: file.name, size: file.size, type: file.type, dataUrl });
                    }}
                    onClear={() => setExpUploadFile(null)}
                    label="Attach Proof Document / Payment Receipt"
                    hint="Upload bank payment confirmation or revised attendance register (PDF, JPG, PNG)"
                  />

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Submitting...' : 'Submit Explanation to Officer'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setRespNoticeId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* Tab 3: Corrective Actions */}
      {activeTab === 'Actions' && (
        <>
          <section className="panel table-panel" style={{ marginBottom: 24 }}>
            <div className="panel-title">
              <div>
                <h3 style={{ margin: 0 }}>Statutory Corrective Actions Log</h3>
                <small style={{ color: '#64748b' }}>Fix statutory wage discrepancies and submit verification proofs</small>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowActionModal(true)}>
                + Submit Corrective Action
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Action ID</th>
                    <th>Related Issue</th>
                    <th>Required Corrective Measure</th>
                    <th>Employer Response</th>
                    <th>Proof Document</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((ca) => (
                    <tr key={ca.id}>
                      <td><b>{ca.id}</b></td>
                      <td><Badge value={ca.relatedViolation || 'Statutory Gap'} /></td>
                      <td><small>{ca.requiredAction || 'Rectify compliance deficiency'}</small></td>
                      <td><small>{ca.employerResponse || 'Pending response'}</small></td>
                      <td><small style={{ color: '#2563eb' }}>{ca.proofDocument || '—'}</small></td>
                      <td><Badge value={ca.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Officer Re-inspection Follow-up Card */}
          <section className="panel" style={{ maxWidth: 800 }}>
            <div className="panel-title">
              <div>
                <h3 style={{ margin: 0 }}>Officer Re-Inspection Follow-up Tracking</h3>
                <small style={{ color: '#64748b' }}>Post-corrective verification site visits</small>
              </div>
              <Badge value={EMPLOYER_FOLLOWUPS[0]?.status || 'PENDING'} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: '#f8fafc', padding: 16, borderRadius: 8, fontSize: 13.5 }}>
              <div><b>Follow-up Ref:</b> <b>{EMPLOYER_FOLLOWUPS[0]?.id || 'FU-2001'}</b></div>
              <div><b>Related Violation:</b> <Badge value={EMPLOYER_FOLLOWUPS[0]?.relatedViolation || 'VIO-1025'} /></div>
              <div><b>Scheduled Follow-up Date:</b> {EMPLOYER_FOLLOWUPS[0]?.scheduledDate || '2026-11-15'}</div>
              <div><b>Status:</b> <Badge value={EMPLOYER_FOLLOWUPS[0]?.status || 'PENDING'} /></div>
            </div>
          </section>

          {/* Corrective Action Submission Modal */}
          {showActionModal && (
            <div className="modal-overlay">
              <div className="modal-card" style={{ maxWidth: 640 }}>
                <div className="modal-header">
                  <div>
                    <h3 style={{ margin: 0 }}>Submit Corrective Action Response</h3>
                    <small style={{ color: '#64748b' }}>Submit evidence of statutory rectification</small>
                  </div>
                  <button className="close-btn" onClick={() => setShowActionModal(false)}><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmitCorrectiveAction}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <label>Select Issued Notice *
                      <select
                        value={actionNoticeId}
                        onChange={(e) => setActionNoticeId(e.target.value)}
                        className="filter-select"
                        style={{ width: '100%', marginTop: 6 }}
                      >
                        {notices.map((n) => (
                          <option key={n.id} value={n.id}>{n.noticeNumber || n.id}</option>
                        ))}
                      </select>
                    </label>
                    <label>Related Violation Category *
                      <input
                        value={actionViolationId || 'Overtime Allowance Discrepancy'}
                        onChange={(e) => setActionViolationId(e.target.value)}
                        style={{ width: '100%', marginTop: 6 }}
                      />
                    </label>
                  </div>

                  <label style={{ display: 'block', marginBottom: 16 }}>
                    Corrective Measure Executed *
                    <textarea
                      rows={3}
                      value={actionDesc}
                      onChange={(e) => setActionDesc(e.target.value)}
                      required
                      placeholder="Describe arrears disbursed, register updates synced..."
                      style={{ width: '100%', marginTop: 6 }}
                    />
                  </label>

                  <FileUploadBox
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    selectedFile={actionUploadFile}
                    onFileSelect={(file, dataUrl) => {
                      setActionUploadFile({ name: file.name, size: file.size, type: file.type, dataUrl });
                    }}
                    onClear={() => setActionUploadFile(null)}
                    label="Attach Proof of Rectification *"
                    hint="Upload bank statement or updated attendance register (PDF, JPG, PNG)"
                  />

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Submitting...' : 'Submit Corrective Action'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowActionModal(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── 5. EMPLOYER ACCOUNT & SUPPORT MODULE ───────────────────────────
function EmployerAccountSupportModule({ user, onUpdateUser, onLogout }: { user: UserType; onUpdateUser?: (u: UserType) => void; onLogout?: () => void }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '+91 98765 43210');
  const [designation, setDesignation] = useState((user as any).designation || 'Authorized Representative');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const updated = await api('/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, phone, designation }),
      });
      setMsg('Account credentials updated successfully!');
      if (onUpdateUser) onUpdateUser({ ...user, ...updated });
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      alert(err.message || 'Failed to update account');
    }
  };

  return (
    <>
      <Hero
        title="Employer Account & Labour Support"
        text="Manage authorized user credentials, account security settings, and access official Tamil Nadu Labour Department support channels."
      />

      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Account Profile & Edit Form */}
        <div>
          <section className="panel" style={{ marginBottom: 24 }}>
            <div className="panel-title">
              <h3 style={{ margin: 0 }}>Authorized User Profile</h3>
              <span className="badge green">Active Session</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, background: '#f8fafc', padding: 18, borderRadius: 8, fontSize: 13.5, marginBottom: 20 }}>
              <div><b>Account Name:</b> {user.name}</div>
              <div><b>Role:</b> {user.role.replace(/_/g, ' ')}</div>
              <div><b>Official Email:</b> {user.email}</div>
              <div><b>Linked Establishment:</b> {user.establishmentName || 'Sakthi Textiles'}</div>
              <div><b>Jurisdiction:</b> {user.districtId || 'Chennai'}</div>
              <div><b>Designation:</b> {designation}</div>
            </div>

            <h4 style={{ margin: '0 0 12px', color: '#0f2d59', fontSize: 14 }}>Update Contact Details</h4>
            <form onSubmit={handleUpdateProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <label>Full Name *
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
                <label>Designation *
                  <input
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    required
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label>Contact Phone
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    style={{ width: '100%', marginTop: 6 }}
                  />
                </label>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : 'Update Account Profile'}
              </button>
            </form>
          </section>

          {/* Session Security Box */}
          <section className="panel">
            <div className="panel-title">
              <h3 style={{ margin: 0 }}>Session & Security</h3>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
              Your session is authenticated via statutory JWT token. Always log out when completing submissions on shared or office devices.
            </p>
            {onLogout && (
              <button
                className="btn btn-secondary"
                onClick={onLogout}
                style={{ color: '#dc2626', borderColor: '#fca5a5', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <LogOut size={16} /> Sign Out of Portal
              </button>
            )}
          </section>
        </div>

        {/* Right Column: Official Tamil Nadu Labour Dept Support Directory */}
        <div>
          <section className="panel" style={{ background: '#ffffff' }}>
            <div className="panel-title">
              <h3 style={{ margin: 0, color: '#0f2d59' }}>Labour Department Helpdesk</h3>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#334155' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#eff6ff', padding: 8, borderRadius: 6, color: '#2563eb' }}><Building2 size={18} /></div>
                <div>
                  <b>Headquarters:</b><br />
                  Tamil Nadu Labour Commissionerate,<br />
                  DMS Complex, Anna Salai, Teynampet,<br />
                  Chennai, Tamil Nadu - 600006.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#f0fdf4', padding: 8, borderRadius: 6, color: '#16a34a' }}><Phone size={18} /></div>
                <div>
                  <b>Toll-Free Grievance Helpline:</b><br />
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#0f2d59' }}>1800-425-5801</span><br />
                  <small style={{ color: '#64748b' }}>Mon – Fri, 10:00 AM – 5:45 PM IST</small>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ background: '#faf5ff', padding: 8, borderRadius: 6, color: '#9333ea' }}><Mail size={18} /></div>
                <div>
                  <b>Official Support Email:</b><br />
                  <a href="mailto:labour-support@tn.gov.in" style={{ color: '#2563eb', textDecoration: 'none' }}>labour-support@tn.gov.in</a>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, marginTop: 16, borderLeft: '4px solid #0f2d59' }}>
                <b style={{ color: '#0f2d59' }}>Statutory Compliance Guidelines:</b>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#64748b' }}>
                  Under the Tamil Nadu Minimum Wages Act, 1948 and Payment of Wages Act, 1936, employers must file Form A returns monthly and maintain biometric or Form D registers.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}


function ProfileModule({ user, onUpdateUser }: { user: UserType; onUpdateUser?: (u: UserType) => void }) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [designation, setDesignation] = useState((user as any).designation || 'Compliance Manager');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user.role === 'LABOUR_OFFICER') {
      api('/audit-logs').then(setAuditLogs).catch(() => { });
    }
  }, [user.role]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const updated = await api('/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, phone, designation })
      });
      setMsg('Profile updated successfully!');
      if (onUpdateUser) onUpdateUser({ ...user, ...updated });
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      alert(err.message || 'Failed to update profile');
    }
  };

  return (
    <>
      <Hero title="User Profile & Account Settings" text="Manage your authorized compliance account profile and view administrative details." />

      <div className="grid" style={{ marginBottom: 24 }}>
        <article className="panel">
          <h3 style={{ color: '#0f2d59', marginBottom: 14 }}>Authenticated User Profile</h3>
          <form onSubmit={handleUpdateProfile}>
            {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 10, borderRadius: 6, marginBottom: 14 }}>{msg}</p>}

            <label style={{ display: 'block', marginBottom: 12 }}>Name
              <input value={name} onChange={e => setName(e.target.value)} required style={{ width: '100%', marginTop: 4 }} />
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>Email (Read Only)
              <input value={user.email} disabled style={{ width: '100%', marginTop: 4, background: '#f1f5f9' }} />
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>Role (Read Only)
              <input value={user.role.replace(/_/g, ' ')} disabled style={{ width: '100%', marginTop: 4, background: '#f1f5f9' }} />
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>Contact Phone
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" style={{ width: '100%', marginTop: 4 }} />
            </label>

            <label style={{ display: 'block', marginBottom: 16 }}>Designation
              <input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="e.g. HR Manager / Factory Compliance Officer" style={{ width: '100%', marginTop: 4 }} />
            </label>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Update Profile'}
            </button>
          </form>
        </article>
      </div>



      {user.role === 'EMPLOYER' && (
        <article className="panel" style={{ marginBottom: 24 }}>
          <h3 style={{ color: '#0f2d59', marginBottom: 14 }}>Employer Establishment Account Profile</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: '#f8fafc', padding: 18, borderRadius: 8, fontSize: 14 }}>
            <div><b>Account Name:</b> {user.name || EMPLOYER_ESTABLISHMENT_DATA.ownerName}</div>
            <div><b>Role:</b> {user.role}</div>
            <div><b>Registered Establishment:</b> {EMPLOYER_ESTABLISHMENT_DATA.establishmentName}</div>
            <div><b>Registration Number:</b> {EMPLOYER_ESTABLISHMENT_DATA.registrationNumber}</div>
            <div><b>Designation:</b> {EMPLOYER_ESTABLISHMENT_DATA.designation}</div>
            <div><b>District:</b> {EMPLOYER_ESTABLISHMENT_DATA.district}</div>
            <div><b>Email:</b> {user.email}</div>
            <div><b>Phone:</b> {EMPLOYER_ESTABLISHMENT_DATA.phone}</div>
            <div><b>Account Status:</b> <span className="badge green">Active</span></div>
          </div>
        </article>
      )}

      {user.role === 'LABOUR_INSPECTOR' && (
        <article className="panel" style={{ marginBottom: 24 }}>
          <h3 style={{ color: '#0f2d59', marginBottom: 14 }}>Labour Inspector Credentials & Field Jurisdiction</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: '#f8fafc', padding: 18, borderRadius: 8, fontSize: 14 }}>
            <div><b>Officer Name:</b> {user.name || INSPECTOR_PROFILE_DATA.name}</div>
            <div><b>Employee ID:</b> {INSPECTOR_PROFILE_DATA.employeeId}</div>
            <div><b>Designation:</b> {INSPECTOR_PROFILE_DATA.designation}</div>
            <div><b>Assigned District:</b> {user.districtId || INSPECTOR_PROFILE_DATA.district}</div>
            <div><b>Department:</b> {INSPECTOR_PROFILE_DATA.department}</div>
            <div><b>Official Email:</b> {user.email}</div>
            <div><b>Duty Status:</b> <span className="badge green">{INSPECTOR_PROFILE_DATA.status}</span></div>
            <div><b>Completed Inspections:</b> 0</div>
          </div>
        </article>
      )}

      {user.role === 'LABOUR_OFFICER' && (
        <section className="panel table-panel">
          <div className="panel-title">
            <h3>Administrative Audit Logs</h3>
            <p>System audit trail recording verification, inspection assignment, notices, and approvals</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td><b>{log.action}</b></td>
                    <td>{log.entityType}</td>
                    <td><small>{log.entityId}</small></td>
                    <td>{log.timestamp?.slice(0, 19).replace('T', ' ')}</td>
                  </tr>
                ))}
                {!auditLogs.length && <tr><td colSpan={4}>No audit logs recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

// ----------------------------------------------------
// MAIN APPLICATION CONTAINER
// ----------------------------------------------------
function App() {
  const [u, setU] = useState<UserType | null>(null);
  const [activeMain, setActiveMain] = useState<string>('Dashboard');
  const [activeSub, setActiveSub] = useState<string>('');
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [screen, setScreen] = useState<'login' | 'register'>('login');
  const [registerRole, setRegisterRole] = useState<AuthRole>('EMPLOYER');
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  const getNavFromHash = (role: Role) => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return { main: 'Dashboard', sub: '' };
    const parts = hash.split('/');
    if (role === 'EMPLOYER') {
      const sec = (parts[1] || parts[0] || '').toLowerCase();
      const sub = parts[2] ? decodeURIComponent(parts[2]) : '';
      if (sec === 'dashboard') return { main: 'Dashboard', sub: '' };
      if (sec === 'establishment') {
        return { main: 'Establishment Profile', sub: sub === 'edit' ? 'Update Information' : sub === 'status' ? 'Verification Progress' : 'Overview' };
      }
      if (sec === 'compliance') {
        return { main: 'Wage Compliance', sub: sub === 'history' ? 'Submission History' : sub === 'documents' || sub === 'docs' ? 'Documents' : sub === 'declarations' ? 'Wage Declarations' : 'Submit Return' };
      }
      if (sec === 'inspections' || sec === 'notices') {
        return { main: 'Inspections & Notices', sub: sub === 'notices' || sec === 'notices' ? 'Statutory Notices' : sub === 'actions' ? 'Corrective Actions' : 'Inspections' };
      }
      if (sec === 'account') return { main: 'Account & Support', sub: '' };
    }
    if (role === 'LABOUR_INSPECTOR') {
      const sec = (parts[1] || parts[0] || '').toLowerCase();
      const sub = parts[2] ? decodeURIComponent(parts[2]).toLowerCase() : '';
      if (sec === 'dashboard') return { main: 'Dashboard', sub: '' };
      if (sec === 'inspections') {
        return { main: 'My Inspections', sub: sub === 'upcoming' ? 'Upcoming' : sub === 'followup' || sub === 'follow-up' ? 'Follow-up' : 'Assigned' };
      }
      if (sec === 'reports') {
        return { main: 'Inspection Reports', sub: sub === 'submitted' ? 'Submitted Reports' : sub === 'history' ? 'Inspection History' : 'Draft Reports' };
      }
      if (sec === 'profile') return { main: 'Profile', sub: '' };
    }
    if (role === 'LABOUR_OFFICER') {
      const sec = (parts[1] || parts[0] || '').toLowerCase();
      const sub = parts[2] ? decodeURIComponent(parts[2]).toLowerCase() : '';
      if (sec === 'dashboard') return { main: 'Dashboard', sub: '' };
      if (sec === 'establishments') {
        return { main: 'Establishments', sub: sub === 'pending' ? 'Pending Registrations' : 'All Establishments' };
      }
      if (sec === 'compliance' || sec === 'risk') {
        return { main: 'Compliance & Risk', sub: sub === 'history' ? 'Compliance History' : 'Compliance Submissions' };
      }
      if (sec === 'inspections') {
        return { main: 'Inspections', sub: sub === 'assign' ? 'Assign Inspection' : 'Inspection Reports' };
      }
      if (sec === 'enforcement') {
        return {
          main: 'Enforcement',
          sub: sub === 'notices' ? 'Notices' : sub === 'actions' || sub === 'corrective' ? 'Corrective Actions' : sub === 'followup' || sub === 'follow-up' ? 'Follow-up' : 'Violations'
        };
      }
      if (sec === 'wage-assurance' || sec === 'assurance' || sec === 'twa') {
        return {
          main: 'Wage Assurance',
          sub: sub === 'evidence' || sub === 'import' ? 'Import Evidence' : sub === 'feedback' ? 'Feedback Summary' : 'TWA Assessments'
        };
      }
      if (sec === 'profile') return { main: 'Profile', sub: '' };
    }
    return { main: 'Dashboard', sub: '' };
  };

  // Restore session from stored JWT via /me on every page load
  useEffect(() => {
    const token = localStorage.getItem('tn_token');
    if (!token) { setAuthChecking(false); return; }
    api('/auth/me')
      .then((d: any) => {
        const userData = d.user ?? d;
        if (userData?.id && userData?.role) {
          setU(userData as UserType);
          const initialNav = getNavFromHash(userData.role);
          setActiveMain(initialNav.main);
          setActiveSub(initialNav.sub);
        } else {
          localStorage.removeItem('tn_token');
        }
      })
      .catch(() => {
        // Token invalid / expired — clear and show login
        localStorage.removeItem('tn_token');
      })
      .finally(() => setAuthChecking(false));
  }, []);

  // Listen to browser Back/Forward (popstate/hashchange)
  useEffect(() => {
    const handleHashChange = () => {
      if (u) {
        const nav = getNavFromHash(u.role);
        setActiveMain(nav.main);
        setActiveSub(nav.sub);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [u]);

  const handleSelectNav = (mainId: string, subId?: string) => {
    setActiveMain(mainId);
    setActiveSub(subId || '');
    if (u?.role === 'EMPLOYER') {
      let slug = 'dashboard';
      let subSlug = '';
      if (mainId === 'Establishment Profile' || mainId === 'My Establishment') {
        slug = 'establishment';
        subSlug = subId === 'Update Information' || subId === 'Registration' ? 'edit' : subId === 'Verification Progress' || subId === 'Registration Status' ? 'status' : 'overview';
      } else if (mainId === 'Wage Compliance' || mainId === 'Compliance') {
        slug = 'compliance';
        subSlug = subId === 'Submission History' || subId === 'Compliance History' ? 'history' : subId === 'Documents' ? 'documents' : subId === 'Wage Declarations' ? 'declarations' : 'new';
      } else if (mainId === 'Inspections & Notices' || mainId === 'Inspections' || mainId === 'Actions') {
        slug = 'inspections';
        subSlug = subId === 'Statutory Notices' || subId === 'Notices' ? 'notices' : subId === 'Corrective Actions' || subId === 'Explanations' ? 'actions' : 'inspections';
      } else if (mainId === 'Account & Support' || mainId === 'Profile') {
        slug = 'account';
      }
      const targetHash = `#employer/${slug}` + (subSlug ? `/${subSlug}` : '');
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
    if (u?.role === 'LABOUR_INSPECTOR') {
      let slug = 'dashboard';
      let subSlug = '';
      if (mainId === 'My Inspections') {
        slug = 'inspections';
        subSlug = subId === 'Upcoming' ? 'upcoming' : subId === 'Follow-up' ? 'followup' : 'assigned';
      } else if (mainId === 'Inspection Reports') {
        slug = 'reports';
        subSlug = subId === 'Submitted Reports' ? 'submitted' : subId === 'Inspection History' ? 'history' : 'drafts';
      } else if (mainId === 'Profile') {
        slug = 'profile';
      }
      const targetHash = `#inspector/${slug}` + (subSlug ? `/${subSlug}` : '');
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
    if (u?.role === 'LABOUR_OFFICER') {
      let slug = 'dashboard';
      let subSlug = '';
      if (mainId === 'Establishments') {
        slug = 'establishments';
        subSlug = subId === 'Pending Registrations' ? 'pending' : 'all';
      } else if (mainId === 'Compliance & Risk') {
        slug = 'compliance';
        subSlug = subId === 'Compliance History' ? 'history' : 'submissions';
      } else if (mainId === 'Inspections') {
        slug = 'inspections';
        subSlug = subId === 'Assign Inspection' ? 'assign' : 'reports';
      } else if (mainId === 'Enforcement') {
        slug = 'enforcement';
        subSlug = subId === 'Notices' ? 'notices' : subId === 'Corrective Actions' ? 'actions' : subId === 'Follow-up' ? 'followup' : 'violations';
      } else if (mainId === 'Wage Assurance') {
        slug = 'wage-assurance';
        subSlug = subId === 'Import Evidence' ? 'evidence' : subId === 'Feedback Summary' ? 'feedback' : 'assessments';
      } else if (mainId === 'Profile') {
        slug = 'profile';
      }
      const targetHash = `#officer/${slug}` + (subSlug ? `/${subSlug}` : '');
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  };

  // Show nothing while we check the stored token
  if (authChecking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f2d59', color: '#fff', fontSize: 16 }}>
        Verifying session…
      </div>
    );
  }

  if (!u) {
    if (screen === 'register') {
      return (
        <Register
          initialRole={registerRole}
          onBack={(role) => {
            if (role) setRegisterRole(role);
            setScreen('login');
          }}
        />
      );
    }
    return (
      <Login
        done={x => { setU(x); setActiveMain('Dashboard'); setActiveSub(''); }}
        onRegister={role => { setRegisterRole(role); setScreen('register'); }}
      />
    );
  }

  // Render view based on active role and active menu selection
  const renderContent = () => {
    if (activeMain === 'Dashboard') {
      if (u.role === 'LABOUR_OFFICER') return <OfficerDashboard />;
      if (u.role === 'LABOUR_INSPECTOR') return <InspectorDashboard onNavigate={handleSelectNav} />;
      return <EmployerDashboard onNavigate={handleSelectNav} />;
    }

    if (u.role === 'LABOUR_OFFICER') {
      switch (activeMain) {
        case 'Establishments':
          return <EstablishmentsModule subTab={activeSub || 'All Establishments'} onNavigate={handleSelectNav} />;
        case 'Compliance & Risk':
          return <ComplianceRiskModule subTab={activeSub || 'Compliance Submissions'} onNavigate={handleSelectNav} />;
        case 'Inspections':
          return <InspectionsModule subTab={activeSub || 'Inspection Reports'} onNavigate={handleSelectNav} />;
        case 'Enforcement':
          return <EnforcementModule subTab={activeSub || 'Violations'} onNavigate={handleSelectNav} />;
        case 'Wage Assurance':
          return <OfficerWageAssuranceModule subTab={activeSub || 'TWA Assessments'} onNavigate={handleSelectNav} />;
        case 'Profile':
          return <ProfileModule user={u} onUpdateUser={setU} />;
        default:
          return <OfficerDashboard />;
      }
    }

    if (u.role === 'LABOUR_INSPECTOR') {
      switch (activeMain) {
        case 'My Inspections':
          return <InspectorReportsModule mainSection="My Inspections" subTab={activeSub || 'Assigned'} onNavigate={handleSelectNav} />;
        case 'Inspection Reports':
          return <InspectorReportsModule mainSection="Inspection Reports" subTab={activeSub || 'Draft Reports'} onNavigate={handleSelectNav} />;
        case 'Profile':
          return <ProfileModule user={u} onUpdateUser={setU} />;
        default:
          return <InspectorDashboard onNavigate={handleSelectNav} />;
      }
    }

    if (u.role === 'EMPLOYER') {
      switch (activeMain) {
        case 'Establishment Profile':
        case 'My Establishment':
          return <EmployerEstablishmentModule subTab={activeSub || 'Overview'} onNavigate={handleSelectNav} />;
        case 'Wage Compliance':
        case 'Compliance':
        case 'Wage Assurance':
          return <EmployerComplianceModule subTab={activeSub || 'Submit Return'} onNavigate={handleSelectNav} />;
        case 'Inspections & Notices':
        case 'Inspections':
        case 'Actions':
          return <EmployerInspectionsNoticesModule subTab={activeSub || 'Inspections'} onNavigate={handleSelectNav} />;
        case 'Account & Support':
        case 'Profile':
          return <EmployerAccountSupportModule user={u} onUpdateUser={setU} onLogout={() => { localStorage.removeItem('tn_token'); setU(null); }} />;
        default:
          return <EmployerDashboard onNavigate={handleSelectNav} />;
      }
    }

    return <OfficerDashboard />;
  };

  return (
    <div className="app">
      <Sidebar
        user={u}
        activeMain={activeMain}
        activeSub={activeSub}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        onSelectNav={handleSelectNav}
        onLogout={() => {
          localStorage.removeItem('tn_token');
          setU(null);
        }}
      />
      <main className="content">
        <header>
          <div>
            <p className="crumb">Government of Tamil Nadu • Labour Department</p>
            <h1>{activeMain} {activeSub ? `› ${activeSub}` : ''}</h1>
          </div>
          <div className="header-right">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ffffff', padding: '6px 12px', borderRadius: 20, border: '1px solid #cbd5e1' }}>
              <Bell size={16} color="#0f2d59" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f2d59' }}>{u.role.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </header>
        {renderContent()}
      </main>
    </div>
  );
}


// ============================================================
// TRIANGULATED WAGE ASSURANCE — FRONTEND MODULES
// ============================================================

// ── Officer: Wage Assurance Module ──────────────────────────
function OfficerWageAssuranceModule({
  subTab = 'TWA Assessments',
  onNavigate
}: {
  subTab?: string;
  onNavigate?: (main: string, sub?: string) => void;
}) {
  const [activeTab, setActiveTab] = React.useState<string>(subTab || 'TWA Assessments');
  const [assessments, setAssessments] = React.useState<any[]>([]);
  const [selectedAssessment, setSelectedAssessment] = React.useState<any | null>(null);
  const [detail, setDetail] = React.useState<any | null>(null);
  const [reviewDecision, setReviewDecision] = React.useState('EXPLAINED');
  const [reviewComments, setReviewComments] = React.useState('');
  const [clarificationNote, setClarificationNote] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [viewerDoc, setViewerDoc] = React.useState<any | null>(null);
  const [activeRules, setActiveRules] = React.useState<any | null>(null);

  // Payment Evidence Import states
  const [estId, setEstId] = React.useState('');
  const [period, setPeriod] = React.useState('');
  const [csvText, setCsvText] = React.useState('');
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [establishments, setEstablishments] = React.useState<any[]>([]);

  // Feedback summary states
  const [fbEstId, setFbEstId] = React.useState('');
  const [fbPeriod, setFbPeriod] = React.useState('');
  const [fbSummary, setFbSummary] = React.useState<any | null>(null);

  React.useEffect(() => {
    if (subTab) setActiveTab(subTab);
  }, [subTab]);

  React.useEffect(() => {
    api('/twa/assessments').then(setAssessments).catch(() => {});
    api('/establishments').then(r => setEstablishments(r.items || [])).catch(() => {});
    api('/rules').then(setActiveRules).catch(() => {});
  }, [activeTab]);

  const loadDetail = async (id: string) => {
    const d = await api('/twa/assessments/' + id);
    setDetail(d);
    setSelectedAssessment(d.assessment);
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessment) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      await api('/twa/assessments/' + selectedAssessment._id + '/review', {
        method: 'PATCH',
        body: JSON.stringify({ decision: reviewDecision, comments: reviewComments, clarificationNote }),
      });
      setMsg('Review recorded successfully.');
      setSelectedAssessment(null); setDetail(null);
      api('/twa/assessments').then(setAssessments).catch(() => {});
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  const parseCSVRows = (csvStr: string) => {
    const lines = csvStr.trim().split('\n').filter(l => l.trim());
    if (!lines.length) return { records: [], columnsPresent: [] };
    const rawHeaders = lines[0].split(',').map(h => h.trim());
    const headerMap: Record<string, string> = {
      employeeid: 'employeeId', 'employee_id': 'employeeId', empid: 'employeeId',
      employeename: 'employeeName', 'employee_name': 'employeeName', name: 'employeeName',
      wages: 'wages', wage: 'wages', amount: 'wages',
      pfcontribution: 'pfContribution', 'pf_contribution': 'pfContribution', pf: 'pfContribution',
      esicontribution: 'esiContribution', 'esi_contribution': 'esiContribution', esi: 'esiContribution',
      paymentdate: 'paymentDate', 'payment_date': 'paymentDate', date: 'paymentDate',
      bankref: 'bankRef', 'bank_ref': 'bankRef', ref: 'bankRef',
      remarks: 'remarks',
    };
    const mappedHeaders = rawHeaders.map(h => headerMap[h.toLowerCase()] || h);
    const records = lines.slice(1).map(line => {
      const vals = line.split(',');
      const row: any = {};
      mappedHeaders.forEach((h, i) => {
        const val = vals[i] !== undefined ? vals[i].trim() : '';
        if (['wages', 'pfContribution', 'esiContribution'].includes(h)) {
          row[h] = isNaN(Number(val)) ? 0 : Number(val);
        } else {
          row[h] = val;
        }
      });
      return row;
    });
    return { records, columnsPresent: mappedHeaders };
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estId || !period) { setErr('Please select establishment and reporting period.'); return; }
    setLoading(true); setErr(''); setMsg('');
    try {
      const { records, columnsPresent } = parseCSVRows(csvText);
      if (!records.length) { setErr('No valid records found. Check CSV format.'); setLoading(false); return; }
      const res = await api('/payment-evidence/import', {
        method: 'POST',
        body: JSON.stringify({
          establishmentId: estId,
          reportingPeriod: period,
          originalFileName: csvFile?.name || 'imported_evidence.csv',
          columnsPresent,
          records
        }),
      });
      setMsg(`Imported ${records.length} records. ${res.validationErrors?.length || 0} error(s). Assessment updated.`);
      setCsvText('');
      setCsvFile(null);
      api('/twa/assessments').then(setAssessments).catch(() => {});
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  const handleFetchFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(''); setFbSummary(null);
    try {
      const res = await api('/worker-feedback/summary?establishmentId=' + fbEstId + '&reportingPeriod=' + fbPeriod);
      setFbSummary(res);
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  const handleGenerateAssessment = async (establishmentId: string, reportingPeriod: string) => {
    setLoading(true); setErr(''); setMsg('');
    try {
      await api('/twa/assessments/generate', { method: 'POST', body: JSON.stringify({ establishmentId, reportingPeriod }) });
      setMsg('Assessment generated/updated successfully.');
      api('/twa/assessments').then(setAssessments).catch(() => {});
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  // ── Assessment Detail Review View ────────────────────────
  if (selectedAssessment && detail && activeTab === 'TWA Assessments') {
    return (
      <>
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 16 }} onClick={() => { setSelectedAssessment(null); setDetail(null); }}>← Back to Assessments Queue</button>
        <Hero title="Triangulated Assessment Review" text="Review wage declaration, payment evidence, worker feedback and record your decision." />
        {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
        {err && <p className="error" style={{ marginBottom: 16 }}>{err}</p>}

        <div className="grid" style={{ marginBottom: 24 }}>
          {/* Assessment Summary */}
          <article className="panel">
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Assessment — {detail.establishment?.establishmentName || selectedAssessment.establishmentId}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#f8fafc', padding: 16, borderRadius: 8, fontSize: 14 }}>
              <div><b>Reporting Period:</b> {selectedAssessment.reportingPeriod}</div>
              <div><b>Status:</b> <Badge value={selectedAssessment.assessmentStatus} /></div>
              <div><b>Discrepancy Score:</b> <strong style={{ fontSize: 18 }}>{selectedAssessment.discrepancyScore}/100</strong></div>
              <div><b>Discrepancy Level:</b> <Badge value={selectedAssessment.discrepancyLevel} /></div>
              <div><b>Completeness:</b> <span style={{ fontSize: 12 }}>{selectedAssessment.completenessState}</span></div>
              <div><b>Generated:</b> {String(selectedAssessment.generatedAt || '').slice(0, 19).replace('T', ' ')}</div>
            </div>

            {/* Disclaimer */}
            <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', borderLeft: '4px solid #f59e0b', borderRadius: 4, fontSize: 12, color: '#92400e' }}>
              <b>Assessment Disclaimer:</b> This discrepancy score is a review-priority indicator, not a probability of wrongdoing or a legal determination. Human review is required before any enforcement action.
            </div>
          </article>
        </div>

        {/* Applied Rules */}
        {selectedAssessment.rules && selectedAssessment.rules.length > 0 && (
          <section className="panel table-panel" style={{ marginBottom: 24 }}>
            <div className="panel-title"><h3>Applied Discrepancy Rules</h3></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Rule</th><th>Passed</th><th>Severity</th><th>Declared</th><th>Evidence</th><th>Reason</th></tr></thead>
                <tbody>
                  {selectedAssessment.rules.map((r: any, i: number) => (
                    <tr key={i}>
                      <td><b>{r.ruleName}</b></td>
                      <td>{r.passed ? <span style={{ color: '#059669' }}>✓ Yes</span> : <span style={{ color: '#dc2626' }}>✗ No</span>}</td>
                      <td><Badge value={r.severity || 'NONE'} /></td>
                      <td>{r.declaredValue !== 0 ? r.declaredValue : '—'}</td>
                      <td>{r.evidenceValue !== 0 ? r.evidenceValue : '—'}</td>
                      <td><small>{r.reason}</small></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Wage Declaration Summary */}
        {detail.wageDeclaration && (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Employer Wage Declaration (Stream 1)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: '#f0fdf4', padding: 16, borderRadius: 8, fontSize: 14 }}>
              <div><b>Period:</b> {detail.wageDeclaration.reportingPeriod}</div>
              <div><b>Total Workers:</b> {detail.wageDeclaration.totalWorkers}</div>
              <div><b>Declared Wage Total:</b> ₹{detail.wageDeclaration.declaredWageTotal?.toLocaleString()}</div>
              <div><b>Payment Mode:</b> {detail.wageDeclaration.paymentMode || '—'}</div>
              <div><b>Payment Date:</b> {detail.wageDeclaration.paymentDate || '—'}</div>
              <div><b>Remarks:</b> {detail.wageDeclaration.remarks || '—'}</div>
              {detail.wageDeclaration.documents && detail.wageDeclaration.documents.length > 0 && (
                <div style={{ gridColumn: '1 / -1', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <b>Attached Wage Declaration Document(s):</b>
                  {detail.wageDeclaration.documents.map((doc: any, i: number) => (
                    <button
                      key={i}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setViewerDoc({
                        docName: doc.docName || 'Wage Declaration Sheet',
                        fileName: doc.fileName || doc.docName || 'wage_declaration.pdf',
                        category: 'Wage Declaration Sheet',
                        fileData: doc.fileData,
                        fileType: doc.fileType,
                        establishmentName: detail.establishment?.establishmentName,
                        uploadedAt: doc.uploadedAt || detail.wageDeclaration.createdAt,
                        remarks: `Period: ${detail.wageDeclaration.reportingPeriod}, Workers: ${detail.wageDeclaration.totalWorkers}, Declared: ₹${detail.wageDeclaration.declaredWageTotal?.toLocaleString()}`
                      })}
                      style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Eye size={12} /> {doc.fileName || 'View Wage Sheet'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Payment Evidence Summary */}
        {detail.paymentEvidence && (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Payment Evidence (Stream 2)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: '#eff6ff', padding: 16, borderRadius: 8, fontSize: 14 }}>
              <div><b>Evidence Workers:</b> {detail.paymentEvidence.totalWorkers}</div>
              <div><b>Evidence Wage Total:</b> ₹{detail.paymentEvidence.totalAmount?.toLocaleString()}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span><b>Imported File:</b> {detail.paymentEvidence.originalFileName}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setViewerDoc({
                    docName: 'Stream 2 Payment Evidence CSV Record',
                    fileName: detail.paymentEvidence.originalFileName || 'payment_evidence.csv',
                    category: 'Payment Evidence CSV',
                    establishmentName: detail.establishment?.establishmentName,
                    uploadedAt: detail.paymentEvidence.importedAt,
                    remarks: `Total Workers: ${detail.paymentEvidence.totalWorkers}, Total Amount: ₹${detail.paymentEvidence.totalAmount}`
                  })}
                  style={{ padding: '2px 8px', fontSize: 11 }}
                >
                  <Eye size={12} style={{ marginRight: 3 }} /> View File
                </button>
              </div>
              <div><b>Import Status:</b> <Badge value={detail.paymentEvidence.status} /></div>
              <div><b>Validation Errors:</b> {detail.paymentEvidence.validationErrors?.length || 0}</div>
            </div>
          </section>
        )}

        {/* Feedback Summary */}
        {detail.feedbackSummary && (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Aggregated Worker Feedback (Stream 3)</h3>
            {!detail.feedbackSummary.thresholdMet ? (
              <div style={{ padding: 14, background: '#fef9c3', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                Minimum response threshold not met ({detail.feedbackSummary.totalResponses} response(s)). Aggregate results are suppressed to protect privacy.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, background: '#fef3c7', padding: 16, borderRadius: 8, fontSize: 14 }}>
                <div><b>Total Responses:</b> {detail.feedbackSummary.totalResponses}</div>
                <div><b>On-Time Payment Rate:</b> {detail.feedbackSummary.onTimePaymentRate}%</div>
                <div><b>Correct Amount Rate:</b> {detail.feedbackSummary.correctAmountRate}%</div>
                <div><b>Complaint Rate:</b> {detail.feedbackSummary.complaintRate}%</div>
                <div><b>Top Complaint:</b> {detail.feedbackSummary.topComplaintCategory}</div>
              </div>
            )}
          </section>
        )}

        {/* Employer Clarification (if any) */}
        {selectedAssessment.employerClarification && (
          <section className="panel" style={{ marginBottom: 24 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 8 }}>Employer Clarification Response</h3>
            <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, fontSize: 13 }}>
              <b>{String(selectedAssessment.employerClarifiedAt || '').slice(0, 10)}:</b> {selectedAssessment.employerClarification}
            </div>
          </section>
        )}

        {/* Review Form */}
        {['INCOMPLETE','PENDING_REVIEW','CLARIFICATION_REQUESTED'].includes(selectedAssessment.assessmentStatus) && (
          <section className="panel" style={{ maxWidth: 650 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Record Review Decision</h3>
            <form onSubmit={handleReview}>
              <label style={{ display: 'block', marginBottom: 16 }}>Review Decision *
                <select value={reviewDecision} onChange={e => setReviewDecision(e.target.value)} className="filter-select" style={{ width: '100%', marginTop: 6 }}>
                  <option value="EXPLAINED">Explained — Discrepancy has been satisfactorily explained</option>
                  <option value="NOT_SUBSTANTIATED">Not Substantiated — Concern is not supported by available evidence</option>
                  <option value="CLARIFICATION_REQUESTED">Request Clarification — Employer must provide additional information</option>
                  <option value="REFERRED_FOR_INSPECTION">Refer for Inspection — Warrants authorized field inspection</option>
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>Review Comments * (min 5 characters)
                <textarea rows={4} value={reviewComments} onChange={e => setReviewComments(e.target.value)} required placeholder="Document your review findings, evidence examined, and rationale for the decision..." style={{ width: '100%', marginTop: 6 }} />
              </label>
              {reviewDecision === 'CLARIFICATION_REQUESTED' && (
                <label style={{ display: 'block', marginBottom: 16 }}>Clarification Request Note (sent to employer)
                  <textarea rows={3} value={clarificationNote} onChange={e => setClarificationNote(e.target.value)} placeholder="Specify what additional information or documents are required from the employer..." style={{ width: '100%', marginTop: 6 }} />
                </label>
              )}
              {err && <p className="error" style={{ marginBottom: 12 }}>{err}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Record Decision'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => { setSelectedAssessment(null); setDetail(null); }}>Cancel</button>
              </div>
            </form>
          </section>
        )}
        {/* Global Document Viewer Modal */}
        <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
      </>
    );
  }

  // ── Tabbed Module Main View ──────────────────────────────
  return (
    <>
      <Hero
        title={
          activeTab === 'Import Evidence'
            ? 'Import Payment & Contribution Evidence'
            : activeTab === 'Feedback Summary'
            ? 'Worker Feedback Summary'
            : 'Wage Assurance — Assessment Queue'
        }
        text={
          activeTab === 'Import Evidence'
            ? 'Upload simulated payment and statutory contribution CSV data. This forms Stream 2 of Triangulated Wage Assurance.'
            : activeTab === 'Feedback Summary'
            ? 'View aggregated worker feedback for a specific establishment and reporting period. Results suppressed if fewer than 5 responses.'
            : 'Review triangulated wage discrepancy assessments combining employer declarations, payment evidence, and worker feedback.'
        }
      />
      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
      {err && <p className="error" style={{ marginBottom: 16 }}>{err}</p>}

      {/* Secondary Tab Bar within page */}
      <div className="sub-nav-tabs">
        <button
          className={`sub-nav-tab ${activeTab === 'TWA Assessments' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('TWA Assessments');
            setSelectedAssessment(null);
            setDetail(null);
            onNavigate?.('Wage Assurance', 'TWA Assessments');
          }}
        >
          <ShieldCheck size={16} /> Assessments Queue <span className="tab-badge">{assessments.length}</span>
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Import Evidence' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Import Evidence');
            setSelectedAssessment(null);
            setDetail(null);
            onNavigate?.('Wage Assurance', 'Import Evidence');
          }}
        >
          <Upload size={16} /> Import Payment Evidence
        </button>
        <button
          className={`sub-nav-tab ${activeTab === 'Feedback Summary' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('Feedback Summary');
            setSelectedAssessment(null);
            setDetail(null);
            onNavigate?.('Wage Assurance', 'Feedback Summary');
          }}
        >
          <Users size={16} /> Worker Feedback Summary
        </button>
      </div>

      {/* TAB 1: TWA ASSESSMENTS QUEUE */}
      {activeTab === 'TWA Assessments' && (
        <>
          {/* Read-only Rules Configuration Panel */}
          {activeRules && (
            <section className="panel" style={{ marginBottom: 24 }}>
              <div className="panel-title">
                <div>
                  <h3 style={{ color: '#0f2d59' }}>Active Rules Configuration (v{activeRules.version})</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>Read-only active statutory thresholds, discrepancy bands, and risk weights</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, fontSize: 13 }}>
                  <h4 style={{ margin: '0 0 6px', color: '#0f2d59' }}>TWA Wage Discrepancy Bands</h4>
                  <div>Minor (5% - 15%): <b>+{activeRules.twa?.wageDiscrepancyBands?.minor?.score} pts</b></div>
                  <div>Moderate (15% - 30%): <b>+{activeRules.twa?.wageDiscrepancyBands?.moderate?.score} pts</b></div>
                  <div>Severe (&gt;30%): <b>+{activeRules.twa?.wageDiscrepancyBands?.severe?.score} pts</b></div>
                </div>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, fontSize: 13 }}>
                  <h4 style={{ margin: '0 0 6px', color: '#0f2d59' }}>TWA Worker Count Bands</h4>
                  <div>Minor (5% - 15%): <b>+{activeRules.twa?.workerCountDiscrepancyBands?.minor?.score} pts</b></div>
                  <div>Major (&gt;15%): <b>+{activeRules.twa?.workerCountDiscrepancyBands?.major?.score} pts</b></div>
                </div>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, fontSize: 13 }}>
                  <h4 style={{ margin: '0 0 6px', color: '#0f2d59' }}>Discrepancy Level Cut-offs</h4>
                  <div>Low: <b>{activeRules.twa?.levelBoundaries?.low?.min} - {activeRules.twa?.levelBoundaries?.low?.max}</b> | Medium: <b>{activeRules.twa?.levelBoundaries?.medium?.min} - {activeRules.twa?.levelBoundaries?.medium?.max}</b></div>
                  <div>High: <b>{activeRules.twa?.levelBoundaries?.high?.min} - {activeRules.twa?.levelBoundaries?.high?.max}</b> | Critical: <b>&ge; {activeRules.twa?.levelBoundaries?.critical?.min}</b></div>
                </div>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, fontSize: 13 }}>
                  <h4 style={{ margin: '0 0 6px', color: '#0f2d59' }}>Risk Engine Weights</h4>
                  <div>Overdue Inspection: <b>{activeRules.complianceRisk?.weights?.inspectionOverdue} pts</b></div>
                  <div>Severe Violation: <b>{activeRules.complianceRisk?.weights?.severeViolation} pts</b></div>
                  <div>Overtime Irregularity: <b>{activeRules.complianceRisk?.weights?.overtimeIrregularity} pts</b></div>
                </div>
              </div>
            </section>
          )}

          <div className="metrics" style={{ marginBottom: 24 }}>
            <Card name="Total Assessments" value={assessments.length} Icon={ShieldCheck} colorClass="blue" />
            <Card name="Pending Review" value={assessments.filter(a => a.assessmentStatus === 'PENDING_REVIEW').length} Icon={Clock} colorClass="orange" />
            <Card name="Clarification Requested" value={assessments.filter(a => a.assessmentStatus === 'CLARIFICATION_REQUESTED').length} Icon={AlertTriangle} colorClass="red" />
            <Card name="Referred for Inspection" value={assessments.filter(a => a.assessmentStatus === 'REFERRED_FOR_INSPECTION').length} Icon={ClipboardCheck} colorClass="red" />
          </div>

          <section className="panel table-panel">
            <div className="panel-title">
              <div><h3>Discrepancy Assessment Queue</h3><p>Explainable rule-based assessment results — human review required before any action</p></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Establishment</th><th>Period</th><th>Discrepancy Score</th><th>Level</th><th>Status</th><th>Generated</th><th>Actions</th></tr></thead>
                <tbody>
                  {assessments.map(a => (
                    <tr key={a._id || a.id}>
                      <td><b>{a.establishmentName}</b><br /><small>{a.industry}</small></td>
                      <td>{a.reportingPeriod}</td>
                      <td><strong style={{ fontSize: 16 }}>{a.discrepancyScore}/100</strong></td>
                      <td><Badge value={a.discrepancyLevel || 'NONE'} /></td>
                      <td><Badge value={a.assessmentStatus} /></td>
                      <td><small>{String(a.generatedAt || '').slice(0, 10)}</small></td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => loadDetail(a._id || a.id)}>Review</button>
                      </td>
                    </tr>
                  ))}
                  {!assessments.length && <tr><td colSpan={7}>No assessments found. Assessments are generated when wage declarations are submitted or evidence is imported.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" style={{ maxWidth: 500, marginTop: 24 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Manually Generate Assessment</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Trigger a fresh triangulated assessment for a specific establishment and reporting period.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select className="filter-select" value={estId} onChange={e => setEstId(e.target.value)} style={{ flex: 1 }}>
                <option value="">-- Select Establishment --</option>
                {establishments.map(e => <option key={e.id} value={e.id}>{e.establishmentName}</option>)}
              </select>
              <input placeholder="e.g. 2026-Q3" value={period} onChange={e => setPeriod(e.target.value)} style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
              <button className="btn btn-secondary" disabled={loading || !estId || !period} onClick={() => handleGenerateAssessment(estId, period)}>{loading ? '...' : 'Generate'}</button>
            </div>
          </section>
        </>
      )}

      {/* TAB 2: IMPORT PAYMENT EVIDENCE */}
      {activeTab === 'Import Evidence' && (
        <section className="panel" style={{ maxWidth: 750 }}>
          <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>CSV Evidence Import</h3>
          <div style={{ background: '#eff6ff', padding: 14, borderRadius: 8, fontSize: 13, marginBottom: 20, color: '#1e40af' }}>
            <b>Required CSV Format:</b> employeeId, employeeName, wages, pfContribution, esiContribution, paymentDate, bankRef<br />
            <i>Paste CSV content below or type rows. The first row must be the header.</i>
          </div>
          <form onSubmit={handleImport}>
            <label style={{ display: 'block', marginBottom: 16 }}>Establishment *
              <select value={estId} onChange={e => setEstId(e.target.value)} required className="filter-select" style={{ width: '100%', marginTop: 6 }}>
                <option value="">-- Select Establishment --</option>
                {establishments.map(e => <option key={e.id} value={e.id}>{e.establishmentName} ({e.registrationNumber})</option>)}
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 16 }}>Reporting Period * (e.g. 2026-Q3)
              <input value={period} onChange={e => setPeriod(e.target.value)} required placeholder="e.g. 2026-Q3" style={{ width: '100%', marginTop: 6, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
            </label>

            <FileUploadBox
              accept=".csv,text/csv"
              selectedFile={csvFile ? { name: csvFile.name, size: csvFile.size, type: 'text/csv' } : null}
              onFileSelect={(file) => {
                setCsvFile(file);
                const reader = new FileReader();
                reader.onload = (e) => {
                  setCsvText((e.target?.result as string) || '');
                };
                reader.readAsText(file);
              }}
              onClear={() => {
                setCsvFile(null);
                setCsvText('');
              }}
              label="Upload CSV File (Optional)"
              hint="Select or drag a .csv payment/EPFO contribution file to auto-populate the data table below"
            />

            <label style={{ display: 'block', marginBottom: 16 }}>CSV Data *
              <textarea rows={10} value={csvText} onChange={e => setCsvText(e.target.value)} required
                placeholder={"employeeId,employeeName,wages,pfContribution,esiContribution,paymentDate,bankRef\nEMP001,Ravi Kumar,18000,2160,765,2026-09-28,NEFT001\nEMP002,Suganya T,15500,1860,581,2026-09-28,NEFT002"}
                style={{ width: '100%', marginTop: 6, fontFamily: 'monospace', fontSize: 12 }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Importing...' : 'Import Evidence'}</button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 3: WORKER FEEDBACK SUMMARY */}
      {activeTab === 'Feedback Summary' && (
        <>
          <section className="panel" style={{ maxWidth: 600, marginBottom: 24 }}>
            <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Retrieve Feedback Aggregate</h3>
            <form onSubmit={handleFetchFeedback}>
              <label style={{ display: 'block', marginBottom: 16 }}>Establishment *
                <select value={fbEstId} onChange={e => setFbEstId(e.target.value)} required className="filter-select" style={{ width: '100%', marginTop: 6 }}>
                  <option value="">-- Select Establishment --</option>
                  {establishments.map(e => <option key={e.id} value={e.id}>{e.establishmentName}</option>)}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 16 }}>Reporting Period *
                <input value={fbPeriod} onChange={e => setFbPeriod(e.target.value)} required placeholder="e.g. 2026-Q3" style={{ width: '100%', marginTop: 6, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
              </label>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Loading...' : 'Get Feedback Summary'}</button>
            </form>
          </section>

          {fbSummary && (
            <section className="panel" style={{ maxWidth: 700 }}>
              <h3 style={{ color: '#0f2d59', marginBottom: 12 }}>Aggregated Feedback Results</h3>
              {fbSummary.suppressed || !fbSummary.thresholdMet ? (
                <div style={{ padding: 16, background: '#fef9c3', borderRadius: 8, fontSize: 14, color: '#92400e' }}>
                  <b>Results Suppressed:</b> {fbSummary.message || 'Minimum 5 responses required for worker anonymity.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#f0fdf4', padding: 16, borderRadius: 8, fontSize: 14 }}>
                  <div><b>Total Responses:</b> {fbSummary.total}</div>
                  <div><b>Threshold Met:</b> Yes (≥5)</div>
                  <div><b>On-Time Payment Rate:</b> {fbSummary.onTimePaymentRate}%</div>
                  <div><b>Correct Amount Rate:</b> {fbSummary.correctAmountRate}%</div>
                  <div><b>Complaint Rate:</b> {fbSummary.complaintRate}%</div>
                  <div><b>Top Complaint Category:</b> {fbSummary.topComplaintCategory}</div>
                </div>
              )}
              <div style={{ marginTop: 12, padding: 10, background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                <b>Note:</b> Aggregated feedback is supplementary information and is not independently verified proof of non-compliance. Officers should consider this alongside declarations and payment evidence.
              </div>
            </section>
          )}
        </>
      )}

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}

// ── Employer: Wage Assurance Module ─────────────────────────
function EmployerWageAssuranceModule({ subTab }: { subTab: string }) {
  const [declarations, setDeclarations] = React.useState<any[]>([]);
  const [assessments, setAssessments] = React.useState<any[]>([]);
  const [msg, setMsg] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [clarificationId, setClarificationId] = React.useState<string | null>(null);
  const [clarificationText, setClarificationText] = React.useState('');
  const [declarationFile, setDeclarationFile] = React.useState<{ name: string; size?: number; type?: string; dataUrl?: string } | null>(null);
  const [viewerDoc, setViewerDoc] = React.useState<any | null>(null);

  // Declaration form
  const [period, setPeriod] = React.useState('');
  const [totalWorkers, setTotalWorkers] = React.useState('');
  const [declaredWage, setDeclaredWage] = React.useState('');
  const [minWage, setMinWage] = React.useState('');
  const [paymentMode, setPaymentMode] = React.useState('BANK');
  const [paymentDate, setPaymentDate] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [submitStatus, setSubmitStatus] = React.useState<'DRAFT' | 'SUBMITTED'>('SUBMITTED');

  React.useEffect(() => {
    api('/wage-declarations').then(setDeclarations).catch(() => {});
    api('/employer/twa-assessments').then(setAssessments).catch(() => {});
  }, [subTab]);

  const handleSubmitDeclaration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!period || !totalWorkers || !declaredWage) { setErr('Period, total workers, and declared wage total are required.'); return; }
    setLoading(true); setErr(''); setMsg('');
    try {
      const documentsPayload = declarationFile ? [{
        docName: 'Wage Declaration Sheet',
        fileName: declarationFile.name,
        fileData: declarationFile.dataUrl,
        fileType: declarationFile.type || 'application/pdf',
        fileSize: declarationFile.size || 0,
        uploadedAt: new Date().toISOString()
      }] : [];

      await api('/wage-declarations', {
        method: 'POST',
        body: JSON.stringify({
          reportingPeriod: period, totalWorkers: Number(totalWorkers),
          declaredWageTotal: Number(declaredWage), minimumWage: minWage ? Number(minWage) : undefined,
          paymentMode, paymentDate, remarks, status: submitStatus,
          documents: documentsPayload,
        }),
      });
      setMsg(submitStatus === 'DRAFT' ? 'Wage declaration draft saved.' : 'Wage declaration submitted for officer review.');
      setDeclarationFile(null);
      api('/wage-declarations').then(setDeclarations).catch(() => {});
      if (submitStatus === 'SUBMITTED') { setPeriod(''); setTotalWorkers(''); setDeclaredWage(''); setRemarks(''); }
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  const handleClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarificationId) return;
    setLoading(true); setErr(''); setMsg('');
    try {
      await api('/twa/assessments/' + clarificationId + '/employer-response', {
        method: 'PATCH', body: JSON.stringify({ clarification: clarificationText }),
      });
      setMsg('Clarification submitted successfully for officer review.');
      setClarificationId(null); setClarificationText('');
      api('/employer/twa-assessments').then(setAssessments).catch(() => {});
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  if (subTab === 'Submit Declaration') {
    return (
      <>
        <Hero title="Submit Wage Declaration" text="Submit your formal wage declaration for a reporting period. This is the first stream of Triangulated Wage Assurance reviewed by Labour Officers." />
        {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
        {err && <p className="error" style={{ marginBottom: 16 }}>{err}</p>}
        <div style={{ padding: 12, background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af', marginBottom: 20 }}>
          <b>Information:</b> Your declaration will be reviewed alongside imported payment evidence and aggregated worker feedback. Assessments are for informational purposes only — they do not establish violations or penalties.
        </div>
        <section className="panel" style={{ maxWidth: 700 }}>
          <h3 style={{ color: '#0f2d59', marginBottom: 16 }}>Wage Declaration Form</h3>
          <form onSubmit={handleSubmitDeclaration}>
            <div className="reg-fields-grid">
              <div className="field-group">
                <label className="field-label">Reporting Period * <small style={{ color: '#64748b' }}>(e.g. 2026-Q3)</small></label>
                <input className="field-input" value={period} onChange={e => setPeriod(e.target.value)} required placeholder="2026-Q3" />
              </div>
              <div className="field-group">
                <label className="field-label">Total Workers Covered *</label>
                <input className="field-input" type="number" min="1" value={totalWorkers} onChange={e => setTotalWorkers(e.target.value)} required placeholder="e.g. 120" />
              </div>
              <div className="field-group">
                <label className="field-label">Declared Total Wage Amount (₹) *</label>
                <input className="field-input" type="number" min="0" value={declaredWage} onChange={e => setDeclaredWage(e.target.value)} required placeholder="e.g. 2160000" />
              </div>
              <div className="field-group">
                <label className="field-label">Minimum Wage Reference (₹/month)</label>
                <input className="field-input" type="number" min="0" value={minWage} onChange={e => setMinWage(e.target.value)} placeholder="e.g. 15000" />
              </div>
              <div className="field-group">
                <label className="field-label">Payment Mode</label>
                <select className="field-input" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="BANK">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="MIXED">Mixed</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Payment Date</label>
                <input className="field-input" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
              </div>
            </div>
            <div className="field-group" style={{ marginTop: 16 }}>
              <label className="field-label">Remarks / Additional Information</label>
              <textarea className="field-input" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any additional context for the reviewing officer..." style={{ width: '100%' }} />
            </div>

            <div style={{ marginTop: 16 }}>
              <FileUploadBox
                label="Attach Supporting Wage Register / Payroll Sheet (Optional)"
                accept=".pdf,.csv,.xlsx,.jpg,.jpeg,.png"
                selectedFile={declarationFile}
                onFileSelect={(file, dataUrl) => setDeclarationFile({ name: file.name, size: file.size, type: file.type, dataUrl })}
                onClear={() => setDeclarationFile(null)}
                hint="Attach verified Form-B wage registers, bank disbursement advice, or payroll summary (PDF, CSV, image, max 25MB)."
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button type="submit" className="btn btn-primary" disabled={loading} onClick={() => setSubmitStatus('SUBMITTED')}>{loading && submitStatus === 'SUBMITTED' ? 'Submitting...' : 'Submit Declaration'}</button>
              <button type="submit" className="btn btn-secondary" disabled={loading} onClick={() => setSubmitStatus('DRAFT')}>{loading && submitStatus === 'DRAFT' ? 'Saving...' : 'Save as Draft'}</button>
            </div>
          </form>
        </section>

        {/* Global Document Viewer Modal */}
        <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
      </>
    );
  }

  if (subTab === 'My Assessments') {
    return (
      <>
        <Hero title="My Wage Assurance Assessments" text="View triangulated assessment results for your establishment. Respond to clarification requests from Labour Officers." />
        {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
        {err && <p className="error" style={{ marginBottom: 16 }}>{err}</p>}

        <div style={{ padding: 12, background: '#fffbeb', borderRadius: 8, fontSize: 12, color: '#92400e', marginBottom: 20 }}>
          <b>Assessment Disclaimer:</b> Assessments are informational review tools. A discrepancy indicator does not automatically establish a violation or penalty. Officers review all findings before any determination is made.
        </div>

        <section className="panel table-panel">
          <div className="panel-title"><h3>My Assessments</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Period</th><th>Status</th><th>Score</th><th>Level</th><th>Clarification Needed</th><th>Evidence / Docs</th><th>Actions</th></tr></thead>
              <tbody>
                {assessments.map(a => (
                  <tr key={a._id || a.id}>
                    <td><b>{a.reportingPeriod}</b></td>
                    <td><Badge value={a.assessmentStatus} /></td>
                    <td><strong>{a.discrepancyScore}/100</strong></td>
                    <td><Badge value={a.discrepancyLevel || 'NONE'} /></td>
                    <td>{a.clarificationRequested ? <><span style={{ color: '#dc2626' }}>Yes — </span><small>{a.clarificationNote}</small></> : 'No'}</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setViewerDoc({
                          docName: `Assessment Report (${a.reportingPeriod})`,
                          fileName: `assessment_${a.reportingPeriod}.pdf`,
                          category: 'Wage Assurance Assessment',
                          uploadedAt: a.createdAt,
                          remarks: `Discrepancy Score: ${a.discrepancyScore}/100, Level: ${a.discrepancyLevel || 'NONE'}. Status: ${a.assessmentStatus}`
                        })}
                      >
                        <Eye size={12} /> View Details
                      </button>
                    </td>
                    <td>
                      {a.clarificationRequested && !a.employerClarification && (
                        <button className="btn btn-primary btn-sm" onClick={() => { setClarificationId(a._id || a.id); setClarificationText(''); }}>Respond</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!assessments.length && <tr><td colSpan={7}>No assessments yet. Submit a wage declaration to initiate an assessment.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {clarificationId && (
          <div className="modal-overlay">
            <div className="modal-card">
              <div className="modal-header">
                <h3>Submit Clarification Response</h3>
                <button className="close-btn" onClick={() => setClarificationId(null)}><X size={20} /></button>
              </div>
              <form onSubmit={handleClarification}>
                <label style={{ display: 'block', marginBottom: 16 }}>Clarification Statement * (min 10 characters)
                  <textarea rows={5} value={clarificationText} onChange={e => setClarificationText(e.target.value)} required placeholder="Provide a detailed explanation addressing the officer's clarification request..." style={{ width: '100%', marginTop: 6 }} />
                </label>
                {err && <p className="error" style={{ marginBottom: 12 }}>{err}</p>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Submitting...' : 'Submit Clarification'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setClarificationId(null)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Global Document Viewer Modal */}
        <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
      </>
    );
  }

  // Default: My Declarations
  return (
    <>
      <Hero title="My Wage Declarations" text="Track your submitted and draft wage declarations for each reporting period." />
      {msg && <p className="toast" style={{ background: '#059669', color: '#fff', padding: 12, borderRadius: 8, marginBottom: 20 }}>{msg}</p>}
      <section className="panel table-panel">
        <div className="panel-title">
          <div><h3>Wage Declaration History</h3></div>
          <button className="btn btn-primary btn-sm" onClick={() => api('/wage-declarations').then(setDeclarations).catch(() => {})}>Refresh</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Reporting Period</th><th>Total Workers</th><th>Declared Total (₹)</th><th>Payment Mode</th><th>Supporting Document</th><th>Status</th><th>Submitted At</th></tr></thead>
            <tbody>
              {declarations.map(d => (
                <tr key={d._id || d.id}>
                  <td><b>{d.reportingPeriod}</b></td>
                  <td>{d.totalWorkers}</td>
                  <td>₹{Number(d.declaredWageTotal || 0).toLocaleString()}</td>
                  <td>{d.paymentMode || '—'}</td>
                  <td>
                    {d.documents && d.documents.length > 0 ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setViewerDoc({
                          docName: d.documents[0].docName || 'Wage Declaration Document',
                          fileName: d.documents[0].fileName || 'wage_declaration.pdf',
                          category: 'Wage Declaration Document',
                          fileData: d.documents[0].fileData,
                          fileType: d.documents[0].fileType,
                          uploadedAt: d.documents[0].uploadedAt || d.createdAt,
                          remarks: `Period: ${d.reportingPeriod}, Workers: ${d.totalWorkers}, Total: ₹${Number(d.declaredWageTotal || 0).toLocaleString()}`
                        })}
                      >
                        <Eye size={12} /> {d.documents[0].fileName ? (d.documents[0].fileName.length > 18 ? d.documents[0].fileName.slice(0, 15) + '...' : d.documents[0].fileName) : 'View Document'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setViewerDoc({
                          docName: `Wage Return Form-B (${d.reportingPeriod})`,
                          fileName: `wage_register_${d.reportingPeriod.toLowerCase().replace(/[^a-z0-9]/g, '_')}.pdf`,
                          category: 'Wage Declaration Document',
                          uploadedAt: d.createdAt,
                          remarks: `Period: ${d.reportingPeriod}, Workers: ${d.totalWorkers}, Declared: ₹${Number(d.declaredWageTotal || 0).toLocaleString()}`
                        })}
                      >
                        <Eye size={12} /> Form-B Register
                      </button>
                    )}
                  </td>
                  <td><Badge value={d.status} /></td>
                  <td><small>{String(d.createdAt || '').slice(0, 10)}</small></td>
                </tr>
              ))}
              {!declarations.length && <tr><td colSpan={7}>No declarations submitted yet. Use "Submit Wage Declaration" to begin.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Global Document Viewer Modal */}
      <DocumentViewerModal document={viewerDoc} onClose={() => setViewerDoc(null)} />
    </>
  );
}

// ── Public Worker Feedback Form ──────────────────────────────
function PublicWorkerFeedbackForm() {
  const params = new URLSearchParams(window.location.search);
  const estIdFromUrl = params.get('establishmentId') || '';
  const periodFromUrl = params.get('reportingPeriod') || '';

  const [estInfo, setEstInfo] = React.useState<any | null>(null);
  const [estId, setEstId] = React.useState(estIdFromUrl);
  const [period, setPeriod] = React.useState(periodFromUrl);
  const [onTime, setOnTime] = React.useState<boolean | null>(null);
  const [correct, setCorrect] = React.useState<boolean | null>(null);
  const [hasComplaints, setHasComplaints] = React.useState<boolean | null>(null);
  const [category, setCategory] = React.useState('NONE');
  const [feedbackText, setFeedbackText] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (estId && period) {
      fetch('/api/public/worker-feedback-form?establishmentId=' + estId + '&reportingPeriod=' + period)
        .then(r => r.json()).then(d => { if (d.success) setEstInfo(d.data); }).catch(() => {});
    }
  }, [estId, period]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (onTime === null || correct === null || hasComplaints === null) { setErr('Please answer all required questions.'); return; }
    setLoading(true); setErr('');
    try {
      await fetch('/api/public/worker-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ establishmentId: estId, reportingPeriod: period, wageReceivedOnTime: onTime, wageAmountCorrect: correct, hasComplaints, complaintCategory: category, feedbackText }),
      }).then(r => r.json()).then(d => { if (!d.success) throw new Error(d.message); });
      setSubmitted(true);
      setMsg('Thank you for your feedback. Your response has been recorded anonymously.');
    } catch (x: any) { setErr(x.message); }
    finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#fff', padding: 40, borderRadius: 16, maxWidth: 480, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ color: '#059669', marginBottom: 8 }}>Feedback Recorded</h2>
          <p style={{ color: '#64748b', lineHeight: 1.6 }}>{msg}</p>
          <div style={{ marginTop: 20, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
            Your feedback is processed in aggregate form only. Individual responses are not shared publicly or with employers.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 20 }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ background: '#0f2d59', color: '#fff', padding: '20px 28px', borderRadius: '16px 16px 0 0', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>TN</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Tamil Nadu Labour Department</div>
          <h2 style={{ margin: '10px 0 4px', fontSize: 20 }}>Worker Wage Feedback</h2>
          {estInfo && <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>{estInfo.establishmentName} — {period}</p>}
        </div>
        <div style={{ background: '#fff', padding: 28, borderRadius: '0 0 16px 16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, fontSize: 12, color: '#166534', marginBottom: 20 }}>
            <b>Privacy:</b> Your feedback is anonymous. No personal information is required. Responses are shown only as group-level aggregates with a minimum of 5 responses.
          </div>

          {(!estId || !period) && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 12 }}>Establishment ID
                <input value={estId} onChange={e => setEstId(e.target.value)} placeholder="Provided in the QR code link" style={{ width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
              </label>
              <label style={{ display: 'block' }}>Reporting Period
                <input value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. 2026-Q3" style={{ width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
              </label>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {[
              { label: '1. Was your wage paid on time this period?', val: onTime, set: setOnTime },
              { label: '2. Was the wage amount correct?', val: correct, set: setCorrect },
              { label: '3. Do you have any wage-related concerns?', val: hasComplaints, set: setHasComplaints },
            ].map(({ label, val, set }) => (
              <div key={label} style={{ marginBottom: 20 }}>
                <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{label}</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[{ v: true, t: 'Yes' }, { v: false, t: 'No' }].map(({ v, t }) => (
                    <button key={t} type="button"
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: val === v ? '2px solid #0f2d59' : '1px solid #cbd5e1', background: val === v ? '#0f2d59' : '#fff', color: val === v ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => set(v)}>{t}</button>
                  ))}
                </div>
              </div>
            ))}

            {hasComplaints && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Complaint Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }}>
                    <option value="NONE">Select (optional)</option>
                    <option value="UNDERPAYMENT">Underpayment</option>
                    <option value="DELAY">Payment Delay</option>
                    <option value="DEDUCTIONS">Illegal Deductions</option>
                    <option value="OVERTIME">Overtime Not Paid</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Additional Comments (Optional, max 500 characters)</label>
                  <textarea rows={3} value={feedbackText} onChange={e => setFeedbackText(e.target.value)} maxLength={500} placeholder="Describe your concern briefly..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }} />
                </div>
              </>
            )}

            {err && <p style={{ color: '#dc2626', marginBottom: 12, fontSize: 14 }}>{err}</p>}
            <button type="submit" disabled={loading || !estId || !period} style={{ width: '100%', padding: '12px 0', background: '#0f2d59', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

