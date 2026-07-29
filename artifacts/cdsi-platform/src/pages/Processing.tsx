import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, Loader2, AlertCircle, RotateCcw, FileText, Cpu, Brain, ClipboardList, ShieldCheck, Sparkles, Activity, Terminal } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { useGetJobStatus, useGetReport, getGetJobStatusQueryKey, getGetReportQueryKey } from '@workspace/api-client-react';

const STEPS = [
  { id: 'extracting',  label: 'Multi-Engine Document OCR Parsing', range: [0, 50], icon: FileText },
  { id: 'structuring', label: 'Pathology & Medication Structuring', range: [50, 72], icon: ClipboardList },
  { id: 'reasoning',  label: 'Deep Clinical AI Reasoning Engine', range: [72, 92], icon: Brain },
  { id: 'generating', label: 'Compiling Final Clinical Report', range: [92, 100], icon: Cpu },
];

const AI_LOGS = [
  "INSPECTING MULTIMODAL DOCUMENT BUFFERS...",
  "EXTRACTING PATHOLOGY LAB TABLE ROWS & CELL UNITS...",
  "VERIFYING REFERENCE INTERVALS ACROSS LAB PANELS...",
  "EVALUATING HEPATIC & RENAL ORGAN SYSTEM MARGINS...",
  "PARSING DOCTOR PRESCRIPTIONS & DOSAGE SCHEDULES...",
  "COMPUTING DIFFERENTIAL DIAGNOSES & CLINICAL EVIDENCE...",
  "EVALUATING PSYCHIATRIC SCREENING SCORES (PHQ-9 / GAD-7)...",
  "BUILDING COMPREHENSIVE CLINICAL REPORT MATRIX...",
];

export default function Processing() {
  const { jobId, setJobId, setReport } = useCDSI();
  const [, setLocation] = useLocation();
  const activeJobId = jobId || (typeof window !== 'undefined' ? sessionStorage.getItem('cdsi_job_id') : null);

  useEffect(() => {
    if (!jobId && activeJobId) {
      setJobId(activeJobId);
    }
  }, [jobId, activeJobId, setJobId]);

  const [shouldFetchReport, setShouldFetchReport] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [logIdx, setLogIdx] = useState(0);
  const animFrameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: statusData, isError: isStatusError } = useGetJobStatus(activeJobId || '', {
    query: {
      enabled: !!activeJobId,
      queryKey: getGetJobStatusQueryKey(activeJobId || ''),
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 1000;
        const analysisFinished = (data.status === 'completed' || data.status === 'partial') && data.progress >= 100;
        return analysisFinished ? false : 1000;
      },
    }
  });

  const analysisFinished =
    (statusData?.status === 'completed' || statusData?.status === 'partial') &&
    (statusData?.progress ?? 0) >= 100;

  const { data: reportData } = useGetReport(activeJobId || '', {
    query: {
      enabled: shouldFetchReport && analysisFinished,
      queryKey: getGetReportQueryKey(activeJobId || ''),
      retry: (failureCount, error) => {
        if (error && 'status' in error && (error as { status: number }).status === 404) {
          return failureCount < 30;
        }
        return failureCount < 3;
      },
      retryDelay: 1000,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data && 'patientSummary' in data) return false;
        return shouldFetchReport && analysisFinished ? 1500 : false;
      },
    }
  });

  // Smooth Progress Fill Animation
  useEffect(() => {
    const target = statusData?.progress ?? 0;
    if (animFrameRef.current) clearInterval(animFrameRef.current);
    animFrameRef.current = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        return prev + diff * 0.2;
      });
    }, 40);
    return () => { if (animFrameRef.current) clearInterval(animFrameRef.current); };
  }, [statusData?.progress]);

  // Terminal Log Rotation
  useEffect(() => {
    if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    msgTimerRef.current = setInterval(() => {
      setLogIdx(i => (i + 1) % AI_LOGS.length);
    }, 2000);
    return () => { if (msgTimerRef.current) clearInterval(msgTimerRef.current); };
  }, []);

  useEffect(() => {
    if (analysisFinished) {
      setShouldFetchReport(true);
    }
  }, [analysisFinished]);

  useEffect(() => {
    if (reportData && 'patientSummary' in reportData) {
      setReport(reportData as any);
      setTimeout(() => setLocation('/report'), 500);
    }
  }, [reportData, setReport, setLocation]);

  const isFailed = statusData?.status === 'failed' || isStatusError;
  const progress = Math.min(100, Math.max(0, displayProgress));

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[75vh] py-8">
      <div className="w-full max-w-xl cyber-card-glow rounded-2xl p-8 md:p-10 flex flex-col gap-8 shadow-2xl relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-500/20 text-teal-300 rounded-xl border border-teal-500/40">
              <Brain className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-lg font-bold text-white font-display">Neural Diagnostic Terminal</h2>
              <span className="text-xs font-mono text-teal-400">Processing Job: {activeJobId ? activeJobId.slice(0, 14) + '…' : 'Active'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
            <span className="text-xs font-mono text-slate-300 font-bold">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Circular Neural Gauge */}
        <div className="flex flex-col items-center justify-center py-4 relative">
          <div className="w-36 h-36 rounded-full relative flex items-center justify-center border-4 border-slate-800/80 bg-slate-950/80 shadow-inner">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="72" cy="72" r="62"
                stroke="currentColor" strokeWidth="6"
                fill="transparent"
                className="text-slate-800"
              />
              <circle
                cx="72" cy="72" r="62"
                stroke="currentColor" strokeWidth="6"
                fill="transparent"
                strokeDasharray={389}
                strokeDashoffset={389 - (389 * progress) / 100}
                className="text-teal-400 transition-all duration-300 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
              <span className="text-2xl font-black font-display text-white">{Math.round(progress)}%</span>
              <span className="text-[10px] font-mono text-teal-400 uppercase tracking-widest">Active AI</span>
            </div>
          </div>
        </div>

        {/* Live Terminal Log Screen */}
        <div className="bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-500 pb-2 border-b border-slate-800/60">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-teal-400" />
              <span>LIVE AI LOG STREAM</span>
            </div>
            <span className="text-teal-400 animate-pulse">● EXEC</span>
          </div>

          <div className="flex items-center gap-2 text-teal-300 min-h-[24px]">
            <span className="text-slate-500">&gt;</span>
            <span className="truncate">{statusData?.message || AI_LOGS[logIdx]}</span>
          </div>
        </div>

        {/* Diagnostic Steps List */}
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const isCompleted = progress >= step.range[1] || analysisFinished;
            const isActive = !isCompleted && progress >= step.range[0];
            const StepIcon = step.icon;

            return (
              <div key={step.id} className="flex items-center gap-3.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold transition-all ${
                  isCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                  isActive ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 animate-pulse' :
                  'bg-slate-800/40 text-slate-500 border border-slate-800'
                }`}>
                  {isCompleted ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <StepIcon className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${isCompleted ? 'text-slate-200' : isActive ? 'text-teal-300' : 'text-slate-500'}`}>
                    {step.label}
                  </p>
                </div>

                {isCompleted && <span className="text-xs font-mono text-emerald-400 font-bold">100%</span>}
                {isActive && <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />}
              </div>
            );
          })}
        </div>

        {isFailed && (
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 flex items-center justify-center gap-2 bg-red-500/20 text-red-300 rounded-xl font-bold border border-red-500/40 hover:bg-red-500/30 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retry Diagnostic Pipeline
          </button>
        )}
      </div>
    </div>
  );
}
