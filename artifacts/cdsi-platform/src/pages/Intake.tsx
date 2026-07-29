import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Stethoscope, Brain, HeartPulse, Check, AlertTriangle, Sparkles, Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { useStartAnalysis, type IntakeFormDataAnalysisType } from '@workspace/api-client-react';
import { PHQ9_QUESTIONS, GAD7_QUESTIONS } from '../translations';
import { getApiUrl } from '../lib/api-url';

export function getBmiCategory(bmiVal: number): { label: string; category: string; badgeBg: string } {
  if (bmiVal < 16.0) return { label: "Very Low", category: "Severe Underweight", badgeBg: "bg-red-500/20 border-red-500/40 text-red-300" };
  if (bmiVal < 18.5) return { label: "Low", category: "Underweight", badgeBg: "bg-amber-500/20 border-amber-500/40 text-amber-300" };
  if (bmiVal < 25.0) return { label: "Normal (Healthy)", category: "Normal Weight", badgeBg: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" };
  if (bmiVal < 30.0) return { label: "Moderate High", category: "Overweight", badgeBg: "bg-orange-500/20 border-orange-500/40 text-orange-300" };
  if (bmiVal < 35.0) return { label: "High", category: "Obesity Class I", badgeBg: "bg-red-500/20 border-red-500/40 text-red-300" };
  if (bmiVal < 40.0) return { label: "Very High", category: "Obesity Class II", badgeBg: "bg-red-500/25 border-red-500/50 text-red-200" };
  return { label: "Extremely High", category: "Severe Obesity Class III", badgeBg: "bg-red-600/30 border-red-500 text-red-100" };
}

export default function Intake() {
  const { jobId, setJobId, language } = useCDSI();
  const [, setLocation] = useLocation();
  const startAnalysis = useStartAnalysis();
  const [errorMsg, setErrorMsg] = useState('');

  const [analysisType, setAnalysisType] = useState<IntakeFormDataAnalysisType | null>('physical');
  
  // Physical State
  const [patientName, setPatientName] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('days');
  const [age, setAge] = useState('');
  const [biologicalSex, setBiologicalSex] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  
  const [knownDiagnoses, setKnownDiagnoses] = useState<string[]>([]);
  const [currentMedications, setCurrentMedications] = useState('');
  const [knownAllergies, setKnownAllergies] = useState('');
  
  const [recentSurgeries, setRecentSurgeries] = useState(false);
  const [recentSurgeriesDetails, setRecentSurgeriesDetails] = useState('');
  
  const [familyHistory, setFamilyHistory] = useState<string[]>([]);
  const [smoking, setSmoking] = useState('Never');
  const [alcohol, setAlcohol] = useState('None');

  // Psychiatric State
  const [phq9Answers, setPhq9Answers] = useState<number[]>(Array(9).fill(-1));
  const [gad7Answers, setGad7Answers] = useState<number[]>(Array(7).fill(-1));
  const [sleepQuality, setSleepQuality] = useState('5');
  const [appetiteChanges, setAppetiteChanges] = useState('Normal');
  const [lifeStressors, setLifeStressors] = useState(false);
  const [lifeStressorsDetails, setLifeStressorsDetails] = useState('');
  const [previousMentalHealthDiagnosis, setPreviousMentalHealthDiagnosis] = useState(false);
  const [mentalHealthDiagnosisDetails, setMentalHealthDiagnosisDetails] = useState('');

  // Adaptive AI State
  const [isGeneratingAdaptive, setIsGeneratingAdaptive] = useState(false);
  const [adaptiveQuestions, setAdaptiveQuestions] = useState<string[]>([]);
  const [adaptiveAnswers, setAdaptiveAnswers] = useState<Record<number, string>>({});
  const [psychiatricRecommended, setPsychiatricRecommended] = useState<boolean | null>(null);
  const [psychiatricReason, setPsychiatricReason] = useState<string>('');

  const runAdaptiveAiTriage = async () => {
    setIsGeneratingAdaptive(true);
    try {
      const apiUrl = getApiUrl();
      if (jobId) {
        const res = await fetch(`${apiUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            message: `ACT AS ADAPTIVE CLINICAL TRIAGE ENGINE. Based on patient complaint: "${chiefComplaint || 'General Checkup'}", age: ${age || 'Unknown'}, sex: ${biologicalSex || 'Unknown'}.
            Generate 3 targeted, case-specific clinical follow-up questions for the patient and evaluate if psychiatric screening (PHQ-9/GAD-7) is indicated.
            Return strictly raw JSON format: {"questions": ["question 1", "question 2", "question 3"], "psychiatricRecommended": true, "psychiatricReason": "Reason why psychiatric screening is indicated"}`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.text || '';
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.questions && Array.isArray(parsed.questions)) {
              setAdaptiveQuestions(parsed.questions);
            }
            if (typeof parsed.psychiatricRecommended === 'boolean') {
              setPsychiatricRecommended(parsed.psychiatricRecommended);
            }
            if (parsed.psychiatricReason) {
              setPsychiatricReason(parsed.psychiatricReason);
            }
            return;
          }
        }
      }

      setAdaptiveQuestions([
        "Have you experienced any step-ladder fever spikes or abdominal discomfort?",
        "Are you currently experiencing joint pain, fatigue, or muscle weakness?",
        "Do you have a personal or family history of similar clinical symptoms?"
      ]);
      setPsychiatricRecommended(false);
      setPsychiatricReason("Physical pathology symptoms primary.");
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingAdaptive(false);
    }
  };

  const bmi = useMemo(() => {
    if (heightCm && weightKg) {
      const h = parseFloat(heightCm) / 100;
      const w = parseFloat(weightKg);
      if (h > 0 && w > 0) return (w / (h * h)).toFixed(1);
    }
    return null;
  }, [heightCm, weightKg]);

  const toggleArrayItem = (setter: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setter(prev => {
      if (item === 'None') return ['None'];
      const filtered = prev.filter(p => p !== 'None');
      return filtered.includes(item) ? filtered.filter(p => p !== item) : [...filtered, item];
    });
  };

  const handlePhq9Answer = (idx: number, val: number) => {
    const newAnswers = [...phq9Answers];
    newAnswers[idx] = val;
    setPhq9Answers(newAnswers);
  };

  const handleGad7Answer = (idx: number, val: number) => {
    const newAnswers = [...gad7Answers];
    newAnswers[idx] = val;
    setGad7Answers(newAnswers);
  };

  const phq9Score = useMemo(() => phq9Answers.reduce((a, b) => a + (b > -1 ? b : 0), 0), [phq9Answers]);
  const gad7Score = useMemo(() => gad7Answers.reduce((a, b) => a + (b > -1 ? b : 0), 0), [gad7Answers]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!analysisType || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg('');

    const targetJobId = jobId || `job-intake-${Date.now()}`;
    setJobId(targetJobId);
    sessionStorage.setItem('cdsi_job_id', targetJobId);

    const adaptiveQA = Object.entries(adaptiveAnswers).map(([idx, ans]) => ({
      question: adaptiveQuestions[parseInt(idx, 10)] || `Question ${parseInt(idx, 10) + 1}`,
      answer: ans
    }));

    const intakeData: Record<string, unknown> = {
      analysisType,
      patientName: patientName || null,
      chiefComplaint: chiefComplaint || null,
      symptomDuration: symptomDuration || null,
      age: age ? parseInt(age, 10) : null,
      biologicalSex: biologicalSex || null,
      heightCm: heightCm ? parseFloat(heightCm) : null,
      weightKg: weightKg ? parseFloat(weightKg) : null,
      knownDiagnoses: knownDiagnoses.length > 0 ? knownDiagnoses : undefined,
      currentMedications: currentMedications || null,
      knownAllergies: knownAllergies || null,
      recentSurgeries,
      recentSurgeriesDetails: recentSurgeries ? recentSurgeriesDetails : null,
      familyHistory: familyHistory.length > 0 ? familyHistory : undefined,
      smoking,
      alcohol,
      adaptiveQA: adaptiveQA.length > 0 ? adaptiveQA : undefined,
    };

    if (analysisType === 'psychiatric' || analysisType === 'both' || analysisType === 'adaptive') {
      intakeData.phq9Answers = phq9Answers.map(v => Math.max(0, v));
      intakeData.gad7Answers = gad7Answers.map(v => Math.max(0, v));
      intakeData.phq9Score = phq9Score;
      intakeData.gad7Score = gad7Score;
      intakeData.sleepQuality = parseInt(sleepQuality, 10);
      intakeData.appetiteChanges = appetiteChanges;
      intakeData.lifeStressors = lifeStressors;
      intakeData.lifeStressorsDetails = lifeStressors ? lifeStressorsDetails : null;
      intakeData.previousMentalHealthDiagnosis = previousMentalHealthDiagnosis;
      intakeData.mentalHealthDiagnosisDetails = previousMentalHealthDiagnosis ? mentalHealthDiagnosisDetails : null;
    }

    try {
      await startAnalysis.mutateAsync({
        jobId: targetJobId,
        intakeData: intakeData as unknown as IntakeFormData
      });
      setLocation('/processing');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to submit intake. Proceeding to processing...');
      setLocation('/processing');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-8 pb-32">
      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl md:text-4xl font-extrabold font-display tracking-tight text-white">Patient Clinical Intake</h1>
        <p className="text-slate-400 text-sm max-w-xl">Configure physical & psychiatric screening context for the multi-engine AI reasoning model.</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-950/40 border border-red-500/40 rounded-xl flex items-center gap-3 text-red-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Analysis Mode Cards */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Select Clinical Evaluation Scope</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { id: 'physical', label: 'Physical Health', desc: 'Pathology lab & organ diagnosis', icon: Stethoscope },
            { id: 'psychiatric', label: 'Psychiatric Health', desc: 'PHQ-9 & GAD-7 screening', icon: Brain },
            { id: 'both', label: 'Physical + Psychiatric', desc: 'Dual multi-system evaluation', icon: HeartPulse },
            { id: 'adaptive', label: 'Adaptive AI Engine', desc: 'Dynamic AI case triage', icon: Activity },
          ].map(mode => {
            const isSel = analysisType === mode.id;
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setAnalysisType(mode.id as any)}
                className={`p-5 rounded-2xl flex flex-col gap-3 text-left transition-all ${
                  isSel 
                    ? 'bg-gradient-to-br from-teal-500/20 via-cyan-500/15 to-transparent border border-teal-500/50 shadow-xl shadow-teal-500/10' 
                    : 'cyber-card hover:border-slate-700'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSel ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'bg-slate-900 text-slate-400 border border-slate-800'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${isSel ? 'text-white' : 'text-slate-300'}`}>{mode.label}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{mode.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Intake Form Container */}
      <div className="cyber-card rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <Stethoscope className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-bold text-white font-display">
            {analysisType === 'adaptive' ? 'Adaptive AI Patient Intake' : analysisType === 'psychiatric' ? 'Psychiatric Intake & Demographics' : 'Physical Assessment'}
          </h2>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 gap-5">
          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Patient Full Name (Optional)</label>
            <input 
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="e.g. Harshit Singh"
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500/60"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Chief Complaint</label>
            <textarea 
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Describe primary symptoms (e.g. High step-ladder fever, fatigue, dark urine)..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500/60"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Duration</label>
              <select 
                value={symptomDuration}
                onChange={e => setSymptomDuration(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Age</label>
              <input 
                type="number" 
                value={age}
                onChange={e => setAge(e.target.value)}
                placeholder="28"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Sex</label>
              <select 
                value={biologicalSex}
                onChange={e => setBiologicalSex(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
              >
                <option value="">Select Sex</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Height (cm)</label>
                <input 
                  type="number" 
                  value={heightCm}
                  onChange={e => setHeightCm(e.target.value)}
                  placeholder="175"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Weight (kg)</label>
                <input 
                  type="number" 
                  value={weightKg}
                  onChange={e => setWeightKg(e.target.value)}
                  placeholder="70"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>
            </div>

            {bmi && (
              <div className="col-span-full p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Body Mass Index (BMI)</span>
                  <span className="text-lg font-bold font-display text-white">{bmi} kg/m²</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wide border ${getBmiCategory(parseFloat(bmi)).badgeBg}`}>
                  {getBmiCategory(parseFloat(bmi)).label} • {getBmiCategory(parseFloat(bmi)).category}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold text-slate-300 mb-2 uppercase">Known Clinical Diagnoses</label>
            <div className="flex flex-wrap gap-2">
              {['Diabetes T1', 'Diabetes T2', 'Hypertension', 'Hypothyroidism', 'Hyperthyroidism', 'Asthma', 'COPD', 'CKD', 'CAD', 'Epilepsy', 'None'].map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleArrayItem(setKnownDiagnoses, chip)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    knownDiagnoses.includes(chip) 
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40' 
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit & Start Analysis Action */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Ready for AI Clinical Reasoning</span>
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="px-8 py-3.5 bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 animate-shimmer transition-all"
          >
            <span>{isSubmitting ? 'Initializing Pipeline...' : 'Run AI Clinical Reasoning →'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
