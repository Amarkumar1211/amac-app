import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Users, User, Calendar, Shield, AlertTriangle, FileSpreadsheet, LayoutGrid } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ShiftExcelImport from './ShiftExcelImport';

export default function AdminPanel({ initialSection = 'modules' }: { initialSection?: 'modules' | 'shift-import' }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [activeSection, setActiveSection] = useState<'modules' | 'shift-import'>(initialSection);

  const adminModules = [
    {
      id: 'master-database',
      title: 'Master Database',
      description: 'Intelligent control center for all part specs, targets, and calculated capacities',
      icon: <Database size={32} color="#0b462c" />,
      path: '/master-database',
      adminOnly: true
    },
    {
      id: 'shift-import',
      title: 'Shift Entry Excel Import',
      description: 'Offline & emergency recovery: Download templates and directly import shift-wise production sheets into database',
      icon: <FileSpreadsheet size={32} color="#0b462c" />,
      isLocalAction: true,
      badge: 'Emergency Recovery',
      adminOnly: true
    },
    {
      id: 'supervisors',
      title: 'Supervisor Management',
      description: 'Manage active supervisors and their assignments',
      icon: <Users size={32} color="#0b462c" />,
      path: '/supervisors',
      adminOnly: true
    },
    {
      id: 'operators',
      title: 'Operator Management',
      description: 'Manage operator punches, aliases, and departments',
      icon: <User size={32} color="#0b462c" />,
      path: '/operators',
      adminOnly: true
    },
    {
      id: 'reasons-master',
      title: 'Gap & Rejection Reasons',
      description: 'Manage standardized 4M gap root causes and quality defect rejection types',
      icon: <AlertTriangle size={32} color="#0b462c" />,
      path: '/reasons-master',
      adminOnly: true
    },
    {
      id: 'user-accounts',
      title: 'User Accounts',
      description: 'View department login accounts and reset passwords',
      icon: <Shield size={32} color="#0b462c" />,
      path: '/user-accounts',
      adminOnly: true
    }
  ];

  const visibleModules = adminModules.filter(m => !m.adminOnly || role === 'Admin');

  return (
    <div style={{ padding: '24px 30px', maxWidth: 1250, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header & Section Switcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: 16
      }}>
        <div>
          <h2 style={{ color: '#0b462c', margin: 0, fontSize: 24, fontWeight: 800 }}>Administration Console</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            System configuration, master databases, department access, and emergency data recovery
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 8, gap: 4 }}>
          <button
            onClick={() => setActiveSection('modules')}
            style={{
              background: activeSection === 'modules' ? 'white' : 'transparent',
              color: activeSection === 'modules' ? '#0b462c' : '#64748b',
              fontWeight: 700,
              fontSize: 13,
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: activeSection === 'modules' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            <LayoutGrid size={16} /> Admin Modules
          </button>

          <button
            onClick={() => setActiveSection('shift-import')}
            style={{
              background: activeSection === 'shift-import' ? 'white' : 'transparent',
              color: activeSection === 'shift-import' ? '#0b462c' : '#64748b',
              fontWeight: 700,
              fontSize: 13,
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: activeSection === 'shift-import' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            <FileSpreadsheet size={16} /> Shift Excel Import
            <span style={{
              background: '#e8f5e9',
              color: '#0b462c',
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: 10
            }}>
              New
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSection === 'shift-import' ? (
        <ShiftExcelImport onBack={() => setActiveSection('modules')} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20
        }}>
          {visibleModules.map((m, i) => (
            <div
              key={i}
              style={{
                background: 'white',
                padding: 24,
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                cursor: 'pointer',
                border: m.isLocalAction ? '2px solid #0b462c' : '1px solid #e2e8f0',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onClick={() => {
                if (m.isLocalAction) {
                  setActiveSection('shift-import');
                } else if (m.path) {
                  navigate(m.path);
                }
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
              }}
            >
              {m.badge && (
                <span style={{
                  position: 'absolute',
                  top: 14,
                  right: 14,
                  background: '#e8f5e9',
                  color: '#0b462c',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: 12,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase'
                }}>
                  {m.badge}
                </span>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 12 }}>
                <div style={{
                  padding: 12,
                  background: m.isLocalAction ? '#e8f5e9' : '#f8fafc',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {m.icon}
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#0f172a', fontSize: 16, fontWeight: 700 }}>{m.title}</h3>
                </div>
              </div>

              <p style={{ color: '#64748b', margin: 0, lineHeight: 1.5, fontSize: 13 }}>
                {m.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
