import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Stethoscope, Brain, HeartPulse, Check, AlertTriangle } from 'lucide-react';
import { useCDSI } from '../context/CDSIContext';
import { useStartAnalysis, type IntakeFormData, type IntakeFormDataAnalysisType } from '@workspace/api-client-react';
import { PHQ9_QUESTIONS, GAD7_QUESTIONS } from '../translations';

export default function Intake() {
  const { jobId, language } = useCDSI();
  const [, setLocation] = useLocation();
  const startAnalysis = useStartAnalysis();
  const [errorMsg, setErrorMsg] = useState('');

  const [analysisType, setAnalysisType] = useState<IntakeFormDataAnalysisType | null>(null);
  
  // Physical State
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptomDuration, setSymptomDuration] = useState('days');
  const [age, setAge] = useState('');
  const [biologicalSex, setBiologicalSex] = useState('Female');
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

  const isFormValid = analysisType !== null;

  const onSubmit = () => {
    if (!analysisType || !jobId) return;

    const intakeData: IntakeFormData = {
      analysisType,
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
      phq9Answers: phq9Answers.some(a => a > -1) ? phq9Answers.map(a => a === -1 ? 0 : a) : undefined,
      gad7Answers: gad7Answers.some(a => a > -1) ? gad7Answers.map(a => a === -1 ? 0 : a) : undefined,
      sleepQuality: sleepQuality ? parseInt(sleepQuality, 10) : null,
      appetiteChanges,
      lifeStressors,
      lifeStressorsDetails: lifeStressors ? lifeStressorsDetails : null,
      previousMentalHealthDiagnosis,
      mentalHealthDiagnosisDetails: previousMentalHealthDiagnosis ? mentalHealthDiagnosisDetails : null
    };

    setErrorMsg('');
    startAnalysis.mutate({ data: { jobId, intakeData, language } }, {
      onSuccess: () => {
        setLocation('/processing');
      },
      onError: (err: any) => {
        console.error('Analysis start failed:', err);
        setErrorMsg(err.message || 'Failed to start clinical analysis. Please try again.');
      }
    });
  };

  return (
    <div className="w-full flex flex-col gap-10 pb-32">
      <div className="flex flex-col gap-2 pt-6">
        <h1 className="text-3xl font-semibold text-[#111827]">Patient Intake</h1>
        <p className="text-[#6B7280]">Select the analysis type and provide context to guide the AI decision support.</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-[#FEF2F2] border border-[#DC2626] rounded-md flex items-center gap-3 text-[#DC2626]">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* Analysis Type */}
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-[#111827] uppercase tracking-wider">Analysis Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setAnalysisType('physical')}
            className={`p-6 border rounded-xl flex flex-col items-center gap-3 transition-all ${
              analysisType === 'physical' ? 'border-[#16A34A] bg-[#F0FDF4] shadow-sm' : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
            }`}
          >
            <div className={`p-3 rounded-full ${analysisType === 'physical' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FAFAFA] text-[#6B7280]'}`}>
              <Stethoscope className="w-6 h-6" />
            </div>
            <span className={`font-medium ${analysisType === 'physical' ? 'text-[#16A34A]' : 'text-[#111827]'}`}>Physical Health Only</span>
          </button>
          
          <button
            onClick={() => setAnalysisType('psychiatric')}
            className={`p-6 border rounded-xl flex flex-col items-center gap-3 transition-all ${
              analysisType === 'psychiatric' ? 'border-[#16A34A] bg-[#F0FDF4] shadow-sm' : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
            }`}
          >
            <div className={`p-3 rounded-full ${analysisType === 'psychiatric' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FAFAFA] text-[#6B7280]'}`}>
              <Brain className="w-6 h-6" />
            </div>
            <span className={`font-medium ${analysisType === 'psychiatric' ? 'text-[#16A34A]' : 'text-[#111827]'}`}>Psychiatric Only</span>
          </button>

          <button
            onClick={() => setAnalysisType('both')}
            className={`p-6 border rounded-xl flex flex-col items-center gap-3 transition-all ${
              analysisType === 'both' ? 'border-[#16A34A] bg-[#F0FDF4] shadow-sm' : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
            }`}
          >
            <div className={`p-3 rounded-full flex gap-1 ${analysisType === 'both' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FAFAFA] text-[#6B7280]'}`}>
              <HeartPulse className="w-6 h-6" />
              <Brain className="w-6 h-6" />
            </div>
            <span className={`font-medium ${analysisType === 'both' ? 'text-[#16A34A]' : 'text-[#111827]'}`}>Physical + Psychiatric</span>
          </button>
        </div>
      </div>

      {/* Forms */}
      {analysisType && (
        <div className="flex flex-col gap-10">
          {/* Physical Block */}
          {(analysisType === 'physical' || analysisType === 'both') && (
            <div className="flex flex-col gap-8 bg-white p-8 rounded-xl border border-[#E5E7EB]">
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4">
                <Stethoscope className="w-5 h-5 text-[#6B7280]" />
                <h2 className="text-xl font-semibold text-[#111827]">Physical Assessment</h2>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-2">Chief Complaint</label>
                  <textarea 
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    maxLength={300}
                    rows={3}
                    placeholder="Describe the primary reason for the visit..."
                    className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A] focus:border-[#16A34A]"
                  />
                  <div className="text-xs text-[#6B7280] text-right mt-1">{chiefComplaint.length} / 300</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Duration</label>
                    <select 
                      value={symptomDuration}
                      onChange={e => setSymptomDuration(e.target.value)}
                      className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                    >
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Age</label>
                    <input 
                      type="number" 
                      value={age}
                      onChange={e => setAge(e.target.value)}
                      className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Sex</label>
                    <select 
                      value={biologicalSex}
                      onChange={e => setBiologicalSex(e.target.value)}
                      className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                    >
                      <option value="Female">Female</option>
                      <option value="Male">Male</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-[#111827] mb-2">Height (cm)</label>
                      <input 
                        type="number" 
                        value={heightCm}
                        onChange={e => setHeightCm(e.target.value)}
                        className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-[#111827] mb-2">Weight (kg)</label>
                      <input 
                        type="number" 
                        value={weightKg}
                        onChange={e => setWeightKg(e.target.value)}
                        className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                      />
                    </div>
                  </div>
                  {bmi && (
                    <div className="col-span-full text-sm text-[#6B7280]">
                      Calculated BMI: <span className="font-medium text-[#111827]">{bmi}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-2">Known Diagnoses</label>
                  <div className="flex flex-wrap gap-2">
                    {['Diabetes T1', 'Diabetes T2', 'Hypertension', 'Hypothyroidism', 'Hyperthyroidism', 'Asthma', 'COPD', 'CKD', 'CAD', 'Epilepsy', 'None', 'Other'].map(chip => (
                      <button
                        key={chip}
                        onClick={() => toggleArrayItem(setKnownDiagnoses, chip)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                          knownDiagnoses.includes(chip) ? 'bg-[#DCFCE7] text-[#16A34A] border-[#16A34A]' : 'bg-[#FAFAFA] text-[#6B7280] border-[#E5E7EB] hover:bg-white hover:border-[#D1D5DB]'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Current Medications</label>
                    <textarea 
                      value={currentMedications}
                      onChange={e => setCurrentMedications(e.target.value)}
                      placeholder="e.g. Metformin 500mg BID"
                      rows={2}
                      className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Known Allergies</label>
                    <textarea 
                      value={knownAllergies}
                      onChange={e => setKnownAllergies(e.target.value)}
                      placeholder="e.g. Penicillin"
                      rows={2}
                      className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                    />
                  </div>
                </div>

                <div className="bg-[#FAFAFA] rounded-md p-4 flex flex-col gap-3 border border-[#E5E7EB]">
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-[#111827]">Recent Surgeries</label>
                    <div className="flex bg-white border border-[#E5E7EB] rounded-md overflow-hidden">
                      <button 
                        onClick={() => setRecentSurgeries(true)} 
                        className={`px-4 py-1 text-sm font-medium ${recentSurgeries ? 'bg-[#16A34A] text-white' : 'text-[#6B7280] hover:bg-gray-50'}`}
                      >Yes</button>
                      <button 
                        onClick={() => { setRecentSurgeries(false); setRecentSurgeriesDetails(''); }} 
                        className={`px-4 py-1 text-sm font-medium ${!recentSurgeries ? 'bg-[#E5E7EB] text-[#111827]' : 'text-[#6B7280] hover:bg-gray-50'}`}
                      >No</button>
                    </div>
                  </div>
                  {recentSurgeries && (
                    <input 
                      type="text" 
                      value={recentSurgeriesDetails}
                      onChange={e => setRecentSurgeriesDetails(e.target.value)}
                      placeholder="Describe recent surgeries..."
                      className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-2">Family History</label>
                  <div className="flex flex-wrap gap-2">
                    {['Diabetes', 'Hypertension', 'Cancer', 'Heart disease', 'Stroke', 'None'].map(chip => (
                      <button
                        key={chip}
                        onClick={() => toggleArrayItem(setFamilyHistory, chip)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                          familyHistory.includes(chip) ? 'bg-[#DCFCE7] text-[#16A34A] border-[#16A34A]' : 'bg-[#FAFAFA] text-[#6B7280] border-[#E5E7EB] hover:bg-white hover:border-[#D1D5DB]'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Smoking History</label>
                    <div className="flex gap-2">
                      {['Never', 'Ex-smoker', 'Current'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setSmoking(opt)}
                          className={`px-4 py-2 rounded-md text-sm font-medium border ${
                            smoking === opt ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-gray-50'
                          }`}
                        >{opt}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#111827] mb-2">Alcohol Consumption</label>
                    <div className="flex gap-2">
                      {['None', 'Occasional', 'Regular'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setAlcohol(opt)}
                          className={`px-4 py-2 rounded-md text-sm font-medium border ${
                            alcohol === opt ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-gray-50'
                          }`}
                        >{opt}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Psychiatric Block */}
          {(analysisType === 'psychiatric' || analysisType === 'both') && (
            <div className="flex flex-col gap-8 bg-white p-8 rounded-xl border border-[#E5E7EB]">
              <div className="flex items-center gap-3 border-b border-[#E5E7EB] pb-4">
                <Brain className="w-5 h-5 text-[#6B7280]" />
                <h2 className="text-xl font-semibold text-[#111827]">Psychiatric Assessment</h2>
              </div>

              {/* PHQ-9 */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#111827]">PHQ-9 (Depression)</h3>
                  <div className="bg-[#FAFAFA] px-3 py-1 rounded-md border border-[#E5E7EB] text-sm font-medium">
                    Score: {phq9Score} / 27
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {PHQ9_QUESTIONS.map((q, idx) => (
                    <div key={`phq9-${idx}`} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border border-[#E5E7EB] rounded-md bg-[#FAFAFA]">
                      <p className="text-sm font-medium text-[#111827] flex-1">{idx + 1}. {q}</p>
                      <div className="flex flex-wrap gap-2">
                        {['Not at all', 'Several days', 'More than half', 'Nearly every day'].map((opt, val) => (
                          <button
                            key={val}
                            onClick={() => handlePhq9Answer(idx, val)}
                            className={`px-3 py-1.5 rounded text-xs font-medium border ${
                              phq9Answers[idx] === val ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-gray-50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* GAD-7 */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#111827]">GAD-7 (Anxiety)</h3>
                  <div className="bg-[#FAFAFA] px-3 py-1 rounded-md border border-[#E5E7EB] text-sm font-medium">
                    Score: {gad7Score} / 21
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {GAD7_QUESTIONS.map((q, idx) => (
                    <div key={`gad7-${idx}`} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 border border-[#E5E7EB] rounded-md bg-[#FAFAFA]">
                      <p className="text-sm font-medium text-[#111827] flex-1">{idx + 1}. {q}</p>
                      <div className="flex flex-wrap gap-2">
                        {['Not at all', 'Several days', 'More than half', 'Nearly every day'].map((opt, val) => (
                          <button
                            key={val}
                            onClick={() => handleGad7Answer(idx, val)}
                            className={`px-3 py-1.5 rounded text-xs font-medium border ${
                              gad7Answers[idx] === val ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-gray-50'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-2">Sleep Quality (1-10)</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" max="10" 
                      value={sleepQuality}
                      onChange={e => setSleepQuality(e.target.value)}
                      className="flex-1 accent-[#16A34A]"
                    />
                    <span className="font-semibold text-[#16A34A] w-6 text-center">{sleepQuality}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#6B7280] mt-1">
                    <span>Poor</span>
                    <span>Excellent</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-[#111827] mb-2">Appetite Changes</label>
                  <div className="flex gap-2">
                    {['Decreased', 'Normal', 'Increased'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => setAppetiteChanges(opt)}
                        className={`px-4 py-2 rounded-md text-sm font-medium border ${
                          appetiteChanges === opt ? 'bg-[#16A34A] text-white border-[#16A34A]' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-gray-50'
                        }`}
                      >{opt}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-[#FAFAFA] rounded-md p-4 flex flex-col gap-3 border border-[#E5E7EB]">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-[#111827]">Significant Life Stressors</label>
                  <div className="flex bg-white border border-[#E5E7EB] rounded-md overflow-hidden">
                    <button 
                      onClick={() => setLifeStressors(true)} 
                      className={`px-4 py-1 text-sm font-medium ${lifeStressors ? 'bg-[#16A34A] text-white' : 'text-[#6B7280] hover:bg-gray-50'}`}
                    >Yes</button>
                    <button 
                      onClick={() => { setLifeStressors(false); setLifeStressorsDetails(''); }} 
                      className={`px-4 py-1 text-sm font-medium ${!lifeStressors ? 'bg-[#E5E7EB] text-[#111827]' : 'text-[#6B7280] hover:bg-gray-50'}`}
                    >No</button>
                  </div>
                </div>
                {lifeStressors && (
                  <input 
                    type="text" 
                    value={lifeStressorsDetails}
                    onChange={e => setLifeStressorsDetails(e.target.value)}
                    placeholder="Briefly describe recent stressors..."
                    className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                  />
                )}
              </div>

              <div className="bg-[#FAFAFA] rounded-md p-4 flex flex-col gap-3 border border-[#E5E7EB]">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-[#111827]">Previous Mental Health Diagnosis</label>
                  <div className="flex bg-white border border-[#E5E7EB] rounded-md overflow-hidden">
                    <button 
                      onClick={() => setPreviousMentalHealthDiagnosis(true)} 
                      className={`px-4 py-1 text-sm font-medium ${previousMentalHealthDiagnosis ? 'bg-[#16A34A] text-white' : 'text-[#6B7280] hover:bg-gray-50'}`}
                    >Yes</button>
                    <button 
                      onClick={() => { setPreviousMentalHealthDiagnosis(false); setMentalHealthDiagnosisDetails(''); }} 
                      className={`px-4 py-1 text-sm font-medium ${!previousMentalHealthDiagnosis ? 'bg-[#E5E7EB] text-[#111827]' : 'text-[#6B7280] hover:bg-gray-50'}`}
                    >No</button>
                  </div>
                </div>
                {previousMentalHealthDiagnosis && (
                  <input 
                    type="text" 
                    value={mentalHealthDiagnosisDetails}
                    onChange={e => setMentalHealthDiagnosisDetails(e.target.value)}
                    placeholder="Condition and current/past treatment..."
                    className="w-full border border-[#E5E7EB] rounded-md px-3 py-2 text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 md:left-[240px] bg-white/80 backdrop-blur-md border-t border-[#E5E7EB] p-4 flex justify-center z-40">
        <div className="w-full max-w-[1100px] flex justify-end">
          <button 
            onClick={onSubmit}
            disabled={!isFormValid || startAnalysis.isPending || !jobId}
            className={`px-8 py-3 rounded-md font-medium text-white transition-colors flex items-center gap-2 ${
              (!isFormValid || !jobId) 
                ? 'bg-[#E5E7EB] text-[#6B7280] cursor-not-allowed' 
                : 'bg-[#16A34A] hover:bg-green-700 shadow-sm'
            }`}
          >
            {startAnalysis.isPending && (
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            Start Clinical Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
