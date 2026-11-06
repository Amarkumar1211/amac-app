import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { 
  Plus, Edit2, Trash2, ArrowLeft, Search, CheckCircle, 
  AlertTriangle, Filter, Check, X, ShieldAlert, Sparkles, Tag,
  Building2, Layers
} from 'lucide-react';

interface GapReason {
  id: number;
  department: string;
  category: string;
  reasonName: string;
  isActive: boolean;
  createdAt?: string;
}

interface RejectionReason {
  id: number;
  department: string;
  reasonName: string;
  category: string;
  isActive: boolean;
  createdAt?: string;
}

const DEPARTMENTS = [
  'All',
  'Production',
  'DCF',
  'Quality',
  'HT & Finishing',
  'Storage & Dispatch'
];

const DEPT_BADGE_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  'Production':         { bg: '#e8f3ed', text: '#0b462c', border: '#b8dfca' },
  'DCF':                { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  'Quality':            { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  'HT & Finishing':     { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  'Storage & Dispatch': { bg: '#fae8ff', text: '#86198f', border: '#f5d0fe' },
  'All':                { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

export default function ReasonsManagement() {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useModal();

  const [activeTab, setActiveTab] = useState<'gap' | 'rejection'>('gap');
  const [loading, setLoading] = useState(true);

  // Department scope filter
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');

  // Gap Reasons state
  const [gapReasons, setGapReasons] = useState<GapReason[]>([]);
  const [selectedGapCategory, setSelectedGapCategory] = useState<string>('All');
  const [gapSearch, setGapSearch] = useState('');
  const [isGapModalOpen, setIsGapModalOpen] = useState(false);
  const [editingGap, setEditingGap] = useState<GapReason | null>(null);
  const [gapForm, setGapForm] = useState({ 
    department: 'Production', 
    category: 'Manpower', 
    reasonName: '', 
    isActive: true 
  });

  // Rejection Reasons state
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [selectedRejCategory, setSelectedRejCategory] = useState<string>('All');
  const [rejSearch, setRejSearch] = useState('');
  const [isRejModalOpen, setIsRejModalOpen] = useState(false);
  const [editingRej, setEditingRej] = useState<RejectionReason | null>(null);
  const [rejForm, setRejForm] = useState({ 
    department: 'Production', 
    reasonName: '', 
    category: 'Casting', 
    isActive: true 
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gRes, rRes] = await Promise.all([
        apiFetch(`http://${window.location.hostname}:4900/api/gapreasons`),
        apiFetch(`http://${window.location.hostname}:4900/api/rejectionreasons`)
      ]);
      if (gRes.ok) setGapReasons(await gRes.json());
      if (rRes.ok) setRejectionReasons(await rRes.json());
    } catch (err) {
      console.error('Error fetching reasons:', err);
    } finally {
      setLoading(false);
    }
  };

  /* ── GAP REASON CRUD ────────────────────────────────────────── */
  const handleOpenGapModal = (item?: GapReason) => {
    if (item) {
      setEditingGap(item);
      setGapForm({ 
        department: item.department || 'Production',
        category: item.category, 
        reasonName: item.reasonName, 
        isActive: item.isActive 
      });
    } else {
      setEditingGap(null);
      setGapForm({ 
        department: selectedDepartment === 'All' ? 'Production' : selectedDepartment,
        category: selectedGapCategory === 'All' ? 'Manpower' : selectedGapCategory, 
        reasonName: '', 
        isActive: true 
      });
    }
    setIsGapModalOpen(true);
  };

  const handleSaveGap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gapForm.reasonName.trim()) {
      showAlert('Required Field', 'Please enter a reason name.');
      return;
    }

    try {
      const isNew = !editingGap;
      const url = isNew
        ? `http://${window.location.hostname}:4900/api/gapreasons`
        : `http://${window.location.hostname}:4900/api/gapreasons/${editingGap.id}`;

      const res = await apiFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gapForm)
      });

      if (res.ok) {
        setIsGapModalOpen(false);
        fetchData();
        showAlert('Success', `Gap Reason ${isNew ? 'created' : 'updated'} successfully.`);
      } else {
        showAlert('Error', 'Failed to save gap reason.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'An unexpected error occurred.');
    }
  };

  const handleDeleteGap = (item: GapReason) => {
    showConfirm('Delete Gap Reason', `Are you sure you want to delete "${item.reasonName}" (${item.category}) for ${item.department || 'Production'}?`, async () => {
      try {
        const res = await apiFetch(`http://${window.location.hostname}:4900/api/gapreasons/${item.id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchData();
          showAlert('Deleted', 'Gap reason removed successfully.');
        } else {
          showAlert('Error', 'Failed to delete gap reason.');
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  /* ── REJECTION REASON CRUD ──────────────────────────────────── */
  const handleOpenRejModal = (item?: RejectionReason) => {
    if (item) {
      setEditingRej(item);
      setRejForm({ 
        department: item.department || 'Production',
        reasonName: item.reasonName, 
        category: item.category, 
        isActive: item.isActive 
      });
    } else {
      setEditingRej(null);
      setRejForm({ 
        department: selectedDepartment === 'All' ? 'Production' : selectedDepartment,
        reasonName: '', 
        category: selectedRejCategory === 'All' ? 'Casting' : selectedRejCategory, 
        isActive: true 
      });
    }
    setIsRejModalOpen(true);
  };

  const handleSaveRej = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejForm.reasonName.trim()) {
      showAlert('Required Field', 'Please enter a defect reason name.');
      return;
    }

    try {
      const isNew = !editingRej;
      const url = isNew
        ? `http://${window.location.hostname}:4900/api/rejectionreasons`
        : `http://${window.location.hostname}:4900/api/rejectionreasons/${editingRej.id}`;

      const res = await apiFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rejForm)
      });

      if (res.ok) {
        setIsRejModalOpen(false);
        fetchData();
        showAlert('Success', `Rejection Reason ${isNew ? 'created' : 'updated'} successfully.`);
      } else {
        showAlert('Error', 'Failed to save rejection reason.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'An unexpected error occurred.');
    }
  };

  const handleDeleteRej = (item: RejectionReason) => {
    showConfirm('Delete Rejection Reason', `Are you sure you want to delete defect "${item.reasonName}" for ${item.department || 'Production'}?`, async () => {
      try {
        const res = await apiFetch(`http://${window.location.hostname}:4900/api/rejectionreasons/${item.id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchData();
          showAlert('Deleted', 'Rejection reason removed successfully.');
        } else {
          showAlert('Error', 'Failed to delete rejection reason.');
        }
      } catch (err) {
        console.error(err);
      }
    });
  };

  // Filtered lists with department + category + search
  const filteredGapReasons = gapReasons.filter(g => {
    const matchDept = selectedDepartment === 'All' 
      || g.department === selectedDepartment 
      || g.department === 'All';
    const matchCat = selectedGapCategory === 'All' || g.category === selectedGapCategory;
    const matchSearch = !gapSearch.trim() ||
      g.reasonName.toLowerCase().includes(gapSearch.toLowerCase()) ||
      g.category.toLowerCase().includes(gapSearch.toLowerCase()) ||
      (g.department || '').toLowerCase().includes(gapSearch.toLowerCase());
    return matchDept && matchCat && matchSearch;
  });

  const filteredRejectionReasons = rejectionReasons.filter(r => {
    const matchDept = selectedDepartment === 'All' 
      || r.department === selectedDepartment 
      || r.department === 'All';
    const matchCat = selectedRejCategory === 'All' || r.category === selectedRejCategory;
    const matchSearch = !rejSearch.trim() ||
      r.reasonName.toLowerCase().includes(rejSearch.toLowerCase()) ||
      r.category.toLowerCase().includes(rejSearch.toLowerCase()) ||
      (r.department || '').toLowerCase().includes(rejSearch.toLowerCase());
    return matchDept && matchCat && matchSearch;
  });

  // Gap Category Colors
  const getCatStyle = (cat: string) => {
    switch (cat) {
      case 'Manpower':
        return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' };
      case 'Machine Breakdown':
        return { bg: '#fef3c7', text: '#b45309', border: '#fde68a' };
      case 'Raw Material':
        return { bg: '#ede9fe', text: '#6d28d9', border: '#ddd6fe' };
      case 'Method':
        return { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4' };
      default:
        return { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1240, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate('/admin')}
            style={{
              background: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              color: '#374151',
              fontWeight: 600,
              fontSize: 13,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <ArrowLeft size={16} /> Back to Admin
          </button>
          <div>
            <h2 style={{ margin: 0, color: '#0b462c', fontSize: 22, fontWeight: 700 }}>
              Master Database: Gap & Rejection Reasons
            </h2>
            <p style={{ margin: '3px 0 0', color: '#6b7280', fontSize: 13 }}>
              Standardized department-wise root causes for 4M gap allocation and defect categories across production & downstream operations
            </p>
          </div>
        </div>
      </div>

      {/* ── DEPARTMENT SCOPE SELECTOR ──────────────────────────────── */}
      <div style={{
        background: '#ffffff',
        padding: '12px 18px',
        borderRadius: 10,
        border: '1px solid #d5e0da',
        marginBottom: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} color="#0b462c" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
              Department Scope
            </span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              • All current data is assigned to <strong>Production</strong>; select another department or add cross-department master data
            </span>
          </div>
          {selectedDepartment !== 'All' && (
            <button
              onClick={() => setSelectedDepartment('All')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#0b462c',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              Reset to All Departments
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEPARTMENTS.map(dept => {
            const isSelected = selectedDepartment === dept;
            const count = activeTab === 'gap'
              ? (dept === 'All' 
                  ? gapReasons.length 
                  : gapReasons.filter(g => g.department === dept || g.department === 'All').length)
              : (dept === 'All'
                  ? rejectionReasons.length
                  : rejectionReasons.filter(r => r.department === dept || r.department === 'All').length);

            return (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDepartment(dept)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 20,
                  border: isSelected ? '1.5px solid #0b462c' : '1px solid #d1d5db',
                  background: isSelected ? '#0b462c' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#374151',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 4px rgba(11,70,44,0.18)' : 'none'
                }}
              >
                <span>{dept === 'All' ? '🏢 All Departments' : dept}</span>
                <span style={{
                  fontSize: 11,
                  background: isSelected ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                  color: isSelected ? '#ffffff' : '#4b5563',
                  padding: '1px 7px',
                  borderRadius: 10,
                  fontWeight: 700
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '2px solid #e5e7eb', marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('gap')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'gap' ? '#0b462c' : 'transparent',
            color: activeTab === 'gap' ? '#ffffff' : '#4b5563',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <AlertTriangle size={16} />
          1. Gap Reasons Master ({filteredGapReasons.length}{selectedDepartment !== 'All' ? ` in ${selectedDepartment}` : ''})
        </button>
        <button
          onClick={() => setActiveTab('rejection')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'rejection' ? '#0b462c' : 'transparent',
            color: activeTab === 'rejection' ? '#ffffff' : '#4b5563',
            border: 'none',
            borderRadius: '8px 8px 0 0',
            fontWeight: 700,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <ShieldAlert size={16} />
          2. Rejection Reasons Master ({filteredRejectionReasons.length}{selectedDepartment !== 'All' ? ` in ${selectedDepartment}` : ''})
        </button>
      </div>

      {/* ── TAB 1: GAP REASONS ────────────────────────────────────── */}
      {activeTab === 'gap' && (
        <div>
          {/* Summary KPI Cards for 4 Pillars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            {['Manpower', 'Machine Breakdown', 'Raw Material', 'Method'].map(cat => {
              const count = gapReasons.filter(g => {
                const matchDept = selectedDepartment === 'All' 
                  || g.department === selectedDepartment 
                  || g.department === 'All';
                return matchDept && g.category === cat;
              }).length;
              const cStyle = getCatStyle(cat);
              const isSelected = selectedGapCategory === cat;
              return (
                <div
                  key={cat}
                  onClick={() => setSelectedGapCategory(isSelected ? 'All' : cat)}
                  style={{
                    background: cStyle.bg,
                    border: isSelected ? `2px solid ${cStyle.text}` : `1px solid ${cStyle.border}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: cStyle.text, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {cat}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: cStyle.text, marginTop: 4 }}>
                    {count} <span style={{ fontSize: 13, fontWeight: 500 }}>reasons</span>
                  </div>
                  <div style={{ fontSize: 11, color: cStyle.text, marginTop: 4, fontWeight: 600 }}>
                    {isSelected ? '✓ Filter Applied (Click to clear)' : 'Click to filter'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action & Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 11 }} />
                <input
                  type="text"
                  placeholder="Search reasons, department, or categories..."
                  style={{ paddingLeft: 34, height: 38, width: '100%', borderRadius: 6, border: '1px solid #d1d5db' }}
                  value={gapSearch}
                  onChange={e => setGapSearch(e.target.value)}
                />
              </div>

              <select
                style={{ height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontWeight: 600, color: '#374151' }}
                value={selectedGapCategory}
                onChange={e => setSelectedGapCategory(e.target.value)}
              >
                <option value="All">All 4 Pillars</option>
                <option value="Manpower">1. Manpower</option>
                <option value="Machine Breakdown">2. Machine Breakdown</option>
                <option value="Raw Material">3. Raw Material</option>
                <option value="Method">4. Method</option>
              </select>
            </div>

            <button
              onClick={() => handleOpenGapModal()}
              style={{
                background: '#0b462c',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '0 16px',
                height: 38,
                fontWeight: 700,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer'
              }}
            >
              <Plus size={16} /> Add Gap Reason
            </button>
          </div>

          {/* Table */}
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>
                  <th style={{ padding: '12px 16px', width: 50 }}>#</th>
                  <th style={{ padding: '12px 16px', width: 140 }}>Department</th>
                  <th style={{ padding: '12px 16px', width: 180 }}>Category Pillar</th>
                  <th style={{ padding: '12px 16px' }}>Specific Root Cause / Reason Name</th>
                  <th style={{ padding: '12px 16px', width: 100 }}>Status</th>
                  <th style={{ padding: '12px 16px', width: 110, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredGapReasons.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9ca3af' }}>
                      No gap reasons match your search criteria for {selectedDepartment !== 'All' ? selectedDepartment : 'the selected filters'}.
                    </td>
                  </tr>
                ) : (
                  filteredGapReasons.map((g, idx) => {
                    const cStyle = getCatStyle(g.category);
                    const dStyle = DEPT_BADGE_STYLE[g.department || 'Production'] || DEPT_BADGE_STYLE['All'];
                    return (
                      <tr key={g.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: dStyle.bg,
                            color: dStyle.text,
                            border: `1px solid ${dStyle.border}`,
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontWeight: 700,
                            fontSize: 11,
                            display: 'inline-block'
                          }}>
                            {g.department || 'Production'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: cStyle.bg,
                            color: cStyle.text,
                            border: `1px solid ${cStyle.border}`,
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontWeight: 700,
                            fontSize: 12
                          }}>
                            {g.category}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>
                          {g.reasonName}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: g.isActive ? '#dcfce7' : '#fee2e2',
                            color: g.isActive ? '#15803d' : '#b91c1c',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700
                          }}>
                            {g.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => handleOpenGapModal(g)}
                              style={{
                                background: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: 5,
                                padding: '5px 8px',
                                cursor: 'pointer',
                                color: '#374151',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Edit Reason"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteGap(g)}
                              style={{
                                background: '#ffebee',
                                border: '1px solid #ffcdd2',
                                borderRadius: 5,
                                padding: '5px 8px',
                                cursor: 'pointer',
                                color: '#c62828',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Delete Reason"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: REJECTION REASONS ──────────────────────────────── */}
      {activeTab === 'rejection' && (
        <div>
          {/* Action & Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: 10, top: 11 }} />
                <input
                  type="text"
                  placeholder="Search defect reasons, department, or categories..."
                  style={{ paddingLeft: 34, height: 38, width: '100%', borderRadius: 6, border: '1px solid #d1d5db' }}
                  value={rejSearch}
                  onChange={e => setRejSearch(e.target.value)}
                />
              </div>

              <select
                style={{ height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontWeight: 600, color: '#374151' }}
                value={selectedRejCategory}
                onChange={e => setSelectedRejCategory(e.target.value)}
              >
                <option value="All">All Categories</option>
                <option value="Casting">Casting</option>
                <option value="Coating">Coating</option>
                <option value="Core">Core</option>
                <option value="Defect">Defect</option>
                <option value="General">General</option>
              </select>
            </div>

            <button
              onClick={() => handleOpenRejModal()}
              style={{
                background: '#0b462c',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '0 16px',
                height: 38,
                fontWeight: 700,
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer'
              }}
            >
              <Plus size={16} /> Add Rejection Defect
            </button>
          </div>

          {/* Table */}
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>
                  <th style={{ padding: '12px 16px', width: 50 }}>#</th>
                  <th style={{ padding: '12px 16px', width: 140 }}>Department</th>
                  <th style={{ padding: '12px 16px' }}>Defect / Rejection Reason Name</th>
                  <th style={{ padding: '12px 16px', width: 140 }}>Category</th>
                  <th style={{ padding: '12px 16px', width: 100 }}>Status</th>
                  <th style={{ padding: '12px 16px', width: 110, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRejectionReasons.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#9ca3af' }}>
                      No rejection reasons match your search criteria for {selectedDepartment !== 'All' ? selectedDepartment : 'the selected filters'}.
                    </td>
                  </tr>
                ) : (
                  filteredRejectionReasons.map((r, idx) => {
                    const dStyle = DEPT_BADGE_STYLE[r.department || 'Production'] || DEPT_BADGE_STYLE['All'];
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '12px 16px', color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: dStyle.bg,
                            color: dStyle.text,
                            border: `1px solid ${dStyle.border}`,
                            padding: '3px 9px',
                            borderRadius: 12,
                            fontWeight: 700,
                            fontSize: 11,
                            display: 'inline-block'
                          }}>
                            {r.department || 'Production'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: '#111827' }}>
                          {r.reasonName}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            padding: '2px 9px',
                            borderRadius: 10,
                            fontWeight: 600,
                            fontSize: 11
                          }}>
                            {r.category || 'General'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            background: r.isActive ? '#dcfce7' : '#fee2e2',
                            color: r.isActive ? '#15803d' : '#b91c1c',
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 11,
                            fontWeight: 700
                          }}>
                            {r.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => handleOpenRejModal(r)}
                              style={{
                                background: '#f3f4f6',
                                border: '1px solid #d1d5db',
                                borderRadius: 5,
                                padding: '5px 8px',
                                cursor: 'pointer',
                                color: '#374151',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Edit Defect"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteRej(r)}
                              style={{
                                background: '#ffebee',
                                border: '1px solid #ffcdd2',
                                borderRadius: 5,
                                padding: '5px 8px',
                                cursor: 'pointer',
                                color: '#c62828',
                                display: 'inline-flex',
                                alignItems: 'center'
                              }}
                              title="Delete Defect"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT GAP REASON ──────────────────────────── */}
      {isGapModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 10,
            width: '100%',
            maxWidth: 480,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '16px 20px', background: '#0b462c', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {editingGap ? 'Edit Gap Reason' : 'Add New Gap Reason'}
              </h4>
              <button
                type="button"
                onClick={() => setIsGapModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveGap} style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                  Target Department <span style={{ color: '#d84343' }}>*</span>
                </label>
                <select
                  required
                  style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  value={gapForm.department}
                  onChange={e => setGapForm({ ...gapForm, department: e.target.value })}
                >
                  <option value="Production">Production (Casting / Foundry)</option>
                  <option value="DCF">DCF (Decoring / Cutting / Fettling)</option>
                  <option value="Quality">Quality (Inspection / UT / DPT)</option>
                  <option value="HT & Finishing">HT & Finishing</option>
                  <option value="Storage & Dispatch">Storage & Dispatch</option>
                  <option value="All">All Departments (Shared)</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                  Category Pillar <span style={{ color: '#d84343' }}>*</span>
                </label>
                <select
                  required
                  style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  value={gapForm.category}
                  onChange={e => setGapForm({ ...gapForm, category: e.target.value })}
                >
                  <option value="Manpower">1. Manpower</option>
                  <option value="Machine Breakdown">2. Machine Breakdown</option>
                  <option value="Raw Material">3. Raw Material</option>
                  <option value="Method">4. Method</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                  Root Cause / Reason Name <span style={{ color: '#d84343' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tilt Issue, Health Issue, Ingot shortage..."
                  style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  value={gapForm.reasonName}
                  onChange={e => setGapForm({ ...gapForm, reasonName: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={gapForm.isActive}
                    onChange={e => setGapForm({ ...gapForm, isActive: e.target.checked })}
                  />
                  Active for shop-floor entry
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsGapModalOpen(false)}
                  style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#0b462c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Reason
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT REJECTION DEFECT ────────────────────── */}
      {isRejModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 10,
            width: '100%',
            maxWidth: 480,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '16px 20px', background: '#0b462c', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {editingRej ? 'Edit Rejection Defect' : 'Add New Rejection Defect'}
              </h4>
              <button
                type="button"
                onClick={() => setIsRejModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRej} style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                  Target Department <span style={{ color: '#d84343' }}>*</span>
                </label>
                <select
                  required
                  style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  value={rejForm.department}
                  onChange={e => setRejForm({ ...rejForm, department: e.target.value })}
                >
                  <option value="Production">Production (Casting / Foundry)</option>
                  <option value="DCF">DCF (Decoring / Cutting / Fettling)</option>
                  <option value="Quality">Quality (Inspection / UT / DPT)</option>
                  <option value="HT & Finishing">HT & Finishing</option>
                  <option value="Storage & Dispatch">Storage & Dispatch</option>
                  <option value="All">All Departments (Shared)</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                  Defect Reason Name <span style={{ color: '#d84343' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Blow Hole, Shrinkage, Crack, Porosity..."
                  style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  value={rejForm.reasonName}
                  onChange={e => setRejForm({ ...rejForm, reasonName: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>
                  Defect Category / Stage
                </label>
                <input
                  type="text"
                  placeholder="e.g. Casting, Coating, Core, Defect, General..."
                  style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  value={rejForm.category}
                  onChange={e => setRejForm({ ...rejForm, category: e.target.value })}
                  list="rejection-categories-list"
                />
                <datalist id="rejection-categories-list">
                  <option value="Casting" />
                  <option value="Coating" />
                  <option value="Core" />
                  <option value="Defect" />
                  <option value="Finishing" />
                  <option value="Machining" />
                  <option value="Inspection" />
                  <option value="General" />
                </datalist>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={rejForm.isActive}
                    onChange={e => setRejForm({ ...rejForm, isActive: e.target.checked })}
                  />
                  Active for shop-floor entry
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsRejModalOpen(false)}
                  style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#0b462c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Defect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
