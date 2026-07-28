import { createContext, useContext, useState, ReactNode } from 'react';
import { ClinicalReport } from '@workspace/api-client-react';

export interface UploadedFileInfo {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploading' | 'completed' | 'error';
  progress: number;
}

interface CDSIContextType {
  jobId: string | null;
  setJobId: (id: string | null) => void;
  report: ClinicalReport | null;
  setReport: (report: ClinicalReport | null) => void;
  language: string;
  setLanguage: (lang: string) => void;
  sessionId: string;
  files: UploadedFileInfo[];
  setFiles: React.Dispatch<React.SetStateAction<UploadedFileInfo[]>>;
}

const CDSIContext = createContext<CDSIContextType | null>(null);

export function CDSIProvider({ children }: { children: ReactNode }) {
  const [jobId, setJobIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('cdsi_job_id');
    }
    return null;
  });

  const [report, setReportState] = useState<ClinicalReport | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('cdsi_report');
      try {
        return cached ? JSON.parse(cached) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const setJobId = (id: string | null) => {
    setJobIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        sessionStorage.setItem('cdsi_job_id', id);
      } else {
        sessionStorage.removeItem('cdsi_job_id');
      }
    }
  };

  const setReport = (rep: ClinicalReport | null) => {
    setReportState(rep);
    if (typeof window !== 'undefined') {
      if (rep) {
        sessionStorage.setItem('cdsi_report', JSON.stringify(rep));
      } else {
        sessionStorage.removeItem('cdsi_report');
      }
    }
  };

  const [language, setLanguage] = useState<string>('English');
  const [sessionId] = useState<string>(() => crypto.randomUUID());
  const [files, setFiles] = useState<UploadedFileInfo[]>([]);

  return (
    <CDSIContext.Provider value={{
      jobId, setJobId,
      report, setReport,
      language, setLanguage,
      sessionId,
      files, setFiles
    }}>
      {children}
    </CDSIContext.Provider>
  );
}

export function useCDSI() {
  const context = useContext(CDSIContext);
  if (!context) {
    throw new Error('useCDSI must be used within a CDSIProvider');
  }
  return context;
}
