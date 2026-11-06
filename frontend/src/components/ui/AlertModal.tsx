import React from 'react';
import { Modal } from './Modal';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export function AlertModal({ isOpen, onClose, title, message }: AlertModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p style={{ margin: '0 0 20px 0', color: '#555', lineHeight: '1.5' }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{
          padding: '8px 24px', background: '#1976d2', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#fff', fontWeight: 'bold'
        }}>
          OK
        </button>
      </div>
    </Modal>
  );
}
