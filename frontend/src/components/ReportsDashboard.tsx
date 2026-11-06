import { apiFetch } from '../context/AuthContext';
import React, { useState, useEffect } from 'react';
import { useModal } from '../context/ModalContext';
import { useSearchParams } from 'react-router-dom';
import { Search, Download, BarChart2, TrendingUp, AlertTriangle, Layers, Activity, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ReportsDashboard() {
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data States
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [departmentData, setDepartmentData] = useState<any[]>([]);
  
  const [searchParams] = useSearchParams();
  const [traceId, setTraceId] = useState(searchParams.get('traceId') || '');
  const [traceData, setTraceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Filters for overview/analytics
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [shift, setShift] = useState('All');

  useEffect(() => {
    fetchData();
  }, [activeTab, startDate, endDate, shift]);

  useEffect(() => {
    if (searchParams.get('traceId')) {
      setActiveTab('traceability');
      setTraceId(searchParams.get('traceId') || '');
      performTraceSearch(searchParams.get('traceId') || '');
    }
  }, [searchParams]);

  const performTraceSearch = async (searchId: string) => {
    if (!searchId) return;
    setLoading(true);
    setTraceData(null);
    try {
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/reports/traceability/${encodeURIComponent(searchId)}`);
      if (res.ok) {
        setTraceData(await res.json());
      } else {
        showAlert('Alert', 'Trace ID not found');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (shift !== 'All') params.append('shift', shift);
      
      if (activeTab === 'overview' || activeTab === 'analytics') {
        const res = await apiFetch(`http://${window.location.hostname}:4900/api/reports/dashboard?${params.toString()}`);
        if (res.ok) setDashboardStats(await res.json());

        const analyticsRes = await apiFetch(`http://${window.location.hostname}:4900/api/reports/analytics?${params.toString()}`);
        if (analyticsRes.ok) setAnalyticsData(await analyticsRes.json());
      }
      
      if (activeTab === 'departments') {
        const deptRes = await apiFetch(`http://${window.location.hostname}:4900/api/reports/department-performance?${params.toString()}`);
        if (deptRes.ok) setDepartmentData(await deptRes.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTraceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performTraceSearch(traceId);
  };

  const handleExport = async () => {
      try {
          const res = await apiFetch(`http://${window.location.hostname}:4900/api/productionentries`);
          if (res.ok) {
              const data = await res.json();
              const formatted = data.map((d: any) => ({
                  'Traceability ID': d.traceabilityBatchId,
                  'Date': new Date(d.date).toLocaleDateString(),
                  'Shift': d.shift,
                  'Operator': d.operatorPunchNo,
                  'Part No': d.part?.partNo,
                  'Planned Qty': d.plannedQty,
                  'Actual Qty': d.actualQty,
                  'Rejection Qty': d.rejectionQty,
                  'Efficiency %': d.efficiency,
                  'Status': d.status
              }));
              const ws = XLSX.utils.json_to_sheet(formatted);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Production Report");
              XLSX.writeFile(wb, `Production_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
          }
      } catch (err) {
          console.error(err);
      }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)', width: '100%' }}>
      
      {/* COMPACT STICKY HEADER */}
      <div style={{ background: 'white', padding: '14px 18px', borderBottom: '1px solid #ddd', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0b462c' }}>Reports &amp; Analytics</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button className={`btn ${activeTab === 'overview' ? 'btn-nav' : ''}`} style={{background: activeTab === 'overview' ? '#e8f3ed' : '#f0f0f0', color: activeTab === 'overview' ? '#0b462c' : '#333', padding: '6px 12px', fontSize: 12}} onClick={() => setActiveTab('overview')}>Overview</button>
                <button className={`btn ${activeTab === 'analytics' ? 'btn-nav' : ''}`} style={{background: activeTab === 'analytics' ? '#e8f3ed' : '#f0f0f0', color: activeTab === 'analytics' ? '#0b462c' : '#333', padding: '6px 12px', fontSize: 12}} onClick={() => setActiveTab('analytics')}>Production Analytics</button>
                <button className={`btn ${activeTab === 'departments' ? 'btn-nav' : ''}`} style={{background: activeTab === 'departments' ? '#e8f3ed' : '#f0f0f0', color: activeTab === 'departments' ? '#0b462c' : '#333', padding: '6px 12px', fontSize: 12}} onClick={() => setActiveTab('departments')}>Department Wise</button>
                <button className={`btn ${activeTab === 'traceability' ? 'btn-nav' : ''}`} style={{background: activeTab === 'traceability' ? '#e8f3ed' : '#f0f0f0', color: activeTab === 'traceability' ? '#0b462c' : '#333', padding: '6px 12px', fontSize: 12}} onClick={() => setActiveTab('traceability')}>Traceability</button>
                <button className={`btn ${activeTab === 'export' ? 'btn-nav' : ''}`} style={{background: activeTab === 'export' ? '#e8f3ed' : '#f0f0f0', color: activeTab === 'export' ? '#0b462c' : '#333', padding: '6px 12px', fontSize: 12}} onClick={() => setActiveTab('export')}>Export</button>
            </div>
          </div>

          {/* Global Filters */}
          {['overview', 'analytics', 'departments'].includes(activeTab) && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#f8f9fa', padding: '8px 12px', borderRadius: 6, border: '1px solid #eee', flexWrap: 'wrap' }}>
                <Filter size={14} color="#666" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>Start:</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '2px 5px', fontSize: 12, borderRadius: 4, border: '1px solid #ccc' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>End:</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '2px 5px', fontSize: 12, borderRadius: 4, border: '1px solid #ccc' }} />
                </div>
                <div style={{ borderLeft: '1px solid #ddd', height: 16, margin: '0 5px' }}></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <label style={{ fontSize: '11px', color: '#666', fontWeight: 'bold' }}>Shift:</label>
                    <select value={shift} onChange={e => setShift(e.target.value)} style={{ padding: '2px 5px', fontSize: 12, borderRadius: 4, border: '1px solid #ccc' }}>
                        <option value="All">All</option>
                        <option value="Shift A">Shift A</option>
                        <option value="Shift B">Shift B</option>
                    </select>
                </div>
            </div>
          )}
      </div>

      {/* SCROLLABLE DATA AREA */}
      <div style={{ flexGrow: 1, padding: '16px 14px' }}>

      {activeTab === 'overview' && dashboardStats && (
        <div className="dashboard-grid" style={{ marginBottom: 30 }}>
            <div className="dual-chart-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 15 }}>
                <div style={{ background: '#e3f2fd', padding: 15, borderRadius: 10 }}><Layers size={24} color="#1565c0"/></div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '2em', color: '#333' }}>{dashboardStats.totalPlanned}</h3>
                    <p style={{ margin: 0, color: '#666' }}>Total Planned Target</p>
                </div>
            </div>
            <div className="dual-chart-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 15 }}>
                <div style={{ background: '#e8f3ed', padding: 15, borderRadius: 10 }}><TrendingUp size={24} color="#0b462c"/></div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '2em', color: '#333' }}>{dashboardStats.totalActual}</h3>
                    <p style={{ margin: 0, color: '#666' }}>Total Actual Achieved</p>
                </div>
            </div>
            <div className="dual-chart-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 15 }}>
                <div style={{ background: '#fff3e0', padding: 15, borderRadius: 10 }}><Activity size={24} color="#ef6c00"/></div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '2em', color: '#333' }}>{dashboardStats.overallEfficiency}%</h3>
                    <p style={{ margin: 0, color: '#666' }}>Overall Shop Efficiency</p>
                </div>
            </div>
            <div className="dual-chart-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 15 }}>
                <div style={{ background: '#ffebee', padding: 15, borderRadius: 10 }}><AlertTriangle size={24} color="#c62828"/></div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '2em', color: '#333' }}>{dashboardStats.totalRejections}</h3>
                    <p style={{ margin: 0, color: '#666' }}>Total Rejections</p>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="table-wrapper">
          <h3>Production vs Dispatch Analytics</h3>
          <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th>Part No</th>
                <th>Customer Name</th>
                <th>Target Plan Qty</th>
                <th>Actual Achieved Qty</th>
                <th>Adherence (%)</th>
                <th>Total Rejections</th>
                <th>Rejection Rate (%)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7}>Loading analytics...</td></tr> :
               analyticsData.length === 0 ? <tr><td colSpan={7}>No production data found for this period.</td></tr> :
               analyticsData.map((row, i) => (
                <tr key={i}>
                  <td style={{fontWeight: 'bold'}}>{row.partNo}</td>
                  <td>{row.customer}</td>
                  <td style={{fontWeight: 'bold', color: '#1565c0'}}>{row.totalPlanned}</td>
                  <td style={{fontWeight: 'bold', color: '#0b462c'}}>{row.totalActual}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, background: '#eee', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(row.adherencePercentage, 100)}%`, background: row.adherencePercentage >= 100 ? '#0b462c' : '#fbc02d', height: '100%' }}></div>
                        </div>
                        <span style={{ fontSize: '0.9em', width: 45, fontWeight: 'bold' }}>{row.adherencePercentage}%</span>
                    </div>
                  </td>
                  <td style={{color: '#c62828', fontWeight: 'bold'}}>{row.totalRejection}</td>
                  <td>
                    <span style={{ color: row.rejectionPercentage > 5 ? '#c62828' : '#0b462c', fontWeight: 'bold' }}>
                      {row.rejectionPercentage}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="table-wrapper">
          <h3>Department Wise Performance</h3>
          <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th>Department</th>
                <th>Total Processed Qty</th>
                <th>Total Rejections</th>
                <th>Rejection Rate (%)</th>
                <th>Health Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5}>Loading department data...</td></tr> :
               departmentData.length === 0 ? <tr><td colSpan={5}>No downstream data found for this period.</td></tr> :
               departmentData.map((row, i) => (
                <tr key={i}>
                  <td style={{fontWeight: 'bold'}}>{row.department}</td>
                  <td style={{fontWeight: 'bold', color: '#0b462c'}}>{row.totalProcessed}</td>
                  <td style={{color: '#c62828', fontWeight: 'bold'}}>{row.totalRejection}</td>
                  <td>
                    <span style={{ color: row.rejectionPercentage > 3 ? '#c62828' : '#0b462c', fontWeight: 'bold' }}>
                      {row.rejectionPercentage}%
                    </span>
                  </td>
                  <td>
                      {row.rejectionPercentage > 5 ? (
                          <span className="badge" style={{background: '#ffebee', color: '#c62828'}}>Critical Watch</span>
                      ) : row.rejectionPercentage > 2 ? (
                          <span className="badge" style={{background: '#fff3e0', color: '#ef6c00'}}>Needs Attention</span>
                      ) : (
                          <span className="badge" style={{background: '#e8f3ed', color: '#0b462c'}}>Healthy</span>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'traceability' && (
        <div className="input-form" style={{ maxWidth: 800 }}>
          <h3>Traceability Search</h3>
          <form onSubmit={handleTraceSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <input 
              type="text" 
              placeholder="Enter Traceability Batch ID (e.g. TRC-12345)" 
              value={traceId}
              onChange={e => setTraceId(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-highlight" disabled={loading}>
              <Search size={16} /> Search
            </button>
          </form>

          {traceData && (
            <div>
                {traceData.production ? (
                    <>
                    <div style={{ background: '#f5fbf7', padding: 20, borderRadius: 8, borderLeft: '4px solid #0b462c', marginBottom: 20 }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>Production Origin</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.9em' }}>
                            <div><strong>Part:</strong> {traceData.production.part?.partNo} - {traceData.production.part?.partName}</div>
                            <div><strong>Date:</strong> {new Date(traceData.production.date).toLocaleDateString()}</div>
                            <div><strong>Shift:</strong> {traceData.production.shift}</div>
                            <div><strong>Operator Punch:</strong> {traceData.production.operatorPunchNo}</div>
                            <div><strong>Actual Qty Produced:</strong> {traceData.production.actualQty}</div>
                            <div><strong>Efficiency:</strong> {traceData.production.efficiency}%</div>
                        </div>
                    </div>

                    <h4>Downstream Journey</h4>
                    {traceData.downstream && traceData.downstream.length > 0 ? (
                        <div className="table-wrapper">
                            <table style={{ minWidth: 'unset', tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Department</th>
                                        <th>Processed Qty</th>
                                        <th>Rejection</th>
                                        <th>Operator</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {traceData.downstream.map((d: any, i: number) => (
                                        <tr key={i}>
                                            <td>{new Date(d.date).toLocaleDateString()}</td>
                                            <td style={{fontWeight: 'bold'}}>{d.departmentName}</td>
                                            <td>{d.actualQty}</td>
                                            <td style={{color: '#c62828'}}>{d.rejectionQty}</td>
                                            <td>{d.operatorPunchNo}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p style={{ color: '#666' }}>No downstream processing records found yet for this batch.</p>
                    )}
                    </>
                ) : (
                    <p style={{ color: '#c62828' }}>No records found for this Traceability ID.</p>
                )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'export' && (
        <div className="input-form" style={{ maxWidth: 500, textAlign: 'center', padding: 40 }}>
            <Download size={48} color="#0b462c" style={{ marginBottom: 20 }} />
            <h3>Export Raw Data</h3>
            <p style={{ color: '#666', marginBottom: 30 }}>Download all production entries and traceability data as an Excel file for custom analysis.</p>
            <button className="btn btn-highlight" onClick={handleExport} style={{ width: '100%', justifyContent: 'center' }}>
                <Download size={16} /> Download Full Excel Report
            </button>
        </div>
      )}
    </div>
    </div>
  );
}
