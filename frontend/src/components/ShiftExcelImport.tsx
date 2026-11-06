import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  UploadCloud, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Check, 
  RefreshCw, 
  ArrowLeft, 
  Layers, 
  ShieldCheck, 
  FileCheck, 
  ArrowRight 
} from 'lucide-react';
import { apiFetch } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import { defaultMasterPartsData } from '../data';

interface ParsedShiftRow {
  rowNum: number;
  date: string;
  shift: string;
  supervisor: string;
  machineNumber: string;
  operatorPunchNo: string;
  partNo: string;
  partName: string;
  dieNo: string;
  plannedQty: number;
  actualQty: number;
  rejectionQty: number;
  rejectionReason: string;
  gapReason: string;
  efficiency: number;
  remark: string;
  traceabilityBatchId: string;
  isValid: boolean;
  errors: string[];
}

export default function ShiftExcelImport({ onBack, onImportSuccess }: { onBack?: () => void; onImportSuccess?: (date: string, shift: string) => void }) {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [masterParts, setMasterParts] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(true);

  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedShiftRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [lastImportedShift, setLastImportedShift] = useState<{ date: string; shift: string; count: number } | null>(null);

  // Fetch reference data for part resolution and template reference
  useEffect(() => {
    const fetchReferences = async () => {
      try {
        setLoadingMasters(true);
        const [partsRes, opRes, supRes] = await Promise.all([
          apiFetch(`http://${window.location.hostname}:4900/api/masterparts`),
          apiFetch(`http://${window.location.hostname}:4900/api/operators`),
          apiFetch(`http://${window.location.hostname}:4900/api/supervisors`)
        ]);

        if (partsRes.ok) setMasterParts(await partsRes.json());
        if (opRes.ok) setOperators(await opRes.json());
        if (supRes.ok) setSupervisors(await supRes.json());
      } catch (err) {
        console.error('Failed to load reference metadata:', err);
      } finally {
        setLoadingMasters(false);
      }
    };

    fetchReferences();
  }, []);

  // Resolve Part Name and Details with strict master verification
  const resolvePart = (partNoRaw: string, partNameRaw?: string) => {
    if (!partNoRaw && !partNameRaw) return { partNo: '', partName: 'Unknown Part', id: 0, cycleTime: 60, plannedQty: 0, isRegistered: false };
    const cleanNo = String(partNoRaw || '').trim().toLowerCase();
    const cleanNoTrimmed = cleanNo.replace(/^0+/, '');
    const cleanNoNoSpaces = cleanNo.replace(/[^a-z0-9]/g, '');
    const cleanName = String(partNameRaw || '').trim().toLowerCase();

    // 1. Search in masterParts
    const fromApi = masterParts.find(p => {
      const pNo = String(p.partNo || '').trim().toLowerCase();
      const pName = String(p.partName || '').trim().toLowerCase();
      return (
        (cleanNo && pNo === cleanNo) ||
        (cleanNoTrimmed && pNo.replace(/^0+/, '') === cleanNoTrimmed) ||
        (cleanNoNoSpaces && pNo.replace(/[^a-z0-9]/g, '') === cleanNoNoSpaces) ||
        (cleanName && pName === cleanName) ||
        (cleanNo && pName === cleanNo)
      );
    });

    if (fromApi) {
      return {
        partNo: fromApi.partNo,
        partName: fromApi.partName,
        id: fromApi.id,
        cycleTime: fromApi.cycleTime || 60,
        plannedQty: (() => {
          const shots = (fromApi as any).shiftShot || (fromApi.cycleTime ? Math.round(36000 / fromApi.cycleTime) : 0);
          const cav = (fromApi as any).noOfCavity || 1;
          return shots > 0 ? (cav * shots) : (fromApi.productionOutputPerMachine ? Math.ceil(fromApi.productionOutputPerMachine / 2) : 0);
        })(),
        isRegistered: true
      };
    }

    // 2. Search in defaultMasterPartsData
    const fromDefault = defaultMasterPartsData.find(p => {
      const pNo = String(p.part_number || '').trim().toLowerCase();
      const pName = String(p.part_name || '').trim().toLowerCase();
      return (
        (cleanNo && pNo === cleanNo) ||
        (cleanNoTrimmed && pNo.replace(/^0+/, '') === cleanNoTrimmed) ||
        (cleanNoNoSpaces && pNo.replace(/[^a-z0-9]/g, '') === cleanNoNoSpaces) ||
        (cleanName && pName === cleanName) ||
        (cleanNo && pName === cleanNo)
      );
    });

    if (fromDefault) {
      const defAny = fromDefault as any;
      return {
        partNo: fromDefault.part_number,
        partName: fromDefault.part_name,
        id: 0,
        cycleTime: defAny.cycle_time || defAny.cycleTime || 60,
        plannedQty: defAny.target_rev_01 ? Math.ceil(defAny.target_rev_01 / 2) : 200,
        isRegistered: true
      };
    }

    // New / Unregistered Part: Flag as NOT registered so it is restricted
    return {
      partNo: String(partNoRaw).trim() || 'UNKNOWN-PART',
      partName: String(partNameRaw).trim() || 'Unregistered New Part',
      id: 0,
      cycleTime: 60,
      plannedQty: 200,
      isRegistered: false
    };
  };

  // Download Standard Excel Template
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Production Shift Entry Table with realistic template rows
    const sampleRows = [
      {
        'Date (YYYY-MM-DD)': new Date().toISOString().split('T')[0],
        'Shift (Shift A or Shift B)': 'Shift A',
        'Supervisor Name/Code': 'AK',
        'Machine Number': '1',
        'Operator Punch No': operators[0]?.punchNo || '001',
        'Part Number': '0204712953',
        'Die Number': '1718',
        'Planned Qty': 220,
        'Actual Qty': 200,
        'Rejection Qty': 8,
        'Rejection Reason': 'Warm Shot(3), Unfill(5)',
        'Gap Reason': 'Machine Breakdown(12), Manpower(8)',
        'Remarks': 'Offline shift entry during system downtime'
      },
      {
        'Date (YYYY-MM-DD)': new Date().toISOString().split('T')[0],
        'Shift (Shift A or Shift B)': 'Shift A',
        'Supervisor Name/Code': 'AK',
        'Machine Number': '2',
        'Operator Punch No': operators[1]?.punchNo || '002',
        'Part Number': 'F019 D01 157',
        'Die Number': '1157',
        'Planned Qty': 180,
        'Actual Qty': 175,
        'Rejection Qty': 4,
        'Rejection Reason': 'Flash problem(4)',
        'Gap Reason': 'Manpower(5)',
        'Remarks': 'Offline shift entry during system downtime'
      },
      {
        'Date (YYYY-MM-DD)': new Date().toISOString().split('T')[0],
        'Shift (Shift A or Shift B)': 'Shift A',
        'Supervisor Name/Code': 'AK',
        'Machine Number': '3',
        'Operator Punch No': operators[2]?.punchNo || '003',
        'Part Number': '0204845297',
        'Die Number': '1297',
        'Planned Qty': 250,
        'Actual Qty': 240,
        'Rejection Qty': 6,
        'Rejection Reason': 'Warm Shot(4), Sand Drop(2)',
        'Gap Reason': '',
        'Remarks': 'Normal run'
      }
    ];

    const wsEntries = XLSX.utils.json_to_sheet(sampleRows);
    // Adjust column widths
    wsEntries['!cols'] = [
      { wch: 16 }, // Date
      { wch: 16 }, // Shift
      { wch: 15 }, // Supervisor
      { wch: 16 }, // Machine Number
      { wch: 18 }, // Operator Punch No
      { wch: 18 }, // Part Number
      { wch: 14 }, // Die Number
      { wch: 14 }, // Planned Qty
      { wch: 14 }, // Actual Qty
      { wch: 14 }, // Rejection Qty
      { wch: 28 }, // Rejection Reason
      { wch: 28 }, // Gap Reason
      { wch: 30 }  // Remarks
    ];
    XLSX.utils.book_append_sheet(wb, wsEntries, 'Shift_Production_Entries');

    // Sheet 2: Reference Data Guide (Parts, Operators, Supervisors)
    const refParts = (masterParts.length > 0 ? masterParts : defaultMasterPartsData).map((p: any) => ({
      'Part Number': p.partNo || p.part_number,
      'Part Name': p.partName || p.part_name,
      'Customer': p.customer || '-'
    }));
    const wsParts = XLSX.utils.json_to_sheet(refParts);
    wsParts['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsParts, 'Reference_Parts');

    const refOps = operators.map((o: any) => ({
      'Punch No': o.punchNo,
      'Operator Name': o.name,
      'Alias Letter': o.aliasLetter || '-'
    }));
    const wsOps = XLSX.utils.json_to_sheet(refOps);
    wsOps['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsOps, 'Reference_Operators');

    XLSX.writeFile(wb, 'AMAC_Production_Shift_Entry_Template.xlsx');
  };

  // Process Excel File
  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        
        // Find sheet with production column headers
        let targetSheetName = wb.SheetNames[0];
        for (const sName of wb.SheetNames) {
          const sJson: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sName], { header: 1 });
          if (sJson && sJson.length > 0) {
            const firstRowStr = JSON.stringify(sJson[0] || '').toLowerCase();
            if (firstRowStr.includes('machine') || firstRowStr.includes('part') || firstRowStr.includes('shift') || firstRowStr.includes('mc') || firstRowStr.includes('punch')) {
              targetSheetName = sName;
              break;
            }
          }
        }

        const worksheet = wb.Sheets[targetSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          showAlert('Empty Sheet', 'No data rows were found in the uploaded Excel sheet.');
          return;
        }

        const parsed: ParsedShiftRow[] = [];

        rawJson.forEach((row, idx) => {
          // Normalize Keys (case-insensitive, non-alphanumeric stripped for maximum tolerance)
          const keys = Object.keys(row);
          const cleanKey = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

          const getVal = (patterns: string[]): any => {
            for (const p of patterns) {
              const cleanP = cleanKey(p);
              const matchedKey = keys.find(k => {
                const ck = cleanKey(k);
                return ck === cleanP || ck.includes(cleanP);
              });
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim() !== '') {
                return row[matchedKey];
              }
            }
            return '';
          };

          // 1. Date resolution
          let dateStr = '';
          const rawDate = getVal(['date', 'entry date', 'shift date']);
          if (rawDate) {
            if (rawDate instanceof Date) {
              dateStr = rawDate.toISOString().split('T')[0];
            } else if (typeof rawDate === 'number') {
              // Excel Serial Date
              const parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
              if (!isNaN(parsedDate.getTime())) {
                dateStr = parsedDate.toISOString().split('T')[0];
              }
            } else {
              const cleanStr = String(rawDate).trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
                dateStr = cleanStr;
              } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(cleanStr)) {
                const parts = cleanStr.split(/[/-]/);
                let day = parseInt(parts[0]);
                let month = parseInt(parts[1]);
                let year = parseInt(parts[2]);
                if (year < 100) year += 2000;
                dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              } else {
                const dt = new Date(cleanStr);
                if (!isNaN(dt.getTime())) {
                  dateStr = dt.toISOString().split('T')[0];
                }
              }
            }
          }

          // 2. Shift resolution
          let shiftStr = String(getVal(['shift', 'shift name'])).trim();
          const cleanShiftLower = shiftStr.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleanShiftLower === 'a' || cleanShiftLower === 'shifta' || cleanShiftLower === '1' || cleanShiftLower === 'morning') {
            shiftStr = 'Shift A';
          } else if (cleanShiftLower === 'b' || cleanShiftLower === 'shiftb' || cleanShiftLower === '2' || cleanShiftLower === 'evening') {
            shiftStr = 'Shift B';
          }

          // 3. Supervisor
          const supervisor = String(getVal(['supervisor', 'sup', 'incharge', 'supervisor name'])).trim();

          // 4. Machine
          const machineNumber = String(getVal(['machine', 'mc', 'm c', 'line', 'machineno', 'mcno'])).trim();

          // 5. Operator Punch
          const operatorPunchNo = String(getVal(['punch', 'operator', 'operator punch', 'punch no', 'emp id'])).trim();

          // 6. Part Number, Part Name & Resolution
          const partNoRaw = String(getVal(['part number', 'part no', 'part', 'item no', 'part code', 'item'])).trim();
          const partNameRaw = String(getVal(['part name', 'component name', 'description'])).trim();
          const partResolved = resolvePart(partNoRaw, partNameRaw);

          // 7. Die Number
          const dieNo = String(getVal(['die', 'die no', 'die number', 'tool no', 'mould'])).trim();

          // 8. Quantities
          const plannedQty = Number(getVal(['planned', 'plan', 'target', 'target qty', 'shift plan'])) || partResolved.plannedQty || 0;
          const actualQty = Number(getVal(['actual', 'produced', 'production', 'actual qty', 'output', 'ok qty'])) || 0;
          const rejectionQty = Number(getVal(['rejection', 'rejected', 'rej', 'rejection qty', 'scrap'])) || 0;
          const rejectionReason = String(getVal(['rejection reason', 'defect', 'defect reason', 'rejection remarks', 'reason'])).trim();
          const gapReason = String(getVal(['gap reason', 'shortfall reason', 'loss reason', 'gap'])).trim();
          const remark = String(getVal(['remark', 'remarks', 'note', 'comment', 'notes'])).trim();

          // 9. Efficiency
          const efficiency = plannedQty > 0 ? Number(((actualQty / plannedQty) * 100).toFixed(1)) : 0;

          // 10. Trace ID
          let traceId = '';
          if (dateStr && shiftStr) {
            const op = operators.find(o => String(o.punchNo).trim() === operatorPunchNo);
            const alias = op?.aliasLetter || op?.name?.charAt(0) || 'X';
            const d = new Date(dateStr);
            const dDigits = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
            const shiftCode = shiftStr === 'Shift A' ? 'A' : 'B';
            traceId = `${alias}${dDigits}${shiftCode}`;
          }

          // Row Validation
          const errors: string[] = [];
          if (!dateStr) errors.push('Date missing or invalid format (YYYY-MM-DD expected)');
          if (!shiftStr) errors.push('Shift missing (Shift A or Shift B expected)');
          if (!machineNumber) errors.push('Machine number is missing');
          if (!partNoRaw && !partNameRaw) errors.push('Part number or Part name is missing');
          if (actualQty <= 0) errors.push('Actual quantity must be greater than 0');

          // Strict Part Registration Restriction: Restrict new/unregistered parts
          if (!partResolved.isRegistered) {
            errors.push(`🚫 Restricted: Part '${partNoRaw || partNameRaw}' is not registered in Master Database. New parts must be registered by Admin before importing.`);
          }

          parsed.push({
            rowNum: idx + 2, // Excel row #
            date: dateStr,
            shift: shiftStr,
            supervisor,
            machineNumber,
            operatorPunchNo,
            partNo: partResolved.partNo || partNoRaw,
            partName: partResolved.partName,
            dieNo,
            plannedQty,
            actualQty,
            rejectionQty,
            rejectionReason,
            gapReason,
            efficiency,
            remark,
            traceabilityBatchId: traceId,
            isValid: errors.length === 0,
            errors
          });
        });

        setParsedRows(parsed);
      } catch (err: any) {
        showAlert('Import Parse Error', `Failed to read Excel workbook: ${err.message || 'Unknown error'}`);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Submit to Backend API
  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    const restrictedRows = parsedRows.filter(r => !r.isValid);

    if (validRows.length === 0) {
      showAlert(
        'No Valid Rows to Import',
        'All rows in the uploaded Excel file contain errors or new/unregistered parts that are restricted from processing.\n\nPlease register the new parts in the Master Database first, or correct the sheet.'
      );
      return;
    }

    const restrictionNotice = restrictedRows.length > 0
      ? `\n\n⚠️ RESTRICTION POLICY:\n${restrictedRows.length} row(s) containing new/unregistered parts or errors will be RESTRICTED and skipped.\nOnly the ${validRows.length} valid row(s) will be processed into the database.`
      : '';

    showConfirm(
      'Confirm Shift Import',
      `Import ${validRows.length} production entries?${restrictionNotice}\n\n• Target Status: SUBMITTED (Awaiting HOD Approval)\n• Overwrite Existing: ${overwriteExisting ? 'YES' : 'NO'}\n\nEven when uploaded from the Admin Panel, all shift entries require HOD approval and will be queued in the HOD Shift Approvals section.`,
      async () => {
        setImporting(true);
        try {
          const primaryDate = validRows[0]?.date;
          const primaryShift = validRows[0]?.shift;

          const payload = {
            entries: validRows.map(r => ({
              traceabilityBatchId: r.traceabilityBatchId,
              date: r.date,
              shift: r.shift,
              supervisor: r.supervisor,
              operatorPunchNo: r.operatorPunchNo,
              partNo: r.partNo,
              partName: r.partName,
              dieNo: r.dieNo,
              machineNumber: r.machineNumber,
              plannedQty: r.plannedQty,
              actualQty: r.actualQty,
              rejectionQty: r.rejectionQty,
              reasonForRejection: r.rejectionReason,
              gap: Math.max(0, r.plannedQty - r.actualQty),
              remark: r.remark,
              status: 'Submitted'
            })),
            overwriteExisting,
            defaultStatus: 'Submitted'
          };

          const res = await apiFetch(`http://${window.location.hostname}:4900/api/productionentries/bulk-import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const result = await res.json();
          if (!res.ok || !result.success) {
            showAlert('Import Failed', result.message || 'Failed to process bulk import.');
            return;
          }

          const totalSaved = (result.importedCount || 0) + (result.updatedCount || 0);
          setLastImportedShift({
            date: primaryDate,
            shift: primaryShift,
            count: totalSaved
          });

          if (onImportSuccess && primaryDate && primaryShift) {
            onImportSuccess(primaryDate, primaryShift);
          }

          showAlert(
            'Import Successful (Awaiting HOD Approval)',
            `✓ ${result.message}\n\n• Newly Created: ${result.importedCount}\n• Updated: ${result.updatedCount}\n• Skipped (Restricted): ${result.skippedCount}\n\n📋 Status: ⏱ Submitted (Awaiting HOD Approval)\nEven when imported via Admin Panel, entries require HOD review and sign-off. They are now queued under 'Pending Shift Approvals' in the Production section.`
          );

          // Clear imported sheet
          setParsedRows([]);
          setFileName('');
        } catch (err: any) {
          showAlert('Network Error', err.message || 'Failed to connect to backend server.');
        } finally {
          setImporting(false);
        }
      }
    );
  };

  // Summary statistics
  const totalRows = parsedRows.length;
  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = totalRows - validCount;
  const totalActual = parsedRows.filter(r => r.isValid).reduce((sum, r) => sum + r.actualQty, 0);
  const detectedShifts = Array.from(new Set(parsedRows.filter(r => r.isValid).map(r => `${r.date} (${r.shift})`)));

  return (
    <div className="excel-import-container">
      {/* Header Bar */}
      <div className="excel-import-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                fontSize: 12.5,
                color: '#334155',
                flexShrink: 0
              }}
              title="Return to production"
            >
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            background: '#e8f5e9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <FileSpreadsheet size={20} color="#0b462c" />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{
              margin: 0,
              color: '#0b462c',
              fontSize: 16,
              fontWeight: 800,
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Shift Excel Import
            </h2>
            <p style={{
              margin: '2px 0 0',
              color: '#64748b',
              fontSize: 11.5,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Upload completed shift Excel sheets directly to production database
            </p>
          </div>
        </div>

        <button
          onClick={handleDownloadTemplate}
          style={{
            background: '#0b462c',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            boxShadow: '0 2px 6px rgba(11,70,44,0.18)',
            flexShrink: 0
          }}
          title="Download the official Excel template for offline entry"
        >
          <Download size={15} /> Download Excel Template
        </button>
      </div>

      {/* Success Notification Banner with Direct Link to Production */}
      {lastImportedShift && (
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #0b462c 100%)',
          borderRadius: 10,
          padding: '12px 16px',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          boxShadow: '0 3px 10px rgba(11, 70, 44, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <CheckCircle2 size={20} color="#86efac" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#ffffff' }}>
                Shift Successfully Imported into Production!
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#d1fae5' }}>
                <strong>{lastImportedShift.count} Machines</strong> recorded for <strong>{lastImportedShift.shift}</strong> on <strong>{lastImportedShift.date}</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (onBack) onBack();
              navigate('/production', { state: { date: lastImportedShift.date, shift: lastImportedShift.shift } });
            }}
            style={{
              background: '#ffffff',
              color: '#065f46',
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
            }}
          >
            👉 View in Production <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Upload & Option Section */}
      <div className="excel-import-grid">
        {/* Upload Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: dragActive ? '#f0fdf4' : 'white',
            border: dragActive ? '2px dashed #0b462c' : '2px dashed #cbd5e1',
            borderRadius: 10,
            padding: '18px 14px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <UploadCloud size={24} color="#0b462c" />
          </div>

          <div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 13.5 }}>
              {fileName ? fileName : 'Tap to Browse or Drag & Drop Excel File'}
            </div>
            <div style={{ color: '#64748b', fontSize: 11.5, marginTop: 2 }}>
              Supports .xlsx, .xls, and .csv files formatted per template
            </div>
          </div>

          {fileName && (
            <span style={{
              background: '#e8f5e9',
              color: '#0b462c',
              fontSize: 11.5,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 20
            }}>
              ✓ {parsedRows.length} rows loaded
            </span>
          )}
        </div>

        {/* Configuration Options */}
        <div style={{
          background: 'white',
          borderRadius: 10,
          padding: '14px 16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                <ShieldCheck size={17} color="#0b462c" />
                <span>Import Governance</span>
              </div>
              <span style={{
                background: '#fef08a',
                color: '#854d0e',
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 10,
                border: '1px solid #fde047',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}>
                <Layers size={11} /> Status: ⏱ Submitted (Awaiting HOD)
              </span>
            </div>

            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 6,
              padding: '7px 10px',
              fontSize: 11.5,
              color: '#92400e',
              lineHeight: 1.4
            }}>
              <strong>Mandatory HOD Sign-off:</strong> Imported shift entries are assigned status <em>"Submitted"</em> and queued for mandatory HOD review and sign-off.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
            <input
              type="checkbox"
              id="overwriteExisting"
              checked={overwriteExisting}
              onChange={e => setOverwriteExisting(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#0b462c', cursor: 'pointer', flexShrink: 0 }}
            />
            <label htmlFor="overwriteExisting" style={{ fontSize: 12, color: '#334155', fontWeight: 600, cursor: 'pointer', lineHeight: 1.3 }}>
              Overwrite existing machine entries for matching Date + Shift + Machine
            </label>
          </div>
        </div>
      </div>

      {/* Data Preview & Action Section */}
      {parsedRows.length > 0 && (
        <div style={{
          background: 'white',
          borderRadius: 10,
          padding: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Summary Metric Ribbon */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))',
            gap: 8
          }}>
            <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Rows</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{totalRows}</div>
            </div>

            <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 10, color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>Valid Entries</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>{validCount}</div>
            </div>

            <div style={{ background: invalidCount > 0 ? '#fef2f2' : '#f8fafc', padding: '8px 12px', borderRadius: 6, border: invalidCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: invalidCount > 0 ? '#b91c1c' : '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Issues / Errors</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: invalidCount > 0 ? '#dc2626' : '#64748b' }}>{invalidCount}</div>
            </div>

            <div style={{ background: '#eff6ff', padding: '8px 12px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 10, color: '#1e40af', fontWeight: 700, textTransform: 'uppercase' }}>Total Actual Units</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8' }}>{totalActual.toLocaleString()}</div>
            </div>

            <div style={{ background: '#fffbeb', padding: '8px 12px', borderRadius: 6, border: '1px solid #fef3c7', gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>Shifts Detected</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginTop: 2 }}>
                {detectedShifts.join(', ') || 'None'}
              </div>
            </div>
          </div>

          {/* New Part Restriction Warning Banner */}
          {parsedRows.some(r => r.errors.some(e => e.includes('Restricted'))) && (
            <div style={{
              background: '#fff7ed',
              border: '1.5px solid #fdba74',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <AlertTriangle size={18} color="#ea580c" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: '#9a3412', lineHeight: 1.45 }}>
                <strong>Strict Policy Active:</strong> {parsedRows.filter(r => r.errors.some(e => e.includes('Restricted'))).length} row(s) contain <strong>new or unregistered part numbers/names</strong> and will be skipped. All remaining <strong>{validCount} valid entries</strong> will be processed.
              </div>
            </div>
          )}

          {/* Table Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileCheck size={17} color="#0b462c" /> Live Sheet Verification Preview
            </h3>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setParsedRows([]);
                  setFileName('');
                }}
                style={{
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                Clear Sheet
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={validCount === 0 || importing}
                style={{
                  background: validCount > 0 ? '#0b462c' : '#94a3b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 16px',
                  fontWeight: 700,
                  fontSize: 12.5,
                  cursor: validCount > 0 ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                }}
              >
                {importing ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle2 size={15} />}
                Submit {validCount} Entries for HOD Approval
              </button>
            </div>
          </div>

          {/* Preview Table */}
          <div style={{ maxHeight: 420, overflowY: 'auto', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#0b462c', color: 'white', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '8px 10px', width: 45 }}>#</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                  <th style={{ padding: '8px 10px' }}>Date</th>
                  <th style={{ padding: '8px 10px' }}>Shift</th>
                  <th style={{ padding: '8px 10px' }}>Supervisor</th>
                  <th style={{ padding: '8px 10px' }}>Machine</th>
                  <th style={{ padding: '8px 10px' }}>Punch No</th>
                  <th style={{ padding: '8px 10px' }}>Part No</th>
                  <th style={{ padding: '8px 10px' }}>Part Name</th>
                  <th style={{ padding: '8px 10px' }}>Die No</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Plan</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actual</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rej</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Eff %</th>
                  <th style={{ padding: '8px 10px' }}>Rejection Reason</th>
                  <th style={{ padding: '8px 10px' }}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {parsedRows.map((r, i) => (
                  <tr 
                    key={i} 
                    style={{ 
                      background: !r.isValid ? '#fef2f2' : i % 2 === 0 ? '#ffffff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0'
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.rowNum}</td>
                    <td style={{ padding: '8px 10px' }}>
                      {r.isValid ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          <Check size={12} /> Ready
                        </span>
                      ) : (
                        <span 
                          title={r.errors.join('; ')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: '#fee2e2',
                            color: '#b91c1c',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'help'
                          }}
                        >
                          <AlertTriangle size={12} /> Error
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{r.date || '-'}</td>
                    <td style={{ padding: '8px 10px' }}>{r.shift || '-'}</td>
                    <td style={{ padding: '8px 10px', color: '#0b462c', fontWeight: 600 }}>{r.supervisor || '-'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700 }}>#{r.machineNumber}</td>
                    <td style={{ padding: '8px 10px' }}>{r.operatorPunchNo || '-'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0b462c' }}>{r.partNo}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>{r.partName}</td>
                    <td style={{ padding: '8px 10px', color: '#e65100', fontWeight: 600 }}>{r.dieNo || '-'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>{r.plannedQty}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{r.actualQty}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: r.rejectionQty > 0 ? '#b71c1c' : '#64748b', fontWeight: r.rejectionQty > 0 ? 700 : 400 }}>
                      {r.rejectionQty}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: r.efficiency >= 90 ? '#15803d' : r.efficiency >= 75 ? '#d97706' : '#dc2626' }}>
                      {r.efficiency}%
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.rejectionReason || '-'}
                    </td>
                    <td style={{ padding: '8px 10px', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b' }}>
                      {r.remark || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
