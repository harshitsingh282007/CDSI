import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle2, Loader2, AlertCircle, RotateCcw, FileText, Cpu, Brain, ClipboardList } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { useGetJobStatus, useGetReport, getGetJobStatusQueryKey, getGetReportQueryKey } from '@workspace/api-client-react';

const STEPS = [
  { id: 'extracting',  label: 'Extracting document text',       icon: FileText,     range: [0, 50]  },
  { id: 'structuring', label: 'Structuring lab values',          icon: ClipboardList, range: [50, 72] },
  { id: 'reasoning',  label: 'Running clinical AI reasoning',    icon: Brain,        range: [72, 92] },
  { id: 'generating', label: 'Generating clinical report',       icon: Cpu,          range: [92, 100] },
];

const AI_MESSAGES = [
  "Parsing document structure...",
  "Identifying lab parameters...",
  "Cross-referencing reference ranges...",
  "Correlating findings with patient history...",
  "Assessing organ system status...",
  "Running differential diagnosis...",
  "Evaluating risk indicators...",
  "Generating clinical narrative...",
  "Finalising recommendations...",
];

export default function Processing() {
  const { jobId, setReport } = useCDSI();
  const [, setLocation] = useLocation();
  const [shouldFetchReport, setShouldFetchReport] = useState(false);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [aiMessageIdx, setAiMessageIdx] = useState(0);
  const animFrameRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  const { data: statusData, isError: isStatusError } = useGetJobStatus(jobId || '', {
    query: {
      enabled: !!jobId,
      queryKey: getGetJobStatusQueryKey(jobId || ''),
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return 1500;
        const analysisFinished =
          (data.status === 'completed' || data.status === 'partial') && data.progress >= 100;
        return analysisFinished ? false : 1500;
      },
    }
  });

  const analysisFinished =
    (statusData?.status === 'completed' || statusData?.status === 'partial') &&
    (statusData?.progress ?? 0) >= 100;

  const { data: reportData, isError: isReportError } = useGetReport(jobId || '', {
    query: {
      enabled: shouldFetchReport && analysisFinished,
      queryKey: getGetReportQueryKey(jobId || ''),
      retry: (failureCount, error) => {
        if (error && 'status' in error && (error as { status: number }).status === 404) {
          return failureCount < 30;
        }
        return failureCount < 3;
      },
      retryDelay: 1500,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data && 'patientSummary' in data) return false;
        return shouldFetchReport && analysisFinished ? 2000 : false;
      },
    }
  });

  // Smoothly animate display progress toward actual backend progress
  useEffect(() => {
    const target = statusData?.progress ?? 0;
    if (animFrameRef.current) clearInterval(animFrameRef.current);
    animFrameRef.current = setInterval(() => {
      setDisplayProgress(prev => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.5) return target;
        // Move 15% of the gap per tick - smooth ease-out
        return prev + diff * 0.15;
      });
    }, 60);
    return () => { if (animFrameRef.current) clearInterval(animFrameRef.current); };
  }, [statusData?.progress]);

  // Cycle AI messages every 2.5s to convey activity
  useEffect(() => {
    if (msgTimerRef.current) clearInterval(msgTimerRef.current);
    msgTimerRef.current = setInterval(() => {
      setAiMessageIdx(i => (i + 1) % AI_MESSAGES.length);
    }, 2500);
    return () => { if (msgTimerRef.current) clearInterval(msgTimerRef.current); };
  }, []);

  useEffect(() => {
    if (analysisFinished) {
      setShouldFetchReport(true);
    }
  }, [analysisFinished]);

  useEffect(() => {
    if (reportData && 'patientSummary' in reportData) {
      setReport(reportData as Parameters<typeof setReport>[0]);
      setLocation('/report');
    }
  }, [reportData, setReport, setLocation]);

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
        <AlertCircle className="w-12 h-12 text-[#D97706]" />
        <h2 className="text-xl font-semibold text-[#111827]">No active analysis</h2>
        <p className="text-[#6B7280]">Please upload documents first.</p>
        <button onClick={() => setLocation('/')}
          className="px-4 py-2 bg-[#16A34A] text-white rounded-md font-medium hover:bg-green-700 transition-colors">
          Return to Upload
        </button>
      </div>
    );
  }

  const progress = statusData?.progress ?? 0;
  const isFailed = statusData?.status === 'failed' || isStatusError || (isReportError && analysisFinished);
  const isComplete = analysisFinished && shouldFetchReport;
  const backendMessage = statusData?.message;

  const getCurrentStepIndex = () => {
    for (let i = STEPS.length - 1; i >= 0; i--) {
      if (progress >= STEPS[i].range[0]) return i;
    }
    return 0;
  };
  const currentStepIdx = getCurrentStepIndex();

  const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full max-w-2xl mx-auto">
      <div className="w-full bg-white border border-[#E5E7EB] rounded-2xl shadow-sm overflow-hidden">

        {/* Top progress bar - smooth animated fill */}
        <div className="w-full h-1.5 bg-[#E5E7EB]">
          <div
            className={`h-full transition-none ${isFailed ? 'bg-[#DC2626]' : 'bg-[#16A34A]'}`}
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        <div className="p-10 flex flex-col gap-8">
          {/* Header */}
          <div className="text-center flex flex-col gap-2">
            {isFailed ? (
              <>
                <AlertCircle className="w-12 h-12 text-[#DC2626] mx-auto" />
                <h1 className="text-2xl font-bold text-[#111827]">Analysis Failed</h1>
                <p className="text-[#6B7280]">{statusData?.error || 'An error occurred during analysis.'}</p>
              </>
            ) : isComplete ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-[#16A34A] mx-auto animate-pulse" />
                <h1 className="text-2xl font-bold text-[#111827]">Analysis Complete</h1>
                <p className="text-[#6B7280]">Loading your clinical report...</p>
              </>
            ) : (
              <>
                <div className="relative w-16 h-16 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-[#DCFCE7]" />
                  <div
                    className="absolute inset-0 rounded-full border-4 border-[#16A34A] border-t-transparent animate-spin"
                    style={{ animationDuration: '1.2s' }}
                  />
                  <Brain className="absolute inset-0 m-auto w-7 h-7 text-[#16A34A]" />
                </div>
                <h1 className="text-2xl font-bold text-[#111827]">Analysing Clinical Data</h1>
                <p className="text-[#6B7280] text-sm min-h-[20px] transition-all duration-300">
                  {backendMessage || AI_MESSAGES[aiMessageIdx]}
                </p>
              </>
            )}
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-5">
            {STEPS.map((step, idx) => {
              const isCompleted = progress >= step.range[1] || (isComplete && idx < STEPS.length);
              const isActive = !isCompleted && idx === currentStepIdx && !isFailed;
              const isPending = !isCompleted && !isActive;
              const StepIcon = step.icon;

              return (
                <div key={step.id} className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    isCompleted ? 'bg-[#DCFCE7] text-[#16A34A]' :
                    isActive    ? 'bg-[#F0FDF4] text-[#16A34A] ring-2 ring-[#16A34A] ring-offset-1' :
                                  'bg-[#F9FAFB] text-[#D1D5DB] border border-[#E5E7EB]'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-5 h-5" /> :
                     isActive    ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                   <StepIcon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${
                      isCompleted ? 'text-[#111827]' :
                      isActive    ? 'text-[#16A34A]' :
                                    'text-[#9CA3AF]'
                    }`}>
                      {step.label}
                    </span>
                    {isCompleted && (
                      <span className="ml-2 text-xs text-[#16A34A]">✓</span>
                    )}
                  </div>
                  {isActive && (
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer info */}
          {!isFailed && !isComplete && (
            <div className="flex items-center justify-between text-xs text-[#9CA3AF] pt-2 border-t border-[#F3F4F6]">
              <span>Processing time: {elapsedStr}</span>
              <span className="font-mono">{Math.round(displayProgress)}% complete</span>
            </div>
          )}

          {isFailed && (
            <button
              onClick={() => window.location.reload()}
              className="mt-2 w-full py-3 flex items-center justify-center gap-2 bg-[#FEF2F2] text-[#DC2626] rounded-md font-medium border border-[#FCA5A5] hover:bg-red-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retry Analysis
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
