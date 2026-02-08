import React, { useState, useEffect, useCallback } from 'react';
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
import { Menu, RefreshCw } from 'lucide-react';

const STORAGE_KEYS = {
    USER: 'rc_medicall_user_v5',
    SIDEBAR: 'rc_medicall_sidebar_collapsed',
    TIMEOFF: 'rc_medicall_timeoff_v5'
};

// En producción (Cloud Run), el frontend y backend viven en el mismo dominio/puerto.
// Usamos una ruta relativa vacía para que las peticiones vayan a '/api/...' del mismo origen.
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:5000/api' 
    : '/api';

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
  const [isSyncing, setIsSyncing] = useState(false);

  const toggleSidebar = () => {
      const newState = !isSidebarCollapsed;
      setIsSidebarCollapsed(newState);
      localStorage.setItem(STORAGE_KEYS.SIDEBAR, String(newState));
  };

  const fetchData = async () => {
      try {
          // If server is not running, these will fail. 
          // For local development without server, fallback to old behavior or empty state would be needed, 
          // but user requested real-time which mandates server.
          const [docsRes, procsRes] = await Promise.all([
              fetch(`${API_URL}/doctors`),
              fetch(`${API_URL}/procedures`)
          ]);

          if (docsRes.ok && procsRes.ok) {
              const docs = await docsRes.json();
              const procs = await procsRes.json();
              setDoctors(docs);
              setProcedures(procs);
          }
      } catch (error) {
          console.error("Error fetching data:", error);
      } finally {
          setLoading(false);
          setIsSyncing(false);
      }
  };

  // --- CARGA INICIAL & POLLING ---
  useEffect(() => {
    const savedUser = localStorage.getItem(STORAGE_KEYS.USER);
    if (savedUser) setUser(JSON.parse(savedUser));

    fetchData(); // Initial Fetch

    // Polling interval for "Real Time" updates (every 5 seconds)
    const interval = setInterval(() => {
        setIsSyncing(true);
        fetchData(); 
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
      // Optimistic Update
      setDoctors(prev => [newDoctor, ...prev]);
      try {
          await fetch(`${API_URL}/doctors`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newDoctor)
          });
          fetchData(); // Refresh to ensure sync
      } catch (e) { console.error("Save failed", e); }
  };

  const updateDoctor = async (updatedDoctor: Doctor) => {
    setDoctors(prev => prev.map(d => d.id === updatedDoctor.id ? updatedDoctor : d));
    try {
        await fetch(`${API_URL}/doctors`, {
            method: 'POST', // Server uses POST for Upsert (Update/Insert)
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedDoctor)
        });
    } catch (e) { console.error("Update failed", e); }
  };

  // Helper for batch imports (loops API calls - simple implementation)
  const importDoctors = async (newDoctors: Doctor[]) => {
      setDoctors(prev => [...newDoctors, ...prev]);
      // Process in chunks or sequential to avoid overwhelming server
      for (const doc of newDoctors) {
          try {
              await fetch(`${API_URL}/doctors`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(doc)
              });
          } catch (e) { console.error("Import failed for", doc.name, e); }
      }
      alert("Importación finalizada. Los datos se están sincronizando.");
      fetchData();
  };

  const deleteDoctor = async (id: string) => {
      setDoctors(prev => prev.filter(d => d.id !== id));
      try {
          await fetch(`${API_URL}/doctors/${id}`, { method: 'DELETE' });
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
      } catch (e) { console.error("Update proc failed", e); }
  };

  const deleteProcedure = async (id: string) => {
      setProcedures(prev => prev.filter(p => p.id !== id));
      try {
          await fetch(`${API_URL}/procedures/${id}`, { method: 'DELETE' });
      } catch (e) { console.error("Delete proc failed", e); }
  };

  const importFullBackup = (data: { doctors: Doctor[], procedures: Procedure[], timeOff?: TimeOffEvent[] }) => {
      if (data.doctors) importDoctors(data.doctors); // Re-use import logic
      // Note: Procedures import logic would be similar if needed
      if (data.timeOff) localStorage.setItem(STORAGE_KEYS.TIMEOFF, JSON.stringify(data.timeOff));
  };

  if (loading && doctors.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="mt-4 text-slate-500 font-bold animate-pulse">Cargando sistema...</p>
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
              {isSyncing && <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow-sm border border-slate-100 flex items-center text-[10px] font-bold text-blue-500"><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Sincronizando...</div>}
          </div>
          
          <main className="flex-1 overflow-x-auto overflow-y-auto p-4 md:p-8 relative z-10 w-full">
            <div className="max-w-7xl mx-auto min-w-[320px]">
                <Routes>
                <Route path="/" element={<Dashboard doctors={doctors} user={user} procedures={procedures} onImportBackup={importFullBackup} />} />
                <Route path="/doctors" element={<DoctorList doctors={doctors} onAddDoctor={addDoctor} onImportDoctors={importDoctors} onDeleteDoctor={deleteDoctor} user={user} />} />
                <Route path="/doctors/:id" element={<DoctorProfile doctors={doctors} onUpdate={updateDoctor} onDeleteVisit={handleDeleteVisit} user={user} />} />
                <Route path="/calendar" element={<ExecutiveCalendar doctors={doctors} onUpdateDoctor={updateDoctor} onDeleteVisit={handleDeleteVisit} user={user} />} />
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