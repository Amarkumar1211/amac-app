import React, { useState, useMemo } from 'react';
import { 
  Download, Printer, Search, RefreshCw, Award, 
  TrendingUp, BarChart2, AlertTriangle, Users, Package, 
  Layers, CheckCircle, ShieldCheck, Building2, Flame
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, 
  LineElement, Title, Tooltip, Legend, Filler 
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface QualityEntry {
  id: number;
  departmentName: string;
  traceabilityBatchId?: string;
  partId?: number;
  partNo: string;
  partName: string;
  date: string;
  shift: string;
  supervisor: string;
  operatorPunchNo: string;
  operatorName: string;
  plannedQty: number; // Inspection Target Qty
  actualQty: number;  // Actual Inspected Qty
  gap?: number;
  gapReason?: string;
  gapReasonMachine?: boolean;
  gapReasonManpower?: boolean;
  gapReasonProductionOutput?: boolean;
  inputQty?: number;
  processedQty?: number;
  rejectionQty: number;
  reasonForRejection: string;
  remark?: string;
  status?: string;
  part?: {
    id: number;
    partNo: string;
    partName: string;
    castingWeight?: number;
  };
}

interface QualityHODReportsViewProps {
  entries: QualityEntry[];
  operators?: any[];
  supervisors?: any[];
  masterParts?: any[];
  selectedUnit: 'All' | 'U5' | 'U4B';
  onSelectUnit: (unit: 'All' | 'U5' | 'U4B') => void;
  selectedStage: string;
  onSelectStage: (stage: string) => void;
}

const U5_STAGES = [
  'Process Rejection',
  'UT',
  'Before HT',
  'boroscope (Sand) Inspection',
  'Final Inspection'
];

const U4B_STAGES = [
  'DPT',
  'boroscope (Sand) Inspection',
  'Before Shot Blasting Prosity Check',
  'Final Inspection'
];

export default function QualityHODReportsView({
  entries,
  operators = [],
  supervisors = [],
  masterParts = [],
  selectedUnit,
  onSelectUnit,
  selectedStage,
  onSelectStage
}: QualityHODReportsViewProps) {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [activeTab, setActiveTab] = useState<'master' | 'units' | 'defects' | 'operators' | 'supervisors' | 'parts' | 'trends'>('master');
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState('All');

  // Quick date filters
  const setToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setDateRange({ start: today, end: today });
  };

  const setThisWeek = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1);
    const firstDay = new Date(curr.setDate(first)).toISOString().split('T')[0];
    const lastDay = new Date(curr.setDate(first + 6)).toISOString().split('T')[0];
    setDateRange({ start: firstDay, end: lastDay });
  };

  const setThisMonth = () => {
    const curr = new Date();
    const firstDay = new Date(curr.getFullYear(), curr.getMonth(), 1, 12, 0, 0).toISOString().split('T')[0];
    const lastDay = new Date(curr.getFullYear(), curr.getMonth() + 1, 0, 12, 0, 0).toISOString().split('T')[0];
    setDateRange({ start: firstDay, end: lastDay });
  };

  const resetFilters = () => {
    setDateRange({ start: '', end: '' });
    setSearchQuery('');
    setShiftFilter('All');
    onSelectUnit('All');
    onSelectStage('All Stages');
  };

  // Helper to extract Unit and Stage from departmentName (e.g., 'U5 - UT' or 'U4B - DPT')
  const parseDept = (deptName: string = '') => {
    if (deptName.startsWith('U5')) {
      const stage = deptName.includes(' - ') ? deptName.split(' - ').slice(1).join(' - ').trim() : deptName;
      return { unit: 'U5' as const, stage };
    }
    if (deptName.startsWith('U4B')) {
      const stage = deptName.includes(' - ') ? deptName.split(' - ').slice(1).join(' - ').trim() : deptName;
      return { unit: 'U4B' as const, stage };
    }
    return { unit: 'Other' as const, stage: deptName };
  };

  // Available stages based on current unit selection
  const availableStages = useMemo(() => {
    if (selectedUnit === 'U5') return ['All Stages', ...U5_STAGES];
    if (selectedUnit === 'U4B') return ['All Stages', ...U4B_STAGES];
    const combined = Array.from(new Set([...U5_STAGES, ...U4B_STAGES]));
    return ['All Stages', ...combined];
  }, [selectedUnit]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const { unit, stage } = parseDept(e.departmentName);

      // Unit filter
      if (selectedUnit && selectedUnit !== 'All') {
        if (unit !== selectedUnit) return false;
      }

      // Stage filter
      if (selectedStage && selectedStage !== 'All Stages') {
        if (stage.toLowerCase() !== selectedStage.toLowerCase()) return false;
      }

      // Date filter
      if (dateRange.start && e.date && new Date(e.date) < new Date(dateRange.start)) return false;
      if (dateRange.end && e.date && new Date(e.date) > new Date(dateRange.end)) return false;

      // Shift filter (Shift A / Shift B)
      if (shiftFilter !== 'All' && e.shift !== shiftFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const partNo = (e.partNo || e.part?.partNo || '').toLowerCase();
        const partName = (e.partName || e.part?.partName || '').toLowerCase();
        const op = (e.operatorName || e.operatorPunchNo || '').toLowerCase();
        const sup = (e.supervisor || '').toLowerCase();
        const trace = (e.traceabilityBatchId || '').toLowerCase();
        const reason = (e.reasonForRejection || '').toLowerCase();
        const dept = (e.departmentName || '').toLowerCase();
        const remark = (e.remark || '').toLowerCase();
        if (!partNo.includes(q) && !partName.includes(q) && !op.includes(q) && !sup.includes(q) && !trace.includes(q) && !reason.includes(q) && !dept.includes(q) && !remark.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, selectedUnit, selectedStage, dateRange, shiftFilter, searchQuery]);

  // Overall Quality KPI calculations
  const totalTarget = useMemo(() => filteredEntries.reduce((sum, e) => sum + (e.plannedQty || e.inputQty || 0), 0), [filteredEntries]);
  const totalInspected = useMemo(() => filteredEntries.reduce((sum, e) => sum + (e.actualQty || e.processedQty || 0), 0), [filteredEntries]);
  const totalRej = useMemo(() => filteredEntries.reduce((sum, e) => sum + (e.rejectionQty || 0), 0), [filteredEntries]);
  const totalAccepted = Math.max(0, totalInspected - totalRej);
  const totalGap = useMemo(() => filteredEntries.reduce((sum, e) => {
    const p = e.plannedQty || e.inputQty || 0;
    const a = e.actualQty || e.processedQty || 0;
    return sum + (e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, p - a));
  }, 0), [filteredEntries]);

  const targetAchieved = totalTarget > 0 ? ((totalInspected / totalTarget) * 100).toFixed(1) : '0.0';
  const acceptanceRate = totalInspected > 0 ? ((totalAccepted / totalInspected) * 100).toFixed(1) : '0.0';
  const rejectionRate = totalInspected > 0 ? ((totalRej / totalInspected) * 100).toFixed(1) : '0.0';

  const totalTonnage = useMemo(() => {
    return filteredEntries.reduce((sum, e) => {
      const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
      const cw = Number(part?.castingWeight || 0);
      const actual = Number(e.actualQty || e.processedQty || 0);
      return sum + ((actual * cw) / 1000);
    }, 0).toFixed(2);
  }, [filteredEntries, masterParts]);

  // Unit breakdown stats (U5 vs U4B)
  const unitStats = useMemo(() => {
    const units = ['U5', 'U4B'] as const;
    return units.map(u => {
      const uEntries = filteredEntries.filter(e => parseDept(e.departmentName).unit === u);
      const target = uEntries.reduce((s, e) => s + (e.plannedQty || e.inputQty || 0), 0);
      const actual = uEntries.reduce((s, e) => s + (e.actualQty || e.processedQty || 0), 0);
      const rej = uEntries.reduce((s, e) => s + (e.rejectionQty || 0), 0);
      const accepted = Math.max(0, actual - rej);
      const gap = uEntries.reduce((s, e) => {
        const p = e.plannedQty || e.inputQty || 0;
        const a = e.actualQty || e.processedQty || 0;
        return s + (e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, p - a));
      }, 0);
      const adh = target > 0 ? ((actual / target) * 100).toFixed(1) : '0.0';
      const scrap = actual > 0 ? ((rej / actual) * 100).toFixed(1) : '0.0';
      const passRate = actual > 0 ? ((accepted / actual) * 100).toFixed(1) : '0.0';

      const reasonCount: Record<string, number> = {};
      uEntries.forEach(e => {
        if (e.reasonForRejection) {
          reasonCount[e.reasonForRejection] = (reasonCount[e.reasonForRejection] || 0) + (e.rejectionQty || 1);
        }
      });
      const topDefect = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

      return {
        unit: u,
        count: uEntries.length,
        target,
        actual,
        accepted,
        rej,
        gap,
        adherence: adh,
        scrapRate: scrap,
        passRate,
        topDefect
      };
    });
  }, [filteredEntries]);

  // Stage-wise breakdown stats
  const stageStats = useMemo(() => {
    const allKnownStages = Array.from(new Set([...U5_STAGES, ...U4B_STAGES]));
    return allKnownStages.map(st => {
      const stEntries = filteredEntries.filter(e => parseDept(e.departmentName).stage.toLowerCase() === st.toLowerCase());
      const target = stEntries.reduce((s, e) => s + (e.plannedQty || e.inputQty || 0), 0);
      const actual = stEntries.reduce((s, e) => s + (e.actualQty || e.processedQty || 0), 0);
      const rej = stEntries.reduce((s, e) => s + (e.rejectionQty || 0), 0);
      const accepted = Math.max(0, actual - rej);
      const gap = Math.max(0, target - actual);
      const scrap = actual > 0 ? ((rej / actual) * 100).toFixed(1) : '0.0';
      const passRate = actual > 0 ? ((accepted / actual) * 100).toFixed(1) : '0.0';

      const reasonCount: Record<string, number> = {};
      stEntries.forEach(e => {
        if (e.reasonForRejection) {
          reasonCount[e.reasonForRejection] = (reasonCount[e.reasonForRejection] || 0) + (e.rejectionQty || 1);
        }
      });
      const topDefect = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

      return {
        stage: st,
        count: stEntries.length,
        target,
        actual,
        accepted,
        rej,
        gap,
        scrapRate: scrap,
        passRate,
        topDefect
      };
    }).filter(s => s.count > 0 || (selectedStage === s.stage));
  }, [filteredEntries, selectedStage]);

  // Defect Pareto Analysis breakdown
  const defectStats = useMemo(() => {
    const map: Record<string, { count: number; qty: number; stages: Set<string>; parts: Set<string> }> = {};
    filteredEntries.forEach(e => {
      if (e.rejectionQty && e.rejectionQty > 0) {
        const reason = (e.reasonForRejection || 'Unspecified Defect').trim();
        if (!map[reason]) {
          map[reason] = { count: 0, qty: 0, stages: new Set(), parts: new Set() };
        }
        map[reason].count += 1;
        map[reason].qty += e.rejectionQty;
        map[reason].stages.add(parseDept(e.departmentName).stage);
        if (e.partNo) map[reason].parts.add(e.partNo);
      }
    });

    const list = Object.entries(map).map(([reason, data]) => ({
      reason,
      count: data.count,
      qty: data.qty,
      pctOfTotal: totalRej > 0 ? ((data.qty / totalRej) * 100).toFixed(1) : '0.0',
      stages: Array.from(data.stages).join(', '),
      parts: Array.from(data.parts).slice(0, 3).join(', ') + (data.parts.size > 3 ? '...' : '')
    })).sort((a, b) => b.qty - a.qty);

    let runningSum = 0;
    return list.map(item => {
      runningSum += item.qty;
      return {
        ...item,
        cumulativePct: totalRej > 0 ? ((runningSum / totalRej) * 100).toFixed(1) : '0.0'
      };
    });
  }, [filteredEntries, totalRej]);

  // Operator leaderboard breakdown
  const operatorStats = useMemo(() => {
    const map: Record<string, any> = {};
    filteredEntries.forEach(e => {
      const key = e.operatorPunchNo || e.operatorName || 'Unknown';
      if (!map[key]) {
        map[key] = {
          punchNo: e.operatorPunchNo || '-',
          name: e.operatorName || key,
          dept: e.departmentName,
          target: 0,
          actual: 0,
          accepted: 0,
          rej: 0
        };
      }
      const target = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const rej = e.rejectionQty || 0;

      map[key].target += target;
      map[key].actual += actual;
      map[key].rej += rej;
      map[key].accepted += Math.max(0, actual - rej);
    });

    return Object.values(map).map((op: any) => ({
      ...op,
      adherence: op.target > 0 ? ((op.actual / op.target) * 100).toFixed(1) : '0.0',
      scrapRate: op.actual > 0 ? ((op.rej / op.actual) * 100).toFixed(1) : '0.0',
      passRate: op.actual > 0 ? ((op.accepted / op.actual) * 100).toFixed(1) : '0.0'
    })).sort((a: any, b: any) => b.actual - a.actual);
  }, [filteredEntries]);

  // Supervisor performance breakdown
  const supervisorStats = useMemo(() => {
    const map: Record<string, any> = {};
    filteredEntries.forEach(e => {
      const key = e.supervisor || 'Unassigned';
      if (!map[key]) {
        map[key] = {
          name: key,
          shiftsCount: 0,
          shiftA: 0,
          shiftB: 0,
          target: 0,
          actual: 0,
          accepted: 0,
          rej: 0
        };
      }
      const target = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const rej = e.rejectionQty || 0;

      map[key].shiftsCount++;
      if ((e.shift || '').includes('A')) map[key].shiftA++;
      if ((e.shift || '').includes('B')) map[key].shiftB++;
      map[key].target += target;
      map[key].actual += actual;
      map[key].rej += rej;
      map[key].accepted += Math.max(0, actual - rej);
    });

    return Object.values(map).map((sup: any) => ({
      ...sup,
      adherence: sup.target > 0 ? ((sup.actual / sup.target) * 100).toFixed(1) : '0.0',
      scrapRate: sup.actual > 0 ? ((sup.rej / sup.actual) * 100).toFixed(1) : '0.0',
      passRate: sup.actual > 0 ? ((sup.accepted / sup.actual) * 100).toFixed(1) : '0.0'
    })).sort((a: any, b: any) => b.actual - a.actual);
  }, [filteredEntries]);

  // Part-wise matrix breakdown
  const partStats = useMemo(() => {
    const map: Record<string, any> = {};
    filteredEntries.forEach(e => {
      const key = e.partNo || e.part?.partNo || 'Unknown';
      if (!map[key]) {
        const part = e.part || masterParts.find((p: any) => p.partNo === key || (p.partId && p.partId === e.partId));
        map[key] = {
          partNo: key,
          partName: e.partName || part?.partName || '-',
          castingWeight: part?.castingWeight || 0,
          target: 0,
          actual: 0,
          accepted: 0,
          rej: 0,
          tonnage: 0,
          defectReasons: {}
        };
      }
      const target = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const rej = e.rejectionQty || 0;
      const part = e.part || masterParts.find((p: any) => p.partNo === key || (p.partId && p.partId === e.partId));
      const cw = Number(part?.castingWeight || 0);

      map[key].target += target;
      map[key].actual += actual;
      map[key].rej += rej;
      map[key].accepted += Math.max(0, actual - rej);
      map[key].tonnage += ((actual * cw) / 1000);

      if (e.reasonForRejection) {
        map[key].defectReasons[e.reasonForRejection] = (map[key].defectReasons[e.reasonForRejection] || 0) + (e.rejectionQty || 1);
      }
    });

    return Object.values(map).map((p: any) => {
      const topDefect = Object.entries(p.defectReasons).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'None';
      return {
        ...p,
        adherence: p.target > 0 ? ((p.actual / p.target) * 100).toFixed(1) : '0.0',
        scrapRate: p.actual > 0 ? ((p.rej / p.actual) * 100).toFixed(1) : '0.0',
        passRate: p.actual > 0 ? ((p.accepted / p.actual) * 100).toFixed(1) : '0.0',
        tonnage: p.tonnage.toFixed(2),
        topDefect
      };
    }).sort((a: any, b: any) => b.actual - a.actual);
  }, [filteredEntries, masterParts]);

  // Chart Trend data grouped by Date
  const trendData = useMemo(() => {
    const datesMap: Record<string, { inspected: number; rejected: number; accepted: number }> = {};
    filteredEntries.forEach(e => {
      if (!e.date) return;
      const d = e.date.split('T')[0];
      if (!datesMap[d]) {
        datesMap[d] = { inspected: 0, rejected: 0, accepted: 0 };
      }
      const actual = e.actualQty || e.processedQty || 0;
      const rej = e.rejectionQty || 0;
      datesMap[d].inspected += actual;
      datesMap[d].rejected += rej;
      datesMap[d].accepted += Math.max(0, actual - rej);
    });

    const sortedDates = Object.keys(datesMap).sort();
    return {
      labels: sortedDates,
      datasets: [
        {
          label: 'Total Inspected (pcs)',
          data: sortedDates.map(d => datesMap[d].inspected),
          borderColor: '#0b462c',
          backgroundColor: 'rgba(11, 70, 44, 0.08)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Accepted (pcs)',
          data: sortedDates.map(d => datesMap[d].accepted),
          borderColor: '#1565c0',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3
        },
        {
          label: 'Rejection Scrap (pcs)',
          data: sortedDates.map(d => datesMap[d].rejected),
          borderColor: '#d32f2f',
          backgroundColor: 'rgba(211, 47, 47, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    };
  }, [filteredEntries]);

  // Excel Export
  const exportToExcel = () => {
    const rows = filteredEntries.map(e => {
      const { unit, stage } = parseDept(e.departmentName);
      const target = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const rej = e.rejectionQty || 0;
      const accepted = Math.max(0, actual - rej);
      const rejPct = actual > 0 ? ((rej / actual) * 100).toFixed(1) + '%' : '0%';
      return {
        'Date': e.date ? e.date.split('T')[0] : '',
        'Shift': e.shift || '',
        'Unit': unit,
        'Inspection Stage': stage,
        'Supervisor': e.supervisor || '',
        'Operator Name': e.operatorName || '',
        'Punch Number': e.operatorPunchNo || '',
        'Part No': e.partNo || e.part?.partNo || '',
        'Part Name': e.partName || e.part?.partName || '',
        'Target Qty': target,
        'Actual Inspected': actual,
        'Accepted Qty': accepted,
        'Rejection Qty': rej,
        'Rejection %': rejPct,
        'Defect Reason': e.reasonForRejection || '',
        'Remark': e.remark || '',
        'Status': e.status || 'Approved'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quality_Inspection_Log');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `AMAC_Quality_HOD_Report_${today}.xlsx`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 10 }}>

      {/* ── TOP CONTROL & FILTER BAR ───────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #d2e5d9', padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        
        {/* Row 1: Units, Stages, and Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
          
          {/* Unit Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 'bold', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Building2 size={16} /> Unit:
            </span>
            {(['All', 'U5', 'U4B'] as const).map(u => {
              const isSel = selectedUnit === u;
              return (
                <button
                  key={u}
                  onClick={() => {
                    onSelectUnit(u);
                    onSelectStage('All Stages');
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: isSel ? '1px solid #0b462c' : '1px solid #c8dfd0',
                    background: isSel ? '#0b462c' : '#fff',
                    color: isSel ? '#fff' : '#333',
                    fontSize: 13,
                    fontWeight: isSel ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSel ? '0 2px 4px rgba(11,70,44,0.2)' : 'none'
                  }}
                >
                  {u === 'All' ? 'All Units (U5 & U4B)' : `🏢 Unit ${u}`}
                </button>
              );
            })}

            {/* Stage Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Layers size={16} /> Stage:
              </span>
              <select
                value={selectedStage}
                onChange={e => onSelectStage(e.target.value)}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #c8dfd0', fontSize: 13, background: '#fff', color: '#333' }}
              >
                {availableStages.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Export & Print */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button 
              onClick={exportToExcel}
              className="btn"
              style={{ background: '#0b462c', color: '#fff', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px', borderRadius: 6 }}
            >
              <Download size={15} /> Export Excel
            </button>
            <button 
              onClick={() => window.print()}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', borderRadius: 6 }}
            >
              <Printer size={15} /> Print
            </button>
          </div>
        </div>

        {/* Row 2: Date presets, Custom Range, Shift filter, Search box */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Quick Range:</span>
            <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', borderRadius: 4, padding: '4px 10px' }} onClick={setToday}>Today</button>
            <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', borderRadius: 4, padding: '4px 10px' }} onClick={setThisWeek}>This Week</button>
            <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', borderRadius: 4, padding: '4px 10px' }} onClick={setThisMonth}>This Month</button>
            <button className="btn-small" style={{ background: '#f5f5f5', color: '#555', borderRadius: 4, padding: '4px 10px' }} onClick={resetFilters}>
              <RefreshCw size={12} style={{ marginRight: 4 }} /> Reset
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 }}>
              <input 
                type="date" 
                value={dateRange.start} 
                onChange={e => setDateRange({...dateRange, start: e.target.value})}
                style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }} 
              />
              <span style={{ fontSize: 12, color: '#888' }}>to</span>
              <input 
                type="date" 
                value={dateRange.end} 
                onChange={e => setDateRange({...dateRange, end: e.target.value})}
                style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }} 
              />
            </div>

            <select 
              value={shiftFilter} 
              onChange={e => setShiftFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, marginLeft: 8 }}
            >
              <option value="All">All Shifts</option>
              <option value="Shift A">Shift A</option>
              <option value="Shift B">Shift B</option>
            </select>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: 280 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
            <input 
              type="text" 
              placeholder="Search part, operator, defect..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: 6, border: '1px solid #ccc', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* ── 6 EXECUTIVE KPI SUMMARY CARDS ───────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 15 }}>
        
        {/* Card 1: Target Achieved */}
        <div style={{ background: '#fff', border: '1px solid #c3e0ff', borderRadius: 10, padding: '16px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ fontSize: 12, color: '#1565c0', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Inspection Target Achieved</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#0d47a1' }}>{targetAchieved}%</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Inspected: <strong>{totalInspected.toLocaleString()}</strong> / Target: <strong>{totalTarget.toLocaleString()}</strong>
          </div>
          <div style={{ width: '100%', height: 4, background: '#e3f2fd', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, parseFloat(targetAchieved))}%`, height: '100%', background: '#1976d2' }} />
          </div>
        </div>

        {/* Card 2: Actual Inspected */}
        <div style={{ background: '#fff', border: '1px solid #c8e6c9', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#2e7d32', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Total Inspected</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1b5e20' }}>{totalInspected.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Units across <strong>{filteredEntries.length}</strong> inspection runs
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '2px 8px', borderRadius: 10, background: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 'bold' }}>
            <CheckCircle size={12} /> Quality Verified
          </div>
        </div>

        {/* Card 3: Accepted Qty & First Pass Yield */}
        <div style={{ background: '#fff', border: '1px solid #b2dfdb', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#00796b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Accepted Yield Rate</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#004d40' }}>{acceptanceRate}%</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Accepted: <strong>{totalAccepted.toLocaleString()}</strong> units
          </div>
          <div style={{ width: '100%', height: 4, background: '#e0f2f1', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, parseFloat(acceptanceRate))}%`, height: '100%', background: '#00897b' }} />
          </div>
        </div>

        {/* Card 4: Rejections & Scrap */}
        <div style={{ background: '#fff', border: '1px solid #ffcdd2', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#c62828', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Rejection Scrap Rate</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#b71c1c' }}>{rejectionRate}%</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Total Rejections: <strong>{totalRej.toLocaleString()}</strong> pcs
          </div>
          <div style={{ width: '100%', height: 4, background: '#ffebee', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, parseFloat(rejectionRate))}%`, height: '100%', background: '#d32f2f' }} />
          </div>
        </div>

        {/* Card 5: Inspection Deficit / Gap */}
        <div style={{ background: '#fff', border: '1px solid #ffe0b2', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Inspection Gap (Deficit)</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: totalGap > 0 ? '#b71c1c' : '#2e7d32' }}>
            {totalGap.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Pending inspection shortfall (pcs)
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '2px 8px', borderRadius: 10, background: totalGap > 0 ? '#fff3e0' : '#e8f5e9', color: totalGap > 0 ? '#e65100' : '#2e7d32', fontSize: 11, fontWeight: 'bold' }}>
            {totalGap > 0 ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            {totalGap > 0 ? 'Inspection Lag' : 'On Schedule'}
          </div>
        </div>

        {/* Card 6: Total Quality Tonnage */}
        <div style={{ background: '#fff', border: '1px solid #d1c4e9', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#512da8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Inspected Tonnage</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#311b92' }}>{totalTonnage} <span style={{ fontSize: 16 }}>MT</span></div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Casting weight inspected
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '2px 8px', borderRadius: 10, background: '#ede7f6', color: '#512da8', fontSize: 11, fontWeight: 'bold' }}>
            <Package size={12} /> Metric Tons
          </div>
        </div>

      </div>

      {/* ── ANALYTICAL SUB-TABS NAVIGATION ─────────────────── */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #d2e5d9', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', background: '#f8faf9', overflowX: 'auto' }}>
          {[
            { id: 'master', label: 'Master Quality Log', icon: <Layers size={15} /> },
            { id: 'units', label: 'Unit & Stage Comparison', icon: <Building2 size={15} /> },
            { id: 'defects', label: 'Defect & Pareto Analysis', icon: <AlertTriangle size={15} /> },
            { id: 'operators', label: 'Operator Quality Ranking', icon: <Users size={15} /> },
            { id: 'supervisors', label: 'Supervisor Audit', icon: <ShieldCheck size={15} /> },
            { id: 'parts', label: 'Part-wise Quality Matrix', icon: <Package size={15} /> },
            { id: 'trends', label: 'Quality Trends & Charts', icon: <TrendingUp size={15} /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 18px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid #0b462c' : '3px solid transparent',
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#0b462c' : '#666',
                fontWeight: activeTab === tab.id ? 'bold' : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB 1: MASTER QUALITY INSPECTION LOG ──────────── */}
        {activeTab === 'master' && (
          <div style={{ padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                Showing <strong>{filteredEntries.length}</strong> quality inspection records
              </span>
              <button 
                onClick={exportToExcel}
                className="btn-small" 
                style={{ background: '#e8f3ed', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 4 }}
              >
                <Download size={13} /> Export Master Log (Excel)
              </button>
            </div>

            <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table style={{ minWidth: 1400 }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff', position: 'sticky', top: 0, zIndex: 2 }}>
                    <th style={{ color: '#fff' }}>Date</th>
                    <th style={{ color: '#fff' }}>Shift</th>
                    <th style={{ color: '#fff' }}>Unit</th>
                    <th style={{ color: '#fff' }}>Inspection Stage</th>
                    <th style={{ color: '#fff' }}>Supervisor</th>
                    <th style={{ color: '#fff' }}>Operator Name</th>
                    <th style={{ color: '#fff' }}>Punch No</th>
                    <th style={{ color: '#fff' }}>Part No</th>
                    <th style={{ color: '#fff' }}>Part Name</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Actual Inspected</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejection Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Accepted Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rej %</th>
                    <th style={{ color: '#fff' }}>Defect Reason</th>
                    <th style={{ color: '#fff' }}>Remark</th>
                    <th style={{ color: '#fff' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={17} style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                        No quality inspection records found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map(e => {
                      const { unit, stage } = parseDept(e.departmentName);
                      const target = e.plannedQty || e.inputQty || 0;
                      const actual = e.actualQty || e.processedQty || 0;
                      const rej = e.rejectionQty || 0;
                      const accepted = Math.max(0, actual - rej);
                      const rejPct = actual > 0 ? ((rej / actual) * 100).toFixed(1) : '0.0';

                      return (
                        <tr key={e.id}>
                          <td>{e.date ? e.date.split('T')[0] : '-'}</td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: 4, 
                              fontSize: 11, 
                              fontWeight: 'bold',
                              background: e.shift === 'Shift A' ? '#e3f2fd' : '#f3e5f5',
                              color: e.shift === 'Shift A' ? '#1565c0' : '#7b1fa2'
                            }}>
                              {e.shift || '-'}
                            </span>
                          </td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: 4, 
                              fontSize: 11, 
                              fontWeight: 'bold',
                              background: unit === 'U5' ? '#e8f5e9' : '#fff3e0',
                              color: unit === 'U5' ? '#2e7d32' : '#e65100'
                            }}>
                              {unit}
                            </span>
                          </td>
                          <td style={{ fontWeight: 500 }}>{stage}</td>
                          <td>{e.supervisor || '-'}</td>
                          <td>{e.operatorName || '-'}</td>
                          <td style={{ fontFamily: 'monospace' }}>{e.operatorPunchNo || '-'}</td>
                          <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{e.partNo || e.part?.partNo || '-'}</td>
                          <td>{e.partName || e.part?.partName || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{target}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{actual}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: rej > 0 ? '#b71c1c' : '#555' }}>{rej}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{accepted}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: parseFloat(rejPct) > 0 ? '#c62828' : '#2e7d32' }}>
                            {rejPct}%
                          </td>
                          <td>
                            {e.reasonForRejection ? (
                              <span style={{ padding: '2px 6px', background: '#ffebee', color: '#c62828', borderRadius: 4, fontSize: 11 }}>
                                {e.reasonForRejection}
                              </span>
                            ) : '-'}
                          </td>
                          <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.remark}>
                            {e.remark || '-'}
                          </td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: 10, 
                              fontSize: 10, 
                              fontWeight: 'bold',
                              background: e.status === 'Approved' ? '#e8f5e9' : '#fff8e1',
                              color: e.status === 'Approved' ? '#2e7d32' : '#f57f17'
                            }}>
                              {e.status || 'Approved'}
                            </span>
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

        {/* ── TAB 2: UNIT & STAGE COMPARISON ────────────────── */}
        {activeTab === 'units' && (
          <div style={{ padding: 20 }}>
            {/* Unit Comparison Cards */}
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={18} /> Unit U5 vs Unit U4B Quality Profile
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 25 }}>
              {unitStats.map(u => (
                <div key={u.unit} style={{ background: '#fff', border: '2px solid #d2e5d9', borderRadius: 10, padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 10, marginBottom: 15 }}>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Building2 size={20} /> Unit {u.unit}
                    </div>
                    <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: '#e8f3ed', color: '#0b462c', fontWeight: 'bold' }}>
                      {u.count} Logs
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#777' }}>Target vs Inspected</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#333' }}>
                        {u.actual.toLocaleString()} <span style={{ fontSize: 12, color: '#888' }}>/ {u.target.toLocaleString()}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#777' }}>Target Achieved</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1565c0' }}>{u.adherence}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#777' }}>Accepted Yield</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2e7d32' }}>
                        {u.passRate}% <span style={{ fontSize: 12, color: '#666' }}>({u.accepted.toLocaleString()})</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#777' }}>Scrap / Rejection</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#b71c1c' }}>
                        {u.scrapRate}% <span style={{ fontSize: 12, color: '#666' }}>({u.rej.toLocaleString()})</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 15, padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #eee', fontSize: 12 }}>
                    <span style={{ color: '#666' }}>Top Defect Driver: </span>
                    <strong style={{ color: u.topDefect !== 'None' ? '#b71c1c' : '#2e7d32' }}>{u.topDefect}</strong>
                  </div>
                </div>
              ))}
            </div>

            {/* Stage-wise Breakdown Table */}
            <h4 style={{ margin: '20px 0 12px', color: '#0b462c' }}>Stage-by-Stage Quality Breakdown</h4>
            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Inspection Stage</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Inspected Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Accepted Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Yield %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Pending Gap</th>
                    <th style={{ color: '#fff' }}>Top Defect Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {stageStats.map(s => (
                    <tr key={s.stage}>
                      <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{s.stage}</td>
                      <td style={{ textAlign: 'right' }}>{s.target}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{s.actual}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{s.accepted}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: s.rej > 0 ? '#b71c1c' : '#555' }}>{s.rej}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{s.passRate}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#c62828' }}>{s.scrapRate}%</td>
                      <td style={{ textAlign: 'right', color: s.gap > 0 ? '#b71c1c' : '#2e7d32', fontWeight: 'bold' }}>{s.gap}</td>
                      <td>
                        {s.topDefect !== 'None' ? (
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: '#ffebee', color: '#b71c1c', fontSize: 11 }}>
                            {s.topDefect}
                          </span>
                        ) : (
                          <span style={{ color: '#999', fontSize: 12 }}>Zero Defects</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: DEFECT & PARETO REJECTION ANALYSIS ─────── */}
        {activeTab === 'defects' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} /> Quality Defect Pareto & Rejection Cause Breakdown
            </h4>

            {defectStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                🎉 No defect rejections logged in the selected period. 100% acceptance!
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 20, background: '#f5f9f7', padding: 14, borderRadius: 8, border: '1px solid #d2e5d9', fontSize: 13, color: '#444' }}>
                  <strong>Pareto Insight: </strong>
                  The top defect cause is <strong style={{ color: '#b71c1c' }}>{defectStats[0]?.reason}</strong>, accounting for <strong>{defectStats[0]?.qty} units ({defectStats[0]?.pctOfTotal}%)</strong> of all scrap.
                </div>

                <div className="table-wrapper">
                  <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                    <thead>
                      <tr style={{ background: '#0b462c', color: '#fff' }}>
                        <th style={{ color: '#fff' }}>Rank</th>
                        <th style={{ color: '#fff' }}>Defect Reason</th>
                        <th style={{ color: '#fff', textAlign: 'right' }}>Scrap Quantity</th>
                        <th style={{ color: '#fff', textAlign: 'right' }}>% of Total Scrap</th>
                        <th style={{ color: '#fff', textAlign: 'right' }}>Cumulative %</th>
                        <th style={{ color: '#fff' }}>Affected Inspection Stages</th>
                        <th style={{ color: '#fff' }}>Sample Parts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {defectStats.map((d, idx) => (
                        <tr key={d.reason}>
                          <td style={{ fontWeight: 'bold', color: idx < 3 ? '#b71c1c' : '#555' }}>#{idx + 1}</td>
                          <td style={{ fontWeight: 'bold' }}>{d.reason}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#b71c1c' }}>{d.qty}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                              <span>{d.pctOfTotal}%</span>
                              <div style={{ width: 60, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${d.pctOfTotal}%`, height: '100%', background: '#d32f2f' }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#1565c0' }}>{d.cumulativePct}%</td>
                          <td style={{ fontSize: 12 }}>{d.stages || '-'}</td>
                          <td style={{ fontSize: 12, color: '#666' }}>{d.parts || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: OPERATOR QUALITY RANKING ───────────────── */}
        {activeTab === 'operators' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} /> Operator Quality Performance & Defect Rate Ranking
            </h4>

            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Operator Name</th>
                    <th style={{ color: '#fff' }}>Punch No</th>
                    <th style={{ color: '#fff' }}>Unit / Section</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Inspected</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Accepted</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Pass Rate %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap Rate %</th>
                    <th style={{ color: '#fff' }}>Quality Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorStats.map(op => {
                    const scrap = parseFloat(op.scrapRate);
                    return (
                      <tr key={op.punchNo + op.name}>
                        <td style={{ fontWeight: 'bold' }}>{op.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{op.punchNo}</td>
                        <td>{op.dept}</td>
                        <td style={{ textAlign: 'right' }}>{op.target}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{op.actual}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{op.accepted}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: op.rej > 0 ? '#b71c1c' : '#555' }}>{op.rej}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{op.passRate}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: scrap > 0 ? '#c62828' : '#2e7d32' }}>{op.scrapRate}%</td>
                        <td>
                          {scrap < 1.0 ? (
                            <span style={{ padding: '3px 8px', borderRadius: 12, background: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 'bold' }}>
                              ⭐ Elite Quality
                            </span>
                          ) : scrap < 3.0 ? (
                            <span style={{ padding: '3px 8px', borderRadius: 12, background: '#e3f2fd', color: '#1565c0', fontSize: 11, fontWeight: 'bold' }}>
                              ✓ Certified Quality
                            </span>
                          ) : (
                            <span style={{ padding: '3px 8px', borderRadius: 12, background: '#ffebee', color: '#c62828', fontSize: 11, fontWeight: 'bold' }}>
                              ⚠️ High Scrap Risk
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: SUPERVISOR AUDIT ────────────────────────── */}
        {activeTab === 'supervisors' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} /> Supervisor Inspection Audit & Shift Distribution
            </h4>

            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Supervisor Name</th>
                    <th style={{ color: '#fff', textAlign: 'center' }}>Total Shifts</th>
                    <th style={{ color: '#fff', textAlign: 'center' }}>Shift A / B</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Inspected Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Accepted Qty</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Pass Rate %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap %</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorStats.map(sup => (
                    <tr key={sup.name}>
                      <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{sup.name}</td>
                      <td style={{ textAlign: 'center' }}>{sup.shiftsCount}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>
                        <span style={{ color: '#1565c0', fontWeight: 'bold' }}>A: {sup.shiftA}</span> | <span style={{ color: '#7b1fa2', fontWeight: 'bold' }}>B: {sup.shiftB}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{sup.target}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{sup.actual}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{sup.accepted}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: sup.rej > 0 ? '#b71c1c' : '#555' }}>{sup.rej}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{sup.passRate}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: parseFloat(sup.scrapRate) > 0 ? '#c62828' : '#2e7d32' }}>
                        {sup.scrapRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 6: PART-WISE QUALITY MATRIX ────────────────── */}
        {activeTab === 'parts' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} /> Part-wise Quality Inspection Matrix
            </h4>

            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Part No</th>
                    <th style={{ color: '#fff' }}>Part Name</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Casting Wt (kg)</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Inspected</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Accepted</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Yield %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Tonnage (MT)</th>
                    <th style={{ color: '#fff' }}>Primary Defect</th>
                  </tr>
                </thead>
                <tbody>
                  {partStats.map(p => (
                    <tr key={p.partNo}>
                      <td style={{ fontWeight: 'bold', color: '#004d40' }}>{p.partNo}</td>
                      <td>{p.partName}</td>
                      <td style={{ textAlign: 'right' }}>{p.castingWeight || '-'}</td>
                      <td style={{ textAlign: 'right' }}>{p.target}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{p.actual}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{p.accepted}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: p.rej > 0 ? '#b71c1c' : '#555' }}>{p.rej}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{p.passRate}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#c62828' }}>{p.scrapRate}%</td>
                      <td style={{ textAlign: 'right', color: '#4527a0', fontWeight: 'bold' }}>{p.tonnage}</td>
                      <td>{p.topDefect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 7: QUALITY TRENDS & CHARTS ─────────────────── */}
        {activeTab === 'trends' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} /> Daily Quality Inspection Trajectory & Defect Trends
            </h4>

            {trendData.labels.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                Not enough date records to plot quality trend trajectory. Log more inspection entries across dates.
              </div>
            ) : (
              <div style={{ height: 400, background: '#fff', padding: 15, borderRadius: 8, border: '1px solid #eee' }}>
                <Line 
                  data={trendData} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'top' as const },
                      tooltip: { mode: 'index', intersect: false }
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Quantity (Pieces)' }
                      },
                      x: {
                        title: { display: true, text: 'Date' }
                      }
                    }
                  }} 
                />
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
