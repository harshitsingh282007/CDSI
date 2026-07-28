import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Download, AlertTriangle, ArrowUpDown, Search, Activity, HeartPulse, Brain,
  Pill, Send, Stethoscope, ChevronDown, ChevronUp, CheckCircle2,
  MessageSquare, AlertCircle, TrendingUp, TrendingDown, Minus,
  ClipboardList, ShieldAlert, ListChecks, FlaskConical, BarChart2
} from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { t } from '../translations';
import { useGetChatHistory, getGetChatHistoryQueryKey } from '@workspace/api-client-react';

// ── Type extensions ────────────────────────────────────────────────────────
interface FindingDetails {
  whatItMeasures?: string | null;
  whyImportant?: string | null;
  clinicalInterpretation?: string | null;
  possibleCauses?: string[];
  associatedSymptoms?: string[];
  potentialComplications?: string[];
  followUpInvestigations?: string[];
}

interface ExtendedFinding {
  findingText: string;
  confidence: number;
  sourceDocument?: string | null;
  sourcePage?: number | null;
  sourceValue?: string | null;
  reasoning?: string | null;
  category: 'confirmed' | 'possible' | 'differential' | 'recommendation';
  details?: FindingDetails | null;
}

interface RiskAssessment {
  level: 'low' | 'moderate' | 'high' | 'critical';
  reasoning: string;
  urgency: 'routine' | 'soon' | 'urgent' | 'emergency';
}

interface ExtendedReport {
  jobId: string;
  patientSummary: { name?: string | null; age?: number | null; sex?: string | null; dateOfAnalysis: string; analysisType: string };
  labParameters: Array<{ name: string; value: string; unit?: string | null; referenceRange?: string | null; status: string; interpretation?: string | null; panel?: string | null }>;
  prescriptions: Array<{ medicineName: string; dosage?: string | null; frequency?: string | null; duration?: string | null; timing?: string | null; specialInstructions?: string | null }>;
  findings: ExtendedFinding[];
  organSystems: Array<{ system: string; status: string; summary?: string | null }>;
  criticalValues: string[];
  psychiatricSummary?: { phq9Score?: number | null; phq9Interpretation?: string | null; gad7Score?: number | null; gad7Interpretation?: string | null; showMentalHealthBanner?: boolean; narrativeSummary?: string | null } | null;
  clinicalConclusion?: string | null;
  possibleConditions?: string[];
  riskAssessment?: RiskAssessment | null;
  nextSteps?: string[];
  hasError?: boolean;
  errorMessage?: string | null;
  disclaimer: string;
  createdAt: string;
}

type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

// ── Helpers ────────────────────────────────────────────────────────────────
function getStatusBadge(status: string) {
  switch (status) {
    case 'critical':   return 'bg-red-50 text-red-700 border-red-300';
    case 'high':       return 'bg-amber-50 text-amber-700 border-amber-300';
    case 'low':        return 'bg-blue-50 text-blue-700 border-blue-300';
    case 'borderline': return 'bg-orange-50 text-orange-700 border-orange-300';
    case 'normal':     return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    default:           return 'bg-gray-50 text-gray-600 border-gray-200';
  }
}

function getStatusCardBg(status: string) {
  switch (status) {
    case 'critical': return 'bg-red-50 border-red-200';
    case 'warning':  return 'bg-amber-50 border-amber-200';
    case 'normal':   return 'bg-emerald-50 border-emerald-200';
    default:         return 'bg-gray-50 border-gray-200';
  }
}

