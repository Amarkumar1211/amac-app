import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { AlertModal } from '../components/ui/AlertModal';

interface ModalContextType {
  showAlert: (title: string, message: string) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [alertData, setAlertData] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [confirmData, setConfirmData] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void }>({ 
    isOpen: false, title: '', message: '', onConfirm: () => {} 
  });

  const showAlert = (title: string, message: string) => {
    setAlertData({ isOpen: true, title, message });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmData({ isOpen: true, title, message, onConfirm });
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertModal 
        isOpen={alertData.isOpen} 
        onClose={() => setAlertData(prev => ({ ...prev, isOpen: false }))} 
        title={alertData.title} 
        message={alertData.message} 
      />
      <ConfirmModal 
        isOpen={confirmData.isOpen} 
        onClose={() => setConfirmData(prev => ({ ...prev, isOpen: false }))} 
        onConfirm={confirmData.onConfirm}
        title={confirmData.title} 
        message={confirmData.message} 
      />
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) throw new Error('useModal must be used within a ModalProvider');
  return context;
}
