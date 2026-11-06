import { apiFetch } from '../context/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Save, X, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useModal } from '../context/ModalContext';

interface Supervisor {
  id: number;
  name: string;
  status: string;
  department?: string;
}

export default function Supervisors() {
  const { showAlert, showConfirm } = useModal();
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentSupervisor, setCurrentSupervisor] = useState<Supervisor>({ id: 0, name: '', status: 'Active', department: '' });

  useEffect(() => {
    fetchSupervisors();
  }, []);

  const fetchSupervisors = async () => {
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/supervisors`);
      if (res.ok) setSupervisors(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isNew = currentSupervisor.id === 0;
      const url = isNew ? `http://${window.location.hostname}:4900/api/supervisors` : `http://${window.location.hostname}:4900/api/supervisors/${currentSupervisor.id}`;
      const res = await apiFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSupervisor)
      });
      if (res.ok) {
        setIsEditing(false);
        fetchSupervisors();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id: number) => {
    showConfirm('Delete Supervisor', 'Are you sure you want to delete this supervisor?', async () => {
      try {
        const res = await apiFetch(`http://${window.location.hostname}:4900/api/supervisors/${id}`, { method: 'DELETE' });
        if (res.ok) fetchSupervisors();
      } catch (err) {
        console.error(err);
      }
    });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);

        let importedCount = 0;
        let duplicateCount = 0;

        for (const row of data as any[]) {
          const name = row['Name'] || row['name'] || row['Supervisor Name'];
          if (!name) continue;

          const newSup = {
            name: name.toString(),
            status: row['Status'] || row['status'] || 'Active',
            department: row['Department'] || row['department'] || ''
          };

          const res = await apiFetch(`http://${window.location.hostname}:4900/api/supervisors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSup)
          });

          if (res.ok) importedCount++;
          else duplicateCount++;
        }

        showAlert('Import Complete', `Imported: ${importedCount}, Skipped/Duplicates: ${duplicateCount}`);
        fetchSupervisors();
      } catch (err) {
        console.error(err);
        showAlert('Import Error', 'Error importing file. Please ensure it matches the Supervisor Sheet format.');
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2>Supervisor Management</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImport} />
          <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Upload Excel
          </button>
          <button className="btn btn-nav" onClick={() => { setCurrentSupervisor({ id: 0, name: '', status: 'Active', department: '' }); setIsEditing(true); }}>
            <Plus size={16} /> Add Supervisor
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="input-form" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>{currentSupervisor.id === 0 ? 'New Supervisor' : 'Edit Supervisor'}</h3>
            <button className="btn-delete-x" onClick={() => setIsEditing(false)}><X size={20} /></button>
          </div>
          <form onSubmit={handleSave} style={{ display: 'flex', gap: 15, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label>Name *</label>
              <input required value={currentSupervisor.name} onChange={e => setCurrentSupervisor({ ...currentSupervisor, name: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label>Department</label>
              <input value={currentSupervisor.department || ''} onChange={e => setCurrentSupervisor({ ...currentSupervisor, department: e.target.value })} placeholder="e.g. DCF, UT" />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <label>Status</label>
              <select value={currentSupervisor.status} onChange={e => setCurrentSupervisor({ ...currentSupervisor, status: e.target.value })}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <button type="submit" className="btn btn-highlight" style={{ flex: '0 0 auto' }}><Save size={16} /> Save</button>
          </form>
        </div>
      )}

      <div className="table-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
        <table className="table-fit" style={{ width: '100%', minWidth: 'unset', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Status</th>
              <th style={{ width: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={4}>Loading...</td></tr> :
              supervisors.map(s => (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.name}</td>
                  <td>{s.department || '-'}</td>
                  <td>
                    <span className={`badge ${s.status === 'Active' ? 'badge-yield' : 'badge-rej-high'}`}>{s.status}</span>
                  </td>
                  <td>
                    <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', marginRight: 5 }} onClick={() => { setCurrentSupervisor(s); setIsEditing(true); }}><Edit2 size={14} /></button>
                    <button className="btn-small" style={{ background: '#ffebee', color: '#b71c1c' }} onClick={() => handleDelete(s.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
