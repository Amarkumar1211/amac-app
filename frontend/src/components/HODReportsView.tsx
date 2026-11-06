import React, { useState, useMemo } from 'react';
import { Download, FileText, Search, RefreshCw, ScanBarcode, UserCog, Cylinder, Blocks, Focus, Filter, Users, X, TrendingUp, BarChart2, Award, AlertTriangle, Wrench, Package, Zap, Info, Clock, Table } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, Title, Tooltip, Legend } from 'chart.js';
import { defaultMasterPartsData } from '../data';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, BarController, Title, Tooltip, Legend);

// Custom Chart.js Plugin: Always display permanent numeric data labels above chart points
const alwaysShowDataLabelsPlugin = {
    id: 'alwaysShowDataLabels',
    afterDatasetsDraw(chart: any) {
        // Only draw on-canvas label when 1 metric is active to keep multi-metric view uncluttered
        if (!chart.data.datasets || chart.data.datasets.length !== 1) return;
        const { ctx } = chart;
        const dataset = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        if (!meta || meta.hidden) return;
        meta.data.forEach((element: any, index: number) => {
            const val = dataset.data[index];
            if (val == null || isNaN(val)) return;
            const text = dataset.__isPercentage ? `${val}%` : `${val}`;
            ctx.save();
            ctx.font = 'bold 11px Inter, system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const textWidth = ctx.measureText(text).width;
            const x = element.x;
            const y = element.y - 8;

            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x - textWidth / 2 - 6, y - 14, textWidth + 12, 18, 4);
            } else {
                ctx.rect(x - textWidth / 2 - 6, y - 14, textWidth + 12, 18);
            }
            ctx.fill();

            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = dataset.borderColor || '#0b462c';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = dataset.borderColor || '#0f172a';
            ctx.fillText(text, x, y - 1);
            ctx.restore();
        });
    }
};

const trendOptions = [
    { id: 'planned_qty', label: 'Total Planned Qty' },
    { id: 'produced_qty', label: 'Total Produced Qty' },
    { id: 'gap', label: 'Total Gap (Units)' },
    { id: 'rejection', label: 'Rejection %' },
    { id: 'schedule', label: 'Target Achieved %' },
    { id: 'fpy', label: 'Accepted Qty %' },
    { id: 'efficiency', label: 'OEE %' },
    { id: 'tonnage', label: 'Total Tonnage' }
];

