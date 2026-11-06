import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
}

export function Pagination({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage }: PaginationProps) {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 20px',
      borderTop: '1px solid #eaeaea',
      background: '#fafafa',
      borderRadius: '0 0 8px 8px'
    }}>
      <span style={{ fontSize: '13px', color: '#666' }}>
        Showing {startItem} to {endItem} of {totalItems} entries
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <button 
          onClick={() => onPageChange(1)} 
          disabled={currentPage === 1}
          style={navBtnStyle(currentPage === 1)}
        >
          <ChevronsLeft size={16} />
        </button>
        <button 
          onClick={() => onPageChange(currentPage - 1)} 
          disabled={currentPage === 1}
          style={navBtnStyle(currentPage === 1)}
        >
          <ChevronLeft size={16} />
        </button>
        
        <span style={{ margin: '0 10px', fontSize: '14px', fontWeight: 500, color: '#333' }}>
          Page {currentPage} of {totalPages}
        </span>

        <button 
          onClick={() => onPageChange(currentPage + 1)} 
          disabled={currentPage === totalPages}
          style={navBtnStyle(currentPage === totalPages)}
        >
          <ChevronRight size={16} />
        </button>
        <button 
          onClick={() => onPageChange(totalPages)} 
          disabled={currentPage === totalPages}
          style={navBtnStyle(currentPage === totalPages)}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}

const navBtnStyle = (disabled: boolean) => ({
  background: disabled ? '#f5f5f5' : '#fff',
  border: '1px solid #ddd',
  color: disabled ? '#bbb' : '#333',
  padding: '6px',
  borderRadius: '4px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
});
