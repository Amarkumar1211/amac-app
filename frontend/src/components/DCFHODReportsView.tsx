import React, { useState, useMemo } from 'react';
import { 
  Download, Printer, Search, RefreshCw, Filter, Award, 
  TrendingUp, BarChart2, AlertTriangle, Users, Package, 
  Layers, CheckCircle, Clock, ArrowUpRight, ShieldCheck, ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, 
  LineElement, Title, Tooltip, Legend, Filler 
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface Entry {
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
  part?: {
    id: number;
    partNo: string;
    partName: string;
    castingWeight?: number;
    shotWeight?: number;
  };
}

interface DCFHODReportsViewProps {
  entries: Entry[];
  operators?: any[];
  supervisors?: any[];
  masterParts?: any[];
  selectedSection: string;
  onSelectSection: (section: string) => void;
}

const SECTIONS = ['All Sections', 'Decoring', 'Cutting', 'Fettling', 'Filing', 'Sand Blasting'];

export default function DCFHODReportsView({
  entries,
  operators = [],
  supervisors = [],
  masterParts = [],
  selectedSection,
  onSelectSection
}: DCFHODReportsViewProps) {
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [activeTab, setActiveTab] = useState<'master' | 'sections' | 'operators' | 'supervisors' | 'parts' | 'gap' | 'trends'>('master');
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
  };

  // Filter entries
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      // Section filter
      if (selectedSection && selectedSection !== 'All Sections') {
        if (e.departmentName !== selectedSection) return false;
      }
      // Date filter
      if (dateRange.start && e.date && new Date(e.date) < new Date(dateRange.start)) return false;
      if (dateRange.end && e.date && new Date(e.date) > new Date(dateRange.end)) return false;
      // Shift filter
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
        if (!partNo.includes(q) && !partName.includes(q) && !op.includes(q) && !sup.includes(q) && !trace.includes(q) && !reason.includes(q) && !dept.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, selectedSection, dateRange, shiftFilter, searchQuery]);

  // Overall KPI metrics
  const totalPlanned = useMemo(() => filteredEntries.reduce((sum, e) => sum + (e.plannedQty || e.inputQty || 0), 0), [filteredEntries]);
  const totalActual = useMemo(() => filteredEntries.reduce((sum, e) => sum + (e.actualQty || e.processedQty || 0), 0), [filteredEntries]);
  const totalRej = useMemo(() => filteredEntries.reduce((sum, e) => sum + (e.rejectionQty || 0), 0), [filteredEntries]);
  const totalAccepted = Math.max(0, totalActual - totalRej);
  const totalGap = useMemo(() => filteredEntries.reduce((sum, e) => {
    const p = e.plannedQty || e.inputQty || 0;
    const a = e.actualQty || e.processedQty || 0;
    return sum + (e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, p - a));
  }, 0), [filteredEntries]);

  const scheduleAdherence = totalPlanned > 0 ? ((totalActual / totalPlanned) * 100).toFixed(1) : '0.0';
  const acceptanceRate = totalActual > 0 ? ((totalAccepted / totalActual) * 100).toFixed(1) : '0.0';
  const scrapRate = totalActual > 0 ? ((totalRej / totalActual) * 100).toFixed(1) : '0.0';

  const totalTonnage = useMemo(() => {
    return filteredEntries.reduce((sum, e) => {
      const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
      const cw = Number(part?.castingWeight || 0);
      const actual = Number(e.actualQty || e.processedQty || 0);
      return sum + ((actual * cw) / 1000);
    }, 0).toFixed(2);
  }, [filteredEntries, masterParts]);

  // Section comparison breakdown
  const sectionStats = useMemo(() => {
    const list = ['Decoring', 'Cutting', 'Fettling', 'Filing', 'Sand Blasting'];
    return list.map(sec => {
      const secEntries = filteredEntries.filter(e => e.departmentName === sec);
      const planned = secEntries.reduce((s, e) => s + (e.plannedQty || e.inputQty || 0), 0);
      const actual = secEntries.reduce((s, e) => s + (e.actualQty || e.processedQty || 0), 0);
      const rej = secEntries.reduce((s, e) => s + (e.rejectionQty || 0), 0);
      const gap = secEntries.reduce((s, e) => {
        const p = e.plannedQty || e.inputQty || 0;
        const a = e.actualQty || e.processedQty || 0;
        return s + (e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, p - a));
      }, 0);
      const ton = secEntries.reduce((s, e) => {
        const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
        const cw = Number(part?.castingWeight || 0);
        return s + (((e.actualQty || e.processedQty || 0) * cw) / 1000);
      }, 0).toFixed(2);

      const adh = planned > 0 ? ((actual / planned) * 100).toFixed(1) : '0.0';
      const scrap = actual > 0 ? ((rej / actual) * 100).toFixed(1) : '0.0';

      // Top defect reason
      const reasonCount: Record<string, number> = {};
      secEntries.forEach(e => {
        if (e.reasonForRejection) {
          reasonCount[e.reasonForRejection] = (reasonCount[e.reasonForRejection] || 0) + (e.rejectionQty || 1);
        }
      });
      const topDefect = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

      return {
        section: sec,
        count: secEntries.length,
        planned,
        actual,
        gap,
        rej,
        adherence: adh,
        scrapRate: scrap,
        tonnage: ton,
        topDefect
      };
    });
  }, [filteredEntries, masterParts]);

  // Operator performance breakdown
  const operatorStats = useMemo(() => {
    const map: Record<string, any> = {};
    filteredEntries.forEach(e => {
      const key = e.operatorName || e.operatorPunchNo || 'Unknown';
      if (!map[key]) {
        map[key] = {
          name: e.operatorName || key,
          punchNo: e.operatorPunchNo || '-',
          section: e.departmentName,
          planned: 0,
          actual: 0,
          gap: 0,
          rej: 0,
          tonnage: 0
        };
      }
      const planned = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const gap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, planned - actual);
      const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
      const cw = Number(part?.castingWeight || 0);

      map[key].planned += planned;
      map[key].actual += actual;
      map[key].gap += gap;
      map[key].rej += (e.rejectionQty || 0);
      map[key].tonnage += ((actual * cw) / 1000);
    });

    return Object.values(map).map((op: any) => ({
      ...op,
      adherence: op.planned > 0 ? ((op.actual / op.planned) * 100).toFixed(1) : '0.0',
      scrapRate: op.actual > 0 ? ((op.rej / op.actual) * 100).toFixed(1) : '0.0',
      tonnage: op.tonnage.toFixed(2)
    })).sort((a: any, b: any) => b.actual - a.actual);
  }, [filteredEntries, masterParts]);

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
          planned: 0,
          actual: 0,
          gap: 0,
          rej: 0,
          tonnage: 0
        };
      }
      const planned = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const gap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, planned - actual);
      const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
      const cw = Number(part?.castingWeight || 0);

      map[key].shiftsCount++;
      if ((e.shift || '').includes('A')) map[key].shiftA++;
      if ((e.shift || '').includes('B')) map[key].shiftB++;
      map[key].planned += planned;
      map[key].actual += actual;
      map[key].gap += gap;
      map[key].rej += (e.rejectionQty || 0);
      map[key].tonnage += ((actual * cw) / 1000);
    });

    return Object.values(map).map((sup: any) => ({
      ...sup,
      adherence: sup.planned > 0 ? ((sup.actual / sup.planned) * 100).toFixed(1) : '0.0',
      scrapRate: sup.actual > 0 ? ((sup.rej / sup.actual) * 100).toFixed(1) : '0.0',
      tonnage: sup.tonnage.toFixed(2)
    })).sort((a: any, b: any) => b.actual - a.actual);
  }, [filteredEntries, masterParts]);

  // Part performance breakdown
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
          planned: 0,
          actual: 0,
          gap: 0,
          rej: 0,
          tonnage: 0,
          defectReasons: {}
        };
      }
      const planned = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const gap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, planned - actual);
      const cw = Number(map[key].castingWeight || 0);

      map[key].planned += planned;
      map[key].actual += actual;
      map[key].gap += gap;
      map[key].rej += (e.rejectionQty || 0);
      map[key].tonnage += ((actual * cw) / 1000);

      if (e.reasonForRejection) {
        map[key].defectReasons[e.reasonForRejection] = (map[key].defectReasons[e.reasonForRejection] || 0) + (e.rejectionQty || 1);
      }
    });

    return Object.values(map).map((p: any) => {
      const topDefect = Object.entries(p.defectReasons).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || 'None';
      return {
        ...p,
        adherence: p.planned > 0 ? ((p.actual / p.planned) * 100).toFixed(1) : '0.0',
        scrapRate: p.actual > 0 ? ((p.rej / p.actual) * 100).toFixed(1) : '0.0',
        tonnage: p.tonnage.toFixed(2),
        topDefect
      };
    }).sort((a: any, b: any) => b.actual - a.actual);
  }, [filteredEntries, masterParts]);

  // Gap reason breakdown
  const gapStats = useMemo(() => {
    let machineUnits = 0;
    let manpowerUnits = 0;
    let outputUnits = 0;
    let machineCount = 0;
    let manpowerCount = 0;
    let outputCount = 0;

    filteredEntries.forEach(e => {
      const p = e.plannedQty || e.inputQty || 0;
      const a = e.actualQty || e.processedQty || 0;
      const gap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, p - a);
      if (gap <= 0) return;

      const raw = (e.gapReason || '').toLowerCase();
      const isM = e.gapReasonMachine || raw.includes('machine');
      const isMP = e.gapReasonManpower || raw.includes('manpower');
      const isOut = e.gapReasonProductionOutput || raw.includes('output');

      const count = (isM ? 1 : 0) + (isMP ? 1 : 0) + (isOut ? 1 : 0) || 1;
      const share = gap / count;

      if (isM) { machineUnits += share; machineCount++; }
      if (isMP) { manpowerUnits += share; manpowerCount++; }
      if (isOut) { outputUnits += share; outputCount++; }
      if (!isM && !isMP && !isOut) {
        // default to output if unspecified
        outputUnits += share; outputCount++;
      }
    });

    const sumUnits = machineUnits + manpowerUnits + outputUnits;

    return {
      machine: { units: Math.round(machineUnits), count: machineCount, pct: sumUnits > 0 ? ((machineUnits / sumUnits) * 100).toFixed(1) : '0.0' },
      manpower: { units: Math.round(manpowerUnits), count: manpowerCount, pct: sumUnits > 0 ? ((manpowerUnits / sumUnits) * 100).toFixed(1) : '0.0' },
      output: { units: Math.round(outputUnits), count: outputCount, pct: sumUnits > 0 ? ((outputUnits / sumUnits) * 100).toFixed(1) : '0.0' },
      totalLost: Math.round(sumUnits)
    };
  }, [filteredEntries]);

  // Chart data: daily trends
  const trendData = useMemo(() => {
    const datesMap: Record<string, { planned: number; actual: number; rej: number; gap: number }> = {};
    
    // Sort chronological
    const sorted = [...filteredEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sorted.forEach(e => {
      const d = e.date ? e.date.split('T')[0] : 'N/A';
      if (!datesMap[d]) datesMap[d] = { planned: 0, actual: 0, rej: 0, gap: 0 };
      const p = e.plannedQty || e.inputQty || 0;
      const a = e.actualQty || e.processedQty || 0;
      const g = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, p - a);
      datesMap[d].planned += p;
      datesMap[d].actual += a;
      datesMap[d].rej += (e.rejectionQty || 0);
      datesMap[d].gap += g;
    });

    const labels = Object.keys(datesMap);
    return {
      labels,
      datasets: [
        {
          label: 'Actual Produced',
          data: labels.map(d => datesMap[d].actual),
          borderColor: '#0b462c',
          backgroundColor: 'rgba(11, 70, 44, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Planned Target',
          data: labels.map(d => datesMap[d].planned),
          borderColor: '#1976d2',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          tension: 0.3
        },
        {
          label: 'Gap (Deficit)',
          data: labels.map(d => datesMap[d].gap),
          borderColor: '#e65100',
          backgroundColor: 'transparent',
          tension: 0.3
        },
        {
          label: 'Rejections',
          data: labels.map(d => datesMap[d].rej),
          borderColor: '#d32f2f',
          backgroundColor: 'transparent',
          tension: 0.3
        }
      ]
    };
  }, [filteredEntries]);

  // Excel Export
  const exportToExcel = () => {
    const rows = filteredEntries.map((e, idx) => {
      const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
      const cw = Number(part?.castingWeight || 0);
      const planned = e.plannedQty || e.inputQty || 0;
      const actual = e.actualQty || e.processedQty || 0;
      const gap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, planned - actual);
      const tonnage = ((actual * cw) / 1000).toFixed(3);

      const reasons: string[] = [];
      if (e.gapReasonMachine) reasons.push('Machine');
      if (e.gapReasonManpower) reasons.push('Manpower');
      if (e.gapReasonProductionOutput) reasons.push('Production Output');
      const displayGapReason = reasons.length > 0 ? reasons.join(', ') : (e.gapReason || '-');

      return {
        'S.No': idx + 1,
        'Date': e.date ? new Date(e.date).toLocaleDateString() : '',
        'Shift': e.shift || '',
        'Section': e.departmentName || '',
        'Supervisor': e.supervisor || '',
        'Operator Name': e.operatorName || e.operatorPunchNo || '',
        'Punch No': e.operatorPunchNo || '',
        'Part Number': e.partNo || e.part?.partNo || '',
        'Part Name': e.partName || e.part?.partName || '',
        'Cast Wt (kg)': cw || '',
        'Planned Qty': planned,
        'Actual Qty': actual,
        'Gap': gap,
        'Gap Reason': displayGapReason,
        'Rejection Qty': e.rejectionQty || 0,
        'Reason for Rejection': e.reasonForRejection || '',
        'Tonnage (MT)': tonnage,
        'Remark': e.remark || '',
        'Status': e.status || '',
        'Trace ID': e.traceabilityBatchId || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DCF_Operations');
    
    // Add summary sheet
    const summaryRows = [
      { Metric: 'Report Section', Value: selectedSection },
      { Metric: 'Date Range', Value: dateRange.start ? `${dateRange.start} to ${dateRange.end || 'Now'}` : 'All Time' },
      { Metric: 'Total Planned Units', Value: totalPlanned },
      { Metric: 'Total Actual Produced', Value: totalActual },
      { Metric: 'Target Achieved %', Value: `${scheduleAdherence}%` },
      { Metric: 'Total Accepted Units', Value: totalAccepted },
      { Metric: 'Acceptance Rate %', Value: `${acceptanceRate}%` },
      { Metric: 'Total Rejection Units', Value: totalRej },
      { Metric: 'Scrap Rate %', Value: `${scrapRate}%` },
      { Metric: 'Total Gap Units', Value: totalGap },
      { Metric: 'Total Tonnage (MT)', Value: totalTonnage }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'KPI_Summary');

    const fname = `DCF_HOD_Report_${selectedSection.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fname);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      
      {/* ── TOP FILTER & CONTROL BAR ─────────────────────────── */}
      <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', border: '1px solid #d2e5d9', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 15, marginBottom: 15 }}>
          
          {/* Section Selection Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 'bold', color: '#0b462c', marginRight: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Layers size={16} /> Section:
            </span>
            {SECTIONS.map(sec => {
              const isSelected = selectedSection === sec || (sec === 'All Sections' && (!selectedSection || selectedSection === 'All' || selectedSection === 'DCF'));
              return (
                <button
                  key={sec}
                  onClick={() => onSelectSection(sec)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 20,
                    border: isSelected ? '1px solid #0b462c' : '1px solid #c8dfd0',
                    background: isSelected ? '#0b462c' : '#fff',
                    color: isSelected ? '#fff' : '#333',
                    fontSize: 13,
                    fontWeight: isSelected ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 2px 4px rgba(11,70,44,0.2)' : 'none'
                  }}
                >
                  {sec}
                </button>
              );
            })}
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

        {/* Date presets & Filters */}
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
              placeholder="Search part, operator, remark..." 
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
          <div style={{ fontSize: 12, color: '#1565c0', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Target Achieved</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#0d47a1' }}>{scheduleAdherence}%</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Actual: <strong>{totalActual}</strong> / Plan: <strong>{totalPlanned}</strong>
          </div>
          <div style={{ width: '100%', height: 4, background: '#e3f2fd', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, parseFloat(scheduleAdherence))}%`, height: '100%', background: '#1976d2' }} />
          </div>
        </div>

        {/* Card 2: Actual Produced */}
        <div style={{ background: '#fff', border: '1px solid #c8e6c9', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#2e7d32', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Actual Processed</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1b5e20' }}>{totalActual.toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Units across <strong>{filteredEntries.length}</strong> logged runs
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '2px 8px', borderRadius: 10, background: '#e8f5e9', color: '#2e7d32', fontSize: 11, fontWeight: 'bold' }}>
            <CheckCircle size={12} /> Live Recorded
          </div>
        </div>

        {/* Card 3: Accepted Qty & Rate */}
        <div style={{ background: '#fff', border: '1px solid #b2dfdb', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#00796b', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Accepted Rate</div>
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
          <div style={{ fontSize: 12, color: '#c62828', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Scrap Rate</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#b71c1c' }}>{scrapRate}%</div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Total Rejections: <strong>{totalRej.toLocaleString()}</strong> pcs
          </div>
          <div style={{ width: '100%', height: 4, background: '#ffebee', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, parseFloat(scrapRate))}%`, height: '100%', background: '#d32f2f' }} />
          </div>
        </div>

        {/* Card 5: Production Gap */}
        <div style={{ background: '#fff', border: '1px solid #ffe0b2', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#e65100', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Total Deficit Gap</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: totalGap > 0 ? '#b71c1c' : '#2e7d32' }}>
            {totalGap.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Short of target (Units)
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: '2px 8px', borderRadius: 10, background: totalGap > 0 ? '#fff3e0' : '#e8f5e9', color: totalGap > 0 ? '#e65100' : '#2e7d32', fontSize: 11, fontWeight: 'bold' }}>
            {totalGap > 0 ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
            {totalGap > 0 ? 'Attention Needed' : 'On Target'}
          </div>
        </div>

        {/* Card 6: Total Tonnage */}
        <div style={{ background: '#fff', border: '1px solid #d1c4e9', borderRadius: 10, padding: '16px' }}>
          <div style={{ fontSize: 12, color: '#512da8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 6 }}>Total Tonnage</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#311b92' }}>{totalTonnage} <span style={{ fontSize: 16 }}>MT</span></div>
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Casting weight processed
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
            { id: 'master', label: 'Master Operations Log', icon: <Layers size={15} /> },
            { id: 'sections', label: 'Section Comparison', icon: <BarChart2 size={15} /> },
            { id: 'operators', label: 'Operator Leaderboard', icon: <Users size={15} /> },
            { id: 'supervisors', label: 'Supervisor Analysis', icon: <ShieldCheck size={15} /> },
            { id: 'parts', label: 'Part-wise Matrix', icon: <Package size={15} /> },
            { id: 'gap', label: 'Gap Root-Cause Analysis', icon: <AlertTriangle size={15} /> },
            { id: 'trends', label: 'Visual Trends', icon: <TrendingUp size={15} /> }
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

        {/* ── TAB 1: MASTER OPERATIONS LOG ──────────────────── */}
        {activeTab === 'master' && (
          <div style={{ padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>
                Showing <strong>{filteredEntries.length}</strong> operational records
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
                    <th style={{ color: '#fff' }}>Section</th>
                    <th style={{ color: '#fff' }}>Supervisor</th>
                    <th style={{ color: '#fff' }}>Operator Name</th>
                    <th style={{ color: '#fff' }}>Part Number</th>
                    <th style={{ color: '#fff' }}>Part Name</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Planned</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Actual</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Gap</th>
                    <th style={{ color: '#fff' }}>Gap Reason</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejection</th>
                    <th style={{ color: '#fff' }}>Reason for Rej</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Tonnage (MT)</th>
                    <th style={{ color: '#fff' }}>Remark</th>
                    <th style={{ color: '#fff' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={16} style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                        No operational records found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map(e => {
                      const planned = e.plannedQty || e.inputQty || 0;
                      const actual = e.actualQty || e.processedQty || 0;
                      const gap = e.gap !== undefined && e.gap !== null ? e.gap : Math.max(0, planned - actual);
                      const part = e.part || masterParts.find((p: any) => p.partNo === e.partNo || (p.partId && p.partId === e.partId));
                      const cw = Number(part?.castingWeight || 0);
                      const tonnage = ((actual * cw) / 1000).toFixed(3);

                      const reasons: string[] = [];
                      if (e.gapReasonMachine) reasons.push('Machine');
                      if (e.gapReasonManpower) reasons.push('Manpower');
                      if (e.gapReasonProductionOutput) reasons.push('Production Output');
                      const displayGapReason = reasons.length > 0 ? reasons.join(', ') : (e.gapReason || '-');

                      return (
                        <tr key={e.id}>
                          <td>{e.date ? new Date(e.date).toLocaleDateString() : '-'}</td>
                          <td>
                            <span style={{ padding: '2px 6px', borderRadius: 4, background: '#f0f0f0', fontSize: 11, fontWeight: 'bold' }}>
                              {e.shift || '-'}
                            </span>
                          </td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: 12, 
                              background: '#e8f3ed', 
                              color: '#0b462c', 
                              fontSize: 11, 
                              fontWeight: 'bold',
                              border: '1px solid #c8dfd0'
                            }}>
                              {e.departmentName || '-'}
                            </span>
                          </td>
                          <td>{e.supervisor || '-'}</td>
                          <td>
                            <strong>{e.operatorName || '-'}</strong>
                            {e.operatorPunchNo && <span style={{ fontSize: 10, color: '#888', marginLeft: 4 }}>({e.operatorPunchNo})</span>}
                          </td>
                          <td style={{ fontWeight: 'bold', color: '#004d40' }}>{e.partNo || e.part?.partNo || '-'}</td>
                          <td style={{ fontSize: 12 }}>{e.partName || e.part?.partName || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{planned}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{actual}</td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold', color: gap > 0 ? '#b71c1c' : '#2e7d32' }}>
                            {gap}
                          </td>
                          <td style={{ fontSize: 11, color: '#555' }}>{displayGapReason}</td>
                          <td style={{ textAlign: 'right', color: (e.rejectionQty || 0) > 0 ? '#b71c1c' : '#555', fontWeight: (e.rejectionQty || 0) > 0 ? 'bold' : 'normal' }}>
                            {e.rejectionQty || 0}
                          </td>
                          <td style={{ fontSize: 11 }}>{e.reasonForRejection || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500, color: '#4527a0' }}>{tonnage}</td>
                          <td style={{ fontSize: 11, color: '#666', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.remark}>
                            {e.remark || '-'}
                          </td>
                          <td>
                            <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : e.status === 'Returned' ? 'badge-rej-high' : ''}`}>
                              {e.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredEntries.length > 0 && (
                  <tfoot style={{ background: '#f5f9f7', borderTop: '2px solid #0b462c', fontWeight: 'bold' }}>
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'right', padding: '10px 14px' }}>GRAND TOTAL:</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: '#1565c0' }}>{totalPlanned.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: '#0b462c', fontSize: 14 }}>{totalActual.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: totalGap > 0 ? '#b71c1c' : '#2e7d32' }}>{totalGap.toLocaleString()}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: '#b71c1c' }}>{totalRej.toLocaleString()}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', padding: '10px 8px', color: '#4527a0' }}>{totalTonnage} MT</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 2: SECTION COMPARISON ─────────────────────── */}
        {activeTab === 'sections' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={18} /> Performance Across 5 Finishing Sections
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 15, marginBottom: 25 }}>
              {sectionStats.map(s => (
                <div key={s.section} style={{ background: '#fff', border: '1px solid #d2e5d9', borderRadius: 8, padding: 15, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontSize: 15, color: '#0b462c' }}>{s.section}</strong>
                    <span style={{ fontSize: 11, background: '#e8f3ed', color: '#0b462c', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>
                      {s.count} logs
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 10 }}>
                    <div>Planned: <strong>{s.planned}</strong></div>
                    <div>Actual: <strong style={{ color: '#0b462c' }}>{s.actual}</strong></div>
                    <div>Gap: <strong style={{ color: s.gap > 0 ? '#b71c1c' : '#2e7d32' }}>{s.gap}</strong></div>
                    <div>Rejection: <strong style={{ color: s.rej > 0 ? '#b71c1c' : '#555' }}>{s.rej}</strong></div>
                    <div>Adherence: <strong style={{ color: '#1565c0' }}>{s.adherence}%</strong></div>
                    <div>Scrap %: <strong style={{ color: '#c62828' }}>{s.scrapRate}%</strong></div>
                  </div>

                  <div style={{ fontSize: 11, color: '#666', borderTop: '1px solid #eee', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tonnage: <strong>{s.tonnage} MT</strong></span>
                    <span>Top Defect: <strong>{s.topDefect}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Table format */}
            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Section</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Total Planned</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Total Actual</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Target Achieved %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Gap (Units)</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap Rate %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Tonnage (MT)</th>
                    <th style={{ color: '#fff' }}>Top Rejection Defect</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionStats.map(s => (
                    <tr key={s.section}>
                      <td><strong style={{ color: '#0b462c' }}>{s.section}</strong></td>
                      <td style={{ textAlign: 'right' }}>{s.planned}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{s.actual}</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{s.adherence}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: s.gap > 0 ? '#b71c1c' : '#2e7d32' }}>{s.gap}</td>
                      <td style={{ textAlign: 'right', color: s.rej > 0 ? '#b71c1c' : '#333' }}>{s.rej}</td>
                      <td style={{ textAlign: 'right', color: '#c62828', fontWeight: 'bold' }}>{s.scrapRate}%</td>
                      <td style={{ textAlign: 'right', color: '#4527a0', fontWeight: 'bold' }}>{s.tonnage}</td>
                      <td>{s.topDefect}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: OPERATOR LEADERBOARD ───────────────────── */}
        {activeTab === 'operators' && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h4 style={{ margin: 0, color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={18} /> Operator Performance Rankings
              </h4>
            </div>

            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff', width: 60 }}>Rank</th>
                    <th style={{ color: '#fff' }}>Operator Name</th>
                    <th style={{ color: '#fff' }}>Punch No</th>
                    <th style={{ color: '#fff' }}>Section</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Planned</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Actual Produced</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Adherence %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Gap</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap Rate %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Tonnage (MT)</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorStats.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 30, color: '#888' }}>No operator logs found.</td></tr>
                  ) : (
                    operatorStats.map((op, idx) => (
                      <tr key={op.name}>
                        <td style={{ textAlign: 'center', fontSize: 16 }}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                        </td>
                        <td><strong>{op.name}</strong></td>
                        <td>{op.punchNo}</td>
                        <td>
                          <span style={{ padding: '2px 6px', borderRadius: 4, background: '#e8f3ed', color: '#0b462c', fontSize: 11, fontWeight: 'bold' }}>
                            {op.section || '-'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{op.planned}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{op.actual}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{op.adherence}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: op.gap > 0 ? '#b71c1c' : '#2e7d32' }}>{op.gap}</td>
                        <td style={{ textAlign: 'right', color: op.rej > 0 ? '#b71c1c' : '#555' }}>{op.rej}</td>
                        <td style={{ textAlign: 'right', color: '#c62828', fontWeight: 'bold' }}>{op.scrapRate}%</td>
                        <td style={{ textAlign: 'right', color: '#4527a0', fontWeight: 'bold' }}>{op.tonnage}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: SUPERVISOR ANALYSIS ────────────────────── */}
        {activeTab === 'supervisors' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} /> Supervisor Shift Performance
            </h4>

            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Supervisor</th>
                    <th style={{ color: '#fff', textAlign: 'center' }}>Shifts Logged</th>
                    <th style={{ color: '#fff', textAlign: 'center' }}>Shift A / B</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Planned</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Actual Output</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Adherence %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Total Gap</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap Rate %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Tonnage (MT)</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorStats.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: 30, color: '#888' }}>No supervisor logs found.</td></tr>
                  ) : (
                    supervisorStats.map(sup => (
                      <tr key={sup.name}>
                        <td><strong>{sup.name}</strong></td>
                        <td style={{ textAlign: 'center' }}>{sup.shiftsCount}</td>
                        <td style={{ textAlign: 'center', fontSize: 12 }}>A: {sup.shiftA} | B: {sup.shiftB}</td>
                        <td style={{ textAlign: 'right' }}>{sup.planned}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{sup.actual}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{sup.adherence}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: sup.gap > 0 ? '#b71c1c' : '#2e7d32' }}>{sup.gap}</td>
                        <td style={{ textAlign: 'right', color: sup.rej > 0 ? '#b71c1c' : '#555' }}>{sup.rej}</td>
                        <td style={{ textAlign: 'right', color: '#c62828', fontWeight: 'bold' }}>{sup.scrapRate}%</td>
                        <td style={{ textAlign: 'right', color: '#4527a0', fontWeight: 'bold' }}>{sup.tonnage}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: PART-WISE MATRIX ───────────────────────── */}
        {activeTab === 'parts' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Package size={18} /> Part-wise Finishing & Scrap Matrix
            </h4>

            <div className="table-wrapper">
              <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ background: '#0b462c', color: '#fff' }}>
                    <th style={{ color: '#fff' }}>Part Number</th>
                    <th style={{ color: '#fff' }}>Part Name</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Cast Wt (kg)</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Total Planned</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Total Actual</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Adherence %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Gap (Units)</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Rejections</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Scrap Rate %</th>
                    <th style={{ color: '#fff', textAlign: 'right' }}>Tonnage (MT)</th>
                    <th style={{ color: '#fff' }}>Top Defect Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {partStats.length === 0 ? (
                    <tr><td colSpan={11} style={{ textAlign: 'center', padding: 30, color: '#888' }}>No part logs found.</td></tr>
                  ) : (
                    partStats.map(p => (
                      <tr key={p.partNo}>
                        <td style={{ fontWeight: 'bold', color: '#004d40' }}>{p.partNo}</td>
                        <td>{p.partName}</td>
                        <td style={{ textAlign: 'right' }}>{p.castingWeight || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{p.planned}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>{p.actual}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1565c0' }}>{p.adherence}%</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: p.gap > 0 ? '#b71c1c' : '#2e7d32' }}>{p.gap}</td>
                        <td style={{ textAlign: 'right', color: p.rej > 0 ? '#b71c1c' : '#555' }}>{p.rej}</td>
                        <td style={{ textAlign: 'right', color: '#c62828', fontWeight: 'bold' }}>{p.scrapRate}%</td>
                        <td style={{ textAlign: 'right', color: '#4527a0', fontWeight: 'bold' }}>{p.tonnage}</td>
                        <td>{p.topDefect}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 6: GAP ROOT-CAUSE ANALYSIS ─────────────────── */}
        {activeTab === 'gap' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} /> Root-Cause Analysis: Machine vs Manpower vs Production Output
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 15, marginBottom: 25 }}>
              
              {/* Machine Breakdown */}
              <div style={{ background: '#fff', border: '1px solid #ffcc80', borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, color: '#e65100', fontWeight: 'bold', textTransform: 'uppercase' }}>Machine Issues</div>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#e65100', margin: '8px 0' }}>{gapStats.machine.units} <span style={{ fontSize: 14 }}>units</span></div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  <strong>{gapStats.machine.pct}%</strong> of total deficit ({gapStats.machine.count} logs)
                </div>
                <div style={{ width: '100%', height: 6, background: '#ffe0b2', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${gapStats.machine.pct}%`, height: '100%', background: '#f57c00' }} />
                </div>
              </div>

              {/* Manpower Shortage */}
              <div style={{ background: '#fff', border: '1px solid #90caf9', borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, color: '#1565c0', fontWeight: 'bold', textTransform: 'uppercase' }}>Manpower Deficit</div>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1565c0', margin: '8px 0' }}>{gapStats.manpower.units} <span style={{ fontSize: 14 }}>units</span></div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  <strong>{gapStats.manpower.pct}%</strong> of total deficit ({gapStats.manpower.count} logs)
                </div>
                <div style={{ width: '100%', height: 6, background: '#bbdefb', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${gapStats.manpower.pct}%`, height: '100%', background: '#1976d2' }} />
                </div>
              </div>

              {/* Production Output / Material Shortage */}
              <div style={{ background: '#fff', border: '1px solid #b0bec5', borderRadius: 8, padding: 18 }}>
                <div style={{ fontSize: 13, color: '#37474f', fontWeight: 'bold', textTransform: 'uppercase' }}>Production Output Deficit</div>
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#37474f', margin: '8px 0' }}>{gapStats.output.units} <span style={{ fontSize: 14 }}>units</span></div>
                <div style={{ fontSize: 12, color: '#555' }}>
                  <strong>{gapStats.output.pct}%</strong> of total deficit ({gapStats.output.count} logs)
                </div>
                <div style={{ width: '100%', height: 6, background: '#cfd8dc', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${gapStats.output.pct}%`, height: '100%', background: '#546e7a' }} />
                </div>
              </div>

            </div>

            {/* Explanatory summary */}
            <div style={{ background: '#f5f9f7', border: '1px solid #d2e5d9', borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 'bold', color: '#0b462c', marginBottom: 6 }}>Root-Cause Insights:</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#444', lineHeight: 1.6 }}>
                <li>Total production shortage across filtered period: <strong>{gapStats.totalLost.toLocaleString()} units</strong>.</li>
                <li>Primary driver of operational shortfall: <strong>{
                  parseFloat(gapStats.machine.pct) >= parseFloat(gapStats.manpower.pct) && parseFloat(gapStats.machine.pct) >= parseFloat(gapStats.output.pct)
                    ? 'Machine Breakdown / Tooling issues'
                    : parseFloat(gapStats.manpower.pct) >= parseFloat(gapStats.output.pct)
                    ? 'Manpower absenteeism / Operator shortage'
                    : 'Upstream Production Output / Inflow shortfall'
                }</strong>.</li>
                <li>Review supervisor shift logs to address machine downtime maintenance or reallocate finishing crew accordingly.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ── TAB 7: VISUAL TRENDS & CHARTS ─────────────────── */}
        {activeTab === 'trends' && (
          <div style={{ padding: 20 }}>
            <h4 style={{ margin: '0 0 15px', color: '#0b462c', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} /> Daily Production Output & Defect Trajectory
            </h4>

            {trendData.labels.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                Not enough date records to plot trend trajectory. Log more entries across dates.
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
                        title: { display: true, text: 'Quantity (Units)' }
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
