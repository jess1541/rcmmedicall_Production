import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, User, LogOut, Shield, ChevronLeft, ChevronRight, X, Activity } from 'lucide-react';
import { User as UserType } from '../types';

interface SidebarProps {
    user: UserType;
    onLogout: () => void;
    isMobileOpen: boolean;
    closeMobileMenu: () => void;
    isCollapsed: boolean;
    toggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, isMobileOpen, closeMobileMenu, isCollapsed, toggleCollapse }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentExec = searchParams.get('exec');

  const isActive = (path: string, matchExec?: boolean) => {
      if (matchExec !== undefined) {
          return location.pathname === path && !!currentExec === matchExec;
      }
      if (path === '/') return location.pathname === '/';
      return location.pathname.startsWith(path);
  };

  const executives = [
      { name: 'LUIS', color: 'bg-blue-500', initials: 'LU' },
      { name: 'ORALIA', color: 'bg-pink-500', initials: 'OR' },
      { name: 'ANGEL', color: 'bg-purple-500', initials: 'AN' },
      { name: 'TALINA', color: 'bg-teal-500', initials: 'TA' }
  ];

  const containerClasses = `
    flex flex-col bg-slate-900 text-white shadow-xl overflow-hidden transition-all duration-200 ease-in-out z-40
    fixed inset-y-0 left-0 h-full border-r border-slate-800
    ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} 
    ${isCollapsed ? 'w-16' : 'w-64'}
  `;

  return (
    <>
        {isMobileOpen && (
            <div 
                className="fixed inset-0 bg-black/50 z-30 md:hidden"
                onClick={closeMobileMenu}
            ></div>
        )}

        <div className={containerClasses}>
            <button 
                onClick={closeMobileMenu}
                className="absolute top-4 right-4 md:hidden text-slate-400 hover:text-white"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Header */}
            <div className="flex flex-col items-center justify-center h-20 border-b border-slate-800 relative z-10 mt-8 md:mt-0">
                <div className="text-center group cursor-default flex items-center justify-center w-full h-full">
                    {isCollapsed ? (
                        <div className="flex flex-col items-center justify-center">
                            <span className="text-xl font-black text-cyan-500">RC</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center">
                            <div className="flex items-baseline leading-none">
                                <span className="text-2xl font-black text-cyan-500 tracking-tighter">RC</span>
                                <span className="text-2xl font-bold text-slate-300 ml-1">Medi</span>
                                <span className="text-2xl font-bold text-cyan-500">Call</span>
                            </div>
                            <span className="text-[8px] tracking-[0.2em] text-slate-500 font-bold uppercase mt-1">Endoscopy</span>
                        </div>
                    )}
                </div>
            </div>
            
            <button 
                onClick={toggleCollapse}
                className="hidden md:block absolute top-20 -right-3 z-50 bg-slate-800 text-slate-400 hover:text-white p-1 rounded-full border border-slate-700 shadow-sm"
            >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
            </button>

            {/* Navigation */}
            <div className="flex flex-col flex-1 overflow-y-auto py-6 space-y-6 no-scrollbar z-10 overflow-x-hidden">
                <div onClick={closeMobileMenu}>
                    {!isCollapsed && (
                        <p className="px-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2">
                            Menú
                        </p>
                    )}
                    <nav className="space-y-1 px-3">
                        <SidebarLink to="/" icon={<LayoutDashboard />} label="Dashboard" isActive={isActive('/', false)} collapsed={isCollapsed} />
                        <SidebarLink to="/calendar" icon={<CalendarDays />} label="Planificación" isActive={isActive('/calendar', false)} collapsed={isCollapsed} />
                        <SidebarLink to="/doctors" icon={<Users />} label="Directorio" isActive={isActive('/doctors', false)} collapsed={isCollapsed} />
                        <SidebarLink to="/procedures" icon={<Activity />} label="Procedimientos" isActive={isActive('/procedures', false)} collapsed={isCollapsed} />
                    </nav>
                </div>

                {user.role === 'admin' && (
                    <div onClick={closeMobileMenu}>
                        {!isCollapsed && (
                            <p className="px-6 text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-2 mt-4">
                                Equipo
                            </p>
                        )}
                        {isCollapsed && <div className="w-8 h-px bg-slate-800 my-4 mx-auto"></div>}
                        <nav className="space-y-1 px-3">
                            {executives.map((exec) => {
                                const isSelected = currentExec === exec.name;
                                return (
                                    <Link
                                        key={exec.name}
                                        to={`/calendar?exec=${exec.name}`}
                                        className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-3 py-2 text-sm font-bold rounded-lg transition-colors group ${
                                            isSelected 
                                            ? `bg-slate-800 text-white border border-slate-700` 
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }`}
                                    >
                                        <div className={`flex items-center z-10 ${isCollapsed ? 'justify-center w-full' : 'w-full'}`}>
                                            <div className={`${!isCollapsed && 'mr-3'} w-6 h-6 rounded ${exec.color} flex items-center justify-center text-[9px] text-white font-black flex-shrink-0`}>
                                                {exec.initials}
                                            </div>
                                            {!isCollapsed && (
                                                <span className="flex-1 truncate text-xs">{exec.name}</span>
                                            )}
                                        </div>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                )}
            </div>
            
            {/* Footer */}
            <div className="p-3 bg-slate-900 border-t border-slate-800">
                <div className={`flex flex-col gap-2 ${isCollapsed ? 'items-center' : ''}`}>
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
                        <div className="bg-slate-800 p-1.5 rounded-lg">
                            {user.role === 'admin' ? <Shield className="h-4 w-4 text-yellow-500" /> : <User className="h-4 w-4 text-cyan-500" />}
                        </div>
                        {!isCollapsed && (
                            <div className="ml-3 overflow-hidden">
                                <p className="text-xs font-bold text-white truncate">{user.name}</p>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={onLogout}
                        className={`flex items-center justify-center rounded-lg bg-red-900/20 text-red-400 hover:bg-red-600 hover:text-white transition-colors text-xs font-bold ${isCollapsed ? 'w-8 h-8 p-0' : 'w-full py-2'}`}
                        title="Cerrar Sesión"
                    >
                        <LogOut className={`h-3 w-3 ${!isCollapsed && 'mr-2'}`} /> 
                        {!isCollapsed && 'Salir'}
                    </button>
                </div>
            </div>
        </div>
    </>
  );
};

const SidebarLink = ({ to, icon, label, isActive, collapsed }: { to: string, icon: React.ReactNode, label: string, isActive: boolean, collapsed: boolean }) => (
    <Link
        to={to}
        className={`flex items-center px-3 py-2.5 text-sm font-bold rounded-lg transition-colors ${
        isActive 
            ? 'bg-blue-600 text-white' 
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        } ${collapsed ? 'justify-center' : ''}`}
        title={collapsed ? label : ''}
    >
        <div className={`h-5 w-5 flex-shrink-0`}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 20 })}
        </div>
        {!collapsed && <span className="ml-3 truncate">{label}</span>}
    </Link>
);

export default Sidebar;