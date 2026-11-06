import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Save, X, Check, ArrowLeft } from 'lucide-react';
import { useModal } from '../context/ModalContext';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../context/AuthContext';
import DCFHODReportsView from './DCFHODReportsView';
import QualityHODReportsView from './QualityHODReportsView';

interface DownstreamProcessEntry {
  id: number;
  departmentName: string;
  traceabilityBatchId: string;
  partId?: number;
  partNo: string;
  partName: string;
  date: string;
  shift: string;
  supervisor: string;
  operatorPunchNo: string;
  operatorName: string;
  plannedQty: number;
  actualQty: number;
  gap: number;
  gapReason: string;
  gapReasonMachine: boolean;
  gapReasonManpower: boolean;
  gapReasonProductionOutput: boolean;
  inputQty: number;
  processedQty: number;
  rejectionQty: number;
  reasonForRejection: string;
  remark: string;
  status: string;
  returnReason: string;
  part?: {
    id: number;
    partNo: string;
    partName: string;
  };
}

interface Operator {
  id?: number;
  punchNo: string;
  name: string;
  department?: string;
  status?: string;
}

interface Supervisor {
  id: number;
  name: string;
  status?: string;
  department?: string;
}

interface MasterPart {
  partId?: number;
  id?: number;
  partNo: string;
  partName: string;
  productionOutputPerMachine?: number;
  shiftTarget?: number;
  dailyTarget?: number;
  dispatchTarget?: number;
}

