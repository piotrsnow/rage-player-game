import { useRef, useState } from 'react';
import { storage } from '../services/storage';

/**
 * Config export (download) + import (file upload) with a transient status
 * flag for toast display. The file input ref is returned so the component
 * can wire it to a hidden `<input type="file" />`.
 */
export function useConfigImportExport({ importSettings }) {
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);

  const exportConfig = async () => {
    await storage.exportConfig();
  };

  const importConfig = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await storage.importConfig(file);
      if (imported) importSettings(imported);
      setImportStatus('success');
    } catch {
      setImportStatus('error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setImportStatus(null), 3000);
  };

  return { fileInputRef, importStatus, exportConfig, importConfig };
}
