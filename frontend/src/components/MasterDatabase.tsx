import React, { useState, useEffect, useRef } from 'react';
import { apiFetch, useAuth } from '../context/AuthContext';
import { Search, Plus, Edit2, Trash2, Save, X, Download, Upload, Calendar, Calculator, BarChart2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useModal } from '../context/ModalContext';
import { Pagination } from './ui/Pagination';

interface MasterDatabaseRecord {
  partId: number;
  partNo: string;
  partName: string;
  customer: string;
  shotWeight: number;
  castingWeight: number;
  cycleTime: number;
  material: string;
  requiresCore: boolean;
  coreType?: string;
  requiresHT: boolean;
  htType?: string;
  productionOutputPerMachine: number;
  dispatchLocation: string;
  planId?: number;
  monthYear: string;
  dispatchTarget: number;
  targetRev01?: number;
  rejectionBufferPercentage: number;
  calculatedRejectionPercentage?: number;
}

const emptyRecord: MasterDatabaseRecord = {
  partId: 0, partNo: '', partName: '', customer: '',
  shotWeight: 0, castingWeight: 0, cycleTime: 0, material: '',
  requiresCore: false, coreType: '', requiresHT: false, htType: '',
  productionOutputPerMachine: 0, dispatchLocation: '',
  monthYear: new Date().toISOString().substring(0, 7),
  dispatchTarget: 0, targetRev01: undefined, rejectionBufferPercentage: 0
};

