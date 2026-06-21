import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Leaf, Car, Home, Utensils, CheckCircle, TrendingDown, 
  Info, ChevronRight, ChevronLeft, Wind, Award, Plane, 
  Zap, BarChart3, Target, Download, Activity, ShieldCheck,
  RefreshCw, AlertCircle
} from 'lucide-react';

// ============================================================================
// 1. PURE FUNCTIONS & DOMAIN LOGIC (Easily Testable)
// ============================================================================

const FACTORS: any = {
  transport: { gas: 0.2, ev: 0.05, public: 0.1, active: 0 }, // kg CO2 per km
  flight: 500, // kg CO2 per flight
  electricity: 0.4, // kg CO2 per kWh
  diet: { meat: 25, mixed: 15, plant: 5 } // kg CO2 per week
};

/**
 * Calculates weekly emissions based on detailed user profile.
 */
export const calculateEmissions = (profile: any) => {
  if (!profile) return null;
  
  // Weekly Transport: (km/day * 5 days) * vehicle factor
  const weeklyTransportKm = (Number(profile.commuteDistance) || 0) * 5;
  const transportEmissions = weeklyTransportKm * (FACTORS.transport[profile.vehicleType] || 0);
  
  // Weekly Flights: (flights/year * factor) / 52
  const flightEmissions = ((Number(profile.flights) || 0) * FACTORS.flight) / 52;
  const totalTransport = transportEmissions + flightEmissions;

  // Weekly Energy: (kWh/month * factor * 12) / 52
  const energyEmissions = ((Number(profile.electricity) || 0) * FACTORS.electricity * 12) / 52;
  
  // Weekly Diet
  const dietEmissions = FACTORS.diet[profile.diet] || 0;
  
  return {
    transport: Number(totalTransport.toFixed(1)),
    energy: Number(energyEmissions.toFixed(1)),
    diet: Number(dietEmissions.toFixed(1)),
    total: Number((totalTransport + energyEmissions + dietEmissions).toFixed(1)),
  };
};

/**
 * Fallback Coach Heuristic Engine (Used if API fails)
 */
export const generateFallbackInsights = (emissions: any, profile: any) => {
  if (!emissions || !profile) return null;
  
  const categories = [
    { name: 'Transport', val: emissions.transport },
    { name: 'Energy', val: emissions.energy },
    { name: 'Diet', val: emissions.diet }
  ].sort((a, b) => b.val - a.val);

  const highest = categories[0];
  const total = emissions.total;
  
  let explanation = "";
  let roadmap: any[] = [];
  let challenge = "Log all your meals this week to understand your diet footprint better.";
  let motivation = "Small changes add up. You're taking the first step by tracking!";

  // Generate Explanations (WHY)
  if (highest.name === 'Transport') {
    explanation = `Your transport emissions are your biggest contributor (${Math.round((highest.val/total)*100)}%). ` + 
      (profile.vehicleType === 'gas' ? `Driving a gas vehicle ${profile.commuteDistance}km daily adds up. ` : '') +
      (profile.flights > 2 ? `Also, taking ${profile.flights} flights a year heavily impacts your footprint.` : '');
    
    roadmap = [
      { priority: 'High', action: 'Transition to hybrid work (1-2 days/week) to cut commute emissions by up to 40%.' },
      { priority: 'Medium', action: 'Evaluate EV or e-bike options for your daily commute.' },
      { priority: 'Ongoing', action: 'Offset carbon for inevitable flights.' }
    ];
    challenge = "Try replacing one car trip with public transit or biking this week.";
    motivation = "Every mile not driven is a direct reduction in carbon. Keep moving forward!";
  } else if (highest.name === 'Energy') {
    explanation = `Home electricity is your primary emission source (${Math.round((highest.val/total)*100)}%). Using ${profile.electricity} kWh monthly suggests heavy HVAC use or inefficient appliances.`;
    roadmap = [
      { priority: 'High', action: 'Switch to a green energy provider or evaluate residential solar.' },
      { priority: 'Medium', action: 'Upgrade to a smart thermostat to optimize heating/cooling.' },
      { priority: 'Ongoing', action: 'Gradually replace old appliances with Energy Star rated equivalents.' }
    ];
    challenge = "Unplug all phantom power devices (chargers, standby appliances) for the week.";
    motivation = "Energy efficiency doesn't mean less comfort, it means smarter consumption.";
  } else {
    explanation = `Dietary choices are your largest carbon source (${Math.round((highest.val/total)*100)}%). ` + 
      (profile.diet === 'meat' ? 'A meat-heavy diet requires significant resources for livestock farming.' : '');
    roadmap = [
      { priority: 'High', action: 'Implement "Meatless Mondays" and scale to 3 plant-based days a week.' },
      { priority: 'Medium', action: 'Source local, seasonal produce to reduce transportation emissions of food.' },
      { priority: 'Ongoing', action: 'Start a home compost bin to reduce methane from food waste in landfills.' }
    ];
    challenge = "Cook three entirely plant-based dinners this week.";
    motivation = "What's good for the planet is often good for your health too!";
  }

  return { explanation, roadmap, challenge, motivation, isFallback: true };
};

