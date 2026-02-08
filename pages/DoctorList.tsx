import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doctor, ScheduleSlot, User } from '../types';
import { Search, Filter, MapPin, Stethoscope, User as UserIcon, Download, Plus, X, ArrowRight, Building2, Briefcase, Trash2, Upload, ChevronDown } from 'lucide-react';

interface DoctorListProps {
  doctors: Doctor[];
  onAddDoctor?: (doc: Doctor) => void;
  onImportDoctors?: (docs: Doctor[]) => void;
  onDeleteDoctor?: (id: string) => void;
  user: User;
}

type TabType = 'MEDICO' | 'ADMINISTRATIVO' | 'HOSPITAL';

const DoctorList: React.FC<DoctorListProps> = ({ doctors, onAddDoctor, onImportDoctors, onDeleteDoctor, user }) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(''); // New: Debounce state
  const [selectedExecutive, setSelectedExecutive] = useState('TODOS');
  const [activeTab, setActiveTab] = useState<TabType>('MEDICO');
  const [visibleCount, setVisibleCount] = useState(20); // New: Pagination limit
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Doctor>>({
      name: '',
      executive: user.role === 'executive' ? user.name : 'SIN ASIGNAR',
      specialty: '',
      address: '',
      hospital: '',
      area: '',
      phone: '',
      email: '',
      importantNotes: ''
  });

  // Debounce Logic: Wait 300ms after typing stops to update filter
  useEffect(() => {
      const handler = setTimeout(() => {
          setDebouncedSearchTerm(searchTerm);
          setVisibleCount(20); // Reset pagination on new search
      }, 300);
      return () => clearTimeout(handler);
  }, [searchTerm]);

  const executives = useMemo(() => {
    const execs = new Set(doctors.map(d => d.executive ? d.executive.trim().toUpperCase() : 'SIN ASIGNAR'));
    return ['TODOS', ...Array.from(execs).sort()];
  }, [doctors]);

  const filteredItems = useMemo(() => {
    return doctors.filter(doc => {
      const category = doc.category || 'MEDICO';
      
      // Use Debounced term for performance
      const searchLower = debouncedSearchTerm.toLowerCase();
      const matchesSearch = !debouncedSearchTerm || 
                            doc.name.toLowerCase().includes(searchLower) || 
                            doc.address.toLowerCase().includes(searchLower);
      
      const docExec = doc.executive ? doc.executive.trim().toUpperCase() : 'SIN ASIGNAR';
      const matchesExec = selectedExecutive === 'TODOS' || docExec === selectedExecutive;
      const matchesTab = category === activeTab;
      
      return matchesSearch && matchesExec && matchesTab;
    });
  }, [doctors, debouncedSearchTerm, selectedExecutive, activeTab]);

  // Pagination Logic
  const visibleItems = useMemo(() => {
      return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const handleLoadMore = () => {
      setVisibleCount(prev => prev + 20);
  };

  const handleExport = () => {
    const headers = [
        "Categoria", "Nombre", "Ejecutivo", "Especialidad/Area", "Hospital", 
        "Dirección", "Telefono", "Email", "Notas"
    ];

    const csvRows = [
        headers.join(','),
        ...filteredItems.map(doc => {
            return [
                `"${doc.category || 'MEDICO'}"`,
                `"${doc.name}"`,
                `"${doc.executive}"`,
                `"${doc.specialty || doc.area || ''}"`,
                `"${doc.hospital || ''}"`,
                `"${doc.address}"`,
                `"${doc.phone || ''}"`,
                `"${doc.email || ''}"`,
                `"${doc.importantNotes || ''}"`
            ].join(',');
        })
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `base_datos_${activeTab.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          processCSV(text);
      };
      // Explicitly read as UTF-8
      reader.readAsText(file, 'UTF-8');
      e.target.value = '';
  };

  const processCSV = (csvText: string) => {
      const cleanText = csvText.replace(/^\uFEFF/, '');
      const lines = cleanText.split('\n');
      
      if (lines.length < 2) {
          alert("El archivo parece estar vacío o no tiene el formato correcto.");
          return;
      }

      const newDoctors: Doctor[] = [];
      const days = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'TODOS LOS DÍAS'];
      
      const splitCSV = (str: string) => {
          const matches = str.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
          return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : [];
      };

      for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          let columns = splitCSV(line);
          if (!columns || columns.length === 0) columns = line.split(',');

          if (columns.length >= 2) {
              const categoryRaw = (columns[0] || 'MEDICO').trim().toUpperCase();
              const validCategories = ['MEDICO', 'ADMINISTRATIVO', 'HOSPITAL'];
              const category = validCategories.includes(categoryRaw) ? categoryRaw : 'MEDICO';
              
              const name = (columns[1] || 'SIN NOMBRE').trim().toUpperCase().replace(/['"]+/g, '');
              let executive = (columns[2] || 'SIN ASIGNAR').trim().toUpperCase().replace(/['"]+/g, '');

              const initialSchedule: ScheduleSlot[] = days.map(day => ({ day, time: '', active: false }));
              const uniqueId = `imp-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;

              const newDoc: Doctor = {
                  id: uniqueId,
                  category: category as any,
                  name: name,
                  executive: executive,
                  specialty: (columns[3] || '').trim().toUpperCase(),
                  area: category === 'ADMINISTRATIVO' ? (columns[3] || '').trim().toUpperCase() : '',
                  hospital: (columns[4] || '').trim().toUpperCase(),
                  address: (columns[5] || '').trim().toUpperCase(),
                  phone: columns[6] ? columns[6].trim() : '',
                  email: columns[7] ? columns[7].trim() : '',
                  importantNotes: (columns[8] || '').trim().toUpperCase(),
                  visits: [],
                  schedule: initialSchedule,
                  isInsuranceDoctor: false
              };
              newDoctors.push(newDoc);
          }
      }

      if (newDoctors.length > 0 && onImportDoctors) {
          if (window.confirm(`Se encontraron ${newDoctors.length} registros válidos. \n\n¿Desea importarlos?`)) {
              onImportDoctors(newDoctors);
          }
      } else {
          alert("No se pudieron procesar registros del archivo. Verifique el formato CSV.");
      }
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm('¿Eliminar permanentemente?')) {
          onDeleteDoctor && onDeleteDoctor(id);
      }
  };

  const handleCardClick = (id: string) => {
      navigate(`/doctors/${id}`);
  };

  const resetForm = () => {
      setIsAddModalOpen(false);
      setFormSubmitted(false);
      setFormData({
          name: '',
          executive: user.role === 'executive' ? user.name : 'SIN ASIGNAR',
          specialty: '',
          address: '',
          hospital: '',
          area: '',
          phone: '',
          email: '',
          importantNotes: ''
      });
  };

  const handleAddSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setFormSubmitted(true);

      if (!formData.name?.trim()) return;
      if (activeTab === 'MEDICO' && !formData.specialty) return;

      if (!onAddDoctor) return;

      const days = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'TODOS LOS DÍAS'];
      const initialSchedule: ScheduleSlot[] = days.map(day => ({ day, time: '', active: false }));

      const newDoctor: Doctor = {
          id: `${activeTab.substring(0,3).toLowerCase()}-${Date.now()}`,
          category: activeTab,
          name: formData.name.toUpperCase(),
          executive: formData.executive?.trim().toUpperCase() || 'SIN ASIGNAR',
          specialty: formData.specialty?.toUpperCase() || (activeTab === 'HOSPITAL' ? 'HOSPITAL' : ''),
          address: formData.address?.toUpperCase() || '',
          hospital: formData.hospital?.toUpperCase() || '',
          area: formData.area?.toUpperCase() || '',
          phone: formData.phone || '',
          email: formData.email || '',
          importantNotes: formData.importantNotes?.toUpperCase() || '',
          visits: [],
          schedule: initialSchedule,
          isInsuranceDoctor: false
      };
      
      onAddDoctor(newDoctor);
      resetForm();
  };

  return (
    <div className="space-y-4 relative pb-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Directorio</h1>
            <p className="text-xs text-slate-500 font-medium">Gestiona tu base de datos de contactos.</p>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold text-xs"
            >
                <Plus className="h-4 w-4 mr-1" />
                Nuevo
            </button>
            
            <div className="h-6 w-px bg-slate-200 mx-1"></div>

            <button onClick={handleImportClick} className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition font-bold text-xs">
                <Upload className="h-4 w-4 mr-1" /> Importar
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />

            <button onClick={handleExport} className="flex items-center px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition font-bold text-xs">
                <Download className="h-4 w-4 mr-1" /> Exportar
            </button>
        </div>
      </div>

      <div className="flex space-x-1 bg-slate-200 p-1 rounded-xl w-fit">
          {(['MEDICO', 'ADMINISTRATIVO', 'HOSPITAL'] as TabType[]).map(tab => (
              <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setVisibleCount(20); }}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  {tab === 'MEDICO' ? 'MÉDICOS' : (tab === 'ADMINISTRATIVO' ? 'ADMINISTRATIVOS' : 'HOSPITALES')}
              </button>
          ))}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-black placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors uppercase"
            placeholder={`BUSCAR ${activeTab}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.toUpperCase())}
          />
        </div>
        
        <div>
            <div className="relative">
                <select
                    className="block w-full pl-3 pr-10 py-2 text-xs font-bold border border-slate-200 bg-slate-50 text-black rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none"
                    value={selectedExecutive}
                    onChange={(e) => setSelectedExecutive(e.target.value)}
                >
                {executives.map(exec => (
                    <option key={exec} value={exec}>{exec}</option>
                ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
                    <Filter className="h-3 w-3 text-slate-400" />
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleItems.map((item) => (
          <div
            key={item.id}
            onClick={() => handleCardClick(item.id)}
            className={`group block bg-white rounded-xl border hover:border-blue-300 cursor-pointer ${item.isInsuranceDoctor ? 'border-l-4 border-l-yellow-400 border-t border-r border-b border-slate-200' : 'border-slate-200'}`}
          >
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                 <div className={`rounded-lg p-2 text-white ${
                     activeTab === 'MEDICO' ? 'bg-blue-500' : 
                     activeTab === 'ADMINISTRATIVO' ? 'bg-purple-500' : 'bg-emerald-500'
                 }`}>
                    {activeTab === 'MEDICO' ? <Stethoscope className="h-4 w-4" /> : 
                     activeTab === 'ADMINISTRATIVO' ? <Briefcase className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                 </div>
                 <div className="flex flex-col items-end gap-1">
                    {item.isInsuranceDoctor && (
                        <span className="bg-yellow-100 text-yellow-800 text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide">
                            Aseguradora
                        </span>
                    )}
                    {user.role === 'admin' && (
                        <button 
                            onClick={(e) => handleDelete(e, item.id)}
                            className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                    )}
                 </div>
              </div>
              
              <h3 className="text-sm font-black text-slate-800 mb-1 line-clamp-1 uppercase" title={item.name}>{item.name}</h3>
              
              <div className="space-y-1 mt-2">
                {activeTab !== 'HOSPITAL' && (
                    <div className="flex items-start text-xs text-slate-500 font-medium">
                    <span className="bg-slate-100 px-1.5 rounded text-[9px] font-bold mr-2 uppercase text-slate-400">
                        {activeTab === 'MEDICO' ? 'ESP' : 'AREA'}
                    </span>
                    <span className="line-clamp-1 uppercase">{item.specialty || item.area || 'N/A'}</span>
                    </div>
                )}
                <div className="flex items-start text-xs text-slate-500">
                  <MapPin className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0 text-slate-400" />
                  <span className="line-clamp-2 text-[10px] uppercase">{item.address || 'SIN DIRECCIÓN'}</span>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px]">
                <div className="flex items-center">
                    <span className="text-slate-400 font-bold mr-1">EJECUTIVO:</span>
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">{item.executive}</span>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-300" />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {filteredItems.length > visibleCount && (
          <div className="flex justify-center pt-4">
              <button 
                onClick={handleLoadMore}
                className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 flex items-center shadow-sm"
              >
                  <ChevronDown className="w-4 h-4 mr-2" />
                  Cargar más ({filteredItems.length - visibleCount} restantes)
              </button>
          </div>
      )}
      
      {filteredItems.length === 0 && (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm font-medium">No se encontraron registros.</p>
          </div>
      )}

      {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-none flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
                  <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                      <h3 className="text-lg font-black text-slate-800">Registrar Nuevo {activeTab}</h3>
                      <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
                  </div>
                  
                  <form onSubmit={handleAddSubmit} className="p-6 space-y-4" noValidate>
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                              {activeTab === 'HOSPITAL' ? 'Nombre del Hospital' : 'Nombre Completo'} <span className="text-red-500">*</span>
                          </label>
                          <input 
                              type="text" required
                              className={`w-full border bg-slate-50 rounded-lg p-2 text-xs text-black focus:ring-1 focus:ring-blue-500 uppercase ${formSubmitted && !formData.name ? 'border-red-500' : 'border-slate-200'}`}
                              value={formData.name}
                              onChange={e => setFormData({...formData, name: e.target.value.toUpperCase()})}
                          />
                      </div>

                      {activeTab === 'MEDICO' && (
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Especialidad <span className="text-red-500">*</span></label>
                                  <select required className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 text-xs text-black outline-none"
                                      value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})}>
                                      <option value="">SELECCIONAR</option>
                                      <option value="GINECOLOGÍA">GINECOLOGÍA</option>
                                      <option value="UROLOGÍA">UROLOGÍA</option>
                                      <option value="OTRA">OTRA</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Hospital</label>
                                  <input type="text" className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 text-xs text-black uppercase"
                                      value={formData.hospital} onChange={e => setFormData({...formData, hospital: e.target.value.toUpperCase()})} />
                              </div>
                          </div>
                      )}

                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección</label>
                          <input type="text" className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 text-xs text-black uppercase"
                              value={formData.address} onChange={e => setFormData({...formData, address: e.target.value.toUpperCase()})} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Teléfono</label>
                              <input type="text" className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 text-xs text-black"
                                  value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ejecutivo Asignado</label>
                              <select className="w-full border border-slate-200 bg-slate-50 rounded-lg p-2 text-xs text-black"
                                  value={formData.executive} onChange={e => setFormData({...formData, executive: e.target.value})}>
                                  {executives.filter(e => e !== 'TODOS').map(e => <option key={e} value={e}>{e}</option>)}
                                  <option value="SIN ASIGNAR">SIN ASIGNAR</option>
                              </select>
                          </div>
                      </div>

                      <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 mt-2">
                          <button type="button" onClick={resetForm} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 rounded-lg text-xs">Cancelar</button>
                          <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm text-xs">Guardar</button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default DoctorList;