export default function HODReportsView({ entries, operators = [], masterParts = [] }: { entries: any[], operators?: any[], masterParts?: any[] }) {
    const [dateRange, setDateRange] = useState({ start: '', end: '' });
    const [activeTab, setActiveTab] = useState<'master' | 'operator' | 'supervisor' | 'machine' | 'die' | 'trends' | 'performance'>('master');
    const [perfSubTab, setPerfSubTab] = useState<'machine' | 'operator' | 'die' | 'part' | 'gap'>('machine');
    const [selectedTrends, setSelectedTrends] = useState<string[]>(['rejection']);
    const [compareMode, setCompareMode] = useState<boolean>(false);
    const [kpiDate, setKpiDate] = useState<string | null>(null);
    const [showAllKpis, setShowAllKpis] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth >= 768);
    const [masterSearch, setMasterSearch] = useState<string>('');
    const [selectedTrendDate, setSelectedTrendDate] = useState<string | null>(null);
    const [activeKpiModal, setActiveKpiModal] = useState<string | null>(null);
    const [kpiModalTab, setKpiModalTab] = useState<'trend' | 'machine' | 'operator'>('trend');
    const [kpiModalFilter, setKpiModalFilter] = useState<{
        type: 'date' | 'machine' | 'operator';
        key: string;
        label: string;
    } | null>(null);
    const [kpiModalSearch, setKpiModalSearch] = useState<string>('');

    const filteredEntries = useMemo(() => {
        return entries.filter(e => {
            if (dateRange.start && new Date(e.date) < new Date(dateRange.start)) return false;
            if (dateRange.end && new Date(e.date) > new Date(dateRange.end)) return false;
            return true;
        });
    }, [entries, dateRange]);

    const searchedMasterEntries = useMemo(() => {
        if (!masterSearch.trim()) return filteredEntries;
        const q = masterSearch.toLowerCase().trim();
        return filteredEntries.filter(e => {
            const partInfo = getPartInfo(e);
            const opName = getOperatorName(e.operatorPunchNo).toLowerCase();
            const supName = getSupervisorName(e.operatorPunchNo).toLowerCase();
            const traceId = (e.traceabilityBatchId || '').toLowerCase();
            const mcNo = (e.machineNumber || '').toString().toLowerCase();
            const partNo = (partInfo.partNo || '').toLowerCase();
            const partName = (partInfo.partName || '').toLowerCase();
            return traceId.includes(q) || mcNo.includes(q) || partNo.includes(q) || partName.includes(q) || opName.includes(q) || supName.includes(q);
        });
    }, [filteredEntries, masterSearch, operators, masterParts]);

    const resetFilters = () => setDateRange({ start: '', end: '' });

    const setToday = () => {
        const today = new Date().toISOString().split('T')[0];
        setDateRange({ start: today, end: today });
    };

    const setThisWeek = () => {
        const curr = new Date();
        const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); // Monday as first day
        const firstDay = new Date(curr.setDate(first)).toISOString().split('T')[0];
        const lastDay = new Date(curr.setDate(first + 6)).toISOString().split('T')[0];
        setDateRange({ start: firstDay, end: lastDay });
    };

    const setThisMonth = () => {
        const curr = new Date();
        const firstDay = new Date(curr.getFullYear(), curr.getMonth(), 2).toISOString().split('T')[0]; // Quick timezone fix to avoid jumping to prev month
        const actualFirstDay = new Date(curr.getFullYear(), curr.getMonth(), 1, 12, 0, 0).toISOString().split('T')[0];
        const actualLastDay = new Date(curr.getFullYear(), curr.getMonth() + 1, 0, 12, 0, 0).toISOString().split('T')[0];
        setDateRange({ start: actualFirstDay, end: actualLastDay });
    };

    const getEffectivePlanned = (e: any): number => {
        if (e.plannedQty && e.plannedQty > 0) return Number(e.plannedQty);
        if (e.actualQty === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE')) || (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-')))) {
            const partInfo = getPartInfo(e);
            const part = e.part || masterParts?.find((p: any) => (p.partNo && partInfo.partNo && p.partNo.trim().toLowerCase() === partInfo.partNo.trim().toLowerCase()));
            if (part?.productionOutputPerMachine && part.productionOutputPerMachine > 0) {
                return Math.ceil(part.productionOutputPerMachine / 2);
            }
            if (part?.cycleTime && part.cycleTime > 0) {
                return Math.round(27000 / part.cycleTime);
            }
            return 180;
        }
        return Number(e.plannedQty) || 0;
    };

    const getEffectiveGap = (e: any): number => {
        const plan = getEffectivePlanned(e);
        const act = Number(e.actualQty) || 0;
        if (e.gap && e.gap > 0) return Number(e.gap);
        return Math.max(0, plan - act);
    };

    const totalPlanned = filteredEntries.reduce((sum, e) => sum + getEffectivePlanned(e), 0);
    const totalActual = filteredEntries.reduce((sum, e) => sum + (e.actualQty || 0), 0);
    const totalRej = filteredEntries.reduce((sum, e) => sum + (e.rejectionQty || 0), 0);
    const totalAccepted = Math.max(0, totalActual - totalRej);
    const totalGap = filteredEntries.reduce((sum, e) => sum + getEffectiveGap(e), 0);

    const scheduleAdherence = totalPlanned > 0 ? ((totalActual / totalPlanned) * 100).toFixed(1) : '0.0';
    const fpy = totalActual > 0 ? ((totalAccepted / totalActual) * 100).toFixed(1) : '0.0';
    const scrapRate = totalActual > 0 ? ((totalRej / totalActual) * 100).toFixed(1) : '0.0';

    // ── OEE Calculation ─────────────────────────────────────────────────────────
    // OEE = Availability × Performance Rate × Quality Rate
    //
    // Availability:    ((Total Machine Shifts − Downtime Shifts) / Total Machine Shifts) × 100
    //                   Each entry = 1 machine-shift (10 hrs planned).
    //                   A machine issue / DOWN entry = full shift lost.
    //
    // Performance Rate: (Total Actual Produced / Total Planned) × 100
    //
    // Quality Rate:     Fixed at 100% (per operational definition)
    //
    // OEE (%) = (Avail/100) × (Perf/100) × (Quality/100) × 100
    // ────────────────────────────────────────────────────────────────────────────
    const totalMachineShifts = filteredEntries.length;
    const downtimeShifts = filteredEntries.filter(e =>
        (Number(e.actualQty) === 0) &&
        (
            e.gapReasonMachineBreakdown ||
            (e.remark && e.remark.includes('[MACHINE ISSUE')) ||
            (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))
        )
    ).length;
    const workingShifts = totalMachineShifts - downtimeShifts;
    // 10 hrs per shift; breakdown time = downtimeShifts × 10 hrs
    const oeeAvailability = totalMachineShifts > 0 ? (workingShifts / totalMachineShifts) * 100 : 0;
    const oeePerformance = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
    const oeeQuality = 100; // Quality Rate = 100% as specified
    const oeeValue = (oeeAvailability / 100) * (oeePerformance / 100) * (oeeQuality / 100) * 100;
    const avgEff = oeeValue.toFixed(1);  // kept as `avgEff` for compatibility with rest of code

    const totalTonnageKg = filteredEntries.reduce((sum, e) => {
        const part = e.part || masterParts?.find((p: any) => (p.partId && p.partId === e.partId) || (p.id && p.partId && p.id === e.partId));
        const cw = Number(e.part?.castingWeight || part?.castingWeight || 0);
        return sum + ((e.actualQty || 0) * cw);
    }, 0);
    const totalTonnage = (totalTonnageKg / 1000).toFixed(2);

    const totalPlannedTonnageKg = filteredEntries.reduce((sum, e) => {
        const part = e.part || masterParts?.find((p: any) => (p.partId && p.partId === e.partId) || (p.id && p.partId && p.id === e.partId));
        const cw = Number(e.part?.castingWeight || part?.castingWeight || 0);
        return sum + (getEffectivePlanned(e) * cw);
    }, 0);
    const totalPlannedTonnage = (totalPlannedTonnageKg / 1000).toFixed(2);
    const totalGapTonnageKg = Math.max(0, totalPlannedTonnageKg - totalTonnageKg);
    const totalGapTonnage = (totalGapTonnageKg / 1000).toFixed(2);

    const activeMachinesCount = filteredEntries.filter(e => (e.actualQty || 0) > 0).length;
    const totalEntriesCount = filteredEntries.length;

    const kpiSections: Array<{
        id: string;
        title: string;
        value: string;
        unit?: string;
        tonnageValue?: string;
        subValue: string;
        extraTag?: { text: string; bg: string; color: string; border?: string };
        tooltip?: string;
        bg: string;
        border: string;
        titleColor: string;
        valColor: string;
        themeColor: string;
    }> = [
            {
                id: 'planned_qty',
                title: 'Total Planned',
                value: `${totalPlanned}`,
                unit: 'Units',
                tonnageValue: `${totalPlannedTonnage} MT (${Math.round(totalPlannedTonnageKg)} kg)`,
                subValue: `(${totalActual} prod + ${totalGap} gap)`,
                tooltip: `Total Planned Target: ${totalPlanned} Units | Planned Tonnage: ${totalPlannedTonnage} MT (${Math.round(totalPlannedTonnageKg).toLocaleString()} kg)`,
                bg: '#fff9f0',
                border: '#fed7aa',
                titleColor: '#c2410c',
                valColor: '#9a3412',
                themeColor: '#ea580c'
            },
            {
                id: 'produced_qty',
                title: 'Total Produced',
                value: `${totalActual}`,
                unit: 'Units',
                tonnageValue: `${totalTonnage} MT (${Math.round(totalTonnageKg)} kg)`,
                subValue: `(${totalAccepted} acc / ${totalRej} rej)`,
                tooltip: `Total Produced: ${totalActual} Units (${scheduleAdherence}% of ${totalPlanned} planned) | Actual Tonnage: ${totalTonnage} MT (${Math.round(totalTonnageKg).toLocaleString()} kg)`,
                bg: '#f0fdf4',
                border: '#bbf7d0',
                titleColor: '#15803d',
                valColor: '#166534',
                themeColor: '#16a34a'
            },
            {
                id: 'gap',
                title: 'Total Gap',
                value: `${totalGap}`,
                unit: 'Units',
                tonnageValue: totalGapTonnageKg > 0 ? `${totalGapTonnage} MT gap` : undefined,
                subValue: `(${totalGap}/${totalPlanned})`,
                extraTag: totalGap > 0 ? { text: `180 M2 down`, bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' } : undefined,
                tooltip: `Total Production Gap: ${totalGap} Units (${totalGap} shortfall of ${totalPlanned} planned units) | ${totalGapTonnage} MT shortfall`,
                bg: '#fff7ed',
                border: '#ffedd5',
                titleColor: '#c2410c',
                valColor: '#c2410c',
                themeColor: '#ea580c'
            },
            {
                id: 'rejection',
                title: 'Rejection Rate',
                value: `${scrapRate}%`,
                tonnageValue: `${totalRej} scrap units`,
                subValue: `(${totalRej}/${totalActual})`,
                tooltip: `Rejection Rate: ${scrapRate}% (${totalRej} rejected scrap of ${totalActual} actual produced)`,
                bg: '#fef2f2',
                border: '#fee2e2',
                titleColor: '#b91c1c',
                valColor: '#dc2626',
                themeColor: '#ef4444'
            },
            {
                id: 'schedule',
                title: 'Target Achieved',
                value: `${scheduleAdherence}%`,
                tonnageValue: `(${totalActual}/${totalPlanned})`,
                subValue: `(${totalActual}/${totalPlanned} units)`,
                tooltip: `Target Achieved: ${scheduleAdherence}% (${totalActual} produced of ${totalPlanned} planned units)`,
                bg: '#f8fbff',
                border: '#c3e0ff',
                titleColor: '#1565c0',
                valColor: '#0d47a1',
                themeColor: '#0d47a1'
            },
            {
                id: 'fpy',
                title: 'Accepted Qty',
                value: `${fpy}%`,
                tonnageValue: `${totalAccepted} good units`,
                subValue: `(${totalAccepted}/${totalActual})`,
                tooltip: `Accepted Qty (FPY Yield): ${fpy}% (${totalAccepted} good accepted of ${totalActual} actual produced)`,
                bg: '#f0fdfa',
                border: '#ccfbf1',
                titleColor: '#0f766e',
                valColor: '#0d9488',
                themeColor: '#14b8a6'
            },
            {
                id: 'efficiency',
                title: 'OEE',
                value: `${avgEff}%`,
                tonnageValue: `Target: ≥85%`,
                subValue: `A:${oeeAvailability.toFixed(0)}% × P:${oeePerformance.toFixed(0)}% × Q:100%`,
                tooltip: `OEE = ${avgEff}% | Availability: ${oeeAvailability.toFixed(1)}% (${workingShifts} working / ${totalMachineShifts} total shifts · ${downtimeShifts} breakdown shift${downtimeShifts !== 1 ? 's' : ''} @ 10 hrs each) | Performance: ${oeePerformance.toFixed(1)}% (${totalActual} produced / ${totalPlanned} planned) | Quality: 100% | Formula: (${oeeAvailability.toFixed(1)}/100) × (${oeePerformance.toFixed(1)}/100) × 1.0 = ${avgEff}%`,
                bg: '#f8fafc',
                border: '#e2e8f0',
                titleColor: '#334155',
                valColor: oeeValue >= 85 ? '#15803d' : oeeValue >= 60 ? '#0f172a' : '#b91c1c',
                themeColor: '#475569'
            }
        ];

    const handleKpiCardClick = (metricId: string, event?: React.MouseEvent) => {
        const isMulti = compareMode || (event && (event.ctrlKey || event.metaKey || event.shiftKey));
        if (activeTab === 'trends') {
            if (isMulti) {
                if (selectedTrends.includes(metricId)) {
                    if (selectedTrends.length > 1) {
                        setSelectedTrends(selectedTrends.filter(id => id !== metricId));
                    }
                } else {
                    setSelectedTrends([...selectedTrends, metricId]);
                }
            } else {
                setSelectedTrends([metricId]);
            }
        }
        // Open Dedicated KPI Graphical Analysis & Drilldown Modal
        setActiveKpiModal(metricId);
        setKpiModalTab('trend');
        setKpiModalFilter(null);
        setKpiModalSearch('');
    };

    const getGapReasons = (e: any) => {
        const reasons = [];
        const plan = getEffectivePlanned(e);
        const getHrs = (q: number) => {
            if (plan <= 0 || q <= 0) return '';
            const exact = (q / plan) * 10;
            return ` (~${exact % 1 === 0 ? exact : exact.toFixed(1)}h)`;
        };

        if (e.gapQtyManPower || e.gapReasonManPower) {
            const qty = e.gapQtyManPower ? `: ${e.gapQtyManPower} pcs${getHrs(e.gapQtyManPower)}` : '';
            const sub = e.gapSubReasonManPower ? ` - ${e.gapSubReasonManPower}` : '';
            reasons.push(`Man Power${sub}${qty}`);
        }
        if (e.gapQtyMachineBreakdown || e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE')) || (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))) {
            const bdQty = e.gapQtyMachineBreakdown || getEffectiveGap(e);
            const qty = bdQty ? `: ${bdQty} pcs${getHrs(bdQty)}` : '';
            const sub = e.gapSubReasonMachineBreakdown ? ` - ${e.gapSubReasonMachineBreakdown}` : (e.gapReasonMachineBreakdown ? ` - ${e.gapReasonMachineBreakdown}` : '');
            reasons.push(`Breakdown${sub}${qty}`);
        }
        if (e.gapQtyMaterialShortage || e.gapReasonMaterialShortage) {
            const qty = e.gapQtyMaterialShortage ? `: ${e.gapQtyMaterialShortage} pcs${getHrs(e.gapQtyMaterialShortage)}` : '';
            const sub = e.gapSubReasonMaterialShortage ? ` - ${e.gapSubReasonMaterialShortage}` : '';
            reasons.push(`Material Shortage${sub}${qty}`);
        }
        if (e.gapQtyMethod || e.gapReasonMethod) {
            const qty = e.gapQtyMethod ? `: ${e.gapQtyMethod} pcs${getHrs(e.gapQtyMethod)}` : '';
            const sub = e.gapSubReasonMethod ? ` - ${e.gapSubReasonMethod}` : '';
            reasons.push(`Method${sub}${qty}`);
        }
        return reasons.join('; ') || (e.gapReason || '-');
    };

    const getRejectionReasons = (e: any) => {
        if (!e.reasonForRejection) return '';
        try {
            const parsed = JSON.parse(e.reasonForRejection);
            if (Array.isArray(parsed)) {
                return parsed.map((r: any) => `${r.reason}(${r.qty})`).join(', ');
            }
            return e.reasonForRejection;
        } catch {
            return e.reasonForRejection;
        }
    };

    const getOperator = (punchNo: string) => {
        if (!punchNo) return null;
        const clean = String(punchNo).trim().toLowerCase();
        return operators?.find((o: any) =>
            String(o.punchNo || '').trim().toLowerCase() === clean ||
            String(o.aliasLetter || '').trim().toLowerCase() === clean ||
            String(o.name || '').trim().toLowerCase() === clean
        );
    };

    const getOperatorName = (punchNo: string) => {
        const op = getOperator(punchNo);
        return op?.name || punchNo || '-';
    };

    const getSupervisorName = (punchNo: string) => {
        const op = getOperator(punchNo);
        return op?.supervisor?.name || 'Unassigned';
    };

    const getPartInfo = (e: any) => {
        const rawPartNo = e.part?.partNo || e.partNo || '';
        const rawPartId = e.partId || e.part?.id;
        const part = e.part || masterParts?.find((p: any) =>
            (rawPartId && (p.partId === rawPartId || p.id === rawPartId)) ||
            (p.partNo && rawPartNo && String(p.partNo).trim().toLowerCase() === String(rawPartNo).trim().toLowerCase())
        );

        let partNo = e.part?.partNo || part?.partNo || e.partNo || '';
        let partName = e.part?.partName || part?.partName || e.partName || '';

        if (!partName || partName === '-') {
            const defaultPart = defaultMasterPartsData.find(dp =>
                (partNo && dp.part_number.trim().toLowerCase() === String(partNo).trim().toLowerCase()) ||
                (rawPartNo && dp.part_number.trim().toLowerCase() === String(rawPartNo).trim().toLowerCase())
            );
            if (defaultPart) {
                partName = defaultPart.part_name;
                if (!partNo || partNo === '-') partNo = defaultPart.part_number;
            }
        }

        return {
            partNo: partNo || '-',
            partName: partName || '-',
            shotWeight: (e.part?.shotWeight != null && e.part?.shotWeight !== '')
                ? e.part.shotWeight
                : (part?.shotWeight != null && part?.shotWeight !== '')
                    ? part.shotWeight
                    : '-',
            castingWeight: (e.part?.castingWeight != null && e.part?.castingWeight !== '')
                ? e.part.castingWeight
                : (part?.castingWeight != null && part?.castingWeight !== '')
                    ? part.castingWeight
                    : '-'
        };
    };

    const getPerfBadge = (eff: number, rejRate: number) => {
        if (eff >= 90 && rejRate <= 3) return { label: 'High', color: '#1b5e20', bg: '#e8f5e9', border: '#a5d6a7' };
        if (eff >= 75 || rejRate <= 7) return { label: 'Medium', color: '#e65100', bg: '#fff3e0', border: '#ffcc80' };
        return { label: 'Low', color: '#b71c1c', bg: '#ffebee', border: '#ef9a9a' };
    };

    const performanceData = useMemo(() => {
        // 1. Machine Aggregation
        const machineMap: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const m = e.machineNumber || 'Unknown';
            if (!machineMap[m]) {
                machineMap[m] = {
                    machineNumber: m,
                    planned: 0,
                    actual: 0,
                    rejected: 0,
                    effSum: 0,
                    count: 0,
                    gap: 0,
                    tonnage: 0,
                    operators: new Set(),
                    dies: new Set()
                };
            }
            const item = machineMap[m];
            const planned = getEffectivePlanned(e);
            const actual = Number(e.actualQty) || 0;
            const rej = Number(e.rejectionQty) || 0;
            const eff = planned > 0 ? ((actual / planned) * 100) : (Number(e.efficiency) || 0);
            const gap = getEffectiveGap(e);
            const partInfo = getPartInfo(e);
            const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;
            const tonnage = (cw * actual) / 1000;

            item.planned += planned;
            item.actual += actual;
            item.rejected += rej;
            item.effSum += eff;
            item.count += 1;
            item.gap += gap;
            item.tonnage += tonnage;
            if (e.operatorPunchNo) item.operators.add(e.operatorPunchNo);
            if (e.dieNo) item.dies.add(e.dieNo);
        });

        const machineList = Object.values(machineMap).map((m: any) => {
            const accepted = m.actual - m.rejected;
            const rejRate = m.actual > 0 ? (m.rejected / m.actual) * 100 : 0;
            const avgEff = m.planned > 0 ? (m.actual / m.planned) * 100 : (m.count > 0 ? m.effSum / m.count : 0);
            const targetAchieved = m.planned > 0 ? (m.actual / m.planned) * 100 : 0;
            return { ...m, accepted, rejRate, avgEff, targetAchieved };
        }).sort((a: any, b: any) => b.avgEff - a.avgEff);

        // 2. Operator Aggregation
        const operatorMap: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const punch = String(e.operatorPunchNo || '').trim() || 'Unknown';
            if (!operatorMap[punch]) {
                operatorMap[punch] = { punchNo: punch, planned: 0, actual: 0, rejected: 0, effSum: 0, count: 0, gap: 0 };
            }
            const item = operatorMap[punch];
            const planned = getEffectivePlanned(e);
            const actual = Number(e.actualQty) || 0;
            const rej = Number(e.rejectionQty) || 0;
            const eff = planned > 0 ? ((actual / planned) * 100) : (Number(e.efficiency) || 0);
            const gap = getEffectiveGap(e);

            item.planned += planned;
            item.actual += actual;
            item.rejected += rej;
            item.effSum += eff;
            item.count += 1;
            item.gap += gap;
        });

        const operatorList = Object.values(operatorMap).map((op: any) => {
            const name = getOperatorName(op.punchNo);
            const supervisor = getSupervisorName(op.punchNo);
            const accepted = op.actual - op.rejected;
            const rejRate = op.actual > 0 ? (op.rejected / op.actual) * 100 : 0;
            const avgEff = op.planned > 0 ? (op.actual / op.planned) * 100 : (op.count > 0 ? op.effSum / op.count : 0);
            const targetAchieved = op.planned > 0 ? (op.actual / op.planned) * 100 : 0;
            return { ...op, name, supervisor, accepted, rejRate, avgEff, targetAchieved };
        }).sort((a: any, b: any) => b.avgEff - a.avgEff);

        // 3. Die Aggregation
        const dieMap: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const die = String(e.dieNo || '').trim() || 'Unknown';
            if (!dieMap[die]) {
                dieMap[die] = { dieNo: die, parts: new Map<string, string>(), planned: 0, produced: 0, rejected: 0, effSum: 0, count: 0, gap: 0 };
            }
            const item = dieMap[die];
            const planned = getEffectivePlanned(e);
            const actual = Number(e.actualQty) || 0;
            const rej = Number(e.rejectionQty) || 0;
            const eff = planned > 0 ? ((actual / planned) * 100) : (Number(e.efficiency) || 0);
            const gap = getEffectiveGap(e);
            const partInfo = getPartInfo(e);
            const pNo = partInfo.partNo && partInfo.partNo !== '-' ? partInfo.partNo : (e.part?.partNo || '-');
            const pName = partInfo.partName && partInfo.partName !== '-' ? partInfo.partName : (e.part?.partName || '');

            item.planned += planned;
            item.produced += actual;
            item.rejected += rej;
            item.effSum += eff;
            item.count += 1;
            item.gap += gap;
            if (pNo && pNo !== '-') {
                item.parts.set(pNo, pName);
            }
        });

        const dieList = Object.values(dieMap).map((d: any) => {
            const rejRate = d.produced > 0 ? (d.rejected / d.produced) * 100 : 0;
            const avgEff = d.planned > 0 ? (d.produced / d.planned) * 100 : (d.count > 0 ? d.effSum / d.count : 0);
            const targetAchieved = d.planned > 0 ? (d.produced / d.planned) * 100 : 0;
            const partsArray = Array.from((d.parts as Map<string, string>).entries());
            const partNos = partsArray.length === 0 ? '-' : partsArray.map(([pNo]) => pNo).join(', ');
            const partNames = partsArray.length === 0 ? '-' : partsArray.map(([_, pName]) => pName || '-').join(', ');
            return { ...d, rejRate, avgEff, targetAchieved, partNos, partNames };
        }).sort((a: any, b: any) => a.rejRate - b.rejRate);

        // 4. Part Name Aggregation
        const partMap: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const partInfo = getPartInfo(e);
            const key = partInfo.partNo !== '-' ? partInfo.partNo : (e.partId || 'Unknown');
            if (!partMap[key]) {
                partMap[key] = {
                    partNo: partInfo.partNo,
                    partName: partInfo.partName,
                    shotWeight: partInfo.shotWeight,
                    castingWeight: partInfo.castingWeight,
                    planned: 0,
                    produced: 0,
                    rejected: 0,
                    effSum: 0,
                    count: 0,
                    tonnage: 0
                };
            }
            const item = partMap[key];
            const planned = getEffectivePlanned(e);
            const actual = Number(e.actualQty) || 0;
            const rej = Number(e.rejectionQty) || 0;
            const eff = planned > 0 ? ((actual / planned) * 100) : (Number(e.efficiency) || 0);
            const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;

            item.planned += planned;
            item.produced += actual;
            item.rejected += rej;
            item.effSum += eff;
            item.count += 1;
            item.tonnage += (cw * actual) / 1000;
            if (item.partName === '-' && partInfo.partName !== '-') {
                item.partName = partInfo.partName;
            }
        });

        const partList = Object.values(partMap).map((p: any) => {
            const rejRate = p.produced > 0 ? (p.rejected / p.produced) * 100 : 0;
            const avgEff = p.planned > 0 ? (p.produced / p.planned) * 100 : (p.count > 0 ? p.effSum / p.count : 0);
            const targetAchieved = p.planned > 0 ? (p.produced / p.planned) * 100 : 0;
            return { ...p, rejRate, avgEff, targetAchieved };
        }).sort((a: any, b: any) => b.produced - a.produced);

        // 5. Gap Reason Aggregation
        let totalGapAll = 0;
        let totalLossHoursAll = 0;
        let mpUnits = 0, mpCount = 0, mpHours = 0;
        let mbUnits = 0, mbCount = 0, mbHours = 0;
        let msUnits = 0, msCount = 0, msHours = 0;
        let mdUnits = 0, mdCount = 0, mdHours = 0;
        let otherUnits = 0, otherCount = 0, otherHours = 0;

        const machineGapMap: Record<string, any> = {};

        filteredEntries.forEach(e => {
            const gap = getEffectiveGap(e);
            if (gap <= 0) return;

            const plan = getEffectivePlanned(e);
            // 10 hours working time per shift basis
            const hrsFactor = plan > 0 ? (10 / plan) : 0;
            const entryLossHours = gap * hrsFactor;

            totalGapAll += gap;
            totalLossHoursAll += entryLossHours;

            const m = e.machineNumber || 'Unknown';
            if (!machineGapMap[m]) {
                machineGapMap[m] = {
                    machineNumber: m,
                    mp: 0, mb: 0, ms: 0, md: 0, other: 0, total: 0, count: 0,
                    mpHours: 0, mbHours: 0, msHours: 0, mdHours: 0, otherHours: 0, totalHours: 0
                };
            }
            machineGapMap[m].total += gap;
            machineGapMap[m].totalHours += entryLossHours;
            machineGapMap[m].count += 1;

            const isDown = (Number(e.actualQty) || 0) === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE')) || (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-')));
            const exactAllocated = (e.gapQtyManPower || 0) + (e.gapQtyMachineBreakdown || 0) + (e.gapQtyMaterialShortage || 0) + (e.gapQtyMethod || 0);

            if (exactAllocated > 0) {
                if (e.gapQtyManPower) {
                    const h = e.gapQtyManPower * hrsFactor;
                    mpUnits += e.gapQtyManPower; mpHours += h; mpCount++;
                    machineGapMap[m].mp += e.gapQtyManPower; machineGapMap[m].mpHours += h;
                }
                if (e.gapQtyMachineBreakdown) {
                    const h = e.gapQtyMachineBreakdown * hrsFactor;
                    mbUnits += e.gapQtyMachineBreakdown; mbHours += h; mbCount++;
                    machineGapMap[m].mb += e.gapQtyMachineBreakdown; machineGapMap[m].mbHours += h;
                }
                if (e.gapQtyMaterialShortage) {
                    const h = e.gapQtyMaterialShortage * hrsFactor;
                    msUnits += e.gapQtyMaterialShortage; msHours += h; msCount++;
                    machineGapMap[m].ms += e.gapQtyMaterialShortage; machineGapMap[m].msHours += h;
                }
                if (e.gapQtyMethod) {
                    const h = e.gapQtyMethod * hrsFactor;
                    mdUnits += e.gapQtyMethod; mdHours += h; mdCount++;
                    machineGapMap[m].md += e.gapQtyMethod; machineGapMap[m].mdHours += h;
                }
                if (exactAllocated < gap) {
                    const unacc = gap - exactAllocated;
                    const unaccH = unacc * hrsFactor;
                    otherUnits += unacc; otherHours += unaccH; otherCount++;
                    machineGapMap[m].other += unacc; machineGapMap[m].otherHours += unaccH;
                }
            } else if (isDown) {
                // Whole gap is machine breakdown downtime
                mbUnits += gap; mbHours += entryLossHours; mbCount++;
                machineGapMap[m].mb += gap; machineGapMap[m].mbHours += entryLossHours;
            } else {
                let reasonsActive = 0;
                if (e.gapReasonManPower) reasonsActive++;
                if (e.gapReasonMachineBreakdown) reasonsActive++;
                if (e.gapReasonMaterialShortage) reasonsActive++;
                if (e.gapReasonMethod) reasonsActive++;

                if (reasonsActive > 0) {
                    const portion = gap / reasonsActive;
                    const portionH = portion * hrsFactor;
                    if (e.gapReasonManPower) { mpUnits += portion; mpHours += portionH; mpCount++; machineGapMap[m].mp += portion; machineGapMap[m].mpHours += portionH; }
                    if (e.gapReasonMachineBreakdown) { mbUnits += portion; mbHours += portionH; mbCount++; machineGapMap[m].mb += portion; machineGapMap[m].mbHours += portionH; }
                    if (e.gapReasonMaterialShortage) { msUnits += portion; msHours += portionH; msCount++; machineGapMap[m].ms += portion; machineGapMap[m].msHours += portionH; }
                    if (e.gapReasonMethod) { mdUnits += portion; mdHours += portionH; mdCount++; machineGapMap[m].md += portion; machineGapMap[m].mdHours += portionH; }
                } else {
                    const unaccH = gap * hrsFactor;
                    otherUnits += gap; otherHours += unaccH; otherCount++;
                    machineGapMap[m].other += gap; machineGapMap[m].otherHours += unaccH;
                }
            }
        });

        const machineGapList = Object.values(machineGapMap).sort((a: any, b: any) => b.total - a.total);

        return {
            machineList,
            operatorList,
            dieList,
            partList,
            machineGapList,
            totalGapAll,
            totalLossHoursAll,
            mpUnits, mpCount, mpHours,
            mbUnits, mbCount, mbHours,
            msUnits, msCount, msHours,
            mdUnits, mdCount, mdHours,
            otherUnits, otherCount, otherHours
        };
    }, [filteredEntries, masterParts, operators]);

    const kpiDateMapData = useMemo(() => {
        const dateMap = new Map<string, any>();
        filteredEntries.forEach(e => {
            const d = e.date;
            if (!dateMap.has(d)) dateMap.set(d, { planned: 0, actual: 0, rej: 0, gap: 0, effSum: 0, count: 0, downtimeCount: 0, cw: 0, mp: 0, mb: 0, ms: 0, md: 0 });
            const st = dateMap.get(d);
            const plan = getEffectivePlanned(e);
            const gap = getEffectiveGap(e);
            const eff = plan > 0 ? ((Number(e.actualQty || 0) / plan) * 100) : (Number(e.efficiency) || 0);
            const isDowntimeEntry = (Number(e.actualQty) === 0) && (
                e.gapReasonMachineBreakdown ||
                (e.remark && e.remark.includes('[MACHINE ISSUE')) ||
                (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))
            );
            st.planned += plan;
            st.actual += (e.actualQty || 0);
            st.rej += (e.rejectionQty || 0);
            st.gap += gap;
            st.effSum += eff;
            st.count += 1;
            st.downtimeCount += isDowntimeEntry ? 1 : 0;
            const partInfo = getPartInfo(e);
            const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;
            st.cw += ((e.actualQty || 0) * cw) / 1000;

            if (gap > 0) {
                let rCount = 0;
                if (e.gapReasonManPower) rCount++;
                if (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE')) || (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))) rCount++;
                if (e.gapReasonMaterialShortage) rCount++;
                if (e.gapReasonMethod) rCount++;

                const dGap = rCount > 0 ? (gap / rCount) : gap;
                if (e.gapReasonManPower) st.mp += dGap;
                if (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE')) || (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))) st.mb += dGap;
                if (e.gapReasonMaterialShortage) st.ms += dGap;
                if (e.gapReasonMethod) st.md += dGap;
            }
        });

        const sortedDates = Array.from(dateMap.keys()).sort();
        return { dateMap, sortedDates };
    }, [filteredEntries, masterParts, operators]);

    const exportDrillToExcel = (drillEntriesToExport: any[], drillTitle: string) => {
        const wb = XLSX.utils.book_new();
        const rows = drillEntriesToExport.map(e => {
            const partInfo = getPartInfo(e);
            return {
                'Trace ID': e.traceabilityBatchId,
                'Date': new Date(e.date).toLocaleDateString(),
                'Shift': e.shift,
                'Machine': e.machineNumber,
                'Die': e.dieNo,
                'Operator Name': getOperatorName(e.operatorPunchNo),
                'Operator Punch': e.operatorPunchNo,
                'Supervisor': getSupervisorName(e.operatorPunchNo),
                'Part No': partInfo.partNo,
                'Part Name': partInfo.partName,
                'Shot Weight (kg)': partInfo.shotWeight,
                'Casting Weight (kg)': partInfo.castingWeight,
                'Planned Qty': getEffectivePlanned(e),
                'Actual Qty': Number(e.actualQty) || 0,
                'Accepted Qty': Math.max(0, (Number(e.actualQty) || 0) - (e.rejectionQty || 0)),
                'Rejection Qty': e.rejectionQty || 0,
                'Rejection Reasons': getRejectionReasons(e),
                'Gap Qty': getEffectiveGap(e),
                'Gap Reasons': getGapReasons(e),
                'Efficiency %': getEffectivePlanned(e) > 0 ? Number((((Number(e.actualQty) || 0) / getEffectivePlanned(e)) * 100).toFixed(1)) : (Number(e.efficiency) || 0),
                'Remarks': e.remark,
                'Status': e.status
            };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "DrillDown_Records");
        const safeName = drillTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
        XLSX.writeFile(wb, `${safeName}.xlsx`);
    };

    const exportPerformanceToExcel = (section?: string) => {
        const sub = section || perfSubTab;
        const wb = XLSX.utils.book_new();
        const dateStr = dateRange.start ? `${dateRange.start}_to_${dateRange.end || 'today'}` : 'All_Dates';

        if (sub === 'part') {
            const rows = performanceData.partList.map((p: any, idx: number) => ({
                'Rank': idx + 1,
                'Part No': p.partNo,
                'Part Name': p.partName,
                'Shot Weight (kg)': p.shotWeight,
                'Casting Weight (kg)': p.castingWeight,
                'Runs (Shifts)': p.count,
                'Planned Qty': p.planned,
                'Produced Qty': p.produced,
                'Accepted Qty': p.produced - p.rejected,
                'Rejected Qty': p.rejected,
                'Rejection Rate %': `${p.rejRate.toFixed(1)}%`,
                'Avg Efficiency %': `${p.avgEff.toFixed(1)}%`,
                'Target Achieved %': `${p.targetAchieved.toFixed(1)}%`,
                'Tonnage (MT)': Number(p.tonnage.toFixed(3)),
                'Performance Status': getPerfBadge(p.avgEff, p.rejRate).label
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "Part_Volume_Performance");
            XLSX.writeFile(wb, `Part_Name_Performance_Report_${dateStr}.xlsx`);
        } else if (sub === 'machine') {
            const rows = performanceData.machineList.map((m: any, idx: number) => ({
                'Rank': idx + 1,
                'Machine Number': m.machineNumber,
                'Shifts Run': m.count,
                'Operators Count': m.operators.size,
                'Operators': Array.from(m.operators).map((p: any) => getOperatorName(p)).join(', '),
                'Planned Qty': m.planned,
                'Produced Qty': m.actual,
                'Accepted Qty': m.accepted,
                'Rejected Qty': m.rejected,
                'Rejection Rate %': `${m.rejRate.toFixed(1)}%`,
                'Avg Efficiency %': `${m.avgEff.toFixed(1)}%`,
                'Target Achieved %': `${m.targetAchieved.toFixed(1)}%`,
                'Tonnage (MT)': Number(m.tonnage.toFixed(3)),
                'Performance Status': getPerfBadge(m.avgEff, m.rejRate).label
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "Machine_Performance");
            XLSX.writeFile(wb, `Machine_Performance_Report_${dateStr}.xlsx`);
        } else if (sub === 'operator') {
            const rows = performanceData.operatorList.map((op: any, idx: number) => ({
                'Rank': idx + 1,
                'Operator Name': op.name,
                'Punch No': op.punchNo,
                'Supervisor': op.supervisor,
                'Shifts Run': op.count,
                'Planned Qty': op.planned,
                'Produced Qty': op.actual,
                'Accepted Qty': op.accepted,
                'Rejected Qty': op.rejected,
                'Rejection Rate %': `${op.rejRate.toFixed(1)}%`,
                'Avg Efficiency %': `${op.avgEff.toFixed(1)}%`,
                'Target Achieved %': `${op.targetAchieved.toFixed(1)}%`,
                'Performance Status': getPerfBadge(op.avgEff, op.rejRate).label
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "Operator_Performance");
            XLSX.writeFile(wb, `Operator_Performance_Report_${dateStr}.xlsx`);
        } else if (sub === 'die') {
            const rows = performanceData.dieList.map((d: any, idx: number) => ({
                'Rank': idx + 1,
                'Die Number': d.dieNo,
                'Associated Parts': d.partNos || '-',
                'Part Name': d.partNames || '-',
                'Runs (Shifts)': d.count,
                'Planned Qty': d.planned,
                'Produced Qty': d.produced,
                'Rejected Qty': d.rejected,
                'Rejection Rate %': `${d.rejRate.toFixed(1)}%`,
                'Avg Efficiency %': `${d.avgEff.toFixed(1)}%`,
                'Total Gap Units': d.gap,
                'Performance Status': getPerfBadge(d.avgEff, d.rejRate).label
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "Die_Performance");
            XLSX.writeFile(wb, `Die_Performance_Report_${dateStr}.xlsx`);
        } else if (sub === 'gap') {
            const rows = performanceData.machineGapList.map((mg: any, idx: number) => ({
                'Rank': idx + 1,
                'Machine Number': mg.machineNumber,
                'Total Gap Units': Math.round(mg.total),
                'Total Loss (Hours)': Number((mg.totalHours || 0).toFixed(1)),
                'Shifts Affected': mg.count,
                'Man Power Gap (Units)': Math.round(mg.mp),
                'Man Power Loss (Hours)': Number((mg.mpHours || 0).toFixed(1)),
                'Machine Breakdown Gap (Units)': Math.round(mg.mb),
                'Breakdown Loss (Hours)': Number((mg.mbHours || 0).toFixed(1)),
                'Material Shortage Gap (Units)': Math.round(mg.ms),
                'Shortage Loss (Hours)': Number((mg.msHours || 0).toFixed(1)),
                'Method Gap (Units)': Math.round(mg.md),
                'Method Loss (Hours)': Number((mg.mdHours || 0).toFixed(1)),
                'Other Gap Units': Math.round(mg.other),
                'Other Loss (Hours)': Number((mg.otherHours || 0).toFixed(1)),
                '% of Plant Gap': `${(performanceData.totalGapAll > 0 ? (mg.total / performanceData.totalGapAll) * 100 : 0).toFixed(1)}%`
            }));
            const ws = XLSX.utils.json_to_sheet(rows);
            XLSX.utils.book_append_sheet(wb, ws, "Gap_Root_Causes");
            XLSX.writeFile(wb, `Gap_Reason_Analysis_Report_${dateStr}.xlsx`);
        }
    };

    const exportAllPerformanceWorkbook = () => {
        const wb = XLSX.utils.book_new();
        const dateStr = dateRange.start ? `${dateRange.start}_to_${dateRange.end || 'today'}` : 'All_Dates';

        // Sheet 1: Part Performance
        const partRows = performanceData.partList.map((p: any, idx: number) => ({
            'Rank': idx + 1,
            'Part No': p.partNo,
            'Part Name': p.partName,
            'Shot Weight (kg)': p.shotWeight,
            'Casting Weight (kg)': p.castingWeight,
            'Runs (Shifts)': p.count,
            'Planned Qty': p.planned,
            'Produced Qty': p.produced,
            'Accepted Qty': p.produced - p.rejected,
            'Rejected Qty': p.rejected,
            'Rejection Rate %': `${p.rejRate.toFixed(1)}%`,
            'Avg Efficiency %': `${p.avgEff.toFixed(1)}%`,
            'Target Achieved %': `${p.targetAchieved.toFixed(1)}%`,
            'Tonnage (MT)': Number(p.tonnage.toFixed(3)),
            'Performance Status': getPerfBadge(p.avgEff, p.rejRate).label
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partRows), "Part_Volume_Performance");

        // Sheet 2: Machine Performance
        const machineRows = performanceData.machineList.map((m: any, idx: number) => ({
            'Rank': idx + 1,
            'Machine Number': m.machineNumber,
            'Shifts Run': m.count,
            'Operators Count': m.operators.size,
            'Operators': Array.from(m.operators).map((p: any) => getOperatorName(p)).join(', '),
            'Planned Qty': m.planned,
            'Produced Qty': m.actual,
            'Accepted Qty': m.accepted,
            'Rejected Qty': m.rejected,
            'Rejection Rate %': `${m.rejRate.toFixed(1)}%`,
            'Avg Efficiency %': `${m.avgEff.toFixed(1)}%`,
            'Target Achieved %': `${m.targetAchieved.toFixed(1)}%`,
            'Tonnage (MT)': Number(m.tonnage.toFixed(3)),
            'Performance Status': getPerfBadge(m.avgEff, m.rejRate).label
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(machineRows), "Machine_Performance");

        // Sheet 3: Operator Performance
        const operatorRows = performanceData.operatorList.map((op: any, idx: number) => ({
            'Rank': idx + 1,
            'Operator Name': op.name,
            'Punch No': op.punchNo,
            'Supervisor': op.supervisor,
            'Shifts Run': op.count,
            'Planned Qty': op.planned,
            'Produced Qty': op.actual,
            'Accepted Qty': op.accepted,
            'Rejected Qty': op.rejected,
            'Rejection Rate %': `${op.rejRate.toFixed(1)}%`,
            'Avg Efficiency %': `${op.avgEff.toFixed(1)}%`,
            'Target Achieved %': `${op.targetAchieved.toFixed(1)}%`,
            'Performance Status': getPerfBadge(op.avgEff, op.rejRate).label
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(operatorRows), "Operator_Performance");

        // Sheet 4: Die Performance
        const dieRows = performanceData.dieList.map((d: any, idx: number) => ({
            'Rank': idx + 1,
            'Die Number': d.dieNo,
            'Associated Parts': d.partNos || '-',
            'Part Name': d.partNames || '-',
            'Runs (Shifts)': d.count,
            'Planned Qty': d.planned,
            'Produced Qty': d.produced,
            'Rejected Qty': d.rejected,
            'Rejection Rate %': `${d.rejRate.toFixed(1)}%`,
            'Avg Efficiency %': `${d.avgEff.toFixed(1)}%`,
            'Total Gap Units': d.gap,
            'Performance Status': getPerfBadge(d.avgEff, d.rejRate).label
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dieRows), "Die_Performance");

        // Sheet 5: Gap Root Cause
        const gapRows = performanceData.machineGapList.map((mg: any, idx: number) => ({
            'Rank': idx + 1,
            'Machine Number': mg.machineNumber,
            'Total Gap Units': Math.round(mg.total),
            'Total Loss (Hours)': Number((mg.totalHours || 0).toFixed(1)),
            'Shifts Affected': mg.count,
            'Man Power Gap (Units)': Math.round(mg.mp),
            'Man Power Loss (Hours)': Number((mg.mpHours || 0).toFixed(1)),
            'Machine Breakdown Gap (Units)': Math.round(mg.mb),
            'Breakdown Loss (Hours)': Number((mg.mbHours || 0).toFixed(1)),
            'Material Shortage Gap (Units)': Math.round(mg.ms),
            'Shortage Loss (Hours)': Number((mg.msHours || 0).toFixed(1)),
            'Method Gap (Units)': Math.round(mg.md),
            'Method Loss (Hours)': Number((mg.mdHours || 0).toFixed(1)),
            'Other Gap Units': Math.round(mg.other),
            'Other Loss (Hours)': Number((mg.otherHours || 0).toFixed(1)),
            '% of Plant Gap': `${(performanceData.totalGapAll > 0 ? (mg.total / performanceData.totalGapAll) * 100 : 0).toFixed(1)}%`
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gapRows), "Gap_Root_Causes");

        XLSX.writeFile(wb, `Complete_Performance_Report_${dateStr}.xlsx`);
    };

    const exportToExcel = () => {
        if (activeTab === 'performance') {
            exportPerformanceToExcel(perfSubTab);
            return;
        }
        const ws = XLSX.utils.json_to_sheet(filteredEntries.map(e => {
            const partInfo = getPartInfo(e);
            return {
                'Trace ID': e.traceabilityBatchId,
                'Date': new Date(e.date).toLocaleDateString(),
                'Shift': e.shift,
                'Supervisor': getSupervisorName(e.operatorPunchNo),
                'Operator Name': getOperatorName(e.operatorPunchNo),
                'Operator Punch': e.operatorPunchNo,
                'Machine': e.machineNumber,
                'Die': e.dieNo,
                'Part No': partInfo.partNo,
                'Part Name': partInfo.partName,
                'Shot Weight (kg)': partInfo.shotWeight,
                'Casting Weight (kg)': partInfo.castingWeight,
                'Planned Qty': getEffectivePlanned(e),
                'Actual Qty': Number(e.actualQty) || 0,
                'Accepted Qty': Math.max(0, (Number(e.actualQty) || 0) - (e.rejectionQty || 0)),
                'Rejection Qty': e.rejectionQty || 0,
                'Rej Reasons': getRejectionReasons(e),
                'Gap Qty': getEffectiveGap(e),
                'Gap Reasons': getGapReasons(e),
                'Cycle Time': e.cycleTime,
                'Efficiency %': getEffectivePlanned(e) > 0 ? Number((((Number(e.actualQty) || 0) / getEffectivePlanned(e)) * 100).toFixed(1)) : (Number(e.efficiency) || 0),
                'Remarks': e.remark,
                'Status': e.status,
                'Tonnage (MT)': (() => {
                    const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;
                    return cw > 0 && e.actualQty > 0 ? Number(((cw * e.actualQty) / 1000).toFixed(3)) : 0;
                })()
            };
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "HOD_Report");
        XLSX.writeFile(wb, `HOD_Report_${new Date().getTime()}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF('landscape');
        doc.setFontSize(16);
        doc.text('ASIAAN METALS - Production HOD Report', 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

        const tableColumn = ["Trace ID", "Date", "Shift", "Sup", "Op Name", "Punch", "Mach", "Die", "Part No", "Part Name", "Shot Wt", "Cast Wt", "Planned", "Actual", "Rej", "Gap", "Eff %", "Tonnage"];
        const tableRows: any[] = [];

        filteredEntries.forEach(e => {
            const partInfo = getPartInfo(e);
            const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;
            const actualQty = Number(e.actualQty) || 0;
            const planQty = getEffectivePlanned(e);
            const gapQty = getEffectiveGap(e);
            const eff = planQty > 0 ? ((actualQty / planQty) * 100).toFixed(1) : (Number(e.efficiency) || 0).toFixed(1);
            const rowTonnage = cw > 0 && actualQty > 0 ? ((cw * actualQty) / 1000).toFixed(3) : '0.000';
            const entryData = [
                e.traceabilityBatchId,
                new Date(e.date).toLocaleDateString(),
                e.shift,
                getSupervisorName(e.operatorPunchNo),
                getOperatorName(e.operatorPunchNo),
                e.operatorPunchNo,
                e.machineNumber,
                e.dieNo,
                partInfo.partNo,
                partInfo.partName,
                partInfo.shotWeight,
                partInfo.castingWeight,
                planQty,
                actualQty,
                e.rejectionQty || 0,
                gapQty,
                `${eff}%`,
                `${rowTonnage} MT`
            ];
            tableRows.push(entryData);
        });

        (doc as any).autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 30,
            styles: { fontSize: 6.5, cellPadding: 2 },
            headStyles: { fillColor: [11, 70, 44] }
        });
        doc.save(`HOD_Report_${new Date().getTime()}.pdf`);
    };

    const renderMasterReport = () => (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Quick In-Table Search Bar & Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 240px', maxWidth: 360 }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <Search size={13} color="#64748b" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            placeholder="Quick search Part No, Trace ID, Machine, Operator..."
                            style={{
                                width: '100%',
                                height: 30,
                                fontSize: 11.5,
                                border: '1px solid #cbd5e1',
                                borderRadius: 5,
                                padding: '0 10px 0 28px',
                                boxSizing: 'border-box',
                                background: '#ffffff'
                            }}
                            value={masterSearch}
                            onChange={e => setMasterSearch(e.target.value)}
                        />
                        {masterSearch && (
                            <button
                                type="button"
                                onClick={() => setMasterSearch('')}
                                style={{
                                    position: 'absolute',
                                    right: 6,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: '#94a3b8',
                                    padding: 2
                                }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#475569' }}>
                    <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                        Showing {searchedMasterEntries.length} of {filteredEntries.length} records
                    </span>
                </div>
            </div>

            <div className="table-wrapper" style={{ marginTop: 0, flex: 1, minHeight: 0, maxHeight: 'none' }}>
                <table>
                    <thead>
                        <tr>
                            <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 20, background: '#0b462c', whiteSpace: 'nowrap', boxShadow: '2px 0 4px rgba(0,0,0,0.08)' }}>Trace ID</th>
                            <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Date</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Shift</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Supervisor</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Operator Name</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Operator Punch</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Machine</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Die</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Part No</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Part Name</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Shot Wt (kg)</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Casting Wt (kg)</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Planned</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Actual</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Accepted</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Rejected</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Rej Reasons</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Gap</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Gap Reasons</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Cycle Time</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Efficiency</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Remarks</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Status</th>
                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Tonnage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {searchedMasterEntries.map(e => {
                            const partInfo = getPartInfo(e);
                            const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;
                            const actualQty = Number(e.actualQty) || 0;
                            const planQty = getEffectivePlanned(e);
                            const gapQty = getEffectiveGap(e);
                            const eff = planQty > 0 ? ((actualQty / planQty) * 100).toFixed(1) : (Number(e.efficiency) || 0).toFixed(1);
                            const tonnageKg = cw * actualQty;
                            const rowTonnage = tonnageKg > 0 ? (tonnageKg / 1000).toFixed(3) : '0.000';
                            const isDown = actualQty === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE')) || (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-')));
                            return (
                                <tr key={e.id} style={{ background: isDown ? '#fffdf7' : 'inherit' }}>
                                    <td style={{ fontWeight: 'bold', color: '#004d40', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 2, background: isDown ? '#fffdf7' : '#fff', boxShadow: '2px 0 4px rgba(0,0,0,0.05)' }}>
                                        {e.traceabilityBatchId}
                                        {isDown && (
                                            <span style={{ display: 'inline-block', marginLeft: 6, fontSize: 9.5, background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                                                DOWNTIME
                                            </span>
                                        )}
                                    </td>
                                    <td>{new Date(e.date).toLocaleDateString()}</td>
                                    <td>{e.shift}</td>
                                    <td>{getSupervisorName(e.operatorPunchNo)}</td>
                                    <td style={{ fontWeight: '600', color: '#1565c0' }}>{getOperatorName(e.operatorPunchNo)}</td>
                                    <td>{e.operatorPunchNo || '-'}</td>
                                    <td>{e.machineNumber}</td>
                                    <td>{e.dieNo}</td>
                                    <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{partInfo.partNo}</td>
                                    <td style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: '500' }} title={partInfo.partName}>
                                        {partInfo.partName}
                                    </td>
                                    <td>{partInfo.shotWeight}</td>
                                    <td>{partInfo.castingWeight}</td>
                                    <td style={{ fontWeight: 'bold' }}>{planQty}</td>
                                    <td style={{ fontWeight: 'bold', color: isDown ? '#c2410c' : '#0b462c' }}>{actualQty}</td>
                                    <td style={{ fontWeight: 'bold', color: '#004d40' }}>{Math.max(0, actualQty - (e.rejectionQty || 0))}</td>
                                    <td style={{ color: '#b71c1c', fontWeight: 'bold' }}>{e.rejectionQty}</td>
                                    <td style={{ fontSize: '0.85em', color: '#555' }}>{getRejectionReasons(e)}</td>
                                    <td style={{ color: gapQty > 0 ? '#b71c1c' : 'inherit', fontWeight: gapQty > 0 ? 'bold' : 'normal' }}>{gapQty}</td>
                                    <td style={{ fontSize: '0.85em', color: '#555' }}>{getGapReasons(e)}</td>
                                    <td>{e.cycleTime}</td>
                                    <td style={{ fontWeight: 'bold' }}>{eff}%</td>
                                    <td style={{ fontSize: '0.85em', maxWidth: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.remark}>{e.remark}</td>
                                    <td>
                                        <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : ''}`}>
                                            {e.status}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: 'bold', color: '#00838f', whiteSpace: 'nowrap' }} title={`${tonnageKg.toFixed(2)} kg (${cw} kg × ${actualQty} units)`}>
                                        {rowTonnage} MT
                                    </td>
                                </tr>
                            );
                        })}
                        {searchedMasterEntries.length === 0 && (
                            <tr><td colSpan={24} style={{ textAlign: 'center', padding: 30 }}>No records match the selected filters or search query.</td></tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #0b462c', fontWeight: 800 }}>
                            <td colSpan={12} style={{ textAlign: 'right', color: '#0b462c', fontSize: 11.5 }}>
                                TOTALS ({filteredEntries.length} Records):
                            </td>
                            <td style={{ fontWeight: 800, color: '#0f172a' }}>{totalPlanned}</td>
                            <td style={{ fontWeight: 800, color: '#0b462c' }}>{totalActual}</td>
                            <td style={{ fontWeight: 800, color: '#004d40' }}>{totalAccepted}</td>
                            <td style={{ fontWeight: 800, color: '#b71c1c' }}>{totalRej}</td>
                            <td style={{ fontSize: '0.85em', color: '#64748b' }}>-</td>
                            <td style={{ fontWeight: 800, color: totalGap > 0 ? '#b71c1c' : '#0f172a' }}>{totalGap}</td>
                            <td style={{ fontSize: '0.85em', color: '#64748b' }}>-</td>
                            <td style={{ color: '#64748b' }}>-</td>
                            <td style={{ fontWeight: 800, color: Number(avgEff) >= 85 ? '#15803d' : '#854d0e' }}>{avgEff}%</td>
                            <td style={{ color: '#64748b' }}>-</td>
                            <td style={{ color: '#64748b' }}>-</td>
                            <td style={{ fontWeight: 800, color: '#00838f', whiteSpace: 'nowrap' }}>{totalTonnage} MT</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );

    const renderOperatorReport = () => {
        const opData: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const k = e.operatorPunchNo || 'Unknown';
            if (!opData[k]) opData[k] = {
                punchNo: k,
                name: getOperatorName(k),
                supervisor: getSupervisorName(k),
                planned: 0, actual: 0, rej: 0, gap: 0, count: 0, effSum: 0
            };
            const plan = getEffectivePlanned(e);
            const gap = getEffectiveGap(e);
            const eff = plan > 0 ? ((Number(e.actualQty || 0) / plan) * 100) : (Number(e.efficiency) || 0);
            opData[k].planned += plan;
            opData[k].actual += Number(e.actualQty) || 0;
            opData[k].rej += e.rejectionQty || 0;
            opData[k].gap += gap;
            opData[k].effSum += eff;
            opData[k].count++;
        });

        return (
            <div className="table-wrapper" style={{ marginTop: 20 }}>
                <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                    <thead>
                        <tr>
                            <th>Operator Name</th>
                            <th>Punch No</th>
                            <th>Supervisor</th>
                            <th>Total Entries</th>
                            <th>Total Planned</th>
                            <th>Total Actual</th>
                            <th>Total Accepted</th>
                            <th>Total Rejected</th>
                            <th>Total Gap</th>
                            <th>Avg Efficiency</th>
                            <th>Target Achieved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.values(opData).map((d: any) => (
                            <tr key={d.punchNo}>
                                <td style={{ fontWeight: 'bold', color: '#1565c0' }}>{d.name}</td>
                                <td>{d.punchNo}</td>
                                <td>{d.supervisor}</td>
                                <td>{d.count}</td>
                                <td>{d.planned}</td>
                                <td>{d.actual}</td>
                                <td style={{ color: '#0b462c', fontWeight: 'bold' }}>{d.actual - d.rej}</td>
                                <td style={{ color: '#b71c1c' }}>{d.rej}</td>
                                <td style={{ color: d.gap > 0 ? '#b71c1c' : 'inherit' }}>{d.gap}</td>
                                <td>{d.planned > 0 ? ((d.actual / d.planned) * 100).toFixed(1) : (d.count > 0 ? (d.effSum / d.count).toFixed(1) : '0.0')}%</td>
                                <td>{d.planned > 0 ? ((d.actual / d.planned) * 100).toFixed(1) : 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderSupervisorReport = () => {
        const supData: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const op = operators?.find((o: any) => o.punchNo === e.operatorPunchNo);
            const k = op?.supervisor?.name || 'Unassigned Supervisor';
            if (!supData[k]) supData[k] = { label: k, planned: 0, actual: 0, rej: 0, gap: 0, count: 0, effSum: 0, ops: new Set() };
            const plan = getEffectivePlanned(e);
            const gap = getEffectiveGap(e);
            const eff = plan > 0 ? ((Number(e.actualQty || 0) / plan) * 100) : (Number(e.efficiency) || 0);
            supData[k].planned += plan;
            supData[k].actual += Number(e.actualQty) || 0;
            supData[k].rej += e.rejectionQty || 0;
            supData[k].gap += gap;
            supData[k].effSum += eff;
            supData[k].count++;
            if (e.operatorPunchNo) supData[k].ops.add(e.operatorPunchNo);
        });

        return (
            <div className="table-wrapper" style={{ marginTop: 20 }}>
                <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                    <thead>
                        <tr>
                            <th>Supervisor Name</th>
                            <th>Active Operators</th>
                            <th>Total Entries</th>
                            <th>Total Planned</th>
                            <th>Total Actual</th>
                            <th>Total Accepted</th>
                            <th>Total Rejected</th>
                            <th>Total Gap</th>
                            <th>Avg Efficiency</th>
                            <th>Target Achieved</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.values(supData).map((d: any) => (
                            <tr key={d.label}>
                                <td style={{ fontWeight: 'bold' }}>{d.label}</td>
                                <td>{d.ops.size}</td>
                                <td>{d.count}</td>
                                <td>{d.planned}</td>
                                <td>{d.actual}</td>
                                <td style={{ color: '#0b462c', fontWeight: 'bold' }}>{d.actual - d.rej}</td>
                                <td style={{ color: '#b71c1c' }}>{d.rej}</td>
                                <td style={{ color: d.gap > 0 ? '#b71c1c' : 'inherit' }}>{d.gap}</td>
                                <td>{d.planned > 0 ? ((d.actual / d.planned) * 100).toFixed(1) : (d.count > 0 ? (d.effSum / d.count).toFixed(1) : '0.0')}%</td>
                                <td>{d.planned > 0 ? ((d.actual / d.planned) * 100).toFixed(1) : 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderMachineReport = () => {
        const data: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const k = e.machineNumber || 'Unknown';
            if (!data[k]) data[k] = { label: k, planned: 0, actual: 0, rej: 0, count: 0, effSum: 0, gap: 0, operators: new Set(), dies: new Set() };
            const plan = getEffectivePlanned(e);
            const gap = getEffectiveGap(e);
            const eff = plan > 0 ? ((Number(e.actualQty || 0) / plan) * 100) : (Number(e.efficiency) || 0);
            data[k].planned += plan;
            data[k].actual += Number(e.actualQty) || 0;
            data[k].rej += e.rejectionQty || 0;
            data[k].effSum += eff;
            data[k].gap += gap;
            data[k].count++;
            if (e.operatorPunchNo) data[k].operators.add(e.operatorPunchNo);
            if (e.dieNo) data[k].dies.add(e.dieNo);
        });

        return (
            <div className="table-wrapper" style={{ marginTop: 20 }}>
                <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                    <thead>
                        <tr>
                            <th>Machine Number</th>
                            <th>Total Planned</th>
                            <th>Total Actual</th>
                            <th>Total Accepted</th>
                            <th>Total Rejected</th>
                            <th>Total Gap</th>
                            <th>Operators</th>
                            <th>Dies</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.values(data).map((d: any) => (
                            <tr key={d.label}>
                                <td style={{ fontWeight: 'bold' }}>{d.label}</td>
                                <td>{d.planned}</td>
                                <td>{d.actual}</td>
                                <td style={{ color: '#0b462c', fontWeight: 'bold' }}>{d.actual - d.rej}</td>
                                <td style={{ color: '#b71c1c' }}>{d.rej}</td>
                                <td style={{ color: d.gap > 0 ? '#b71c1c' : 'inherit' }}>{d.gap}</td>
                                <td>{Array.from(d.operators).join(', ')}</td>
                                <td>{Array.from(d.dies).join(', ')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderDieReport = () => {
        const data: Record<string, any> = {};
        filteredEntries.forEach(e => {
            const k = e.dieNo || 'Unknown';
            if (!data[k]) data[k] = { label: k, actual: 0, rej: 0, count: 0, parts: new Map<string, string>() };
            data[k].actual += e.actualQty;
            data[k].rej += e.rejectionQty || 0;
            data[k].count++;
            const partInfo = getPartInfo(e);
            const pNo = partInfo.partNo && partInfo.partNo !== '-' ? partInfo.partNo : (e.part?.partNo || '-');
            const pName = partInfo.partName && partInfo.partName !== '-' ? partInfo.partName : (e.part?.partName || '-');
            data[k].parts.set(pNo, pName);
        });

        return (
            <div className="table-wrapper" style={{ marginTop: 20 }}>
                <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                    <thead>
                        <tr>
                            <th>Die Number</th>
                            <th>Associated Parts</th>
                            <th>Part Name</th>
                            <th>Runs (Entries)</th>
                            <th>Total Actual Qty</th>
                            <th>Total Rejected Qty</th>
                            <th>Rejection Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.values(data).map((d: any) => {
                            const partsArray = Array.from((d.parts as Map<string, string>).entries());
                            return (
                                <tr key={d.label}>
                                    <td style={{ fontWeight: 'bold', color: '#e65100' }}>{d.label}</td>
                                    <td style={{ fontWeight: 700, color: '#0b462c' }}>
                                        {partsArray.length === 0 ? '-' : partsArray.map(([pNo]) => pNo).join(', ')}
                                    </td>
                                    <td style={{ fontWeight: 700, color: '#0f172a' }}>
                                        {partsArray.length === 0 ? '-' : partsArray.map(([_, pName]) => pName || '-').join(', ')}
                                    </td>
                                    <td>{d.count}</td>
                                    <td style={{ fontWeight: 700 }}>{d.actual.toLocaleString()}</td>
                                    <td style={{ color: '#b71c1c', fontWeight: d.rej > 0 ? 700 : 500 }}>{d.rej.toLocaleString()}</td>
                                    <td style={{ fontWeight: 700 }}>{d.actual > 0 ? ((d.rej / d.actual) * 100).toFixed(1) : 0}%</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderProgressBar = (value: number, color: string, max: number = 100) => {
        const pct = Math.max(0, Math.min(100, (value / max) * 100));
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90, width: '100%' }}>
                <div style={{ flex: 1, height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 'bold', minWidth: 38, textAlign: 'right', color: '#333' }}>
                    {value.toFixed(1)}%
                </span>
            </div>
        );
    };

    const renderBadge = (eff: number, rejRate: number) => {
        const badge = getPerfBadge(eff, rejRate);
        return (
            <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 10.5,
                fontWeight: 'bold',
                background: badge.bg,
                color: badge.color,
                border: `1px solid ${badge.border}`,
                textAlign: 'center',
                whiteSpace: 'nowrap'
            }}>
                {badge.label}
            </span>
        );
    };

    const renderRejRatePill = (rate: number) => {
        let color = '#1b5e20';
        let bg = '#e8f5e9';
        let border = '#a5d6a7';
        if (rate > 7) {
            color = '#b71c1c';
            bg = '#ffebee';
            border = '#ef9a9a';
        } else if (rate > 3) {
            color = '#e65100';
            bg = '#fff3e0';
            border = '#ffcc80';
        }
        return (
            <span style={{
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 'bold',
                background: bg,
                color: color,
                border: `1px solid ${border}`,
                whiteSpace: 'nowrap'
            }}>
                {rate.toFixed(1)}%
            </span>
        );
    };

    const renderPerformanceReport = () => {
        if (filteredEntries.length === 0) {
            return (
                <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
                    <AlertTriangle size={36} color="#ffa000" style={{ marginBottom: 12 }} />
                    <h4 style={{ margin: '0 0 6px 0', fontSize: 16, color: '#333' }}>No Production Data Available</h4>
                    <p style={{ margin: 0, fontSize: 13 }}>There are no production records matching your selected date range. Try clearing or expanding your date filters above.</p>
                </div>
            );
        }

        const {
            machineList,
            operatorList,
            dieList,
            partList,
            machineGapList,
            totalGapAll,
            totalLossHoursAll,
            mpUnits, mpCount, mpHours,
            mbUnits, mbCount, mbHours,
            msUnits, msCount, msHours,
            mdUnits, mdCount, mdHours,
            otherUnits, otherCount, otherHours
        } = performanceData;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Header Action Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                        Performance Benchmark Deep Dive
                    </div>
                    <button
                        type="button"
                        onClick={exportAllPerformanceWorkbook}
                        style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: '1px solid #86efac',
                            background: '#f0fdf4',
                            color: '#166534',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                        }}
                        title="Export all 5 performance sections in a single Excel file with multiple sheets"
                    >
                        <Download size={12} /> Export All (Excel)
                    </button>
                </div>

                {/* Section Quick Jump Filter Bar - Smooth Horizontal Segmented Pill Strip */}
                <div className="hod-perf-subtabs-strip">
                    <button
                        type="button"
                        onClick={() => setPerfSubTab('machine')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: perfSubTab === 'machine' ? '1px solid #0b462c' : '1px solid #cbd5e1',
                            background: perfSubTab === 'machine' ? '#0b462c' : '#ffffff',
                            color: perfSubTab === 'machine' ? '#ffffff' : '#475569',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                        }}
                    >
                        🏭 Machine ({machineList.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setPerfSubTab('operator')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: perfSubTab === 'operator' ? '1px solid #0b462c' : '1px solid #cbd5e1',
                            background: perfSubTab === 'operator' ? '#0b462c' : '#ffffff',
                            color: perfSubTab === 'operator' ? '#ffffff' : '#475569',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                        }}
                    >
                        👷 Operator ({operatorList.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setPerfSubTab('die')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: perfSubTab === 'die' ? '1px solid #0b462c' : '1px solid #cbd5e1',
                            background: perfSubTab === 'die' ? '#0b462c' : '#ffffff',
                            color: perfSubTab === 'die' ? '#ffffff' : '#475569',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                        }}
                    >
                        🔧 Die Quality ({dieList.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setPerfSubTab('part')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: perfSubTab === 'part' ? '1px solid #0b462c' : '1px solid #cbd5e1',
                            background: perfSubTab === 'part' ? '#0b462c' : '#ffffff',
                            color: perfSubTab === 'part' ? '#ffffff' : '#475569',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                        }}
                    >
                        📦 Part Volume ({partList.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setPerfSubTab('gap')}
                        style={{
                            padding: '5px 12px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            border: perfSubTab === 'gap' ? '1px solid #0b462c' : '1px solid #cbd5e1',
                            background: perfSubTab === 'gap' ? '#0b462c' : '#ffffff',
                            color: perfSubTab === 'gap' ? '#ffffff' : '#475569',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.15s ease'
                        }}
                    >
                        ⚠️ Gap Causes
                    </button>
                </div>

                {/* ========================================================================= */}
                {/* 1. MACHINE PERFORMANCE SECTION */}
                {/* ========================================================================= */}
                {perfSubTab === 'machine' && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Cylinder size={18} color="#1565c0" />
                                <h3 style={{ margin: 0, fontSize: 15, color: '#1565c0', fontWeight: 'bold' }}>Machine Performance Benchmark</h3>
                                <span style={{ fontSize: 11, background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>
                                    {machineList.length} Machines
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: '#666' }}>Ranked by Average Efficiency (Highest First)</span>
                                <button
                                    type="button"
                                    onClick={() => exportPerformanceToExcel('machine')}
                                    style={{
                                        background: '#1b5e20',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 5,
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                    title="Export Machine Performance Table to Excel"
                                >
                                    <Download size={12} /> Export Table to Excel
                                </button>
                            </div>
                        </div>
                        <div className="table-wrapper">
                            <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 45 }}>Rank</th>
                                        <th>Machine</th>
                                        <th>Shifts Run</th>
                                        <th>Operators</th>
                                        <th>Planned Qty</th>
                                        <th>Produced Qty</th>
                                        <th>Accepted Qty</th>
                                        <th>Rejected Qty</th>
                                        <th>Rej Rate %</th>
                                        <th style={{ minWidth: 140 }}>Avg Efficiency %</th>
                                        <th style={{ minWidth: 140 }}>Target Achieved %</th>
                                        <th>Tonnage</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {machineList.map((m: any, idx: number) => (
                                        <tr key={m.machineNumber}>
                                            <td style={{ fontWeight: 'bold', color: '#666' }}>#{idx + 1}</td>
                                            <td style={{ fontWeight: 'bold', color: '#1565c0' }}>{m.machineNumber}</td>
                                            <td>{m.count}</td>
                                            <td>
                                                <span
                                                    style={{ background: '#f0f4f8', color: '#333', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 'bold' }}
                                                    title={Array.from(m.operators).map((p: any) => getOperatorName(p)).join(', ')}
                                                >
                                                    {m.operators.size} {m.operators.size === 1 ? 'Operator' : 'Operators'}
                                                </span>
                                            </td>
                                            <td>{m.planned.toLocaleString()}</td>
                                            <td style={{ fontWeight: 'bold' }}>{m.actual.toLocaleString()}</td>
                                            <td style={{ color: '#0b462c', fontWeight: 'bold' }}>{m.accepted.toLocaleString()}</td>
                                            <td style={{ color: m.rejected > 0 ? '#b71c1c' : 'inherit', fontWeight: m.rejected > 0 ? 'bold' : 'normal' }}>
                                                {m.rejected.toLocaleString()}
                                            </td>
                                            <td>{renderRejRatePill(m.rejRate)}</td>
                                            <td>{renderProgressBar(m.avgEff, m.avgEff >= 90 ? '#2e7d32' : m.avgEff >= 75 ? '#f57c00' : '#d32f2f')}</td>
                                            <td>{renderProgressBar(m.targetAchieved, m.targetAchieved >= 90 ? '#1565c0' : '#7b1fa2')}</td>
                                            <td style={{ color: '#00838f', fontWeight: 'bold' }}>{m.tonnage.toFixed(3)} MT</td>
                                            <td style={{ textAlign: 'center' }}>{renderBadge(m.avgEff, m.rejRate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 2. OPERATOR PERFORMANCE SECTION */}
                {/* ========================================================================= */}
                {perfSubTab === 'operator' && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <UserCog size={18} color="#2e7d32" />
                                <h3 style={{ margin: 0, fontSize: 15, color: '#2e7d32', fontWeight: 'bold' }}>Operator Performance & Efficiency Ranking</h3>
                                <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>
                                    {operatorList.length} Operators
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: '#666' }}>Top 3 performers awarded medals 🥇🥈🥉</span>
                                <button
                                    type="button"
                                    onClick={() => exportPerformanceToExcel('operator')}
                                    style={{
                                        background: '#1b5e20',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 5,
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                    title="Export Operator Performance Table to Excel"
                                >
                                    <Download size={12} /> Export Table to Excel
                                </button>
                            </div>
                        </div>
                        <div className="table-wrapper">
                            <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 55 }}>Rank</th>
                                        <th>Operator Name</th>
                                        <th>Punch No</th>
                                        <th>Supervisor</th>
                                        <th>Shifts Run</th>
                                        <th>Planned Qty</th>
                                        <th>Produced Qty</th>
                                        <th>Accepted Qty</th>
                                        <th>Rejected Qty</th>
                                        <th>Rej Rate %</th>
                                        <th style={{ minWidth: 140 }}>Avg Efficiency %</th>
                                        <th style={{ minWidth: 140 }}>Target Achieved %</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {operatorList.map((op: any, idx: number) => {
                                        const medal = idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `#${idx + 1}`;
                                        return (
                                            <tr key={op.punchNo} style={{ background: idx < 3 ? '#fafcf9' : 'transparent' }}>
                                                <td style={{ fontWeight: 'bold', color: idx < 3 ? '#2e7d32' : '#666', fontSize: idx < 3 ? 12.5 : 11.5 }}>
                                                    {medal}
                                                </td>
                                                <td style={{ fontWeight: 'bold', color: '#333' }}>{op.name}</td>
                                                <td style={{ fontFamily: 'monospace', color: '#555' }}>{op.punchNo}</td>
                                                <td style={{ color: '#555' }}>{op.supervisor}</td>
                                                <td>{op.count}</td>
                                                <td>{op.planned.toLocaleString()}</td>
                                                <td style={{ fontWeight: 'bold' }}>{op.actual.toLocaleString()}</td>
                                                <td style={{ color: '#0b462c', fontWeight: 'bold' }}>{op.accepted.toLocaleString()}</td>
                                                <td style={{ color: op.rejected > 0 ? '#b71c1c' : 'inherit', fontWeight: op.rejected > 0 ? 'bold' : 'normal' }}>
                                                    {op.rejected.toLocaleString()}
                                                </td>
                                                <td>{renderRejRatePill(op.rejRate)}</td>
                                                <td>{renderProgressBar(op.avgEff, op.avgEff >= 90 ? '#2e7d32' : op.avgEff >= 75 ? '#f57c00' : '#d32f2f')}</td>
                                                <td>{renderProgressBar(op.targetAchieved, op.targetAchieved >= 90 ? '#1565c0' : '#7b1fa2')}</td>
                                                <td style={{ textAlign: 'center' }}>{renderBadge(op.avgEff, op.rejRate)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 3. DIE PERFORMANCE SECTION */}
                {/* ========================================================================= */}
                {perfSubTab === 'die' && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Blocks size={18} color="#e65100" />
                                <h3 style={{ margin: 0, fontSize: 15, color: '#e65100', fontWeight: 'bold' }}>Die Performance & Quality Health</h3>
                                <span style={{ fontSize: 11, background: '#fff3e0', color: '#e65100', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>
                                    {dieList.length} Dies
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: '#666' }}>Ranked by Rejection Rate (Lowest to Highest)</span>
                                <button
                                    type="button"
                                    onClick={() => exportPerformanceToExcel('die')}
                                    style={{
                                        background: '#1b5e20',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 5,
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                    title="Export Die Performance Table to Excel"
                                >
                                    <Download size={12} /> Export Table to Excel
                                </button>
                            </div>
                        </div>
                        <div className="table-wrapper">
                            <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 45 }}>Rank</th>
                                        <th>Die Number</th>
                                        <th>Associated Parts</th>
                                        <th>Part Name</th>
                                        <th>Runs (Shifts)</th>
                                        <th>Planned Qty</th>
                                        <th>Produced Qty</th>
                                        <th>Rejected Qty</th>
                                        <th>Rej Rate %</th>
                                        <th style={{ minWidth: 140 }}>Avg Efficiency %</th>
                                        <th>Total Gap</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dieList.map((d: any, idx: number) => (
                                        <tr key={d.dieNo}>
                                            <td style={{ fontWeight: 'bold', color: '#666' }}>#{idx + 1}</td>
                                            <td style={{ fontWeight: 'bold', color: '#e65100' }}>{d.dieNo}</td>
                                            <td style={{ maxWidth: 160, whiteSpace: 'normal', fontWeight: 600, color: '#0b462c' }}>
                                                {d.partNos || '-'}
                                            </td>
                                            <td style={{ maxWidth: 200, whiteSpace: 'normal', fontWeight: 600, color: '#0f172a' }}>
                                                {d.partNames || '-'}
                                            </td>
                                            <td>{d.count}</td>
                                            <td>{d.planned.toLocaleString()}</td>
                                            <td style={{ fontWeight: 'bold' }}>{d.produced.toLocaleString()}</td>
                                            <td style={{ color: d.rejected > 0 ? '#b71c1c' : 'inherit', fontWeight: d.rejected > 0 ? 'bold' : 'normal' }}>
                                                {d.rejected.toLocaleString()}
                                            </td>
                                            <td>{renderRejRatePill(d.rejRate)}</td>
                                            <td>{renderProgressBar(d.avgEff, d.avgEff >= 90 ? '#2e7d32' : d.avgEff >= 75 ? '#f57c00' : '#d32f2f')}</td>
                                            <td style={{ color: d.gap > 0 ? '#b71c1c' : 'inherit', fontWeight: d.gap > 0 ? 'bold' : 'normal' }}>
                                                {d.gap.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{renderBadge(d.avgEff, d.rejRate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 4. PART NAME PERFORMANCE SECTION */}
                {/* ========================================================================= */}
                {perfSubTab === 'part' && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Package size={18} color="#6a1b9a" />
                                <h3 style={{ margin: 0, fontSize: 15, color: '#6a1b9a', fontWeight: 'bold' }}>Part Name Production Volume & Tonnage Analysis</h3>
                                <span style={{ fontSize: 11, background: '#f3e5f5', color: '#6a1b9a', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>
                                    {partList.length} Parts
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: '#666' }}>Ranked by Produced Volume (Highest First)</span>
                                <button
                                    type="button"
                                    onClick={() => exportPerformanceToExcel('part')}
                                    style={{
                                        background: '#1b5e20',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 5,
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                    title="Export Part Name Performance Table to Excel"
                                >
                                    <Download size={12} /> Export Table to Excel
                                </button>
                            </div>
                        </div>
                        <div className="table-wrapper">
                            <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: 45 }}>Rank</th>
                                        <th>Part No</th>
                                        <th>Part Name</th>
                                        <th>Shot Wt (kg)</th>
                                        <th>Cast Wt (kg)</th>
                                        <th>Runs</th>
                                        <th>Planned Qty</th>
                                        <th>Produced Qty</th>
                                        <th>Rejected Qty</th>
                                        <th>Rej Rate %</th>
                                        <th style={{ minWidth: 140 }}>Avg Efficiency %</th>
                                        <th style={{ minWidth: 140 }}>Target Achieved %</th>
                                        <th>Tonnage</th>
                                        <th style={{ textAlign: 'center' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partList.map((p: any, idx: number) => (
                                        <tr key={p.partNo + '_' + idx}>
                                            <td style={{ fontWeight: 'bold', color: '#666' }}>#{idx + 1}</td>
                                            <td style={{ fontWeight: 'bold', color: '#6a1b9a' }}>{p.partNo}</td>
                                            <td style={{ fontWeight: '600' }}>{p.partName}</td>
                                            <td>{p.shotWeight}</td>
                                            <td>{p.castingWeight}</td>
                                            <td>{p.count}</td>
                                            <td>{p.planned.toLocaleString()}</td>
                                            <td style={{ fontWeight: 'bold' }}>{p.produced.toLocaleString()}</td>
                                            <td style={{ color: p.rejected > 0 ? '#b71c1c' : 'inherit', fontWeight: p.rejected > 0 ? 'bold' : 'normal' }}>
                                                {p.rejected.toLocaleString()}
                                            </td>
                                            <td>{renderRejRatePill(p.rejRate)}</td>
                                            <td>{renderProgressBar(p.avgEff, p.avgEff >= 90 ? '#2e7d32' : p.avgEff >= 75 ? '#f57c00' : '#d32f2f')}</td>
                                            <td>{renderProgressBar(p.targetAchieved, p.targetAchieved >= 90 ? '#1565c0' : '#7b1fa2')}</td>
                                            <td style={{ color: '#00838f', fontWeight: 'bold' }}>{p.tonnage.toFixed(3)} MT</td>
                                            <td style={{ textAlign: 'center' }}>{renderBadge(p.avgEff, p.rejRate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* 5. GAP REASON ROOT CAUSE ANALYSIS */}
                {/* ========================================================================= */}
                {perfSubTab === 'gap' && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <AlertTriangle size={18} color="#c62828" />
                                <h3 style={{ margin: 0, fontSize: 15, color: '#c62828', fontWeight: 'bold' }}>Gap Reason & Root Cause Analysis</h3>
                                <span style={{ fontSize: 11, background: '#ffebee', color: '#c62828', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold' }}>
                                    Total Gap: {Math.round(totalGapAll).toLocaleString()} Units
                                </span>
                                <span style={{ fontSize: 11, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Clock size={11} /> Total Loss: {totalLossHoursAll.toFixed(1)} Hours
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 11, color: '#666' }}>Distribution across 4 primary manufacturing loss categories (10h Shift Basis)</span>
                                <button
                                    type="button"
                                    onClick={() => exportPerformanceToExcel('gap')}
                                    style={{
                                        background: '#1b5e20',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 5,
                                        padding: '4px 10px',
                                        fontSize: 11,
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5
                                    }}
                                    title="Export Gap Reason Breakdown Table to Excel"
                                >
                                    <Download size={12} /> Export Table to Excel
                                </button>
                            </div>
                        </div>

                        {/* 4 Summary Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                            {/* Man Power */}
                            <div style={{ background: '#fff5f5', border: '1px solid #ffcdd2', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#c62828' }}>🔴 Man Power</span>
                                    <span style={{ fontSize: 10.5, background: '#ffebee', color: '#c62828', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>
                                        {totalGapAll > 0 ? ((mpUnits / totalGapAll) * 100).toFixed(1) : 0}% Share
                                    </span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#c62828', marginBottom: 2 }}>
                                    {Math.round(mpUnits).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 'normal', color: '#666' }}>units</span>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#b71c1c', background: '#ffebee', padding: '2px 8px', borderRadius: 10, marginBottom: 4 }}>
                                    <Clock size={11} /> {mpHours.toFixed(1)} hrs loss
                                </div>
                                <div style={{ fontSize: 11, color: '#666' }}>{mpCount} shift occurrences</div>
                            </div>

                            {/* Machine Breakdown */}
                            <div style={{ background: '#fff9f0', border: '1px solid #ffe0b2', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#e65100' }}>🟠 Machine Breakdown</span>
                                    <span style={{ fontSize: 10.5, background: '#fff3e0', color: '#e65100', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>
                                        {totalGapAll > 0 ? ((mbUnits / totalGapAll) * 100).toFixed(1) : 0}% Share
                                    </span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#e65100', marginBottom: 2 }}>
                                    {Math.round(mbUnits).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 'normal', color: '#666' }}>units</span>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#c2410c', background: '#ffedd5', padding: '2px 8px', borderRadius: 10, marginBottom: 4 }}>
                                    <Clock size={11} /> {mbHours.toFixed(1)} hrs loss
                                </div>
                                <div style={{ fontSize: 11, color: '#666' }}>{mbCount} shift occurrences</div>
                            </div>

                            {/* Material Shortage */}
                            <div style={{ background: '#faf5fc', border: '1px solid #e1bee7', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#6a1b9a' }}>🟣 Material Shortage</span>
                                    <span style={{ fontSize: 10.5, background: '#f3e5f5', color: '#6a1b9a', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>
                                        {totalGapAll > 0 ? ((msUnits / totalGapAll) * 100).toFixed(1) : 0}% Share
                                    </span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#6a1b9a', marginBottom: 2 }}>
                                    {Math.round(msUnits).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 'normal', color: '#666' }}>units</span>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#7e22ce', background: '#f3e8ff', padding: '2px 8px', borderRadius: 10, marginBottom: 4 }}>
                                    <Clock size={11} /> {msHours.toFixed(1)} hrs loss
                                </div>
                                <div style={{ fontSize: 11, color: '#666' }}>{msCount} shift occurrences</div>
                            </div>

                            {/* Method */}
                            <div style={{ background: '#f0f7fc', border: '1px solid #bbdefb', borderRadius: 8, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 'bold', color: '#1565c0' }}>🔵 Method</span>
                                    <span style={{ fontSize: 10.5, background: '#e3f2fd', color: '#1565c0', padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>
                                        {totalGapAll > 0 ? ((mdUnits / totalGapAll) * 100).toFixed(1) : 0}% Share
                                    </span>
                                </div>
                                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1565c0', marginBottom: 2 }}>
                                    {Math.round(mdUnits).toLocaleString()} <span style={{ fontSize: 11, fontWeight: 'normal', color: '#666' }}>units</span>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 10, marginBottom: 4 }}>
                                    <Clock size={11} /> {mdHours.toFixed(1)} hrs loss
                                </div>
                                <div style={{ fontSize: 11, color: '#666' }}>{mdCount} shift occurrences</div>
                            </div>
                        </div>

                        {/* Breakdown by Machine Table */}
                        <div style={{ marginTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#333' }}>Machine-wise Gap Root Cause Breakdown</span>
                                <div style={{ display: 'flex', gap: 10, fontSize: 11, alignItems: 'center' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#c62828', display: 'inline-block' }} /> Man Power</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#e65100', display: 'inline-block' }} /> Breakdown</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#6a1b9a', display: 'inline-block' }} /> Shortage</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#1565c0', display: 'inline-block' }} /> Method</span>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: '#9e9e9e', display: 'inline-block' }} /> Other</span>
                                </div>
                            </div>
                            <div className="table-wrapper">
                                <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 45 }}>Rank</th>
                                            <th>Machine</th>
                                            <th>Total Gap</th>
                                            <th style={{ color: '#b91c1c' }}>Total Loss (Hrs)</th>
                                            <th>Shifts</th>
                                            <th>Man Power</th>
                                            <th>Breakdown</th>
                                            <th>Shortage</th>
                                            <th>Method</th>
                                            <th>Other</th>
                                            <th>% of Plant Gap</th>
                                            <th style={{ minWidth: 150 }}>Root Cause Distribution</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {machineGapList.length === 0 ? (
                                            <tr>
                                                <td colSpan={12} style={{ textAlign: 'center', padding: 20, color: '#2e7d32', fontWeight: 'bold' }}>
                                                    🎉 Excellent! Zero Gap Recorded for Selected Period.
                                                </td>
                                            </tr>
                                        ) : (
                                            machineGapList.map((mg: any, idx: number) => {
                                                const shareOfAll = totalGapAll > 0 ? (mg.total / totalGapAll) * 100 : 0;
                                                return (
                                                    <tr key={mg.machineNumber}>
                                                        <td style={{ fontWeight: 'bold', color: '#666' }}>#{idx + 1}</td>
                                                        <td style={{ fontWeight: 'bold', color: '#1565c0' }}>{mg.machineNumber}</td>
                                                        <td style={{ fontWeight: 'bold', color: '#c62828' }}>{Math.round(mg.total).toLocaleString()}</td>
                                                        <td style={{ fontWeight: 'bold', color: '#b91c1c' }}>{(mg.totalHours || 0).toFixed(1)} hrs</td>
                                                        <td>{mg.count}</td>
                                                        <td style={{ color: mg.mp > 0 ? '#c62828' : '#999', fontWeight: mg.mp > 0 ? 'bold' : 'normal' }}>
                                                            {Math.round(mg.mp).toLocaleString()}
                                                            {mg.mpHours > 0 && <span style={{ fontSize: 10.5, color: '#888', display: 'block', fontWeight: 'normal' }}>({mg.mpHours.toFixed(1)}h)</span>}
                                                        </td>
                                                        <td style={{ color: mg.mb > 0 ? '#e65100' : '#999', fontWeight: mg.mb > 0 ? 'bold' : 'normal' }}>
                                                            {Math.round(mg.mb).toLocaleString()}
                                                            {mg.mbHours > 0 && <span style={{ fontSize: 10.5, color: '#888', display: 'block', fontWeight: 'normal' }}>({mg.mbHours.toFixed(1)}h)</span>}
                                                        </td>
                                                        <td style={{ color: mg.ms > 0 ? '#6a1b9a' : '#999', fontWeight: mg.ms > 0 ? 'bold' : 'normal' }}>
                                                            {Math.round(mg.ms).toLocaleString()}
                                                            {mg.msHours > 0 && <span style={{ fontSize: 10.5, color: '#888', display: 'block', fontWeight: 'normal' }}>({mg.msHours.toFixed(1)}h)</span>}
                                                        </td>
                                                        <td style={{ color: mg.md > 0 ? '#1565c0' : '#999', fontWeight: mg.md > 0 ? 'bold' : 'normal' }}>
                                                            {Math.round(mg.md).toLocaleString()}
                                                            {mg.mdHours > 0 && <span style={{ fontSize: 10.5, color: '#888', display: 'block', fontWeight: 'normal' }}>({mg.mdHours.toFixed(1)}h)</span>}
                                                        </td>
                                                        <td style={{ color: mg.other > 0 ? '#666' : '#999' }}>
                                                            {Math.round(mg.other).toLocaleString()}
                                                            {mg.otherHours > 0 && <span style={{ fontSize: 10.5, color: '#888', display: 'block', fontWeight: 'normal' }}>({mg.otherHours.toFixed(1)}h)</span>}
                                                        </td>
                                                        <td style={{ fontWeight: 'bold' }}>{shareOfAll.toFixed(1)}%</td>
                                                        <td>
                                                            <div style={{ display: 'flex', width: '100%', minWidth: 120, height: 10, borderRadius: 5, overflow: 'hidden', background: '#eee' }}>
                                                                {mg.mp > 0 && (
                                                                    <div
                                                                        style={{ width: `${(mg.mp / mg.total) * 100}%`, background: '#c62828' }}
                                                                        title={`Man Power: ${Math.round(mg.mp)} (${((mg.mp / mg.total) * 100).toFixed(1)}%)`}
                                                                    />
                                                                )}
                                                                {mg.mb > 0 && (
                                                                    <div
                                                                        style={{ width: `${(mg.mb / mg.total) * 100}%`, background: '#e65100' }}
                                                                        title={`Machine Breakdown: ${Math.round(mg.mb)} (${((mg.mb / mg.total) * 100).toFixed(1)}%)`}
                                                                    />
                                                                )}
                                                                {mg.ms > 0 && (
                                                                    <div
                                                                        style={{ width: `${(mg.ms / mg.total) * 100}%`, background: '#6a1b9a' }}
                                                                        title={`Material Shortage: ${Math.round(mg.ms)} (${((mg.ms / mg.total) * 100).toFixed(1)}%)`}
                                                                    />
                                                                )}
                                                                {mg.md > 0 && (
                                                                    <div
                                                                        style={{ width: `${(mg.md / mg.total) * 100}%`, background: '#1565c0' }}
                                                                        title={`Method: ${Math.round(mg.md)} (${((mg.md / mg.total) * 100).toFixed(1)}%)`}
                                                                    />
                                                                )}
                                                                {mg.other > 0 && (
                                                                    <div
                                                                        style={{ width: `${(mg.other / mg.total) * 100}%`, background: '#9e9e9e' }}
                                                                        title={`Other: ${Math.round(mg.other)} (${((mg.other / mg.total) * 100).toFixed(1)}%)`}
                                                                    />
                                                                )}
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
                    </div>
                )}
            </div>
        );
    };

    const renderTrendAnalysis = () => {
        const { dateMap, sortedDates } = kpiDateMapData;

        const toggleTrend = (id: string) => {
            if (selectedTrends.includes(id)) {
                if (selectedTrends.length > 1) {
                    setSelectedTrends(selectedTrends.filter(t => t !== id));
                }
            } else {
                setSelectedTrends([...selectedTrends, id]);
            }
        };

        const datasets: any[] = [];

        selectedTrends.forEach((trend, index) => {
            let chartData: any[] = [];
            let label = '';
            let color = '';
            let isPercentage = false;

            if (trend === 'schedule') {
                chartData = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    return s.planned > 0 ? parseFloat(((s.actual / s.planned) * 100).toFixed(1)) : 0;
                });
                label = 'Target Achieved %'; color = '#0d47a1'; isPercentage = true;
            } else if (trend === 'fpy') {
                chartData = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    return s.actual > 0 ? parseFloat((((s.actual - s.rej) / s.actual) * 100).toFixed(1)) : 0;
                });
                label = 'Accepted Qty %'; color = '#1b5e20'; isPercentage = true;
            } else if (trend === 'rejection') {
                chartData = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    return s.actual > 0 ? parseFloat(((s.rej / s.actual) * 100).toFixed(1)) : 0;
                });
                label = 'Rejection %'; color = '#b71c1c'; isPercentage = true;
            } else if (trend === 'efficiency') {
                chartData = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    // OEE per day: Availability × Performance × Quality(100%)
                    const avail = s.count > 0 ? ((s.count - (s.downtimeCount || 0)) / s.count) * 100 : 0;
                    const perf = s.planned > 0 ? (s.actual / s.planned) * 100 : 0;
                    const dayOEE = (avail / 100) * (perf / 100) * 1.0 * 100;
                    return parseFloat(dayOEE.toFixed(1));
                });
                label = 'OEE %'; color = '#f57f17'; isPercentage = true;
            } else if (trend === 'gap') {
                chartData = sortedDates.map(d => dateMap.get(d).gap);
                label = 'Total Gap (Units)'; color = '#4a148c'; isPercentage = false;
            } else if (trend === 'tonnage') {
                chartData = sortedDates.map(d => parseFloat(dateMap.get(d).cw.toFixed(2)));
                label = 'Total Tonnage'; color = '#00838f'; isPercentage = false;
            } else if (trend === 'produced_qty') {
                chartData = sortedDates.map(d => Number(dateMap.get(d).actual) || 0);
                label = 'Total Produced Qty'; color = '#1565c0'; isPercentage = false;
            } else if (trend === 'planned_qty') {
                chartData = sortedDates.map(d => Number(dateMap.get(d).planned) || 0);
                label = 'Total Planned Qty'; color = '#ff8f00'; isPercentage = false;
            }

            datasets.push({
                label: label,
                data: chartData,
                borderColor: color,
                backgroundColor: color,
                fill: false,
                tension: 0.2,
                borderWidth: 2.5,
                pointRadius: 5.5,
                pointHoverRadius: 8,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: color,
                pointBorderWidth: 2.5,
                yAxisID: isPercentage ? 'y' : 'y1',
                __isPercentage: isPercentage
            });
        });

        const formattedDates = sortedDates.map(d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));

        const data = {
            labels: formattedDates,
            datasets: datasets
        };

        const hasLeftAxis = datasets.some(d => d.__isPercentage);
        const hasRightAxis = datasets.some(d => !d.__isPercentage);

        const leftTitle = hasLeftAxis ? 'Percentage (%)' : '';
        const rightTitle = hasRightAxis ? 'Quantity / Units' : '';
        const leftIsPercentage = true;
        const rightIsPercentage = false;

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { left: 10, right: 15, top: 15, bottom: 5 }
            },
            scales: {
                x: {
                    offset: true,
                    grid: { color: '#f8fafc' },
                    ticks: {
                        color: '#334155',
                        font: { size: 11, weight: 'bold' },
                        maxRotation: sortedDates.length > 8 ? 45 : 0,
                        minRotation: 0
                    }
                },
                y: {
                    type: 'linear',
                    display: hasLeftAxis,
                    position: 'left',
                    title: { display: true, text: leftTitle, font: { weight: 'bold', size: 11 }, color: '#0b462c' },
                    beginAtZero: true,
                    max: leftIsPercentage ? 100 : undefined,
                    grid: { color: '#f1f5f9' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 },
                        callback: (v: any) => `${v}%`
                    }
                },
                y1: {
                    type: 'linear',
                    display: hasRightAxis,
                    position: 'right',
                    title: { display: true, text: rightTitle, font: { weight: 'bold', size: 11 }, color: '#0b462c' },
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: '#64748b',
                        font: { size: 10 }
                    }
                }
            },
            onClick: (event: any, elements: any[]) => {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    setSelectedTrendDate(sortedDates[idx]);
                    setKpiDate(sortedDates[idx]);
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 8,
                        boxHeight: 8,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 14,
                        font: { size: 11, weight: '600' }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    boxPadding: 4,
                    callbacks: {
                        label: (ctx: any) => {
                            const lbl = ctx.dataset.label;
                            if (lbl && lbl.includes('%')) return ` ${lbl}: ${ctx.raw}%`;
                            return ` ${lbl}: ${ctx.raw}`;
                        }
                    }
                }
            }
        };

        const activeOption = trendOptions.find(o => o.id === selectedTrends[0]);
        const activeCard = kpiSections.find(c => c.id === selectedTrends[0]);
        const activeMetricName = selectedTrends.length === 1 && activeOption ? activeOption.label : `${selectedTrends.length} Metrics`;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0 }}>
                {/* Sleek Integrated Toolbar Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: '1px solid #edf2f7',
                    flexWrap: 'wrap',
                    gap: 8,
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: '#e8f5e9',
                            color: '#1b5e20',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <TrendingUp size={16} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: '#0b462c', fontSize: 14, fontWeight: 800 }}>
                                    {selectedTrends.length === 1
                                        ? `${activeMetricName} Trend`
                                        : `Multi-Metric Comparison (${selectedTrends.length} Selected)`}
                                </span>
                                {selectedTrends.length === 1 && activeCard && (
                                    <span style={{
                                        fontSize: 11,
                                        fontWeight: 'bold',
                                        background: activeCard.bg,
                                        color: activeCard.valColor,
                                        border: `1px solid ${activeCard.border}`,
                                        padding: '1px 8px',
                                        borderRadius: 12
                                    }}>
                                        Current: {activeCard.value} {activeCard.subValue}
                                    </span>
                                )}
                            </div>
                            <span style={{ color: '#64748b', fontSize: 11 }}>
                                {compareMode
                                    ? 'Compare Mode Active — Click any KPI card above to toggle metrics on this chart.'
                                    : 'Click any KPI box above to instantly switch trend metric.'}
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {compareMode && (
                            <>
                                <button
                                    onClick={() => setSelectedTrends(trendOptions.map(t => t.id))}
                                    className="btn-small"
                                    style={{ fontSize: 11, padding: '3px 8px', background: '#e8f5e9', color: '#1b5e20', border: '1px solid #c8e6c9', borderRadius: 4, cursor: 'pointer' }}
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={() => setSelectedTrends(['schedule'])}
                                    className="btn-small"
                                    style={{ fontSize: 11, padding: '3px 8px', background: '#fff', color: '#666', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
                                >
                                    Reset
                                </button>
                            </>
                        )}

                        <button
                            onClick={() => {
                                if (!compareMode) {
                                    setCompareMode(true);
                                } else {
                                    setCompareMode(false);
                                    if (selectedTrends.length > 1) {
                                        setSelectedTrends([selectedTrends[0]]);
                                    }
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 12px',
                                borderRadius: 16,
                                fontSize: 11,
                                fontWeight: 'bold',
                                border: compareMode ? '1px solid #0b462c' : '1px solid #cbd5e1',
                                background: compareMode ? '#0b462c' : '#f8fafc',
                                color: compareMode ? '#fff' : '#334155',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Focus size={12} />
                            {compareMode ? '✓ Compare Mode' : '+ Compare Mode'}
                        </button>
                    </div>
                </div>

                {/* Compare Mode Chips (if compare mode is active) */}
                {compareMode && (
                    <div style={{ display: 'flex', overflowX: 'auto', flexWrap: 'nowrap', gap: 6, marginBottom: 8, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', alignItems: 'center', flexShrink: 0, WebkitOverflowScrolling: 'touch' }}>
                        <span style={{ fontSize: 10, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginRight: 4, whiteSpace: 'nowrap' }}>Active:</span>
                        {trendOptions.map(opt => {
                            const isActive = selectedTrends.includes(opt.id);
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => toggleTrend(opt.id)}
                                    style={{
                                        padding: '2px 8px',
                                        borderRadius: 12,
                                        border: isActive ? '1px solid #0b462c' : '1px solid #cbd5e1',
                                        background: isActive ? '#0b462c' : '#fff',
                                        color: isActive ? 'white' : '#475569',
                                        fontSize: 10.5,
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {isActive ? '✓ ' : '+ '} {opt.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Permanent Active Metrics Value Ribbon */}
                {(() => {
                    const latestDate = sortedDates[sortedDates.length - 1];
                    const activeDateForRibbon = selectedTrendDate || latestDate;
                    const dayStats = activeDateForRibbon ? dateMap.get(activeDateForRibbon) : null;
                    const dayTargetAchieved = dayStats && dayStats.planned > 0 ? ((dayStats.actual / dayStats.planned) * 100).toFixed(1) : '0.0';
                    const dayAccepted = dayStats && dayStats.actual > 0 ? Math.max(0, dayStats.actual - dayStats.rej) : 0;
                    const dayAcceptedPct = dayStats && dayStats.actual > 0 ? (((dayStats.actual - dayStats.rej) / dayStats.actual) * 100).toFixed(1) : '0.0';
                    const dayRejRate = dayStats && dayStats.actual > 0 ? ((dayStats.rej / dayStats.actual) * 100).toFixed(1) : '0.0';
                    // OEE for the ribbon: Availability × Performance × Quality(100%)
                    const ribbonDowntime = dayStats ? (dayStats.downtimeCount || 0) : 0;
                    const ribbonWorking = dayStats ? (dayStats.count - ribbonDowntime) : 0;
                    const ribbonAvail = dayStats && dayStats.count > 0 ? (ribbonWorking / dayStats.count) * 100 : 0;
                    const ribbonPerf = dayStats && dayStats.planned > 0 ? (dayStats.actual / dayStats.planned) * 100 : 0;
                    const ribbonOEE = (ribbonAvail / 100) * (ribbonPerf / 100) * 1.0 * 100;
                    const dayAvgEff = ribbonOEE.toFixed(1);
                    const dayTonnage = dayStats && dayStats.cw ? dayStats.cw.toFixed(2) : '0.00';

                    const activeValuesList: Array<{ label: string; val: string; color: string; bg: string; border: string }> = [];

                    if (selectedTrends.includes('planned_qty')) {
                        activeValuesList.push({ label: 'Total Planned', val: `${dayStats ? dayStats.planned : 0} Units`, color: '#ea580c', bg: '#fff7ed', border: '#fdba74' });
                    }
                    if (selectedTrends.includes('produced_qty')) {
                        activeValuesList.push({ label: 'Total Produced', val: `${dayStats ? dayStats.actual : 0} Units`, color: '#16a34a', bg: '#f0fdf4', border: '#86efac' });
                    }
                    if (selectedTrends.includes('gap')) {
                        activeValuesList.push({ label: 'Total Gap', val: `${dayStats ? dayStats.gap : 0} Units`, color: '#c2410c', bg: '#fff7ed', border: '#fde68a' });
                    }
                    if (selectedTrends.includes('rejection')) {
                        activeValuesList.push({ label: 'Rejection Rate', val: `${dayRejRate}% (${dayStats ? dayStats.rej : 0} pcs)`, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' });
                    }
                    if (selectedTrends.includes('schedule')) {
                        activeValuesList.push({ label: 'Target Achieved', val: `${dayTargetAchieved}%`, color: '#0d47a1', bg: '#eff6ff', border: '#93c5fd' });
                    }
                    if (selectedTrends.includes('fpy')) {
                        activeValuesList.push({ label: 'Accepted Qty', val: `${dayAcceptedPct}% (${dayAccepted} pcs)`, color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' });
                    }
                    if (selectedTrends.includes('efficiency')) {
                        activeValuesList.push({ label: 'OEE', val: `${dayAvgEff}% (A:${ribbonAvail.toFixed(0)}%×P:${ribbonPerf.toFixed(0)}%×Q:100%)`, color: '#334155', bg: '#f8fafc', border: '#cbd5e1' });
                    }
                    if (selectedTrends.includes('tonnage')) {
                        activeValuesList.push({ label: 'Total Tonnage', val: `${dayTonnage} MT`, color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' });
                    }

                    if (activeValuesList.length === 0) return null;

                    const dateDisplay = activeDateForRibbon
                        ? new Date(activeDateForRibbon).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                        : 'All Dates';

                    return (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            overflowX: 'auto',
                            flexWrap: 'nowrap',
                            gap: 6,
                            marginBottom: 8,
                            padding: '6px 12px',
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            flexShrink: 0,
                            WebkitOverflowScrolling: 'touch'
                        }}>
                            <span style={{
                                fontSize: 10.5,
                                fontWeight: 800,
                                color: '#0b462c',
                                textTransform: 'uppercase',
                                letterSpacing: 0.3,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                marginRight: 4,
                                whiteSpace: 'nowrap',
                                flexShrink: 0
                            }}>
                                <Clock size={12} color="#0b462c" />
                                {dateDisplay} Values:
                            </span>
                            {activeValuesList.map(item => (
                                <span
                                    key={item.label}
                                    style={{
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        color: item.color,
                                        background: item.bg,
                                        border: `1px solid ${item.border}`,
                                        padding: '2px 8px',
                                        borderRadius: 12,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
                                    }}
                                >
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, display: 'inline-block' }}></span>
                                    <span>{item.label}:</span>
                                    <strong style={{ color: item.color }}>{item.val}</strong>
                                </span>
                            ))}
                            {sortedDates.length > 1 && (
                                <span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#94a3b8', fontStyle: 'italic', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                    (Click point or row to switch day)
                                </span>
                            )}
                        </div>
                    );
                })()}

                {/* Line Chart Container with Permanent Data Labels */}
                <div style={{ minHeight: 230, height: 260, width: '100%', position: 'relative', flexShrink: 0 }}>
                    <Line data={data} options={options as any} plugins={[alwaysShowDataLabelsPlugin]} />
                </div>

                {/* Sleek Minimalist Footer Hint Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: '1px solid #f1f5f9',
                    fontSize: 11,
                    color: '#64748b',
                    flexShrink: 0
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Info size={12} color="#0b462c" />
                        Numeric values permanently visible on data points. Click any chart node or table row below to inspect day batches.
                    </span>
                    <span style={{ fontWeight: 600 }}>
                        {sortedDates.length} Days Plotted • {dateRange.start ? `${dateRange.start} to ${dateRange.end}` : 'All Dates'}
                    </span>
                </div>

                {/* Trends Data Table - Always Visible Permanent Daily Breakdown */}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Table size={13} color="#0b462c" />
                            <span style={{ fontSize: 11.5, fontWeight: 800, color: '#0b462c', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                Daily Trend Metrics Summary
                            </span>
                            <span style={{ fontSize: 9.5, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                Always Visible
                            </span>
                        </div>
                        <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>
                            {sortedDates.length} Date Records
                        </span>
                    </div>

                    <div className="table-wrapper" style={{ marginTop: 0, overflowX: 'auto' }}>
                        <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                            <thead>
                                <tr>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Date</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Total Planned</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Total Produced</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Total Gap</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Rejection Rate</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Target Achieved</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Accepted Qty</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>OEE</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Tonnage</th>
                                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedDates.map(d => {
                                    const s = dateMap.get(d);
                                    const dayTargetAchieved = s.planned > 0 ? ((s.actual / s.planned) * 100).toFixed(1) : '0.0';
                                    const dayAccepted = Math.max(0, s.actual - s.rej);
                                    const dayFpy = s.actual > 0 ? ((dayAccepted / s.actual) * 100).toFixed(1) : '0.0';
                                    const dayRejRate = s.actual > 0 ? ((s.rej / s.actual) * 100).toFixed(1) : '0.0';
                                    // OEE per day
                                    const dayDowntimeCount = s.downtimeCount || 0;
                                    const dayWorkingShifts = s.count - dayDowntimeCount;
                                    const dayAvail = s.count > 0 ? (dayWorkingShifts / s.count) * 100 : 0;
                                    const dayPerf = s.planned > 0 ? (s.actual / s.planned) * 100 : 0;
                                    const dayOEEVal = (dayAvail / 100) * (dayPerf / 100) * 1.0 * 100;
                                    const dayAvgEff = dayOEEVal.toFixed(1);
                                    const dayTonnage = s.cw ? s.cw.toFixed(3) : '0.000';
                                    const dateFormatted = new Date(d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

                                    const isRowSelected = selectedTrendDate === d;
                                    return (
                                        <tr
                                            key={d}
                                            style={{
                                                cursor: 'pointer',
                                                background: isRowSelected ? '#ecfdf5' : 'transparent',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onClick={() => {
                                                setSelectedTrendDate(d);
                                                setKpiDate(d);
                                            }}
                                            title="Click to view raw batch logs and highlight date in Active Values Ribbon"
                                        >
                                            <td style={{ fontWeight: 'bold', color: '#004d40', whiteSpace: 'nowrap' }}>
                                                {dateFormatted}
                                            </td>
                                            <td style={{ fontWeight: 'bold' }}>{s.planned}</td>
                                            <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{s.actual}</td>
                                            <td style={{ color: s.gap > 0 ? '#b71c1c' : 'inherit', fontWeight: s.gap > 0 ? 'bold' : 'normal' }}>
                                                {s.gap}
                                            </td>
                                            <td style={{ color: '#b71c1c', fontWeight: 'bold' }}>
                                                {dayRejRate}% <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 500 }}>({s.rej})</span>
                                            </td>
                                            <td style={{ fontWeight: 'bold', color: '#0d47a1' }}>
                                                {dayTargetAchieved}% <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 500 }}>({s.actual}/{s.planned})</span>
                                            </td>
                                            <td style={{ color: '#004d40', fontWeight: 'bold' }}>
                                                {dayFpy}% <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 500 }}>({dayAccepted})</span>
                                            </td>
                                            <td style={{ fontWeight: 'bold', color: Number(dayAvgEff) >= 85 ? '#15803d' : '#854d0e' }}>
                                                {dayAvgEff}%
                                            </td>
                                            <td style={{ fontWeight: 'bold', color: '#00838f', whiteSpace: 'nowrap' }}>
                                                {dayTonnage} MT
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setKpiDate(d);
                                                    }}
                                                    style={{
                                                        background: '#ecfdf5',
                                                        border: '1px solid #a7f3d0',
                                                        color: '#065f46',
                                                        padding: '2px 8px',
                                                        borderRadius: 4,
                                                        fontSize: 10.5,
                                                        fontWeight: 700,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Inspect
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #0b462c', fontWeight: 800 }}>
                                    <td style={{ textAlign: 'right', color: '#0b462c', fontSize: 11 }}>
                                        TOTALS ({sortedDates.length} Days):
                                    </td>
                                    <td style={{ fontWeight: 800, color: '#0f172a' }}>{totalPlanned}</td>
                                    <td style={{ fontWeight: 800, color: '#0b462c' }}>{totalActual}</td>
                                    <td style={{ fontWeight: 800, color: totalGap > 0 ? '#b71c1c' : '#0f172a' }}>{totalGap}</td>
                                    <td style={{ fontWeight: 800, color: '#b71c1c' }}>{scrapRate}% <span style={{ fontSize: 9.5, color: '#64748b' }}>({totalRej})</span></td>
                                    <td style={{ fontWeight: 800, color: '#0d47a1' }}>{scheduleAdherence}% <span style={{ fontSize: 9.5, color: '#64748b' }}>({totalActual}/{totalPlanned})</span></td>
                                    <td style={{ fontWeight: 800, color: '#004d40' }}>{fpy}% <span style={{ fontSize: 9.5, color: '#64748b' }}>({totalAccepted})</span></td>
                                    <td style={{ fontWeight: 800, color: Number(avgEff) >= 85 ? '#15803d' : '#854d0e' }} title={`OEE = Avail(${oeeAvailability.toFixed(1)}%) × Perf(${oeePerformance.toFixed(1)}%) × Q(100%) = ${avgEff}%`}>{avgEff}%</td>
                                    <td style={{ fontWeight: 800, color: '#00838f', whiteSpace: 'nowrap' }}>{totalTonnage} MT</td>
                                    <td>-</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* MODAL OVERLAY: Raw Entries Drilldown (Zero page scroll, clean popup) */}
                {kpiDate && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.45)',
                        backdropFilter: 'blur(3px)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        animation: 'fadeIn 0.2s ease-out'
                    }} onClick={() => setKpiDate(null)}>
                        <div style={{
                            background: 'white',
                            borderRadius: 12,
                            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                            width: '95%',
                            maxWidth: 1200,
                            maxHeight: '85vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            border: '1px solid #cbd5e1'
                        }} onClick={e => e.stopPropagation()}>
                            {/* Modal Header */}
                            <div style={{
                                padding: '14px 20px',
                                background: '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <h4 style={{ margin: 0, color: '#0b462c', fontSize: 16, fontWeight: 'bold' }}>
                                        Raw Production Entries — {new Date(kpiDate).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                    </h4>
                                    <span style={{ fontSize: 11, fontWeight: 'bold', background: '#e8f5e9', color: '#1b5e20', padding: '2px 8px', borderRadius: 10, border: '1px solid #c8e6c9' }}>
                                        {filteredEntries.filter(e => e.date === kpiDate).length} Batches
                                    </span>
                                </div>
                                <button
                                    className="btn-small"
                                    onClick={() => setKpiDate(null)}
                                    style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 6, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}
                                >
                                    <X size={15} /> Close (Esc)
                                </button>
                            </div>

                            {/* Modal Body: Scrollable Table */}
                            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                                <div className="table-wrapper" style={{ maxHeight: '60vh' }}>
                                    <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                        <thead>
                                            <tr>
                                                <th>Trace ID</th>
                                                <th>Shift</th>
                                                <th>Machine</th>
                                                <th>Operator</th>
                                                <th>Part No</th>
                                                <th>Part Name</th>
                                                <th>Shot Wt</th>
                                                <th>Cast Wt</th>
                                                <th>Planned</th>
                                                <th>Produced</th>
                                                <th>Rej</th>
                                                <th>Rejection Details</th>
                                                <th>Gap</th>
                                                <th>Gap Reason</th>
                                                <th>Efficiency</th>
                                                <th>Tonnage</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredEntries.filter(e => e.date === kpiDate).map(e => {
                                                const partInfo = getPartInfo(e);
                                                const cw = typeof partInfo.castingWeight === 'number' ? partInfo.castingWeight : parseFloat(String(partInfo.castingWeight)) || 0;
                                                const actualQty = Number(e.actualQty) || 0;
                                                const tonnageKg = cw * actualQty;
                                                const rowTonnage = tonnageKg > 0 ? (tonnageKg / 1000).toFixed(3) : '0.000';
                                                let rejDetails = '-';
                                                if (e.reasonForRejection) {
                                                    try {
                                                        const parsed = JSON.parse(e.reasonForRejection);
                                                        if (Array.isArray(parsed)) {
                                                            rejDetails = parsed.map((p: any) => `${p.reason} (${p.qty})`).join(', ');
                                                        } else {
                                                            rejDetails = e.reasonForRejection;
                                                        }
                                                    } catch {
                                                        rejDetails = e.reasonForRejection;
                                                    }
                                                }

                                                let gapDetails = [];
                                                if (e.gapReasonManPower) gapDetails.push('Man Power');
                                                if (e.gapReasonMachineBreakdown) gapDetails.push('Breakdown');
                                                if (e.gapReasonMaterialShortage) gapDetails.push('Material');
                                                if (e.gapReasonMethod) gapDetails.push('Method');
                                                const gapReasonText = gapDetails.length > 0 ? gapDetails.join(', ') : '-';

                                                return (
                                                    <tr key={e.id}>
                                                        <td style={{ fontWeight: 'bold', color: '#004d40' }}>{e.traceabilityBatchId}</td>
                                                        <td>{e.shift}</td>
                                                        <td>{e.machineNumber}</td>
                                                        <td>{getOperatorName(e.operatorPunchNo)}</td>
                                                        <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{partInfo.partNo}</td>
                                                        <td style={{ maxWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={partInfo.partName}>{partInfo.partName}</td>
                                                        <td>{partInfo.shotWeight}</td>
                                                        <td>{partInfo.castingWeight}</td>
                                                        <td style={{ color: '#666' }}>{getEffectivePlanned(e)}</td>
                                                        <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{e.actualQty}</td>
                                                        <td style={{ color: '#b71c1c' }}>{e.rejectionQty}</td>
                                                        <td style={{ fontSize: '0.85em', color: '#555', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rejDetails}>{rejDetails}</td>
                                                        <td style={{ color: getEffectiveGap(e) > 0 ? '#b71c1c' : 'inherit' }}>{getEffectiveGap(e)}</td>
                                                        <td style={{ fontSize: '0.85em', color: '#555' }}>{gapReasonText}</td>
                                                        <td>{getEffectivePlanned(e) > 0 ? ((Number(e.actualQty || 0) / getEffectivePlanned(e)) * 100).toFixed(1) : (e.efficiency || 0)}%</td>
                                                        <td style={{ fontWeight: 'bold', color: '#00838f', whiteSpace: 'nowrap' }} title={`${tonnageKg.toFixed(2)} kg`}>{rowTonnage} MT</td>
                                                    </tr>
                                                )
                                            })}
                                            {filteredEntries.filter(e => e.date === kpiDate).length === 0 && (
                                                <tr><td colSpan={16} style={{ textAlign: 'center', padding: 20 }}>No data for this date</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderKpiAnalysisModal = () => {
        if (!activeKpiModal) return null;
        const activeCard = kpiSections.find(c => c.id === activeKpiModal) || kpiSections[0];

        const { dateMap, sortedDates } = kpiDateMapData;
        const mList = performanceData.machineList || [];
        const opList = (performanceData.operatorList || []).slice(0, 15);

        let metricLabel = activeCard.title;
        let isPercentage = false;
        let unit = activeCard.unit || '';
        let themeColor = activeCard.themeColor || '#0b462c';
        let lineValues: number[] = [];
        let machineBarValues: number[] = [];
        let operatorBarValues: number[] = [];

        switch (activeKpiModal) {
            case 'planned_qty':
                metricLabel = 'Total Planned Target (Units)';
                isPercentage = false;
                unit = 'Units';
                themeColor = '#ea580c';
                lineValues = sortedDates.map(d => dateMap.get(d)?.planned || 0);
                machineBarValues = mList.map(m => m.planned || 0);
                operatorBarValues = opList.map(o => o.planned || 0);
                break;
            case 'produced_qty':
                metricLabel = 'Total Produced Output (Units)';
                isPercentage = false;
                unit = 'Units';
                themeColor = '#16a34a';
                lineValues = sortedDates.map(d => dateMap.get(d)?.actual || 0);
                machineBarValues = mList.map(m => m.actual || 0);
                operatorBarValues = opList.map(o => o.actual || 0);
                break;
            case 'gap':
                metricLabel = 'Total Production Gap Shortfall (Units)';
                isPercentage = false;
                unit = 'Units';
                themeColor = '#c2410c';
                lineValues = sortedDates.map(d => dateMap.get(d)?.gap || 0);
                machineBarValues = mList.map(m => m.gap || 0);
                operatorBarValues = opList.map(o => Math.max(0, (o.planned || 0) - (o.actual || 0)));
                break;
            case 'rejection':
                metricLabel = 'Rejection Scrap Rate (%)';
                isPercentage = true;
                unit = '%';
                themeColor = '#dc2626';
                lineValues = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    return s && s.actual > 0 ? parseFloat(((s.rej / s.actual) * 100).toFixed(1)) : 0;
                });
                machineBarValues = mList.map(m => parseFloat((m.rejRate || 0).toFixed(1)));
                operatorBarValues = opList.map(o => parseFloat((o.rejRate || 0).toFixed(1)));
                break;
            case 'schedule':
                metricLabel = 'Target Achieved Rate (%)';
                isPercentage = true;
                unit = '%';
                themeColor = '#0d47a1';
                lineValues = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    return s && s.planned > 0 ? parseFloat(((s.actual / s.planned) * 100).toFixed(1)) : 0;
                });
                machineBarValues = mList.map(m => parseFloat((m.targetAchieved || 0).toFixed(1)));
                operatorBarValues = opList.map(o => parseFloat((o.targetAchieved || 0).toFixed(1)));
                break;
            case 'fpy':
                metricLabel = 'Accepted Qty Yield / FPY (%)';
                isPercentage = true;
                unit = '%';
                themeColor = '#0d9488';
                lineValues = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    if (!s || s.actual === 0) return 0;
                    const acc = Math.max(0, s.actual - s.rej);
                    return parseFloat(((acc / s.actual) * 100).toFixed(1));
                });
                machineBarValues = mList.map(m => m.actual > 0 ? parseFloat(((m.accepted / m.actual) * 100).toFixed(1)) : 0);
                operatorBarValues = opList.map(o => o.actual > 0 ? parseFloat(((o.accepted / o.actual) * 100).toFixed(1)) : 0);
                break;
            case 'efficiency':
                metricLabel = 'OEE (Availability × Performance × Quality)';
                isPercentage = true;
                unit = '%';
                themeColor = '#0b462c';
                lineValues = sortedDates.map(d => {
                    const s = dateMap.get(d);
                    if (!s || s.count === 0) return 0;
                    const shifts = s.count;
                    const down = s.downtimeCount || 0;
                    const working = Math.max(0, shifts - down);
                    const avail = (working / shifts) * 100;
                    const perf = s.planned > 0 ? (s.actual / s.planned) * 100 : 0;
                    const oee = (avail / 100) * (perf / 100) * 1.0 * 100;
                    return parseFloat(oee.toFixed(1));
                });
                machineBarValues = mList.map(m => {
                    const mEntries = filteredEntries.filter(e => String(e.machineNumber) === String(m.machineNumber));
                    const totalShifts = mEntries.length;
                    const downShifts = mEntries.filter(e =>
                        (Number(e.actualQty) === 0) &&
                        (
                            e.gapReasonMachineBreakdown ||
                            (e.remark && e.remark.includes('[MACHINE ISSUE')) ||
                            (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))
                        )
                    ).length;
                    const working = Math.max(0, totalShifts - downShifts);
                    const avail = totalShifts > 0 ? (working / totalShifts) * 100 : 0;
                    const perf = m.planned > 0 ? (m.actual / m.planned) * 100 : 0;
                    const oee = (avail / 100) * (perf / 100) * 1.0 * 100;
                    return parseFloat(oee.toFixed(1));
                });
                operatorBarValues = opList.map(o => parseFloat((o.avgEff || 0).toFixed(1)));
                break;
        }

        const modalFilteredEntries = filteredEntries.filter(e => {
            if (!kpiModalFilter) return true;
            if (kpiModalFilter.type === 'date') return e.date === kpiModalFilter.key;
            if (kpiModalFilter.type === 'machine') return String(e.machineNumber) === kpiModalFilter.key;
            if (kpiModalFilter.type === 'operator') {
                const op = getOperator(e.operatorPunchNo);
                return e.operatorPunchNo === kpiModalFilter.key || op?.punchNo === kpiModalFilter.key || op?.name === kpiModalFilter.key;
            }
            return true;
        });

        const searchedModalEntries = modalFilteredEntries.filter(e => {
            if (!kpiModalSearch.trim()) return true;
            const q = kpiModalSearch.toLowerCase().trim();
            const partInfo = getPartInfo(e);
            const opName = getOperatorName(e.operatorPunchNo).toLowerCase();
            const supName = getSupervisorName(e.operatorPunchNo).toLowerCase();
            const traceId = (e.traceabilityBatchId || '').toLowerCase();
            const mcNo = (e.machineNumber || '').toString().toLowerCase();
            const partNo = (partInfo.partNo || '').toLowerCase();
            const partName = (partInfo.partName || '').toLowerCase();
            return traceId.includes(q) || mcNo.includes(q) || partNo.includes(q) || partName.includes(q) || opName.includes(q) || supName.includes(q);
        });

        const sPlanned = modalFilteredEntries.reduce((s, e) => s + getEffectivePlanned(e), 0);
        const sActual = modalFilteredEntries.reduce((s, e) => s + (Number(e.actualQty) || 0), 0);
        const sRej = modalFilteredEntries.reduce((s, e) => s + (Number(e.rejectionQty) || 0), 0);
        const sAccepted = Math.max(0, sActual - sRej);
        const sGap = modalFilteredEntries.reduce((s, e) => s + getEffectiveGap(e), 0);
        const sTargetAchieved = sPlanned > 0 ? ((sActual / sPlanned) * 100).toFixed(1) : '0.0';
        const sRejRate = sActual > 0 ? ((sRej / sActual) * 100).toFixed(1) : '0.0';
        const sYield = sActual > 0 ? ((sAccepted / sActual) * 100).toFixed(1) : '0.0';

        const sTotalShifts = modalFilteredEntries.length;
        const sDowntimeShifts = modalFilteredEntries.filter(e =>
            (Number(e.actualQty) === 0) &&
            (
                e.gapReasonMachineBreakdown ||
                (e.remark && e.remark.includes('[MACHINE ISSUE')) ||
                (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))
            )
        ).length;
        const sWorkingShifts = sTotalShifts - sDowntimeShifts;
        const sAvail = sTotalShifts > 0 ? (sWorkingShifts / sTotalShifts) * 100 : 0;
        const sPerf = sPlanned > 0 ? (sActual / sPlanned) * 100 : 0;
        const sOEE = ((sAvail / 100) * (sPerf / 100) * 1.0 * 100).toFixed(1);

        const lineChartData = {
            labels: sortedDates.map(d => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })),
            datasets: [
                {
                    label: metricLabel,
                    data: lineValues,
                    borderColor: themeColor,
                    backgroundColor: themeColor + '18',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2.5,
                    pointRadius: sortedDates.length > 20 ? 3 : 5,
                    pointHoverRadius: 8,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: themeColor,
                    pointBorderWidth: 2.5,
                    __isPercentage: isPercentage
                }
            ]
        };

        const lineChartOptions: any = {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 12, right: 14, bottom: 4, left: 6 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx: any) => ` ${metricLabel}: ${ctx.raw}${isPercentage ? '%' : ` ${unit}`}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v: any) => `${v}${isPercentage ? '%' : ''}`
                    },
                    grid: { color: 'rgba(226, 232, 240, 0.7)' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10.5, weight: '600' }
                    }
                }
            },
            onClick: (_e: any, elements: any[]) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedDate = sortedDates[idx];
                    if (clickedDate) {
                        const formatted = new Date(clickedDate).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
                        setKpiModalFilter({
                            type: 'date',
                            key: clickedDate,
                            label: `Date: ${formatted}`
                        });
                    }
                }
            },
            onHover: (event: any, elements: any[]) => {
                if (event?.native?.target) {
                    event.native.target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
                }
            }
        };

        const machineBarData = {
            labels: mList.map(m => `M/C ${m.machineNumber}`),
            datasets: [
                {
                    label: metricLabel,
                    data: machineBarValues,
                    backgroundColor: themeColor + '30',
                    borderColor: themeColor,
                    borderWidth: 2,
                    borderRadius: 6,
                    hoverBackgroundColor: themeColor,
                    __isPercentage: isPercentage
                }
            ]
        };

        const machineBarOptions: any = {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 12, right: 14, bottom: 4, left: 6 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx: any) => ` ${metricLabel}: ${ctx.raw}${isPercentage ? '%' : ` ${unit}`}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v: any) => `${v}${isPercentage ? '%' : ''}`
                    },
                    grid: { color: 'rgba(226, 232, 240, 0.7)' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10.5, weight: '700' }
                    }
                }
            },
            onClick: (_e: any, elements: any[]) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const m = mList[idx];
                    if (m) {
                        setKpiModalFilter({
                            type: 'machine',
                            key: String(m.machineNumber),
                            label: `Machine #${m.machineNumber}`
                        });
                    }
                }
            },
            onHover: (event: any, elements: any[]) => {
                if (event?.native?.target) {
                    event.native.target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
                }
            }
        };

        const operatorBarData = {
            labels: opList.map(o => o.name || o.punchNo),
            datasets: [
                {
                    label: metricLabel,
                    data: operatorBarValues,
                    backgroundColor: themeColor + '30',
                    borderColor: themeColor,
                    borderWidth: 2,
                    borderRadius: 6,
                    hoverBackgroundColor: themeColor,
                    __isPercentage: isPercentage
                }
            ]
        };

        const operatorBarOptions: any = {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 12, right: 14, bottom: 4, left: 6 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleFont: { size: 12, weight: 'bold' },
                    bodyFont: { size: 11 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx: any) => ` ${metricLabel}: ${ctx.raw}${isPercentage ? '%' : ` ${unit}`}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (v: any) => `${v}${isPercentage ? '%' : ''}`
                    },
                    grid: { color: 'rgba(226, 232, 240, 0.7)' }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 10, weight: '600' },
                        maxRotation: opList.length > 8 ? 45 : 0
                    }
                }
            },
            onClick: (_e: any, elements: any[]) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const o = opList[idx];
                    if (o) {
                        setKpiModalFilter({
                            type: 'operator',
                            key: o.punchNo,
                            label: `Operator: ${o.name} (${o.punchNo})`
                        });
                    }
                }
            },
            onHover: (event: any, elements: any[]) => {
                if (event?.native?.target) {
                    event.native.target.style.cursor = elements && elements.length > 0 ? 'pointer' : 'default';
                }
            }
        };

        const modalExportTitle = `${activeCard.title}_${kpiModalFilter ? kpiModalFilter.label : 'All'}`;

        return (
            <div className="kpi-drill-overlay" onClick={() => setActiveKpiModal(null)}>
                <div className="kpi-drill-modal" onClick={e => e.stopPropagation()}>
                    {/* Modal Header */}
                    <div style={{
                        padding: '12px 18px',
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 10
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: activeCard.bg, border: `1px solid ${activeCard.border}`, color: activeCard.valColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BarChart2 size={17} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0b462c' }}>
                                        {activeCard.title} — Graphical Analysis & Drilldown
                                    </h3>
                                    <span style={{ fontSize: 13, fontWeight: 900, color: activeCard.valColor, background: activeCard.bg, border: `1px solid ${activeCard.border}`, padding: '2px 8px', borderRadius: 6 }}>
                                        {activeCard.value} {activeCard.unit || ''}
                                    </span>
                                </div>
                                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                                    {activeCard.tonnageValue ? `${activeCard.tonnageValue} • ` : ''}{activeCard.subValue}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => exportDrillToExcel(modalFilteredEntries, modalExportTitle)}
                                style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '5px 12px', fontSize: 11.5, borderRadius: 6, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                            >
                                <Download size={13} /> Export Excel
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveKpiModal(null)}
                                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                            >
                                <X size={14} /> Close
                            </button>
                        </div>
                    </div>

                    {/* Segmented View Switcher (Pill Tabs) */}
                    <div style={{ display: 'flex', gap: 8, padding: '10px 18px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' }}>
                        <button
                            type="button"
                            onClick={() => setKpiModalTab('trend')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: kpiModalTab === 'trend' ? `1.5px solid ${themeColor}` : '1px solid #cbd5e1',
                                background: kpiModalTab === 'trend' ? themeColor : '#ffffff',
                                color: kpiModalTab === 'trend' ? '#ffffff' : '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <TrendingUp size={13} /> Daily Trend ({sortedDates.length} Days)
                        </button>
                        <button
                            type="button"
                            onClick={() => setKpiModalTab('machine')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: kpiModalTab === 'machine' ? `1.5px solid ${themeColor}` : '1px solid #cbd5e1',
                                background: kpiModalTab === 'machine' ? themeColor : '#ffffff',
                                color: kpiModalTab === 'machine' ? '#ffffff' : '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <Cylinder size={13} /> Machine Breakdown ({mList.length} M/C)
                        </button>
                        <button
                            type="button"
                            onClick={() => setKpiModalTab('operator')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: 20,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                border: kpiModalTab === 'operator' ? `1.5px solid ${themeColor}` : '1px solid #cbd5e1',
                                background: kpiModalTab === 'operator' ? themeColor : '#ffffff',
                                color: kpiModalTab === 'operator' ? '#ffffff' : '#475569',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <Users size={13} /> Operator Ranking ({opList.length} Ops)
                        </button>
                    </div>

                    {/* Chart Container */}
                    <div style={{ padding: '12px 18px 8px', background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ height: 260, position: 'relative' }}>
                            {kpiModalTab === 'trend' && (
                                sortedDates.length > 0 ? (
                                    <Line data={lineChartData} options={lineChartOptions} />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                        No date records found
                                    </div>
                                )
                            )}
                            {kpiModalTab === 'machine' && (
                                mList.length > 0 ? (
                                    <Bar data={machineBarData} options={machineBarOptions} />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                        No machine records found
                                    </div>
                                )
                            )}
                            {kpiModalTab === 'operator' && (
                                opList.length > 0 ? (
                                    <Bar data={operatorBarData} options={operatorBarOptions} />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                        No operator records found
                                    </div>
                                )
                            )}
                        </div>

                        {/* Interactive Hint & Clear Button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                💡 Tap any point or bar on the chart above to filter the detailed records below
                            </span>
                            {kpiModalFilter && (
                                <button
                                    type="button"
                                    onClick={() => setKpiModalFilter(null)}
                                    style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                    Showing: {kpiModalFilter.label} ✕ Clear Filter
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Summary Metric Chips (Progressive Disclosure) */}
                    <div style={{ padding: '8px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6 }}>
                        <div style={{ background: '#fff9f0', border: '1px solid #fed7aa', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>Planned</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#9a3412' }}>{sPlanned} pcs</div>
                        </div>
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#15803d', fontWeight: 700, textTransform: 'uppercase' }}>Produced</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>{sActual} pcs</div>
                        </div>
                        <div style={{ background: '#fff7ed', border: '1px solid #ffedd5', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#c2410c', fontWeight: 700, textTransform: 'uppercase' }}>Gap Shortfall</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#c2410c' }}>{sGap} pcs</div>
                        </div>
                        <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>Rejection</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626' }}>{sRejRate}% ({sRej} rej)</div>
                        </div>
                        <div style={{ background: '#f8fbff', border: '1px solid #c3e0ff', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#1565c0', fontWeight: 700, textTransform: 'uppercase' }}>Target %</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0d47a1' }}>{sTargetAchieved}%</div>
                        </div>
                        <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#0f766e', fontWeight: 700, textTransform: 'uppercase' }}>Accepted Qty</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#0d9488' }}>{sYield}% ({sAccepted} acc)</div>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: '#334155', fontWeight: 700, textTransform: 'uppercase' }}>OEE</div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: Number(sOEE) >= 85 ? '#15803d' : '#0f172a' }}>{sOEE}%</div>
                        </div>
                    </div>

                    {/* Search Strip */}
                    <div style={{ padding: '6px 18px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Search size={14} color="#64748b" />
                        <input
                            type="text"
                            placeholder="Filter records below by Operator, Machine, Part, Trace ID..."
                            value={kpiModalSearch}
                            onChange={e => setKpiModalSearch(e.target.value)}
                            style={{ flex: 1, padding: '5px 10px', fontSize: 11.5, border: '1px solid #cbd5e1', borderRadius: 6, background: '#ffffff' }}
                        />
                        {kpiModalSearch && (
                            <button
                                type="button"
                                onClick={() => setKpiModalSearch('')}
                                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Table Body (Scrollable Detailed Records) */}
                    <div style={{ padding: '8px 18px', overflowY: 'auto', flex: 1, minHeight: 180 }}>
                        <div className="table-wrapper" style={{ maxHeight: '38vh', overflowX: 'auto' }}>
                            <table className="table-fit" style={{ minWidth: 'unset', tableLayout: 'auto', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ position: 'sticky', left: 0, zIndex: 10, background: '#0b462c' }}>Trace ID</th>
                                        <th>Date</th>
                                        <th>Shift</th>
                                        <th>M/C</th>
                                        <th>Die</th>
                                        <th>Operator</th>
                                        <th>Supervisor</th>
                                        <th>Part No</th>
                                        <th>Part Name</th>
                                        <th>Cast Wt</th>
                                        <th>Planned</th>
                                        <th>Actual</th>
                                        <th>Rej</th>
                                        <th>Rejection Reasons</th>
                                        <th>Gap</th>
                                        <th>Gap Reasons</th>
                                        <th>Efficiency</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchedModalEntries.length === 0 ? (
                                        <tr>
                                            <td colSpan={18} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                                                No records found matching "{kpiModalSearch}"
                                            </td>
                                        </tr>
                                    ) : (
                                        searchedModalEntries.map(e => {
                                            const partInfo = getPartInfo(e);
                                            const plan = getEffectivePlanned(e);
                                            const act = Number(e.actualQty) || 0;
                                            const rej = Number(e.rejectionQty) || 0;
                                            const gap = getEffectiveGap(e);
                                            const eff = plan > 0 ? ((act / plan) * 100).toFixed(1) : (Number(e.efficiency) || 0).toFixed(1);
                                            const rejReasons = getRejectionReasons(e);
                                            const gapReasons = getGapReasons(e);
                                            const isDown = act === 0 && (
                                                e.gapReasonMachineBreakdown ||
                                                (e.remark && e.remark.includes('[MACHINE ISSUE')) ||
                                                (e.traceabilityBatchId && e.traceabilityBatchId.includes('DOWN-'))
                                            );

                                            return (
                                                <tr key={e.id || e.traceabilityBatchId}>
                                                    <td style={{ position: 'sticky', left: 0, zIndex: 2, background: '#ffffff', fontWeight: 800, color: '#0b462c', boxShadow: '2px 0 5px rgba(0,0,0,0.06)' }}>
                                                        {e.traceabilityBatchId}
                                                    </td>
                                                    <td>{new Date(e.date).toLocaleDateString()}</td>
                                                    <td>{e.shift || '-'}</td>
                                                    <td style={{ fontWeight: 700 }}>{e.machineNumber}</td>
                                                    <td>{e.dieNo || '-'}</td>
                                                    <td>{getOperatorName(e.operatorPunchNo)}</td>
                                                    <td>{getSupervisorName(e.operatorPunchNo)}</td>
                                                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{partInfo.partNo}</td>
                                                    <td style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={partInfo.partName}>
                                                        {partInfo.partName}
                                                    </td>
                                                    <td>{partInfo.castingWeight || '-'}</td>
                                                    <td style={{ fontWeight: 600 }}>{plan}</td>
                                                    <td style={{ fontWeight: 800, color: '#16a34a' }}>{act}</td>
                                                    <td style={{ fontWeight: 700, color: rej > 0 ? '#dc2626' : '#64748b' }}>{rej}</td>
                                                    <td style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }} title={rejReasons}>
                                                        {rejReasons || '-'}
                                                    </td>
                                                    <td style={{ fontWeight: 700, color: gap > 0 ? '#c2410c' : '#64748b' }}>{gap}</td>
                                                    <td style={{ maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }} title={gapReasons}>
                                                        {gapReasons || '-'}
                                                    </td>
                                                    <td style={{ fontWeight: 700, color: Number(eff) >= 85 ? '#16a34a' : Number(eff) >= 60 ? '#d97706' : '#dc2626' }}>
                                                        {eff}%
                                                    </td>
                                                    <td>
                                                        {isDown ? (
                                                            <span style={{ fontSize: 9, fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 4 }}>
                                                                DOWNTIME
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: 9, fontWeight: 700, background: '#f0fdf4', color: '#166534', padding: '2px 6px', borderRadius: 4 }}>
                                                                NORMAL
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '8px 18px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                            Showing {searchedModalEntries.length} of {modalFilteredEntries.length} entries {kpiModalFilter ? `(Filtered by ${kpiModalFilter.label})` : '(All)'}
                        </span>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => setActiveKpiModal(null)}
                            style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '4px 14px', borderRadius: 6, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0, background: '#f5f7f9', borderRadius: 8, overflow: 'hidden', padding: 4 }}>

            {/* COMPACT & STICKY HEADER SECTION */}
            <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '12px 14px', flexShrink: 0, marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>

                {/* Title & Export Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 6, background: '#e8f5e9', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <BarChart2 size={15} />
                        </div>
                        <h2 style={{ margin: 0, color: '#0b462c', fontSize: '1.05rem', fontWeight: 800, whiteSpace: 'nowrap' }}>Plant Intelligence & Reports</h2>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                            type="button"
                            className="btn"
                            onClick={exportToPDF}
                            style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '4px 9px', fontSize: 11, borderRadius: 6, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        >
                            <FileText size={12} /> PDF
                        </button>
                        <button
                            type="button"
                            className="btn"
                            onClick={exportToExcel}
                            style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 9px', fontSize: 11, borderRadius: 6, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        >
                            <Download size={12} /> Excel
                        </button>
                    </div>
                </div>

                {/* Clean Date Filter Container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#475569' }}>
                            <Filter size={12} color="#0b462c" />
                            <span>Date Filter:</span>
                        </div>
                        {/* 1-Tap Presets */}
                        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <button type="button" onClick={setToday} style={{ fontSize: 10.5, padding: '2px 8px', background: '#ffffff', color: '#0b462c', border: '1px solid #cbd5e1', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>Today</button>
                            <button type="button" onClick={setThisWeek} style={{ fontSize: 10.5, padding: '2px 8px', background: '#ffffff', color: '#0b462c', border: '1px solid #cbd5e1', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>Week</button>
                            <button type="button" onClick={setThisMonth} style={{ fontSize: 10.5, padding: '2px 8px', background: '#ffffff', color: '#0b462c', border: '1px solid #cbd5e1', borderRadius: 4, fontWeight: 700, cursor: 'pointer' }}>Month</button>
                            <button type="button" onClick={resetFilters} style={{ fontSize: 10.5, padding: '2px 6px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }} title="Reset Dates"><RefreshCw size={10} /></button>
                        </div>
                    </div>

                    {/* Inputs Row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="date" style={{ flex: 1, padding: '4px 8px', fontSize: 11.5, border: '1px solid #cbd5e1', borderRadius: 5, background: 'white', boxSizing: 'border-box' }} value={dateRange.start} onChange={e => setDateRange({ ...dateRange, start: e.target.value })} />
                        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>to</span>
                        <input type="date" style={{ flex: 1, padding: '4px 8px', fontSize: 11.5, border: '1px solid #cbd5e1', borderRadius: 5, background: 'white', boxSizing: 'border-box' }} value={dateRange.end} onChange={e => setDateRange({ ...dateRange, end: e.target.value })} />
                    </div>
                </div>

                {/* Executive KPI Metrics Grid - Clean Neutral Cards */}
                <div className="hod-executive-kpi-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                    gap: 7
                }}>
                    {kpiSections.map(card => {
                        const isSelectedInTrends = activeTab === 'trends' && selectedTrends.includes(card.id);
                        const isModalOpen = activeKpiModal === card.id;
                        return (
                            <div
                                key={card.id}
                                onClick={(e) => handleKpiCardClick(card.id, e)}
                                title={isSelectedInTrends
                                    ? `${card.title}: Currently active in Trend chart`
                                    : card.tooltip || `Click to view ${card.title} Graph & Drilldown`
                                }
                                style={{
                                    background: isModalOpen ? '#f0fdf4' : isSelectedInTrends ? '#f0fdf4' : '#ffffff',
                                    padding: '8px 10px',
                                    borderRadius: 8,
                                    border: isModalOpen ? '2px solid #0b462c' : isSelectedInTrends ? '2px solid #0b462c' : '1px solid #e2e8f0',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    boxShadow: isModalOpen
                                        ? '0 3px 10px rgba(11,70,44,0.18)'
                                        : isSelectedInTrends
                                        ? '0 2px 8px rgba(11,70,44,0.15)'
                                        : '0 1px 3px rgba(0,0,0,0.02)',
                                    transition: 'all 0.15s ease',
                                    userSelect: 'none',
                                    minHeight: 74
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                        {card.title}
                                    </span>
                                    {isSelectedInTrends ? (
                                        selectedTrends.length >= trendOptions.length ? (
                                            <span style={{
                                                width: 6,
                                                height: 6,
                                                borderRadius: '50%',
                                                background: '#0b462c',
                                                display: 'inline-block'
                                            }} title="Active in Trend" />
                                        ) : (
                                            <span style={{
                                                fontSize: 8.5,
                                                fontWeight: 800,
                                                background: '#0b462c',
                                                color: 'white',
                                                padding: '1px 5px',
                                                borderRadius: 6
                                            }}>
                                                Active
                                            </span>
                                        )
                                    ) : (
                                        <span style={{
                                            fontSize: 8.5,
                                            fontWeight: 700,
                                            color: '#0b462c',
                                            background: '#e8f5e9',
                                            border: '1px solid #c8e6c9',
                                            padding: '1px 5px',
                                            borderRadius: 6,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 2
                                        }}>
                                            <TrendingUp size={9} /> Graph
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
                                        <span style={{
                                            fontSize: 17,
                                            fontWeight: 800,
                                            color: card.id === 'rejection' ? '#b91c1c' : card.id === 'gap' ? '#c05621' : card.id === 'schedule' ? '#0d47a1' : '#0f172a',
                                            whiteSpace: 'nowrap',
                                            lineHeight: 1.1
                                        }}>
                                            {card.value}
                                        </span>
                                        {card.unit && (
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>
                                                {card.unit}
                                            </span>
                                        )}
                                    </div>

                                    {card.tonnageValue && (
                                        <span style={{
                                            fontSize: 9.5,
                                            fontWeight: 700,
                                            color: card.id === 'planned_qty' ? '#9a3412' : card.id === 'produced_qty' ? '#047857' : card.id === 'schedule' ? '#0d47a1' : '#475569',
                                            background: card.id === 'planned_qty' ? '#fff7ed' : card.id === 'produced_qty' ? '#ecfdf5' : card.id === 'schedule' ? '#eff6ff' : '#f8fafc',
                                            border: `1px solid ${card.id === 'planned_qty' ? '#ffedd5' : card.id === 'produced_qty' ? '#a7f3d0' : card.id === 'schedule' ? '#bfdbfe' : '#e2e8f0'}`,
                                            padding: '1px 5px',
                                            borderRadius: 4,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {card.tonnageValue}
                                        </span>
                                    )}
                                </div>

                                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 9.5, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {card.subValue}
                                    </span>
                                    {card.extraTag && (
                                        <span style={{
                                            fontSize: 8.5,
                                            fontWeight: 700,
                                            color: card.extraTag.color,
                                            background: card.extraTag.bg,
                                            border: card.extraTag.border ? `1px solid ${card.extraTag.border}` : undefined,
                                            padding: '1px 4px',
                                            borderRadius: 3,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {card.extraTag.text}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>

            {/* Navigation Tabs - Horizontal Scrollable Pill Strip */}
            <div className="hod-reports-nav-strip">
                <button className={`btn ${activeTab === 'master' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'master' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('master')}><ScanBarcode size={13} /> Master</button>
                <button className={`btn ${activeTab === 'supervisor' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'supervisor' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('supervisor')}><Users size={13} /> Supervisor</button>
                <button className={`btn ${activeTab === 'operator' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'operator' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('operator')}><UserCog size={13} /> Operator</button>
                <button className={`btn ${activeTab === 'machine' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'machine' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('machine')}><Cylinder size={13} /> Machine</button>
                <button className={`btn ${activeTab === 'die' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'die' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('die')}><Blocks size={13} /> Die</button>
                <button className={`btn ${activeTab === 'performance' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'performance' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('performance')}><Zap size={13} /> Performance</button>
                <button className={`btn ${activeTab === 'trends' ? 'btn-highlight' : ''}`} style={{ ...(activeTab !== 'trends' ? { background: '#fff', border: '1px solid #cbd5e1', color: '#475569' } : {}), padding: '5px 12px', borderRadius: 20, fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setActiveTab('trends')}><Focus size={13} /> Trends</button>
            </div>

            {/* SCROLLABLE DATA AREA */}
            <div style={{
                flex: 1,
                minHeight: 0,
                overflowY: activeTab === 'master' ? 'hidden' : 'auto',
                overflowX: 'hidden',
                background: 'white',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                padding: activeTab === 'trends' ? '10px 14px' : '10px 12px',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {activeTab === 'master' && renderMasterReport()}
                {activeTab === 'supervisor' && renderSupervisorReport()}
                {activeTab === 'operator' && renderOperatorReport()}
                {activeTab === 'machine' && renderMachineReport()}
                {activeTab === 'die' && renderDieReport()}
                {activeTab === 'performance' && renderPerformanceReport()}
                {activeTab === 'trends' && renderTrendAnalysis()}
            </div>

            {/* Dedicated KPI Graphical Analysis & Drilldown Modal */}
            {activeKpiModal && renderKpiAnalysisModal()}
        </div>
    );
}
