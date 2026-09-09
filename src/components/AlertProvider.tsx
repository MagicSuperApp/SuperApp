import React from 'react';
import AlertPopup from '../components/AlertPopup';
import { useAlert } from '../utils/alert';

const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentAlert, dismissAlert } = useAlert();

  return (
    <>
      {children}
      {currentAlert && (
        <AlertPopup
          visible={true}
          type={currentAlert.type}
          title={currentAlert.title}
          message={currentAlert.message}
          onClose={dismissAlert}
          onConfirm={currentAlert.onConfirm ? () => {
            currentAlert.onConfirm!();
            dismissAlert();
          } : undefined}
          confirmText={currentAlert.confirmText}
          cancelText={currentAlert.cancelText}
          hideCancel={currentAlert.hideCancel}
          actions={currentAlert.actions}
          dismissable={currentAlert.dismissable}
        />
      )}
    </>
  );
};

export default AlertProvider;