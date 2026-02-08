import React, { useMemo, useState, useRef } from 'react';
import { Doctor, User, Procedure, TimeOffEvent, Visit } from '../types';
import { Users, ShieldCheck, Download, Calendar, ArrowRight, CheckCircle2, TrendingUp, Filter, Award, Activity, DollarSign, Coins, X, MapPin, Target, Briefcase, PieChart, Database, Upload, AlertTriangle, Save, FileSpreadsheet, Stethoscope, Clock, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DashboardProps {
  doctors: Doctor[];
  user: User;
  procedures: Procedure[];
  onImportBackup?: (data: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ doctors, user, procedures, onImportBackup }) => {
  const navigate = useNavigate();
  const [filterExecutive, setFilterExecutive] = useState<string | null>(user.role === 'executive' ? user.name : null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const executives = [
      { name: 'LUIS', color: 'bg-blue-500', gradient: 'from-blue-500 to-blue-700', text: 'text-blue-600', bgLight: 'bg-blue-50' },
      { name: 'ORALIA', color: 'bg-pink-500', gradient: 'from-pink-500 to-rose-600', text: 'text-pink-600', bgLight: 'bg-pink-50' },
      { name: 'ANGEL', color: 'bg-purple-500', gradient: 'from-purple-500 to-indigo-600', text: 'text-purple-600', bgLight: 'bg-purple-50' },
      { name: 'TALINA', color: 'bg-teal-500', gradient: 'from-emerald-500 to-teal-600', text: 'text-teal-600', bgLight: 'bg-teal-50' }
  ];

  const filteredDoctors = useMemo(() => {
      return filterExecutive ? doctors.filter(d => d.executive === filterExecutive) : doctors;
  }, [doctors, filterExecutive]);

  // --- AGENDA DEL DÍA (To-Do List) ---
  const todaysAgenda = useMemo(() => {
      const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const agenda: { doctor: Doctor, visit: Visit }[] = [];

      filteredDoctors.forEach(doc => {
          doc.visits.forEach(visit => {
              // Buscar visitas programadas para hoy que no estén completadas (outcome != CITA para visitas regulares)
              if (visit.date === todayStr && visit.status === 'planned' && visit.outcome !== 'CITA') {
                  agenda.push({ doctor: doc, visit });
              }
          });
      });

      // Ordenar por hora
      return agenda.sort((a, b) => (a.visit.time || '00:00').localeCompare(b.visit.time || '00:00'));
  }, [filteredDoctors]);

  const stats = useMemo(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    let plannedVisits = 0;
    let completedVisits = 0;
    const classifications = { A: 0, B: 0, C: 0, None: 0 };

    filteredDoctors.forEach(doc => {
        doc.visits.forEach(v => {
            const vDate = new Date(v.date + 'T00:00:00');
            if (vDate.getMonth() === currentMonth && vDate.getFullYear() === currentYear) {
                if (v.status === 'completed') completedVisits++;
                if (v.status === 'planned' && v.outcome !== 'CITA') plannedVisits++;
            }
        });
        if (doc.classification === 'A') classifications.A++;
        else if (doc.classification === 'B') classifications.B++;
        else if (doc.classification === 'C') classifications.C++;
        else classifications.None++;
    });

    // Procedures calculation
    const proceduresThisMonth = procedures.filter(p => {
        const pDate = new Date(p.date + 'T00:00:00');
        const belongs = filterExecutive ? filteredDoctors.some(d => d.id === p.doctorId) : true;
        return p.status === 'performed' && pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear && belongs;
    }).length;

    const teamBreakdown = executives.map(exec => {
        const execDocs = doctors.filter(d => d.executive === exec.name);
        let execPlanned = 0;
        let execCompleted = 0;
        execDocs.forEach(d => {
            d.visits.forEach(v => {
                const vDate = new Date(v.date + 'T00:00:00');
                if (vDate.getMonth() === currentMonth && vDate.getFullYear() === currentYear) {
                    if (v.status === 'completed') execCompleted++;
                    if (v.status === 'planned' && v.outcome !== 'CITA') execPlanned++;
                }
            });
        });

        const execProcs = procedures.filter(p => {
            const pDate = new Date(p.date + 'T00:00:00');
            return p.status === 'performed' && 
                   pDate.getMonth() === currentMonth && 
                   pDate.getFullYear() === currentYear &&
                   execDocs.some(d => d.id === p.doctorId);
        });

        return {
            ...exec,
            doctors: execDocs.length,
            planned: execPlanned,
            completed: execCompleted,
            revenue: execProcs.reduce((acc, curr) => acc + (curr.cost || 0), 0),
            commission: execProcs.reduce((acc, curr) => acc + (curr.commission || 0), 0),
            performance: (execPlanned + execCompleted) > 0 ? Math.round((execCompleted / (execPlanned + execCompleted)) * 100) : 0
        };
    });

    const relevantProcedures = procedures.filter(p => {
        const pDate = new Date(p.date + 'T00:00:00');
        const belongs = filterExecutive ? filteredDoctors.some(d => d.id === p.doctorId) : true;
        return p.status === 'performed' && pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear && belongs;
    });

    return { 
        totalDoctors: filteredDoctors.length, 
        completedVisits, 
        proceduresThisMonth,
        totalRevenue: relevantProcedures.reduce((a, c) => a + (c.cost || 0), 0),
        totalCommission: relevantProcedures.reduce((a, c) => a + (c.commission || 0), 0),
        performance: (plannedVisits + completedVisits) > 0 ? Math.round((completedVisits / (plannedVisits + completedVisits)) * 100) : 0,
        classifications, 
        teamBreakdown 
    };
  }, [filteredDoctors, doctors, procedures, filterExecutive]);

  // --- RECENT ACTIVITY FEED LOGIC ---
  const recentActivities = useMemo(() => {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();

      // 1. Get Completed Visits
      const visits = filteredDoctors
          .flatMap(d => d.visits.map(v => ({
              ...v, 
              type: 'visit',
              doctorName: d.name, 
              executive: d.executive,
              highlight: v.outcome === 'INTERESADO' || v.outcome === 'PROGRAMAR PROCEDIMIENTO'
          })))
          .filter(v => {
              const vDate = new Date(v.date + 'T00:00:00');
              // Filter for current month or very recent
              return v.status === 'completed' && vDate.getMonth() === currentMonth && vDate.getFullYear() === currentYear;
          });

      // 2. Get Performed Procedures
      const performedProcs = procedures.filter(p => {
          const pDate = new Date(p.date + 'T00:00:00');
          // Check if procedure belongs to current filtered view
          const belongs = filterExecutive ? filteredDoctors.some(d => d.id === p.doctorId) : true;
          return p.status === 'performed' && pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear && belongs;
      }).map(p => ({
          id: p.id,
          date: p.date,
          time: p.time,
          note: p.notes,
          type: 'procedure',
          doctorName: p.doctorName,
          // Try to find executive from doctor list, fallback to N/A
          executive: doctors.find(d => d.id === p.doctorId)?.executive || 'N/A',
          outcome: p.procedureType, // Map procedure type to outcome slot for display
          highlight: true // Procedures are always highlights
      }));

      // 3. Combine and Sort by Date Descending
      return [...visits, ...performedProcs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50);

  }, [filteredDoctors, procedures, filterExecutive, doctors]);


  // --- EXPORT LOGIC ---
  const downloadCSV = (content: string, fileName: string) => {
      // Add BOM for Excel UTF-8 compatibility
      const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const exportVisits = () => {
      const headers = ['FECHA', 'HORA', 'EJECUTIVO', 'MÉDICO/HOSPITAL', 'ESPECIALIDAD', 'OBJETIVO', 'RESULTADO', 'NOTA', 'SEGUIMIENTO', 'ESTADO'];
      
      const rows = doctors.flatMap(doc => {
          return doc.visits.map(v => {
              if (filterExecutive && doc.executive !== filterExecutive) return null;
              return [
                  v.date, v.time || '', doc.executive, `"${doc.name}"`, doc.specialty || doc.category, `"${v.objective || ''}"`, v.outcome, `"${v.note || ''}"`, `"${v.followUp || ''}"`, v.status === 'completed' ? 'REALIZADA' : 'PLANEADA'
              ].join(',');
          }).filter(Boolean);
      });

      const csvContent = [headers.join(','), ...rows].join('\n');
      downloadCSV(csvContent, `REPORTE_VISITAS_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const exportProcedures = () => {
      const headers = ['FECHA', 'HORA', 'HOSPITAL', 'MÉDICO', 'EJECUTIVO', 'PROCEDIMIENTO', 'TÉCNICO', 'PAGO', 'COSTO', 'COMISIÓN', 'ESTADO', 'NOTAS'];
      
      const rows = procedures.map(proc => {
          const doc = doctors.find(d => d.id === proc.doctorId);
          const executive = doc ? doc.executive : 'DESCONOCIDO';
          if (filterExecutive && executive !== filterExecutive) return null;
          return [
              proc.date, proc.time || '', `"${proc.hospital || ''}"`, `"${proc.doctorName}"`, executive, `"${proc.procedureType}"`, `"${proc.technician || ''}"`, proc.paymentType, proc.cost || 0, proc.commission || 0, proc.status === 'performed' ? 'REALIZADO' : 'PROGRAMADO', `"${proc.notes || ''}"`
          ].join(',');
      }).filter(Boolean);

      const csvContent = [headers.join(','), ...rows].join('\n');
      downloadCSV(csvContent, `REPORTE_PROCEDIMIENTOS_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const handleExportBackup = () => {
      const backup = {
          doctors,
          procedures,
          timeOff: JSON.parse(localStorage.getItem('rc_medicall_timeoff_v5') || '[]'),
          exportedAt: new Date().toISOString(),
          version: '5.0'
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RESPALDO_CRM_RC_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = JSON.parse(event.target?.result as string);
              if (data.doctors && Array.isArray(data.doctors)) {
                  if (window.confirm("¿Seguro que deseas restaurar este respaldo?")) {
                      onImportBackup?.(data);
                  }
              } else {
                  alert("Formato de archivo no válido.");
              }
          } catch (error) {
              alert("Error al procesar el archivo JSON.");
          }
      };
      reader.readAsText(file);
  };

  const currentMonthName = new Date().toLocaleDateString('es-ES', { month: 'long' });

  return (
    <div className="space-y-6 pb-10">
      {/* Header - Removed blur and complexity */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="relative z-10">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-1">
                Hola, <span className="text-blue-600">{user.name}</span>
            </h1>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                {user.role === 'admin' ? 'PANEL DE CONTROL PROTEGIDO' : 'MI PANEL DE RESULTADOS'}
            </p>
          </div>
          
          <div className="flex gap-3">
              {user.role === 'admin' && filterExecutive && (
                  <button onClick={() => setFilterExecutive(null)} className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold text-xs uppercase transition shadow-sm">
                      <Filter className="w-3 h-3 inline mr-2" /> Vista Global
                  </button>
              )}
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
              {/* TODAY'S AGENDA CARD - Simplified */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-3">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <div>
                              <h3 className="text-lg font-black text-slate-800">Agenda de Hoy</h3>
                              <p className="text-xs font-bold text-slate-400 uppercase">
                                  {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                              </p>
                          </div>
                      </div>
                      <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-1 rounded-full">
                          {todaysAgenda.length}
                      </span>
                  </div>
                  
                  <div className="max-h-[300px] overflow-y-auto p-4 space-y-2">
                      {todaysAgenda.length > 0 ? (
                          todaysAgenda.map((item, idx) => (
                              <div key={`${item.doctor.id}-${idx}`} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-blue-300 transition-colors bg-white">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center border border-slate-200">
                                          <span className="text-[10px] font-black text-slate-600">{item.visit.time || '--'}</span>
                                      </div>
                                      <div>
                                          <h4 className="font-bold text-slate-800 uppercase text-xs">{item.doctor.name}</h4>
                                          <p className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                              <MapPin className="w-3 h-3" /> {item.doctor.hospital || item.doctor.address.substring(0, 20)}...
                                          </p>
                                          <p className="text-[9px] text-blue-600 font-bold uppercase mt-0.5">
                                              {item.visit.objective}
                                          </p>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={() => navigate(`/calendar?exec=${item.doctor.executive}`)}
                                      className="p-2 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
                                  >
                                      <Check className="w-4 h-4" />
                                  </button>
                              </div>
                          ))
                      ) : (
                          <div className="py-8 text-center">
                              <p className="text-slate-400 text-sm font-medium">No tienes visitas pendientes para hoy.</p>
                          </div>
                      )}
                  </div>
              </div>

              {/* FEED DE ACTIVIDAD - Simplified */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="text-base font-black text-slate-800">Actividad Reciente</h3>
                      <div className="flex gap-1 items-center">
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                          <span className="text-[9px] font-bold text-slate-400 uppercase">Live</span>
                      </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                      <div className="divide-y divide-slate-100">
                        {recentActivities.length > 0 ? (
                            recentActivities.map((activity: any, idx: number) => (
                                <div key={`${activity.type}-${activity.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-start gap-3">
                                            <div className={`p-1.5 rounded-lg mt-0.5 ${activity.type === 'procedure' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                                {activity.type === 'procedure' ? <Activity className="w-3 h-3" /> : <Stethoscope className="w-3 h-3" />}
                                            </div>
                                            <div>
                                                <p className="text-xs font-bold text-slate-800 uppercase">{activity.doctorName}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[9px] font-bold uppercase ${activity.type === 'procedure' ? 'text-red-500' : 'text-indigo-500'}`}>
                                                        {activity.executive}
                                                    </span>
                                                    <span className="text-[9px] text-slate-300">•</span>
                                                    <span className="text-[9px] text-slate-400">{activity.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded uppercase ${
                                            activity.highlight 
                                            ? (activity.type === 'procedure' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700') 
                                            : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {activity.outcome}
                                        </span>
                                    </div>
                                    {activity.note && <p className="ml-9 text-[9px] text-slate-500 uppercase truncate max-w-xs">"{activity.note}"</p>}
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-slate-400">
                                <p className="text-xs">No hay actividades recientes.</p>
                            </div>
                        )}
                      </div>
                  </div>
              </div>
          </div>

          {/* Right Column: KPIs & Exports */}
          <div className="lg:col-span-1 space-y-6">
              {/* KPI Grid - Compact & Solid Colors */}
              <div className="grid grid-cols-2 gap-3">
                  <div className="bg-indigo-600 p-4 rounded-2xl shadow-sm text-white col-span-2">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] font-bold text-indigo-200 uppercase">Efectividad {currentMonthName}</p>
                        <CheckCircle2 className="w-4 h-4 text-white/80" />
                      </div>
                      <p className="text-3xl font-black">{stats.performance}%</p>
                      <div className="w-full bg-indigo-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div className="bg-white h-full" style={{ width: `${stats.performance}%` }}></div>
                      </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Procedimientos</p>
                      <p className="text-2xl font-black text-slate-800">{stats.proceduresThisMonth}</p>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Ventas</p>
                      <p className="text-2xl font-black text-slate-800">${(stats.totalRevenue/1000).toFixed(0)}k</p>
                  </div>
              </div>

              {/* Classification Mini Card */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="text-xs font-black text-slate-800 mb-3 uppercase">Clasificación</h3>
                  <div className="flex justify-between text-center">
                      <div><div className="text-lg font-black text-emerald-600">{stats.classifications.A}</div><div className="text-[8px] font-bold text-slate-400 uppercase">VIP (A)</div></div>
                      <div className="w-px bg-slate-100"></div>
                      <div><div className="text-lg font-black text-blue-600">{stats.classifications.B}</div><div className="text-[8px] font-bold text-slate-400 uppercase">REG (B)</div></div>
                      <div className="w-px bg-slate-100"></div>
                      <div><div className="text-lg font-black text-slate-600">{stats.classifications.C}</div><div className="text-[8px] font-bold text-slate-400 uppercase">BAS (C)</div></div>
                  </div>
              </div>

              {/* Export Tools (Compact) */}
              {user.role === 'admin' && (
                  <div className="bg-slate-800 rounded-2xl p-5 shadow-lg text-white">
                      <div className="flex items-center gap-2 mb-3">
                          <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                          <h3 className="text-xs font-bold uppercase">Exportar Datos</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <button onClick={exportVisits} className="px-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[9px] font-bold uppercase transition-colors">Visitas</button>
                          <button onClick={exportProcedures} className="px-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-[9px] font-bold uppercase transition-colors">Procesos</button>
                          <button onClick={handleExportBackup} className="col-span-2 px-2 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-[9px] font-bold uppercase transition-colors flex items-center justify-center"><Download className="w-3 h-3 mr-1"/> Respaldo</button>
                          <input type="file" ref={fileInputRef} onChange={handleFileImport} accept=".json" className="hidden" />
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* ADMIN CONTROL TABLE (Simplified) */}
      {user.role === 'admin' && !filterExecutive && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-black text-slate-800 uppercase">Desempeño del Equipo</h3>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left">
                      <thead className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                          <tr>
                              <th className="px-4 py-3">Ejecutivo</th>
                              <th className="px-2 py-3">Médicos</th>
                              <th className="px-2 py-3">Plan</th>
                              <th className="px-2 py-3">Real</th>
                              <th className="px-2 py-3">Efectividad</th>
                              <th className="px-2 py-3">Venta</th>
                              <th className="px-2 py-3 text-right">Ver</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs">
                          {stats.teamBreakdown.map(exec => (
                              <tr key={exec.name} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3 font-bold text-slate-800">{exec.name}</td>
                                  <td className="px-2 py-3 text-slate-500">{exec.doctors}</td>
                                  <td className="px-2 py-3 text-indigo-600 font-bold">{exec.planned}</td>
                                  <td className="px-2 py-3 text-emerald-600 font-bold">{exec.completed}</td>
                                  <td className="px-2 py-3">{exec.performance}%</td>
                                  <td className="px-2 py-3 font-bold">${exec.revenue.toLocaleString()}</td>
                                  <td className="px-2 py-3 text-right">
                                      <button onClick={() => setFilterExecutive(exec.name)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                                          <ArrowRight className="w-3 h-3" />
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;