// ============================================================================
// 2. GEMINI API INTEGRATION
// ============================================================================

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ""; 

/**
 * Fetches personalized coaching from Gemini API based on user profile and emissions.
 */
async function fetchGeminiCoachInsights(profile: any, emissions: any) {
  if (!profile || !emissions) throw new Error("Missing data for AI generation");

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
  
  const systemPrompt = `You are an expert, empathetic AI Sustainability Coach. 
Your goal is to help the user understand their carbon footprint and motivate them to reduce it.
You will be provided with the user's weekly emissions breakdown and their profile data.

Return ONLY a valid JSON object matching this exact schema, without markdown formatting or code blocks:
{
  "explanation": "A concise, conversational 2-3 sentence explanation of WHY their emissions are structured this way, focusing on their highest category.",
  "roadmap": [
    { "priority": "High" or "Medium" or "Ongoing", "action": "Specific, actionable step to reduce emissions." }
  ],
  "challenge": "One highly specific, achievable weekly challenge to gamify their reduction.",
  "motivation": "A short, encouraging closing sentence."
}
Ensure the roadmap has exactly 3 items.`;

  const userPrompt = `Here is the user data:
Emissions Breakdown (kg CO2/week):
- Transport: ${emissions.transport}
- Home Energy: ${emissions.energy}
- Diet: ${emissions.diet}
- Total: ${emissions.total}

User Profile Details:
- Daily Commute: ${profile.commuteDistance} km
- Vehicle Type: ${profile.vehicleType}
- Yearly Flights: ${profile.flights}
- Monthly Electricity: ${profile.electricity} kWh
- Diet Type: ${profile.diet}

Please generate the coaching JSON.`;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { responseMimeType: "application/json" }
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
     throw new Error(`API Error: ${response.status}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) throw new Error("Invalid response format from Gemini");
  
  return JSON.parse(text);
}

/**
 * Calculates a 0-100 Sustainability Score based on emissions and gamification bonuses.
 */
export const calculateSustainabilityScore = (emissions: any, achievementCount: number) => {
  if (!emissions) return { score: 0, base: 0, bonus: 0 };
  // Baseline: 200kg = 0 base score. 0kg = 100 base score. Every 2kg reduced = 1 point.
  const baseScore = Math.max(0, Math.round(((200 - emissions.total) / 200) * 100));
  const bonus = achievementCount * 5; // 5 bonus points per achievement
  return {
    base: Math.min(100, baseScore),
    bonus: bonus,
    score: Math.min(100, baseScore + bonus)
  };
};

/**
 * Generates a transparent explanation for why the score changed compared to previous assessment.
 */
export const generateScoreExplanation = (latest: any, previous: any) => {
  if (!previous) return "This is your baseline score. Keep tracking your emissions to see how your daily choices improve your score over time!";
  
  const diff = latest.emissions.total - previous.emissions.total;
  if (diff === 0) return "Your footprint remained exactly the same. Check your AI Coach for ideas on what to tackle next to boost your score!";
  
  const isBetter = diff < 0;
  const absDiff = Math.abs(diff).toFixed(1);
  
  // Find biggest mover
  const categories = ['transport', 'energy', 'diet'];
  let biggestChange = categories[0];
  let maxChangeVal = 0;
  
  categories.forEach(cat => {
    const catDiff = latest.emissions[cat] - previous.emissions[cat];
    if (Math.abs(catDiff) > Math.abs(maxChangeVal)) {
      maxChangeVal = catDiff;
      biggestChange = cat;
    }
  });

  if (isBetter) {
    return `Your score improved! You reduced total emissions by ${absDiff} kg compared to last time. Your biggest win was in the ${biggestChange} category.`;
  } else {
    return `Your score dropped. Emissions increased by ${absDiff} kg, mostly driven by higher ${biggestChange} emissions.`;
  }
};

// ============================================================================
// 3. LIGHTWEIGHT TEST RUNNER (Testing Architecture)
// ============================================================================

const runUnitTests = () => {
  let passed = 0;
  let total = 0;
  const errors: string[] = [];

  const assertEqual = (name: string, actual: any, expected: any) => {
    total++;
    if (actual === expected) { passed++; } 
    else { errors.push(`Test [${name}] failed: Expected ${expected}, got ${actual}`); }
  };

  // Test 1: Calculate Emissions (Gas Car, High Energy, Meat)
  const profile1 = { commuteDistance: 20, vehicleType: 'gas', flights: 0, electricity: 500, diet: 'meat' };
  const res1: any = calculateEmissions(profile1);
  assertEqual('Transport Calc (20km * 5 * 0.2)', res1.transport, 20);
  assertEqual('Energy Calc ((500*0.4*12)/52)', Math.round(res1.energy), 46);
  assertEqual('Diet Calc (meat = 25)', res1.diet, 25);

  // Test 2: Calculate Emissions (EV, Low Energy, Plant)
  const profile2 = { commuteDistance: 10, vehicleType: 'ev', flights: 1, electricity: 100, diet: 'plant' };
  const res2: any = calculateEmissions(profile2);
  // Flight: (1 * 500) / 52 = ~9.6. EV commute: (10 * 5 * 0.05) = 2.5. Total transport = 12.1
  assertEqual('EV + Flight Transport Calc', Math.round(res2.transport), 12);

  // Test 3: Recommendation Engine (Fallback)
  const fallbackCoach = generateFallbackInsights(res1, profile1);
  assertEqual('Fallback Coach validates structure', !!fallbackCoach?.explanation, true);

  // Test 4: Sustainability Score Calc
  const scoreData = calculateSustainabilityScore({ total: 100 }, 2); // 100kg -> 50 base + 10 bonus = 60
  assertEqual('Score Base Calc', scoreData.base, 50);
  assertEqual('Score Total Calc', scoreData.score, 60);

  return { passed, total, errors };
};

// ============================================================================
// 4. CUSTOM HOOKS
// ============================================================================

function useLocalStorage(key: string, initialValue: any) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn("localStorage error", error);
      return initialValue;
    }
  });

  const setValue = (value: any) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn("localStorage error", error);
    }
  };
  return [storedValue, setValue];
}

function useKeyboardShortcuts(shortcuts: any[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      shortcuts.forEach(({ key, ctrlKey, altKey, action }) => {
        if (e.key.toLowerCase() === key.toLowerCase() && 
            (ctrlKey ? e.ctrlKey : true) && 
            (altKey ? e.altKey : true)) {
          e.preventDefault();
          action();
        }
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

// ============================================================================
// 5. UI COMPONENTS
// ============================================================================

const Input = ({ label, type = "number", value, onChange, placeholder, min, unit }: any) => (
  <div className="flex flex-col space-y-2">
    <label className="text-sm font-semibold text-slate-700">{label}</label>
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={onChange}
        min={min}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
      />
      {unit && <span className="absolute right-4 top-3 text-slate-400 font-medium">{unit}</span>}
    </div>
  </div>
);

const Select = ({ label, value, onChange, options }: any) => (
  <div className="flex flex-col space-y-2">
    <label className="text-sm font-semibold text-slate-700">{label}</label>
    <select
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none bg-white"
    >
      <option value="" disabled>Select an option</option>
      {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

// ============================================================================
// 6. MAIN APPLICATION
// ============================================================================

export default function App() {
  const [currentView, setCurrentView] = useState('welcome'); // welcome, assessment, dashboard, coach
  const [testResults, setTestResults] = useState<any>(null);
  
  // History state
  const [history, setHistory] = useLocalStorage('ecotrack_history', []);
  
  // Current Assessment state
  const [profile, setProfile] = useState({
    commuteDistance: '', vehicleType: '', flights: '', electricity: '', diet: ''
  });
  
  // AI Coach State
  const [aiInsights, setAiInsights] = useState<any>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  // Run tests on mount
  useEffect(() => {
    setTestResults(runUnitTests());
  }, []);

  // Keyboard Accessibility
  useKeyboardShortcuts([
    { key: 'd', altKey: true, action: () => setCurrentView('dashboard') },
    { key: 'a', altKey: true, action: () => setCurrentView('assessment') },
    { key: 'c', altKey: true, action: () => setCurrentView('coach') }
  ]);

  // Derived data
  const currentEmissions = useMemo(() => calculateEmissions(profile), [profile]);

  // Request AI Insights
  const generateInsights = useCallback(async (forcedProfile?: any, forcedEmissions?: any) => {
    const profToUse = forcedProfile || profile;
    const emToUse = forcedEmissions || currentEmissions;
    
    if (!profToUse.diet || !emToUse) return; // Prevent generating without data

    setIsAiLoading(true);
    setAiError(false);
    
    try {
      const insights = await fetchGeminiCoachInsights(profToUse, emToUse);
      setAiInsights({ ...insights, isFallback: false });
    } catch (error) {
      console.error("Gemini API Error, falling back to heuristics:", error);
      setAiError(true);
      setAiInsights(generateFallbackInsights(emToUse, profToUse));
    } finally {
      setIsAiLoading(false);
    }
  }, [profile, currentEmissions]);

  const saveAssessment = () => {
    const newRecord = {
      id: Date.now(),
      date: new Date().toISOString(),
      profile: {...profile},
      emissions: {...currentEmissions}
    };
    setHistory([...history, newRecord]);
    
    // Trigger AI generation in background so it's ready when they click the tab
    generateInsights(newRecord.profile, newRecord.emissions);
    
    setCurrentView('dashboard');
  };

  const handlePrint = () => {
    window.print();
  };

  // Load insights from history if component mounts and no current profile
  useEffect(() => {
     if (history.length > 0 && !profile.diet && !aiInsights && !isAiLoading) {
         const latest = history[history.length - 1];
         setProfile(latest.profile);
         generateInsights(latest.profile, latest.emissions);
     }
  }, [history, profile, aiInsights, isAiLoading, generateInsights]);

  // Achievement Logic
  const achievements = useMemo(() => {
    const unlocked = [];
    if (history.length >= 1) unlocked.push({ title: 'Green Starter', icon: <Leaf />, desc: 'Completed first assessment' });
    if (history.length >= 2 && history[history.length-1].emissions.total < history[history.length-2].emissions.total) {
      unlocked.push({ title: 'Carbon Reducer', icon: <TrendingDown />, desc: 'Reduced footprint compared to last time' });
    }
    if (history.some((h: any) => h.emissions.total < 80)) {
      unlocked.push({ title: 'Eco Warrior', icon: <ShieldCheck />, desc: 'Achieved a low weekly footprint (<80kg)' });
    }
    if (history.some((h: any) => h.emissions.total < 40)) {
      unlocked.push({ title: 'Net Zero Champion', icon: <Target />, desc: 'Incredible! Exceptionally low footprint (<40kg)' });
    }
    return unlocked;
  }, [history]);

  // --- VIEWS ---

  const renderWelcome = () => (
    <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto py-16 motion-safe:animate-fade-in">
      <div className="bg-emerald-100 p-6 rounded-full shadow-inner mb-4">
        <Wind className="w-16 h-16 text-emerald-600" />
      </div>
      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
        Next-Gen <span className="text-emerald-600">Sustainability Platform</span>
      </h1>
      <p className="text-lg text-slate-600 max-w-xl leading-relaxed">
        Track your history, get AI-powered coaching, and earn achievements as you navigate towards a net-zero lifestyle.
      </p>
      
      {testResults && testResults.errors.length === 0 && (
        <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>System Tests Passed ({testResults.passed}/{testResults.total})</span>
        </div>
      )}

      <div className="pt-8 flex flex-col sm:flex-row gap-4 w-full justify-center">
        <button 
          onClick={() => setCurrentView('assessment')}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 flex items-center justify-center"
        >
          New Assessment <ChevronRight className="ml-2 w-5 h-5" />
        </button>
        {history.length > 0 && (
          <button 
            onClick={() => setCurrentView('dashboard')}
            className="bg-white border-2 border-slate-200 hover:border-emerald-500 text-slate-700 px-8 py-4 rounded-xl font-medium transition-all flex items-center justify-center"
          >
            View Dashboard
          </button>
        )}
      </div>
    </div>
  );

  const renderAssessment = () => {
    const isComplete = profile.commuteDistance && profile.vehicleType && profile.flights && profile.electricity && profile.diet;

    return (
      <div className="max-w-3xl mx-auto py-8 motion-safe:animate-fade-in print-hidden">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Carbon Calculator</h2>
            <p className="text-slate-500 mt-1">Detailed precision for realistic tracking.</p>
          </div>
          <button onClick={() => setCurrentView('welcome')} className="text-slate-400 hover:text-slate-600"><ChevronLeft className="w-6 h-6"/></button>
        </header>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 space-y-8">
          
          <section className="space-y-4">
            <h3 className="text-xl font-bold flex items-center text-slate-800 border-b pb-2"><Car className="mr-2 text-blue-500"/> Transport & Travel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input 
                label="Daily Commute Distance" 
                value={profile.commuteDistance} 
                onChange={(e: any) => setProfile({...profile, commuteDistance: e.target.value})} 
                placeholder="e.g. 15" unit="km" min="0" 
              />
              <Select 
                label="Primary Vehicle Type" 
                value={profile.vehicleType} 
                onChange={(e: any) => setProfile({...profile, vehicleType: e.target.value})}
                options={[
                  { value: 'gas', label: 'Gas/Diesel Car' },
                  { value: 'ev', label: 'Electric Vehicle' },
                  { value: 'public', label: 'Public Transit' },
                  { value: 'active', label: 'Walking/Biking' }
                ]}
              />
              <Input 
                label="Flights per Year" 
                value={profile.flights} 
                onChange={(e: any) => setProfile({...profile, flights: e.target.value})} 
                placeholder="e.g. 2" min="0"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold flex items-center text-slate-800 border-b pb-2"><Home className="mr-2 text-purple-500"/> Energy Use</h3>
            <Input 
              label="Monthly Electricity Bill/Usage" 
              value={profile.electricity} 
              onChange={(e: any) => setProfile({...profile, electricity: e.target.value})} 
              placeholder="e.g. 300" unit="kWh" min="0"
            />
          </section>

          <section className="space-y-4">
            <h3 className="text-xl font-bold flex items-center text-slate-800 border-b pb-2"><Utensils className="mr-2 text-orange-500"/> Dietary Habits</h3>
            <Select 
              label="General Diet Type" 
              value={profile.diet} 
              onChange={(e: any) => setProfile({...profile, diet: e.target.value})}
              options={[
                { value: 'meat', label: 'Meat Heavy (Daily)' },
                { value: 'mixed', label: 'Flexitarian/Mixed (Occasional)' },
                { value: 'plant', label: 'Plant-based/Vegan' }
              ]}
            />
          </section>

          <div className="pt-6 border-t flex justify-end">
             <button 
                onClick={saveAssessment}
                disabled={!isComplete}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center"
              >
                Analyze & Save <Activity className="ml-2 w-5 h-5" />
              </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => {
    if (history.length === 0) return <div className="text-center py-20">No history yet. Take an assessment!</div>;
    
    const latest: any = history[history.length - 1];
    const previous: any = history.length > 1 ? history[history.length - 2] : null;
    const maxHistorical = Math.max(...history.map((h: any) => h.emissions.total), 1); 

    // Score calculations
    const currentScoreData = calculateSustainabilityScore(latest.emissions, achievements.length);
    const previousScoreData = previous ? calculateSustainabilityScore(previous.emissions, achievements.length > 1 ? achievements.length - 1 : 0) : null;
    const scoreExplanation = generateScoreExplanation(latest, previous);
    const scoreDiff = previousScoreData ? currentScoreData.score - previousScoreData.score : 0;

    return (
      <div className="max-w-5xl mx-auto py-8 motion-safe:animate-fade-in space-y-8" id="report-content">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b pb-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Analytics Dashboard</h2>
            <p className="text-slate-500 mt-1">Track your progress and export your sustainability report.</p>
          </div>
          <div className="flex gap-3 print-hidden">
            <button onClick={handlePrint} className="flex items-center text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors">
              <Download className="w-4 h-4 mr-2" /> Export PDF
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <section className="lg:col-span-2 space-y-8">
            
            <article className="bg-gradient-to-br from-emerald-600 to-teal-800 rounded-3xl p-8 shadow-xl text-white relative overflow-hidden print-text-black print-bg-white print-border">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none print-hidden">
                <Target className="w-48 h-48 text-white" />
              </div>
              
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 relative z-10">
                <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center bg-white/10 rounded-full border-4 border-emerald-400/30 shadow-inner">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-white/20"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="currentColor" strokeWidth="3"
                    />
                    <path
                      className="text-emerald-300 transition-all duration-1000 ease-out"
                      strokeDasharray={`${currentScoreData.score}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke="currentColor" strokeWidth="3"
                    />
                  </svg>
                  <div className="text-center">
                    <span className="text-4xl font-black">{currentScoreData.score}</span>
                    <span className="block text-[10px] uppercase tracking-wider text-emerald-200 mt-1">Score</span>
                  </div>
                </div>

                <div className="flex-1 space-y-3 w-full text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <h3 className="text-2xl font-bold">Sustainability Score</h3>
                    {scoreDiff !== 0 && (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${scoreDiff > 0 ? 'bg-emerald-400/20 text-emerald-200' : 'bg-red-400/20 text-red-200'}`}>
                        {scoreDiff > 0 ? '↑' : '↓'} {Math.abs(scoreDiff)} pts
                      </span>
                    )}
                  </div>
                  
                  <div className="bg-black/20 p-4 rounded-2xl text-emerald-50 text-sm leading-relaxed border border-white/10 text-left">
                    {scoreExplanation}
                  </div>

                  <div className="flex flex-wrap justify-center sm:justify-start gap-3 text-xs text-emerald-200/80 font-medium">
                    <span className="bg-white/10 px-2 py-1 rounded-md">Base: {currentScoreData.base}/100</span>
                    <span className="bg-white/10 px-2 py-1 rounded-md">Achievement Bonus: +{currentScoreData.bonus} pts</span>
                  </div>
                </div>
              </div>
            </article>

            <article className="bg-slate-900 rounded-3xl p-8 shadow-xl text-white relative overflow-hidden print-text-black print-bg-white print-border">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none print-hidden">
                <Wind className="w-48 h-48 text-emerald-400" />
              </div>
              
              <h3 className="text-lg font-semibold text-emerald-400 uppercase tracking-wide mb-2">Current Weekly Footprint</h3>
              <div className="flex items-baseline mb-8">
                <span className="text-7xl font-black">{latest.emissions.total}</span>
                <span className="text-xl text-slate-400 ml-3 font-medium">kg CO₂e</span>
              </div>

              <div className="space-y-4 relative z-10" aria-label="Footprint breakdown chart">
                <div className="flex justify-between text-sm font-medium mb-1">
                  <span className="flex items-center text-blue-300"><Car className="w-4 h-4 mr-1"/> {latest.emissions.transport}</span>
                  <span className="flex items-center text-orange-300"><Utensils className="w-4 h-4 mr-1"/> {latest.emissions.diet}</span>
                  <span className="flex items-center text-purple-300"><Zap className="w-4 h-4 mr-1"/> {latest.emissions.energy}</span>
                </div>
                
                <div className="w-full h-6 flex rounded-full overflow-hidden bg-slate-800 shadow-inner">
                  <div className="bg-blue-500 transition-all duration-1000" style={{ width: `${(latest.emissions.transport / latest.emissions.total) * 100}%` }}></div>
                  <div className="bg-orange-500 transition-all duration-1000" style={{ width: `${(latest.emissions.diet / latest.emissions.total) * 100}%` }}></div>
                  <div className="bg-purple-500 transition-all duration-1000" style={{ width: `${(latest.emissions.energy / latest.emissions.total) * 100}%` }}></div>
                </div>
              </div>
            </article>

            <div className="bg-white rounded-3xl p-8 border border-slate-200">
              <h3 className="text-xl font-bold mb-6 flex items-center"><BarChart3 className="mr-2 text-slate-400"/> History Trends</h3>
              <div className="h-48 flex items-end justify-between space-x-2 pt-4 border-b border-slate-100 pb-2">
                {history.map((record: any) => (
                  <div key={record.id} className="relative group flex-1 flex flex-col items-center justify-end h-full">
                    <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs py-1.5 px-3 rounded-lg whitespace-nowrap pointer-events-none print-hidden z-10 shadow-xl text-center">
                      <span className="font-bold">{record.emissions.total} kg</span> CO₂<br/>
                      Score: <span className="text-emerald-400 font-bold">{calculateSustainabilityScore(record.emissions, achievements.length).score}</span><br/>
                      {new Date(record.date).toLocaleDateString()}
                    </div>
                    <div 
                      className="w-full mx-1 bg-emerald-500 rounded-t-sm transition-all duration-700 motion-reduce:transition-none hover:bg-emerald-400" 
                      style={{ height: `${(record.emissions.total / maxHistorical) * 100}%`, minHeight: '4px' }}
                    ></div>
                    <div className="text-[10px] text-slate-400 mt-2 truncate w-full text-center hidden sm:block">
                      {new Date(record.date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-8">
            <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100 print-break-inside">
              <h3 className="text-xl font-bold text-emerald-900 flex items-center mb-6"><Award className="mr-2 text-emerald-600"/> Achievements</h3>
              <div className="space-y-4">
                {achievements.length > 0 ? achievements.map((ach: any, i) => (
                  <div key={i} className="flex items-start bg-white p-4 rounded-xl shadow-sm border border-emerald-100">
                    <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600 mr-4 shrink-0">{ach.icon}</div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{ach.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">{ach.desc}</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-emerald-700 italic">Complete assessments to earn badges.</p>
                )}
              </div>
            </div>
          </aside>

        </div>
      </div>
    );
  };

  const renderCoach = () => {
    if (history.length === 0) return <div className="text-center py-20 text-slate-600">Please complete an assessment first.</div>;
    
    if (isAiLoading) return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <RefreshCw className="w-12 h-12 text-emerald-500 animate-spin" />
        <p className="text-lg font-medium text-slate-600">Gemini AI is analyzing your footprint...</p>
      </div>
    );

    if (!aiInsights) return (
       <div className="flex flex-col items-center justify-center py-32 space-y-4">
         <button onClick={() => generateInsights()} className="bg-emerald-600 text-white px-6 py-3 rounded-lg hover:bg-emerald-700">
            Generate Insights
         </button>
       </div>
    );
    
    return (
      <div className="max-w-4xl mx-auto py-8 motion-safe:animate-fade-in print-hidden">
        <header className="mb-8 text-center">
          <div className="inline-block p-4 bg-blue-100 text-blue-600 rounded-full mb-4 relative">
            <Info className="w-10 h-10" />
            {!aiInsights.isFallback && <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest shadow-sm">AI</span>}
          </div>
          <h2 className="text-3xl font-bold text-slate-900">Sustainability Coach</h2>
          <p className="text-slate-500 mt-2">
            {aiInsights.isFallback ? "Standard insights based on your latest profile." : "Personalized insights powered by Gemini AI."}
          </p>
          
          {aiError && (
             <div className="mt-4 inline-flex items-center text-amber-700 bg-amber-50 px-4 py-2 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4 mr-2" />
                API connection failed. Showing standard recommendations.
             </div>
          )}
        </header>

        <div className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-slate-200 space-y-10">
          
          <section>
            <h3 className="text-xl font-bold text-slate-800 border-b pb-4 mb-4 flex items-center">Diagnostic</h3>
            <p className="text-lg text-slate-700 leading-relaxed bg-slate-50 p-6 rounded-2xl border border-slate-100">
              {aiInsights.explanation}
            </p>
          </section>

          <section>
            <h3 className="text-xl font-bold text-slate-800 border-b pb-4 mb-6">Your Customized Roadmap</h3>
            <div className="space-y-4">
              {aiInsights.roadmap.map((item: any, idx: number) => (
                <div key={idx} className="flex items-start p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className={`mt-0.5 px-3 py-1 text-xs font-bold rounded-full mr-4 shrink-0
                    ${item.priority === 'High' ? 'bg-red-100 text-red-700' : 
                      item.priority === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {item.priority}
                  </div>
                  <p className="text-slate-700 font-medium">{item.action}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            <section className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
              <h3 className="text-lg font-bold text-emerald-900 mb-2 flex items-center"><Target className="w-5 h-5 mr-2" /> Weekly Challenge</h3>
              <p className="text-emerald-800 font-medium">{aiInsights.challenge}</p>
            </section>
            
            <section className="bg-blue-50 rounded-2xl p-6 border border-blue-100 flex flex-col justify-center text-center">
               <p className="text-blue-800 font-bold italic text-lg">"{aiInsights.motivation}"</p>
            </section>
          </div>

        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-200 selection:text-emerald-900">
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background: white; }
          .print-hidden { display: none !important; }
          .print-text-black { color: black !important; }
          .print-bg-white { background: white !important; }
          .print-border { border: 1px solid #ccc !important; box-shadow: none !important; }
          .print-break-inside { page-break-inside: avoid; }
        }
      `}} />

      <nav className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-50 print-hidden">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <button 
            onClick={() => setCurrentView('welcome')} 
            className="flex items-center focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded p-1"
            aria-label="Home"
          >
            <Leaf className="w-6 h-6 text-emerald-600 mr-2" />
            <span className="font-bold text-xl tracking-tight text-slate-800">EcoTrack</span>
          </button>
          
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg" role="tablist">
            {[
              { id: 'assessment', label: 'Assessment (Alt+A)' },
              { id: 'dashboard', label: 'Dashboard (Alt+D)' },
              { id: 'coach', label: 'AI Coach (Alt+C)' }
            ].map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={currentView === tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all relative ${
                  currentView === tab.id 
                    ? 'bg-white text-emerald-700 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                {tab.label.split(' ')[0]}
                {tab.id === 'coach' && isAiLoading && <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="px-4 py-8" aria-live="polite">
        {currentView === 'welcome' && renderWelcome()}
        {currentView === 'assessment' && renderAssessment()}
        {currentView === 'dashboard' && renderDashboard()}
        {currentView === 'coach' && renderCoach()}
      </main>

    </div>
  );
}