export default function MasterDatabase() {
  const [records, setRecords] = useState<MasterDatabaseRecord[]>([]);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MasterDatabaseRecord>(emptyRecord);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [monthlyUpdateMode, setMonthlyUpdateMode] = useState(false);
  const [monthlyEdits, setMonthlyEdits] = useState<Record<number, { dispatchTarget: number; targetRev01?: number; rejectionBufferPercentage: number }>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showResetPrompt, setShowResetPrompt] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; partNo: string } | null>(null);
  const [corePartSearch, setCorePartSearch] = useState('');
  const [uploadStatus, setUploadStatus] = useState<{
    isUploading: boolean; total: number; current: number;
    success: number; fail: number; skipped: number;
    errors: { partNo: string; reason: string }[];
  } | null>(null);

  const itemsPerPage = 15;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showAlert } = useModal();
  const { role } = useAuth();

  const fetchRecords = async () => {
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase?monthYear=${selectedMonth}`);
      if (res.ok) setRecords(await res.json());
    } catch (err) { console.error('Failed to load master database', err); }
  };

  useEffect(() => { fetchRecords(); }, [selectedMonth]);
  useEffect(() => { setCurrentPage(1); }, [search, selectedMonth]);

  const handleSave = async () => {
    if (!editForm.partNo.trim() || !editForm.partName.trim()) {
      showAlert('Validation Error', 'Part Number and Part Name are both required.');
      return;
    }
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase`, {
        method: 'POST', body: JSON.stringify(editForm)
      });
      if (res.ok) {
        setIsAdding(false); setEditingId(null); fetchRecords();
        showAlert('Success', `Part "${editForm.partNo}" saved successfully!`);
      } else {
        showAlert('Error', 'Failed to save: ' + await res.text());
      }
    } catch { showAlert('Error', 'Network error while saving.'); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/masterparts/${confirmDelete.id}`, { method: 'DELETE' });
      if (res.ok) { fetchRecords(); showAlert('Deleted', `Part "${confirmDelete.partNo}" deleted.`); }
      else showAlert('Error', 'Delete failed: ' + await res.text());
    } catch { showAlert('Error', 'Network error during delete.'); }
    finally { setConfirmDelete(null); }
  };

  const startEdit = (rec: MasterDatabaseRecord) => {
    setEditForm({ ...rec }); setEditingId(rec.partId); setIsAdding(false);
  };

  const handleResetDatabase = async () => {
    if (!resetPassword) { showAlert('Error', 'Password is required.'); return; }
    setIsResetting(true);
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword })
      });
      if (res.ok) {
        setShowResetPrompt(false); setResetPassword('');
        showAlert('Success', 'Database reset successfully. All master parts and plans cleared.');
        fetchRecords();
      } else {
        showAlert('Error', 'Wrong password!');
      }
    } catch { showAlert('Error', 'Network error during reset.'); }
    finally { setIsResetting(false); }
  };

  const handleMonthlyUpdateSave = async () => {
    if (Object.keys(monthlyEdits).length === 0) return;
    setIsSavingAll(true);
    const payloads = Object.entries(monthlyEdits).map(([partIdStr, edits]) => {
      const original = records.find(r => r.partId === parseInt(partIdStr));
      return original ? { ...original, ...edits, monthYear: selectedMonth } : null;
    }).filter(Boolean) as MasterDatabaseRecord[];
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase/bulk`, {
        method: 'POST', body: JSON.stringify(payloads)
      });
      const result = res.ok ? await res.json() : { success: 0, fail: payloads.length };
      showAlert('Monthly Update', `Saved ${result.success} part(s) for ${selectedMonth}.${result.fail > 0 ? ` ${result.fail} failed.` : ''}`);
    } catch { showAlert('Error', 'Network error during save.'); }
    finally { setIsSavingAll(false); setMonthlyEdits({}); setMonthlyUpdateMode(false); fetchRecords(); }
  };

  const updateMonthlyEdit = (partId: number, field: string, value: any) => {
    setMonthlyEdits(prev => ({ ...prev, [partId]: { ...prev[partId], [field]: value } }));
  };

  const getMonthlyVal = <T extends keyof MasterDatabaseRecord>(r: MasterDatabaseRecord, field: T) => {
    const edits = monthlyEdits[r.partId];
    if (edits && field in edits) return (edits as any)[field];
    return r[field];
  };

  const handleExport = () => {
    const exportData = records.map(r => {
      const effectiveAsk = r.targetRev01 ?? r.dispatchTarget;
      const calcRej = r.calculatedRejectionPercentage || 0;
      const isAuto = r.rejectionBufferPercentage === 0 && calcRej > 0;
      const effectiveBuffer = isAuto ? calcRej : r.rejectionBufferPercentage;
      const prodTarget = Math.ceil(effectiveAsk * (1 + effectiveBuffer / 100));
      return {
        'Part No': r.partNo,
        'Part Name': r.partName,
        'Customer': r.customer,
        'Material': r.material,
        'Core Type': r.requiresCore ? r.coreType || 'Yes' : 'No',
        'HT Type': r.requiresHT ? r.htType || 'Yes' : 'No',
        'Cast Wt (kg)': r.castingWeight,
        'Shot Wt (kg)': r.shotWeight,
        'Cycle Time (s)': r.cycleTime,
        'M/C Capacity per day': r.productionOutputPerMachine,
        'Dispatch Loc': r.dispatchLocation,
        'Customer Ask (Rev 00)': r.dispatchTarget,
        'Revised Ask (Rev 01)': r.targetRev01 || '',
        'Rejection Buffer %': r.rejectionBufferPercentage,
        'Effective Demand': effectiveAsk,
        'Production Target': prodTarget,
        'Core Qty Target': r.requiresCore ? prodTarget : 0,
        'Raw Mat. Needed (kg)': (prodTarget * r.castingWeight).toFixed(2),
        'Daily Target': Math.ceil(prodTarget / 25),
        'Shift Target': Math.ceil(prodTarget / 50)
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MasterDatabase');
    XLSX.writeFile(wb, `MasterDatabase_${selectedMonth}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const templateData = [{
      'Part No': 'EXAMPLE-01', 'Part Name': 'Example Part', 'Customer': 'Example Corp',
      'Material': 'Aluminum', 'Core Type': 'No', 'HT Type': 'Yes',
      'Cast Wt (kg)': 10.5, 'Shot Wt (kg)': 12.5, 'Cycle Time (s)': 120,
      'M/C Capacity per day': 200, 'Dispatch Loc': 'Pune',
      'Customer Ask (Rev 00)': 1000, 'Revised Ask (Rev 01)': '',
      'Rejection Buffer %': 5, 'Month (YYYY-MM)': selectedMonth
    }];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'MasterDatabase_Import_Template.xlsx');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);
        const payloads: MasterDatabaseRecord[] = [];
        const seenPartNos = new Set<string>();
        let skippedDuplicates = 0;
        for (const row of data as any[]) {
          const partNo = String(row['Part No'] || '').trim();
          if (!partNo) continue;
          if (seenPartNos.has(partNo)) { skippedDuplicates++; continue; }
          seenPartNos.add(partNo);
          const reqCore = !!(row['Core Type'] && row['Core Type'] !== 'No' && row['Core Type'] !== 'False' && row['Core Type'] !== 0 && row['Core Type'] !== '0');
          const reqHT = !!(row['HT Type'] && row['HT Type'] !== 'No' && row['HT Type'] !== 'False' && row['HT Type'] !== 0 && row['HT Type'] !== '0');
          const importMonth = row['Month (YYYY-MM)'] ? String(row['Month (YYYY-MM)']).trim() : selectedMonth;
          const payload: MasterDatabaseRecord = {
            partId: 0, partNo, partName: String(row['Part Name'] || ''),
            customer: String(row['Customer'] || ''), material: String(row['Material'] || ''),
            requiresCore: reqCore,
            coreType: reqCore && row['Core Type'] !== 'Yes' ? String(row['Core Type']) : undefined,
            requiresHT: reqHT,
            htType: reqHT && row['HT Type'] !== 'Yes' ? String(row['HT Type']) : undefined,
            castingWeight: Number(row['Cast Wt (kg)']) || 0,
            shotWeight: Number(row['Shot Wt (kg)']) || 0,
            cycleTime: Number(row['Cycle Time (s)']) || 0,
            productionOutputPerMachine: Number(row['M/C Capacity per day']) || Number(row['Capacity/Day']) || 0,
            dispatchLocation: String(row['Dispatch Loc'] || ''),
            monthYear: importMonth,
            dispatchTarget: Number(row['Customer Ask (Rev 00)']) || 0,
            targetRev01: row['Revised Ask (Rev 01)'] ? Number(row['Revised Ask (Rev 01)']) : undefined,
            rejectionBufferPercentage: Number(row['Rejection Buffer %']) || 0
          };
          const existing = records.find(r => r.partNo === payload.partNo);
          if (existing) { payload.partId = existing.partId; payload.planId = existing.planId; }
          payloads.push(payload);
        }
        if (payloads.length === 0) {
          showAlert('Import Error', 'No valid rows found. Make sure the file has a "Part No" column.');
          return;
        }
        setUploadStatus({ isUploading: true, total: payloads.length, current: 0, success: 0, fail: 0, skipped: skippedDuplicates, errors: [] });
        try {
          const res = await apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase/bulk`, {
            method: 'POST', body: JSON.stringify(payloads)
          });
          if (res.ok) {
            const result = await res.json();
            setUploadStatus({ isUploading: false, total: payloads.length, current: payloads.length, success: result.success, fail: result.fail, skipped: skippedDuplicates, errors: [] });
            fetchRecords();
          } else {
            const errText = await res.text();
            setUploadStatus({ isUploading: false, total: payloads.length, current: payloads.length, success: 0, fail: payloads.length, skipped: skippedDuplicates, errors: [{ partNo: 'ALL ROWS', reason: errText }] });
          }
        } catch (err: any) {
          setUploadStatus({ isUploading: false, total: payloads.length, current: payloads.length, success: 0, fail: payloads.length, skipped: skippedDuplicates, errors: [{ partNo: 'ALL ROWS', reason: err.message || 'Network error' }] });
        }
      } catch {
        showAlert('Import Error', 'Failed to read Excel file. Make sure it is a valid .xlsx file.');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const rawMatSummary = records.reduce<Record<string, { totalKg: number; parts: string[] }>>((acc, r) => {
    const effectiveAsk = r.targetRev01 ?? r.dispatchTarget;
    const effectiveBuffer = r.rejectionBufferPercentage || r.calculatedRejectionPercentage || 0;
    const prodTarget = Math.ceil(effectiveAsk * (1 + effectiveBuffer / 100));
    const kg = prodTarget * r.castingWeight;
    const mat = r.material || 'Unknown';
    if (!acc[mat]) acc[mat] = { totalKg: 0, parts: [] };
    acc[mat].totalKg += kg; acc[mat].parts.push(r.partNo);
    return acc;
  }, {});

  const corePartsList = records
    .filter(r => r.requiresCore)
    .map(r => {
      const effectiveAsk = r.targetRev01 ?? r.dispatchTarget;
      const effectiveBuffer = r.rejectionBufferPercentage || r.calculatedRejectionPercentage || 0;
      const prodTarget = Math.ceil(effectiveAsk * (1 + effectiveBuffer / 100));
      return {
        partId: r.partId,
        partNo: r.partNo,
        partName: r.partName,
        customer: r.customer,
        coreType: r.coreType || 'General Core',
        qty: prodTarget
      };
    })
    .sort((a, b) => b.qty - a.qty);

  const coreSummary = records.reduce<Record<string, { totalQty: number; parts: { partNo: string; partName: string; qty: number }[] }>>((acc, r) => {
    if (!r.requiresCore) return acc;
    const effectiveAsk = r.targetRev01 ?? r.dispatchTarget;
    const effectiveBuffer = r.rejectionBufferPercentage || r.calculatedRejectionPercentage || 0;
    const prodTarget = Math.ceil(effectiveAsk * (1 + effectiveBuffer / 100));
    const cType = r.coreType || 'General Core';
    if (!acc[cType]) acc[cType] = { totalQty: 0, parts: [] };
    acc[cType].totalQty += prodTarget;
    acc[cType].parts.push({ partNo: r.partNo, partName: r.partName, qty: prodTarget });
    return acc;
  }, {});

  const filteredCoreParts = corePartsList.filter(p =>
    p.partNo.toLowerCase().includes(corePartSearch.toLowerCase()) ||
    p.partName.toLowerCase().includes(corePartSearch.toLowerCase()) ||
    p.coreType.toLowerCase().includes(corePartSearch.toLowerCase())
  );
  const grandTotalCoreQty = corePartsList.reduce((sum, p) => sum + p.qty, 0);

  const handleDownloadSummaryReport = () => {
    const matRows = Object.entries(rawMatSummary).map(([mat, data]) => ({
      'Category': 'Raw Material',
      'Name / Type': mat,
      'Total Required (kg)': Number(data.totalKg.toFixed(1)),
      'Unit': 'kg',
      'Parts Included': data.parts.join(', ')
    }));
    const coreRows = Object.entries(coreSummary).map(([cType, data]) => ({
      'Category': 'Core Type',
      'Name / Type': cType,
      'Total Required (pcs)': data.totalQty,
      'Unit': 'pcs',
      'Parts & Required Qty': data.parts.map(p => `${p.partNo}: ${p.qty.toLocaleString()} pcs`).join('; ')
    }));

    const corePartRows = corePartsList.map(p => ({
      'Part Number': p.partNo,
      'Part Name': p.partName,
      'Customer': p.customer,
      'Core Type': p.coreType,
      'Required Core Qty (pcs)': p.qty,
      'Month': selectedMonth
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet([...matRows, ...coreRows]);
    XLSX.utils.book_append_sheet(wb, ws1, 'RM & Core Summary');
    const ws2 = XLSX.utils.json_to_sheet(corePartRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Core by Part No');

    XLSX.writeFile(wb, `RM_Core_Summary_${selectedMonth}.xlsx`);
  };

  const filtered = records.filter(r =>
    r.partNo.toLowerCase().includes(search.toLowerCase()) ||
    r.partName.toLowerCase().includes(search.toLowerCase()) ||
    r.customer.toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="portal-workspace fade-in">
      <div className="module-header">
        <div>
          <h2>Master Database</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#fff', padding: '0 10px', borderRadius: '6px', border: '1px solid #c8dfd0', height: '36px' }}>
            <Calendar size={16} style={{ marginRight: 6, color: 'var(--primary)' }} />
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', fontWeight: 'bold', color: 'var(--primary)' }} />
          </div>
          <button className={monthlyUpdateMode ? 'btn btn-highlight' : 'btn btn-outline'}
            onClick={() => { setMonthlyUpdateMode(!monthlyUpdateMode); setMonthlyEdits({}); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={16} /> {monthlyUpdateMode ? '✕ Exit Update Mode' : '📅 Monthly Update'}
          </button>
          <button className="btn btn-nav" onClick={() => { setIsAdding(true); setEditingId(null); setEditForm({ ...emptyRecord, monthYear: selectedMonth }); }}>
            <Plus size={16} /> Add Part
          </button>
          <button className="btn btn-nav" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> Import Excel
          </button>
          <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
          <button className="btn btn-outline" onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', height: '36px' }}>
            <Download size={14} /> Get Template
          </button>
          <button className="btn btn-nav" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Download size={16} /> Export Master
          </button>
          <button className={showSummary ? 'btn btn-highlight' : 'btn btn-nav'}
            onClick={() => setShowSummary(!showSummary)}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <BarChart2 size={16} /> {showSummary ? 'Hide Summary' : 'RM & Core Summary'}
          </button>
          {role?.toLowerCase() === 'admin' && (
            <button className="btn" onClick={() => setShowResetPrompt(true)}
              style={{ background: '#d32f2f', color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Trash2 size={16} /> Reset Database
            </button>
          )}
        </div>
      </div>

      {!showSummary && (
        <div className="portal-toolbar">
          <div style={{ position: 'relative', width: '350px' }}>
            <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: '#aaa' }} />
            <input type="text" placeholder="Search by part no, name or customer..."
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 34px', borderRadius: '6px', border: '1px solid #ccc' }} />
          </div>
          {search && <span style={{ fontSize: 13, color: '#666', alignSelf: 'center' }}>Showing {filtered.length} of {records.length} parts</span>}
        </div>
      )}

      {showSummary && (
        <div style={{ marginBottom: 20, border: '2px solid #e65100', borderRadius: 10, overflow: 'hidden', background: '#fff', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div style={{ background: 'linear-gradient(135deg, #e65100, #f57c00)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#fff', fontSize: 16 }}>Raw Material and Core Requirement Summary</strong>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginLeft: 12 }}>for {selectedMonth}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handleDownloadSummaryReport} style={{ background: '#fff', color: '#0b4d30', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Download size={14} /> Download Report
              </button>
              <button className="btn" onClick={() => setShowSummary(false)} style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}><X size={14} /></button>
            </div>
          </div>
          {records.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#bbb' }}>
              <BarChart2 size={40} style={{ marginBottom: 10, opacity: 0.3 }} />
              <div>No parts in database for {selectedMonth}. Import an Excel file or add parts manually.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', width: '100%', maxWidth: '100%' }}>
              <div style={{ flex: '1 1 360px', minWidth: 0, maxWidth: '100%', borderRight: '2px solid #d2e5d9', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: '#e9f2ec', padding: '10px 16px', fontWeight: 'bold', color: '#0b4d30', borderBottom: '1px solid #d2e5d9', fontSize: 14 }}>Raw Material Requirements</div>
                <div style={{ flex: 1, maxHeight: 420, overflowY: 'auto', overflowX: 'auto', width: '100%' }}>
                  <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#0b462c' }}>
                      <tr style={{ borderBottom: '1px solid #d2e5d9' }}>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600 }}>Material</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600 }}>Total (kg)</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600 }}>Parts Included</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(rawMatSummary).sort((a, b) => b[1].totalKg - a[1].totalKg).map(([mat, data], idx) => (
                        <tr key={mat} style={{ borderBottom: '1px solid #d2e5d9', background: idx % 2 === 0 ? '#fff' : '#f5f9f7' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 'bold', color: '#0b4d30', whiteSpace: 'nowrap' }}>{mat}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: 14, whiteSpace: 'nowrap' }}>{data.totalKg.toFixed(1)}</td>
                          <td style={{ padding: '9px 12px', fontSize: 11, color: '#555', wordBreak: 'break-word' }} title={data.parts.join(', ')}>{data.parts.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1, background: '#e9f2ec' }}>
                      <tr style={{ borderTop: '2px solid #0b4d30' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 'bold', fontSize: 13, color: '#0b4d30' }}>GRAND TOTAL</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: 16, color: '#0b4d30', whiteSpace: 'nowrap' }}>{Object.values(rawMatSummary).reduce((s, d) => s + d.totalKg, 0).toFixed(1)} kg</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <div style={{ flex: '1 1 480px', minWidth: 0, maxWidth: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  background: '#e9f2ec',
                  padding: '8px 14px',
                  borderBottom: '1px solid #d2e5d9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontWeight: 'bold', color: '#0b4d30', fontSize: 14 }}>Core Requirements (Part-Wise)</span>
                    <span style={{
                      fontSize: 11,
                      background: '#0b4d30',
                      color: '#fff',
                      padding: '2px 7px',
                      borderRadius: 10,
                      fontWeight: 600
                    }}>
                      {corePartsList.length} parts
                    </span>
                  </div>

                  {corePartsList.length > 5 && (
                    <input
                      type="text"
                      placeholder="Filter part..."
                      value={corePartSearch}
                      onChange={e => setCorePartSearch(e.target.value)}
                      style={{
                        padding: '3px 8px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: '1px solid #b2dfdb',
                        width: 120,
                        background: '#fff'
                      }}
                    />
                  )}
                </div>

                <div style={{ flex: 1, maxHeight: 420, overflowY: 'auto', overflowX: 'auto', width: '100%' }}>
                  {corePartsList.length === 0 ? (
                    <div style={{ padding: 30, color: '#bbb', fontSize: 13, textAlign: 'center' }}>No core requirements for this month.</div>
                  ) : (
                    <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#0b462c' }}>
                        <tr style={{ borderBottom: '1px solid #d2e5d9' }}>
                          <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600, whiteSpace: 'nowrap' }}>Part No</th>
                          <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600 }}>Part Name</th>
                          <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600, whiteSpace: 'nowrap' }}>Core Type</th>
                          <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12, color: '#ffffff', background: '#0b462c', fontWeight: 600, whiteSpace: 'nowrap' }}>Required Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCoreParts.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 12 }}>
                              No matching parts found for "{corePartSearch}".
                            </td>
                          </tr>
                        ) : (
                          filteredCoreParts.map((p, idx) => (
                            <tr key={p.partId || p.partNo} style={{ borderBottom: '1px solid #d2e5d9', background: idx % 2 === 0 ? '#fff' : '#f5f9f7' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0b4d30', fontSize: 13, wordBreak: 'break-word', whiteSpace: 'nowrap' }}>
                                {p.partNo}
                              </td>
                              <td style={{ padding: '8px 12px', fontSize: 12, color: '#333' }}>
                                <div style={{ fontWeight: 500 }} title={p.partName}>{p.partName || '-'}</div>
                                {p.customer && <div style={{ fontSize: 10, color: '#888' }}>{p.customer}</div>}
                              </td>
                              <td style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: '#e0f2f1',
                                  color: '#00695c',
                                  fontWeight: 600,
                                  fontSize: 11
                                }}>
                                  {p.coreType}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#0b4d30', whiteSpace: 'nowrap' }}>
                                {p.qty.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500, color: '#666' }}>pcs</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 1, background: '#e9f2ec' }}>
                        <tr style={{ borderTop: '2px solid #0b4d30' }}>
                          <td colSpan={3} style={{ padding: '10px 12px', fontWeight: 'bold', fontSize: 13, color: '#0b4d30' }}>
                            GRAND TOTAL ({filteredCoreParts.length} parts)
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'bold', fontSize: 15, color: '#0b4d30', whiteSpace: 'nowrap' }}>
                            {filteredCoreParts.reduce((s, p) => s + p.qty, 0).toLocaleString()} pcs
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!showSummary && (
        <>
          {monthlyUpdateMode && (
            <div style={{ background: '#e3f2fd', border: '2px solid #1565c0', borderRadius: 8, padding: '12px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <strong style={{ color: '#1565c0' }}>📅 Monthly Update Mode — {selectedMonth}</strong>
                <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>Edit Customer Ask, Revised Plan and Rejection Buffer inline. Click <strong>Save All</strong> when done.</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline" onClick={() => { setMonthlyEdits({}); setMonthlyUpdateMode(false); }}>Cancel</button>
                <button className="btn btn-highlight" onClick={handleMonthlyUpdateSave}
                  disabled={isSavingAll || Object.keys(monthlyEdits).length === 0} style={{ minWidth: 160 }}>
                  {isSavingAll ? 'Saving...' : `💾 Save All (${Object.keys(monthlyEdits).length} changes)`}
                </button>
              </div>
            </div>
          )}

          {(isAdding || editingId !== null) && (
            <div className="input-form slide-down">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3>{isAdding ? 'Add New Part to Master' : `Editing Part: ${editForm.partNo}`}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 10px', borderRadius: 4, fontSize: 13, fontWeight: 'bold' }}>📅 Month: {selectedMonth}</span>
                  <button className="btn-delete-x" onClick={() => { setIsAdding(false); setEditingId(null); }}><X size={20} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <h4 style={{ margin: '0 0 10px', color: 'var(--primary)', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>Part Specifications</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px', alignItems: 'center' }}>
                    <label>Part No *</label>
                    <input className="input-field" value={editForm.partNo} onChange={e => setEditForm({ ...editForm, partNo: e.target.value })} disabled={!isAdding && editingId !== null} placeholder="e.g. PN-001" />
                    <label>Part Name *</label>
                    <input className="input-field" value={editForm.partName} onChange={e => setEditForm({ ...editForm, partName: e.target.value })} />
                    <label>Customer</label>
                    <input className="input-field" value={editForm.customer} onChange={e => setEditForm({ ...editForm, customer: e.target.value })} />
                    <label>Material</label>
                    <input className="input-field" value={editForm.material} onChange={e => setEditForm({ ...editForm, material: e.target.value })} />
                    <label>Cast Wt (kg)</label>
                    <input className="input-field" type="number" step="0.01" value={editForm.castingWeight} onChange={e => setEditForm({ ...editForm, castingWeight: parseFloat(e.target.value) || 0 })} />
                    <label>Shot Wt (kg)</label>
                    <input className="input-field" type="number" step="0.01" value={editForm.shotWeight} onChange={e => setEditForm({ ...editForm, shotWeight: parseFloat(e.target.value) || 0 })} />
                    <label>Cycle Time (s)</label>
                    <input className="input-field" type="number" value={editForm.cycleTime} onChange={e => setEditForm({ ...editForm, cycleTime: parseFloat(e.target.value) || 0 })} />
                    <label>Dispatch Loc</label>
                    <input className="input-field" value={editForm.dispatchLocation} onChange={e => setEditForm({ ...editForm, dispatchLocation: e.target.value })} />
                  </div>
                </div>
                <div style={{ flex: '1 1 300px' }}>
                  <h4 style={{ margin: '0 0 10px', color: 'var(--primary)', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>Process & Routing</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px', alignItems: 'center' }}>
                    <label>Req Core</label>
                    <select className="input-field" value={editForm.requiresCore ? 'Yes' : 'No'} onChange={e => setEditForm({ ...editForm, requiresCore: e.target.value === 'Yes' })}>
                      <option value="No">No</option><option value="Yes">Yes</option>
                    </select>
                    {editForm.requiresCore && (<>
                      <label>Core Type</label>
                      <select className="input-field" value={editForm.coreType || ''} onChange={e => setEditForm({ ...editForm, coreType: e.target.value })}>
                        <option value="">Select...</option>
                        <option value="Shell">Shell</option><option value="Amine">Amine</option><option value="No Bake">No Bake</option>
                      </select>
                    </>)}
                    <label>Req HT</label>
                    <select className="input-field" value={editForm.requiresHT ? 'Yes' : 'No'} onChange={e => setEditForm({ ...editForm, requiresHT: e.target.value === 'Yes' })}>
                      <option value="No">No</option><option value="Yes">Yes</option>
                    </select>
                    {editForm.requiresHT && (<>
                      <label>HT Type</label>
                      <input className="input-field" value={editForm.htType || ''} onChange={e => setEditForm({ ...editForm, htType: e.target.value })} placeholder="e.g. T6" />
                    </>)}
                    <label>M/C Output/day</label>
                    <input className="input-field" type="number" value={editForm.productionOutputPerMachine} onChange={e => setEditForm({ ...editForm, productionOutputPerMachine: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
                <div style={{ flex: '1 1 300px' }}>
                  <h4 style={{ margin: '0 0 10px', color: '#1565c0', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>Planning: {selectedMonth}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px', alignItems: 'center' }}>
                    <label>Dispatch Plan (Rev 00)</label>
                    <input className="input-field" type="number" value={editForm.dispatchTarget} onChange={e => setEditForm({ ...editForm, dispatchTarget: parseFloat(e.target.value) || 0 })} />
                    <label>Dispatch Plan (Rev 01)</label>
                    <input className="input-field" type="number" value={editForm.targetRev01 || ''} placeholder="Optional" onChange={e => setEditForm({ ...editForm, targetRev01: e.target.value ? parseFloat(e.target.value) : undefined })} />
                    <label>Rej Buffer %</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <input className="input-field" type="number" step="0.1" value={editForm.rejectionBufferPercentage} onChange={e => setEditForm({ ...editForm, rejectionBufferPercentage: parseFloat(e.target.value) || 0 })} style={{ flex: 1 }} />
                      <span>%</span>
                    </div>
                    <div style={{ gridColumn: '1 / -1', background: '#f0f7ff', padding: '10px', borderRadius: '6px', marginTop: '6px', fontSize: '13px', border: '1px solid #bbdefb' }}>
                      <strong style={{ color: '#1565c0' }}>Auto-Calculations:</strong>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                        <span>Effective Dispatch Plan:</span><strong>{editForm.targetRev01 ?? editForm.dispatchTarget}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span>Production Plan (w/ Buffer):</span><strong>{Math.ceil((editForm.targetRev01 ?? editForm.dispatchTarget) * (1 + editForm.rejectionBufferPercentage / 100))}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span>Shift Qty:</span><strong>{Math.ceil(editForm.productionOutputPerMachine / 2)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 20, textAlign: 'right' }}>
                <button className="btn btn-highlight" onClick={handleSave} style={{ minWidth: 150 }}>
                  <Save size={16} /> Save Master Record
                </button>
              </div>
            </div>
          )}

          <div className="table-wrapper">
            <table className="portal-table" style={{ minWidth: 'unset', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th>Part No / Name</th>
                  <th>Customer</th>
                  <th>Core / HT</th>
                  <th>Cycle (s)</th>
                  <th>M/C output/day</th>
                  <th>Daily Target</th>
                  <th>Shift Target</th>
                  <th>Dispatch Plan</th>
                  <th>Buffer %</th>
                  <th>Production Plan</th>
                  <th>Core Target</th>
                  <th>Raw Mat (kg)</th>
                  <th>Material</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(r => {
                  const effectiveAsk = (getMonthlyVal(r, 'targetRev01') as number | undefined) ?? (getMonthlyVal(r, 'dispatchTarget') as number);
                  const calcRej = r.calculatedRejectionPercentage || 0;
                  const curBuffer = getMonthlyVal(r, 'rejectionBufferPercentage') as number;
                  const isAuto = r.rejectionBufferPercentage === 0 && calcRej > 0;
                  const effectiveBuffer = isAuto ? calcRej : curBuffer;
                  const prodTarget = Math.ceil(effectiveAsk * (1 + effectiveBuffer / 100));
                  const rawMaterial = prodTarget * r.castingWeight;
                  const dailyTarget = Math.ceil(prodTarget / 25);
                  const shiftQty = r.productionOutputPerMachine && r.productionOutputPerMachine > 0
                    ? Math.ceil(r.productionOutputPerMachine / 2)
                    : Math.ceil(prodTarget / 50);
                  const coreQty = r.requiresCore ? prodTarget : '-';
                  const hasEdits = !!monthlyEdits[r.partId];
                  return (
                    <tr key={r.partId} style={hasEdits ? { background: '#fffde7' } : {}}>
                      <td>
                        <strong>{r.partNo}</strong><br />
                        <span style={{ fontSize: 11, color: '#666' }}>{r.partName}</span>
                        {hasEdits && <span style={{ fontSize: 10, background: '#f57f17', color: '#fff', borderRadius: 3, padding: '1px 5px', marginLeft: 4 }}>Edited</span>}
                      </td>
                      <td>{r.customer}</td>
                      <td>
                        <div style={{ fontSize: 11 }}>
                          {r.requiresCore ? <span style={{ color: '#d84343', fontWeight: 'bold' }}>{r.coreType || 'Core'}</span> : <span style={{ color: '#aaa' }}>No Core</span>}<br />
                          {r.requiresHT ? <span style={{ color: '#f57c00', fontWeight: 'bold' }}>{r.htType || 'HT'}</span> : <span style={{ color: '#aaa' }}>No HT</span>}
                        </div>
                      </td>
                      <td>{r.cycleTime}</td>
                      <td>{r.productionOutputPerMachine}</td>
                      <td style={{ fontWeight: 'bold', color: '#0277bd' }}>{dailyTarget}</td>
                      <td style={{ fontWeight: 'bold', color: '#1565c0' }}>{shiftQty}</td>
                      <td style={{ background: '#f8fbff' }}>
                        {monthlyUpdateMode ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 10, color: '#888' }}>Rev 00</div>
                            <input type="number" min="0" value={getMonthlyVal(r, 'dispatchTarget') as number}
                              onChange={e => updateMonthlyEdit(r.partId, 'dispatchTarget', parseFloat(e.target.value) || 0)}
                              style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: '1px solid #1565c0', fontWeight: 'bold' }} />
                            <div style={{ fontSize: 10, color: '#888' }}>Rev 01</div>
                            <input type="number" min="0" placeholder="Optional"
                              value={(getMonthlyVal(r, 'targetRev01') as number | undefined) ?? ''}
                              onChange={e => updateMonthlyEdit(r.partId, 'targetRev01', e.target.value ? parseFloat(e.target.value) : undefined)}
                              style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: '1px solid #64b5f6' }} />
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {r.targetRev01 ? (<>
                              <span style={{ fontWeight: 'bold' }}>{r.targetRev01}</span>
                              <span style={{ fontSize: 10, textDecoration: 'line-through', color: '#999' }}>Rev00: {r.dispatchTarget}</span>
                            </>) : <span style={{ fontWeight: 'bold' }}>{r.dispatchTarget}</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ background: '#f8fbff' }}>
                        {monthlyUpdateMode ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min="0" step="0.1" value={curBuffer}
                              onChange={e => updateMonthlyEdit(r.partId, 'rejectionBufferPercentage', parseFloat(e.target.value) || 0)}
                              style={{ width: 60, padding: '3px 6px', borderRadius: 4, border: '1px solid #1565c0' }} />
                            <span style={{ fontSize: 12 }}>%</span>
                          </div>
                        ) : (
                          isAuto
                            ? <span style={{ color: '#0277bd', fontWeight: 'bold' }}>{effectiveBuffer}% <span style={{ fontSize: 9, fontWeight: 'normal' }}>(Auto)</span></span>
                            : <span>{effectiveBuffer}%</span>
                        )}
                      </td>
                      <td style={{ background: '#f1f8e9', fontWeight: 'bold', color: '#2e7d32', fontSize: '15px' }}>{prodTarget}</td>
                      <td style={{ background: '#faf5fb', fontWeight: 'bold', color: '#6a1b9a', textAlign: 'center' }}>{coreQty}</td>
                      <td style={{ background: '#fff8e1', fontWeight: 'bold', color: '#f57c00' }}>{rawMaterial.toFixed(1)}</td>
                      <td style={{ background: '#fff8e1', color: '#e65100' }}>{r.material || 'N/A'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-nav" style={{ padding: '4px 8px', marginRight: 4 }} onClick={() => startEdit(r)}><Edit2 size={14} /></button>
                        <button className="btn-delete-x" onClick={() => setConfirmDelete({ id: r.partId, partNo: r.partNo })}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr><td colSpan={14} style={{ textAlign: 'center', padding: '40px', color: '#bbb' }}>
                    {search ? `No parts match "${search}"` : 'No parts found in Master Database. Import an Excel file or add parts manually.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > itemsPerPage && (
            <Pagination currentPage={currentPage} totalPages={Math.ceil(filtered.length / itemsPerPage)}
              onPageChange={setCurrentPage} totalItems={filtered.length} itemsPerPage={itemsPerPage} />
          )}
        </>
      )}

      {/* Upload Progress Modal */}
      {uploadStatus && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-box" style={{ maxWidth: '560px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h3 className="portal-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {uploadStatus.isUploading ? '⏳ Importing Excel...' : '✅ Import Complete'}
              </h3>
              {!uploadStatus.isUploading && <button className="btn-delete-x" onClick={() => setUploadStatus(null)}><X size={20} /></button>}
            </div>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <div style={{ width: '100%', backgroundColor: '#eee', borderRadius: '6px', overflow: 'hidden', height: '10px', marginBottom: '12px' }}>
                <div style={{ height: '100%', backgroundColor: uploadStatus.isUploading ? '#1976d2' : '#2e7d32', width: `${uploadStatus.total ? (uploadStatus.current / uploadStatus.total) * 100 : 100}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Total Rows', value: uploadStatus.total, color: '#555', bg: '#f5f5f5' },
                  { label: 'Saved', value: uploadStatus.success, color: '#2e7d32', bg: '#e8f5e9' },
                  { label: 'Failed', value: uploadStatus.fail, color: uploadStatus.fail > 0 ? '#d32f2f' : '#aaa', bg: uploadStatus.fail > 0 ? '#ffebee' : '#f5f5f5' },
                  { label: 'Skipped Dups', value: uploadStatus.skipped, color: uploadStatus.skipped > 0 ? '#f57f17' : '#aaa', bg: uploadStatus.skipped > 0 ? '#fff8e1' : '#f5f5f5' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 6, padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 'bold', color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#666' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {uploadStatus.errors.length > 0 && (
                <div>
                  <h4 style={{ color: '#d32f2f', marginBottom: 8, fontSize: 13, borderBottom: '1px solid #ffcdd2', paddingBottom: 5 }}>Error Details</h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {uploadStatus.errors.map((err, idx) => (
                      <li key={idx} style={{ padding: '8px 10px', borderBottom: '1px solid #eee', fontSize: 12 }}>
                        <strong style={{ color: '#d32f2f' }}>{err.partNo}</strong>
                        <div style={{ color: '#555', marginTop: 2 }}>{err.reason}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 15 }}>
              <button className="btn btn-primary" onClick={() => setUploadStatus(null)} disabled={uploadStatus.isUploading} style={{ opacity: uploadStatus.isUploading ? 0.5 : 1 }}>
                {uploadStatus.isUploading ? 'Please wait...' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-box" style={{ maxWidth: '400px' }}>
            <div style={{ marginBottom: 15 }}>
              <h3 className="portal-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#d32f2f' }}><AlertTriangle size={20} /> Confirm Delete</h3>
            </div>
            <div>
              <p>Are you sure you want to delete <strong>"{confirmDelete.partNo}"</strong>?</p>
              <p style={{ color: '#d32f2f', fontSize: 13 }}>⚠️ This will permanently delete the part and ALL its historical dispatch plans.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn" style={{ background: '#d32f2f', color: '#fff' }} onClick={handleDelete}>Delete Permanently</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Database Modal */}
      {showResetPrompt && (
        <div className="portal-modal-overlay">
          <div className="portal-modal-box" style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h3 className="portal-modal-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#d32f2f' }}><AlertTriangle size={20} /> Reset Master Database</h3>
              <button className="btn-delete-x" onClick={() => { setShowResetPrompt(false); setResetPassword(''); }}><X size={20} /></button>
            </div>
            <div>
              <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 6, padding: 12, marginBottom: 16 }}>
                <strong style={{ color: '#d32f2f' }}>⚠️ IRREVERSIBLE ACTION</strong>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#555' }}>This will permanently delete ALL master parts, monthly dispatch plans, and production plans. This cannot be undone.</p>
              </div>
              <div className="form-group">
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 'bold' }}>Admin Password to Confirm:</label>
                <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                  placeholder="Enter admin password" onKeyDown={e => e.key === 'Enter' && handleResetDatabase()}
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #ffcdd2', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button className="btn btn-outline" onClick={() => { setShowResetPrompt(false); setResetPassword(''); }}>Cancel</button>
              <button className="btn" style={{ background: '#d32f2f', color: '#fff' }} onClick={handleResetDatabase} disabled={isResetting}>
                {isResetting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
