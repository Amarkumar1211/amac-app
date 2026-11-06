import React from 'react';
import { Modal } from './Modal';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmModal({ 
  isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel' 
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ margin: '0 0 20px 0', color: '#555', lineHeight: '1.5' }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button onClick={onClose} style={{
          padding: '8px 16px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', color: '#333'
        }}>
          {cancelText}
        </button>
        <button onClick={() => { onConfirm(); onClose(); }} style={{
          padding: '8px 16px', background: '#d32f2f', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#fff', fontWeight: 'bold'
        }}>
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
