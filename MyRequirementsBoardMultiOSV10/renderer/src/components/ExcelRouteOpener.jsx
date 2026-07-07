import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useExcelDialogs } from '../context/ExcelDialogContext.jsx';
import { ROUTES } from '../lib/routes.js';

export function ExcelImportRouteOpener() {
  const { openImport } = useExcelDialogs();
  const navigate = useNavigate();

  useEffect(() => {
    openImport();
    navigate(ROUTES.requirements, { replace: true });
  }, [openImport, navigate]);

  return null;
}

export function ExcelExportRouteOpener() {
  const { openExport } = useExcelDialogs();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const idsParam = searchParams.get('ids');
    const selectedIds = idsParam
      ? idsParam.split(',').map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n) && n > 0)
      : null;
    openExport(selectedIds?.length ? selectedIds : null);
    navigate(ROUTES.requirements, { replace: true });
  }, [openExport, navigate, searchParams]);

  return null;
}
