import { apiFetch } from '../context/AuthContext';
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useModal } from '../context/ModalContext';
import { Plus, Zap, Edit2, Save, X, Check, Trash2, Settings, Download, BarChart2, Table as TableIcon, LayoutGrid, FileText, Lock, AlertTriangle, AlertCircle, CheckCircle2, Wrench, ShieldCheck, RotateCcw, KeyRound, Eye, EyeOff, Clock, ChevronDown, ChevronUp, RefreshCw, FileSpreadsheet, Filter, Search, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
import { useAuth } from '../context/AuthContext';
import HODReportsView from './HODReportsView';
import ShiftExcelImport from './ShiftExcelImport';

interface Supervisor {
  id: number;
  name: string;
}

interface Operator {
  id: number;
  punchNo: string;
  name: string;
  aliasLetter: string;
  department?: string;
  status?: string;
  supervisorId?: number;
  supervisor?: Supervisor;
}

interface MasterDatabaseRecord {
  partId: number;
  partNo: string;
  partName: string;
  customer: string;
  cycleTime: number;
  productionOutputPerMachine: number;
  targetRev01?: number;
  dispatchTarget?: number;
  calculatedRejectionPercentage?: number;
  rejectionBufferPercentage?: number;
}

interface ProductionEntry {
  id: number;
  traceabilityBatchId: string;
  date: string;
  shift: string;
  operatorPunchNo: string;
  partId: number;
  planId: number | null;
  machineNumber: string;
  dieNo: string;
  cycleTime: number;
  plannedQty: number;
  actualQty: number;
  gap: number;
  gapReasonManPower: boolean;
  gapReasonMachineBreakdown: boolean;
  gapReasonMaterialShortage: boolean;
  gapReasonMethod: boolean;
  gapQtyManPower?: number;
  gapQtyMachineBreakdown?: number;
  gapQtyMaterialShortage?: number;
  gapQtyMethod?: number;
  gapSubReasonManPower?: string;
  gapSubReasonMachineBreakdown?: string;
  gapSubReasonMaterialShortage?: string;
  gapSubReasonMethod?: string;
  gapCustomNoteManPower?: string;
  gapCustomNoteMachineBreakdown?: string;
  gapCustomNoteMaterialShortage?: string;
  gapCustomNoteMethod?: string;
  rejectionQty: number;
  reasonForRejection: string;
  efficiency: number;
  remark: string;
  status: string;
  returnReason: string;
  createdAt?: string;
  part?: { 
    id?: number; 
    partNo: string; 
    partName?: string; 
    shotWeight?: number; 
    castingWeight?: number; 
    cycleTime?: number; 
  };
  partSearchText?: string;
  operatorSearchText?: string;
  parsedRejections?: { reason: string; qty: number; note?: string }[];
  // Machine Issue / Zero Production workflow fields
  hasIssue?: boolean;
  issueReasonCategory?: string;
  issueDetails?: string;
  downtimeHours?: number;
}

// Helper to calculate and format Production Loss Hours based on standard 10-hour shift
// Formula: (Lost Qty / Shift Target) * 10 hrs
export const formatLossHours = (qty: number, planned?: number): string => {
  if (!planned || planned <= 0 || !qty || qty <= 0) return '0 hrs';
  const exact = (qty / planned) * 10;
  const hrsStr = exact % 1 === 0 ? `${exact} hrs` : `${exact.toFixed(1)} hrs`;
  const totalMinutes = Math.round((qty / planned) * 600);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0 || exact % 1 === 0) {
    return hrsStr;
  }
  return `${hrsStr} (${h}h ${m}m)`;
};

export const DEFAULT_GAP_REASONS: Record<string, string[]> = {
  'Manpower': ['Health Issue', 'Not Available', 'Leave (informed)', 'Leave (not informed)', 'Others'],
  'Machine Breakdown': ['Tilt Issue', 'Auto Issue', 'Furnace Issue', 'Die Maintenance', 'Others'],
  'Raw Material': ['Ingot not available', 'Raiser', 'Rotary Metal Delay', 'Others'],
  'Method': ['Method Setup Issue', 'Cycle Parameter Variation', 'Others']
};

export const STANDARD_REJECTION_REASONS = [
  'Warm Shot',
  'Unfill',
  'Flash problem',
  'Coating Issue',
  'Coating Peeloff',
  'Sand Drop',
  'Metal Catchup',
  'Others'
];

export interface ParsedDefectItem {
  reason: string;
  qty: number;
  note?: string;
}

export const parseDefectReasons = (raw?: string | null, fallbackTotalQty: number = 0): ParsedDefectItem[] => {
  if (!raw || !String(raw).trim()) {
    if (fallbackTotalQty > 0) {
      return [{ reason: 'Unspecified', qty: fallbackTotalQty }];
    }
    return [];
  }

  const str = String(raw).trim();

  // 1. Try parsing JSON array or object
  if (str.startsWith('[') || str.startsWith('{')) {
    try {
      const parsed = JSON.parse(str);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const validItems: ParsedDefectItem[] = [];

      for (const item of items) {
        if (!item) continue;
        const reason = String(item.reason || item.defect || item.name || 'Defect').trim();
        const qty = Number(item.qty || item.count || item.quantity) || 0;
        const note = item.note ? String(item.note).trim() : undefined;
        validItems.push({ reason, qty, note });
      }

      if (validItems.length > 0) {
        if (validItems.length === 1 && validItems[0].qty === 0 && fallbackTotalQty > 0) {
          validItems[0].qty = fallbackTotalQty;
        }
        return validItems;
      }
    } catch {
      // Fall through to regex-based parsing
    }
  }

  // 2. Parse comma/semicolon/newline separated string
  const parts = str.split(/[,;\n]+/).map(p => p.trim()).filter(Boolean);
  const result: ParsedDefectItem[] = [];

  for (const part of parts) {
    // "Reason (qty)" or "Reason(qty)"
    const matchParen = part.match(/^(.*?)\s*\((\d+)\)\s*(.*)$/);
    if (matchParen) {
      const reason = matchParen[1].trim() || 'Defect';
      const qty = parseInt(matchParen[2], 10);
      const note = matchParen[3].trim() || undefined;
      result.push({ reason, qty, note });
      continue;
    }

    // "qty x Reason" or "qty*Reason"
    const matchPrefix = part.match(/^(\d+)\s*[xX*]\s*(.*?)$/);
    if (matchPrefix) {
      const qty = parseInt(matchPrefix[1], 10);
      const reason = matchPrefix[2].trim() || 'Defect';
      result.push({ reason, qty });
      continue;
    }

    // Just plain text reason name
    result.push({ reason: part, qty: 0 });
  }

  if (result.length > 0) {
    const hasAnyQty = result.some(r => r.qty > 0);
    if (!hasAnyQty && fallbackTotalQty > 0) {
      if (result.length === 1) {
        result[0].qty = fallbackTotalQty;
      }
    }
    return result;
  }

  return [{ reason: str, qty: fallbackTotalQty }];
};

export const formatRejectionReasons = (raw?: string | null, fallbackTotalQty: number = 0): string => {
  if (!raw || !String(raw).trim()) return '-';
  const parsed = parseDefectReasons(raw, fallbackTotalQty);
  if (!parsed || parsed.length === 0) return '-';

  return parsed.map(item => {
    const qtyPart = item.qty > 0 ? `${item.qty}x ` : '';
    const notePart = item.note ? ` (${item.note})` : '';
    return `${qtyPart}${item.reason}${notePart}`;
  }).join(', ');
};

