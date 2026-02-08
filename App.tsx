import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DoctorList from './pages/DoctorList';
import DoctorProfile from './pages/DoctorProfile';
import ExecutiveCalendar from './pages/ExecutiveCalendar';
import ProceduresManager from './pages/ProceduresManager';
import Login from './components/Login';
import { parseData } from './constants';
import { Doctor, User, Procedure, TimeOffEvent } from './types';
import { Menu, RefreshCw, CheckCircle2 } from 'lucide-react';

const STORAGE_KEYS = {
    USER: 'rc_medicall_user_v5',
    SIDEBAR: 'rc_medicall_sidebar_collapsed',
    TIMEOFF: 'rc_medicall_timeoff_v5'
};

const API_URL = '/api';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
      const savedState = localStorage.getItem(STORAGE_KEYS.SIDEBAR);
      return savedState === 'true';
  });
  
  // Smart Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncVersion, setLastSyncVersion] = useState({ doctors: '', procedures: '' });
  const isImportingRef = useRef(false);

  const toggleSidebar = () => {
      const newState = !isSidebarCollapsed;
      setIsSidebarCollapsed(newState);
      localStorage.setItem(STORAGE_KEYS.SIDEBAR, String(newState));
  };

  // Helper for safe JSON parsing
  const safeJson = async (res: Response) => {
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
          return res.json();
      }
      throw new Error(`Invalid response format: ${contentType}`);
  };

  // Function to fetch full data (heavy operation)
  const fetchFullData = async () => {
      try {
          setIsSyncing(true);
          const [docsRes, procsRes] = await Promise.all([
              fetch(`${API_URL}/doctors`),
              fetch(`${API_URL}/procedures`)
          ]);

          if (docsRes.ok && procsRes.ok) {
              const docs = await safeJson(docsRes);
              const procs = await safeJson(procsRes);
              setDoctors(docs);
              setProcedures(procs);
              return true;
          }
      } catch (error) {
          console.error("Error fetching full data:", error);
      } finally {
          setIsSyncing(false);
          setLoading(false);
      }
      return false;
  };

  // Smart Sync: Check if update is needed (Lightweight)
  const checkAndSync = async () => {
      if (isImportingRef.current || !user) return;

      try {
          // Poll the lightweight status endpoint
          const res = await fetch(`${API_URL}/sync-status`);
          if (res.ok) {
              const status = await safeJson(res);
              
              // Only fetch full data if server version is newer than local version
              if (status.doctorsVersion !== lastSyncVersion.doctors || 
                  status.proceduresVersion !== lastSyncVersion.procedures) {
                  
                  console.log("New data detected, syncing...");
                  const success = await fetchFullData();
                  
                  if (success) {
                      setLastSyncVersion({
                          doctors: status.doctorsVersion,
                          procedures: status.proceduresVersion
                      });
                  }
              }
          }
      } catch (error) {
          // Silent fail for background sync
          // console.warn("Sync check failed:", error); 
      }
  };

  // --- CARGA INICIAL & POLLING ---
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) setUser(JSON.parse(savedUser));

    // Initial load
    fetchFullData().then(() => {
        // After initial load, get the current version to establish baseline
        fetch(`${API_URL}/sync-status`)
            .then(res => {
                if(res.ok && res.headers.get("content-type")?.includes("application/json")) return res.json();
                throw new Error("Invalid sync-status response");
            })
            .then(status => {
                setLastSyncVersion({
                    doctors: status.doctorsVersion,
                    procedures: status.proceduresVersion
                });
            })
            .catch(e => console.warn("Initial sync-status check failed"));
    });

    // Smart Polling interval (Every 10 seconds check for changes)
    const interval = setInterval(checkAndSync, 10000);

    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = (loggedInUser: User) => {
      setUser(loggedInUser);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
      setUser(null);
      localStorage.removeItem(STORAGE_KEYS.USER);
  };

  // --- API CRUD HANDLERS ---

  const addDoctor = async (newDoctor: Doctor) => {
      setDoctors(prev => [newDoctor, ...prev]);
      try {
          await fetch(`${API_URL}/doctors`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newDoctor)
          });
          // Trigger immediate sync check
          setTimeout(checkAndSync, 500); 
      } catch (e) { console.error("Save failed", e); }
  };

  const updateDoctor = async (updatedDoctor: Doctor) => {
    setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d));
    try {
        await fetch(`${API_URL}/doctors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedDoctor)
        });
        setTimeout(checkAndSync, 500);
    } catch (e) { console.error("Update failed", e); }
  };

  const handleBatchUpdate = async (updatedDoctors: Doctor[]) => {
      setDoctors(prev => prev.map(d => {
          const updated = updatedDoctors.find(u => u.id === d.id);
          return updated || d;
      }));

      try {
          await fetch(`${API_URL}/doctors/bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedDoctors)
          });
          setTimeout(checkAndSync, 1000);
      } catch (e) { console.error("Batch update failed", e); }
  };

  const importDoctors = async (newDoctors: Doctor[]) => {
      if (isImportingRef.current) return;
      isImportingRef.current = true;
      setIsSyncing(true);
      
      const prevDoctors = [...doctors];
      setDoctors(prev => [...newDoctors, ...prev]); 
      
      try {
          const response = await fetch(`${API_URL}/doctors/bulk`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newDoctors)
          });
          
          if (!response.ok) throw new Error("Bulk import failed");
          alert("Importación exitosa. Los datos se han guardado permanentemente.");
      } catch (e) { 
          console.error("Import failed", e); 
          alert("Error CRÍTICO: No se pudieron guardar los datos.");
          setDoctors(prevDoctors);
      } finally {
          isImportingRef.current = false;
          // Force full sync after bulk import
          fetchFullData(); 
      }
  };

  const deleteDoctor = async (id: string) => {
      setDoctors(prev => prev.filter(d => d.id !== id));
      try {
          await fetch(`${API_URL}/doctors/${id}`, { method: 'DELETE' });
          setTimeout(checkAndSync, 500);
      } catch (e) { console.error("Delete failed", e); }
  };

  const handleDeleteVisit = async (doctorId: string, visitId: string) => {
      setDoctors(prev => prev.map(doc => {
          if (doc.id === doctorId) {
              return { ...doc, visits: doc.visits.filter(v => v.id !== visitId) };
          }
          return doc;
      }));
      try {
          await fetch(`${API_URL}/doctors/${doctorId}/visits/${visitId}`, { method: 'DELETE' });
          setTimeout(checkAndSync, 500);
      } catch (e) { console.error("Delete visit failed", e); }
  };

  const addProcedure = async (newProc: Procedure) => {
      setProcedures(prev => [...prev, newProc]);
      try {
          await fetch(`${API_URL}/procedures`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newProc)
          });
          setTimeout(checkAndSync, 500);
      } catch (e) { console.error("Save proc failed", e); }
  };

  const updateProcedure = async (updatedProc: Procedure) => {
      setProcedures(prev => prev.map(p => p.id === updatedProc.id ? updatedProc : p));
      try {
          await fetch(`${API_URL}/procedures`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedProc)
          });
          setTimeout(checkAndSync, 500);
      } catch (e) { console.error("Update proc failed", e); }
  };

  const deleteProcedure = async (id: string) => {
      setProcedures(prev => prev.filter(p => p.id !== id));
      try {
          await fetch(`${API_URL}/procedures/${id}`, { method: 'DELETE' });
          setTimeout(checkAndSync, 500);
      } catch (e) { console.error("Delete proc failed", e); }
  };

  const importFullBackup = (data: { doctors: Doctor[], procedures: Procedure[], timeOff?: TimeOffEvent[] }) => {
      if (data.doctors) importDoctors(data.doctors); 
      if (data.timeOff) localStorage.setItem(STORAGE_KEYS.TIMEOFF, JSON.stringify(data.timeOff));
  };

  if (loading && doctors.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-slate-500 font-bold animate-pulse">Iniciando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <Router>
      <div className="flex h-screen bg-[#f8fafc]">
        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 w-full bg-slate-900 text-white z-50 p-4 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-2">
                <span className="font-black text-cyan-400">RC</span>
                <span className="font-bold">MediCall</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 bg-slate-800 rounded-lg">
                <Menu className="w-6 h-6 text-white" />
            </button>
        </div>

        <Sidebar 
            user={user} 
            onLogout={handleLogout} 
            isMobileOpen={isMobileMenuOpen} 
            closeMobileMenu={() => setIsMobileMenuOpen(false)} 
            isCollapsed={isSidebarCollapsed}
            toggleCollapse={toggleSidebar}
        />
        
        <div className={`flex-1 flex flex-col h-full relative pt-16 md:pt-0 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
          <div className="absolute top-4 right-4 z-50 pointer-events-none">
              {isSyncing ? (
                  <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-100 flex items-center text-[10px] font-bold text-blue-500"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Actualizando...</div>
              ) : (
                  <div className="bg-white/50 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-100 flex items-center text-[10px] font-bold text-green-500 opacity-50"><CheckCircle2 className="w-3 h-3 mr-1" /> Sincronizado</div>
              )}
          </div>
          
          <main className="flex-1 overflow-x-auto overflow-y-auto p-4 md:p-8 relative z-10 w-full">
            <div className="max-w-7xl mx-auto min-w-[320px]">
                <Routes>
                <Route path="/" element={<Dashboard doctors={doctors} user={user} procedures={procedures} onImportBackup={importFullBackup} />} />
                <Route path="/doctors" element={<DoctorList doctors={doctors} onAddDoctor={addDoctor} onImportDoctors={importDoctors} onDeleteDoctor={deleteDoctor} user={user} />} />
                <Route path="/doctors/:id" element={<DoctorProfile doctors={doctors} onUpdate={updateDoctor} onDeleteVisit={handleDeleteVisit} user={user} />} />
                <Route path="/calendar" element={<ExecutiveCalendar doctors={doctors} onUpdateDoctors={handleBatchUpdate} onDeleteVisit={handleDeleteVisit} user={user} />} />
                <Route path="/procedures" element={<ProceduresManager procedures={procedures} doctors={doctors} onAddProcedure={addProcedure} onUpdateProcedure={updateProcedure} onDeleteProcedure={deleteProcedure} user={user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </div>
          </main>
        </div>
      </div>
    </Router>
  );
};

export default App;