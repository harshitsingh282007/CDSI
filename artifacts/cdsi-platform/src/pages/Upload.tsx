import { useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { UploadCloud, Camera, FileText, Image as ImageIcon, X, AlertTriangle, Edit2, Check } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { useGetJobStatus, getGetJobStatusQueryKey } from '@workspace/api-client-react';

export default function Upload() {
  const { files, setFiles, setJobId, jobId } = useCDSI();
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: jobStatus } = useGetJobStatus(jobId || '', { 
    query: { 
      enabled: !!jobId,
      queryKey: getGetJobStatusQueryKey(jobId || ''),
      refetchInterval: 2000,
    } 
  });

  const syncFilesToBackend = async (fileList: typeof files) => {
    if (fileList.length === 0) {
      setJobId(null);
      return;
    }
    setFiles(prev => prev.map(f => fileList.some(nf => nf.id === f.id) ? { ...f, status: 'uploading' as const } : f));

    const formData = new FormData();
    fileList.forEach(f => formData.append('files', f.file));

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      if (data.jobId) {
        setJobId(data.jobId);
        setFiles(prev => prev.map(f => fileList.some(nf => nf.id === f.id) ? { ...f, status: 'completed' as const, progress: 100 } : f));
      }
    } catch (err) {
      setFiles(prev => prev.map(f => fileList.some(nf => nf.id === f.id) ? { ...f, status: 'error' as const } : f));
      setErrorMsg('Failed to upload files. Please try again.');
    }
  };

  const handleFiles = async (newFiles: File[]) => {
    setErrorMsg('');
    const validFiles = Array.from(newFiles).filter(f => 
      f.name.toLowerCase().match(/\.(pdf|jpg|jpeg|png|heic|docx)$/)
    );

    if (validFiles.length === 0) return;

    const duplicates = validFiles.filter(nf => files.some(f => f.name === nf.name && f.size === nf.size));
    if (duplicates.length > 0) {
      setErrorMsg(`Duplicate file detected: ${duplicates[0].name}`);
      return;
    }

    const addedFiles = validFiles.map(f => ({
      file: f,
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      type: f.type,
      status: 'uploading' as const,
      progress: 0
    }));

    const allFiles = [...files, ...addedFiles];
    setFiles(allFiles);
    // Every batch re-syncs the FULL current file list to the backend, since a job
    // is a single fixed snapshot - a partial re-upload would silently orphan
    // earlier files and leave the backend job out of sync with what's shown here.
    await syncFilesToBackend(allFiles);
  };

  const removeFile = (id: string) => {
    const remaining = files.filter(f => f.id !== id);
    setFiles(remaining);
    void syncFilesToBackend(remaining);
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
    if (type.includes('pdf') || name.toLowerCase().endsWith('.pdf')) return <FileText className="w-6 h-6 text-red-500" />;
    if (type.includes('image') || name.toLowerCase().match(/\.(jpg|jpeg|png|heic)$/)) return <ImageIcon className="w-6 h-6 text-blue-500" />;
    return <FileText className="w-6 h-6 text-blue-600" />;
  };

  const isUploadComplete = jobStatus && jobStatus.progress >= 50;
  const hasFiles = files.length > 0;

  return (
    <div className="w-full flex flex-col gap-6 pt-10 md:pt-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold text-[#111827]">Upload Documents</h1>
        <p className="text-[#6B7280]">Upload patient medical reports, lab results, and clinical notes.</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-[#FEF2F2] border border-[#DC2626] rounded-md flex items-center gap-3 text-[#DC2626]">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Dropzone */}
      <div 
        className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer bg-[#FFFFFF] ${
          isDragging ? 'border-[#16A34A] bg-[#F0FDF4]' : 'border-[#E5E7EB] hover:border-[#16A34A]'
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
        <div className="w-12 h-12 bg-[#F0FDF4] rounded-full flex items-center justify-center text-[#16A34A] mb-2">
          <UploadCloud className="w-6 h-6" />
        </div>
        <p className="text-[#111827] font-medium">Drop medical reports here or click to browse</p>
        <p className="text-sm text-[#6B7280]">Accepts .pdf, .jpg, .png, .heic, .docx</p>
        
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
        
        <div className="flex items-center gap-4 w-full max-w-sm mt-4">
          <div className="h-px bg-[#E5E7EB] flex-1"></div>
          <span className="text-xs text-[#6B7280] font-medium uppercase">or</span>
          <div className="h-px bg-[#E5E7EB] flex-1"></div>
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
          className="mt-2 flex items-center gap-2 px-4 py-2 border border-[#E5E7EB] rounded-md text-[#111827] hover:bg-[#FAFAFA] transition-colors"
        >
          <Camera className="w-4 h-4" />
          <span className="text-sm font-medium">Use Camera</span>
        </button>
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

      {/* File List */}
      {hasFiles && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-[#111827] uppercase tracking-wider">Uploaded Files</h3>
          {files.map(f => (
            <div key={f.id} className="bg-[#FFFFFF] border border-[#E5E7EB] rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {getFileIcon(f.type, f.name)}
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === f.id ? (
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 text-sm border border-[#16A34A] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveEdit(f.id)}
                      />
                      <button onClick={() => saveEdit(f.id)} className="text-[#16A34A] hover:bg-[#F0FDF4] p-1 rounded">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <p className="text-sm font-medium text-[#111827] truncate">{f.name}</p>
                      <button onClick={() => startEdit(f.id, f.name)} className="opacity-0 group-hover:opacity-100 text-[#6B7280] hover:text-[#111827] transition-opacity">
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-[#6B7280]">{(f.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <div className="flex items-center gap-3">
                  {f.status === 'completed' && <span className="px-2 py-1 bg-[#F0FDF4] text-[#16A34A] text-xs font-medium rounded-full">Completed</span>}
                  {f.status === 'uploading' && <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">Uploading</span>}
                  {f.status === 'error' && <span className="px-2 py-1 bg-[#FEF2F2] text-[#DC2626] text-xs font-medium rounded-full">Error</span>}
                  <button onClick={() => removeFile(f.id)} className="text-[#6B7280] hover:bg-[#FAFAFA] p-1 rounded transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {f.status === 'uploading' && (
                <div className="w-full bg-[#E5E7EB] rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#16A34A] h-1.5 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer Action */}
      <div className="mt-4 pt-6 border-t border-[#E5E7EB] flex justify-end">
        <button 
          onClick={() => setLocation('/intake')}
          disabled={!hasFiles || !isUploadComplete}
          className={`px-6 py-3 rounded-md font-medium text-white transition-colors ${
            (!hasFiles || !isUploadComplete) 
              ? 'bg-[#E5E7EB] text-[#6B7280] cursor-not-allowed' 
              : 'bg-[#16A34A] hover:bg-green-700 shadow-sm'
          }`}
        >
          Proceed to Patient Intake
        </button>
      </div>
    </div>
  );
}