export const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ProductionEntryScreen() {
  const { showAlert, showConfirm } = useModal();
  const { role, username } = useAuth();
  const isAdmin = role?.toLowerCase() === 'admin';
  const isHOD = role?.toLowerCase() === 'hod' || username?.toLowerCase() === 'hod' || (role?.toLowerCase() === 'department' && (username?.toLowerCase() === 'production' || username?.toLowerCase() === 'hod'));
  const isHODOrAdmin = isAdmin || isHOD;
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [masterParts, setMasterParts] = useState<MasterDatabaseRecord[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Master Reasons Database State
  const [dbGapReasons, setDbGapReasons] = useState<{ id: number; category: string; reasonName: string; isActive: boolean }[]>([]);
  const [dbRejectionReasons, setDbRejectionReasons] = useState<{ id: number; category: string; reasonName: string; isActive: boolean }[]>([]);

  // Quick Create Gap Reason State
  const [showQuickGapModal, setShowQuickGapModal] = useState(false);
  const [quickGapForm, setQuickGapForm] = useState({ category: 'Manpower', reasonName: '', rowIndex: 0 });

  const DRAFT_KEY = 'amac_production_entry_draft_v2';

  // Lazy initialize state from localStorage to prevent loss of draft data across tab navigation
  const [isEditing, setIsEditing] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('amac_production_entry_draft_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Boolean(parsed?.isEditing);
      }
    } catch {}
    return false;
  });

  const [activeMachineIndex, setActiveMachineIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('amac_production_entry_draft_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.activeMachineIndex === 'number') return parsed.activeMachineIndex;
      }
    } catch {}
    return 0;
  });

  const [draftSavedTime, setDraftSavedTime] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('amac_production_entry_draft_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed?.timestamp || null;
      }
    } catch {}
    return null;
  });
  
  // Bulk Entry State
  const [sessionHeader, setSessionHeader] = useState(() => {
    try {
      const saved = localStorage.getItem('amac_production_entry_draft_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.sessionHeader) return parsed.sessionHeader;
      }
    } catch {}
    return { 
      date: getTodayDateString(), 
      shift: 'Shift A', 
      supervisorId: '' 
    };
  });

  const [entryRows, setEntryRows] = useState<Partial<ProductionEntry>[]>(() => {
    try {
      const saved = localStorage.getItem('amac_production_entry_draft_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.entryRows) && parsed.entryRows.length > 0) {
          return parsed.entryRows;
        }
      }
    } catch {}
    return [{
      rejectionQty: 3,
      parsedRejections: [{ reason: 'Warm Shot', qty: 3 }]
    }];
  });
  
  // Quick Create Operator State
  const [showOpModal, setShowOpModal] = useState(false);
  const [newOp, setNewOp] = useState({ punchNo: '', name: '', aliasLetter: '', department: 'Production', shift: 'Shift A', status: 'Active' });

  // Tab and Report States
  const [activeTab, setActiveTab] = useState<'entry' | 'approvals' | 'reports'>(() => {
    const isHODUser = role?.toLowerCase() === 'hod' || username?.toLowerCase() === 'hod' || (role?.toLowerCase() === 'department' && (username?.toLowerCase() === 'production' || username?.toLowerCase() === 'hod'));
    return isHODUser ? 'approvals' : 'entry';
  });

  useEffect(() => {
    const isHODUser = role?.toLowerCase() === 'hod' || username?.toLowerCase() === 'hod' || (role?.toLowerCase() === 'department' && (username?.toLowerCase() === 'production' || username?.toLowerCase() === 'hod'));
    if (isHODUser) {
      setActiveTab('approvals');
    }
  }, [role, username]);

  // HOD Supervisor Password Management & Review State
  const [supUsers, setSupUsers] = useState<{ id: number; username: string; role: string; department: string }[]>([]);
  const [selectedSupId, setSelectedSupId] = useState<number | null>(null);
  const [newSupPassword, setNewSupPassword] = useState('');
  const [confirmSupPassword, setConfirmSupPassword] = useState('');
  const [showSupPwd, setShowSupPwd] = useState(false);
  const [showSupPwdCard, setShowSupPwdCard] = useState(false);
  const [pwdUpdating, setPwdUpdating] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [expandedShiftKey, setExpandedShiftKey] = useState<string | null>(null);
  const [expandedBannerShiftKey, setExpandedBannerShiftKey] = useState<string | null>(null);
  const [analyseModalShift, setAnalyseModalShift] = useState<any | null>(null);
  const [modalFilterSearch, setModalFilterSearch] = useState<string>('');
  const [historySearch, setHistorySearch] = useState('');

  // Shift Excel Import & Table Filter States
  const location = useLocation();
  const [showShiftImportModal, setShowShiftImportModal] = useState(false);
  const [tableDateFilter, setTableDateFilter] = useState<string>(() => getTodayDateString());
  const [tableShiftFilter, setTableShiftFilter] = useState<string>('All');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableViewMode, setTableViewMode] = useState<'cards' | 'table'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table');
  const [historyViewMode, setHistoryViewMode] = useState<'cards' | 'table'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table');
  const [expandedViewMode, setExpandedViewMode] = useState<'cards' | 'table'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table');
  const [showDisciplineDetails, setShowDisciplineDetails] = useState<boolean>(false);

  // Handle navigation from ShiftExcelImport with state
  useEffect(() => {
    if (location.state?.date && location.state?.shift) {
      setSessionHeader((prev: any) => ({
        ...prev,
        date: location.state.date,
        shift: location.state.shift
      }));
      setTableDateFilter(location.state.date);
      setTableShiftFilter(location.state.shift);
      setIsEditing(true);
      setActiveTab('entry');
    }
  }, [location.state]);

  // Filtered entries for bottom table
  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (tableDateFilter) {
        const eDate = e.date ? e.date.split('T')[0] : '';
        if (eDate !== tableDateFilter) return false;
      }
      if (tableShiftFilter && tableShiftFilter !== 'All') {
        if (e.shift !== tableShiftFilter) return false;
      }
      if (tableSearch.trim()) {
        const q = tableSearch.trim().toLowerCase();
        const partNo = ((e as any).part?.partNo || '').toLowerCase();
        const partName = ((e as any).part?.partName || '').toLowerCase();
        const mc = (e.machineNumber || '').toLowerCase();
        const trace = (e.traceabilityBatchId || '').toLowerCase();
        const op = operators.find(o => o.punchNo === e.operatorPunchNo || o.aliasLetter === e.operatorPunchNo || o.name === e.operatorPunchNo);
        const opName = (op?.name || '').toLowerCase();
        const opPunch = (e.operatorPunchNo || '').toLowerCase();
        if (!partNo.includes(q) && !partName.includes(q) && !mc.includes(q) && !trace.includes(q) && !opName.includes(q) && !opPunch.includes(q)) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const dCompare = b.date.localeCompare(a.date);
      if (dCompare !== 0) return dCompare;
      if (a.shift !== b.shift) return b.shift.localeCompare(a.shift);
      const mcA = parseInt(a.machineNumber) || 0;
      const mcB = parseInt(b.machineNumber) || 0;
      return mcA - mcB;
    });
  }, [entries, tableDateFilter, tableShiftFilter, tableSearch, operators]);

  // Helper: Get all machines already recorded in DB for current session's Date & Shift
  const getCompletedMachinesForSession = (currentEditId?: number) => {
    return entries.filter(e => {
      if (currentEditId && e.id === currentEditId) return false;
      const eDate = e.date ? e.date.split('T')[0] : '';
      return eDate === sessionHeader.date && e.shift === sessionHeader.shift;
    });
  };

  // Helper: Find next available machine number (1, 2, 3...) not already in DB and not used in other form rows
  const getNextAvailableMachineNumber = (excludeMcList: string[] = [], currentEditId?: number): string => {
    const completed = getCompletedMachinesForSession(currentEditId).map(e => (e.machineNumber || '').trim());
    const used = new Set([...completed, ...excludeMcList]);

    for (let i = 1; i <= 30; i++) {
      const candidate = i.toString();
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return (excludeMcList.length + 1).toString();
  };

  // Autosave draft to localStorage on any state change
  useEffect(() => {
    if (isEditing) {
      const hasContent = entryRows.some(r => r.operatorPunchNo || r.partId || r.actualQty !== undefined || r.rejectionQty || r.issueDetails || r.dieNo);
      if (hasContent || sessionHeader.supervisorId || entryRows.length > 1) {
        try {
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          localStorage.setItem(DRAFT_KEY, JSON.stringify({
            sessionHeader,
            entryRows,
            isEditing: true,
            activeMachineIndex,
            timestamp: nowStr
          }));
          setDraftSavedTime(nowStr);
        } catch (e) {
          console.warn('Draft save error:', e);
        }
      }
    }
  }, [sessionHeader, entryRows, isEditing, activeMachineIndex]);

  // Auto-assign next available machine for new entries if machine 1 (or prior) is already completed
  useEffect(() => {
    if (isEditing && entries.length > 0) {
      const completedMcList = getCompletedMachinesForSession().map(e => (e.machineNumber || '').trim());
      
      if (entryRows.length === 1 && !entryRows[0].id) {
        const row = entryRows[0];
        const isBlank = !row.operatorPunchNo && !row.partId && (row.actualQty === undefined || row.actualQty === null);
        const curMc = (row.machineNumber || '').trim();
        const nextLowest = getNextAvailableMachineNumber([]);

        if (isBlank && curMc !== nextLowest) {
          setEntryRows([{
            ...row,
            machineNumber: nextLowest,
            rejectionQty: row.rejectionQty !== undefined ? row.rejectionQty : 3,
            parsedRejections: (row.parsedRejections && row.parsedRejections.length > 0) ? row.parsedRejections : [{ reason: 'Warm Shot', qty: 3 }]
          }]);
          setActiveMachineIndex(0);
        } else if (!isBlank && completedMcList.includes(curMc)) {
          setEntryRows([{ ...row, machineNumber: nextLowest }]);
        }
      } else if (entryRows.length > 1) {
        let hasConflict = false;
        const usedInForm: string[] = [];
        const adjusted = entryRows.map((row) => {
          if (row.id) return row;
          const curMc = (row.machineNumber || '').trim();
          if (!curMc || completedMcList.includes(curMc) || usedInForm.includes(curMc)) {
            hasConflict = true;
            const nextMc = getNextAvailableMachineNumber(usedInForm);
            usedInForm.push(nextMc);
            return { ...row, machineNumber: nextMc };
          }
          usedInForm.push(curMc);
          return row;
        });
        if (hasConflict) {
          setEntryRows(adjusted);
        }
      }
    }
  }, [entries, sessionHeader.date, sessionHeader.shift]);

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftSavedTime(null);
    const nextMc = getNextAvailableMachineNumber([]);
    setEntryRows([{
      machineNumber: nextMc,
      rejectionQty: 3,
      parsedRejections: [{ reason: 'Warm Shot', qty: 3 }]
    }]);
    setActiveMachineIndex(0);
    setIsEditing(false);
  };

  useEffect(() => {
    fetchData();
  }, [sessionHeader.date]);

  // ── SEQUENTIAL SHIFT & DAY DISCIPLINE ENGINE ──────────────────────────
  const checkShiftDiscipline = (dateStr: string, shiftStr: string): { isLocked: boolean; reason: string; priorShiftLabel: string; priorStatus: string } => {
    if (!dateStr || !shiftStr) {
      return { isLocked: false, reason: '', priorShiftLabel: '', priorStatus: '' };
    }

    // 1. If Shift B is selected: Must check Shift A of the same date
    if (shiftStr === 'Shift B') {
      const shiftAEntries = entries.filter(e => {
        const eDate = e.date ? e.date.split('T')[0] : '';
        return eDate === dateStr && e.shift === 'Shift A';
      });

      if (shiftAEntries.length === 0) {
        return {
          isLocked: true,
          priorShiftLabel: `Shift A (Morning) on ${dateStr}`,
          priorStatus: 'Not Started',
          reason: `Shift A (Morning) for ${dateStr} has not been filled yet. Shift A Supervisor must complete all machine entries first.`
        };
      }

      const hasDraft = shiftAEntries.some(e => e.status === 'Draft' || !e.status);
      if (hasDraft) {
        return {
          isLocked: true,
          priorShiftLabel: `Shift A (Morning) on ${dateStr}`,
          priorStatus: 'Draft',
          reason: `Shift A entries for ${dateStr} are currently in Draft. Shift A Supervisor must submit all machines for approval before Shift B can begin.`
        };
      }

      const hasReturned = shiftAEntries.some(e => e.status === 'Returned');
      if (hasReturned) {
        const returnNotes = shiftAEntries.find(e => e.returnReason)?.returnReason || 'Corrections needed';
        return {
          isLocked: true,
          priorShiftLabel: `Shift A (Morning) on ${dateStr}`,
          priorStatus: 'Returned',
          reason: `Shift A entries for ${dateStr} were Returned by HOD ("${returnNotes}"). Shift A Supervisor must fix the issues and re-submit.`
        };
      }

      const allApproved = shiftAEntries.every(e => e.status === 'Approved');
      if (!allApproved) {
        return {
          isLocked: true,
          priorShiftLabel: `Shift A (Morning) on ${dateStr}`,
          priorStatus: 'Awaiting HOD Approval',
          reason: `Shift A entries for ${dateStr} are submitted and waiting for HOD Approval. Once HOD approves Shift A, Shift B will automatically unlock.`
        };
      }

      return { isLocked: false, reason: '', priorShiftLabel: `Shift A on ${dateStr}`, priorStatus: 'Approved' };
    }

    // 2. If Shift A is selected: Must check prior working day's Shift B
    if (shiftStr === 'Shift A') {
      const priorDates = Array.from(new Set(
        entries
          .map(e => e.date ? e.date.split('T')[0] : '')
          .filter(d => d && d < dateStr)
      )).sort();

      if (priorDates.length === 0) {
        // First entry date in database
        return { isLocked: false, reason: '', priorShiftLabel: '', priorStatus: 'Approved' };
      }

      const prevDate = priorDates[priorDates.length - 1];
      const prevDayEntries = entries.filter(e => {
        const eDate = e.date ? e.date.split('T')[0] : '';
        return eDate === prevDate;
      });

      const prevShiftB = prevDayEntries.filter(e => e.shift === 'Shift B');
      const targetPrevShift = prevShiftB.length > 0 ? prevShiftB : prevDayEntries;
      const targetShiftName = prevShiftB.length > 0 ? 'Shift B' : 'Shift A';

      const hasDraft = targetPrevShift.some(e => e.status === 'Draft' || !e.status);
      if (hasDraft) {
        return {
          isLocked: true,
          priorShiftLabel: `${targetShiftName} on ${prevDate}`,
          priorStatus: 'Draft',
          reason: `Previous working day's (${prevDate}) ${targetShiftName} is still in Draft. It must be submitted and approved before starting ${dateStr}.`
        };
      }

      const hasReturned = targetPrevShift.some(e => e.status === 'Returned');
      if (hasReturned) {
        return {
          isLocked: true,
          priorShiftLabel: `${targetShiftName} on ${prevDate}`,
          priorStatus: 'Returned',
          reason: `Previous working day's (${prevDate}) ${targetShiftName} was Returned by HOD. It must be corrected and approved before starting a new day.`
        };
      }

      const allApproved = targetPrevShift.every(e => e.status === 'Approved');
      if (!allApproved) {
        return {
          isLocked: true,
          priorShiftLabel: `${targetShiftName} on ${prevDate}`,
          priorStatus: 'Awaiting HOD Approval',
          reason: `Previous working day's (${prevDate}) ${targetShiftName} is awaiting HOD Approval. Once HOD approves it, ${dateStr} Shift A will unlock.`
        };
      }

      return { isLocked: false, reason: '', priorShiftLabel: `${targetShiftName} on ${prevDate}`, priorStatus: 'Approved' };
    }

    return { isLocked: false, reason: '', priorShiftLabel: '', priorStatus: '' };
  };

  // Group all shifts for HOD Approval Queue and Supervisor Confirmation Status Tracker
  const groupedShifts = useMemo(() => {
    const shiftMap: Record<string, {
      date: string;
      shift: string;
      status: 'Submitted' | 'Approved' | 'Returned' | 'Draft';
      count: number;
      totalPlanned: number;
      totalProduced: number;
      totalRej: number;
      totalGap: number;
      supervisor: string;
      returnReason?: string;
      machines: ProductionEntry[];
    }> = {};

    entries.forEach(e => {
      const dStr = e.date ? e.date.split('T')[0] : '';
      const key = `${dStr}_${e.shift}`;
      if (!shiftMap[key]) {
        let remarkSup = '';
        if (e.remark) {
          const match = e.remark.match(/\[Supervisor:\s*([^\]]+)\]/) || e.remark.match(/\(Supervisor:\s*([^)]+)\)/);
          if (match) remarkSup = match[1].trim();
        }

        const op = operators.find(o => o.punchNo === e.operatorPunchNo || o.aliasLetter === e.operatorPunchNo || o.name === e.operatorPunchNo);
        const supFromOp = op?.supervisorId ? supervisors.find(s => s.id === op.supervisorId)?.name : '';
        const supFromId = (e as any).supervisorId ? supervisors.find(s => s.id.toString() === (e as any).supervisorId)?.name : '';
        const curSessionSup = sessionHeader.supervisorId ? supervisors.find(s => s.id.toString() === sessionHeader.supervisorId)?.name : '';

        const supervisorDisplay = remarkSup || supFromId || supFromOp || (e as any).supervisorName || curSessionSup || (supervisors.length > 0 ? supervisors[0].name : 'Production Supervisor');

        shiftMap[key] = {
          date: dStr,
          shift: e.shift,
          status: (e.status as any) || 'Draft',
          count: 0,
          totalPlanned: 0,
          totalProduced: 0,
          totalRej: 0,
          totalGap: 0,
          supervisor: supervisorDisplay,
          returnReason: e.returnReason || '',
          machines: []
        };
      }
      shiftMap[key].count += 1;
      shiftMap[key].totalPlanned += (e.plannedQty || 0);
      shiftMap[key].totalProduced += (e.actualQty || 0);
      shiftMap[key].totalRej += (e.rejectionQty || 0);
      shiftMap[key].totalGap += (e.gap || 0);
      shiftMap[key].machines.push(e);

      // Status resolution for the batch: Returned > Submitted > Approved > Draft
      if (e.status === 'Returned') {
        shiftMap[key].status = 'Returned';
      } else if (e.status === 'Submitted' && shiftMap[key].status !== 'Returned') {
        shiftMap[key].status = 'Submitted';
      }
      if (e.returnReason && !shiftMap[key].returnReason) {
        shiftMap[key].returnReason = e.returnReason;
      }
    });

    return Object.values(shiftMap).sort((a, b) => b.date.localeCompare(a.date));
  }, [entries, supervisors, operators]);

  const pendingShiftApprovals = useMemo(() => {
    return groupedShifts.filter(s => s.status === 'Submitted');
  }, [groupedShifts]);

  // Executive Plant Health & Shift Governance Metrics for HOD
  const executiveMetrics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayShifts = groupedShifts.filter(s => s.date === todayStr);
    const targetShifts = todayShifts.length > 0 ? todayShifts : groupedShifts.slice(0, 2);

    const totalPlanned = targetShifts.reduce((sum, s) => sum + (s.totalPlanned || 0), 0);
    const totalProduced = targetShifts.reduce((sum, s) => sum + (s.totalProduced || 0), 0);
    const totalRej = targetShifts.reduce((sum, s) => sum + (s.totalRej || 0), 0);
    const totalGap = targetShifts.reduce((sum, s) => sum + (s.totalGap || 0), 0);
    const acceptedQty = Math.max(0, totalProduced - totalRej);
    const rejPct = totalProduced > 0 ? ((totalRej / totalProduced) * 100).toFixed(1) : '0.0';
    const fulfillmentPct = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 100) : (totalProduced > 0 ? 100 : 0);

    const allMachines = targetShifts.flatMap(s => s.machines || []);
    const uniqueMachineSet = new Set(allMachines.map(m => m.machineNumber));
    const activeMachinesCount = uniqueMachineSet.size;
    const downtimeCount = allMachines.filter(m => (m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:'))))).length;

    // OEE for Executive Plant Health: Availability × Performance × Quality(100%)
    const execAvail = allMachines.length > 0 ? ((allMachines.length - downtimeCount) / allMachines.length) * 100 : 0;
    const execPerf  = totalPlanned > 0 ? (totalProduced / totalPlanned) * 100 : 0;
    const execOEE   = (execAvail / 100) * (execPerf / 100) * 1.0 * 100;
    const avgEfficiency = execOEE.toFixed(1);

    const latestApproved = groupedShifts.find(s => s.status === 'Approved') || null;

    return {
      isToday: todayShifts.length > 0,
      targetShifts,
      totalPlanned,
      totalProduced,
      totalRej,
      totalGap,
      acceptedQty,
      rejPct,
      fulfillmentPct,
      activeMachinesCount,
      downtimeCount,
      avgEfficiency,
      oeeAvailability: execAvail.toFixed(0),
      oeePerformance: execPerf.toFixed(0),
      latestApproved
    };
  }, [groupedShifts]);

  // Fetch Supervisor accounts for HOD password management
  const fetchSupervisorAccounts = async () => {
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/users`);
      if (res.ok) {
        const list = await res.json();
        const supList = list.filter((u: any) => u.role === 'Supervisor' || u.username === 'supervisor');
        setSupUsers(supList);
        if (supList.length > 0 && !selectedSupId) {
          setSelectedSupId(supList[0].id);
        }
      }
    } catch (e) {
      console.error('Error fetching supervisors', e);
    }
  };

  useEffect(() => {
    if (isHODOrAdmin) {
      fetchSupervisorAccounts();
    }
  }, [isHODOrAdmin]);

  const handleUpdateSupervisorPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupId) {
      showAlert('Validation Error', 'Please select a supervisor account.');
      return;
    }
    if (!newSupPassword || newSupPassword.length < 4) {
      showAlert('Validation Error', 'Password must be at least 4 characters long.');
      return;
    }
    if (newSupPassword !== confirmSupPassword) {
      showAlert('Password Mismatch', 'New Password and Confirm Password do not match.');
      return;
    }
    setPwdUpdating(true);
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/users/${selectedSupId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newSupPassword })
      });
      if (res.ok) {
        setPwdSuccess('Supervisor password updated successfully!');
        setNewSupPassword('');
        setConfirmSupPassword('');
        showAlert('Password Updated', 'The Supervisor login password has been changed successfully. The supervisor can now log in using the new password.');
        setTimeout(() => setPwdSuccess(''), 4000);
      } else {
        showAlert('Error', 'Failed to update supervisor password. Please try again.');
      }
    } catch (err: any) {
      showAlert('Error', err.message || 'Network error updating password.');
    } finally {
      setPwdUpdating(false);
    }
  };

  // HOD Batch Shift Action (Approve or Return)
  const handleShiftHODAction = async (dateStr: string, shiftStr: string, action: 'Approve' | 'Return') => {
    if (action === 'Return') {
      const reason = window.prompt(`Enter reason for returning ${dateStr} (${shiftStr}) to supervisor for correction:`);
      if (reason === null) return;
      if (!reason.trim()) {
        showAlert('Reason Required', 'A reason is required when returning a shift.');
        return;
      }
      try {
        const res = await apiFetch(`http://${window.location.hostname}:4900/api/productionentries/shift-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: dateStr, shift: shiftStr, action: 'Return', returnReason: reason.trim() })
        });
        if (!res.ok) {
          const err = await res.json();
          showAlert('Action Failed', err.message || 'Failed to return shift.');
          return;
        }
        showAlert('Shift Returned', `Shift ${shiftStr} on ${dateStr} has been returned to supervisor with reason: "${reason.trim()}".`);
        fetchData();
      } catch (e: any) {
        showAlert('Error', e.message || 'Failed to process return.');
      }
    } else {
      showConfirm(
        'Approve Production Shift',
        `Approve all machine entries for ${shiftStr} on ${dateStr}?\n\nThis officially approves the shift and unlocks the next shift for entry.`,
        async () => {
          try {
            const res = await apiFetch(`http://${window.location.hostname}:4900/api/productionentries/shift-action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ date: dateStr, shift: shiftStr, action: 'Approve' })
            });
            if (!res.ok) {
              const err = await res.json();
              showAlert('Action Failed', err.message || 'Failed to approve shift.');
              return;
            }
            showAlert('Shift Approved', `✓ Shift ${shiftStr} on ${dateStr} has been successfully approved! Next shift is now unlocked.`);
            fetchData();
          } catch (e: any) {
            showAlert('Error', e.message || 'Failed to process approval.');
          }
        }
      );
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const monthYear = sessionHeader.date.substring(0, 7);
      const [entryRes, opRes, partsRes, supRes, gapRes, rejRes] = await Promise.all([
        apiFetch(`http://${window.location.hostname}:4900/api/productionentries`),
        apiFetch(`http://${window.location.hostname}:4900/api/operators`),
        apiFetch(`http://${window.location.hostname}:4900/api/masterdatabase?monthYear=${monthYear}`),
        apiFetch(`http://${window.location.hostname}:4900/api/supervisors`),
        apiFetch(`http://${window.location.hostname}:4900/api/gapreasons?department=Production`),
        apiFetch(`http://${window.location.hostname}:4900/api/rejectionreasons?department=Production`)
      ]);
      if (entryRes.ok) setEntries(await entryRes.json());
      if (opRes.ok) setOperators(await opRes.json());
      if (partsRes.ok) setMasterParts(await partsRes.json());
      if (supRes.ok) {
        const supList = await supRes.json();
        setSupervisors(supList);
        if (supList.length > 0) {
          setSessionHeader((prev: any) => (!prev.supervisorId ? { ...prev, supervisorId: supList[0].id.toString() } : prev));
        }
      }
      if (gapRes.ok) setDbGapReasons(await gapRes.json());
      if (rejRes.ok) setDbRejectionReasons(await rejRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePartChange = (index: number, partIdStr: string) => {
    const partId = parseInt(partIdStr);
    const part = masterParts.find(p => p.partId === partId);
    if (part) {
      // Shift Target = Machine Total Day Capacity / 2 (since each day has 2 shifts: Shift A & Shift B)
      const shiftQty = part.productionOutputPerMachine && part.productionOutputPerMachine > 0
        ? Math.ceil(part.productionOutputPerMachine / 2)
        : (part.cycleTime && part.cycleTime > 0
            ? Math.round(27000 / part.cycleTime)
            : 0);

      setEntryRows(prev => {
        const newRows = [...prev];
        newRows[index] = {
          ...newRows[index],
          partId,
          plannedQty: shiftQty,
          cycleTime: part.cycleTime
        };
        return newRows;
      });
    }
  };

  const updateRow = (index: number, field: string, value: any) => {
      setEntryRows(prev => {
          const newRows = [...prev];
          newRows[index] = { ...newRows[index], [field]: value };
          return newRows;
      });
  };

  const updateRowFields = (index: number, fields: Partial<ProductionEntry>) => {
      setEntryRows(prev => {
          const newRows = [...prev];
          newRows[index] = { ...newRows[index], ...fields };
          return newRows;
      });
  };

  // Check whether all required data for a machine is completed
  const getMachineCompletionStatus = (row: Partial<ProductionEntry>, index: number) => {
    const missing: string[] = [];
    const autoMcNo = (row.machineNumber || (index + 1).toString()).trim();
    const mcLabel = `Machine #${autoMcNo}`;

    // 1. Duplicate Machine in Database Validation for this date & shift
    const conflictDb = getCompletedMachinesForSession(row.id).find(c => (c.machineNumber || '').trim() === autoMcNo);
    if (conflictDb) {
      missing.push(`Machine #${autoMcNo} is already completed in database for this shift (Trace ID: ${conflictDb.traceabilityBatchId})`);
    }

    // 2. Duplicate Machine in Form Validation across rows
    const isDupInForm = entryRows.some((other, oIdx) => oIdx !== index && ((other.machineNumber || (oIdx + 1).toString()).trim() === autoMcNo));
    if (isDupInForm) {
      missing.push(`Machine #${autoMcNo} is duplicated in another tab of this form`);
    }

    if (row.hasIssue) {
      if (!row.partId) {
        missing.push('Scheduled Part');
      }
      if (!row.issueDetails || !row.issueDetails.trim()) {
        missing.push('Reason for Machine Issue');
      }
      return {
        isComplete: missing.length === 0,
        missing,
        label: mcLabel,
        isIssue: true
      };
    }

    // Normal Production Mode
    if (!row.operatorPunchNo || !row.operatorPunchNo.trim()) {
      missing.push('Operator Name');
    }
    if (!row.partId) {
      missing.push('Part (No. & Name)');
    }
    if (!row.dieNo || !row.dieNo.trim()) {
      missing.push('Die No');
    }
    if (row.actualQty === undefined || row.actualQty === null || isNaN(row.actualQty) || row.actualQty < 0) {
      missing.push('Actual Produced');
    } else {
      const plan = row.plannedQty || 0;
      const act = row.actualQty || 0;
      const gap = Math.max(0, plan - act);
      if (gap > 0) {
        const totalAllocated = (row.gapQtyManPower || 0) + (row.gapQtyMachineBreakdown || 0) + (row.gapQtyMaterialShortage || 0) + (row.gapQtyMethod || 0);
        if (totalAllocated === 0) {
          missing.push(`Gap Breakdown Allocation (0 of ${gap} pcs allocated)`);
        } else if (totalAllocated !== gap) {
          missing.push(`Gap Quantity Breakdown (Allocated ${totalAllocated} of ${gap} pcs)`);
        }
        if ((row.gapQtyManPower || 0) > 0 && !row.gapSubReasonManPower?.trim()) {
          missing.push('Root Cause for Man Power');
        }
        if ((row.gapQtyMachineBreakdown || 0) > 0 && !row.gapSubReasonMachineBreakdown?.trim()) {
          missing.push('Root Cause for Machine Breakdown');
        }
        if ((row.gapQtyMaterialShortage || 0) > 0 && !row.gapSubReasonMaterialShortage?.trim()) {
          missing.push('Root Cause for Raw Material Shortage');
        }
        if ((row.gapQtyMethod || 0) > 0 && !row.gapSubReasonMethod?.trim()) {
          missing.push('Root Cause for Method');
        }
      }
    }

    if ((row.rejectionQty || 0) > (row.actualQty || 0)) {
      missing.push(`Rejection Quantity (${row.rejectionQty} pcs) cannot exceed Actual Produced (${row.actualQty || 0} pcs)`);
    }

    if (row.parsedRejections && row.parsedRejections.length > 0) {
      const hasInvalid = row.parsedRejections.some(r => !r.reason?.trim() || r.qty <= 0);
      if (hasInvalid) {
        missing.push('Valid Reason and Qty for all rejections');
      }
    }

    return {
      isComplete: missing.length === 0,
      missing,
      label: mcLabel,
      isIssue: false
    };
  };

  // Add next machine only after current machine is fully filled
  const handleAddNextMachine = () => {
    if (entryRows.length > 0) {
      const lastIdx = entryRows.length - 1;
      const status = getMachineCompletionStatus(entryRows[lastIdx], lastIdx);
      if (!status.isComplete) {
        showAlert(
          'Complete Machine Details First',
          `You cannot proceed to add or enter the next machine until all required information for ${status.label} is filled.\n\nPlease complete:\n• ${status.missing.join('\n• ')}`
        );
        return;
      }
    }
    const currentInForm = entryRows.map(r => (r.machineNumber || '').trim()).filter(Boolean);
    const nextMc = getNextAvailableMachineNumber(currentInForm);
    const newIdx = entryRows.length;
    setEntryRows(prev => [...prev, {
      machineNumber: nextMc,
      rejectionQty: 3,
      parsedRejections: [{ reason: 'Warm Shot', qty: 3 }]
    }]);
    setActiveMachineIndex(newIdx);
  };

  const startNewBulkEntry = () => {
    const today = new Date().toISOString().split('T')[0];
    // Auto-detect shift: If Shift A for today is already approved, preselect Shift B!
    const todayShiftA = entries.filter(e => {
      const eDate = e.date ? e.date.split('T')[0] : '';
      return eDate === today && e.shift === 'Shift A';
    });
    const shift = (todayShiftA.length > 0 && todayShiftA.every(e => e.status === 'Approved')) ? 'Shift B' : 'Shift A';
    const completed = entries.filter(e => {
      const eDate = e.date ? e.date.split('T')[0] : '';
      return eDate === today && e.shift === shift;
    }).map(e => (e.machineNumber || '').trim());

    let nextMc = '1';
    for (let k = 1; k <= 30; k++) {
      if (!completed.includes(k.toString())) {
        nextMc = k.toString();
        break;
      }
    }

    setSessionHeader({ date: today, shift, supervisorId: '' });
    setEntryRows([{
      machineNumber: nextMc,
      rejectionQty: 3,
      parsedRejections: [{ reason: 'Warm Shot', qty: 3 }]
    }]);
    setActiveMachineIndex(0);
    setIsEditing(true);
  };

  const calculateDerivedFields = (entry: Partial<ProductionEntry>, date: string, shift: string, machineIndex: number = 0) => {
    const autoMcNo = entry.machineNumber || (machineIndex + 1).toString();
    if (entry.hasIssue) {
      const sup = supervisors.find(s => s.id.toString() === sessionHeader.supervisorId);
      const supName = sup?.name || 'Supervisor';
      const reason = entry.issueDetails?.trim() || 'Machine Issue / No Output';
      const formattedRemark = `[MACHINE ISSUE] ${reason} (Supervisor: ${supName})`;
      
      const d = date ? new Date(date) : new Date();
      const dateStr = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`;
      const shiftCode = shift === 'Shift A' ? 'A' : 'B';
      const mcClean = autoMcNo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const traceId = `DOWN-M${mcClean}-${dateStr}${shiftCode}`;

      const plan = entry.plannedQty || 0;

      return {
        ...entry,
        machineNumber: autoMcNo,
        date,
        shift,
        plannedQty: plan,
        actualQty: 0,
        rejectionQty: 0,
        gap: plan,
        efficiency: 0,
        gapReasonMachineBreakdown: true,
        gapQtyMachineBreakdown: plan,
        gapSubReasonMachineBreakdown: entry.issueReasonCategory || reason.slice(0, 50),
        gapReasonManPower: false,
        gapQtyManPower: 0,
        gapReasonMaterialShortage: false,
        gapQtyMaterialShortage: 0,
        gapReasonMethod: false,
        gapQtyMethod: 0,
        traceabilityBatchId: traceId,
        planId: null,
        reasonForRejection: '',
        remark: formattedRemark
      };
    }

    const act = entry.actualQty || 0;
    const plan = entry.plannedQty || 0;
    const gap = Math.max(0, plan - act);
    const eff = plan > 0 ? (act / plan) * 100 : 0;

    let gapQtyManPower = gap > 0 ? (entry.gapQtyManPower || 0) : 0;
    let gapQtyMachineBreakdown = gap > 0 ? (entry.gapQtyMachineBreakdown || 0) : 0;
    let gapQtyMaterialShortage = gap > 0 ? (entry.gapQtyMaterialShortage || 0) : 0;
    let gapQtyMethod = gap > 0 ? (entry.gapQtyMethod || 0) : 0;

    let gapReasonManPower = gap > 0 && (entry.gapReasonManPower || gapQtyManPower > 0);
    let gapReasonMachineBreakdown = gap > 0 && (entry.gapReasonMachineBreakdown || gapQtyMachineBreakdown > 0);
    let gapReasonMaterialShortage = gap > 0 && (entry.gapReasonMaterialShortage || gapQtyMaterialShortage > 0);
    let gapReasonMethod = gap > 0 && (entry.gapReasonMethod || gapQtyMethod > 0);
    
    // Traceability ID: [Alias]-[DD-MM-YYYY]-[Shift]-[PartNo]
    let traceId = entry.traceabilityBatchId || '';
    if (entry.operatorPunchNo && date && shift && entry.partId) {
        const op = operators.find(o => o.punchNo === entry.operatorPunchNo);
        const alias = op?.aliasLetter || op?.name.charAt(0) || 'X';
        const d = new Date(date);
        const dateStr = `${String(d.getDate()).padStart(2,'0')}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getFullYear()).slice(-2)}`;
        const shiftCode = shift === 'Shift A' ? 'A' : 'B';
        
        traceId = `${alias}${dateStr}${shiftCode}`;
    }
    
    let finalReason = entry.reasonForRejection || '';
    if (entry.parsedRejections && entry.parsedRejections.length > 0) {
        finalReason = JSON.stringify(entry.parsedRejections);
    }

    const getLossStr = (q: number) => {
      if (plan <= 0 || q <= 0) return '';
      return ` (~${formatLossHours(q, plan)} loss)`;
    };

    const gapNotes: string[] = [];
    if (gapQtyManPower > 0) {
      const sub = entry.gapSubReasonManPower ? ` - ${entry.gapSubReasonManPower}` : '';
      const custom = entry.gapCustomNoteManPower ? ` (${entry.gapCustomNoteManPower})` : '';
      gapNotes.push(`Manpower${sub}${custom}: ${gapQtyManPower} pcs${getLossStr(gapQtyManPower)}`);
    }
    if (gapQtyMachineBreakdown > 0) {
      const sub = entry.gapSubReasonMachineBreakdown ? ` - ${entry.gapSubReasonMachineBreakdown}` : '';
      const custom = entry.gapCustomNoteMachineBreakdown ? ` (${entry.gapCustomNoteMachineBreakdown})` : '';
      gapNotes.push(`Machine Breakdown${sub}${custom}: ${gapQtyMachineBreakdown} pcs${getLossStr(gapQtyMachineBreakdown)}`);
    }
    if (gapQtyMaterialShortage > 0) {
      const sub = entry.gapSubReasonMaterialShortage ? ` - ${entry.gapSubReasonMaterialShortage}` : '';
      const custom = entry.gapCustomNoteMaterialShortage ? ` (${entry.gapCustomNoteMaterialShortage})` : '';
      gapNotes.push(`Raw Material${sub}${custom}: ${gapQtyMaterialShortage} pcs${getLossStr(gapQtyMaterialShortage)}`);
    }
    if (gapQtyMethod > 0) {
      const sub = entry.gapSubReasonMethod ? ` - ${entry.gapSubReasonMethod}` : '';
      const custom = entry.gapCustomNoteMethod ? ` (${entry.gapCustomNoteMethod})` : '';
      gapNotes.push(`Method${sub}${custom}: ${gapQtyMethod} pcs${getLossStr(gapQtyMethod)}`);
    }

    const currentSup = supervisors.find(s => s.id.toString() === sessionHeader.supervisorId);
    const supName = currentSup?.name || '';

    let finalRemark = (entry.remark || '').replace(/\s*\[Gap Breakdown:[^\]]*\]/g, '').replace(/\s*\[Supervisor:[^\]]*\]/g, '').trim();
    if (gapNotes.length > 0) {
      const gapSummary = `[Gap Breakdown: ${gapNotes.join(' | ')}]`;
      finalRemark = finalRemark ? `${finalRemark} ${gapSummary}` : gapSummary;
    }
    if (supName) {
      finalRemark = `${finalRemark} [Supervisor: ${supName}]`.trim();
    }

    return {
      ...entry,
      machineNumber: autoMcNo,
      date,
      shift,
      gap,
      efficiency: parseFloat(eff.toFixed(2)),
      gapReasonManPower,
      gapReasonMachineBreakdown,
      gapReasonMaterialShortage,
      gapReasonMethod,
      gapQtyManPower,
      gapQtyMachineBreakdown,
      gapQtyMaterialShortage,
      gapQtyMethod,
      gapSubReasonManPower: entry.gapSubReasonManPower,
      gapSubReasonMachineBreakdown: entry.gapSubReasonMachineBreakdown,
      gapSubReasonMaterialShortage: entry.gapSubReasonMaterialShortage,
      gapSubReasonMethod: entry.gapSubReasonMethod,
      gapCustomNoteManPower: entry.gapCustomNoteManPower,
      gapCustomNoteMachineBreakdown: entry.gapCustomNoteMachineBreakdown,
      gapCustomNoteMaterialShortage: entry.gapCustomNoteMaterialShortage,
      gapCustomNoteMethod: entry.gapCustomNoteMethod,
      traceabilityBatchId: traceId,
      planId: null,
      reasonForRejection: finalReason,
      remark: finalRemark
    };
  };

  const handleSave = async (e: React.FormEvent, targetStatus: string) => {
    e.preventDefault();
    try {
      // 0. Check supervisor selected at top
      if (!sessionHeader.supervisorId) {
        showAlert('Supervisor Required', 'Please select a Shift Supervisor at the top before saving.');
        return;
      }

      // 1. Check duplicate machines against DB and inside form
      const sessionCompleted = getCompletedMachinesForSession();
      for (let i = 0; i < entryRows.length; i++) {
        const row = entryRows[i];
        const mcNo = (row.machineNumber || (i + 1).toString()).trim();
        
        const conflictDb = sessionCompleted.find(c => (!row.id || c.id !== row.id) && (c.machineNumber || '').trim() === mcNo);
        if (conflictDb) {
          showAlert(
            'Duplicate Machine Entry',
            `Machine #${mcNo} has already been completed for ${sessionHeader.date} (${sessionHeader.shift}) with Trace ID "${conflictDb.traceabilityBatchId}".\n\nEach machine can only have ONE entry per shift. Please change the machine number or edit the existing record in the table below.`
          );
          return;
        }

        const duplicateInRows = entryRows.some((other, oIdx) => oIdx !== i && ((other.machineNumber || (oIdx + 1).toString()).trim() === mcNo));
        if (duplicateInRows) {
          showAlert(
            'Duplicate Machine in Form',
            `Machine #${mcNo} is entered multiple times in this form. Each machine entry must have a unique Machine Number.`
          );
          return;
        }
      }

      // 2. Sequential validation across all machines
      for (let i = 0; i < entryRows.length; i++) {
        const row = entryRows[i];
        const status = getMachineCompletionStatus(row, i);
        if (!status.isComplete) {
          showAlert(
            'Incomplete Machine Entry',
            `Cannot save entries. All required information must be filled for ${status.label} before saving.\n\nMissing:\n• ${status.missing.join('\n• ')}`
          );
          return;
        }
      }

      // 2. Persist entries to backend
      for (let i = 0; i < entryRows.length; i++) {
          const row = entryRows[i];
          const autoMcNo = row.machineNumber || (i + 1).toString();
          const finalEntry = calculateDerivedFields({ ...row, machineNumber: autoMcNo, status: targetStatus }, sessionHeader.date, sessionHeader.shift, i);
          
          if (!finalEntry.hasIssue && finalEntry.gap > 0) {
            const totalAllocated = (finalEntry.gapQtyManPower || 0) + (finalEntry.gapQtyMachineBreakdown || 0) + (finalEntry.gapQtyMaterialShortage || 0) + (finalEntry.gapQtyMethod || 0);
            if (totalAllocated === 0) {
              const partName = masterParts.find(p => p.partId === finalEntry.partId)?.partName || '';
              showAlert('Validation Error', `A production gap of ${finalEntry.gap} units was calculated for ${partName} on ${finalEntry.machineNumber || `Machine #${i+1}`}. You must assign the lost quantity across the Gap Breakdown reasons.`);
              return;
            }
            if (totalAllocated !== finalEntry.gap) {
              showAlert('Gap Quantity Mismatch', `On ${finalEntry.machineNumber || `Machine #${i+1}`}, the total gap is ${finalEntry.gap} pcs, but the quantities allocated across the gap reasons total ${totalAllocated} pcs.\n\nPlease ensure the reason quantities add up exactly to ${finalEntry.gap} pcs.`);
              return;
            }
            const missingRootCauses: string[] = [];
            if ((finalEntry.gapQtyManPower || 0) > 0 && !finalEntry.gapSubReasonManPower?.trim()) {
              missingRootCauses.push('1. Man Power');
            }
            if ((finalEntry.gapQtyMachineBreakdown || 0) > 0 && !finalEntry.gapSubReasonMachineBreakdown?.trim()) {
              missingRootCauses.push('2. Machine Breakdown');
            }
            if ((finalEntry.gapQtyMaterialShortage || 0) > 0 && !finalEntry.gapSubReasonMaterialShortage?.trim()) {
              missingRootCauses.push('3. Raw Material Shortage');
            }
            if ((finalEntry.gapQtyMethod || 0) > 0 && !finalEntry.gapSubReasonMethod?.trim()) {
              missingRootCauses.push('4. Method');
            }
            if (missingRootCauses.length > 0) {
              showAlert(
                'Root Cause Required',
                `On ${finalEntry.machineNumber || `Machine #${i+1}`}, please select a specific Root Cause for each allocated gap category:\n\n• ${missingRootCauses.join('\n• ')}`
              );
              return;
            }
          }
          
          // Ensure valid database foreign key / non-null fields
          if (!finalEntry.partId && masterParts.length > 0) {
            finalEntry.partId = masterParts[0].partId;
          }
          if (!finalEntry.operatorPunchNo) {
            finalEntry.operatorPunchNo = sessionHeader.supervisorId ? `SUP-${sessionHeader.supervisorId}` : '000';
          }
          if (!finalEntry.dieNo) {
            finalEntry.dieNo = 'N/A';
          }

          const isNew = !finalEntry.id;
          const url = isNew ? `http://${window.location.hostname}:4900/api/productionentries` : `http://${window.location.hostname}:4900/api/productionentries/${finalEntry.id}`;
          
          const payload: any = { ...finalEntry };
          delete payload.part;
          delete payload.hasIssue;
          delete payload.issueReasonCategory;
          delete payload.issueDetails;
          delete payload.downtimeHours;
          delete payload.operatorSearchText;
          delete payload.partSearchText;
          delete payload.parsedRejections;
          
          const res = await apiFetch(url, {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!res.ok) {
              showAlert('Alert', `Failed to save Machine Entry for ${finalEntry.machineNumber || `#${i+1}`} (Trace ID: ${finalEntry.traceabilityBatchId || 'Unknown'}).`);
              return; 
          }
      }
      
      localStorage.removeItem(DRAFT_KEY);
      setDraftSavedTime(null);
      setIsEditing(false);
      setSuccessMsg(`Successfully saved ${entryRows.length} machine record(s) as ${targetStatus}!`);
      setTimeout(() => setSuccessMsg(''), 3000);
      fetchData();
      
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEntry = async (id: number) => {
    showConfirm('Confirm Delete', 'Are you sure you want to permanently delete this production entry?', async () => {
        try {
            const res = await apiFetch(`http://${window.location.hostname}:4900/api/productionentries/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showAlert('Success', 'Entry deleted successfully.');
                fetchData();
            } else {
                showAlert('Error', 'Failed to delete entry.');
            }
        } catch (err) {
            console.error(err);
            showAlert('Error', 'Network error while deleting.');
        }
    });
  };

  const handleQuickAddOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/operators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOp)
      });
      if (res.ok) {
        await res.json();
        const opRes = await apiFetch(`http://${window.location.hostname}:4900/api/operators`);
        if (opRes.ok) setOperators(await opRes.json());
        setShowOpModal(false);
        setNewOp({ punchNo: '', name: '', aliasLetter: '', department: 'Production', shift: 'Shift A', status: 'Active' });
      } else {
        showAlert('Alert', 'Failed to add operator. Punch No might already exist.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickAddGapReason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickGapForm.reasonName.trim()) {
      showAlert('Required Field', 'Please enter a reason name.');
      return;
    }
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/gapreasons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: quickGapForm.category, reasonName: quickGapForm.reasonName.trim(), isActive: true })
      });
      if (res.ok) {
        const created = await res.json();
        setDbGapReasons(prev => [...prev, created]);
        const keyMap: Record<string, string> = {
          'Manpower': 'gapSubReasonManPower',
          'Machine Breakdown': 'gapSubReasonMachineBreakdown',
          'Raw Material': 'gapSubReasonMaterialShortage',
          'Method': 'gapSubReasonMethod'
        };
        const field = keyMap[quickGapForm.category];
        if (field) {
          updateRow(quickGapForm.rowIndex, field, created.reasonName);
        }
        setShowQuickGapModal(false);
        setQuickGapForm({ category: 'Manpower', reasonName: '', rowIndex: 0 });
        showAlert('Success', `"${created.reasonName}" added to ${created.category} and selected.`);
      } else {
        showAlert('Error', 'Failed to save gap reason.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Error', 'An unexpected error occurred.');
    }
  };


  
  const availableOperators = operators;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      
      {/* COMPACT STICKY HEADER */}
      <div style={{
        background: 'white',
        padding: '10px 14px',
        border: '1px solid #d5e0da',
        borderRadius: 8,
        flexShrink: 0,
        marginBottom: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px 12px'
        }}>
          {/* Left: Dashboard Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Settings size={20} color="#0b462c" style={{ flexShrink: 0 }} />
            <h2 style={{ margin: 0, color: '#0b462c', fontSize: '1.1rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
              Production Dashboard
            </h2>
          </div>

          {/* Right Navigation Tabs (Only rendered when there are multiple tabs to switch between) */}
          {isHODOrAdmin && (
            <div style={{
              display: 'inline-flex',
              background: '#f1f5f9',
              padding: 2,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
              gap: 2
            }}>
              {isHOD && (
                <button
                  type="button"
                  style={{
                    background: activeTab === 'approvals' ? '#0b462c' : 'transparent',
                    color: activeTab === 'approvals' ? '#ffffff' : '#475569',
                    border: 'none',
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 4,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                  onClick={() => setActiveTab('approvals')}
                >
                  <ShieldCheck size={13} />
                  <span>Approvals</span>
                  {pendingShiftApprovals.length > 0 && (
                    <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, padding: '0 5px', borderRadius: 8, fontWeight: 800 }}>
                      {pendingShiftApprovals.length}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                style={{
                  background: activeTab === 'reports' ? '#0b462c' : 'transparent',
                  color: activeTab === 'reports' ? '#ffffff' : '#475569',
                  border: 'none',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('reports')}
              >
                <BarChart2 size={13} />
                <span>Reports</span>
              </button>

              <button
                type="button"
                style={{
                  background: activeTab === 'entry' ? '#0b462c' : 'transparent',
                  color: activeTab === 'entry' ? '#ffffff' : '#475569',
                  border: 'none',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('entry')}
              >
                <TableIcon size={13} />
                <span>{isHOD ? 'Machine Log' : 'Data Entry'}</span>
              </button>
            </div>
          )}

          {/* Action Buttons: Operator actions (Import Shift Excel & New Bulk Entry) */}
          {activeTab === 'entry' && (!isHOD || isAdmin) && (
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flex: '1 1 280px',
              justifyContent: 'flex-end',
              flexWrap: 'nowrap'
            }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{
                  flex: 1,
                  height: 34,
                  padding: '0 10px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: '#f0fdf4',
                  borderColor: '#86efac',
                  color: '#166534',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}
                onClick={() => setShowShiftImportModal(true)}
                title="Import offline shift Excel template directly into production"
              >
                <FileSpreadsheet size={14} /> Import Shift Excel
              </button>

              <button
                className="btn btn-highlight"
                style={{
                  flex: 1,
                  height: 34,
                  padding: '0 12px',
                  fontSize: 11.5,
                  fontWeight: 700,
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}
                onClick={startNewBulkEntry}
              >
                <Plus size={15}/> New Bulk Entry
              </button>
            </div>
          )}

          {activeTab === 'entry' && isHOD && !isAdmin && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{
                      padding: '7px 14px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#f8fafc',
                      borderColor: '#cbd5e1',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                    onClick={() => setShowShiftImportModal(true)}
                    title="Import offline shift Excel template"
                  >
                    <FileSpreadsheet size={15} /> Import Shift Excel
                  </button>
                </div>
              )}
        </div>
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', display: activeTab === 'entry' ? 'block' : 'none' }}>
      <>

      {successMsg && (
        <div style={{ background: '#e8f3ed', color: '#0b462c', padding: '15px 20px', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, fontWeight: 'bold' }}>
            <Check size={20} /> {successMsg}
        </div>
      )}

      {/* SUPERVISOR SHIFT CONFIRMATION & APPROVAL STATUS TRACKER (Only visible when shifts are pending or returned) */}
      {groupedShifts.some(s => s.status === 'Submitted' || s.status === 'Returned') && (
        <div style={{
          background: '#ffffff',
          border: '1.5px solid #d5e0da',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 14,
          boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="#0b462c" />
              <span style={{ fontWeight: 800, fontSize: 13.5, color: '#0b462c' }}>
                Supervisor Shift Confirmation & Approval Status
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              Real-time confirmation status from HOD. Approved shifts unlock the next sequential shift.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 10 }}>
            {groupedShifts
              .filter(s => s.status === 'Submitted' || s.status === 'Returned')
              .slice(0, 4)
              .map(s => {
                const isApproved = s.status === 'Approved';
              const isSubmitted = s.status === 'Submitted';
              const isReturned = s.status === 'Returned';
              
              const borderColor = isApproved ? '#86efac' : isSubmitted ? '#fde047' : isReturned ? '#fca5a5' : '#cbd5e1';
              const bgColor = isApproved ? '#f0fdf4' : isSubmitted ? '#fefce8' : isReturned ? '#fef2f2' : '#f8fafc';
              const statusBadgeBg = isApproved ? '#dcfce7' : isSubmitted ? '#fef08a' : isReturned ? '#fee2e2' : '#e2e8f0';
              const statusBadgeColor = isApproved ? '#15803d' : isSubmitted ? '#854d0e' : isReturned ? '#b91c1c' : '#475569';
              const statusLabel = isApproved ? '✓ Approved by HOD' : isSubmitted ? 'Submitted — Awaiting HOD' : isReturned ? '↩ Returned for Correction' : 'Draft';

              return (
                <div key={`${s.date}_${s.shift}`} style={{
                  background: bgColor,
                  border: `1.5px solid ${borderColor}`,
                  borderRadius: 7,
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                      {new Date(s.date).toLocaleDateString()} • {s.shift}
                    </div>
                    <span style={{
                      background: statusBadgeBg,
                      color: statusBadgeColor,
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12
                    }}>
                      {statusLabel}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#334155' }}>
                    <span>{s.count} Machine{s.count > 1 ? 's' : ''} recorded</span>
                    <span style={{ fontWeight: 700, color: '#0b462c' }}>Produced: {s.totalProduced} pcs</span>
                    {s.totalRej > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}>Rej: {s.totalRej} pcs</span>}
                  </div>

                  {isReturned && s.returnReason && (
                    <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#b91c1c' }}>
                      <strong>HOD Note:</strong> {s.returnReason}
                    </div>
                  )}

                  {isSubmitted && (
                    <div style={{ fontSize: 10.5, color: '#854d0e', fontStyle: 'italic' }}>
                      Shift submitted. Waiting for HOD to approve before next shift can be entered.
                    </div>
                  )}
                  {isApproved && (
                    <div style={{ fontSize: 10.5, color: '#166534', fontWeight: 600 }}>
                      ✓ Officially approved by HOD. Sequential entry for next shift is unlocked.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HOD PENDING APPROVAL QUEUE (Prominently displayed for HOD / Admin) */}
      {pendingShiftApprovals.length > 0 && isHODOrAdmin && (
        <div style={{
          background: '#eff6ff',
          border: '1.5px solid #93c5fd',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 14,
          boxShadow: '0 2px 6px rgba(37,99,235,0.06)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={20} color="#1d4ed8" />
              <span style={{ fontWeight: 800, fontSize: 13.5, color: '#1e3a8a' }}>
                HOD Shift Approval Queue ({pendingShiftApprovals.length} Shift{pendingShiftApprovals.length > 1 ? 's' : ''} Pending)
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
              Approving a shift officially closes it and unlocks sequential entry for the next shift supervisor.
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingShiftApprovals.map((ps: any) => {
              const shiftKey = `${ps.date}_${ps.shift}`;
              const isBannerExpanded = expandedBannerShiftKey === shiftKey;
              const hasBreakdown = ps.machines.some((m: any) => m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:'))));
              const acceptedQty = Math.max(0, ps.totalProduced - ps.totalRej);
              const rejPct = ps.totalProduced > 0 ? ((ps.totalRej / ps.totalProduced) * 100).toFixed(1) : '0.0';
              const avgEff = ps.machines.length > 0 ? (ps.machines.reduce((sum: number, m: any) => sum + (m.efficiency || 0), 0) / ps.machines.length).toFixed(1) : '0.0';

              return (
                <div key={shiftKey} style={{
                  background: '#ffffff',
                  border: isBannerExpanded ? '1.5px solid #2563eb' : '1px solid #bfdbfe',
                  borderRadius: 6,
                  overflow: 'hidden',
                  boxShadow: isBannerExpanded ? '0 4px 12px rgba(37,99,235,0.08)' : '0 1px 2px rgba(0,0,0,0.02)'
                }}>
                  {/* Summary Header Bar */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isBannerExpanded ? '#f8fafc' : '#ffffff',
                    padding: '8px 12px',
                    flexWrap: 'wrap',
                    gap: 10,
                    borderBottom: isBannerExpanded ? '1px solid #e2e8f0' : 'none'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 12.5, color: '#0f172a' }}>
                        {new Date(ps.date).toLocaleDateString()} • {ps.shift}
                      </span>
                      <span style={{ fontSize: 11, color: '#334155', background: '#f1f5f9', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>
                        {ps.count} Machine{ps.count > 1 ? 's' : ''} Entered
                      </span>
                      <span style={{ fontSize: 11, color: '#0b462c', fontWeight: 700 }}>
                        Produced: {ps.totalProduced} pcs
                      </span>
                      {ps.totalRej > 0 && (
                        <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>
                          Rej: {ps.totalRej} pcs ({rejPct}%)
                        </span>
                      )}
                      {ps.totalGap > 0 && (
                        <span style={{ fontSize: 11, color: '#c05621', fontWeight: 700 }}>
                          Gap: {ps.totalGap} pcs
                        </span>
                      )}
                      {hasBreakdown && (
                        <span style={{ fontSize: 10.5, background: '#ffedd5', color: '#9a3412', padding: '1px 6px', borderRadius: 8, fontWeight: 700, border: '1px solid #fed7aa' }}>
                          ⚠️ Breakdown
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#64748b' }}>
                        Supervisor: <strong>{ps.supervisor}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      {/* ANALYSE BUTTON (Prominently allows HOD to see the entry and all details before approval) */}
                      <button
                        type="button"
                        onClick={() => {
                          setModalFilterSearch('');
                          setAnalyseModalShift(ps);
                        }}
                        style={{
                          background: '#0284c7',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 5,
                          padding: '5px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          boxShadow: '0 1px 2px rgba(2,132,199,0.2)'
                        }}
                        title="Analyse complete shift entries, machine outputs, rejections and gaps"
                      >
                        <BarChart2 size={13} />
                        <span>Analyse</span>
                      </button>

                      {/* Quick Inline View Toggle */}
                      <button
                        type="button"
                        onClick={() => setExpandedBannerShiftKey(isBannerExpanded ? null : shiftKey)}
                        style={{
                          background: isBannerExpanded ? '#e2e8f0' : '#f1f5f9',
                          color: '#334155',
                          border: '1px solid #cbd5e1',
                          borderRadius: 5,
                          padding: '5px 10px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title={isBannerExpanded ? "Hide inline entries" : "Quick view machine entries inline"}
                      >
                        {isBannerExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        <span>{isBannerExpanded ? 'Hide' : 'Quick View'}</span>
                      </button>

                      {/* Approve Shift */}
                      <button
                        type="button"
                        onClick={() => handleShiftHODAction(ps.date, ps.shift, 'Approve')}
                        style={{
                          background: '#15803d',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 5,
                          padding: '5px 14px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                        title="Approve this shift and unlock next shift"
                      >
                        <Check size={13} /> Approve Shift
                      </button>

                      {/* Return Shift */}
                      <button
                        type="button"
                        onClick={() => handleShiftHODAction(ps.date, ps.shift, 'Return')}
                        style={{
                          background: '#ffffff',
                          color: '#b91c1c',
                          border: '1.5px solid #fca5a5',
                          borderRadius: 5,
                          padding: '4px 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Return shift to supervisor with comments"
                      >
                        <RotateCcw size={13} /> Return Shift
                      </button>
                    </div>
                  </div>

                  {/* Inline Expanded Inspection Table */}
                  {isBannerExpanded && (
                    <div style={{
                      padding: '12px 14px',
                      background: '#ffffff',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                        background: '#f8fafc',
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5 }}>
                          <span><strong>Total Planned:</strong> {ps.totalPlanned} pcs</span>
                          <span style={{ color: '#0b462c' }}><strong>Actual Produced:</strong> {ps.totalProduced} pcs</span>
                          <span style={{ color: ps.totalRej > 0 ? '#b91c1c' : '#64748b' }}><strong>Rejections:</strong> {ps.totalRej} pcs ({rejPct}%)</span>
                          <span style={{ color: '#004d40' }}><strong>Accepted Output:</strong> {acceptedQty} pcs</span>
                          <span style={{ color: ps.totalGap > 0 ? '#c05621' : '#15803d' }}><strong>Gap:</strong> {ps.totalGap} pcs</span>
                          <span><strong>Avg Efficiency:</strong> {avgEff}%</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setModalFilterSearch('');
                            setAnalyseModalShift(ps);
                          }}
                          style={{
                            background: '#0284c7',
                            color: 'white',
                            border: 'none',
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <BarChart2 size={12} /> Full Analysis Dialog
                        </button>
                      </div>

                      <div style={{ overflowX: 'auto', maxHeight: 280 }}>
                        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', textAlign: 'left' }}>
                          <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', zIndex: 1 }}>
                            <tr>
                              <th style={{ padding: '6px 8px' }}>M/C</th>
                              <th style={{ padding: '6px 8px' }}>Operator</th>
                              <th style={{ padding: '6px 8px' }}>Part No & Name</th>
                              <th style={{ padding: '6px 8px' }}>Die</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Plan</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Actual</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Rej</th>
                              <th style={{ padding: '6px 8px' }}>Rejection Reason</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Accepted</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Gap</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Eff %</th>
                              <th style={{ padding: '6px 8px' }}>Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ps.machines.map((m: any) => {
                              const op = operators.find((o: any) => o.punchNo === m.operatorPunchNo || o.aliasLetter === m.operatorPunchNo || o.name === m.operatorPunchNo);
                              const opName = op ? op.name : (m.operatorPunchNo || '-');
                              const partObj = m.part || masterParts.find((p: any) => (p.partId && p.partId === m.partId) || (p.id && p.id === m.partId));
                              const pNo = partObj?.partNo || m.partNo || '-';
                              const pName = partObj?.partName || m.partName || '';
                              const accepted = Math.max(0, (m.actualQty || 0) - (m.rejectionQty || 0));
                              const isDown = m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:')));

                              return (
                                <tr key={m.id || m.machineNumber} style={{ borderBottom: '1px solid #e2e8f0', background: isDown ? '#fff7ed' : '#ffffff' }}>
                                  <td style={{ padding: '6px 8px', fontWeight: 800, color: '#0b462c' }}>#{m.machineNumber}</td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <div style={{ fontWeight: 600 }}>{opName}</div>
                                    {op?.punchNo && <div style={{ fontSize: 10, color: '#64748b' }}>Punch: {op.punchNo}</div>}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{pNo}</div>
                                    {pName && <div style={{ fontSize: 10.5, color: '#64748b' }}>{pName}</div>}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>{m.dieNo || '-'}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m.plannedQty}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: isDown ? '#c05621' : '#0b462c' }}>
                                    {isDown ? '0 (Issue)' : m.actualQty}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: m.rejectionQty > 0 ? '#b91c1c' : '#64748b' }}>
                                    {m.rejectionQty}
                                  </td>
                                  <td style={{ padding: '6px 8px', color: m.rejectionQty > 0 ? '#b91c1c' : '#64748b' }}>
                                    {formatRejectionReasons(m.reasonForRejection, m.rejectionQty)}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0b462c' }}>{accepted}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', color: m.gap > 0 ? '#c05621' : '#15803d', fontWeight: 600 }}>
                                    {m.gap > 0 ? `${m.gap} pcs` : 'Met'}
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: (m.efficiency || 0) >= 85 ? '#15803d' : '#b45309' }}>
                                    {m.efficiency}%
                                  </td>
                                  <td style={{ padding: '6px 8px', fontSize: 11, color: '#475569', maxWidth: 180 }}>
                                    {m.remark || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isEditing && (() => {
        const isEditingExisting = Boolean(entryRows[0]?.id);
        const disciplineStatus = !isEditingExisting ? checkShiftDiscipline(sessionHeader.date, sessionHeader.shift) : { isLocked: false, reason: '', priorShiftLabel: '', priorStatus: 'Approved' };
        const isShiftLocked = disciplineStatus.isLocked && !isAdmin;

        return (
        <div className="input-form" style={{ marginBottom: 14, border: '1px solid #c8dfd0', borderRadius: 8, padding: '12px 16px', background: '#ffffff', boxShadow: '0 2px 10px rgba(11, 70, 44, 0.04)' }}>
          {/* Compact Top Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e8f3ed', paddingBottom: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e8f3ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b462c' }}>
                <FileText size={16} />
              </div>
              <div>
                <h4 style={{ margin: 0, color: '#0b462c', fontSize: '1.05rem', fontWeight: 700 }}>
                  {entryRows[0]?.id ? 'Edit Machine Entry' : 'Machine-Wise Bulk Entry'}
                </h4>
              </div>
            </div>
            <button
              className="btn-delete-x"
              onClick={() => setIsEditing(false)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: '#f4f7f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #d5e0da',
                cursor: 'pointer',
                color: '#607168'
              }}
              title="Close Entry Form"
            >
              <X size={15}/>
            </button>
          </div>
          
          {entryRows[0]?.status === 'Returned' && (
              <div style={{ padding: '6px 12px', backgroundColor: '#ffebee', color: '#b71c1c', marginBottom: 10, borderRadius: 5, border: '1px solid #ffcdd2', fontSize: 12 }}>
                  <strong>Returned by QA:</strong> {entryRows[0].returnReason}
              </div>
          )}

          <form onSubmit={e => e.preventDefault()}>
            {/* Sleek Session Header Strip */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
              gap: '6px 8px',
              alignItems: 'center',
              padding: '6px 10px',
              backgroundColor: '#f8faf9',
              borderRadius: 6,
              border: '1px solid #d5e0da',
              marginBottom: 10
            }}>
              {/* Date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#1d2c24', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Date <span style={{ color: '#d84343' }}>*</span>:
                </label>
                <input
                  type="date"
                  required
                  style={{ flex: 1, minWidth: 0, height: 28, padding: '0 6px', fontSize: 11.5, background: '#ffffff', fontWeight: 600, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  value={sessionHeader.date}
                  onChange={e => setSessionHeader({ ...sessionHeader, date: e.target.value })}
                  disabled={!!entryRows[0]?.id}
                />
              </div>

              {/* Shift */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#1d2c24', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Shift <span style={{ color: '#d84343' }}>*</span>:
                </label>
                <select
                  required
                  style={{ flex: 1, minWidth: 0, height: 28, padding: '0 4px', fontSize: 11.5, background: '#ffffff', fontWeight: 600, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  value={sessionHeader.shift}
                  onChange={e => setSessionHeader({ ...sessionHeader, shift: e.target.value })}
                  disabled={!!entryRows[0]?.id}
                >
                  <option value="Shift A">Shift A (Morning)</option>
                  <option value="Shift B">Shift B (Evening)</option>
                </select>
              </div>

              {/* Supervisor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#1d2c24', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Supervisor <span style={{ color: '#d84343' }}>*</span>:
                </label>
                <select
                  style={{ flex: 1, minWidth: 0, height: 28, padding: '0 4px', fontSize: 11.5, background: '#ffffff', fontWeight: 600, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  value={sessionHeader.supervisorId}
                  onChange={e => setSessionHeader({ ...sessionHeader, supervisorId: e.target.value })}
                  disabled={!!entryRows[0]?.id}
                >
                  <option value="">-- Select Supervisor --</option>
                  {supervisors.map(s => (
                    <option key={s.id} value={s.id.toString()}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Draft Status & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6, minWidth: 0 }}>
                {draftSavedTime ? (
                  <>
                    <span style={{ fontSize: 10, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '1px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      🟢 Draft saved ({draftSavedTime})
                    </span>
                    <button
                      type="button"
                      onClick={clearDraft}
                      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 10, cursor: 'pointer', textDecoration: 'underline', padding: 0, whiteSpace: 'nowrap' }}
                      title="Discard saved draft and start fresh"
                    >
                      Discard
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic' }}>
                    Auto-saved as draft
                  </span>
                )}
              </div>
            </div>

            {/* SHIFT RECORDED / IMPORTED BANNER */}
            {(() => {
              const completedForShift = entries.filter(e => {
                const eDate = e.date ? e.date.split('T')[0] : '';
                return eDate === sessionHeader.date && e.shift === sessionHeader.shift;
              });

              if (completedForShift.length === 0) return null;

              const totalProd = completedForShift.reduce((s, e) => s + (e.actualQty || 0), 0);
              const totalRej = completedForShift.reduce((s, e) => s + (e.rejectionQty || 0), 0);
              const shiftStatus = completedForShift[0]?.status || 'Approved';

              return (
                <div style={{
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                  border: '1.5px solid #86efac',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.08)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: '#dcfce7',
                      color: '#15803d',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <CheckCircle2 size={22} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#065f46', fontSize: 13.5 }}>
                          Shift Database Record Found: {sessionHeader.shift} ({new Date(sessionHeader.date).toLocaleDateString()})
                        </strong>
                        <span className={`badge ${shiftStatus === 'Approved' ? 'badge-yield' : shiftStatus === 'Submitted' ? 'badge-gap-high' : 'badge-rej-high'}`}>
                          {shiftStatus}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#047857', marginTop: 3 }}>
                        <strong>{completedForShift.length} Machines</strong> recorded • Output: <strong>{totalProd} pcs</strong> • Rejection: <strong>{totalRej} pcs</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const loadedRows = completedForShift.map(e => {
                          let pRej = [];
                          try { if (e.reasonForRejection) pRej = JSON.parse(e.reasonForRejection); } catch {}
                          return {
                            ...e,
                            parsedRejections: Array.isArray(pRej) ? pRej : []
                          };
                        });
                        setEntryRows(loadedRows);
                        setActiveMachineIndex(0);
                        showAlert('Machines Loaded', `✓ Loaded all ${loadedRows.length} machines for ${sessionHeader.shift} on ${sessionHeader.date} into the form.`);
                      }}
                      style={{
                        background: '#0b462c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}
                      title="Load all machines in this shift to view and edit in the form"
                    >
                      <Eye size={15} /> Load All {completedForShift.length} Machines into Form
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTableDateFilter(sessionHeader.date);
                        setTableShiftFilter(sessionHeader.shift);
                        const tbl = document.getElementById('production-entries-table');
                        if (tbl) tbl.scrollIntoView({ behavior: 'smooth' });
                      }}
                      style={{
                        background: '#ffffff',
                        color: '#065f46',
                        border: '1.5px solid #a7f3d0',
                        borderRadius: 6,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5
                      }}
                    >
                      <TableIcon size={14} /> Filter Table Below
                    </button>
                  </div>
                </div>
              );
            })()}



            {/* SEQUENTIAL DISCIPLINE LOCK NOTICE (Compact with Explore Expand) */}
            {disciplineStatus.isLocked && (
              <div style={{
                background: '#fff1f2',
                border: '1px solid #fecaca',
                borderLeft: '4px solid #dc2626',
                borderRadius: 6,
                padding: '6px 10px',
                marginBottom: 10,
                boxShadow: '0 1px 3px rgba(220,38,38,0.04)',
                transition: 'all 0.2s ease'
              }}>
                {/* Header Row: Strictly single horizontal row across all screen sizes */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  flexWrap: 'nowrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      background: '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Lock size={12} color="#991b1b" />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: '#991b1b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {sessionHeader.shift} Locked
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#991b1b',
                      background: '#ffffff',
                      border: '1px solid #fca5a5',
                      padding: '1px 5px',
                      borderRadius: 3,
                      whiteSpace: 'nowrap',
                      flexShrink: 0
                    }}>
                      Prior: {disciplineStatus.priorStatus}
                    </span>
                    {isAdmin && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#047857', background: '#d1fae5', border: '1px solid #a7f3d0', padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Admin
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDisciplineDetails(prev => !prev)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fca5a5',
                      color: '#991b1b',
                      borderRadius: 4,
                      padding: '2px 7px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      cursor: 'pointer',
                      flexShrink: 0,
                      height: 24,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                    }}
                    title={showDisciplineDetails ? "Collapse details" : "Explore full lock details"}
                  >
                    <span>{showDisciplineDetails ? 'Close' : 'Explore'}</span>
                    <ChevronDown
                      size={12}
                      style={{
                        transform: showDisciplineDetails ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease'
                      }}
                    />
                  </button>
                </div>

                {/* Collapsible Details Body */}
                {showDisciplineDetails && (
                  <div style={{
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: '1px dashed #fecdd3',
                    fontSize: 11,
                    color: '#7f1d1d',
                    lineHeight: 1.45
                  }}>
                    <div style={{ marginBottom: 4 }}>
                      <strong>Lock Explanation:</strong> {disciplineStatus.reason}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#991b1b', opacity: 0.9 }}>
                      • Target Shift: <strong>{sessionHeader.shift}</strong> ({sessionHeader.date})
                      <br />
                      • Sequential Prerequisite: <strong>{disciplineStatus.priorShiftLabel || 'Prior Shift'}</strong> must be fully submitted and approved before {sessionHeader.shift} can be unlocked.
                      {isAdmin && (
                        <div style={{ marginTop: 4, color: '#047857', fontWeight: 600 }}>
                          ✓ As an Administrator, your override is active. You may save drafts or submit entries if required.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Machine Cards Renderer - Clean Single Active Tab */}
            {[entryRows[activeMachineIndex] || entryRows[0]].map((row) => {
                const index = activeMachineIndex;
                const calculated = calculateDerivedFields(row, sessionHeader.date, sessionHeader.shift, index);
                const prevStatus = index > 0 ? getMachineCompletionStatus(entryRows[index - 1], index - 1) : null;
                const isLocked = index > 0 && !prevStatus?.isComplete;
                const availableOperators = operators.filter(o => 
                    o.department?.toLowerCase() === 'production' || 
                    !o.department || 
                    o.department === '' ||
                    o.department === 'All'
                );

                return (
                <div key={index} style={{
                  position: 'relative',
                  padding: '12px 14px',
                  border: isLocked ? '1px dashed #d5ded8' : row.hasIssue ? '1.5px solid #f6ad55' : '1px solid #d5e0da',
                  borderRadius: '8px',
                  marginBottom: '10px',
                  backgroundColor: isLocked ? '#fafcfb' : row.hasIssue ? '#fffdfa' : '#ffffff',
                  boxShadow: isLocked ? 'none' : '0 2px 6px rgba(11, 70, 44, 0.03)',
                  opacity: isLocked ? 0.72 : 1
                }}>
                    
                    {/* Locked Banner if previous machine is not complete */}
                    {isLocked && (
                      <div style={{
                        background: '#fff9e6',
                        border: '1px solid #ffd591',
                        borderRadius: 5,
                        padding: '6px 10px',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: '#d46b08',
                        fontSize: 11.5,
                        fontWeight: 600
                      }}>
                        <Lock size={14} />
                        <span>Machine Entry #{index + 1} is locked. Complete all required fields for {prevStatus?.label || `Machine #${index}`} first.</span>
                      </div>
                    )}

                    {/* Machine Entry Sub-Header: 2 Smart Compact Horizontal Rows */}
                    <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #edf4f0' }}>
                      {/* Row 1: Machine Navigation Tabs (Full Width - Zero Clipping) */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        overflowX: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        width: '100%',
                        paddingBottom: 2,
                        marginBottom: 6
                      }}>
                        {entryRows.map((r, i) => {
                          const isCur = i === activeMachineIndex;
                          const stat = getMachineCompletionStatus(r, i);
                          const isLck = i > 0 && !getMachineCompletionStatus(entryRows[i - 1], i - 1).isComplete;
                          const mcNum = r.machineNumber || (i + 1);
                          return (
                            <button
                              key={i}
                              type="button"
                              disabled={isLck}
                              onClick={() => setActiveMachineIndex(i)}
                              style={{
                                background: isCur ? '#0b462c' : stat.isComplete ? '#f0fdf4' : '#ffffff',
                                color: isCur ? '#ffffff' : stat.isComplete ? '#166534' : '#475569',
                                border: isCur ? '2px solid #0b462c' : stat.isComplete ? '1.5px solid #86efac' : '1px solid #fde68a',
                                borderRadius: 5,
                                padding: '3px 9px',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isLck ? 'not-allowed' : 'pointer',
                                opacity: isLck ? 0.6 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                height: 26,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span>Machine #{mcNum}</span>
                              {stat.isComplete ? (
                                <span style={{ fontSize: 10, fontWeight: 800, color: isCur ? '#86efac' : '#16a34a' }}>✓</span>
                              ) : isLck ? (
                                <Lock size={10} />
                              ) : (
                                <span style={{
                                  fontSize: 8.5,
                                  fontWeight: 700,
                                  color: isCur ? '#fef08a' : '#d97706',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 2
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: isCur ? '#fef08a' : '#f59e0b', display: 'inline-block' }} />
                                  Incomplete
                                </span>
                              )}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          onClick={handleAddNextMachine}
                          style={{
                            background: '#f8fafc',
                            border: '1px dashed #94a3b8',
                            color: '#0b462c',
                            borderRadius: 4,
                            padding: '3px 9px',
                            fontSize: 10.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            height: 26
                          }}
                          title="Add next machine entry"
                        >
                          <Plus size={11} /> Add Machine
                        </button>
                      </div>

                      {/* Row 2: Mode Segmented Control (Left) + Shift Total & Remove Button (Right) */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap'
                      }}>
                        {/* Mode Segmented Control */}
                        <div style={{
                          display: 'inline-flex',
                          background: '#f1f5f9',
                          borderRadius: 4,
                          padding: 2,
                          border: '1px solid #e2e8f0',
                          height: 26,
                          boxSizing: 'border-box'
                        }}>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => updateRow(index, 'hasIssue', false)}
                            style={{
                              border: 'none',
                              background: !row.hasIssue ? '#0b462c' : 'transparent',
                              color: !row.hasIssue ? '#ffffff' : '#475569',
                              fontWeight: 700,
                              fontSize: 10.5,
                              padding: '2px 8px',
                              borderRadius: 3,
                              cursor: isLocked ? 'not-allowed' : 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Normal Production
                          </button>
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => {
                              updateRow(index, 'hasIssue', true);
                              updateRow(index, 'actualQty', 0);
                              updateRow(index, 'rejectionQty', 0);
                              updateRow(index, 'gapReasonMachineBreakdown', true);
                            }}
                            style={{
                              border: 'none',
                              background: row.hasIssue ? '#b45309' : 'transparent',
                              color: row.hasIssue ? '#ffffff' : '#475569',
                              fontWeight: 700,
                              fontSize: 10.5,
                              padding: '2px 8px',
                              borderRadius: 3,
                              cursor: isLocked ? 'not-allowed' : 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            Machine Issue
                          </button>
                        </div>

                        {/* Right: Shift Total Output Summary + Zero Output Badge / Remove Button */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {row.hasIssue && (
                            <span style={{
                              background: '#fff7ed',
                              color: '#c2410c',
                              border: '1px solid #ffedd5',
                              padding: '1px 6px',
                              borderRadius: 3,
                              fontWeight: 600,
                              fontSize: 10
                            }}>
                              Zero Output
                            </span>
                          )}

                          {/* Shift Total Summary */}
                          <span style={{
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: '#475569',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            padding: '2px 7px',
                            borderRadius: 4,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            whiteSpace: 'nowrap',
                            height: 26,
                            boxSizing: 'border-box'
                          }}>
                            <span>Total:</span>
                            <strong style={{ color: '#0b462c' }}>{entryRows.reduce((a, c) => a + (c.actualQty || 0), 0)} pcs</strong>
                            {entryRows.reduce((a, c) => a + (c.rejectionQty || 0), 0) > 0 && (
                              <span style={{ color: '#dc2626', fontSize: 9.5 }}>
                                ({entryRows.reduce((a, c) => a + (c.rejectionQty || 0), 0)} rej)
                              </span>
                            )}
                          </span>

                          {entryRows.length > 1 && (
                            <button
                              type="button"
                              disabled={isLocked}
                              onClick={() => {
                                const newRows = entryRows.filter((_, i) => i !== index);
                                setEntryRows(newRows);
                                if (activeMachineIndex >= newRows.length) {
                                  setActiveMachineIndex(Math.max(0, newRows.length - 1));
                                }
                              }}
                              style={{
                                background: '#fff0f0',
                                border: '1px solid #ffcdd2',
                                color: '#d32f2f',
                                borderRadius: 4,
                                padding: '2px 7px',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 10.5,
                                fontWeight: 600,
                                height: 26,
                                boxSizing: 'border-box'
                              }}
                              title="Remove this machine from entry"
                            >
                              <Trash2 size={11} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {row.hasIssue ? (
                      /* MACHINE ISSUE PANEL */
                      <div style={{
                        background: '#fffaf5',
                        border: '1.5px solid #fed7aa',
                        borderRadius: 8,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12
                      }}>
                        {/* Header Banner */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid #ffedd5', paddingBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Wrench size={16} color="#c05621" />
                            <span style={{ fontWeight: 800, fontSize: 12, color: '#c05621' }}>
                              Machine #{index + 1} Issue & Downtime Log (Zero Output)
                            </span>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: 4 }}>
                            100% Downtime Loss Recorded
                          </span>
                        </div>

                        {/* Row 1: Scheduled Part (No. & Name) + Die No + Planned Target */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
                          gap: '8px 10px'
                        }}>
                          {/* Part (No. & Name) */}
                          <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                              Scheduled Part (No. & Name) <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <select
                              required
                              disabled={isLocked}
                              style={{
                                width: '100%',
                                height: 32,
                                fontSize: 11.5,
                                background: '#ffffff',
                                fontWeight: 600,
                                border: '1.5px solid #cbd5e1',
                                borderRadius: 4,
                                color: '#0f172a',
                                padding: '0 6px',
                                boxSizing: 'border-box'
                              }}
                              value={row.partId || ''}
                              onChange={e => handlePartChange(index, e.target.value)}
                            >
                              <option value="">-- Select Scheduled Part --</option>
                              {masterParts.map(p => (
                                <option key={p.partId} value={p.partId}>
                                  {p.partNo} - {p.partName}
                                </option>
                              ))}
                            </select>
                            <span style={{ fontSize: 9.5, color: '#64748b', marginTop: 2, display: 'block' }}>
                              Required for calculating planned vs actual gap
                            </span>
                          </div>

                          {/* Die No (Optional / Auto) */}
                          <div>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                              Die No <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 500 }}>(Optional)</span>
                            </label>
                            <input
                              disabled={isLocked}
                              style={{
                                width: '100%',
                                height: 32,
                                fontSize: 11.5,
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                padding: '0 8px',
                                boxSizing: 'border-box',
                                background: '#ffffff'
                              }}
                              placeholder="e.g. 23 or N/A"
                              value={row.dieNo || ''}
                              onChange={e => updateRow(index, 'dieNo', e.target.value)}
                            />
                          </div>

                          {/* Planned Shift Target (pcs) - Locked / Non-editable */}
                          <div>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                              Shift Target (Planned pcs)
                              <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600, marginLeft: 4 }}>
                                <Lock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                                Auto-locked
                              </span>
                            </label>
                            <input
                              readOnly
                              tabIndex={-1}
                              style={{
                                width: '100%',
                                height: 32,
                                fontSize: 13,
                                fontWeight: 800,
                                color: '#0b462c',
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                padding: '0 10px',
                                boxSizing: 'border-box',
                                background: '#f8fafc',
                                cursor: 'default'
                              }}
                              value={row.plannedQty ? `${row.plannedQty} pcs` : '0 pcs'}
                            />
                            <span style={{ fontSize: 9.5, color: '#64748b', marginTop: 2, display: 'block' }}>
                              Auto-derived strictly from Part Master standard
                            </span>
                          </div>
                        </div>

                        {/* Operational Loss Ribbon (Shows Actual vs Planned calculation) */}
                        <div style={{
                          background: '#ffffff',
                          border: '1px solid #fed7aa',
                          borderRadius: 6,
                          padding: '8px 10px',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                          gap: 8,
                          textAlign: 'center'
                        }}>
                          <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Planned Target</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{row.plannedQty || 0} pcs</div>
                          </div>
                          <div style={{ background: '#fff7ed', padding: '4px 6px', borderRadius: 4, border: '1px solid #ffedd5' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Actual Output</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#c2410c' }}>0 pcs (Issue)</div>
                          </div>
                          <div style={{ background: '#fef2f2', padding: '4px 6px', borderRadius: 4, border: '1px solid #fecaca' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Machine Loss Gap</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c' }}>{row.plannedQty || 0} pcs</div>
                          </div>
                          <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Loss Duration</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#334155' }}>
                              {formatLossHours(row.plannedQty || 0, row.plannedQty || 0)}
                            </div>
                          </div>
                        </div>

                        {/* Reason for Machine Issue / Downtime */}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1d2c24', marginBottom: 4 }}>
                            Reason for Machine Issue / Downtime <span style={{ color: '#d84343' }}>*</span>
                          </label>
                          <textarea
                            required
                            disabled={isLocked}
                            rows={3}
                            placeholder="Enter the actual reason why this machine could not produce today (e.g. breakdown, die maintenance, hydraulic leak, electrical trip)..."
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              borderRadius: 5,
                              border: '1.5px solid #d5e0da',
                              fontSize: 12,
                              fontFamily: 'inherit',
                              resize: 'vertical',
                              boxSizing: 'border-box',
                              background: '#ffffff'
                            }}
                            value={row.issueDetails || ''}
                            onChange={e => updateRow(index, 'issueDetails', e.target.value)}
                          />
                        </div>
                      </div>
                    ) : (
                      /* ── FULL WIDTH EXACT SAMPLE PRODUCTION ENTRY LAYOUT ── */
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* Row 1: Operator Name, Part (No. & Name), Die No, Cycle Time (s) */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                          gap: '8px 10px',
                          marginBottom: 10
                        }}>
                          {/* Operator Name */}
                          <div>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                              Operator Name <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <select
                                required
                                disabled={isLocked}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  height: 32,
                                  fontSize: 11.5,
                                  background: '#ffffff',
                                  fontWeight: 500,
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 4,
                                  color: '#0f172a',
                                  padding: '0 6px'
                                }}
                                value={row.operatorPunchNo || ''}
                                onChange={e => updateRow(index, 'operatorPunchNo', e.target.value)}
                              >
                                <option value="">-- Select Operator --</option>
                                {availableOperators.map(o => (
                                  <option key={o.punchNo} value={o.punchNo}>
                                    {o.punchNo} - {o.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={isLocked}
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 4,
                                  background: '#e8f5e9',
                                  border: '1px solid #c8e6c9',
                                  color: '#2e7d32',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: isLocked ? 'not-allowed' : 'pointer',
                                  flexShrink: 0
                                }}
                                onClick={() => setShowOpModal(true)}
                                title="Add Operator"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Part (No. & Name) */}
                          <div>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                              Part (No. & Name) <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <select
                              required
                              disabled={isLocked}
                              style={{
                                width: '100%',
                                height: 32,
                                fontSize: 11.5,
                                background: '#ffffff',
                                fontWeight: 500,
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                color: '#0f172a',
                                padding: '0 6px',
                                boxSizing: 'border-box'
                              }}
                              value={row.partId || ''}
                              onChange={e => handlePartChange(index, e.target.value)}
                            >
                              <option value="">-- Select Part --</option>
                              {masterParts.map(p => (
                                <option key={p.partId} value={p.partId}>
                                  {p.partNo} - {p.partName}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Die No */}
                          <div>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                              Die No <span style={{ color: '#dc2626' }}>*</span>
                            </label>
                            <input
                              required
                              disabled={isLocked}
                              style={{
                                width: '100%',
                                height: 32,
                                fontSize: 11.5,
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                padding: '0 8px',
                                boxSizing: 'border-box'
                              }}
                              placeholder="e.g. 1213"
                              value={row.dieNo || ''}
                              onChange={e => updateRow(index, 'dieNo', e.target.value)}
                            />
                          </div>

                          {/* Cycle Time (s) */}
                          <div>
                            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: '#64748b', marginBottom: 2 }}>
                              Cycle Time (s)
                            </label>
                            <input
                              readOnly
                              style={{
                                width: '100%',
                                height: 32,
                                backgroundColor: '#f8fafc',
                                fontWeight: 600,
                                color: '#334155',
                                textAlign: 'center',
                                fontSize: 11.5,
                                border: '1px solid #e2e8f0',
                                borderRadius: 4,
                                boxSizing: 'border-box'
                              }}
                              value={row.cycleTime || 0}
                            />
                          </div>
                        </div>

                        {/* Row 2: 3 Big Metrics: Shift Target (Auto) | Actual Produced * | Gap Qty - Cohesive Executive Cards */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 95px), 1fr))',
                          gap: 8,
                          marginBottom: 12
                        }}>
                          {/* Card 1: Shift Target */}
                          <div style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            padding: '6px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}>
                            <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: '#64748b', marginBottom: 2, whiteSpace: 'nowrap' }}>
                              TARGET (AUTO)
                            </div>
                            <div style={{
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 16,
                              fontWeight: 800,
                              color: '#0f172a'
                            }}>
                              {row.plannedQty || 0} <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 3 }}>pcs</span>
                            </div>
                          </div>

                          {/* Card 2: Actual Produced * */}
                          <div style={{
                            background: '#ffffff',
                            border: '1.5px solid #0b462c',
                            borderRadius: 6,
                            padding: '6px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            boxShadow: '0 1px 3px rgba(11,70,44,0.06)'
                          }}>
                            <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: '#0b462c', marginBottom: 2, whiteSpace: 'nowrap' }}>
                              PRODUCED <span style={{ color: '#dc2626' }}>*</span>
                            </div>
                            <input
                              required
                              disabled={isLocked}
                              type="number"
                              min="0"
                              style={{
                                width: '100%',
                                height: 32,
                                fontSize: 16,
                                fontWeight: 800,
                                textAlign: 'center',
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                background: '#ffffff',
                                color: '#0b462c',
                                boxSizing: 'border-box',
                                padding: 0
                              }}
                              placeholder="0"
                              value={row.actualQty !== undefined ? row.actualQty : ''}
                              onChange={e => updateRow(index, 'actualQty', e.target.value === '' ? undefined : (parseInt(e.target.value) || 0))}
                            />
                          </div>

                          {/* Card 3: Gap Qty */}
                          <div style={{
                            background: calculated.gap > 0 ? '#fef2f2' : '#f0fdf4',
                            border: calculated.gap > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0',
                            borderRadius: 6,
                            padding: '6px 8px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}>
                            <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: calculated.gap > 0 ? '#991b1b' : '#166534', marginBottom: 2, whiteSpace: 'nowrap' }}>
                              GAP QTY
                            </div>
                            <div style={{
                              height: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 14,
                              fontWeight: 800,
                              color: calculated.gap > 0 ? '#991b1b' : '#166534',
                              gap: 4
                            }}>
                              {calculated.gap > 0 ? (
                                <>
                                  <span>{calculated.gap} pcs</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', background: '#fee2e2', border: '1px solid #fecaca', padding: '1px 4px', borderRadius: 3 }}>Shortfall</span>
                                </>
                              ) : (
                                <>
                                  <span>0 pcs</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', background: '#dcfce7', border: '1px solid #bbf7d0', padding: '1px 4px', borderRadius: 3 }}>Met</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Row 3: 8. Gap Reason Breakdown with Dynamic Shortfall Validation & Loss Hours */}
                        {calculated.gap > 0 ? (() => {
                          const gapMP = row.gapQtyManPower || 0;
                          const gapMB = row.gapQtyMachineBreakdown || 0;
                          const gapMS = row.gapQtyMaterialShortage || 0;
                          const gapMD = row.gapQtyMethod || 0;
                          const totalAllocated = gapMP + gapMB + gapMS + gapMD;
                          const remainingGap = Math.max(0, calculated.gap - totalAllocated);
                          const planQty = row.plannedQty || 0;

                          const handleReasonToggle = (reasonKey: any, qtyKey: any, checked: boolean) => {
                            if (isLocked) return;
                            const currentQty = ((row as any)[qtyKey] as number) || 0;
                            const otherAllocated = totalAllocated - currentQty;
                            const maxAllowed = Math.max(0, calculated.gap - otherAllocated);
                            if (checked) {
                              const autoQty = currentQty > 0 ? Math.min(currentQty, maxAllowed) : maxAllowed;
                              updateRowFields(index, { [reasonKey]: autoQty > 0, [qtyKey]: autoQty });
                            } else {
                              updateRowFields(index, { [reasonKey]: false, [qtyKey]: 0 });
                            }
                          };

                          const handleQtyChange = (reasonKey: any, qtyKey: any, valStr: string) => {
                            if (isLocked) return;
                            const currentQty = ((row as any)[qtyKey] as number) || 0;
                            const otherAllocated = totalAllocated - currentQty;
                            const maxAllowed = Math.max(0, calculated.gap - otherAllocated);
                            if (valStr === '') {
                              updateRowFields(index, { [qtyKey]: 0, [reasonKey]: false });
                              return;
                            }
                            const parsed = parseInt(valStr);
                            if (isNaN(parsed) || parsed <= 0) {
                              updateRowFields(index, { [qtyKey]: 0, [reasonKey]: false });
                              return;
                            }
                            // DYNAMIC VALIDATION: Clamped to remaining shortfall available for this card
                            const clamped = Math.min(parsed, maxAllowed);
                            updateRowFields(index, { [qtyKey]: clamped, [reasonKey]: clamped > 0 });
                          };

                          const handleStep = (reasonKey: any, qtyKey: any, delta: number) => {
                            if (isLocked) return;
                            const currentQty = ((row as any)[qtyKey] as number) || 0;
                            const otherAllocated = totalAllocated - currentQty;
                            const maxAllowed = Math.max(0, calculated.gap - otherAllocated);
                            const newQty = Math.min(Math.max(0, currentQty + delta), maxAllowed);
                            updateRowFields(index, { [qtyKey]: newQty, [reasonKey]: newQty > 0 });
                          };

                          const handleMaxAllocate = (reasonKey: any, qtyKey: any) => {
                            if (isLocked) return;
                            const currentQty = ((row as any)[qtyKey] as number) || 0;
                            const otherAllocated = totalAllocated - currentQty;
                            const maxAllowed = Math.max(0, calculated.gap - otherAllocated);
                            if (maxAllowed > 0) {
                              updateRowFields(index, { [reasonKey]: true, [qtyKey]: maxAllowed });
                            }
                          };

                          const handleCardAssign = (reasonKey: any, qtyKey: any) => {
                            if (isLocked) return;
                            const currentQty = ((row as any)[qtyKey] as number) || 0;
                            const otherAllocated = totalAllocated - currentQty;
                            const maxAllowed = Math.max(0, calculated.gap - otherAllocated);
                            if (maxAllowed > 0) {
                              updateRowFields(index, { [reasonKey]: true, [qtyKey]: maxAllowed });
                            }
                          };

                          const handleAutoFixExcess = () => {
                            if (isLocked || totalAllocated <= calculated.gap) return;
                            let excess = totalAllocated - calculated.gap;
                            const keys: ('gapQtyMethod' | 'gapQtyMaterialShortage' | 'gapQtyMachineBreakdown' | 'gapQtyManPower')[] = [
                              'gapQtyMethod', 'gapQtyMaterialShortage', 'gapQtyMachineBreakdown', 'gapQtyManPower'
                            ];
                            const reasonMap: Record<string, any> = {
                              gapQtyMethod: 'gapReasonMethod', gapQtyMaterialShortage: 'gapReasonMaterialShortage', gapQtyMachineBreakdown: 'gapReasonMachineBreakdown', gapQtyManPower: 'gapReasonManPower'
                            };
                            const sorted = [...keys].sort((a, b) => ((row[b] as number) || 0) - ((row[a] as number) || 0));
                            const updates: any = {};
                            for (const k of sorted) {
                              if (excess <= 0) break;
                              const current = ((row as any)[k] as number) || 0;
                              if (current > 0) {
                                const reduction = Math.min(current, excess);
                                const newQty = current - reduction;
                                updates[k] = newQty;
                                if (newQty === 0) updates[reasonMap[k]] = false;
                                excess -= reduction;
                              }
                            }
                            updateRowFields(index, updates);
                          };

                          const handleClearAll = () => {
                            if (isLocked) return;
                            updateRowFields(index, {
                              gapReasonManPower: false,
                              gapQtyManPower: 0,
                              gapSubReasonManPower: '',
                              gapCustomNoteManPower: '',
                              gapReasonMachineBreakdown: false,
                              gapQtyMachineBreakdown: 0,
                              gapSubReasonMachineBreakdown: '',
                              gapCustomNoteMachineBreakdown: '',
                              gapReasonMaterialShortage: false,
                              gapQtyMaterialShortage: 0,
                              gapSubReasonMaterialShortage: '',
                              gapCustomNoteMaterialShortage: '',
                              gapReasonMethod: false,
                              gapQtyMethod: 0,
                              gapSubReasonMethod: '',
                              gapCustomNoteMethod: ''
                            });
                          };

                          const isExactMatch = totalAllocated === calculated.gap;
                          const isExceeded = totalAllocated > calculated.gap;

                          const gapCardConfigs = [
                            { key: 'ManPower', reasonKey: 'gapReasonManPower' as const, qtyKey: 'gapQtyManPower' as const, subReasonKey: 'gapSubReasonManPower' as const, customNoteKey: 'gapCustomNoteManPower' as const, num: 1, title: 'Manpower', category: 'Manpower', cardQty: gapMP },
                            { key: 'MachineBreakdown', reasonKey: 'gapReasonMachineBreakdown' as const, qtyKey: 'gapQtyMachineBreakdown' as const, subReasonKey: 'gapSubReasonMachineBreakdown' as const, customNoteKey: 'gapCustomNoteMachineBreakdown' as const, num: 2, title: 'Machine Breakdown', category: 'Machine Breakdown', cardQty: gapMB },
                            { key: 'MaterialShortage', reasonKey: 'gapReasonMaterialShortage' as const, qtyKey: 'gapQtyMaterialShortage' as const, subReasonKey: 'gapSubReasonMaterialShortage' as const, customNoteKey: 'gapCustomNoteMaterialShortage' as const, num: 3, title: 'Raw Material Shortage', category: 'Raw Material', cardQty: gapMS },
                            { key: 'Method', reasonKey: 'gapReasonMethod' as const, qtyKey: 'gapQtyMethod' as const, subReasonKey: 'gapSubReasonMethod' as const, customNoteKey: 'gapCustomNoteMethod' as const, num: 4, title: 'Method', category: 'Method', cardQty: gapMD }
                          ];

                          return (
                            <div style={{
                              backgroundColor: '#ffffff',
                              border: isExceeded ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                              borderTop: isExceeded ? '3px solid #ef4444' : isExactMatch ? '3px solid #16a34a' : '3px solid #cbd5e1',
                              borderRadius: 8,
                              padding: '12px 14px',
                              marginBottom: 12,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                            }}>
                              {/* Container Header */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                                    8. Gap Reason Breakdown <span style={{ color: '#dc2626' }}>*</span>
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 4 }}>
                                    Shortfall: <strong style={{ color: '#0f172a' }}>{calculated.gap} pcs</strong>
                                  </span>
                                  {planQty > 0 && (
                                    <span style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: '#475569',
                                      background: '#f8fafc',
                                      border: '1px solid #e2e8f0',
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}>
                                      <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} /> ≈ {formatLossHours(calculated.gap, planQty)} Loss
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  {isExactMatch ? (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '3px 9px', borderRadius: 4 }}>
                                      ✓ Allocated: {totalAllocated} / {calculated.gap} pcs (Exact Match)
                                    </span>
                                  ) : isExceeded ? (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                      ⚠️ Allocated: {totalAllocated} / {calculated.gap} pcs (+{totalAllocated - calculated.gap} excess)
                                      <button
                                        type="button"
                                        disabled={isLocked}
                                        onClick={handleAutoFixExcess}
                                        style={{
                                          background: '#dc2626',
                                          color: '#ffffff',
                                          border: 'none',
                                          borderRadius: 3,
                                          padding: '2px 6px',
                                          fontSize: 10,
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                        title="Auto-balance reasons to match shortfall"
                                      >
                                        Auto-Balance
                                      </button>
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '3px 9px', borderRadius: 4 }}>
                                      Allocated: <strong style={{ color: '#0b462c' }}>{totalAllocated}</strong> / {calculated.gap} pcs ({remainingGap} pcs remaining)
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    disabled={isLocked}
                                    onClick={handleClearAll}
                                    style={{
                                      background: '#ffffff',
                                      border: '1px solid #cbd5e1',
                                      color: '#475569',
                                      padding: '3px 10px',
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: isLocked ? 'not-allowed' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}
                                  >
                                    Reset
                                  </button>
                                </div>
                              </div>

                              {/* 4 Gap Reason Cards - Responsive 4 cols on desktop, 2x2 on tablet, 1 col on mobile */}
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
                                gap: 10
                              }}>
                                {gapCardConfigs.map(cfg => {
                                  const isCardActive = cfg.cardQty > 0;
                                  const otherAllocated = totalAllocated - cfg.cardQty;
                                  const maxAllowed = Math.max(0, calculated.gap - otherAllocated);
                                  const isAtMax = cfg.cardQty >= maxAllowed;

                                  const subReason = ((row as any)[cfg.subReasonKey] as string) || '';
                                  const customNote = ((row as any)[cfg.customNoteKey] as string) || '';
                                  const isRootCauseMissing = isCardActive && !subReason;
                                  const dbReasons = dbGapReasons.filter(r => r.category === cfg.category && r.isActive).map(r => r.reasonName);
                                  const reasonOptions = dbReasons.length > 0 ? dbReasons : (DEFAULT_GAP_REASONS[cfg.category] || ['Others']);

                                  return (
                                    <div
                                      key={cfg.key}
                                      style={{
                                        background: '#ffffff',
                                        border: isCardActive ? '1.5px solid #0b462c' : '1px solid #e2e8f0',
                                        borderRadius: 6,
                                        padding: '10px 12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        transition: 'all 0.15s ease',
                                        boxShadow: isCardActive ? '0 1px 4px rgba(11,70,44,0.08)' : 'none'
                                      }}
                                    >
                                      <div>
                                        {/* Card Header: Checkbox + Title + Status Pill */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 12, color: isCardActive ? '#0b462c' : '#1e293b', cursor: isLocked ? 'default' : 'pointer', margin: 0, userSelect: 'none' }}>
                                            <input
                                              type="checkbox"
                                              disabled={isLocked || (!isCardActive && maxAllowed === 0)}
                                              checked={isCardActive}
                                              onChange={e => handleReasonToggle(cfg.reasonKey, cfg.qtyKey, e.target.checked)}
                                              style={{ width: 15, height: 15, accentColor: '#0b462c', cursor: isLocked || (!isCardActive && maxAllowed === 0) ? 'not-allowed' : 'pointer' }}
                                            />
                                            <span style={{ fontWeight: 700 }}>
                                              {cfg.num}. {cfg.title}
                                            </span>
                                          </label>

                                          {isCardActive ? (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                              <span style={{ background: '#0b462c', color: '#ffffff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 }}>
                                                {cfg.cardQty} pcs
                                              </span>
                                              {planQty > 0 && (
                                                <span style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', fontSize: 9.5, fontWeight: 600, padding: '2px 6px', borderRadius: 4 }} title="Loss hours">
                                                  <Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />{formatLossHours(cfg.cardQty, planQty)}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                                              Off
                                            </span>
                                          )}
                                        </div>

                                        {/* Root Cause Dropdown (Rendered when active) */}
                                        {isCardActive && (
                                          <div style={{ marginTop: 6 }}>
                                            <select
                                              disabled={isLocked}
                                              style={{
                                                width: '100%',
                                                height: 30,
                                                fontSize: 11.5,
                                                borderRadius: 4,
                                                border: isRootCauseMissing ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                                                background: '#ffffff',
                                                color: '#0f172a',
                                                padding: '0 8px',
                                                fontWeight: 500,
                                                boxSizing: 'border-box'
                                              }}
                                              value={subReason}
                                              onChange={e => {
                                                const val = e.target.value;
                                                if (val === '__NEW__') {
                                                  setQuickGapForm({ category: cfg.category, reasonName: '', rowIndex: index });
                                                  setShowQuickGapModal(true);
                                                  return;
                                                }
                                                updateRow(index, cfg.subReasonKey, val);
                                                updateRow(index, cfg.reasonKey, true);
                                              }}
                                            >
                                              <option value="">-- Select Root Cause --</option>
                                              {reasonOptions.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                              ))}
                                              {subReason && !reasonOptions.includes(subReason) && subReason !== 'Others' && (
                                                <option value={subReason}>{subReason}</option>
                                              )}
                                              <option value="__NEW__">➕ Add New Reason...</option>
                                            </select>

                                            {subReason === 'Others' && (
                                              <input
                                                type="text"
                                                disabled={isLocked}
                                                placeholder="Specify detail..."
                                                style={{ width: '100%', height: 28, fontSize: 11, marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', padding: '0 8px', boxSizing: 'border-box' }}
                                                value={customNote}
                                                onChange={e => updateRow(index, cfg.customNoteKey, e.target.value)}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Stepper Row with Dynamic Capping */}
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, gap: 6, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                                          Lost Qty:
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <button
                                            type="button"
                                            disabled={isLocked || cfg.cardQty <= 0}
                                            onClick={() => handleStep(cfg.reasonKey, cfg.qtyKey, -1)}
                                            style={{
                                              width: 28,
                                              height: 28,
                                              border: '1px solid #cbd5e1',
                                              borderRadius: 4,
                                              background: '#f8fafc',
                                              color: '#334155',
                                              fontWeight: 700,
                                              fontSize: 14,
                                              cursor: isLocked || cfg.cardQty <= 0 ? 'not-allowed' : 'pointer',
                                              opacity: isLocked || cfg.cardQty <= 0 ? 0.35 : 1,
                                              padding: 0,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center'
                                            }}
                                            title="Decrease"
                                          >
                                            -
                                          </button>
                                          <input
                                            type="number"
                                            min="0"
                                            max={maxAllowed}
                                            disabled={isLocked || (cfg.cardQty === 0 && maxAllowed === 0)}
                                            placeholder="0"
                                            style={{
                                              width: 52,
                                              height: 28,
                                              textAlign: 'center',
                                              fontWeight: 700,
                                              fontSize: 13,
                                              borderRadius: 4,
                                              border: isCardActive ? '1.5px solid #0b462c' : '1px solid #cbd5e1',
                                              background: cfg.cardQty === 0 && maxAllowed === 0 ? '#f8fafc' : '#ffffff',
                                              color: isCardActive ? '#0b462c' : '#0f172a',
                                              boxSizing: 'border-box'
                                            }}
                                            title={`Max allowed: ${maxAllowed} pcs`}
                                            value={cfg.cardQty > 0 ? cfg.cardQty : 0}
                                            onChange={e => handleQtyChange(cfg.reasonKey, cfg.qtyKey, e.target.value)}
                                          />
                                          <button
                                            type="button"
                                            disabled={isLocked || isAtMax || maxAllowed === 0}
                                            onClick={() => handleStep(cfg.reasonKey, cfg.qtyKey, 1)}
                                            style={{
                                              width: 28,
                                              height: 28,
                                              border: '1px solid #cbd5e1',
                                              borderRadius: 4,
                                              background: '#f8fafc',
                                              color: '#334155',
                                              fontWeight: 700,
                                              fontSize: 14,
                                              cursor: isLocked || isAtMax || maxAllowed === 0 ? 'not-allowed' : 'pointer',
                                              opacity: isLocked || isAtMax || maxAllowed === 0 ? 0.35 : 1,
                                              padding: 0,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center'
                                            }}
                                            title={isAtMax ? "Cannot exceed shortfall limit" : "Increase"}
                                          >
                                            +
                                          </button>
                                          <button
                                            type="button"
                                            disabled={isLocked || isAtMax || maxAllowed === 0}
                                            onClick={() => handleMaxAllocate(cfg.reasonKey, cfg.qtyKey)}
                                            style={{
                                              height: 28,
                                              padding: '0 8px',
                                              border: '1px solid #cbd5e1',
                                              borderRadius: 4,
                                              background: isAtMax || maxAllowed === 0 ? '#f8fafc' : '#f1f5f9',
                                              color: isAtMax || maxAllowed === 0 ? '#94a3b8' : '#334155',
                                              fontWeight: 600,
                                              fontSize: 10.5,
                                              cursor: isLocked || isAtMax || maxAllowed === 0 ? 'not-allowed' : 'pointer',
                                              opacity: isLocked || isAtMax || maxAllowed === 0 ? 0.45 : 1
                                            }}
                                            title={`Allocate remaining (${maxAllowed} pcs)`}
                                          >
                                            Max
                                          </button>
                                          <span style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b' }}>pcs</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })() : (row.actualQty || 0) >= (row.plannedQty || 0) && (row.plannedQty || 0) > 0 ? (
                          <div style={{
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: 6,
                            padding: '8px 12px',
                            marginBottom: 14,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            color: '#15803d',
                            fontSize: 12,
                            fontWeight: 600
                          }}>
                            <span>✓ <strong>Shift Target Met!</strong> Zero production shortfall recorded for this machine.</span>
                            <span style={{ fontSize: 11, color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: 8, fontWeight: 700 }}>
                              0 Gap • All Clear
                            </span>
                          </div>
                        ) : null}

                        {/* 9. Rejection Defect Ledger */}
                        <div style={{
                          backgroundColor: '#ffffff',
                          padding: '12px 14px',
                          border: '1px solid #e2e8f0',
                          borderTop: (row.rejectionQty || 0) > 0 ? '3px solid #dc2626' : '3px solid #cbd5e1',
                          borderRadius: 8,
                          marginBottom: 12,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <strong style={{ color: '#0f172a', fontSize: 12.5 }}>9. Rejections</strong>
                              <span style={{
                                fontSize: 11,
                                background: (row.rejectionQty || 0) > 0 ? '#fef2f2' : '#f8fafc',
                                color: (row.rejectionQty || 0) > 0 ? '#991b1b' : '#64748b',
                                border: (row.rejectionQty || 0) > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontWeight: 600
                              }}>
                                Total: {row.rejectionQty || 0} pcs
                              </span>
                            </div>
                            {(row.rejectionQty || 0) > 0 && (
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => {
                                  updateRow(index, 'parsedRejections', []);
                                  updateRow(index, 'rejectionQty', 0);
                                }}
                                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                              >
                                Clear Defect Tally
                              </button>
                            )}
                          </div>

                          {/* 8 Defect Cards - Responsive Grid: 2 cols (pairs) on mobile, 4 cols on tablet, 8 cols on desktop */}
                          <div className="rejection-defect-grid">
                            {STANDARD_REJECTION_REASONS.map(reasonName => {
                              const currentItem = (row.parsedRejections || []).find(r => r.reason === reasonName);
                              const currentQty = currentItem?.qty || 0;
                              const customNote = currentItem?.note || '';

                              const handleSetDefectQty = (newVal: number) => {
                                if (isLocked) return;
                                const currentList = row.parsedRejections || [];
                                let updatedList: { reason: string; qty: number; note?: string }[] = [];
                                if (newVal > 0) {
                                  const existingIdx = currentList.findIndex(r => r.reason === reasonName);
                                  if (existingIdx >= 0) {
                                    updatedList = currentList.map((r, i) => i === existingIdx ? { ...r, qty: newVal } : r);
                                  } else {
                                    updatedList = [...currentList, { reason: reasonName, qty: newVal, note: customNote }];
                                  }
                                } else {
                                  updatedList = currentList.filter(r => r.reason !== reasonName);
                                }
                                const total = updatedList.reduce((sum, r) => sum + (r.qty || 0), 0);
                                updateRow(index, 'parsedRejections', updatedList);
                                updateRow(index, 'rejectionQty', total);
                              };

                              return (
                                <div
                                  key={reasonName}
                                  style={{
                                    background: '#ffffff',
                                    border: currentQty > 0 ? '1.5px solid #0b462c' : '1px solid #e2e8f0',
                                    borderRadius: 6,
                                    padding: '6px 8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    minHeight: 52,
                                    boxShadow: currentQty > 0 ? '0 1px 3px rgba(11,70,44,0.06)' : 'none',
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 4 }}>
                                    <span style={{
                                      fontSize: 11,
                                      fontWeight: currentQty > 0 ? 700 : 600,
                                      color: currentQty > 0 ? '#0b462c' : '#334155',
                                      lineHeight: 1.2,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }} title={reasonName}>
                                      {reasonName}
                                    </span>
                                    {currentQty > 0 && (
                                      <span style={{ fontSize: 9, fontWeight: 700, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 4px', borderRadius: 4, flexShrink: 0 }}>
                                        ✓ {currentQty}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <button
                                      type="button"
                                      disabled={isLocked || currentQty <= 0}
                                      onClick={() => handleSetDefectQty(Math.max(0, currentQty - 1))}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 4,
                                        background: '#f8fafc',
                                        color: '#334155',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        cursor: isLocked || currentQty <= 0 ? 'not-allowed' : 'pointer',
                                        opacity: isLocked || currentQty <= 0 ? 0.35 : 1,
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                      }}
                                      title="Decrease 1"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      disabled={isLocked}
                                      placeholder="0"
                                      style={{
                                        flex: 1,
                                        minWidth: 26,
                                        height: 26,
                                        textAlign: 'center',
                                        fontWeight: 700,
                                        fontSize: 12.5,
                                        borderRadius: 4,
                                        border: currentQty > 0 ? '1.5px solid #0b462c' : '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: currentQty > 0 ? '#0b462c' : '#0f172a',
                                        boxSizing: 'border-box',
                                        padding: 0
                                      }}
                                      value={currentQty > 0 ? currentQty : ''}
                                      onChange={e => {
                                        const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                                        handleSetDefectQty(val);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      disabled={isLocked}
                                      onClick={() => handleSetDefectQty(currentQty + 1)}
                                      style={{
                                        width: 26,
                                        height: 26,
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 4,
                                        background: '#f8fafc',
                                        color: '#334155',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        cursor: isLocked ? 'not-allowed' : 'pointer',
                                        opacity: isLocked ? 0.45 : 1,
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0
                                      }}
                                      title="Quick +1 Defect"
                                    >
                                      +
                                    </button>
                                  </div>

                                  {reasonName === 'Others' && currentQty > 0 && (
                                    <input
                                      type="text"
                                      disabled={isLocked}
                                      placeholder="Detail (e.g. Dent)..."
                                      style={{ width: '100%', height: 24, fontSize: 10.5, marginTop: 4, borderRadius: 4, border: '1px solid #cbd5e1', padding: '0 6px', boxSizing: 'border-box' }}
                                      value={customNote}
                                      onChange={e => {
                                        const noteVal = e.target.value;
                                        const currentList = row.parsedRejections || [];
                                        const updatedList = currentList.map(r => r.reason === reasonName ? { ...r, note: noteVal } : r);
                                        updateRow(index, 'parsedRejections', updatedList);
                                      }}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Executive Summary Bar: Accepted, Efficiency, Remark, Trace ID */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',
                          gap: '6px 8px',
                          alignItems: 'center',
                          padding: '8px 10px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 6
                        }}>
                          {/* Accepted */}
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: '#64748b', display: 'block', whiteSpace: 'nowrap' }}>
                              Accepted (Good Pieces)
                            </span>
                            <strong style={{ fontSize: 15, color: '#0b462c', fontWeight: 800 }}>
                              {Math.max(0, (row.actualQty || 0) - (row.rejectionQty || 0))} pcs
                            </strong>
                          </div>

                          {/* OEE / Shift Efficiency */}
                          {(() => {
                            const act = row.actualQty || 0;
                            const plan = calculated.plannedQty || row.plannedQty || 0;
                            // Breakdown loss hours in this shift (10 hrs shift)
                            // Availability = ((10 hrs - breakdown hrs) / 10 hrs) * 100
                            const mbQty = calculated.gapQtyMachineBreakdown || row.gapQtyMachineBreakdown || 0;
                            const breakdownHours = plan > 0 && mbQty > 0 ? (mbQty / plan) * 10 : 0;
                            const availabilityPct = Math.max(0, Math.min(100, ((10 - breakdownHours) / 10) * 100));
                            const performancePct = plan > 0 ? (act / plan) * 100 : 0;
                            const qualityPct = 100; // As specified: Quality rate should be 100%
                            const oeePct = (availabilityPct / 100) * (performancePct / 100) * (qualityPct / 100) * 100;
                            const oeeFormatted = oeePct.toFixed(1);

                            return (
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: '#64748b', display: 'block', whiteSpace: 'nowrap' }} title="Overall Equipment Effectiveness: Availability × Performance × Quality(100%)">
                                  OEE (Shift)
                                </span>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                  <strong style={{ fontSize: 15, color: oeePct >= 85 ? '#15803d' : oeePct >= 60 ? '#0b462c' : '#b45309', fontWeight: 800 }}>
                                    {plan > 0 ? `${oeeFormatted}%` : '0%'}
                                  </strong>
                                  <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '1px 5px', borderRadius: 3 }} title={`Availability: ${availabilityPct.toFixed(0)}% (10h - ${breakdownHours.toFixed(1)}h BD) | Performance: ${performancePct.toFixed(1)}% (${act}/${plan}) | Quality: 100%`}>
                                    A:{availabilityPct.toFixed(0)}% · P:{performancePct.toFixed(0)}% · Q:100%
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Remark */}
                          <div style={{ minWidth: 0 }}>
                            <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
                              Remark / Shift Notes
                            </label>
                            <input
                              type="text"
                              disabled={isLocked}
                              placeholder="Optional shift notes..."
                              style={{ width: '100%', height: 28, fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, padding: '0 6px', boxSizing: 'border-box', background: '#ffffff' }}
                              value={row.remark || ''}
                              onChange={e => updateRow(index, 'remark', e.target.value)}
                            />
                          </div>

                          {/* Trace ID */}
                          <div style={{ minWidth: 0 }}>
                            <label style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
                              Trace ID (Auto)
                            </label>
                            <div style={{
                              height: 28,
                              backgroundColor: '#ffffff',
                              fontWeight: 700,
                              fontSize: 11,
                              color: '#0b462c',
                              border: '1px solid #cbd5e1',
                              borderRadius: 4,
                              fontFamily: 'monospace',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxSizing: 'border-box'
                            }}>
                              {calculated.traceabilityBatchId || '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
                );
            })}

            {/* Bottom Action Footer */}
            <div style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid #edf4f0'
            }}>
                <button
                  type="button"
                  disabled={isShiftLocked}
                  className="btn btn-outline"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    fontWeight: 700,
                    height: 35,
                    fontSize: 12,
                    padding: '0 12px',
                    opacity: isShiftLocked ? 0.45 : 1,
                    cursor: isShiftLocked ? 'not-allowed' : 'pointer',
                    flex: '1 1 130px'
                  }}
                  onClick={handleAddNextMachine}
                >
                    <Plus size={15}/> Add Next Machine
                </button>
                <div style={{ display: 'flex', gap: 6, flex: '1 1 240px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={isShiftLocked}
                      className="btn btn-nav"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        height: 35,
                        fontSize: 12,
                        padding: '0 12px',
                        opacity: isShiftLocked ? 0.45 : 1,
                        cursor: isShiftLocked ? 'not-allowed' : 'pointer',
                        flex: '1 1 100px'
                      }}
                      onClick={e => handleSave(e, 'Draft')}
                    >
                      <Save size={15}/> Save as Draft
                    </button>
                    <button
                      type="button"
                      disabled={isShiftLocked}
                      className="btn btn-highlight"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        height: 35,
                        fontSize: 12,
                        padding: '0 14px',
                        opacity: isShiftLocked ? 0.45 : 1,
                        cursor: isShiftLocked ? 'not-allowed' : 'pointer',
                        flex: '1 1 140px'
                      }}
                      onClick={e => handleSave(e, 'Submitted')}
                    >
                      <Check size={15}/> Submit All for Approval
                    </button>
                </div>
            </div>
          </form>
        </div>
        );
      })()}

      {/* Table Filter Controls */}
      <div id="production-entries-table" style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* Top Header Row: Title, Counter & View Mode Toggle (Strictly Single Row) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'nowrap', paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <TableIcon size={15} color="#0b462c" style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 800, fontSize: 12.5, color: '#0f172a', whiteSpace: 'nowrap' }}>
              Production Records
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#475569',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              padding: '1px 6px',
              borderRadius: 10,
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}>
              {filteredEntries.length} {filteredEntries.length === 1 ? 'Record' : 'Records'}
              {filteredEntries.length !== entries.length && ` (of ${entries.length})`}
            </span>
          </div>

          {/* View Mode Toggle: Cards View vs Full Table */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 2, borderRadius: 5, border: '1px solid #e2e8f0', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setTableViewMode('cards')}
              style={{
                background: tableViewMode === 'cards' ? '#0b462c' : 'transparent',
                color: tableViewMode === 'cards' ? '#ffffff' : '#64748b',
                border: 'none',
                borderRadius: 3,
                padding: '2px 7px',
                fontSize: 10.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Card view: Clean mobile-friendly view"
            >
              <LayoutGrid size={12} /> Cards View
            </button>
            <button
              type="button"
              onClick={() => setTableViewMode('table')}
              style={{
                background: tableViewMode === 'table' ? '#0b462c' : 'transparent',
                color: tableViewMode === 'table' ? '#ffffff' : '#64748b',
                border: 'none',
                borderRadius: 3,
                padding: '2px 7px',
                fontSize: 10.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Table view: 15-column spreadsheet layout"
            >
              <TableIcon size={12} /> Full Table
            </button>
          </div>
        </div>

        {/* Filter Inputs: Search Row (Row 2) + Date & Shift Compact Row (Row 3) */}
        <div style={{ marginTop: 8 }}>
          {/* Row 2: Text Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', marginBottom: 6 }}>
            <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8 }} />
            <input
              type="text"
              placeholder="Search part, M/C, operator, trace ID..."
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              style={{ width: '100%', height: 28, fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, padding: '0 24px 0 26px', boxSizing: 'border-box' }}
            />
            {tableSearch && (
              <button
                type="button"
                onClick={() => setTableSearch('')}
                style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer', padding: '0 4px' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Row 3: Date + Shift + Reset Filters (All in 1 Responsive Row) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',
            gap: '6px 8px',
            alignItems: 'center'
          }}>
            {/* Date Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>Date:</label>
              <input
                type="date"
                value={tableDateFilter}
                onChange={e => setTableDateFilter(e.target.value)}
                style={{ flex: 1, minWidth: 0, height: 28, fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, padding: '0 4px', boxSizing: 'border-box' }}
              />
              {tableDateFilter && (
                <button
                  type="button"
                  onClick={() => setTableDateFilter('')}
                  style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', padding: '0 2px', flexShrink: 0 }}
                  title="Clear date filter (show all dates)"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => setTableDateFilter(getTodayDateString())}
                style={{
                  background: tableDateFilter === getTodayDateString() ? '#e8f3ed' : '#ffffff',
                  border: tableDateFilter === getTodayDateString() ? '1.5px solid #0b462c' : '1px solid #cbd5e1',
                  color: tableDateFilter === getTodayDateString() ? '#0b462c' : '#475569',
                  borderRadius: 4,
                  padding: '0 6px',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  boxSizing: 'border-box',
                  flexShrink: 0
                }}
                title="Auto-select Today's date"
              >
                Today
              </button>
            </div>

            {/* Shift Filter & Reset Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <label style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0 }}>Shift:</label>
              <select
                value={tableShiftFilter}
                onChange={e => setTableShiftFilter(e.target.value)}
                style={{ flex: 1, minWidth: 0, height: 28, fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, padding: '0 4px', boxSizing: 'border-box' }}
              >
                <option value="All">All Shifts</option>
                <option value="Shift A">Shift A</option>
                <option value="Shift B">Shift B</option>
              </select>

              {/* Reset Filters button */}
              {(tableDateFilter || (tableShiftFilter && tableShiftFilter !== 'All') || tableSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setTableDateFilter('');
                    setTableShiftFilter('All');
                    setTableSearch('');
                  }}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: 4,
                    padding: '0 8px',
                    height: 28,
                    fontSize: 10.5,
                    cursor: 'pointer',
                    color: '#475569',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  title="Reset all search & date filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 30, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          Loading production entries...
        </div>
      ) : filteredEntries.length === 0 ? (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: 12.5 }}>
          <p style={{ margin: '0 0 10px 0' }}>
            No entries match the selected filters{tableDateFilter ? ` for ${tableDateFilter === getTodayDateString() ? 'Today' : tableDateFilter} (${tableDateFilter})` : ''}.
          </p>
          {tableDateFilter && (
            <button
              type="button"
              onClick={() => setTableDateFilter('')}
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0b462c',
                borderRadius: 5,
                padding: '6px 14px',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Show All Recorded Dates ({entries.length} Total)
            </button>
          )}
        </div>
      ) : tableViewMode === 'cards' ? (
        /* ── MOBILE-FRIENDLY EXECUTIVE CARDS VIEW ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredEntries.map(e => {
            const isDown = e.actualQty === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE:')));
            const op = operators.find(o => o.punchNo === e.operatorPunchNo || o.aliasLetter === e.operatorPunchNo || o.name === e.operatorPunchNo);
            const opDisplayName = op ? op.name : (e.operatorPunchNo || '-');

            return (
              <div
                key={e.id}
                style={{
                  background: '#ffffff',
                  border: isDown ? '1.5px solid #fed7aa' : '1px solid #e2e8f0',
                  borderTop: isDown ? '3px solid #f97316' : e.status === 'Approved' ? '3px solid #16a34a' : '3px solid #0b462c',
                  borderRadius: 8,
                  padding: '12px 14px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}
              >
                {/* Card Top: Trace ID + Machine + Date/Shift + Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, borderBottom: '1px solid #f1f5f9', paddingBottom: 8, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12.5, color: '#0b462c', background: '#e8f3ed', padding: '2px 8px', borderRadius: 4, border: '1px solid #c2ded0' }}>
                      {e.traceabilityBatchId || '-'}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 11, color: '#0b462c', background: '#f0fdf4', padding: '2px 8px', borderRadius: 4, border: '1px solid #bbf7d0' }}>
                      M/C #{e.machineNumber}
                    </span>
                    {isDown && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: '#ffedd5', color: '#9a3412', border: '1px solid #fed7aa', padding: '1px 6px', borderRadius: 4 }}>
                        DOWNTIME
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      {new Date(e.date).toLocaleDateString()} • {e.shift}
                    </span>
                    <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : e.status === 'Returned' ? 'badge-rej-high' : ''}`}>
                      {e.status}
                    </span>
                  </div>
                </div>

                {/* Row 2: Part Name & Operator */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                      Part No & Name
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                      {(e as any).part?.partNo || '-'}
                    </div>
                    {(e as any).part?.partName && (
                      <div style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>
                        {(e as any).part?.partName} {e.dieNo ? `• Die: ${e.dieNo}` : ''}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                      Operator
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                      {opDisplayName}
                    </div>
                    {op && op.punchNo && op.punchNo !== opDisplayName && (
                      <div style={{ fontSize: 10.5, color: '#64748b' }}>Punch No: {op.punchNo}</div>
                    )}
                  </div>
                </div>

                {/* Row 3: 4 Metric Badges in 1 Grid: Planned | Actual | Rej | Accepted */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10, textAlign: 'center' }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 4px' }}>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>Planned</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#334155' }}>{e.plannedQty || 0}</div>
                  </div>
                  <div style={{ background: isDown ? '#fff7ed' : '#ffffff', border: isDown ? '1px solid #fed7aa' : '1px solid #c2ded0', borderRadius: 6, padding: '6px 4px' }}>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700, color: isDown ? '#c2410c' : '#0b462c', marginBottom: 2 }}>Actual</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: isDown ? '#c2410c' : '#0b462c' }}>{e.actualQty || 0}</div>
                  </div>
                  <div style={{ background: (e.rejectionQty || 0) > 0 ? '#fef2f2' : '#f8fafc', border: (e.rejectionQty || 0) > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: 6, padding: '6px 4px' }}>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700, color: (e.rejectionQty || 0) > 0 ? '#991b1b' : '#64748b', marginBottom: 2 }}>Rejected</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: (e.rejectionQty || 0) > 0 ? '#991b1b' : '#64748b' }}>{e.rejectionQty || 0}</div>
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 4px' }}>
                    <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700, color: '#166534', marginBottom: 2 }}>Accepted</div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#166534' }}>{Math.max(0, (e.actualQty || 0) - (e.rejectionQty || 0))}</div>
                  </div>
                </div>

                {/* Row 4: Efficiency & Shortfall / Reasons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>EFFICIENCY:</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: e.efficiency >= 85 ? '#15803d' : '#b45309' }}>
                      {e.efficiency}%
                    </span>
                    {e.gap > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#991b1b', background: '#fee2e2', padding: '1px 6px', borderRadius: 3 }}>
                        {e.gap} Gap
                      </span>
                    )}
                  </div>

                  {/* Reason summary */}
                  <div style={{ fontSize: 11, color: '#475569', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isDown ? (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>{e.remark || 'Machine Downtime'}</span>
                    ) : (
                      formatRejectionReasons(e.reasonForRejection, e.rejectionQty)
                    )}
                  </div>
                </div>

                {/* Row 5: Actions Bar */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
                  {/* HOD Quick Actions */}
                  {isHODOrAdmin && e.status === 'Submitted' && (
                    <>
                      <button
                        type="button"
                        style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onClick={() => handleShiftHODAction(e.date.split('T')[0], e.shift, 'Approve')}
                        title="Approve this shift"
                      >
                        <Check size={13} /> Approve
                      </button>
                      <button
                        type="button"
                        style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecdd3', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onClick={() => handleShiftHODAction(e.date.split('T')[0], e.shift, 'Return')}
                        title="Return this shift for corrections"
                      >
                        <RotateCcw size={13} /> Return
                      </button>
                    </>
                  )}

                  {/* Edit Button */}
                  {(role?.toLowerCase() === 'admin' || (new Date().getTime() - new Date(e.createdAt || e.date).getTime()) <= 8 * 60 * 60 * 1000) && (
                    <button
                      type="button"
                      style={{ background: '#e8f3ed', color: '#0b462c', border: '1px solid #c2ded0', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={() => { 
                        setSessionHeader({
                          date: e.date.split('T')[0],
                          shift: e.shift,
                          supervisorId: (operators.find(o => o.punchNo === e.operatorPunchNo) as any)?.supervisorId?.toString() || ''
                        });
                        let pRej = [];
                        try { if (e.reasonForRejection) pRej = JSON.parse(e.reasonForRejection); } catch {}
                        const isEntryIssue = Boolean(e.actualQty === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE'))));
                        let details = e.remark || '';
                        if (isEntryIssue && e.remark) {
                          details = e.remark.replace(/^\[MACHINE ISSUE[^\]]*\]\s*/, '').replace(/\s*\(Supervisor:[^)]*\)$/, '').replace(/\s*\|\s*Supervisor:.*$/, '').replace(/\s*\|\s*Downtime:.*$/, '').trim();
                        }
                        setEntryRows([{
                          ...e,
                          hasIssue: isEntryIssue,
                          issueDetails: details,
                          parsedRejections: Array.isArray(pRej) ? pRej : []
                        }]); 
                        setIsEditing(true); 
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      title="Edit this machine entry"
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                  )}

                  {/* Delete Button */}
                  {role?.toLowerCase() === 'admin' && (
                    <button
                      type="button"
                      style={{ background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                      onClick={() => handleDeleteEntry(e.id)}
                      title="Delete this record"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Cards View Totals Summary Card */}
          <div style={{
            background: '#f8fafc',
            border: '1.5px solid #0b462c',
            borderRadius: 8,
            padding: '12px 14px',
            marginTop: 4
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#0b462c', marginBottom: 8 }}>
              FILTERED TOTALS SUMMARY ({filteredEntries.length} RECORDS)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))', gap: 8, textAlign: 'center' }}>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 4px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#64748b' }}>TOTAL PLAN</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{filteredEntries.reduce((a, c) => a + (c.plannedQty || 0), 0)} pcs</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #c2ded0', borderRadius: 6, padding: '6px 4px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#0b462c' }}>TOTAL PRODUCED</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0b462c' }}>{filteredEntries.reduce((a, c) => a + (c.actualQty || 0), 0)} pcs</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 4px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#991b1b' }}>TOTAL REJECTIONS</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#991b1b' }}>{filteredEntries.reduce((a, c) => a + (c.rejectionQty || 0), 0)} pcs</div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 4px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: '#166534' }}>TOTAL ACCEPTED</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>{filteredEntries.reduce((a, c) => a + ((c.actualQty || 0) - (c.rejectionQty || 0)), 0)} pcs</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── FULL SPREADSHEET TABLE VIEW (WITH SWIPE AFFORDANCE) ── */
        <div className="table-wrapper" style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            fontSize: 11,
            color: '#64748b'
          }}>
            <span>↔ <strong>Horizontal Scroll Enabled:</strong> Swipe left/right to view all 15 columns.</span>
            <span style={{ fontWeight: 700, color: '#0b462c' }}>{filteredEntries.length} Rows</span>
          </div>

          <table style={{ minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 10, background: '#0b462c', whiteSpace: 'nowrap', boxShadow: '2px 0 4px rgba(0,0,0,0.08)' }}>Trace ID</th>
                <th>Date</th>
                <th>Operator Name</th>
                <th>Part No & Name</th>
                <th>M/C No</th>
                <th>Die No</th>
                <th>Planned</th>
                <th>Actual</th>
                <th>Rej Qty</th>
                <th>Accepted</th>
                <th>Gap</th>
                <th>Reasons / Issue Log</th>
                <th>Efficiency</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map(e => {
                const isDown = e.actualQty === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE:')));
                const op = operators.find(o => o.punchNo === e.operatorPunchNo || o.aliasLetter === e.operatorPunchNo || o.name === e.operatorPunchNo);
                const opDisplayName = op ? op.name : (e.operatorPunchNo || '-');
                return (
                <tr key={e.id} style={{ background: isDown ? '#fffdf7' : 'inherit' }}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 2, background: isDown ? '#fffdf7' : '#fff', fontWeight: 'bold', color: '#004d40', fontSize: '0.9em', boxShadow: '2px 0 4px rgba(0,0,0,0.05)' }}>{e.traceabilityBatchId}</td>
                  <td>{new Date(e.date).toLocaleDateString()}</td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{opDisplayName}</div>
                    {op && op.punchNo && op.punchNo !== opDisplayName && (
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>ID: {op.punchNo}</div>
                    )}
                    {isDown && <span style={{ marginTop: 2, display: 'inline-block', fontSize: 10, background: '#fed7aa', color: '#9a3412', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>DOWNTIME</span>}
                  </td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{(e as any).part?.partNo || '-'}</div>
                    {(e as any).part?.partName && (
                      <div style={{ fontSize: 10.5, color: '#64748b', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(e as any).part?.partName}>
                        {(e as any).part?.partName}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 700, color: '#0b462c' }}>{e.machineNumber}</td>
                  <td>{e.dieNo}</td>
                  <td>{e.plannedQty}</td>
                  <td style={{fontWeight: 'bold', color: isDown ? '#c05621' : '#0b462c'}}>
                    {isDown ? (
                      <span style={{ background: '#ffedd5', color: '#9a3412', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                        0 (Issue)
                      </span>
                    ) : (
                      e.actualQty
                    )}
                  </td>
                  <td style={{color: '#b71c1c', fontWeight: 'bold'}}>{e.rejectionQty}</td>
                  <td style={{fontWeight: 'bold', color: '#004d40'}}>{(e.actualQty || 0) - (e.rejectionQty || 0)}</td>
                  <td style={{color: e.gap > 0 ? '#b71c1c' : 'inherit'}}>{e.gap}</td>
                  <td style={{ fontSize: '0.85em', maxWidth: 260 }}>
                      {isDown ? (
                        <div style={{ color: '#b45309', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.remark}>
                          ⚠️ {e.remark || 'Machine Breakdown / No Production'}
                        </div>
                      ) : (
                        formatRejectionReasons(e.reasonForRejection, e.rejectionQty)
                      )}
                  </td>
                  <td style={{fontWeight: 'bold'}}>{e.efficiency}%</td>
                  <td>
                      <span className={`badge ${e.status === 'Approved' ? 'badge-yield' : e.status === 'Submitted' ? 'badge-gap-high' : e.status === 'Returned' ? 'badge-rej-high' : ''}`}>
                          {e.status}
                      </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        {/* HOD Quick Actions on Table */}
                        {isHODOrAdmin && e.status === 'Submitted' && (
                          <>
                            <button
                              className="btn-small"
                              style={{ background: '#dcfce7', color: '#166534', padding: '4px 6px', display: 'flex', alignItems: 'center', border: '1px solid #bbf7d0' }}
                              onClick={() => handleShiftHODAction(e.date.split('T')[0], e.shift, 'Approve')}
                              title="Approve this shift"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className="btn-small"
                              style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 6px', display: 'flex', alignItems: 'center', border: '1px solid #fecdd3' }}
                              onClick={() => handleShiftHODAction(e.date.split('T')[0], e.shift, 'Return')}
                              title="Return this shift for corrections"
                            >
                              <RotateCcw size={13} />
                            </button>
                          </>
                        )}

                        {/* Edit Logic: Admins can always edit. Supervisors can edit within 8 hours of creation */}
                        {(role?.toLowerCase() === 'admin' || (new Date().getTime() - new Date(e.createdAt || e.date).getTime()) <= 8 * 60 * 60 * 1000) && (
                            <button className="btn-small" style={{ background: '#e8f3ed', color: '#0b462c', flex: 1, padding: '4px 0', display: 'flex', justifyContent: 'center' }} onClick={() => { 
                                setSessionHeader({
                                    date: e.date.split('T')[0],
                                    shift: e.shift,
                                    supervisorId: (operators.find(o => o.punchNo === e.operatorPunchNo) as any)?.supervisorId?.toString() || ''
                                });
                                let pRej = [];
                                try { if (e.reasonForRejection) pRej = JSON.parse(e.reasonForRejection); } catch {}
                                const isEntryIssue = Boolean(e.actualQty === 0 && (e.gapReasonMachineBreakdown || (e.remark && e.remark.includes('[MACHINE ISSUE'))));
                                let details = e.remark || '';
                                if (isEntryIssue && e.remark) {
                                  details = e.remark.replace(/^\[MACHINE ISSUE[^\]]*\]\s*/, '').replace(/\s*\(Supervisor:[^)]*\)$/, '').replace(/\s*\|\s*Supervisor:.*$/, '').replace(/\s*\|\s*Downtime:.*$/, '').trim();
                                }
                                setEntryRows([{
                                  ...e,
                                  hasIssue: isEntryIssue,
                                  issueDetails: details,
                                  parsedRejections: Array.isArray(pRej) ? pRej : []
                                }]); 
                                setIsEditing(true); 
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }} title="Edit"><Edit2 size={14}/></button>
                        )}
                        
                        {/* Delete Logic: Only Admins/HODs can delete */}
                        {role?.toLowerCase() === 'admin' && (
                            <button className="btn-small" style={{ background: '#ffebee', color: '#c62828', flex: 1, padding: '4px 0', display: 'flex', justifyContent: 'center' }} onClick={() => handleDeleteEntry(e.id)} title="Delete"><Trash2 size={14}/></button>
                        )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot>
                <tr style={{ backgroundColor: '#f0f4f2', borderTop: '2px solid #0b462c' }}>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 'bold', color: '#0b462c' }}>TOTALS:</td>
                  <td style={{ fontWeight: 'bold' }}>{filteredEntries.reduce((a, c) => a + (c.plannedQty || 0), 0)}</td>
                  <td style={{ fontWeight: 'bold', color: '#0b462c' }}>{filteredEntries.reduce((a, c) => a + (c.actualQty || 0), 0)}</td>
                  <td style={{ fontWeight: 'bold', color: '#b71c1c' }}>{filteredEntries.reduce((a, c) => a + (c.rejectionQty || 0), 0)}</td>
                  <td style={{ fontWeight: 'bold', color: '#004d40' }}>{filteredEntries.reduce((a, c) => a + ((c.actualQty || 0) - (c.rejectionQty || 0)), 0)}</td>
                  <td style={{ fontWeight: 'bold', color: '#b71c1c' }}>{filteredEntries.reduce((a, c) => a + (c.gap > 0 ? c.gap : 0), 0)}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    Rej: {filteredEntries.reduce((a, c) => a + (c.actualQty || 0), 0) > 0 ? ((filteredEntries.reduce((a, c) => a + (c.rejectionQty || 0), 0) / filteredEntries.reduce((a, c) => a + (c.actualQty || 0), 0)) * 100).toFixed(1) : 0}%
                  </td>
                  <td style={{ fontWeight: 'bold' }}>
                    {filteredEntries.length > 0 ? (filteredEntries.reduce((a, c) => a + (c.efficiency || 0), 0) / filteredEntries.length).toFixed(1) : 0}%
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      </>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: activeTab === 'reports' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        <HODReportsView entries={entries} operators={operators} masterParts={masterParts} />
      </div>

      {/* ── DEDICATED HOD MODULE: ONLY SHOWS SHIFT APPROVALS & SUPERVISOR CONTROL ── */}
      <div style={{ flex: 1, minHeight: 0, display: activeTab === 'approvals' ? 'flex' : 'none', flexDirection: 'column', overflowY: 'auto', padding: '0 4px 20px 0', gap: 16 }}>
        
        {/* Modern Executive Header Card (Mobbin Pattern) */}
        <div style={{
          background: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          padding: '12px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e8f5e9', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={16} />
              </div>
              <h2 style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 800,
                color: '#0b462c',
                lineHeight: 1.2
              }}>
                HOD Shift Approval Console
              </h2>
              <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>HOD</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
              Sequential shift verification & plant governance sign-off.
            </p>
          </div>

          <div className="hod-header-actions-col">
            <button
              type="button"
              onClick={() => setShowSupPwdCard(prev => !prev)}
              style={{
                background: showSupPwdCard ? '#0b462c' : '#f8fafc',
                color: showSupPwdCard ? '#ffffff' : '#0b462c',
                border: showSupPwdCard ? '1px solid #0b462c' : '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 11.5,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
              title="Set or update password for supervisor login"
            >
              <KeyRound size={13} />
              <span>{showSupPwdCard ? 'Close Password Form' : 'Supervisor Password'}</span>
            </button>
            <div className="hod-approvals-stats-row">
              <div className="hod-stat-chip" style={{ background: pendingShiftApprovals.length > 0 ? '#fef9c3' : '#f8fafc', border: pendingShiftApprovals.length > 0 ? '1px solid #fef08a' : '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#64748b', display: 'block', whiteSpace: 'nowrap' }}>Pending</span>
                <strong style={{ fontSize: 15, color: pendingShiftApprovals.length > 0 ? '#854d0e' : '#0f172a' }}>{pendingShiftApprovals.length}</strong>
              </div>
              <div className="hod-stat-chip" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#166534', display: 'block', whiteSpace: 'nowrap' }}>Approved</span>
                <strong style={{ fontSize: 15, color: '#15803d' }}>{groupedShifts.filter(s => s.status === 'Approved').length}</strong>
              </div>
              <div className="hod-stat-chip" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.3px', color: '#991b1b', display: 'block', whiteSpace: 'nowrap' }}>Returned</span>
                <strong style={{ fontSize: 15, color: '#b91c1c' }}>{groupedShifts.filter(s => s.status === 'Returned').length}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* ── EXECUTIVE PLANT HEALTH & SHIFT PERFORMANCE RIBBON ── */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #d5e0da',
          borderRadius: 8,
          padding: '12px 16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <BarChart2 size={16} color="#0b462c" />
              <span style={{ fontWeight: 800, fontSize: 13, color: '#0b462c' }}>
                {executiveMetrics.isToday ? "Today's Plant Production Health" : "Latest Operating Shift Performance"}
              </span>
              <span className="hide-on-mobile-xs" style={{ fontSize: 10.5, background: '#f1f5f9', color: '#475569', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>
                {executiveMetrics.isToday ? 'Real-time Daily Summary' : 'Most Recent Logged Shifts'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              Target fulfillment: <strong style={{ color: executiveMetrics.fulfillmentPct >= 90 ? '#15803d' : '#b45309' }}>{executiveMetrics.fulfillmentPct}%</strong>
            </div>
          </div>

          <div className="hod-executive-kpi-grid">
            {/* Card 1: Production Output */}
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Output</span>
                <span style={{
                  fontSize: 9.5,
                  background: executiveMetrics.fulfillmentPct >= 95 ? '#dcfce7' : '#fef08a',
                  color: executiveMetrics.fulfillmentPct >= 95 ? '#15803d' : '#854d0e',
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontWeight: 800
                }}>
                  {executiveMetrics.fulfillmentPct}%
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {executiveMetrics.totalProduced} <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>/ {executiveMetrics.totalPlanned}</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#059669', marginTop: 2, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                ✓ Net: {executiveMetrics.acceptedQty} pcs
              </div>
            </div>

            {/* Card 2: Plant Rejection & Scrap */}
            <div style={{ background: Number(executiveMetrics.rejPct) > 5 ? '#fef2f2' : '#f8fafc', padding: '8px 10px', borderRadius: 6, border: Number(executiveMetrics.rejPct) > 5 ? '1px solid #fecaca' : '1px solid #e2e8f0', minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: Number(executiveMetrics.rejPct) > 5 ? '#991b1b' : '#64748b', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Rejection</span>
                <span style={{
                  fontSize: 9.5,
                  background: Number(executiveMetrics.rejPct) <= 5 ? '#dcfce7' : '#fee2e2',
                  color: Number(executiveMetrics.rejPct) <= 5 ? '#15803d' : '#b91c1c',
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontWeight: 800
                }}>
                  {Number(executiveMetrics.rejPct) <= 5 ? '≤5%' : 'Alert'}
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: Number(executiveMetrics.rejPct) > 5 ? '#b91c1c' : '#0f172a' }}>
                {executiveMetrics.totalRej} pcs <span style={{ fontSize: 11.5, fontWeight: 600 }}>({executiveMetrics.rejPct}%)</span>
              </div>
              <div style={{ fontSize: 10.5, color: Number(executiveMetrics.rejPct) > 5 ? '#b91c1c' : '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {executiveMetrics.totalGap > 0 ? `Gap: -${executiveMetrics.totalGap} pcs` : 'No Shortfall'}
              </div>
            </div>

            {/* Card 3: Machine Operating Fleet */}
            <div style={{ background: executiveMetrics.downtimeCount > 0 ? '#fff7ed' : '#f8fafc', padding: '8px 10px', borderRadius: 6, border: executiveMetrics.downtimeCount > 0 ? '1px solid #fed7aa' : '1px solid #e2e8f0', minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: executiveMetrics.downtimeCount > 0 ? '#9a3412' : '#64748b', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Fleet Uptime</span>
                <span style={{
                  fontSize: 9.5,
                  background: executiveMetrics.downtimeCount === 0 ? '#dcfce7' : '#ffedd5',
                  color: executiveMetrics.downtimeCount === 0 ? '#15803d' : '#c2410c',
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontWeight: 800
                }}>
                  {executiveMetrics.downtimeCount === 0 ? '100% Up' : `${executiveMetrics.downtimeCount} Down`}
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {executiveMetrics.activeMachinesCount} <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Active M/C</span>
              </div>
              <div style={{ fontSize: 10.5, color: executiveMetrics.downtimeCount > 0 ? '#c2410c' : '#15803d', marginTop: 2, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {executiveMetrics.downtimeCount > 0 ? `⚠️ ${executiveMetrics.downtimeCount} Breakdown` : '✓ 0 Breakdown'}
              </div>
            </div>

            {/* Card 4: OEE (Plant Effectiveness) */}
            <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }} title="Overall Equipment Effectiveness = Availability × Performance × Quality(100%)">OEE</span>
                <span style={{
                  fontSize: 9.5,
                  background: Number(executiveMetrics.avgEfficiency) >= 85 ? '#dcfce7' : '#fef08a',
                  color: Number(executiveMetrics.avgEfficiency) >= 85 ? '#15803d' : '#854d0e',
                  padding: '1px 5px',
                  borderRadius: 4,
                  fontWeight: 800
                }}>
                  {Number(executiveMetrics.avgEfficiency) >= 85 ? 'Optimal' : 'Review'}
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                {executiveMetrics.avgEfficiency}%
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                A:{executiveMetrics.oeeAvailability}% · P:{executiveMetrics.oeePerformance}% · Q:100%
              </div>
            </div>
          </div>
        </div>

        {/* SUPERVISOR PASSWORD MANAGEMENT CARD (Collapsible on demand) */}
        {showSupPwdCard && (
          <div style={{
            background: '#ffffff',
            border: '1.5px solid #d5e0da',
            borderRadius: 8,
            padding: '16px 20px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e8f3ed', color: '#0b462c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KeyRound size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0b462c' }}>
                    Supervisor Account Password Management
                  </h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    As HOD, you can set or change the login password for the Production Supervisor account.
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pwdSuccess && (
                  <span style={{ background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Check size={14} /> {pwdSuccess}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowSupPwdCard(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  ✕ Close
                </button>
              </div>
            </div>

            <form className="hod-sup-pwd-form" onSubmit={handleUpdateSupervisorPassword} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Target Supervisor Account
                </label>
                <select
                  style={{ width: '100%', height: 34, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 5, padding: '0 10px', background: '#f8fafc', fontWeight: 600 }}
                  value={selectedSupId || ''}
                  onChange={e => setSelectedSupId(Number(e.target.value))}
                >
                  {supUsers.length === 0 ? (
                    <option value="">supervisor (Production Supervisor)</option>
                  ) : (
                    supUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.role} - {u.department || 'Production'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  New Password (Min 4 chars)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showSupPwd ? 'text' : 'password'}
                    required
                    placeholder="Enter new supervisor password..."
                    style={{ width: '100%', height: 34, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 5, padding: '0 32px 0 10px', boxSizing: 'border-box' }}
                    value={newSupPassword}
                    onChange={e => setNewSupPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSupPwd(!showSupPwd)}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                  >
                    {showSupPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Confirm New Password
                </label>
                <input
                  type={showSupPwd ? 'text' : 'password'}
                  required
                  placeholder="Re-type password..."
                  style={{ width: '100%', height: 34, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 5, padding: '0 10px', boxSizing: 'border-box' }}
                  value={confirmSupPassword}
                  onChange={e => setConfirmSupPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={pwdUpdating}
                className="btn btn-highlight"
                style={{
                  height: 34,
                  padding: '0 20px',
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 5,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {pwdUpdating ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                Update Supervisor Password
              </button>
            </form>
          </div>
        )}

        {/* PENDING APPROVAL QUEUE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Pending Shift Approvals Queue</span>
              <span style={{ fontSize: 11, background: pendingShiftApprovals.length > 0 ? '#fee2e2' : '#e2e8f0', color: pendingShiftApprovals.length > 0 ? '#b91c1c' : '#475569', padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                {pendingShiftApprovals.length} Awaiting Review
              </span>
            </h3>
            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }} title="Sequential rule: Shift B unlocks only after Shift A is approved; Next day Shift A unlocks only after prior Shift B is approved.">
              <ShieldCheck size={13} color="#0b462c" /> Sequential discipline enforced
            </span>
          </div>

          {pendingShiftApprovals.length === 0 ? (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              boxShadow: '0 1px 3px rgba(16,185,129,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 240px' }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #86efac',
                  flexShrink: 0
                }}>
                  <CheckCircle2 size={20} color="#15803d" />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <h4 style={{ margin: 0, color: '#166534', fontSize: 13.5, fontWeight: 800 }}>
                      All Shift Submissions Confirmed & Approved
                    </h4>
                    <span style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '1px 7px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 700
                    }}>
                      ✓ Discipline Active
                    </span>
                  </div>
                  <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#166534', opacity: 0.85 }}>
                    Zero pending supervisor submissions. Sequential discipline active.
                  </p>
                  {executiveMetrics.latestApproved && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#166534', display: 'flex', gap: 8, flexWrap: 'wrap', opacity: 0.9 }}>
                      <span><strong>Latest:</strong> {new Date(executiveMetrics.latestApproved.date).toLocaleDateString()} • {executiveMetrics.latestApproved.shift}</span>
                      <span>• {executiveMetrics.latestApproved.totalProduced} pcs ({executiveMetrics.latestApproved.totalRej} rej)</span>
                      <span>• {executiveMetrics.latestApproved.supervisor}</span>
                    </div>
                  )}
                </div>
              </div>

              {executiveMetrics.latestApproved && (
                <button
                  type="button"
                  onClick={() => {
                    setModalFilterSearch('');
                    setAnalyseModalShift(executiveMetrics.latestApproved);
                  }}
                  style={{
                    background: '#15803d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 1px 3px rgba(21,128,61,0.2)',
                    flexShrink: 0
                  }}
                >
                  <BarChart2 size={13} /> Inspect Latest
                </button>
              )}
            </div>
          ) : (
            pendingShiftApprovals.map(ps => {
              const shiftKey = `${ps.date}_${ps.shift}`;
              const isExpanded = expandedShiftKey === shiftKey;
              const hasBreakdown = ps.machines.some(m => m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:'))));

              return (
                <div key={shiftKey} style={{
                  background: '#ffffff',
                  border: '1.5px solid #93c5fd',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.08)'
                }}>
                  {/* Card Header & Summary Bar */}
                  <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                          {new Date(ps.date).toLocaleDateString()} • <span style={{ color: '#0b462c' }}>{ps.shift}</span>
                        </span>
                        <span style={{ fontSize: 11, background: '#fef08a', color: '#854d0e', padding: '2px 8px', borderRadius: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} /> Awaiting HOD Approval
                        </span>
                        {hasBreakdown && (
                          <span style={{ fontSize: 11, background: '#ffedd5', color: '#9a3412', padding: '2px 8px', borderRadius: 10, fontWeight: 700, border: '1px solid #fed7aa' }}>
                            ⚠️ Has Machine Downtime
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: '#475569' }}>
                          Supervisor: <strong>{ps.supervisor}</strong>
                        </span>
                      </div>

                      {/* Primary Actions */}
                      <div className="hod-pending-actions-row">
                        <button
                          type="button"
                          onClick={() => handleShiftHODAction(ps.date, ps.shift, 'Approve')}
                          style={{
                            background: '#15803d',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 6,
                            padding: '7px 14px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            boxShadow: '0 2px 4px rgba(21,128,61,0.2)'
                          }}
                        >
                          <Check size={14} /> Approve & Unlock
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShiftHODAction(ps.date, ps.shift, 'Return')}
                          style={{
                            background: '#ffffff',
                            color: '#b91c1c',
                            border: '1.5px solid #fca5a5',
                            borderRadius: 6,
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5
                          }}
                        >
                          <RotateCcw size={13} /> Return Shift
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModalFilterSearch('');
                            setAnalyseModalShift(ps);
                          }}
                          style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 6,
                            padding: '6px 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 5,
                            boxShadow: '0 2px 4px rgba(2,132,199,0.2)'
                          }}
                          title="Open complete Shift Analysis dialog"
                        >
                          <BarChart2 size={13} /> Analyse Shift
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedShiftKey(isExpanded ? null : shiftKey)}
                          style={{
                            background: '#f1f5f9',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4
                          }}
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          <span>{isExpanded ? 'Hide Details' : `Inspect M/C (${ps.machines.length})`}</span>
                        </button>
                      </div>
                    </div>

                    {/* Metrics Strip: 6 cards (3x2 paired on mobile, 6 cols on desktop) */}
                    <div className="hod-shift-metrics-grid">
                      <div style={{ background: '#ffffff', padding: '5px 8px', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 9.5, color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Machines</span>
                        <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{ps.count} M/C</strong>
                      </div>
                      <div style={{ background: '#ffffff', padding: '5px 8px', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 9.5, color: '#64748b', display: 'block', textTransform: 'uppercase' }}>Planned</span>
                        <strong style={{ fontSize: 13.5, color: '#334155' }}>{ps.totalPlanned} pcs</strong>
                      </div>
                      <div style={{ background: '#ffffff', padding: '5px 8px', borderRadius: 5, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 9.5, color: '#0b462c', display: 'block', textTransform: 'uppercase' }}>Produced</span>
                        <strong style={{ fontSize: 13.5, color: '#0b462c' }}>{ps.totalProduced} pcs</strong>
                      </div>
                      <div style={{ background: '#ffffff', padding: '5px 8px', borderRadius: 5, border: '1px solid #bbf7d0' }}>
                        <span style={{ fontSize: 9.5, color: '#166534', display: 'block', textTransform: 'uppercase' }}>Good / Passed</span>
                        <strong style={{ fontSize: 13.5, color: '#166534' }}>{Math.max(0, ps.totalProduced - ps.totalRej)} pcs</strong>
                      </div>
                      <div style={{ background: '#ffffff', padding: '5px 8px', borderRadius: 5, border: ps.totalRej > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 9.5, color: ps.totalRej > 0 ? '#dc2626' : '#64748b', display: 'block', textTransform: 'uppercase' }}>Rejection</span>
                        <strong style={{ fontSize: 13.5, color: ps.totalRej > 0 ? '#b91c1c' : '#0f172a' }}>{ps.totalRej} pcs ({ps.totalProduced > 0 ? ((ps.totalRej / ps.totalProduced) * 100).toFixed(1) : 0}%)</strong>
                      </div>
                      <div style={{ background: '#ffffff', padding: '5px 8px', borderRadius: 5, border: ps.totalGap > 0 ? '1px solid #fed7aa' : '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: 9.5, color: ps.totalGap > 0 ? '#c05621' : '#15803d', display: 'block', textTransform: 'uppercase' }}>Shortfall</span>
                        <strong style={{ fontSize: 13.5, color: ps.totalGap > 0 ? '#c05621' : '#15803d' }}>{ps.totalGap > 0 ? `-${ps.totalGap} pcs` : 'Met'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Machine Details */}
                  {isExpanded && (
                    <div style={{ padding: '10px 14px', background: '#fafbfc', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: '#334155' }}>
                          Machine Breakdown for {ps.shift} ({new Date(ps.date).toLocaleDateString()})
                        </h4>

                        {/* View Mode Toggle */}
                        <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 2, borderRadius: 5, border: '1px solid #e2e8f0' }}>
                          <button
                            type="button"
                            onClick={() => setExpandedViewMode('cards')}
                            style={{
                              background: expandedViewMode === 'cards' ? '#0b462c' : 'transparent',
                              color: expandedViewMode === 'cards' ? '#ffffff' : '#64748b',
                              border: 'none',
                              borderRadius: 3,
                              padding: '2px 7px',
                              fontSize: 10.5,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer'
                            }}
                          >
                            <LayoutGrid size={11} /> Cards View
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedViewMode('table')}
                            style={{
                              background: expandedViewMode === 'table' ? '#0b462c' : 'transparent',
                              color: expandedViewMode === 'table' ? '#ffffff' : '#64748b',
                              border: 'none',
                              borderRadius: 3,
                              padding: '2px 7px',
                              fontSize: 10.5,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer'
                            }}
                          >
                            <TableIcon size={11} /> Full Table
                          </button>
                        </div>
                      </div>

                      {expandedViewMode === 'cards' ? (
                        <div className="hod-mc-cards-grid">
                          {ps.machines.map(m => {
                            const isDown = m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:')));
                            const op = operators.find(o => o.punchNo === m.operatorPunchNo || o.aliasLetter === m.operatorPunchNo || o.name === m.operatorPunchNo);
                            const opName = op ? op.name : (m.operatorPunchNo || '-');
                            const partObj = (m as any).part || masterParts.find((p: any) => (p.partId && p.partId === (m as any).partId) || (p.id && p.id === (m as any).partId));
                            const pNo = partObj?.partNo || (m as any).partNo || '-';
                            const pName = partObj?.partName || (m as any).partName || '';
                            const accepted = Math.max(0, (m.actualQty || 0) - (m.rejectionQty || 0));

                            return (
                              <div
                                key={m.id}
                                style={{
                                  background: isDown ? '#fff7ed' : '#ffffff',
                                  border: isDown ? '1.5px solid #fed7aa' : '1px solid #cbd5e1',
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 8,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ background: '#0b462c', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                                      M/C #{m.machineNumber}
                                    </span>
                                    {m.dieNo && (
                                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                        Die: {m.dieNo}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    background: isDown ? '#fee2e2' : m.efficiency >= 85 ? '#dcfce7' : '#fef08a',
                                    color: isDown ? '#991b1b' : m.efficiency >= 85 ? '#15803d' : '#854d0e'
                                  }}>
                                    {isDown ? '⚠️ Issue' : `${m.efficiency}% Eff`}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{pNo}</div>
                                    {pName && <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pName}</div>}
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#334155' }}>{opName}</div>
                                    {op?.punchNo && <div style={{ fontSize: 10, color: '#64748b' }}>Punch: {op.punchNo}</div>}
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center' }}>
                                  <div style={{ background: '#f8fafc', padding: '4px 2px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 8.5, color: '#64748b', textTransform: 'uppercase' }}>Plan</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>{m.plannedQty}</div>
                                  </div>
                                  <div style={{ background: isDown ? '#ffedd5' : '#f0fdf4', padding: '4px 2px', borderRadius: 4, border: isDown ? '1px solid #fed7aa' : '1px solid #bbf7d0' }}>
                                    <div style={{ fontSize: 8.5, color: isDown ? '#c2410c' : '#166534', textTransform: 'uppercase' }}>Actual</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: isDown ? '#c2410c' : '#166534' }}>{m.actualQty}</div>
                                  </div>
                                  <div style={{ background: m.rejectionQty > 0 ? '#fef2f2' : '#f8fafc', padding: '4px 2px', borderRadius: 4, border: m.rejectionQty > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: 8.5, color: m.rejectionQty > 0 ? '#991b1b' : '#64748b', textTransform: 'uppercase' }}>Rej</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: m.rejectionQty > 0 ? '#b91c1c' : '#64748b' }}>{m.rejectionQty}</div>
                                  </div>
                                  <div style={{ background: '#ecfdf5', padding: '4px 2px', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                                    <div style={{ fontSize: 8.5, color: '#047857', textTransform: 'uppercase' }}>Good</div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#065f46' }}>{accepted}</div>
                                  </div>
                                </div>

                                {(m.gap > 0 || m.remark || isDown) && (
                                  <div style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 4, color: '#475569' }}>
                                    {m.gap > 0 && <span style={{ color: '#b91c1c', fontWeight: 700, marginRight: 6 }}>Shortfall: {m.gap} pcs</span>}
                                    <span>{m.remark || (isDown ? 'Machine issue logged' : '')}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1', textAlign: 'left' }}>
                                <th style={{ padding: '6px 8px' }}>M/C</th>
                                <th style={{ padding: '6px 8px' }}>Operator Name</th>
                                <th style={{ padding: '6px 8px' }}>Part No & Name</th>
                                <th style={{ padding: '6px 8px' }}>Die No</th>
                                <th style={{ padding: '6px 8px' }}>Planned</th>
                                <th style={{ padding: '6px 8px' }}>Actual</th>
                                <th style={{ padding: '6px 8px' }}>Rej</th>
                                <th style={{ padding: '6px 8px' }}>Accepted</th>
                                <th style={{ padding: '6px 8px' }}>Gap / Reasons</th>
                                <th style={{ padding: '6px 8px' }}>Efficiency</th>
                                <th style={{ padding: '6px 8px' }}>Notes / Breakdown</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ps.machines.map(m => {
                                const isDown = m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:')));
                                const op = operators.find(o => o.punchNo === m.operatorPunchNo || o.aliasLetter === m.operatorPunchNo || o.name === m.operatorPunchNo);
                                const opName = op ? op.name : (m.operatorPunchNo || '-');

                                return (
                                  <tr key={m.id} style={{ borderBottom: '1px solid #e2e8f0', background: isDown ? '#fff7ed' : '#ffffff' }}>
                                    <td style={{ padding: '6px 8px', fontWeight: 800, color: '#0b462c' }}>#{m.machineNumber}</td>
                                    <td style={{ padding: '6px 8px' }}>
                                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{opName}</div>
                                      {op && op.punchNo && <div style={{ fontSize: 10, color: '#64748b' }}>Punch: {op.punchNo}</div>}
                                    </td>
                                    <td style={{ padding: '6px 8px' }}>{(m as any).part?.partNo || '-'}</td>
                                    <td style={{ padding: '6px 8px' }}>{m.dieNo}</td>
                                    <td style={{ padding: '6px 8px' }}>{m.plannedQty}</td>
                                    <td style={{ padding: '6px 8px', fontWeight: 700, color: isDown ? '#c05621' : '#0b462c' }}>
                                      {isDown ? '0 (Issue)' : m.actualQty}
                                    </td>
                                    <td style={{ padding: '6px 8px', color: '#b91c1c', fontWeight: 700 }}>{m.rejectionQty}</td>
                                    <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0b462c' }}>{(m.actualQty || 0) - (m.rejectionQty || 0)}</td>
                                    <td style={{ padding: '6px 8px' }}>
                                      {m.gap > 0 ? (
                                        <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                                          {m.gap} pcs shortfall
                                        </span>
                                      ) : 'Target Met'}
                                    </td>
                                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{m.efficiency}%</td>
                                    <td style={{ padding: '6px 8px', fontSize: 11, maxWidth: 220, color: '#475569' }}>
                                      {m.remark || '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* SHIFT APPROVAL AUDIT HISTORY */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #d5e0da',
          borderRadius: 8,
          padding: '12px 16px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#0b462c', whiteSpace: 'nowrap' }}>
                Shift Confirmation & History Log
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
              <input
                type="text"
                placeholder="Search date, shift, supervisor..."
                style={{ height: 30, fontSize: 11.5, border: '1px solid #cbd5e1', borderRadius: 5, padding: '0 10px', flex: '1 1 140px', maxWidth: 260, boxSizing: 'border-box' }}
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
              />

              {/* View Mode Toggle: Cards View vs Full Table */}
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 2, borderRadius: 5, border: '1px solid #e2e8f0', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setHistoryViewMode('cards')}
                  style={{
                    background: historyViewMode === 'cards' ? '#0b462c' : 'transparent',
                    color: historyViewMode === 'cards' ? '#ffffff' : '#64748b',
                    border: 'none',
                    borderRadius: 3,
                    padding: '2px 7px',
                    fontSize: 10.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                >
                  <LayoutGrid size={11} /> Cards View
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryViewMode('table')}
                  style={{
                    background: historyViewMode === 'table' ? '#0b462c' : 'transparent',
                    color: historyViewMode === 'table' ? '#ffffff' : '#64748b',
                    border: 'none',
                    borderRadius: 3,
                    padding: '2px 7px',
                    fontSize: 10.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                >
                  <TableIcon size={11} /> Full Table
                </button>
              </div>
            </div>
          </div>

          {historyViewMode === 'cards' ? (
            <div className="hod-history-cards-grid">
              {groupedShifts
                .filter(s => {
                  if (!historySearch.trim()) return true;
                  const q = historySearch.toLowerCase();
                  return s.date.includes(q) || s.shift.toLowerCase().includes(q) || s.supervisor.toLowerCase().includes(q) || s.status.toLowerCase().includes(q);
                })
                .map(s => {
                  const isApproved = s.status === 'Approved';
                  const isSubmitted = s.status === 'Submitted';
                  const isReturned = s.status === 'Returned';
                  const effPct = s.machines.length > 0 ? (s.machines.reduce((sum: number, m: any) => sum + (m.efficiency || 0), 0) / s.machines.length).toFixed(1) : '0';

                  return (
                    <div
                      key={`${s.date}_${s.shift}`}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                          {new Date(s.date).toLocaleDateString()} • <span style={{ color: '#0b462c' }}>{s.shift}</span>
                        </div>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: isApproved ? '#dcfce7' : isSubmitted ? '#fef08a' : isReturned ? '#fee2e2' : '#e2e8f0',
                          color: isApproved ? '#15803d' : isSubmitted ? '#854d0e' : isReturned ? '#b91c1c' : '#475569'
                        }}>
                          {isApproved ? '✓ Approved' : isSubmitted ? 'Submitted' : isReturned ? '↩ Returned' : 'Draft'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: '#475569' }}>
                        <div>Supervisor: <strong>{s.supervisor}</strong></div>
                        <div style={{ fontWeight: 600 }}>{s.count} M/C Active</div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, textAlign: 'center' }}>
                        <div style={{ background: '#f8fafc', padding: '4px 2px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 8.5, color: '#64748b', textTransform: 'uppercase' }}>Plan</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#334155' }}>{s.totalPlanned}</div>
                        </div>
                        <div style={{ background: '#f0fdf4', padding: '4px 2px', borderRadius: 4, border: '1px solid #bbf7d0' }}>
                          <div style={{ fontSize: 8.5, color: '#166534', textTransform: 'uppercase' }}>Produced</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#0b462c' }}>{s.totalProduced}</div>
                        </div>
                        <div style={{ background: s.totalRej > 0 ? '#fef2f2' : '#f8fafc', padding: '4px 2px', borderRadius: 4, border: s.totalRej > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 8.5, color: s.totalRej > 0 ? '#991b1b' : '#64748b', textTransform: 'uppercase' }}>Rej</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: s.totalRej > 0 ? '#b91c1c' : '#0f172a' }}>{s.totalRej}</div>
                        </div>
                        <div style={{ background: '#f8fafc', padding: '4px 2px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: 8.5, color: '#64748b', textTransform: 'uppercase' }}>Eff %</div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: Number(effPct) >= 85 ? '#15803d' : '#b45309' }}>{effPct}%</div>
                        </div>
                      </div>

                      {(s.returnReason || isApproved) && (
                        <div style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e2e8f0', padding: '4px 8px', borderRadius: 4 }}>
                          {s.returnReason ? (
                            <span style={{ color: '#b91c1c', fontWeight: 600 }}>↩ {s.returnReason}</span>
                          ) : (
                            <span style={{ color: '#166534' }}>✓ Confirmed & cleared</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Date</th>
                    <th style={{ padding: '8px 10px' }}>Shift</th>
                    <th style={{ padding: '8px 10px' }}>Supervisor</th>
                    <th style={{ padding: '8px 10px' }}>Machines</th>
                    <th style={{ padding: '8px 10px' }}>Planned</th>
                    <th style={{ padding: '8px 10px' }}>Actual Produced</th>
                    <th style={{ padding: '8px 10px' }}>Rejections</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                    <th style={{ padding: '8px 10px' }}>HOD Notes / Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedShifts
                    .filter(s => {
                      if (!historySearch.trim()) return true;
                      const q = historySearch.toLowerCase();
                      return s.date.includes(q) || s.shift.toLowerCase().includes(q) || s.supervisor.toLowerCase().includes(q) || s.status.toLowerCase().includes(q);
                    })
                    .map(s => {
                      const isApproved = s.status === 'Approved';
                      const isSubmitted = s.status === 'Submitted';
                      const isReturned = s.status === 'Returned';
                      return (
                        <tr key={`${s.date}_${s.shift}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600 }}>{new Date(s.date).toLocaleDateString()}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0b462c' }}>{s.shift}</td>
                          <td style={{ padding: '8px 10px' }}>{s.supervisor}</td>
                          <td style={{ padding: '8px 10px' }}>{s.count} M/C</td>
                          <td style={{ padding: '8px 10px' }}>{s.totalPlanned} pcs</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0b462c' }}>{s.totalProduced} pcs</td>
                          <td style={{ padding: '8px 10px', color: '#b91c1c' }}>{s.totalRej} pcs</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 10,
                              background: isApproved ? '#dcfce7' : isSubmitted ? '#fef08a' : isReturned ? '#fee2e2' : '#e2e8f0',
                              color: isApproved ? '#15803d' : isSubmitted ? '#854d0e' : isReturned ? '#b91c1c' : '#475569'
                            }}>
                              {isApproved ? '✓ Approved' : isSubmitted ? 'Submitted' : isReturned ? '↩ Returned' : 'Draft'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 11.5 }}>
                            {s.returnReason ? (
                              <span style={{ color: '#b91c1c', fontWeight: 600 }}>Returned reason: {s.returnReason}</span>
                            ) : isApproved ? (
                              <span style={{ color: '#166534' }}>Confirmed and cleared</span>
                            ) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>


      {showOpModal && (
        <>
          <div className="mobile-drawer-overlay" style={{ zIndex: 1000 }} onClick={() => setShowOpModal(false)}></div>
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', padding: 25, borderRadius: 8, zIndex: 1001, width: '400px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Quick Add Operator</h3>
              <button className="btn-delete-x" onClick={() => setShowOpModal(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleQuickAddOperator} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label>Punch No *</label>
                <input required value={newOp.punchNo} onChange={e => setNewOp({...newOp, punchNo: e.target.value})} />
              </div>
              <div>
                <label>Name *</label>
                <input required value={newOp.name} onChange={e => setNewOp({...newOp, name: e.target.value})} />
              </div>
              <div>
                <label>Alias Letter</label>
                <input value={newOp.aliasLetter} placeholder="e.g. A" maxLength={1} onChange={e => setNewOp({...newOp, aliasLetter: e.target.value.toUpperCase()})} />
              </div>
              <button type="submit" className="btn btn-highlight" style={{ marginTop: 10, justifyContent: 'center' }}>
                <Save size={16} /> Save & Select
              </button>
            </form>
          </div>
        </>
      )}

      {/* Quick Add Gap Reason Modal */}
      {showQuickGapModal && (
        <>
          <div className="mobile-drawer-overlay" style={{ zIndex: 1000 }} onClick={() => setShowQuickGapModal(false)}></div>
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'white', padding: 25, borderRadius: 8, zIndex: 1001, width: '420px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} color="#b45309" />
                <h3 style={{ margin: 0, fontSize: 16, color: '#111827' }}>Quick Add Gap Reason</h3>
              </div>
              <button className="btn-delete-x" onClick={() => setShowQuickGapModal(false)}><X size={20}/></button>
            </div>
            <form onSubmit={handleQuickAddGapReason} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>4M Pillar Category *</label>
                <select
                  value={quickGapForm.category}
                  onChange={e => setQuickGapForm({ ...quickGapForm, category: e.target.value })}
                  style={{ width: '100%', height: 36, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 8px', fontSize: 13 }}
                >
                  <option value="Manpower">1. Manpower</option>
                  <option value="Machine Breakdown">2. Machine Breakdown</option>
                  <option value="Raw Material">3. Raw Material</option>
                  <option value="Method">4. Method</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Reason / Root Cause Name *</label>
                <input
                  required
                  placeholder="e.g. Hydraulic Valve Leakage, Metal Temperature Drop..."
                  value={quickGapForm.reasonName}
                  onChange={e => setQuickGapForm({ ...quickGapForm, reasonName: e.target.value })}
                  style={{ width: '100%', height: 36, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 10px', fontSize: 13 }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setShowQuickGapModal(false)}
                  style={{ flex: 1, height: 38, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontWeight: 600, color: '#374151' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-highlight"
                  style={{ flex: 2, height: 38, justifyContent: 'center' }}
                >
                  <Save size={16} /> Save to Database & Select
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Direct Shift Excel Import Modal */}
      {showShiftImportModal && (
        <div className="shift-import-modal-overlay">
          <div className="shift-import-modal-box">
            <ShiftExcelImport
              onBack={() => setShowShiftImportModal(false)}
              onImportSuccess={(date, shift) => {
                setShowShiftImportModal(false);
                fetchData();
                setSessionHeader((prev: any) => ({ ...prev, date, shift }));
                setTableDateFilter(date);
                setTableShiftFilter(shift);
                setIsEditing(true);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Comprehensive Shift Analysis & Verification Modal (Requested by HOD) ── */}
      {analyseModalShift && (() => {
        const ps = analyseModalShift;
        const acceptedQty = Math.max(0, ps.totalProduced - ps.totalRej);
        const rejPct = ps.totalProduced > 0 ? ((ps.totalRej / ps.totalProduced) * 100).toFixed(1) : '0.0';
        const avgEff = ps.machines.length > 0 ? (ps.machines.reduce((sum: number, m: any) => sum + (m.efficiency || 0), 0) / ps.machines.length).toFixed(1) : '0.0';

        // Rejection Pareto grouping (accurately parsed per defect type across all machines)
        const rejMap: Record<string, number> = {};
        ps.machines.forEach((m: any) => {
          if (m.rejectionQty > 0) {
            const defects = parseDefectReasons(m.reasonForRejection, m.rejectionQty);
            if (defects && defects.length > 0) {
              defects.forEach(d => {
                const rName = d.reason || 'Unspecified';
                const dQty = d.qty > 0 ? d.qty : m.rejectionQty;
                rejMap[rName] = (rejMap[rName] || 0) + dQty;
              });
            } else {
              rejMap['Unspecified'] = (rejMap['Unspecified'] || 0) + m.rejectionQty;
            }
          }
        });
        const rejBreakdown = Object.entries(rejMap).map(([reason, qty]) => ({ reason, qty })).sort((a, b) => b.qty - a.qty);

        // Gap reason breakdown
        const gapList = [
          { label: 'Manpower Shortage', count: ps.machines.filter((m: any) => m.gapReasonManPower).length, qty: ps.machines.reduce((sum: number, m: any) => sum + (m.gapQtyManPower || 0), 0) },
          { label: 'Machine Breakdown', count: ps.machines.filter((m: any) => m.gapReasonMachineBreakdown).length, qty: ps.machines.reduce((sum: number, m: any) => sum + (m.gapQtyMachineBreakdown || 0), 0) },
          { label: 'Material Shortage', count: ps.machines.filter((m: any) => m.gapReasonMaterialShortage).length, qty: ps.machines.reduce((sum: number, m: any) => sum + (m.gapQtyMaterialShortage || 0), 0) },
          { label: 'Method / Process', count: ps.machines.filter((m: any) => m.gapReasonMethod).length, qty: ps.machines.reduce((sum: number, m: any) => sum + (m.gapQtyMethod || 0), 0) },
        ].filter(g => g.count > 0 || g.qty > 0);

        // Filtered machine rows
        const filteredMachines = ps.machines.filter((m: any) => {
          if (!modalFilterSearch.trim()) return true;
          const q = modalFilterSearch.toLowerCase();
          const op = operators.find((o: any) => o.punchNo === m.operatorPunchNo || o.name === m.operatorPunchNo);
          const opName = op ? op.name.toLowerCase() : '';
          const partObj = m.part || masterParts.find((p: any) => (p.partId && p.partId === m.partId) || (p.id && p.id === m.partId));
          const pNo = (partObj?.partNo || m.partNo || '').toLowerCase();
          const pName = (partObj?.partName || m.partName || '').toLowerCase();
          const mc = (m.machineNumber || '').toLowerCase();
          const rej = (m.reasonForRejection || '').toLowerCase();
          const rejFormatted = formatRejectionReasons(m.reasonForRejection, m.rejectionQty).toLowerCase();
          const rem = (m.remark || '').toLowerCase();
          return mc.includes(q) || opName.includes(q) || pNo.includes(q) || pName.includes(q) || rej.includes(q) || rejFormatted.includes(q) || rem.includes(q);
        });

        return (
          <div className="shift-import-modal-overlay">
            <div className="shift-import-modal-box" style={{ maxWidth: 1200, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Modal Header */}
              <div style={{
                background: 'linear-gradient(135deg, #0b462c 0%, #134e4a 100%)',
                color: '#ffffff',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <BarChart2 size={20} color="#86efac" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
                        Shift Production Analysis & Verification
                      </h3>
                      <span style={{
                        background: '#fef08a',
                        color: '#854d0e',
                        padding: '1px 7px',
                        borderRadius: 10,
                        fontSize: 10.5,
                        fontWeight: 800,
                        border: '1px solid #fde047'
                      }}>
                        Submitted
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#d1fae5', opacity: 0.95, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <strong>{new Date(ps.date).toLocaleDateString()}</strong> • <strong>{ps.shift}</strong> &nbsp;|&nbsp; Supervisor: <strong>{ps.supervisor}</strong> &nbsp;|&nbsp; <strong>{ps.count} Machines</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setAnalyseModalShift(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  title="Close Analysis"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{
                padding: '12px 14px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                {/* Executive Summary Metric Cards - 3x2 on mobile, 6 cols on desktop */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 105px), 1fr))',
                  gap: 6
                }}>
                  <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Active</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{ps.count} M/C</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Logged entries</div>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Planned</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#334155' }}>{ps.totalPlanned} pcs</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>Target output</div>
                  </div>

                  <div style={{ background: '#f0fdf4', padding: '6px 10px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 9.5, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Produced</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0b462c' }}>{ps.totalProduced} pcs</div>
                    <div style={{ fontSize: 10, color: '#15803d' }}>Gross output</div>
                  </div>

                  <div style={{ background: ps.totalRej > 0 ? '#fef2f2' : '#f8fafc', padding: '6px 10px', borderRadius: 6, border: ps.totalRej > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 9.5, color: ps.totalRej > 0 ? '#991b1b' : '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Rejection</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: ps.totalRej > 0 ? '#b91c1c' : '#0f172a' }}>
                      {ps.totalRej} <span style={{ fontSize: 11, fontWeight: 600 }}>({rejPct}%)</span>
                    </div>
                    <div style={{ fontSize: 10, color: ps.totalRej > 0 ? '#b91c1c' : '#64748b' }}>Defects logged</div>
                  </div>

                  <div style={{ background: '#ecfdf5', padding: '6px 10px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
                    <div style={{ fontSize: 9.5, color: '#047857', fontWeight: 700, textTransform: 'uppercase' }}>Accepted</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#065f46' }}>{acceptedQty} pcs</div>
                    <div style={{ fontSize: 10, color: '#047857' }}>Downstream passed</div>
                  </div>

                  <div style={{ background: ps.totalGap > 0 ? '#fff7ed' : '#f0fdf4', padding: '6px 10px', borderRadius: 6, border: ps.totalGap > 0 ? '1px solid #fed7aa' : '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 9.5, color: ps.totalGap > 0 ? '#c2410c' : '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Shortfall</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: ps.totalGap > 0 ? '#c05621' : '#15803d' }}>
                      {ps.totalGap > 0 ? `-${ps.totalGap}` : 'Met'}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: Number(avgEff) >= 85 ? '#15803d' : '#b45309' }}>
                      Eff: {avgEff}%
                    </div>
                  </div>
                </div>

                {/* Defect Pareto & Gap Loss Analysis Strip */}
                {(rejBreakdown.length > 0 || gapList.length > 0) && (
                  <div style={{
                    background: '#f8fafc',
                    borderRadius: 8,
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 20
                  }}>
                    {rejBreakdown.length > 0 && (
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', marginBottom: 6 }}>
                          🔴 Defect Pareto Breakdown ({ps.totalRej} total rejection pcs):
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {rejBreakdown.map((rb, idx) => {
                            const pct = ps.totalRej > 0 ? ((rb.qty / ps.totalRej) * 100).toFixed(0) : '0';
                            return (
                              <span key={idx} style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                fontSize: 11.5,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 6,
                                border: '1px solid #fca5a5',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}>
                                <span>{rb.reason}:</span>
                                <strong>{rb.qty} pcs</strong>
                                <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 600 }}>({pct}%)</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {gapList.length > 0 && (
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9a3412', textTransform: 'uppercase', marginBottom: 6 }}>
                          🟠 Production Loss Gap Causes:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {gapList.map((gl, idx) => (
                            <span key={idx} style={{
                              background: '#ffedd5',
                              color: '#9a3412',
                              fontSize: 11.5,
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid #fed7aa'
                            }}>
                              {gl.label}: <strong>{gl.count} M/C ({gl.qty} pcs)</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Machine Entries Table Header with Search */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TableIcon size={16} color="#0b462c" />
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                      Machine-by-Machine Entry Verification ({ps.machines.length} Machines)
                    </h4>
                  </div>

                  <div style={{ position: 'relative', width: 280 }}>
                    <Search size={14} color="#64748b" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search machine, operator, part, remark..."
                      value={modalFilterSearch}
                      onChange={e => setModalFilterSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 30px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Complete Machine Details Table */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflowX: 'auto', maxHeight: 380 }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#0b462c', color: '#ffffff', zIndex: 1 }}>
                      <tr>
                        <th style={{ padding: '8px 10px', width: 55 }}>M/C</th>
                        <th style={{ padding: '8px 10px', minWidth: 120 }}>Operator</th>
                        <th style={{ padding: '8px 10px', minWidth: 160 }}>Part No & Part Name</th>
                        <th style={{ padding: '8px 10px' }}>Die No</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Plan</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actual</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rej</th>
                        <th style={{ padding: '8px 10px' }}>Rejection Reason</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Accepted</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Gap</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Eff %</th>
                        <th style={{ padding: '8px 10px', minWidth: 120 }}>Traceability ID</th>
                        <th style={{ padding: '8px 10px', minWidth: 180 }}>Remarks / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMachines.length === 0 ? (
                        <tr>
                          <td colSpan={13} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>
                            No matching machines found for filter "{modalFilterSearch}".
                          </td>
                        </tr>
                      ) : (
                        filteredMachines.map((m: any, idx: number) => {
                          const op = operators.find((o: any) => o.punchNo === m.operatorPunchNo || o.aliasLetter === m.operatorPunchNo || o.name === m.operatorPunchNo);
                          const opName = op ? op.name : (m.operatorPunchNo || '-');
                          const partObj = m.part || masterParts.find((p: any) => (p.partId && p.partId === m.partId) || (p.id && p.id === m.partId));
                          const pNo = partObj?.partNo || m.partNo || '-';
                          const pName = partObj?.partName || m.partName || '';
                          const accepted = Math.max(0, (m.actualQty || 0) - (m.rejectionQty || 0));
                          const isDown = m.actualQty === 0 && (m.gapReasonMachineBreakdown || (m.remark && m.remark.includes('[MACHINE ISSUE:')));

                          return (
                            <tr
                              key={m.id || idx}
                              style={{
                                borderBottom: '1px solid #e2e8f0',
                                background: isDown ? '#fff7ed' : idx % 2 === 0 ? '#ffffff' : '#f8fafc'
                              }}
                            >
                              <td style={{ padding: '8px 10px', fontWeight: 800, color: '#0b462c' }}>
                                #{m.machineNumber}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{opName}</div>
                                {op?.punchNo && <div style={{ fontSize: 10.5, color: '#64748b' }}>Punch: {op.punchNo}</div>}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{pNo}</div>
                                {pName && <div style={{ fontSize: 11, color: '#475569' }}>{pName}</div>}
                              </td>
                              <td style={{ padding: '8px 10px', color: '#475569' }}>
                                {m.dieNo || '-'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                                {m.plannedQty}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: isDown ? '#c05621' : '#0b462c' }}>
                                {isDown ? '0 (Down)' : m.actualQty}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: m.rejectionQty > 0 ? '#b91c1c' : '#64748b' }}>
                                {m.rejectionQty}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {(() => {
                                  const defects = parseDefectReasons(m.reasonForRejection, m.rejectionQty);
                                  if (!defects || defects.length === 0) {
                                    return <span style={{ color: '#94a3b8' }}>-</span>;
                                  }
                                  return (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 280 }}>
                                      {defects.map((d, dIdx) => (
                                        <span
                                          key={dIdx}
                                          style={{
                                            background: '#fee2e2',
                                            color: '#991b1b',
                                            padding: '2px 7px',
                                            borderRadius: 4,
                                            fontSize: 11,
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            border: '1px solid #fca5a5'
                                          }}
                                          title={d.note ? `Defect Note: ${d.note}` : undefined}
                                        >
                                          {d.qty > 0 ? `${d.qty}x ` : ''}{d.reason}{d.note ? ` (${d.note})` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0b462c' }}>
                                {accepted}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: m.gap > 0 ? '#c05621' : '#15803d' }}>
                                {m.gap > 0 ? `${m.gap} pcs` : 'Met'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <span style={{
                                  background: (m.efficiency || 0) >= 85 ? '#dcfce7' : (m.efficiency || 0) >= 60 ? '#fef08a' : '#fee2e2',
                                  color: (m.efficiency || 0) >= 85 ? '#15803d' : (m.efficiency || 0) >= 60 ? '#854d0e' : '#b91c1c',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 800
                                }}>
                                  {m.efficiency}%
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', color: '#334155' }}>
                                {m.traceabilityBatchId || '-'}
                              </td>
                              <td style={{ padding: '8px 10px', fontSize: 11, color: '#475569' }}>
                                {m.remark || '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {filteredMachines.length > 0 && (
                      <tfoot style={{ position: 'sticky', bottom: 0, background: '#f1f5f9', borderTop: '2px solid #0b462c', fontWeight: 800, zIndex: 1 }}>
                        <tr>
                          <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', color: '#0b462c' }}>
                            TOTALS ({filteredMachines.length} M/C):
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {filteredMachines.reduce((sum: number, m: any) => sum + (m.plannedQty || 0), 0)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0b462c' }}>
                            {filteredMachines.reduce((sum: number, m: any) => sum + (m.actualQty || 0), 0)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#b91c1c' }}>
                            {filteredMachines.reduce((sum: number, m: any) => sum + (m.rejectionQty || 0), 0)}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>-</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0b462c' }}>
                            {filteredMachines.reduce((sum: number, m: any) => sum + Math.max(0, (m.actualQty || 0) - (m.rejectionQty || 0)), 0)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#c05621' }}>
                            {filteredMachines.reduce((sum: number, m: any) => sum + (m.gap || 0), 0)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {avgEff}%
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Modal Action Footer */}
              <div style={{
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 11.5, flex: '1 1 200px' }}>
                  <ShieldCheck size={15} color="#0b462c" style={{ flexShrink: 0 }} />
                  <span>Approving commits shift & unlocks next shift.</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: '1 1 auto' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const date = ps.date;
                      const shift = ps.shift;
                      setAnalyseModalShift(null);
                      handleShiftHODAction(date, shift, 'Approve');
                    }}
                    style={{
                      background: '#15803d',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 6,
                      padding: '7px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      boxShadow: '0 2px 5px rgba(21,128,61,0.22)',
                      flex: '1 1 120px'
                    }}
                  >
                    <Check size={14} /> Approve & Unlock
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const date = ps.date;
                      const shift = ps.shift;
                      setAnalyseModalShift(null);
                      handleShiftHODAction(date, shift, 'Return');
                    }}
                    style={{
                      background: '#ffffff',
                      color: '#b91c1c',
                      border: '1.5px solid #fca5a5',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      flex: '1 1 100px'
                    }}
                  >
                    <RotateCcw size={13} /> Return Shift
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTableDateFilter(ps.date);
                      setTableShiftFilter(ps.shift);
                      setActiveTab('entry');
                      setAnalyseModalShift(null);
                    }}
                    style={{
                      background: 'white',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: '#334155',
                      cursor: 'pointer',
                      flex: '1 1 110px',
                      textAlign: 'center'
                    }}
                    title="View & filter these entries in the bottom table"
                  >
                    View in Table
                  </button>

                  <button
                    type="button"
                    onClick={() => setAnalyseModalShift(null)}
                    style={{
                      background: 'white',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer',
                      flex: '1 1 60px',
                      textAlign: 'center'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