function getRiskColors(level: string) {
  switch (level) {
    case 'critical': return { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700', label: 'CRITICAL RISK', icon: 'text-white', gauge: '#dc2626', score: 95 };
    case 'high':     return { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600', label: 'HIGH RISK', icon: 'text-white', gauge: '#f97316', score: 75 };
    case 'moderate': return { bg: 'bg-amber-400', text: 'text-amber-900', border: 'border-amber-500', label: 'MODERATE RISK', icon: 'text-amber-900', gauge: '#f59e0b', score: 50 };
    case 'low':      return { bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-600', label: 'LOW RISK', icon: 'text-white', gauge: '#10b981', score: 20 };
    default:         return { bg: 'bg-gray-200', text: 'text-gray-700', border: 'border-gray-300', label: 'UNKNOWN', icon: 'text-gray-700', gauge: '#9ca3af', score: 0 };
  }
}

function getUrgencyBadge(urgency: string) {
  switch (urgency) {
    case 'emergency': return 'bg-red-100 text-red-700 border-red-300';
    case 'urgent':    return 'bg-orange-100 text-orange-700 border-orange-300';
    case 'soon':      return 'bg-amber-100 text-amber-700 border-amber-300';
    default:          return 'bg-emerald-100 text-emerald-700 border-emerald-300';
  }
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'high') return <TrendingUp className="w-3.5 h-3.5" />;
  if (status === 'low')  return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function LabDeviationBar({ status }: { status: string }) {
  const pct = status === 'critical' ? 100 : status === 'high' || status === 'low' ? 65 : status === 'borderline' ? 40 : 0;
  const color = status === 'critical' ? 'bg-red-500' : status === 'high' || status === 'low' ? 'bg-amber-400' : status === 'borderline' ? 'bg-orange-400' : 'bg-emerald-400';
  return (
    <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Risk Gauge Chart ───────────────────────────────────────────────────────
function RiskGaugeChart({ level, score, color }: { level: string; score: number; color: string }) {
  const gaugeData = [{ name: 'Risk', value: score, fill: color }];
  return (
    <div className="flex flex-col items-center justify-center">
      <ResponsiveContainer width={160} height={100}>
        <RadialBarChart
          cx="50%" cy="80%"
          innerRadius="60%" outerRadius="100%"
          startAngle={180} endAngle={0}
          data={gaugeData}
        >
          <RadialBar background={{ fill: '#f3f4f6' }} dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="mt-[-12px] text-center">
        <p className="text-2xl font-black" style={{ color }}>{score}%</p>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mt-0.5">{level}</p>
      </div>
    </div>
  );
}

// ── Lab Distribution Donut ─────────────────────────────────────────────────
const DONUT_COLORS: Record<string, string> = {
  normal: '#10b981', high: '#f59e0b', low: '#3b82f6', critical: '#ef4444', borderline: '#f97316', unknown: '#9ca3af'
};

function LabDonutChart({ labs }: { labs: Array<{ status: string }> }) {
  const counts: Record<string, number> = {};
  labs.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });
  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
  const total = labs.length;

  const renderLabel = ({ cx, cy }: { cx: number; cy: number }) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" className="fill-gray-900">
      <tspan x={cx} y={cy - 6} fontSize={22} fontWeight={800}>{total}</tspan>
      <tspan x={cx} y={cy + 14} fontSize={10} fill="#6b7280">tests</tspan>
    </text>
  );

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data} cx="50%" cy="50%"
          innerRadius={52} outerRadius={78}
          paddingAngle={2} dataKey="value"
          labelLine={false} label={renderLabel}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={DONUT_COLORS[entry.name] || '#9ca3af'} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [`${value} tests`, name.charAt(0).toUpperCase() + name.slice(1)]}
          contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Lab Panel Bar Chart ────────────────────────────────────────────────────
function LabPanelChart({ labs }: { labs: Array<{ panel?: string | null; status: string }> }) {
  const panels: Record<string, { normal: number; abnormal: number; critical: number }> = {};
  labs.forEach(l => {
    const panel = l.panel || 'Other';
    if (!panels[panel]) panels[panel] = { normal: 0, abnormal: 0, critical: 0 };
    if (l.status === 'critical') panels[panel].critical++;
    else if (l.status !== 'normal') panels[panel].abnormal++;
    else panels[panel].normal++;
  });
  const data = Object.entries(panels).map(([name, v]) => ({ name: name.length > 14 ? name.slice(0, 12) + '…' : name, ...v }));
  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Bar dataKey="normal" name="Normal" fill="#10b981" stackId="a" radius={[0, 0, 3, 3]} />
        <Bar dataKey="abnormal" name="Abnormal" fill="#f59e0b" stackId="a" />
        <Bar dataKey="critical" name="Critical" fill="#ef4444" stackId="a" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Confidence Bar Chart ───────────────────────────────────────────────────
function ConfidenceChart({ findings }: { findings: ExtendedFinding[] }) {
  if (findings.length === 0) return null;
  const data = findings.slice(0, 8).map(f => ({
    name: f.findingText.length > 28 ? f.findingText.slice(0, 26) + '…' : f.findingText,
    confidence: f.confidence,
    fill: f.confidence >= 80 ? '#10b981' : f.confidence >= 60 ? '#f59e0b' : '#9ca3af',
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.min(data.length * 36 + 20, 310)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
        <Tooltip formatter={(v: number) => [`${v}%`, 'Confidence']} contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
        <Bar dataKey="confidence" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Organ System Status Chart ──────────────────────────────────────────────
function OrganSystemChart({ systems }: { systems: Array<{ system: string; status: string }> }) {
  if (systems.length === 0) return null;
  const statusScore = (s: string) => s === 'critical' ? 100 : s === 'warning' ? 65 : s === 'borderline' ? 40 : 15;
  const statusColor = (s: string) => s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : s === 'borderline' ? '#f97316' : '#10b981';
  const data = systems.map(sys => ({
    name: sys.system.length > 14 ? sys.system.slice(0, 12) + '…' : sys.system,
    score: statusScore(sys.status),
    fill: statusColor(sys.status),
    status: sys.status,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
        <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}`} />
        <Tooltip
          formatter={(_: number, __: string, props: { payload?: { status?: string } }) => [props.payload?.status || '', 'Status']}
          contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
        />
        <Bar dataKey="score" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Expandable Finding Card ────────────────────────────────────────────────
function FindingCard({ finding }: { finding: ExtendedFinding }) {
  const [expanded, setExpanded] = useState(false);
  const d = finding.details;
  const hasDetails = d && (d.whatItMeasures || d.possibleCauses?.length || d.associatedSymptoms?.length);
  const confColor = finding.confidence >= 80 ? 'bg-emerald-500' : finding.confidence >= 60 ? 'bg-amber-400' : 'bg-gray-300';

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${finding.category === 'confirmed' ? 'border-emerald-200 bg-white' : 'border-gray-200 bg-white'}`}>
      <div className="p-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => hasDetails && setExpanded(e => !e)}>
        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${confColor}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 leading-snug">{finding.findingText}</p>
          {finding.sourceValue && <p className="text-xs text-gray-500 mt-1 font-mono">{finding.sourceValue}</p>}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
              <div className={`h-full rounded-full ${confColor}`} style={{ width: `${finding.confidence}%` }} />
            </div>
            <span className="text-xs text-gray-400 font-medium">{finding.confidence}% confidence</span>
          </div>
        </div>
        {hasDetails && (
          <button className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>
      {finding.reasoning && (
        <div className="px-4 pb-3">
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 leading-relaxed">{finding.reasoning}</p>
        </div>
      )}
      {expanded && d && (
        <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white p-4 flex flex-col gap-4">
          {d.whatItMeasures && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">What this measures</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{d.whatItMeasures}</p>
            </div>
          )}
          {d.whyImportant && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Clinical significance</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{d.whyImportant}</p>
            </div>
          )}
          {d.clinicalInterpretation && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Interpretation</h4>
              <p className="text-sm text-gray-700 leading-relaxed">{d.clinicalInterpretation}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {d.possibleCauses && d.possibleCauses.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-2">Possible causes</h4>
                <ul className="space-y-1">
                  {d.possibleCauses.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                      <span className="text-amber-500 mt-0.5 flex-shrink-0">•</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.associatedSymptoms && d.associatedSymptoms.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">Associated symptoms</h4>
                <ul className="space-y-1">
                  {d.associatedSymptoms.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                      <span className="text-blue-400 mt-0.5 flex-shrink-0">•</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.potentialComplications && d.potentialComplications.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-2">Complications if untreated</h4>
                <ul className="space-y-1">
                  {d.potentialComplications.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                      <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.followUpInvestigations && d.followUpInvestigations.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-2">Recommended investigations</h4>
                <ul className="space-y-1">
                  {d.followUpInvestigations.map((inv, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />{inv}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Report ────────────────────────────────────────────────────────────
export default function Report() {
  const { report: rawReport, jobId, language, sessionId } = useCDSI();
  const [, setLocation] = useLocation();
  const report = rawReport as unknown as ExtendedReport | null;

  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [labSearch, setLabSearch] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: chatHistory } = useGetChatHistory(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetChatHistoryQueryKey(sessionId) }
  });

  useEffect(() => { if (!report) setLocation('/'); }, [report, setLocation]);
  useEffect(() => {
    if (chatHistory?.messages) {
      setMessages(chatHistory.messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })));
    }
  }, [chatHistory]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  if (!report) return null;

  const downloadPdf = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const res = await fetch(`${apiUrl}/api/export-report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, report }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `CDSI_Report_${report.patientSummary.name || 'Patient'}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch (err) { console.error('PDF export failed', err); }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => (!prev || prev.key !== key) ? { key, direction: 'asc' } : prev.direction === 'asc' ? { key, direction: 'desc' } : null);
  };

  const filteredLabs = report.labParameters
    .filter(l => l.name.toLowerCase().includes(labSearch.toLowerCase()) || (l.panel?.toLowerCase().includes(labSearch.toLowerCase())))
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const aVal = (a as Record<string, unknown>)[sortConfig.key] ?? '';
      const bVal = (b as Record<string, unknown>)[sortConfig.key] ?? '';
      return String(aVal) < String(bVal) ? (sortConfig.direction === 'asc' ? -1 : 1) : String(aVal) > String(bVal) ? (sortConfig.direction === 'asc' ? 1 : -1) : 0;
    });

  const confirmedFindings = report.findings.filter(f => f.category === 'confirmed');
  const possibleDifferentials = report.findings.filter(f => f.category === 'possible' || f.category === 'differential');
  const recommendations = report.findings.filter(f => f.category === 'recommendation');

  const abnormalCount = report.labParameters.filter(l => l.status !== 'normal').length;
  const criticalCount = report.labParameters.filter(l => l.status === 'critical').length;
  const normalCount = report.labParameters.filter(l => l.status === 'normal').length;

  const riskColors = report.riskAssessment ? getRiskColors(report.riskAssessment.level) : null;

  const sendMessage = async () => {
    if (!chatInput.trim() || !jobId) return;
    const msg = chatInput.trim();
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setIsStreaming(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, jobId, message: msg, language }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = ''; let buffer = ''; let finished = false;
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6)) as { token?: string; done?: boolean; error?: string };
                if (data.error) { finished = true; break; }
                if (data.token) {
                  aiResponse += data.token;
                  setMessages(prev => { const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], content: aiResponse }; return n; });
                }
                if (data.done) { finished = true; break; }
              } catch { /* partial */ }
            }
          }
          if (finished) break;
        }
      }
    } catch (err) { console.error('Chat error', err); }
    finally { setIsStreaming(false); }
  };

  return (
    <div className="w-full flex flex-col gap-6 pb-24">

      {/* ── Critical Alert Banner ── */}
      {report.criticalValues.length > 0 && (
        <div className="bg-red-600 text-white px-5 py-4 rounded-xl flex items-start gap-3 shadow">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">⚠ {report.criticalValues.length} {t('criticalAlerts', language)} Detected</p>
            <p className="text-sm mt-1 text-red-100">{report.criticalValues.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* ── Error Banner ── */}
      {report.hasError && (
        <div className="bg-red-50 text-red-700 px-5 py-4 rounded-xl flex items-start gap-3 shadow border border-red-200">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Pipeline Error</p>
            <p className="text-sm mt-1 text-red-600 font-mono break-all">{report.errorMessage || 'An unknown error occurred during AI processing.'}</p>
          </div>
        </div>
      )}

      {/* ── Psychiatric Banner ── */}
      {report.psychiatricSummary?.showMentalHealthBanner && (
        <div className="bg-violet-600 text-white px-5 py-4 rounded-xl flex items-center gap-3 shadow">
          <Brain className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">Psychiatric scores indicate moderate-to-severe symptoms - please consult a mental health professional.</p>
        </div>
      )}

      {/* ── Patient Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{report.patientSummary.name || 'Anonymous Patient'}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-gray-500 text-sm">
            {report.patientSummary.age && <span>{report.patientSummary.age} years</span>}
            {report.patientSummary.sex && <><span>·</span><span>{report.patientSummary.sex}</span></>}
            <span>·</span>
            <span>{new Date(report.patientSummary.dateOfAnalysis).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 border border-gray-200">
              {report.patientSummary.analysisType}
            </span>
          </div>
          <p className="text-xs italic text-gray-400 mt-2">AI-generated decision support only. Always verify with a licensed physician.</p>
        </div>
        <button onClick={downloadPdf}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors shadow-sm whitespace-nowrap flex-shrink-0">
          <Download className="w-4 h-4" />{t('downloadPdf', language)}
        </button>
      </div>

      {/* ── Overview Stat Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('totalLabs', language)}</p>
          <p className="text-3xl font-bold text-gray-900">{report.labParameters.length}</p>
          <p className="text-xs text-gray-500">{normalCount} {t('normalLabel', language).toLowerCase()}</p>
        </div>
        <div className={`rounded-xl p-4 flex flex-col gap-1 shadow-sm border ${abnormalCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('abnormal', language)}</p>
          <p className={`text-3xl font-bold ${abnormalCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{abnormalCount}</p>
          <p className="text-xs text-gray-500">of {report.labParameters.length} tests</p>
        </div>
        <div className={`rounded-xl p-4 flex flex-col gap-1 shadow-sm border ${criticalCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('critical', language)}</p>
          <p className={`text-3xl font-bold ${criticalCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{criticalCount}</p>
          <p className="text-xs text-gray-500">values flagged</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('totalFindings', language)}</p>
          <p className="text-3xl font-bold text-gray-900">{report.findings.length}</p>
          <p className="text-xs text-gray-500">{confirmedFindings.length} confirmed</p>
        </div>
      </div>

      {/* ── Deep Analytics Dashboard ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Risk Gauge */}
        {report.riskAssessment && riskColors && (
          <div className={`${riskColors.bg} rounded-2xl p-5 shadow flex flex-col items-center justify-between gap-2`}>
            <p className={`text-xs font-semibold uppercase tracking-widest ${riskColors.text} opacity-80 self-start`}>
              {t('riskAssessment', language)}
            </p>
            <RiskGaugeChart level={riskColors.label} score={riskColors.score} color="white" />
            <div className="w-full">
              <p className={`text-sm leading-relaxed ${riskColors.text} opacity-90 text-center line-clamp-3`}>
                {report.riskAssessment.reasoning}
              </p>
              <div className="mt-2 flex justify-center">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wide ${getUrgencyBadge(report.riskAssessment.urgency)}`}>
                  {report.riskAssessment.urgency === 'routine' ? '🟢' : report.riskAssessment.urgency === 'soon' ? '🟡' : report.riskAssessment.urgency === 'urgent' ? '🟠' : '🔴'}
                  {' '}{report.riskAssessment.urgency} follow-up
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Lab Donut */}
        {report.labParameters.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('labDistribution', language)}</p>
            <LabDonutChart labs={report.labParameters} />
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
              {Object.entries(DONUT_COLORS).filter(([k]) => report.labParameters.some(l => l.status === k)).map(([k, col]) => (
                <span key={k} className="flex items-center gap-1 text-xs text-gray-600 capitalize">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: col }} />{k}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Organ System Chart */}
        {report.organSystems.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('organSystems', language)}</p>
            <OrganSystemChart systems={report.organSystems} />
            <div className="flex gap-3 justify-center mt-1">
              {[['#10b981', 'Normal'], ['#f59e0b', 'Warning'], ['#ef4444', 'Critical']].map(([col, lbl]) => (
                <span key={lbl} className="flex items-center gap-1 text-xs text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: col }} />{lbl}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Lab Panel Distribution Chart ── */}
      {report.labParameters.some(l => l.panel) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />{t('labResults', language)} by Panel
          </h2>
          <LabPanelChart labs={report.labParameters} />
        </div>
      )}

      {/* ── Findings Confidence Chart ── */}
      {confirmedFindings.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />Finding Confidence Scores
          </h2>
          <ConfidenceChart findings={confirmedFindings} />
        </div>
      )}

      {/* ── Clinical Conclusion ── */}
      {report.clinicalConclusion && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Stethoscope className="w-5 h-5 text-emerald-600" />{t('clinicalConclusion', language)}
          </h2>
          <p className="text-gray-700 leading-relaxed text-sm">{report.clinicalConclusion}</p>
        </div>
      )}

      {/* ── Possible Conditions ── */}
      {report.possibleConditions && report.possibleConditions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-gray-500" />{t('possibleConditions', language)}
          </h2>
          <div className="flex flex-wrap gap-2">
            {report.possibleConditions.map((cond, i) => (
              <span key={i} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 shadow-sm">
                {cond}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 italic">These are AI-generated possibilities, not confirmed diagnoses. Clinical evaluation is required.</p>
        </div>
      )}

      {/* ── Organ System Cards ── */}
      {report.organSystems.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-500" />{t('organSystems', language)}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {report.organSystems.map(sys => (
              <div key={sys.system} className={`p-4 rounded-xl border flex flex-col gap-2 ${getStatusCardBg(sys.status)} shadow-sm`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-sm">{sys.system}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase border ${getStatusBadge(sys.status)}`}>{sys.status}</span>
                </div>
                {sys.summary && <p className="text-xs text-gray-600 leading-relaxed">{sys.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Confirmed Findings ── */}
      {confirmedFindings.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-emerald-600" />{t('confirmedFindings', language)}
            <span className="ml-auto text-xs font-normal text-gray-400">Click any finding to expand details</span>
          </h2>
          <div className="flex flex-col gap-2">
            {confirmedFindings.map((f, i) => <FindingCard key={i} finding={f} />)}
          </div>
        </div>
      )}

      {/* ── Differentials ── */}
      {possibleDifferentials.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />{t('possibleDifferentials', language)}
          </h2>
          <div className="flex flex-col gap-2">
            {possibleDifferentials.map((f, i) => <FindingCard key={i} finding={f} />)}
          </div>
        </div>
      )}

      {/* ── Recommendations ── */}
      {recommendations.length > 0 && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-700 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />{t('recommendations', language)}
          </h2>
          <ul className="space-y-2">
            {recommendations.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />{f.findingText}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Lab Results Table ── */}
      {report.labParameters.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-gray-500" />{t('labResults', language)}
            </h2>
            <div className="relative w-full md:w-60">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder={t('searchLabs', language)}
                value={labSearch} onChange={e => setLabSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider font-semibold text-gray-500">
                  <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                    <div className="flex items-center gap-1">Parameter <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Deviation</th>
                  <th className="px-4 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLabs.map((lab, i) => (
                  <tr key={i} className={`hover:bg-gray-50 transition-colors ${lab.status === 'critical' ? 'bg-red-50' : (lab.status === 'high' || lab.status === 'low') ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 text-sm">{lab.name}</p>
                      {lab.panel && <p className="text-xs text-gray-400 mt-0.5">{lab.panel}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={lab.status} />
                        <span className="font-mono font-semibold text-gray-900">{lab.value}</span>
                        <span className="text-xs text-gray-400">{lab.unit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{lab.referenceRange || '—'}</td>
                    <td className="px-4 py-3"><LabDeviationBar status={lab.status} /></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border uppercase tracking-wide ${getStatusBadge(lab.status)}`}>
                        {lab.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredLabs.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No results match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {report.labParameters.filter(l => l.interpretation).length > 0 && (
            <p className="text-xs text-gray-400">Interpretation notes available for {report.labParameters.filter(l => l.interpretation).length} parameters.</p>
          )}
        </div>
      )}

      {/* ── Next Steps ── */}
      {report.nextSteps && report.nextSteps.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-blue-500" />{t('nextSteps', language)}
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-sm">
            <ol className="space-y-2">
              {report.nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* ── Prescriptions ── */}
      {report.prescriptions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Pill className="w-5 h-5 text-gray-500" />{t('prescriptions', language)}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.prescriptions.map((med, i) => (
              <div key={i} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm">
                <p className="font-bold text-gray-900">{med.medicineName}</p>
                <p className="text-sm text-emerald-600 font-medium mt-1">{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
                {med.duration && <p className="text-xs text-gray-500 mt-1">Duration: {med.duration}</p>}
                {med.timing && <p className="text-xs text-gray-500">Timing: {med.timing}</p>}
                {med.specialInstructions && (
                  <p className="text-xs text-gray-500 bg-gray-50 px-2 py-1.5 rounded mt-2 border border-gray-100">{med.specialInstructions}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Psychiatric Metrics ── */}
      {report.psychiatricSummary && (report.psychiatricSummary.phq9Score != null || report.psychiatricSummary.gad7Score != null) && (
        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-500" />{t('psychiatricMetrics', language)}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.psychiatricSummary.phq9Score != null && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-end mb-3">
                  <span className="font-semibold text-gray-800">PHQ-9 Score</span>
                  <span className="text-2xl font-black text-gray-900">{report.psychiatricSummary.phq9Score}<span className="text-sm font-normal text-gray-400"> / 27</span></span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${(report.psychiatricSummary.phq9Score ?? 0) >= 15 ? 'bg-red-500' : (report.psychiatricSummary.phq9Score ?? 0) >= 10 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${((report.psychiatricSummary.phq9Score ?? 0) / 27) * 100}%` }} />
                </div>
                <p className="text-sm text-gray-600 font-medium">{report.psychiatricSummary.phq9Interpretation}</p>
              </div>
            )}
            {report.psychiatricSummary.gad7Score != null && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-end mb-3">
                  <span className="font-semibold text-gray-800">GAD-7 Score</span>
                  <span className="text-2xl font-black text-gray-900">{report.psychiatricSummary.gad7Score}<span className="text-sm font-normal text-gray-400"> / 21</span></span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div className={`h-full rounded-full ${(report.psychiatricSummary.gad7Score ?? 0) >= 15 ? 'bg-red-500' : (report.psychiatricSummary.gad7Score ?? 0) >= 10 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                    style={{ width: `${((report.psychiatricSummary.gad7Score ?? 0) / 21) * 100}%` }} />
                </div>
                <p className="text-sm text-gray-600 font-medium">{report.psychiatricSummary.gad7Interpretation}</p>
              </div>
            )}
          </div>
          {report.psychiatricSummary.narrativeSummary && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
              <p className="text-sm text-gray-700 leading-relaxed">{report.psychiatricSummary.narrativeSummary}</p>
            </div>
          )}
        </div>
      )}

      {/* ── AI Clinical Assistant Chat ── */}
      <div className="mt-8 border border-gray-200 bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ height: '520px' }}>
        <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">{t('clinicalAssistant', language)}</h2>
            <p className="text-xs text-gray-500">Ask anything about this report - lab values, conditions, medications, next steps.</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <Stethoscope className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-gray-500 text-sm max-w-xs">Ask me about any lab value, what a finding means, possible causes, or what to do next.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {["What does my hemoglobin level mean?", "What are my next steps?", "Explain my thyroid results"].map(q => (
                  <button key={q} onClick={() => setChatInput(q)}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors border border-gray-200">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                  <Stethoscope className="w-4 h-4 text-emerald-600" />
                </div>
              )}
              <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-sm'
                  : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-sm'
              }`}>
                {m.content ? (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                ) : (
                  <div className="flex gap-1 items-center py-1">
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-emerald-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={t('askClinical', language)}
              disabled={isStreaming}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
            />
            <button onClick={sendMessage} disabled={isStreaming || !chatInput.trim()}
              className={`p-2.5 rounded-xl transition-all ${chatInput.trim() && !isStreaming ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
