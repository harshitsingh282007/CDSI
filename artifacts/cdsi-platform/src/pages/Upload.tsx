import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { UploadCloud, Camera, FileText, Image as ImageIcon, X, AlertTriangle, Edit2, Check, CheckCircle2, Sparkles, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { useGetJobStatus } from '@workspace/api-client-react';
import { getApiUrl } from '../lib/api-url';

export default function Upload() {
  const { files, setFiles, setJobId, jobId } = useCDSI();
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loadingDemo, setLoadingDemo] = useState(false);

  const { data: jobStatus } = useGetJobStatus(jobId || '', { 
    query: { 
      enabled: !!jobId,
      refetchInterval: 1000
    } 
  });

  const handleFiles = async (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    setErrorMsg('');

    const fileList = newFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading' as const,
      progress: 0
    }));

    setFiles(prev => [...prev, ...fileList]);

    const formData = new FormData();
    newFiles.forEach(f => formData.append('files', f));

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData });
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }
      const data = await res.json();
      setJobId(data.jobId);

      setFiles(prev => prev.map(f => fileList.some(nf => nf.id === f.id) ? { ...f, status: 'completed' as const, progress: 100 } : f));
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to upload files. Please try again.');
      setFiles(prev => prev.map(f => fileList.some(nf => nf.id === f.id) ? { ...f, status: 'error' as const } : f));
    }
  };

  // 1-Click Demo Report Loader
  const loadDemoReport = async () => {
    setLoadingDemo(true);
    setErrorMsg('');

    try {
      // Create synthetic sample pathology PDF file buffer
      const sampleText = `ANAND HOSPITAL PATHOLOGY REPORT & CLINICAL VISITS
Patient Name: Harshit Singh | Age: 28 | Sex: Male | Date: 20-Feb-2026

KFP (Kidney Function Profile):
Serum Creatinine 1.1 mg/dL (Ref: 0.6-1.2) [Normal]
Blood Urea 34.5 mg/dL (Ref: 15-45) [Normal]
BUN 16.1 mg/dL (Ref: 7-20) [Normal]
Serum Uric Acid 6.2 mg/dL (Ref: 3.5-8.5) [Normal]
Serum Calcium 9.4 mg/dL (Ref: 8.5-10.2) [Normal]
Serum Sodium 141 mmol/L (Ref: 135-145) [Normal]
Serum Potassium 4.2 mmol/L (Ref: 3.5-5.0) [Normal]
Serum Chloride 102 mmol/L (Ref: 98-107) [Normal]
eGFR 98.4 mL/min/1.73m2 [Normal]

LFP (Liver Function Profile):
Total Bilirubin 1.8 mg/dL (Ref: 0.2-1.2) [HIGH]
Direct Bilirubin 0.6 mg/dL (Ref: 0.0-0.3) [HIGH]
Indirect Bilirubin 1.2 mg/dL (Ref: 0.2-0.8) [HIGH]
SGOT (AST) 54 U/L (Ref: 10-40) [HIGH]
SGPT (ALT) 68 U/L (Ref: 10-40) [HIGH]
Alkaline Phosphatase (ALP) 185 U/L (Ref: 30-120) [HIGH]
Total Protein 6.8 g/dL (Ref: 6.0-8.0) [Normal]
Albumin 4.1 g/dL (Ref: 3.5-5.0) [Normal]

CBC (Complete Blood Count):
Haemoglobin 11.2 g/dL (Ref: 13.0-17.0) [LOW]
Total Leucocyte Count (TLC) 12400 /cu.mm (Ref: 4000-11000) [HIGH]
Neutrophils 78 % (Ref: 40-70) [HIGH]
Lymphocytes 18 % (Ref: 20-40) [LOW]
Platelet Count 1.45 Lakhs/cu.mm (Ref: 1.50-4.50) [LOW]
RBC Count 4.20 M/uL (Ref: 4.5-5.5) [LOW]
MCV 83.3 fL (Ref: 80-100) [Normal]

Urinalysis Routine:
Urine Pus Cells 10-12 /hpf (Ref: 0-5) [HIGH]
Urine Epithelial Cells 4-6 /hpf (Ref: 0-5) [Normal]
Urine Protein TRACE [HIGH]

Serology & Infectious Markers:
Widal Salmonella Typhi O 1:160 POSITIVE
Widal Salmonella Typhi H 1:80 POSITIVE
Typhidot IgM POSITIVE

Thyroid & Vitamins:
TSH 8.40 uIU/mL (Ref: 0.35-5.50) [HIGH]
Vitamin D (25-OH) 14.2 ng/mL (Ref: 30-100) [LOW]
Vitamin B12 140 pg/mL (Ref: 211-911) [LOW]

Prescriptions (4 Visit Dates):
Visit 1 (20-Feb-2026): TAB. NIMFORD 1-0-1, CAP. ROB DSR 1-0-0, POW. ELECTRAL 4.4GM 1-0-0, TAB. DAILY 0-0-1
Visit 2 (23-Feb-2026): CAP. ROB DSR 1-0-0, TAB. DAILY 0-0-1, INJ. LEMCAL D3 1-0-0, KENACORT 0.1% ORAL PASTE 1-1-1, CANDID MOUTH GEL + BETNESOL FORTE 1-1-1, SYP. APTIMAX 2-0-2
Visit 3 (25-Feb-2026): TAB. DAILY 0-0-1, SYP. APTIMAX 2-0-2, TAB. LMP-3 1-0-0, TAB. LEMCAL D3 60K 0-0-1
Visit 4 (01-Mar-2026): TAB. RISEBOK 1-0-1, CAP. NIFTRAN 1-0-1, TAB. COMBIFLAM 1-0-1`;

      const demoFile = new File([sampleText], 'Anand_Hospital_Pathology_Report_Sample.pdf', { type: 'application/pdf' });
      await handleFiles([demoFile]);
    } catch (e) {
      console.error(e);
      setErrorMsg('Failed to load demo report.');
    } finally {
      setLoadingDemo(false);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const saveEdit = (id: string) => {
    if (editName.trim()) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: editName.trim() } : f));
    }
    setEditingId(null);
  };

  const getFileIcon = (type: string, name: string) => {
    if (type.includes('pdf') || name.toLowerCase().endsWith('.pdf')) return <FileText className="w-5 h-5 text-red-400" />;
    if (type.includes('image') || name.toLowerCase().match(/\.(jpg|jpeg|png|heic)$/)) return <ImageIcon className="w-5 h-5 text-cyan-400" />;
    return <FileText className="w-5 h-5 text-teal-400" />;
  };

  const isUploadComplete = jobStatus && jobStatus.progress >= 50;
  const hasFiles = files.length > 0;

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-teal-500/15 text-teal-300 text-xs font-mono font-semibold rounded-lg border border-teal-500/30 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-teal-400" />
            AI ENGINE ACTIVE
          </span>
          <span className="text-xs text-slate-500 font-mono">v2.4 Multimodal Vision</span>
        </div>
        
        <h1 className="text-3xl md:text-4xl font-extrabold font-display tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-teal-400">
          Upload Patient Reports
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
          Upload multi-page pathology PDF lab results, blood panels, or clinical notes for instant multi-engine clinical analysis.
        </p>
      </div>

      {/* Simplified HackMIT Status Bar */}
      <div className="px-4 py-3 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 shadow-lg flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-emerald-500/15 rounded-lg border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="font-semibold text-slate-200 text-sm">Fully Digital Medical Reports Supported</span>
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold rounded border border-emerald-500/40 uppercase tracking-wider">Active</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-300 text-xs font-mono font-semibold rounded-xl border border-amber-500/30">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Advanced Handwritten AI Vision OCR Coming Soon</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl flex items-center gap-3 text-red-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Cyber Interactive Dropzone */}
      <div 
        className={`relative overflow-hidden border-2 border-dashed rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center gap-5 transition-all duration-300 cursor-pointer ${
          isDragging 
            ? 'border-teal-500 bg-teal-500/10 shadow-[0_0_30px_rgba(13,148,136,0.2)]' 
            : 'border-slate-800 bg-slate-900/50 hover:border-teal-500/50 hover:bg-slate-900/80'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        {/* Animated Laser Scanline on Drag */}
        {isDragging && <div className="animate-scanline" />}

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-500/20 via-cyan-500/15 to-transparent border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-xl shadow-teal-500/10">
          <UploadCloud className="w-8 h-8" />
        </div>

        <div className="flex flex-col items-center text-center gap-1">
          <p className="text-base font-semibold text-white">
            Drop medical reports here or <span className="text-teal-400 underline decoration-teal-500/40 underline-offset-4">browse files</span>
          </p>
          <p className="text-xs text-slate-400 font-mono">Accepts digital .pdf, .jpg, .png, .heic, .docx</p>
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          multiple 
          accept=".pdf,.jpg,.jpeg,.png,.heic,.docx"
          onChange={(e) => {
            if (e.target.files) handleFiles(Array.from(e.target.files));
            e.target.value = '';
          }} 
        />

        <div className="flex items-center gap-4 w-full max-w-xs mt-2">
          <div className="h-px bg-slate-800 flex-1"></div>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Options</span>
          <div className="h-px bg-slate-800 flex-1"></div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-slate-200 text-xs font-medium transition-all"
          >
            <Camera className="w-4 h-4 text-teal-400" />
            <span>Use Camera</span>
          </button>

          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); loadDemoReport(); }}
            disabled={loadingDemo}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 hover:from-teal-500/30 hover:to-cyan-500/30 border border-teal-500/40 rounded-xl text-teal-200 text-xs font-semibold transition-all shadow-lg shadow-teal-500/10"
          >
            <Zap className="w-4 h-4 text-teal-300 animate-bounce" />
            <span>{loadingDemo ? 'Loading Demo...' : '⚡ Try Demo Report (Anand Hospital Sample)'}</span>
          </button>
        </div>

        <input 
          type="file" 
          ref={cameraInputRef} 
          className="hidden" 
          accept="image/*" 
          capture="environment"
          onChange={(e) => {
            if (e.target.files) handleFiles(Array.from(e.target.files));
            e.target.value = '';
          }} 
        />
      </div>

      {/* Uploaded File List */}
      {hasFiles && (
        <div className="flex flex-col gap-3 mt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Uploaded Documents ({files.length})</h3>
            <span className="text-xs text-teal-400 font-mono">Ready for Processing</span>
          </div>

          {files.map(f => (
            <div key={f.id} className="cyber-card rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                  {getFileIcon(f.type, f.name)}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  {editingId === f.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 text-xs bg-slate-900 border border-teal-500/50 text-white rounded px-2 py-1 focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(f.id)}
                      />
                      <button onClick={() => saveEdit(f.id)} className="text-teal-400 hover:text-teal-300 p-1">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <p className="text-sm font-semibold text-slate-200 truncate">{f.name}</p>
                      <button onClick={() => startEdit(f.id, f.name)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 font-mono">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {f.status === 'completed' && (
                  <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 text-xs font-mono font-medium rounded-lg border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Ready
                  </span>
                )}
                {f.status === 'uploading' && (
                  <span className="px-2.5 py-1 bg-teal-500/20 text-teal-300 text-xs font-mono font-medium rounded-lg border border-teal-500/30 animate-pulse">
                    Uploading...
                  </span>
                )}

                <button onClick={() => removeFile(f.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Action Call To Action */}
          <div className="mt-4 p-5 cyber-card-glow rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-500/20 text-teal-300 rounded-xl border border-teal-500/40">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <h4 className="text-sm font-bold text-white">Files Prepared & Staged</h4>
                <p className="text-xs text-slate-400">Proceed to Clinical Intake to answer patient complaints & start AI analysis.</p>
              </div>
            </div>

            <button 
              onClick={() => setLocation('/intake')}
              className="w-full md:w-auto px-6 py-3 bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 animate-shimmer transition-all"
            >
              <span>Proceed to Clinical Intake</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
