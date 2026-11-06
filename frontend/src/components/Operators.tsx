import { apiFetch } from '../context/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Save, X, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useModal } from '../context/ModalContext';
import { Pagination } from './ui/Pagination';

interface Supervisor {
  id: number;
  name: string;
  status?: string;
}

interface Operator {
  id: number;
  punchNo: string;
  name: string;
  aliasLetter: string;
  supervisorId: number | null;
  supervisor?: Supervisor;
  department: string;
  shift?: string;
  status: string;
}

export default function Operators() {
  const { showAlert, showConfirm } = useModal();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [currentOp, setCurrentOp] = useState<Operator>({
    id: 0, punchNo: '', name: '', aliasLetter: '', supervisorId: null, department: 'Production', shift: '', status: 'Active'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [opRes, supRes] = await Promise.all([
        apiFetch(`http://${window.location.hostname}:4900/api/operators`),
        apiFetch(`http://${window.location.hostname}:4900/api/supervisors`)
      ]);
      if (opRes.ok) setOperators(await opRes.json());
      if (supRes.ok) setSupervisors(await supRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isNew = currentOp.id === 0;
      const url = isNew ? `http://${window.location.hostname}:4900/api/operators` : `http://${window.location.hostname}:4900/api/operators/${currentOp.id}`;
      // Remove navigation property before sending
      const payload = { ...currentOp };
      delete payload.supervisor;
      
      const res = await apiFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setIsEditing(false);
        fetchData();
      } else {
        showAlert('Save Failed', 'Failed to save operator. Check if Punch No is unique.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id: number) => {
    showConfirm('Delete Operator', 'Delete operator?', async () => {
      try {
        const res = await apiFetch(`http://${window.location.hostname}:4900/api/operators/${id}`, { method: 'DELETE' });
        if (res.ok) fetchData();
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
            const punchNo = row['Punch No'] || row['punchNo'] || row['PunchNo'];
            if (!punchNo) continue;
            
            const newOp = {
                punchNo: punchNo.toString(),
                name: row['Name'] || row['name'] || '',
                aliasLetter: row['Alias'] || row['aliasLetter'] || '',
                department: row['Department'] || row['department'] || 'Production',
                shift: '',
                status: row['Status'] || row['status'] || 'Active'
            };

            const res = await apiFetch(`http://${window.location.hostname}:4900/api/operators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newOp)
            });
            
            if (res.ok) importedCount++;
            else duplicateCount++;
        }
        
        showAlert('Import Complete', `Import complete. Imported: ${importedCount}, Skipped/Duplicates: ${duplicateCount}`);
        fetchData();
      } catch (err) {
        console.error(err);
        showAlert('Import Error', 'Error importing file. Please ensure it matches the Operator Sheet format.');
      }
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const totalPages = Math.ceil(operators.length / itemsPerPage);
  const paginatedOperators = operators.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <h2>Operator Management</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImport} />
            <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16}/> Upload Excel
            </button>
            <button className="btn btn-nav" onClick={() => { setCurrentOp({ id: 0, punchNo: '', name: '', aliasLetter: '', supervisorId: null, department: 'Production', shift: '', status: 'Active' }); setIsEditing(true); }}>
              <Plus size={16} /> Add Operator
            </button>
        </div>
      </div>

      {isEditing && (
        <div className="input-form" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h3>{currentOp.id === 0 ? 'New Operator' : 'Edit Operator'}</h3>
            <button className="btn-delete-x" onClick={() => setIsEditing(false)}><X size={20}/></button>
          </div>
          <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 15, alignItems: 'flex-end' }}>
            <div>
              <label>Punch No *</label>
              <input required value={currentOp.punchNo} onChange={e => setCurrentOp({...currentOp, punchNo: e.target.value})} />
            </div>
            <div>
              <label>Name</label>
              <input value={currentOp.name} onChange={e => setCurrentOp({...currentOp, name: e.target.value})} />
            </div>
            <div>
              <label>Alias (A-Z)</label>
              <input maxLength={1} value={currentOp.aliasLetter} onChange={e => setCurrentOp({...currentOp, aliasLetter: e.target.value.toUpperCase()})} />
            </div>
            <div>
              <label>Supervisor</label>
              <select value={currentOp.supervisorId || ''} onChange={e => setCurrentOp({...currentOp, supervisorId: e.target.value ? parseInt(e.target.value) : null})}>
                <option value="">None</option>
                {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label>Department</label>
              <input value={currentOp.department} onChange={e => setCurrentOp({...currentOp, department: e.target.value})} />
            </div>
            <div>
              <label>Status</label>
              <select value={currentOp.status} onChange={e => setCurrentOp({...currentOp, status: e.target.value})}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <button type="submit" className="btn btn-highlight"><Save size={16} /> Save</button>
          </form>
        </div>
      )}

      <div className="table-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
        <table className="table-fit" style={{ width: '100%', minWidth: 'unset', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ width: '10%' }}>Punch No</th>
              <th style={{ width: '22%' }}>Name</th>
              <th style={{ width: '8%', textAlign: 'center' }}>Alias</th>
              <th style={{ width: '18%' }}>Department</th>
              <th style={{ width: '20%' }}>Supervisor</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Status</th>
              <th style={{ width: '12%', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center' }}>Loading operators...</td></tr> : 
              operators.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center' }}>No operators found.</td></tr>
              ) : (
              paginatedOperators.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.punchNo}</td>
                  <td style={{ fontWeight: 600, color: '#0b462c' }}>{o.name}</td>
                  <td style={{ textAlign: 'center' }}><span className="badge badge-normal">{o.aliasLetter || '-'}</span></td>
                  <td>{o.department || 'Production'}</td>
                  <td>{o.supervisor?.name || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${o.status === 'Active' ? 'badge-yield' : 'badge-rej-high'}`}>{o.status}</span>
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', marginRight: 5 }} onClick={() => { setCurrentOp(o); setIsEditing(true); }} title="Edit"><Edit2 size={14}/></button>
                    <button className="btn-small" style={{ background: '#ffebee', color: '#b71c1c' }} onClick={() => handleDelete(o.id)} title="Delete"><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={operators.length}
            itemsPerPage={itemsPerPage}
          />
        )}
      </div>
    </div>
  );
}