export default function DownstreamEntryScreen({ departmentName }: { departmentName?: string }) {
  const { role } = useAuth();
  const { showAlert } = useModal();
  const [entries, setEntries] = useState<DownstreamProcessEntry[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [masterParts, setMasterParts] = useState<MasterPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<Partial<DownstreamProcessEntry>>({});
  const [machiningTab, setMachiningTab] = useState<'Outward' | 'Inward'>('Outward');
  const [dcfTab, setDcfTab] = useState<'Decoring' | 'Cutting' | 'Fettling' | 'Filing' | 'Sand Blasting'>('Decoring');

  // Quality Section: Main Units U5 and U4B, and sub-sections
  const isQuality = departmentName === 'Quality';
  const [qualityUnit, setQualityUnit] = useState<'U5' | 'U4B'>('U5');
  const [u5Tab, setU5Tab] = useState<'Process Rejection' | 'UT' | 'Before HT' | 'boroscope (Sand) Inspection' | 'Final Inspection'>('Process Rejection');
  const [u4bTab, setU4bTab] = useState<'DPT' | 'boroscope (Sand) Inspection' | 'Before Shot Blasting Prosity Check' | 'Final Inspection'>('DPT');
  const [allQualityEntries, setAllQualityEntries] = useState<DownstreamProcessEntry[]>([]);
  const [qualityReportUnit, setQualityReportUnit] = useState<'All' | 'U5' | 'U4B'>('All');
  const [qualityReportStage, setQualityReportStage] = useState<string>('All Stages');

  // HOD reports are supported in DCF and Quality
  const isDcf = departmentName === 'DCF';
  const hasHodReport = isDcf || isQuality;
  const [viewMode, setViewMode] = useState<'entry' | 'reports'>('entry');
  const [allDcfEntries, setAllDcfEntries] = useState<DownstreamProcessEntry[]>([]);
  const [reportSection, setReportSection] = useState<string>('All Sections');
  const [rejectionReasons, setRejectionReasons] = useState<{ id: number; reasonName: string; category: string }[]>([]);

  const effectiveDepartment = departmentName === 'Third-Party Machining'
    ? (machiningTab === 'Outward' ? 'Third-Party Machining' : 'Material Return')
    : isDcf
      ? dcfTab
      : isQuality
        ? (qualityUnit === 'U5' ? `U5 - ${u5Tab}` : `U4B - ${u4bTab}`)
        : departmentName;

  useEffect(() => {
    fetchData();
  }, [effectiveDepartment, departmentName]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthYear = new Date().toISOString().substring(0, 7);
      const [entryRes, opRes, supRes, partsRes, rejRes] = await Promise.all([
        apiFetch(`http://${window.location.hostname}:4900/api/downstream?department=${encodeURIComponent(effectiveDepartment || '')}`),
        apiFetch(`http://${window.location.hostname}:4900/api/operators`),
        apiFetch(`http://${window.location.hostname}:4900/api/supervisors`),
        apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase?monthYear=${monthYear}`),
        apiFetch(`http://${window.location.hostname}:4900/api/rejectionreasons?department=${encodeURIComponent(effectiveDepartment || departmentName || 'All')}`)
      ]);
      if (entryRes.ok) setEntries(await entryRes.json());
      if (opRes.ok) setOperators(await opRes.json());
      if (supRes.ok) setSupervisors(await supRes.json());
      if (rejRes.ok) {
        const rejData = await rejRes.json();
        if (Array.isArray(rejData) && rejData.length > 0) {
          setRejectionReasons(rejData);
        } else {
          const allRej = await apiFetch(`http://${window.location.hostname}:4900/api/rejectionreasons`);
          if (allRej.ok) setRejectionReasons(await allRej.json());
        }
      }
      if (partsRes.ok) {
        const partsData = await partsRes.json();
        if (Array.isArray(partsData) && partsData.length > 0) {
          setMasterParts(partsData);
        } else {
          const fallbackRes = await apiFetch(`http://${window.location.hostname}:4900/api/masterparts`);
          if (fallbackRes.ok) setMasterParts(await fallbackRes.json());
        }
      }
      // Fetch umbrella DCF entries if on DCF screen
      if (isDcf) {
        const allRes = await apiFetch(`http://${window.location.hostname}:4900/api/downstream?department=DCF`);
        if (allRes.ok) setAllDcfEntries(await allRes.json());
      }
      // Fetch umbrella Quality entries if on Quality screen
      if (isQuality) {
        const allQualityRes = await apiFetch(`http://${window.location.hostname}:4900/api/downstream?department=Quality`);
        if (allQualityRes.ok) setAllQualityEntries(await allQualityRes.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDcfData = async () => {
    if (!isDcf) return;
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/downstream?department=DCF`);
      if (res.ok) setAllDcfEntries(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllQualityData = async () => {
    if (!isQuality) return;
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/downstream?department=Quality`);
      if (res.ok) setAllQualityEntries(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  // Filter operators: for DCF, prioritize DCF/sub-section and exclude Production casting operators
  const filteredOperators = operators.filter(o => {
    if (o.status && o.status.toLowerCase() === 'inactive') return false;
    if (isDcf) {
      const dept = (o.department || '').toLowerCase();
      const eff = (effectiveDepartment || '').toLowerCase();
      if (dept === eff || dept === 'dcf') return true;
      if (dept === 'production') return false;
      return true;
    }
    return true;
  });

  const handlePartSelect = (selectedPartNo: string) => {
    const part = masterParts.find(p => p.partNo === selectedPartNo);
    const partName = part ? part.partName : '';

    let planned = currentEntry.plannedQty || 0;
    if (part && !planned) {
      if (part.shiftTarget && part.shiftTarget > 0) {
        planned = part.shiftTarget;
      } else if (part.productionOutputPerMachine && part.productionOutputPerMachine > 0) {
        planned = Math.ceil(part.productionOutputPerMachine / 2);
      }
    }

    const actual = currentEntry.actualQty || 0;
    const gap = Math.max(0, planned - actual);

    setCurrentEntry(prev => ({
      ...prev,
      partNo: selectedPartNo,
      partName: partName,
      partId: part ? (part.partId || part.id) : prev.partId,
      plannedQty: planned,
      actualQty: actual,
      gap: gap,
      inputQty: planned,
      processedQty: actual
    }));
  };

  const handleQtyChange = (field: 'plannedQty' | 'actualQty' | 'rejectionQty', value: number) => {
    setCurrentEntry(prev => {
      const updated = { ...prev, [field]: value };
      const planned = field === 'plannedQty' ? value : (updated.plannedQty || 0);
      const actual = field === 'actualQty' ? value : (updated.actualQty || 0);
      const gap = Math.max(0, planned - actual);
      return {
        ...updated,
        gap: gap,
        inputQty: planned,
        processedQty: actual
      };
    });
  };

  const toggleGapReason = (reason: 'Machine' | 'Manpower' | 'Production Output') => {
    setCurrentEntry(prev => {
      const isMachine = reason === 'Machine' ? !prev.gapReasonMachine : (prev.gapReasonMachine || false);
      const isManpower = reason === 'Manpower' ? !prev.gapReasonManpower : (prev.gapReasonManpower || false);
      const isOutput = reason === 'Production Output' ? !prev.gapReasonProductionOutput : (prev.gapReasonProductionOutput || false);

      const reasons: string[] = [];
      if (isMachine) reasons.push('Machine');
      if (isManpower) reasons.push('Manpower');
      if (isOutput) reasons.push('Production Output');

      return {
        ...prev,
        gapReasonMachine: isMachine,
        gapReasonManpower: isManpower,
        gapReasonProductionOutput: isOutput,
        gapReason: reasons.join(', ')
      };
    });
  };

  const handleNewEntry = () => {
    if (isDcf || isQuality) {
      setCurrentEntry({
        date: new Date().toISOString().split('T')[0],
        shift: 'Shift A',
        supervisor: supervisors.length > 0 ? supervisors[0].name : '',
        operatorPunchNo: '',
        operatorName: '',
        partNo: '',
        partName: '',
        plannedQty: 0,
        actualQty: 0,
        gap: 0,
        gapReason: '',
        gapReasonMachine: false,
        gapReasonManpower: false,
        gapReasonProductionOutput: false,
        inputQty: 0,
        processedQty: 0,
        rejectionQty: 0,
        reasonForRejection: '',
        remark: '',
        status: 'Draft'
      });
    } else {
      // Standard entry for HT & Finishing, Machining, Storage & Dispatch
      setCurrentEntry({
        date: new Date().toISOString().split('T')[0],
        shift: 'Shift A',
        traceabilityBatchId: '',
        operatorPunchNo: '',
        inputQty: 0,
        processedQty: 0,
        rejectionQty: 0,
        reasonForRejection: '',
        status: 'Draft'
      });
    }
    setIsEditing(true);
  };

  const handleEdit = (entry: DownstreamProcessEntry) => {
    const rawGapReason = entry.gapReason || '';
    setCurrentEntry({
      ...entry,
      date: entry.date ? entry.date.split('T')[0] : '',
      plannedQty: entry.plannedQty || entry.inputQty || 0,
      actualQty: entry.actualQty || entry.processedQty || 0,
      gap: entry.gap !== undefined ? entry.gap : Math.max(0, (entry.plannedQty || entry.inputQty || 0) - (entry.actualQty || entry.processedQty || 0)),
      gapReasonMachine: entry.gapReasonMachine || rawGapReason.includes('Machine'),
      gapReasonManpower: entry.gapReasonManpower || rawGapReason.includes('Manpower'),
      gapReasonProductionOutput: entry.gapReasonProductionOutput || rawGapReason.includes('Output')
    });
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent, targetStatus: string) => {
    e.preventDefault();

    if (isDcf || isQuality) {
      if (!currentEntry.date) {
        showAlert('Validation Error', 'Date is required.');
        return;
      }
      if (!currentEntry.shift) {
        showAlert('Validation Error', 'Shift is required.');
        return;
      }
      if (!currentEntry.partNo) {
        showAlert('Validation Error', 'Part Number is required.');
        return;
      }
      if (currentEntry.actualQty === undefined || currentEntry.actualQty === null || isNaN(currentEntry.actualQty)) {
        showAlert('Validation Error', 'Actual Qty is required.');
        return;
      }

      const planned = currentEntry.plannedQty || 0;
      const actual = currentEntry.actualQty || 0;
      const rej = currentEntry.rejectionQty || 0;
      const gap = Math.max(0, planned - actual);

      const reasons: string[] = [];
      if (currentEntry.gapReasonMachine) reasons.push('Machine');
      if (currentEntry.gapReasonManpower) reasons.push('Manpower');
      if (currentEntry.gapReasonProductionOutput) reasons.push('Production Output');
      const gapReasonStr = reasons.length > 0 ? reasons.join(', ') : (currentEntry.gapReason || '');

      const finalEntry = {
        ...currentEntry,
        departmentName: effectiveDepartment,
        status: targetStatus,
        plannedQty: planned,
        actualQty: actual,
        gap: gap,
        gapReason: gapReasonStr,
        inputQty: planned,
        processedQty: actual,
        rejectionQty: rej,
        traceabilityBatchId: currentEntry.traceabilityBatchId || `${currentEntry.partNo || effectiveDepartment}-${(currentEntry.date || '').replace(/-/g, '')}-${(currentEntry.shift || 'A').replace(/\s+/g, '')}`
      };

      try {
        const isNew = !finalEntry.id;
        const url = isNew
          ? `http://${window.location.hostname}:4900/api/downstream`
          : `http://${window.location.hostname}:4900/api/downstream/${finalEntry.id}`;

        const res = await apiFetch(url, {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalEntry)
        });

        if (res.ok) {
          setIsEditing(false);
          setSuccessMsg(`Successfully saved ${effectiveDepartment} record (${targetStatus})!`);
          setTimeout(() => setSuccessMsg(''), 3000);
          fetchData();
        } else {
          showAlert('Alert', `Failed to save ${effectiveDepartment} Entry.`);
        }
      } catch (err) {
        console.error(err);
        showAlert('Error', 'Network error while saving.');
      }
    } else {
      // Standard non-DCF validation and saving
      const input = currentEntry.inputQty || 0;
      const rej = currentEntry.rejectionQty || 0;

      if (rej > input) {
        showAlert('Alert', "Validation Error: Rejection Quantity cannot be greater than Input Quantity.");
        return;
      }

      const processed = input - rej;

      try {
        const finalEntry = { ...currentEntry, departmentName: effectiveDepartment, status: targetStatus, processedQty: processed };
        const isNew = !finalEntry.id;
        const url = isNew ? `http://${window.location.hostname}:4900/api/downstream` : `http://${window.location.hostname}:4900/api/downstream/${finalEntry.id}`;

        const res = await apiFetch(url, {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalEntry)
        });

        if (res.ok) {
          setIsEditing(false);
          setSuccessMsg(`Successfully saved ${effectiveDepartment} record (${targetStatus})!`);
          setTimeout(() => setSuccessMsg(''), 3000);
          fetchData();
        } else {
          showAlert('Alert', `Failed to save ${effectiveDepartment} Entry.`);
        }
      } catch (err) {
        console.error(err);
        showAlert('Error', 'Network error while saving.');
      }
    }
  };

  const handleAction = async (entry: DownstreamProcessEntry, action: 'Approve' | 'Return') => {
    if (action === 'Return') {
      const reason = prompt("Please enter the reason for returning this entry:");
      if (!reason) return;
      entry.returnReason = reason;
      entry.status = 'Returned';
    } else {
      entry.status = 'Approved';
      entry.returnReason = '';
    }

    await apiFetch(`http://${window.location.hostname}:4900/api/downstream/${entry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    fetchData();
  };

  return (
    <div style={{ padding: 20 }}>

      {/* ── HEADER ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center', flexWrap: 'wrap', gap: 15 }}>
        <div>
          <h2 style={{ margin: 0, color: '#0b462c', fontSize: '1.4rem' }}>
            {isDcf && viewMode === 'reports'
              ? 'DCF Operations — HOD Reports'
              : isQuality && viewMode === 'reports'
                ? 'Quality Control — HOD Executive Inspection Dashboard'
                : isDcf
                  ? `DCF Operations — ${dcfTab} Dashboard`
                  : isQuality
                    ? (qualityUnit === 'U5' ? `Quality U5 — ${u5Tab} Dashboard` : `Quality U4B — ${u4bTab} Dashboard`)
                    : `${effectiveDepartment} Dashboard`}
          </h2>
          <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
            {isDcf && viewMode === 'reports'
              ? 'Finishing Department Performance & Quality Metrics'
              : isQuality && viewMode === 'reports'
                ? 'Executive Quality Assurance, Defect Pareto, Rejection Trajectories across Unit U5 & Unit U4B'
                : isQuality
                  ? `Quality inspection & process logging for ${qualityUnit === 'U5' ? `Unit U5 > ${u5Tab}` : `Unit U4B > ${u4bTab}`}`
                  : `Operations management & production logging for ${effectiveDepartment}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* VIEW SWITCHER: VISIBLE IN DCF AND QUALITY */}
          {hasHodReport && (
            <div style={{ display: 'inline-flex', background: '#e8f3ed', padding: 4, borderRadius: 8, border: '1px solid #c8dfd0' }}>
              <button
                type="button"
                className={`btn ${viewMode === 'entry' ? 'btn-nav' : ''}`}
                style={{
                  background: viewMode === 'entry' ? '#0b462c' : 'transparent',
                  color: viewMode === 'entry' ? '#fff' : '#0b462c',
                  border: 'none',
                  boxShadow: viewMode === 'entry' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  padding: '7px 15px',
                  fontSize: 13,
                  fontWeight: 'bold',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onClick={() => setViewMode('entry')}
              >
                📝 Data Entry
              </button>
              <button
                type="button"
                className={`btn ${viewMode === 'reports' ? 'btn-nav' : ''}`}
                style={{
                  background: viewMode === 'reports' ? '#0b462c' : 'transparent',
                  color: viewMode === 'reports' ? '#fff' : '#0b462c',
                  border: 'none',
                  boxShadow: viewMode === 'reports' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                  padding: '7px 15px',
                  fontSize: 13,
                  fontWeight: 'bold',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
                onClick={() => {
                  setViewMode('reports');
                  if (isDcf) fetchAllDcfData();
                  if (isQuality) fetchAllQualityData();
                }}
              >
                📊 HOD Reports
              </button>
            </div>
          )}

          {/* New Entry Button */}
          {(!hasHodReport || viewMode === 'entry') && (
            <button className="btn" onClick={handleNewEntry}>
              <Plus size={16} /> New Entry
            </button>
          )}
        </div>
      </div>

      {/* ── HOD REPORTS VIEW (DCF OR QUALITY) ────────────────── */}
      {isDcf && viewMode === 'reports' ? (
        <DCFHODReportsView
          entries={allDcfEntries.length > 0 ? allDcfEntries : entries}
          operators={operators}
          supervisors={supervisors}
          masterParts={masterParts}
          selectedSection={reportSection}
          onSelectSection={(sec) => {
            setReportSection(sec);
            if (sec !== 'All Sections') {
              setDcfTab(sec as any);
            }
          }}
        />
      ) : isQuality && viewMode === 'reports' ? (
        <QualityHODReportsView
          entries={allQualityEntries.length > 0 ? allQualityEntries : entries}
          operators={operators}
          supervisors={supervisors}
          masterParts={masterParts}
          selectedUnit={qualityReportUnit}
          onSelectUnit={(unit) => setQualityReportUnit(unit)}
          selectedStage={qualityReportStage}
          onSelectStage={(stage) => setQualityReportStage(stage)}
        />
      ) : (
        <>
          {/* Sub-tabs for Third-Party Machining */}
          {departmentName === 'Third-Party Machining' && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                className={`btn ${machiningTab === 'Outward' ? 'btn-nav' : ''}`}
                style={{ background: machiningTab === 'Outward' ? '#0b462c' : 'white', color: machiningTab === 'Outward' ? 'white' : '#333', border: '1px solid #0b462c' }}
                onClick={() => { setMachiningTab('Outward'); setIsEditing(false); }}
              >
                Outward (Send to Vendor)
              </button>
              <button
                className={`btn ${machiningTab === 'Inward' ? 'btn-nav' : ''}`}
                style={{ background: machiningTab === 'Inward' ? '#0b462c' : 'white', color: machiningTab === 'Inward' ? 'white' : '#333', border: '1px solid #0b462c' }}
                onClick={() => { setMachiningTab('Inward'); setIsEditing(false); }}
              >
                Inward (Receive / Material Return)
              </button>
            </div>
          )}

          {/* 5 Operation Section Pills for DCF */}
          {isDcf && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              {(['Decoring', 'Cutting', 'Fettling', 'Filing', 'Sand Blasting'] as const).map(tab => (
                <button
                  key={tab}
                  className={`btn ${dcfTab === tab ? 'btn-nav' : ''}`}
                  style={{
                    background: dcfTab === tab ? '#0b462c' : 'white',
                    color: dcfTab === tab ? 'white' : '#333',
                    border: '1px solid #0b462c',
                    fontWeight: dcfTab === tab ? 'bold' : 'normal'
                  }}
                  onClick={() => { setDcfTab(tab); setIsEditing(false); }}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          {/* Quality Main Sections: U5 and U4B */}
          {isQuality && (
            <div style={{ marginBottom: 20 }}>
              {/* Unit Selector Toggle */}
              <div style={{ display: 'inline-flex', background: '#e8f3ed', padding: 4, borderRadius: 8, border: '1px solid #c8dfd0', gap: 4, marginBottom: 14 }}>
                <button
                  type="button"
                  style={{
                    background: qualityUnit === 'U5' ? '#0b462c' : 'transparent',
                    color: qualityUnit === 'U5' ? '#fff' : '#0b462c',
                    border: 'none',
                    boxShadow: qualityUnit === 'U5' ? '0 2px 4px rgba(0,0,0,0.12)' : 'none',
                    padding: '8px 24px',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => { setQualityUnit('U5'); setIsEditing(false); }}
                >
                  🏢 Unit U5
                </button>
                <button
                  type="button"
                  style={{
                    background: qualityUnit === 'U4B' ? '#0b462c' : 'transparent',
                    color: qualityUnit === 'U4B' ? '#fff' : '#0b462c',
                    border: 'none',
                    boxShadow: qualityUnit === 'U4B' ? '0 2px 4px rgba(0,0,0,0.12)' : 'none',
                    padding: '8px 24px',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => { setQualityUnit('U4B'); setIsEditing(false); }}
                >
                  🏢 Unit U4B
                </button>
              </div>

              {/* U5 Sub-sections: Process Rejection, UT, Before HT, boroscope (Sand) Inspection, Final Inspection */}
              {qualityUnit === 'U5' && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['Process Rejection', 'UT', 'Before HT', 'boroscope (Sand) Inspection', 'Final Inspection'] as const).map(tab => (
                    <button
                      key={tab}
                      className={`btn ${u5Tab === tab ? 'btn-nav' : ''}`}
                      style={{
                        background: u5Tab === tab ? '#0b462c' : '#ffffff',
                        color: u5Tab === tab ? '#ffffff' : '#333333',
                        border: '1px solid #0b462c',
                        fontWeight: u5Tab === tab ? 'bold' : 'normal',
                        padding: '8px 16px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={() => { setU5Tab(tab); setIsEditing(false); }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}

              {/* U4B Sub-sections: DPT, boroscope (Sand) Inspection, Before Shot Blasting Prosity Check, Final Inspection */}
              {qualityUnit === 'U4B' && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(['DPT', 'boroscope (Sand) Inspection', 'Before Shot Blasting Prosity Check', 'Final Inspection'] as const).map(tab => (
                    <button
                      key={tab}
                      className={`btn ${u4bTab === tab ? 'btn-nav' : ''}`}
                      style={{
                        background: u4bTab === tab ? '#0b462c' : '#ffffff',
                        color: u4bTab === tab ? '#ffffff' : '#333333',
                        border: '1px solid #0b462c',
                        fontWeight: u4bTab === tab ? 'bold' : 'normal',
                        padding: '8px 16px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={() => { setU4bTab(tab); setIsEditing(false); }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div style={{ background: '#e8f3ed', color: '#0b462c', padding: '15px 20px', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 'bold' }}>
              <Check size={20} /> {successMsg}
            </div>
          )}

          {/* ── EDIT / NEW ENTRY FORM ────────────────────────── */}
          {isEditing && (
            <div className="input-form" style={{ marginBottom: 20, border: '1px solid #c8dfd0', borderRadius: 8, padding: 20, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 15 }}>
                <h3 style={{ margin: 0, color: '#0b462c' }}>
                  {currentEntry.id ? `Edit ${effectiveDepartment} Entry` : `New ${effectiveDepartment} Entry`}
                </h3>
                <button className="btn-delete-x" onClick={() => setIsEditing(false)}><X size={20} /></button>
              </div>

              {currentEntry.status === 'Returned' && (
                <div style={{ padding: 10, backgroundColor: '#ffebee', color: '#b71c1c', marginBottom: 15, borderRadius: 4 }}>
                  <strong>Returned by QA:</strong> {currentEntry.returnReason}
                </div>
              )}

              {/* QUALITY INSPECTION ENTRY FORM (U5 & U4B) */}
              {isQuality ? (
                <form onSubmit={e => handleSave(e, currentEntry.status === 'Submitted' ? 'Submitted' : 'Draft')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>

                  {/* 1. Date */}
                  <div>
                    <label>1. Date *</label>
                    <input
                      required
                      type="date"
                      value={currentEntry.date || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, date: e.target.value })}
                    />
                  </div>

                  {/* 2. Shift */}
                  <div>
                    <label>2. Shift *</label>
                    <select
                      required
                      value={currentEntry.shift || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, shift: e.target.value })}
                    >
                      <option value="Shift A">Shift A</option>
                      <option value="Shift B">Shift B</option>
                    </select>
                  </div>

                  {/* 3. Supervisor Name */}
                  <div>
                    <label>3. Supervisor Name</label>
                    <select
                      value={currentEntry.supervisor || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, supervisor: e.target.value })}
                    >
                      <option value="">Select Supervisor...</option>
                      {supervisors.map(s => (
                        <option key={s.id} value={s.name}>
                          {s.name} {s.department ? `(${s.department})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Operator Name */}
                  <div>
                    <label>4. Operator Name *</label>
                    <select
                      required
                      value={currentEntry.operatorName || ''}
                      onChange={e => {
                        const selName = e.target.value;
                        const op = operators.find(o => o.name === selName);
                        setCurrentEntry({
                          ...currentEntry,
                          operatorName: selName,
                          operatorPunchNo: op ? op.punchNo : (currentEntry.operatorPunchNo || '')
                        });
                      }}
                    >
                      <option value="" disabled>Select Operator...</option>
                      {operators.map(o => (
                        <option key={o.punchNo + o.name} value={o.name}>
                          {o.name} {o.punchNo ? `(${o.punchNo})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 5. Part No */}
                  <div>
                    <label>5. Part Number *</label>
                    <select
                      required
                      value={currentEntry.partNo || ''}
                      onChange={e => handlePartSelect(e.target.value)}
                    >
                      <option value="" disabled>Select Part Number...</option>
                      {masterParts.map(p => (
                        <option key={p.partNo} value={p.partNo}>
                          {p.partNo} - {p.partName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 6. Part Name (Auto-fetched) */}
                  <div>
                    <label>6. Part Name (Auto-fetched)</label>
                    <input
                      readOnly
                      placeholder="Auto-fetched from Part Number"
                      value={currentEntry.partName || ''}
                      style={{ backgroundColor: '#f0fdf4', color: '#0b462c', fontWeight: 'bold' }}
                    />
                  </div>

                  {/* 7. Inspection Target Qty */}
                  <div>
                    <label>7. Inspection Target Qty</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Inspection target quantity"
                      value={currentEntry.plannedQty !== undefined && currentEntry.plannedQty !== null ? currentEntry.plannedQty : ''}
                      onChange={e => handleQtyChange('plannedQty', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* 8. Actual Qty */}
                  <div>
                    <label>8. Actual Qty *</label>
                    <input
                      required
                      type="number"
                      min="0"
                      placeholder="Actual inspected quantity"
                      value={currentEntry.actualQty !== undefined && currentEntry.actualQty !== null ? currentEntry.actualQty : ''}
                      onChange={e => handleQtyChange('actualQty', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* 9. Rejection Qty */}
                  <div>
                    <label>9. Rejection Qty</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={currentEntry.rejectionQty !== undefined && currentEntry.rejectionQty !== null ? currentEntry.rejectionQty : ''}
                      onChange={e => handleQtyChange('rejectionQty', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* 10. Punch Number */}
                  <div>
                    <label>10. Punch Number</label>
                    <input
                      placeholder="Operator Punch Number"
                      value={currentEntry.operatorPunchNo || ''}
                      onChange={e => {
                        const punch = e.target.value;
                        const op = operators.find(o => o.punchNo === punch);
                        setCurrentEntry({
                          ...currentEntry,
                          operatorPunchNo: punch,
                          operatorName: op ? op.name : (currentEntry.operatorName || '')
                        });
                      }}
                    />
                  </div>

                  {/* Reason For Rejection */}
                  {(currentEntry.rejectionQty || 0) > 0 && (
                    <div>
                      <label>Reason For Rejection</label>
                      <input
                        placeholder="Specify reason for rejection"
                        value={currentEntry.reasonForRejection || ''}
                        onChange={e => setCurrentEntry({ ...currentEntry, reasonForRejection: e.target.value })}
                        list="downstream-rejection-reasons"
                      />
                    </div>
                  )}

                  {/* Remark */}
                  <div>
                    <label>Remark</label>
                    <input
                      placeholder="Additional remarks or notes"
                      value={currentEntry.remark || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, remark: e.target.value })}
                    />
                  </div>

                  {/* Form Actions */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid #eee', paddingTop: 15 }}>
                    <button type="button" className="btn btn-nav" onClick={e => handleSave(e, 'Draft')}><Save size={16} /> Save as Draft</button>
                    <button type="button" className="btn btn-highlight" onClick={e => handleSave(e, 'Submitted')}><Check size={16} /> Submit for Approval</button>
                  </div>
                </form>
              ) : isDcf ? (
                /* DCF 13-FIELD ORDERED ENTRY FORM */
                <form onSubmit={e => handleSave(e, currentEntry.status === 'Submitted' ? 'Submitted' : 'Draft')} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15 }}>

                  {/* 1. Date */}
                  <div>
                    <label>1. Date *</label>
                    <input
                      required
                      type="date"
                      value={currentEntry.date || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, date: e.target.value })}
                    />
                  </div>

                  {/* 2. Shift */}
                  <div>
                    <label>2. Shift *</label>
                    <select
                      required
                      value={currentEntry.shift || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, shift: e.target.value })}
                    >
                      <option value="Shift A">Shift A</option>
                      <option value="Shift B">Shift B</option>
                    </select>
                  </div>

                  {/* 3. Supervisor */}
                  <div>
                    <label>3. Supervisor</label>
                    <select
                      value={currentEntry.supervisor || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, supervisor: e.target.value })}
                    >
                      <option value="">Select Supervisor...</option>
                      {supervisors.map(s => (
                        <option key={s.id} value={s.name}>
                          {s.name} {s.department ? `(${s.department})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Operator Name */}
                  <div>
                    <label>4. Operator Name *</label>
                    <select
                      required
                      value={currentEntry.operatorPunchNo || ''}
                      onChange={e => {
                        const op = operators.find(o => o.punchNo === e.target.value);
                        setCurrentEntry({
                          ...currentEntry,
                          operatorPunchNo: e.target.value,
                          operatorName: op ? op.name : (currentEntry.operatorName || e.target.value)
                        });
                      }}
                    >
                      <option value="" disabled>Select Operator...</option>
                      {filteredOperators.length > 0 ? (
                        filteredOperators.map(o => (
                          <option key={o.punchNo} value={o.punchNo}>
                            {o.name} ({o.punchNo}) {o.department ? `[${o.department}]` : ''}
                          </option>
                        ))
                      ) : (
                        operators.map(o => (
                          <option key={o.punchNo} value={o.punchNo}>
                            {o.name} ({o.punchNo}) {o.department ? `[${o.department}]` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* 5. Part Number */}
                  <div>
                    <label>5. Part Number *</label>
                    <select
                      required
                      value={currentEntry.partNo || ''}
                      onChange={e => handlePartSelect(e.target.value)}
                    >
                      <option value="" disabled>Select Part Number...</option>
                      {masterParts.map(p => (
                        <option key={p.partNo} value={p.partNo}>
                          {p.partNo} - {p.partName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 6. Part Name */}
                  <div>
                    <label>6. Part Name (Auto-fetched)</label>
                    <input
                      readOnly
                      placeholder="Auto-fetched from Part Number"
                      value={currentEntry.partName || ''}
                      style={{ backgroundColor: '#f0fdf4', color: '#0b462c', fontWeight: 'bold' }}
                    />
                  </div>

                  {/* 7. Planned Qty */}
                  <div>
                    <label>7. Planned Qty</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Provide Qty or auto-fetched"
                      value={currentEntry.plannedQty !== undefined && currentEntry.plannedQty !== null ? currentEntry.plannedQty : ''}
                      onChange={e => handleQtyChange('plannedQty', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* 8. Actual Qty */}
                  <div>
                    <label>8. Actual Qty *</label>
                    <input
                      required
                      type="number"
                      min="0"
                      placeholder="Actual produced quantity"
                      value={currentEntry.actualQty !== undefined && currentEntry.actualQty !== null ? currentEntry.actualQty : ''}
                      onChange={e => handleQtyChange('actualQty', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* 9. Gap */}
                  <div>
                    <label>9. Gap (Auto-calculated)</label>
                    <input
                      readOnly
                      style={{
                        backgroundColor: (currentEntry.gap || 0) > 0 ? '#fff8e1' : '#f5f5f5',
                        color: (currentEntry.gap || 0) > 0 ? '#b71c1c' : '#2e7d32',
                        fontWeight: 'bold'
                      }}
                      value={currentEntry.gap !== undefined ? currentEntry.gap : Math.max(0, (currentEntry.plannedQty || 0) - (currentEntry.actualQty || 0))}
                    />
                  </div>

                  {/* 10. Gap Reason */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label>10. Gap Reason (Machine, Manpower, Production Out Put)</label>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => toggleGapReason('Machine')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          border: currentEntry.gapReasonMachine ? '2px solid #0b462c' : '1px solid #ccc',
                          background: currentEntry.gapReasonMachine ? '#0b462c' : '#fff',
                          color: currentEntry.gapReasonMachine ? '#fff' : '#333',
                          cursor: 'pointer',
                          fontWeight: currentEntry.gapReasonMachine ? 'bold' : 'normal',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {currentEntry.gapReasonMachine ? '✓' : '○'} Machine
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGapReason('Manpower')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          border: currentEntry.gapReasonManpower ? '2px solid #0b462c' : '1px solid #ccc',
                          background: currentEntry.gapReasonManpower ? '#0b462c' : '#fff',
                          color: currentEntry.gapReasonManpower ? '#fff' : '#333',
                          cursor: 'pointer',
                          fontWeight: currentEntry.gapReasonManpower ? 'bold' : 'normal',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {currentEntry.gapReasonManpower ? '✓' : '○'} Manpower
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleGapReason('Production Output')}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 6,
                          border: currentEntry.gapReasonProductionOutput ? '2px solid #0b462c' : '1px solid #ccc',
                          background: currentEntry.gapReasonProductionOutput ? '#0b462c' : '#fff',
                          color: currentEntry.gapReasonProductionOutput ? '#fff' : '#333',
                          cursor: 'pointer',
                          fontWeight: currentEntry.gapReasonProductionOutput ? 'bold' : 'normal',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {currentEntry.gapReasonProductionOutput ? '✓' : '○'} Production Out Put
                      </button>
                    </div>
                  </div>

                  {/* 11. Rejection */}
                  <div>
                    <label>11. Rejection</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={currentEntry.rejectionQty !== undefined && currentEntry.rejectionQty !== null ? currentEntry.rejectionQty : ''}
                      onChange={e => handleQtyChange('rejectionQty', parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  {/* 12. Reason For Rejection */}
                  <div>
                    <label>12. Reason For Rejection</label>
                    <input
                      placeholder="Reason for rejection"
                      value={currentEntry.reasonForRejection || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, reasonForRejection: e.target.value })}
                      list="downstream-rejection-reasons"
                    />
                  </div>

                  {/* 13. Remark */}
                  <div style={{ gridColumn: 'span 2' }}>
                    <label>13. Remark</label>
                    <input
                      placeholder="Additional remarks or notes"
                      value={currentEntry.remark || ''}
                      onChange={e => setCurrentEntry({ ...currentEntry, remark: e.target.value })}
                    />
                  </div>

                  {/* Form Actions */}
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, borderTop: '1px solid #eee', paddingTop: 15 }}>
                    <button type="button" className="btn btn-nav" onClick={e => handleSave(e, 'Draft')}><Save size={16} /> Save as Draft</button>
                    <button type="button" className="btn btn-highlight" onClick={e => handleSave(e, 'Submitted')}><Check size={16} /> Submit for Approval</button>
                  </div>
                </form>
              ) : (
                /* NON-DCF STANDARD ENTRY FORM (Quality, HT & Finishing, Machining, Storage & Dispatch) */
                <form style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15 }}>
                  <div>
                    <label>Traceability Batch ID *</label>
                    <input required placeholder="Scan or enter ID (e.g. A170926A)" value={currentEntry.traceabilityBatchId || ''} onChange={e => setCurrentEntry({ ...currentEntry, traceabilityBatchId: e.target.value.toUpperCase() })} />
                  </div>

                  <div>
                    <label>Date *</label>
                    <input required type="date" value={currentEntry.date || ''} onChange={e => setCurrentEntry({ ...currentEntry, date: e.target.value })} />
                  </div>

                  <div>
                    <label>Shift *</label>
                    <select value={currentEntry.shift || ''} onChange={e => setCurrentEntry({ ...currentEntry, shift: e.target.value })}>
                      <option value="Shift A">Shift A</option>
                      <option value="Shift B">Shift B</option>
                    </select>
                  </div>

                  <div>
                    <label>Operator *</label>
                    <select required value={currentEntry.operatorPunchNo || ''} onChange={e => setCurrentEntry({ ...currentEntry, operatorPunchNo: e.target.value, operatorName: operators.find(o => o.punchNo === e.target.value)?.name || e.target.value })}>
                      <option value="" disabled>Select Operator...</option>
                      {operators.map(o => (
                        <option key={o.punchNo} value={o.punchNo}>{o.punchNo} - {o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Input Qty (Received) *</label>
                    <input required type="number" min="0" value={currentEntry.inputQty !== undefined ? currentEntry.inputQty : ''} onChange={e => setCurrentEntry({ ...currentEntry, inputQty: parseFloat(e.target.value) || 0, processedQty: (parseFloat(e.target.value) || 0) - (currentEntry.rejectionQty || 0) })} />
                  </div>

                  <div>
                    <label>Processed Qty (Auto-calculated)</label>
                    <input readOnly style={{ backgroundColor: '#f5f5f5' }} value={(currentEntry.inputQty || 0) - (currentEntry.rejectionQty || 0)} />
                  </div>

                  <div>
                    <label>Rejection Qty *</label>
                    <input required type="number" min="0" value={currentEntry.rejectionQty !== undefined ? currentEntry.rejectionQty : ''} onChange={e => setCurrentEntry({ ...currentEntry, rejectionQty: parseFloat(e.target.value) || 0, processedQty: (currentEntry.inputQty || 0) - (parseFloat(e.target.value) || 0) })} />
                  </div>

                  {(currentEntry.rejectionQty || 0) > 0 && (
                    <div>
                      <label>Reason For Rejection *</label>
                      <input required placeholder="Reason for rejection" value={currentEntry.reasonForRejection || ''} onChange={e => setCurrentEntry({ ...currentEntry, reasonForRejection: e.target.value })} list="downstream-rejection-reasons" />
                    </div>
                  )}

                  <datalist id="downstream-rejection-reasons">
                    {rejectionReasons.map(r => (
                      <option key={r.id} value={r.reasonName}>{r.category ? `(${r.category})` : ''}</option>
                    ))}
                  </datalist>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button type="button" className="btn btn-nav" onClick={e => handleSave(e, 'Draft')}><Save size={16} /> Save as Draft</button>
                    <button type="button" className="btn btn-highlight" onClick={e => handleSave(e, 'Submitted')}><Check size={16} /> Submit for Approval</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ── DATA TABLE ─────────────────────────────────── */}
          <div className="table-wrapper">
            {isQuality ? (
              /* QUALITY 10-FIELD TABLE: Date, Shift, Supervisor Name, Operator Name, Part No, Part Name, Inspection Target Qty, Actual Qty, Rejection Qty, Punch Number, Status, Actions */
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Supervisor Name</th>
                    <th>Operator Name</th>
                    <th>Part No</th>
                    <th>Part Name</th>
                    <th>Inspection Target Qty</th>
                    <th>Actual Qty</th>
                    <th>Rejection Qty</th>
                    <th>Punch Number</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr>
                  ) : entries.length === 0 ? (
                    <tr><td colSpan={12} style={{ textAlign: 'center', padding: 30, color: '#777' }}>No entries found for {effectiveDepartment || departmentName}.</td></tr>
                  ) : (
                    entries.map(e => (
                      <tr key={e.id}>
                        <td>{e.date ? new Date(e.date).toLocaleDateString('en-GB') : '-'}</td>
                        <td>{e.shift || '-'}</td>
                        <td>{e.supervisor || '-'}</td>
                        <td>{e.operatorName || '-'}</td>
                        <td style={{ fontWeight: 'bold', color: '#004d40' }}>{e.partNo || (e.part ? e.part.partNo : '-')}</td>
                        <td>{e.partName || (e.part ? e.part.partName : '-')}</td>
                        <td style={{ fontWeight: 500 }}>{e.plannedQty || e.inputQty || 0}</td>
                        <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{e.actualQty || e.processedQty || 0}</td>
                        <td style={{ color: (e.rejectionQty || 0) > 0 ? '#b71c1c' : '#555', fontWeight: (e.rejectionQty || 0) > 0 ? 'bold' : 'normal' }}>
                          {e.rejectionQty || 0}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0b462c', background: '#f0fdf4', padding: '2px 8px', borderRadius: 4, border: '1px solid #c8dfd0' }}>
                            {e.operatorPunchNo || '-'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : e.status === 'Returned' ? 'badge-rej-high' : ''}`}>
                            {e.status}
                          </span>
                        </td>
                        <td>
                          {(e.status === 'Draft' || e.status === 'Returned') ? (
                            <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', width: '100%' }} onClick={() => handleEdit(e)}>
                              <Edit2 size={14} /> Edit
                            </button>
                          ) : e.status === 'Submitted' ? (
                            <div style={{ display: 'flex', gap: 5 }}>
                              {role === 'Admin' ? (
                                <>
                                  <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', flex: 1 }} onClick={() => handleAction(e, 'Approve')} title="Approve"><Check size={14} /></button>
                                  <button className="btn-small" style={{ background: '#ffebee', color: '#b71c1c', flex: 1 }} onClick={() => handleAction(e, 'Return')} title="Return"><ArrowLeft size={14} /></button>
                                </>
                              ) : (
                                <span style={{ fontSize: 12, color: '#f57f17' }}>Pending Approval</span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: '#888' }}>Locked</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : isDcf ? (
              /* DCF 13-FIELD TABLE */
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>Supervisor</th>
                    <th>Operator Name</th>
                    <th>Part Number</th>
                    <th>Part Name</th>
                    <th>Planned Qty</th>
                    <th>Actual Qty</th>
                    <th>Gap</th>
                    <th>Gap Reason</th>
                    <th>Rejection</th>
                    <th>Reason For Rejection</th>
                    <th>Remark</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={15} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr>
                  ) : entries.length === 0 ? (
                    <tr><td colSpan={15} style={{ textAlign: 'center', padding: 30, color: '#777' }}>No entries found for {effectiveDepartment || departmentName}.</td></tr>
                  ) : (
                    entries.map(e => {
                      const effectivePlanned = e.plannedQty || e.inputQty || 0;
                      const effectiveActual = e.actualQty || e.processedQty || 0;
                      const effectiveGap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, effectivePlanned - effectiveActual);

                      const gapReasonsList: string[] = [];
                      if (e.gapReasonMachine) gapReasonsList.push('Machine');
                      if (e.gapReasonManpower) gapReasonsList.push('Manpower');
                      if (e.gapReasonProductionOutput) gapReasonsList.push('Production Output');
                      const displayGapReason = gapReasonsList.length > 0 ? gapReasonsList.join(', ') : (e.gapReason || '-');

                      return (
                        <tr key={e.id}>
                          <td>{e.date ? new Date(e.date).toLocaleDateString() : '-'}</td>
                          <td>{e.shift || '-'}</td>
                          <td>{e.supervisor || '-'}</td>
                          <td>{e.operatorName || e.operatorPunchNo || '-'}</td>
                          <td style={{ fontWeight: 'bold', color: '#004d40' }}>{e.partNo || (e.part ? e.part.partNo : e.traceabilityBatchId || '-')}</td>
                          <td>{e.partName || (e.part ? e.part.partName : '-')}</td>
                          <td style={{ fontWeight: 500 }}>{effectivePlanned}</td>
                          <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{effectiveActual}</td>
                          <td style={{ fontWeight: 'bold', color: effectiveGap > 0 ? '#b71c1c' : '#2e7d32' }}>
                            {effectiveGap}
                          </td>
                          <td style={{ fontSize: 12, color: '#555' }}>{displayGapReason}</td>
                          <td style={{ color: (e.rejectionQty || 0) > 0 ? '#b71c1c' : '#555', fontWeight: (e.rejectionQty || 0) > 0 ? 'bold' : 'normal' }}>
                            {e.rejectionQty || 0}
                          </td>
                          <td style={{ fontSize: 12 }}>{e.reasonForRejection || '-'}</td>
                          <td style={{ fontSize: 12, color: '#666' }}>{e.remark || '-'}</td>
                          <td>
                            <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : e.status === 'Returned' ? 'badge-rej-high' : ''}`}>
                              {e.status}
                            </span>
                          </td>
                          <td>
                            {(e.status === 'Draft' || e.status === 'Returned') ? (
                              <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', width: '100%' }} onClick={() => handleEdit(e)}>
                                <Edit2 size={14} /> Edit
                              </button>
                            ) : e.status === 'Submitted' ? (
                              <div style={{ display: 'flex', gap: 5 }}>
                                {role === 'Admin' ? (
                                  <>
                                    <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', flex: 1 }} onClick={() => handleAction(e, 'Approve')} title="Approve"><Check size={14} /></button>
                                    <button className="btn-small" style={{ background: '#ffebee', color: '#b71c1c', flex: 1 }} onClick={() => handleAction(e, 'Return')} title="Return"><ArrowLeft size={14} /></button>
                                  </>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#f57f17' }}>Pending Approval</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#888' }}>Locked</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              /* NON-DCF STANDARD TABLE (Quality, HT & Finishing, Machining, Storage & Dispatch) */
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    <th>Trace ID</th>
                    <th>Date</th>
                    <th>Operator</th>
                    <th>Input Qty</th>
                    <th>Processed</th>
                    <th>Rejected</th>
                    <th>Status</th>
                    <th style={{ width: 120 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>Loading...</td></tr> :
                    entries.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#777' }}>No entries found for {effectiveDepartment || departmentName}.</td></tr> :
                      entries.map(e => (
                        <tr key={e.id}>
                          <td style={{ fontWeight: 'bold', color: '#004d40' }}>{e.traceabilityBatchId}</td>
                          <td>{new Date(e.date).toLocaleDateString()}</td>
                          <td>{e.operatorName || e.operatorPunchNo}</td>
                          <td>{e.inputQty}</td>
                          <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{e.processedQty}</td>
                          <td style={{ color: '#b71c1c' }}>{e.rejectionQty}</td>
                          <td>
                            <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : e.status === 'Returned' ? 'badge-rej-high' : ''}`}>
                              {e.status}
                            </span>
                          </td>
                          <td>
                            {(e.status === 'Draft' || e.status === 'Returned') ? (
                              <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', width: '100%' }} onClick={() => handleEdit(e)}><Edit2 size={14} /> Edit</button>
                            ) : e.status === 'Submitted' ? (
                              <div style={{ display: 'flex', gap: 5 }}>
                                {role === 'Admin' ? (
                                  <>
                                    <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', flex: 1 }} onClick={() => handleAction(e, 'Approve')} title="Approve"><Check size={14} /></button>
                                    <button className="btn-small" style={{ background: '#ffebee', color: '#b71c1c', flex: 1 }} onClick={() => handleAction(e, 'Return')} title="Return"><ArrowLeft size={14} /></button>
                                  </>
                                ) : (
                                  <span style={{ fontSize: 12, color: '#f57f17' }}>Pending Approval</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: '#888' }}>Locked</span>
                            )}
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
