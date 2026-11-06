import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Tooltip, 
  Legend, 
  Title 
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { 
  ChevronRight, 
  Search, 
  ArrowRight, 
  ArrowUpRight, 
  RefreshCw, 
  Info, 
  CheckCircle, 
  AlertTriangle,
  Layers,
  TrendingUp,
  FileText
} from 'lucide-react';
import { apiFetch } from '../context/AuthContext';
import { Skeleton } from './ui/Skeleton';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, Title);

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ prodQty: 0, rejectQty: 0, planQty: 0, efficiency: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<'actual' | 'planned' | 'rejections' | 'efficiency'>('actual');
  const [traceSearch, setTraceSearch] = useState('');
  
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  const fetchDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const qs = `?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`;
      const res = await apiFetch(`http://${window.location.hostname}:4900/api/reports/dashboard${qs}`);
      if (res.ok) {
        const data = await res.json();
        setStats({ 
          prodQty: data.totalActual || 0, 
          rejectQty: data.totalRejections || 0, 
          planQty: data.totalPlanned || 0,
          efficiency: data.overallEfficiency || 0
        });
      }
    } catch (err) {
      console.error('Failed to load stats', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(() => {
      fetchDashboard(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [dateRange]);

  const handleTraceSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (traceSearch.trim()) {
      navigate(`/reports?search=${encodeURIComponent(traceSearch.trim())}`);
    }
  };

  // Calculations
  const acceptedQty = Math.max(0, stats.prodQty - stats.rejectQty);
  const belowPlan = Math.max(0, stats.planQty - stats.prodQty);
  const yieldPct = stats.prodQty > 0 ? ((acceptedQty / stats.prodQty) * 100).toFixed(2) : '100.00';
  const rejectionPct = stats.prodQty > 0 ? ((stats.rejectQty / stats.prodQty) * 100).toFixed(2) : '0.00';

  // Format dates for display
  const formatDateHeading = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Chart 1: Plan vs Actual (Horizontal Bar Chart)
  const planBarData = {
    labels: ['Planned', 'Actual'],
    datasets: [{
      data: [stats.planQty, stats.prodQty],
      backgroundColor: ['#ed6c02', '#1976d2'],
      barThickness: 16,
      borderRadius: 3
    }]
  };

  const planBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => ` ${context.raw.toLocaleString()} pieces`
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        suggestedMax: Math.max(10, Math.ceil(Math.max(stats.planQty, stats.prodQty) * 1.15)),
        grid: { color: '#e8f3ed', lineWidth: 0.8 },
        ticks: { color: '#607168', font: { size: 11 } }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#1d2c24', font: { weight: 600 as const, size: 12 } }
      }
    }
  };

  // Chart 2: Production Yield (Stacked Horizontal Bar Chart)
  const yieldBarData = {
    labels: ['Yield'],
    datasets: stats.prodQty === 0 ? [
      {
        label: 'Pending Production',
        data: [1],
        backgroundColor: '#e5eae7',
        barThickness: 26,
        borderRadius: 3
      }
    ] : [
      {
        label: 'Accepted',
        data: [acceptedQty],
        backgroundColor: '#2e7d32',
        barThickness: 26,
        borderRadius: 3
      },
      {
        label: 'Rejected',
        data: [stats.rejectQty],
        backgroundColor: '#d32f2f',
        barThickness: 26,
        borderRadius: 3
      }
    ]
  };

  const yieldBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => stats.prodQty === 0 ? ' No production logged yet for period' : ` ${context.dataset.label}: ${context.raw.toLocaleString()} pieces`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        display: false,
        min: 0,
        max: Math.max(1, stats.prodQty)
      },
      y: {
        stacked: true,
        display: false
      }
    }
  };

  return (
    <div className="fade-in dashboard-container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      
      {/* ── TITLE & DATE RANGE BAR ───────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 600, color: '#1d2c24', letterSpacing: '-0.5px' }}>
            Factory performance
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#607168' }}>
            Production figures for {formatDateHeading(dateRange.startDate)}
            {dateRange.startDate !== dateRange.endDate && ` – ${formatDateHeading(dateRange.endDate)}`}
          </p>
        </div>

        {/* Date Filters & Refresh */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap', width: 'auto' }} className="dashboard-date-filter-row">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', fontWeight: 500, color: '#607168', flex: '1 1 120px' }}>
            From
            <input 
              type="date" 
              value={dateRange.startDate} 
              onChange={e => setDateRange({...dateRange, startDate: e.target.value})}
              style={{
                height: '38px',
                padding: '0 10px',
                border: '1px solid #d5e0da',
                borderRadius: '5px',
                background: '#fff',
                color: '#1d2c24',
                fontSize: '13px',
                fontWeight: 500,
                width: '100%'
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '12px', fontWeight: 500, color: '#607168', flex: '1 1 120px' }}>
            To
            <input 
              type="date" 
              value={dateRange.endDate} 
              onChange={e => setDateRange({...dateRange, endDate: e.target.value})}
              style={{
                height: '38px',
                padding: '0 10px',
                border: '1px solid #d5e0da',
                borderRadius: '5px',
                background: '#fff',
                color: '#1d2c24',
                fontSize: '13px',
                fontWeight: 500,
                width: '100%'
              }}
            />
          </label>
          <button 
            type="button"
            onClick={() => fetchDashboard(true)}
            style={{
              height: '38px',
              padding: '0 16px',
              background: '#0b462c',
              color: '#fff',
              border: 'none',
              borderRadius: '5px',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              transition: 'background 0.2s',
              flex: '1 1 auto'
            }}
          >
            <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── SEARCH TRACE ID BAR ──────────────────────────────── */}
      <form 
        onSubmit={handleTraceSearch} 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 0',
          borderTop: '1px solid #d5e0da',
          borderBottom: '1px solid #d5e0da',
          marginBottom: 24,
          flexWrap: 'wrap'
        }}
      >
        <label htmlFor="trace-search-input" style={{ fontSize: '13px', fontWeight: 600, color: '#1d2c24' }}>
          Search trace ID
        </label>
        <div style={{ position: 'relative', width: '360px', maxWidth: '100%', display: 'flex', alignItems: 'center', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, color: '#607168', pointerEvents: 'none' }} />
          <input 
            id="trace-search-input"
            type="search"
            value={traceSearch}
            onChange={e => setTraceSearch(e.target.value)}
            placeholder="e.g. A231026A"
            style={{
              width: '100%',
              height: '38px',
              padding: '0 36px 0 36px',
              border: '1px solid #d5e0da',
              borderRadius: '5px',
              fontSize: '13px',
              background: '#fff'
            }}
          />
          <button 
            type="submit" 
            aria-label="Submit trace search"
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#607168', display: 'flex', padding: 4 }}
          >
            <ArrowRight size={15} />
          </button>
        </div>
        <span style={{ fontSize: '12.5px', color: '#607168' }}>
          Find a batch in Reports &amp; Analytics
        </span>
      </form>

      {/* ── PRODUCTION FIGURES OVERVIEW SECTION ─────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* Left Column: Interactive Metric Rows List */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #d5e0da', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1d2c24' }}>
              Production figures
            </h2>
            <span style={{ fontSize: '12px', color: '#607168' }}>
              Quantity in pieces
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            
            {/* Metric 1: Planned Target */}
            <div 
              onClick={() => setSelectedMetric('planned')}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 20px',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: selectedMetric === 'planned' ? '#e8f3ed' : 'transparent',
                transition: 'background 0.15s'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: selectedMetric === 'planned' ? '#0b462c' : '#1d2c24' }}>
                  Total Planned Target
                </div>
                <div style={{ fontSize: '12px', color: '#607168', marginTop: 2 }}>
                  Baseline production demand
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 600, color: '#1d2c24' }}>
                {loading ? <Skeleton width="50px" height="24px" /> : stats.planQty.toLocaleString()}
              </div>
              <ChevronRight size={16} style={{ color: selectedMetric === 'planned' ? '#0b462c' : '#888', marginLeft: 6 }} />
            </div>

            {/* Metric 2: Actual Production */}
            <div 
              onClick={() => setSelectedMetric('actual')}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 20px',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: selectedMetric === 'actual' ? '#e8f3ed' : 'transparent',
                transition: 'background 0.15s'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: selectedMetric === 'actual' ? '#0b462c' : '#1d2c24' }}>
                  Total Actual Production
                </div>
                <div style={{ fontSize: '12px', color: belowPlan > 0 ? '#e07b00' : '#2e7d32', marginTop: 2, fontWeight: 500 }}>
                  {belowPlan > 0 ? `${belowPlan.toLocaleString()} below plan` : 'Target fully achieved'}
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 600, color: '#0b462c' }}>
                {loading ? <Skeleton width="50px" height="24px" /> : stats.prodQty.toLocaleString()}
              </div>
              <ChevronRight size={16} style={{ color: selectedMetric === 'actual' ? '#0b462c' : '#888', marginLeft: 6 }} />
            </div>

            {/* Metric 3: Rejections */}
            <div 
              onClick={() => setSelectedMetric('rejections')}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 20px',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: selectedMetric === 'rejections' ? '#e8f3ed' : 'transparent',
                transition: 'background 0.15s'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: selectedMetric === 'rejections' ? '#0b462c' : '#1d2c24' }}>
                  Total Rejections
                </div>
                <div style={{ fontSize: '12px', color: '#607168', marginTop: 2 }}>
                  {rejectionPct}% of produced quantity
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 600, color: stats.rejectQty > 0 ? '#d84343' : '#1d2c24' }}>
                {loading ? <Skeleton width="50px" height="24px" /> : stats.rejectQty.toLocaleString()}
              </div>
              <ChevronRight size={16} style={{ color: selectedMetric === 'rejections' ? '#0b462c' : '#888', marginLeft: 6 }} />
            </div>

            {/* Metric 4: Efficiency */}
            <div 
              onClick={() => setSelectedMetric('efficiency')}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 20px',
                alignItems: 'center',
                padding: '14px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: selectedMetric === 'efficiency' ? '#e8f3ed' : 'transparent',
                transition: 'background 0.15s'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: selectedMetric === 'efficiency' ? '#0b462c' : '#1d2c24' }}>
                  Overall Efficiency
                </div>
                <div style={{ fontSize: '12px', color: '#607168', marginTop: 2 }}>
                  Reported production efficiency
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 600, color: '#1d2c24' }}>
                {loading ? <Skeleton width="50px" height="24px" /> : `${stats.efficiency.toFixed(1)}%`}
              </div>
              <ChevronRight size={16} style={{ color: selectedMetric === 'efficiency' ? '#0b462c' : '#888', marginLeft: 6 }} />
            </div>

          </div>
        </div>

        {/* Right Column: Context Inspection Detail Panel */}
        <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #d5e0da', padding: '24px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1d2c24' }}>
                {selectedMetric === 'actual' && 'Total Actual Production'}
                {selectedMetric === 'planned' && 'Total Planned Target'}
                {selectedMetric === 'rejections' && 'Total Rejections & Scrap'}
                {selectedMetric === 'efficiency' && 'Operational Efficiency'}
              </h3>
              <Info size={16} style={{ color: '#607168' }} />
            </div>

            {/* Big Figure */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 'clamp(32px, 7vw, 54px)', fontWeight: 600, color: selectedMetric === 'rejections' ? '#d84343' : '#0b462c', lineHeight: 1 }}>
                {selectedMetric === 'actual' && stats.prodQty.toLocaleString()}
                {selectedMetric === 'planned' && stats.planQty.toLocaleString()}
                {selectedMetric === 'rejections' && stats.rejectQty.toLocaleString()}
                {selectedMetric === 'efficiency' && `${stats.efficiency.toFixed(1)}%`}
              </span>
              <span style={{ fontSize: '14px', color: '#607168' }}>
                {selectedMetric === 'efficiency' ? 'efficiency rate' : 'pieces produced'}
              </span>
            </div>

            {/* Explanatory text */}
            <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.5, color: '#607168' }}>
              {selectedMetric === 'actual' && (
                belowPlan > 0 ? (
                  <>The selected period is <strong style={{ color: '#1d2c24' }}>{belowPlan.toLocaleString()} pieces below</strong> the planned target of {stats.planQty.toLocaleString()}.</>
                ) : (
                  <>The selected period has achieved <strong style={{ color: '#0b462c' }}>100% of the planned target</strong> of {stats.planQty.toLocaleString()} pieces.</>
                )
              )}
              {selectedMetric === 'planned' && (
                <>Baseline production quota calculated from approved master database dispatch schedule across lines.</>
              )}
              {selectedMetric === 'rejections' && (
                <>Scrap rate represents <strong style={{ color: '#d84343' }}>{rejectionPct}%</strong> of total output. Inspect DCF and Quality departments for defect causes.</>
              )}
              {selectedMetric === 'efficiency' && (
                <>Attainment ratio of actual output ({stats.prodQty.toLocaleString()}) against planned target ({stats.planQty.toLocaleString()}).</>
              )}
            </p>

            {/* Accepted vs Rejected Definition List */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, borderTop: '1px solid #d5e0da', paddingTop: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: '12px', color: '#607168' }}>Accepted quantity</div>
                <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 600, color: '#0b462c', marginTop: 4 }}>
                  {acceptedQty.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#607168' }}>Rejected quantity</div>
                <div style={{ fontFamily: 'monospace', fontSize: '24px', fontWeight: 600, color: stats.rejectQty > 0 ? '#d84343' : '#607168', marginTop: 4 }}>
                  {stats.rejectQty.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Links */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 14 }}>
            <button 
              type="button"
              onClick={() => navigate('/production')}
              style={{
                background: 'none',
                border: 'none',
                color: '#0b462c',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Open production entries <ArrowUpRight size={15} />
            </button>
            <button 
              type="button"
              onClick={() => navigate('/reports')}
              style={{
                background: 'none',
                border: 'none',
                color: '#0b462c',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Open reports <ArrowUpRight size={15} />
            </button>
          </div>
        </div>

      </section>

      {/* ── PRODUCTION COMPARISONS SECTION (CHARTS) ─────────── */}
      <section style={{ background: '#fff', borderRadius: '8px', border: '1px solid #d5e0da', padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 28 }}>
          
          {/* Chart 1: Plan vs Actual Production */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1d2c24' }}>
                Plan vs Actual Production
              </h2>
              <span style={{ fontSize: '12px', color: '#607168' }}>Pieces</span>
            </div>

            <div style={{ height: '140px', position: 'relative' }}>
              {loading ? (
                <Skeleton width="100%" height="130px" />
              ) : (
                <Bar data={planBarData} options={planBarOptions} />
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #d5e0da', paddingTop: 12, marginTop: 10, fontSize: '13px', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ color: '#607168' }}>
                Below plan: <strong style={{ fontFamily: 'monospace', color: '#1d2c24', fontWeight: 600 }}>{belowPlan.toLocaleString()}</strong>
              </span>
              <span>
                <span style={{ color: '#607168' }}>Overall Efficiency: </span>
                <strong style={{ fontFamily: 'monospace', color: '#0b462c', fontWeight: 600 }}>{stats.efficiency.toFixed(1)}%</strong>
              </span>
            </div>
          </div>

          {/* Chart 2: Production Yield */}
          <div style={{ minWidth: 0 }} className="dashboard-chart-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1d2c24' }}>
                Production Yield
              </h2>
              <span style={{ fontSize: '12px', color: '#607168' }}>
                Of {stats.prodQty.toLocaleString()} produced
              </span>
            </div>

            <div style={{ height: '50px', position: 'relative' }}>
              {loading ? (
                <Skeleton width="100%" height="40px" />
              ) : (
                <Bar data={yieldBarData} options={yieldBarOptions} />
              )}
            </div>

            {/* Accepted vs Rejected Counts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: '#607168' }}>
                  <span style={{ width: 8, height: 8, background: '#2e7d32', borderRadius: '50%', display: 'inline-block' }} />
                  Accepted
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <strong style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 600, color: '#0b462c' }}>
                    {acceptedQty.toLocaleString()}
                  </strong>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#607168' }}>
                    {yieldPct}%
                  </span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', color: '#607168' }}>
                  <span style={{ width: 8, height: 8, background: '#d32f2f', borderRadius: '50%', display: 'inline-block' }} />
                  Rejected
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <strong style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 600, color: stats.rejectQty > 0 ? '#d84343' : '#607168' }}>
                    {stats.rejectQty.toLocaleString()}
                  </strong>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#607168' }}>
                    {rejectionPct}%
                  </span>
                </div>
              </div>
            </div>

            <p style={{ margin: '12px 0 0', fontSize: '12px', color: '#607168', fontStyle: 'italic' }}>
              Yield = accepted quantity ÷ actual production
            </p>
          </div>

        </div>
      </section>

      {/* ── FOOTER INFO BAR ──────────────────────────────────── */}
      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, fontSize: '12px', color: '#607168', flexWrap: 'wrap', gap: 10 }}>
        <span>AMAC Production Traceability · Live Factory Data</span>
        <span>Dashboard refresh interval: 30 seconds</span>
      </footer>

    </div>
  );
}
